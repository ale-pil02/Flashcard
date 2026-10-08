// Cartelle e file collegati: invece di caricare una copia, un set può essere collegato a una cartella
// del computer o a singoli file, per esempio quelli di Google Drive per desktop (G:\Il mio Drive\…).
// - Cartella: i suoi file (e quelli delle sottocartelle) diventano materiali del set; un file nuovo
//   compare, uno cancellato sparisce, uno modificato viene riletto.
// - File singoli: ognuno è un materiale che viene riletto quando il file cambia. Se il file sparisce
//   (spostato, rinominato) il materiale resta e lo si può ricollegare.
// Di un file modificato si tiene la versione precedente, così il visualizzatore mostra cosa è cambiato
// e propone di aggiornare le flashcard.
//
// I file li legge server.py (in sola lettura: non vengono mai modificati), così funziona con qualsiasi
// browser e non servono permessi a ogni apertura. Cartelle e file si scelgono con la finestra di Windows.
// Nel set: cartella = { percorso, nome, collegata }.
// Nel materiale: cartella = { percorso (relativo alla cartella), modificato, dimensione } per i file della
// cartella, collegato = { percorso (completo), modificato, dimensione } per i file singoli;
// precedente = { testo, albero, modificato }, novita = true finché non lo apri (vedi Materiali.haNovita).

const Cartelle = (() => {
    const INTERVALLO = 5000;     // ogni quanto ricontrolla con la pagina in primo piano
    const NATIVI_GOOGLE = /\.(gdoc|gsheet|gslides|gdraw|gform|gmap|gsite|gjam|gscript)$/i;
    const SERVER_VECCHIO = 'Per i collegamenti serve il server aggiornato: chiudi la finestra nera di Flashcard e riapri Flashcard.bat';
    const SCEGLI = 'nella finestra di Windows (se non la vedi, è nella barra delle applicazioni)';

    const stati = new Map();       // setId → { errore, controllata, nonLeggibili: [], troppoGrandi: [] } della cartella
    const inCorso = new Map();     // setId → lettura della cartella in corso
    const falliti = new Map();     // file non letti → modificato: non si riprova finché il file non cambia
    const fileInCorso = new Set(); // materiali collegati che si stanno rileggendo
    const mancanti = new Set();    // materiali collegati il cui file non si trova
    let timer = null;
    let controllando = false;

    function collegata(setId) {
        const s = Dati.set(setId);
        return !!(s && (s.cartella || Dati.materialiDiSet(setId).some(m => m.collegato)));
    }
    function stato(setId) { return stati.get(setId) || {}; }
    function aggiornaStato(setId, modifiche) { stati.set(setId, { ...stato(setId), ...modifiche }); }
    function fileMancante(materialeId) { return mancanti.has(materialeId); }
    function avvisa(setId) { document.dispatchEvent(new CustomEvent('cartella-cambiata', { detail: { setId } })); }

    const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
    function mimeDa(nome) { return MIME[(nome.split('.').pop() || '').toLowerCase()] || ''; }
    function nomeDa(percorso) { return percorso.split(/[\\/]/).pop(); }
    function leggibile(nome) { return !!Materiali.tipoDi({ name: nome, type: mimeDa(nome) }); }

    function comeFile(blob, nome, modificato) {
        const tipo = blob.type && blob.type !== 'application/octet-stream' ? blob.type : mimeDa(nome);
        return new File([blob], nome, { type: tipo, lastModified: modificato });
    }

    // ---- Server ---------------------------------------------------------------------

    // parametri: oggetto, oppure coppie [nome, valore] per ripetere lo stesso nome
    async function chiama(percorso, { metodo = 'GET', parametri = null, file = false, corpo = undefined } = {}) {
        if (location.protocol === 'file:') throw new Error("Per i collegamenti apri l'app con Flashcard.bat");
        const url = '/api/' + percorso + (parametri ? '?' + new URLSearchParams(parametri) : '');
        let r;
        try {
            r = await fetch(url, { method: metodo, headers: { 'X-Flashcard': '1' }, cache: 'no-store', body: corpo });
        } catch (e) {
            throw new Error('Il server di Flashcard non risponde: è ancora aperta la finestra nera? Riapri Flashcard.bat');
        }
        const json = (r.headers.get('content-type') || '').includes('application/json');
        if (r.ok && file) return r.blob();
        if (!json) throw new Error(SERVER_VECCHIO);
        const dati = await r.json();
        if (r.status === 404 && dati.errore === 'Richiesta sconosciuta') throw new Error(SERVER_VECCHIO);
        if (!r.ok) { const e = new Error(dati.errore || `Errore ${r.status}`); e.codice = dati.codice; throw e; }
        return dati;
    }

    // Se la finestra di Windows non si può aprire, si incolla il percorso
    function chiediPercorso(tipo) {
        const cartella = tipo === 'cartella';
        return new Promise(risolvi => {
            let percorso = null;
            Ui.modale({
                titolo: cartella ? 'Percorso della cartella' : 'Percorso del file', classe: 'modale-piccola',
                corpo: `<p class="nota">${cartella ? "In Esplora file apri la cartella, clic sulla barra dell'indirizzo, copia e incolla qui."
                        : 'In Esplora file clic destro sul file → «Copia come percorso», poi incolla qui.'}</p>
                    <label class="campo"><span>${cartella ? 'Cartella' : 'File'}</span><input type="text" name="percorso" autofocus
                        placeholder="${cartella ? 'G:\\Il mio Drive\\Psicologia\\Capitolo 1' : 'G:\\Il mio Drive\\Psicologia\\Mappa capitolo 1.xmind'}"></label>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: 'Collega', classe: 'btn-primario', principale: true, clic: m => { percorso = $('[name=percorso]', m.el).value.trim().replace(/^"|"$/g, ''); m.chiudi(); } },
                ],
                alChiudere: () => risolvi(percorso || null),
            });
        });
    }

    // ---- Cartella del set ------------------------------------------------------------

    async function collega(setId) {
        Ui.toast(`Scegli la cartella ${SCEGLI}`, 'info', 6000);
        let percorso;
        try {
            const scelta = await chiama('cartella/scegli', { metodo: 'POST' });
            percorso = scelta.annullato ? null : scelta.percorso;
        } catch (e) {
            if (e.codice !== 'senza-finestra') throw e;
            percorso = await chiediPercorso('cartella');
        }
        if (!percorso) return false;
        await collegaPercorso(setId, percorso);
        return true;
    }

    async function collegaPercorso(setId, percorso) {
        const elenco = await chiama('cartella/elenco', { parametri: { percorso } });   // controlla che esista
        Dati.aggiornaSet(setId, { cartella: { percorso, nome: elenco.nome, collegata: Date.now() } });
        stati.delete(setId);
        const esito = await sincronizzaCartella(setId, { primaVolta: true });
        avvia();
        return esito;
    }

    // tieniFile: i materiali restano nell'app come copie normali; altrimenti si tolgono
    function scollega(setId, { tieniFile = true } = {}) {
        Dati.materialiDiSet(setId).filter(m => m.cartella).forEach(m => {
            if (tieniFile) Dati.aggiornaMateriale(m.id, { cartella: null, precedente: null, novita: false });
            else Dati.eliminaMateriale(m.id);
        });
        Dati.aggiornaSet(setId, { cartella: null });
        stati.delete(setId);
        avvisa(setId);
    }

    function sincronizzaCartella(setId, opzioni = {}) {
        if (inCorso.has(setId)) return inCorso.get(setId);
        const lavoro = allineaCartella(setId, opzioni).finally(() => inCorso.delete(setId));
        inCorso.set(setId, lavoro);
        return lavoro;
    }

    async function allineaCartella(setId, { primaVolta = false } = {}) {
        const esito = { nuovi: [], cambiati: [], rimossi: [] };
        const s = Dati.set(setId);
        if (!s || !s.cartella) return esito;

        let elenco;
        try {
            elenco = await chiama('cartella/elenco', { parametri: { percorso: s.cartella.percorso } });
        } catch (e) {
            // Cartella spostata, Drive non avviato, server spento: non si tocca niente
            const prima = stato(setId).errore;
            aggiornaStato(setId, { errore: e.message, controllata: Date.now() });
            if (prima !== e.message) avvisa(setId);
            return esito;
        }

        const esistenti = new Map(Dati.materialiDiSet(setId).filter(m => m.cartella).map(m => [m.cartella.percorso, m]));
        const trovati = new Set();
        const nonLeggibili = [], troppoGrandi = [];

        for (const f of elenco.file) {
            const nome = nomeDa(f.percorso);
            if (NATIVI_GOOGLE.test(nome)) { nonLeggibili.push(f.percorso); continue; }
            if (!leggibile(nome)) continue;
            trovati.add(f.percorso);
            if (f.dimensione > Materiali.MAX_FILE) { troppoGrandi.push(f.percorso); continue; }
            const m = esistenti.get(f.percorso);
            if (m && m.cartella.modificato === f.modificato && m.cartella.dimensione === f.dimensione) continue;
            const chiave = setId + '/' + f.percorso;
            if (falliti.get(chiave) === f.modificato) continue;
            const cartella = { percorso: f.percorso, modificato: f.modificato, dimensione: f.dimensione };
            try {
                const blob = await chiama('cartella/file', { parametri: { percorso: s.cartella.percorso, file: f.percorso }, file: true });
                const file = comeFile(blob, nome, f.modificato);
                if (m) {
                    const r = await Materiali.aggiornaDaFile(m.id, file, { cartella });
                    if (r.cambiato) esito.cambiati.push(r.materiale);
                } else {
                    esito.nuovi.push(await Materiali.aggiungiFile(setId, file, { cartella }));
                }
                falliti.delete(chiave);
            } catch (e) {
                console.warn('Cartella collegata: file non letto', f.percorso, e);
                falliti.set(chiave, f.modificato);
                Ui.toast(`Non riesco a leggere «${f.percorso}»: ${e.message || e}`, 'errore', 6000);
            }
        }
        for (const [percorso, m] of esistenti) {
            if (trovati.has(percorso)) continue;
            Dati.eliminaMateriale(m.id);
            esito.rimossi.push(m.nome);
        }

        const prima = stato(setId);
        const cambiatoStato = !prima.controllata || !!prima.errore
            || String(prima.nonLeggibili) !== String(nonLeggibili) || String(prima.troppoGrandi) !== String(troppoGrandi);
        aggiornaStato(setId, { errore: null, controllata: Date.now(), nonLeggibili, troppoGrandi });
        const qualcosa = esito.nuovi.length || esito.cambiati.length || esito.rimossi.length;
        if (qualcosa || cambiatoStato) avvisa(setId);
        if (qualcosa && !primaVolta) annuncia(setId, esito);
        if (primaVolta) Ui.toast(`Cartella collegata: ${plurale(esito.nuovi.length, 'file letto', 'file letti')}`, 'successo', 4000);
        return esito;
    }

    // ---- File singoli ------------------------------------------------------------------

    async function scegliFile() {
        Ui.toast(`Scegli i file ${SCEGLI}`, 'info', 6000);
        try {
            const scelta = await chiama('file/scegli', { metodo: 'POST' });
            return scelta.annullato ? [] : scelta.file.map(f => f.percorso);
        } catch (e) {
            if (e.codice !== 'senza-finestra') throw e;
            const percorso = await chiediPercorso('file');
            return percorso ? [percorso] : [];
        }
    }

    async function infoFile(percorsi) {
        return (await chiama('file/info', { parametri: percorsi.map(p => ['percorso', p]) })).file;
    }

    async function leggiCollegato(percorso, modificato) {
        const blob = await chiama('file/contenuto', { parametri: { percorso }, file: true });
        return comeFile(blob, nomeDa(percorso), modificato);
    }

    // Collega uno o più file al set: restituisce quanti ne ha collegati
    async function collegaFile(setId) {
        const s = Dati.set(setId);
        const giaCollegati = Dati.materialiDiSet(setId).filter(m => m.collegato).map(m => m.collegato.percorso.toLowerCase());
        const nellaCartella = p => s.cartella && p.toLowerCase().startsWith(s.cartella.percorso.toLowerCase() + '\\');
        const percorsi = (await scegliFile()).filter(p => {
            const nome = nomeDa(p);
            if (giaCollegati.includes(p.toLowerCase())) { Ui.toast(`«${nome}» è già collegato a questo set`, 'errore', 5000); return false; }
            if (nellaCartella(p)) { Ui.toast(`«${nome}» è già nella cartella collegata al set`, 'errore', 5000); return false; }
            if (!leggibile(nome)) { Ui.toast(`«${nome}»: formato non supportato`, 'errore', 5000); return false; }
            return true;
        });
        if (!percorsi.length) return 0;
        const info = await infoFile(percorsi);
        let collegati = 0;
        for (const percorso of percorsi) {
            const i = info[percorso], nome = nomeDa(percorso);
            if (!i) { Ui.toast(`«${nome}» non si trova`, 'errore', 5000); continue; }
            if (i.dimensione > Materiali.MAX_FILE) { Ui.toast(`«${nome}» supera ${formattaDimensione(Materiali.MAX_FILE)}`, 'errore', 5000); continue; }
            Ui.toast(`Leggo «${nome}»…`, 'info', 1500);
            try {
                await Materiali.aggiungiFile(setId, await leggiCollegato(percorso, i.modificato),
                    { collegato: { percorso, modificato: i.modificato, dimensione: i.dimensione } });
                collegati++;
            } catch (e) {
                Ui.toast(`Non riesco a leggere «${nome}»: ${e.message || e}`, 'errore', 6000);
            }
        }
        if (collegati) Ui.toast(`${plurale(collegati, 'file collegato', 'file collegati')}: si aggiorna da solo quando lo modifichi`, 'successo', 4500);
        avvisa(setId);
        avvia();
        return collegati;
    }

    // Collega il materiale a un altro file (es. dopo averlo spostato o rinominato)
    async function ricollegaFile(materialeId) {
        const m = Dati.materiale(materialeId);
        if (!m) return false;
        const [percorso] = await scegliFile();
        if (!percorso) return false;
        if (!leggibile(nomeDa(percorso))) throw new Error(`«${nomeDa(percorso)}»: formato non supportato`);
        const i = (await infoFile([percorso]))[percorso];
        if (!i) throw new Error(`«${nomeDa(percorso)}» non si trova`);
        const collegato = { percorso, modificato: i.modificato, dimensione: i.dimensione };
        await Materiali.aggiornaDaFile(m.id, await leggiCollegato(percorso, i.modificato), { collegato, cartella: null });
        mancanti.delete(m.id);
        falliti.delete(m.id);
        avvisa(m.setId);
        avvia();
        return true;
    }

    // Il materiale resta come copia normale e non segue più il file
    function scollegaFile(materialeId) {
        const m = Dati.materiale(materialeId);
        if (!m) return;
        Dati.aggiornaMateriale(m.id, { collegato: null, precedente: null, novita: false });
        mancanti.delete(m.id);
        avvisa(m.setId);
    }

    async function allineaFile(materiali) {
        materiali = materiali.filter(m => m.collegato && !fileInCorso.has(m.id));
        if (!materiali.length) return;
        let info;
        try {
            info = await infoFile(materiali.map(m => m.collegato.percorso));
        } catch (e) {
            return;   // server spento o vecchio: si riprova al prossimo giro
        }
        const cambiati = [];
        for (const m of materiali) {
            const i = info[m.collegato.percorso];
            if (!i) { if (!mancanti.has(m.id)) { mancanti.add(m.id); avvisa(m.setId); } continue; }
            if (mancanti.delete(m.id)) avvisa(m.setId);
            if (i.modificato === m.collegato.modificato && i.dimensione === m.collegato.dimensione) continue;
            if (i.dimensione > Materiali.MAX_FILE || falliti.get(m.id) === i.modificato) continue;
            fileInCorso.add(m.id);
            try {
                const collegato = { percorso: m.collegato.percorso, modificato: i.modificato, dimensione: i.dimensione };
                const r = await Materiali.aggiornaDaFile(m.id, await leggiCollegato(m.collegato.percorso, i.modificato), { collegato });
                if (r.cambiato) cambiati.push(r.materiale);
                falliti.delete(m.id);
                avvisa(m.setId);
            } catch (e) {
                console.warn('File collegato non letto', m.collegato.percorso, e);
                falliti.set(m.id, i.modificato);
                Ui.toast(`Non riesco a rileggere «${m.nome}»: ${e.message || e}`, 'errore', 6000);
            } finally {
                fileInCorso.delete(m.id);
            }
        }
        [...new Set(cambiati.map(m => m.setId))].forEach(setId =>
            annuncia(setId, { nuovi: [], cambiati: cambiati.filter(m => m.setId === setId), rimossi: [] }));
    }

    // ---- Aprire un materiale con il programma del computer ------------------------------------

    function percorsoSulDisco(m) {
        if (m.collegato) return m.collegato.percorso;
        const s = m.cartella && Dati.set(m.setId);
        return s && s.cartella ? s.cartella.percorso + '\\' + m.cartella.percorso.replace(/\//g, '\\') : null;
    }

    // Il file collegato si apre com'è (così quello che salvi lì torna nell'app da solo);
    // un materiale caricato si apre come copia temporanea. Restituisce { copia }
    async function apriSulComputer(m) {
        const percorso = percorsoSulDisco(m);
        if (percorso) {
            await chiama('file/apri', { metodo: 'POST', parametri: { percorso } });
            return { copia: false };
        }
        const blob = await Archivio.leggiFile(m.id);
        if (!blob) throw new Error('Il file di questo materiale non c\'è');
        const nome = /\.[a-z0-9]{2,5}$/i.test(m.nome) ? m.nome : `${m.nome}.${m.estensione || ''}`;
        await chiama('file/apri-copia', { metodo: 'POST', parametri: { nome }, corpo: blob });
        return { copia: true };
    }

    // ---- Avvisi e controllo continuo -------------------------------------------------------

    function annuncia(setId, { nuovi, cambiati, rimossi }) {
        const nomeSet = (Dati.set(setId) || {}).nome || '';
        if (cambiati.length === 1 && !nuovi.length && !rimossi.length) {
            const m = cambiati[0];
            Ui.toast(`«${m.nome}» è cambiato`, 'info', 9000, { testo: 'Vedi le novità', clic: () => Materiali.apri(m.id) });
            return;
        }
        const pezzi = [
            nuovi.length && plurale(nuovi.length, 'file nuovo', 'file nuovi'),
            cambiati.length && plurale(cambiati.length, 'file aggiornato', 'file aggiornati'),
            rimossi.length && plurale(rimossi.length, 'file tolto', 'file tolti'),
        ].filter(Boolean);
        const quiSopra = (App.contesto || {}).setId === setId;
        Ui.toast(`Materiali di «${nomeSet}»: ${pezzi.join(', ')}`, 'info', 7000, quiSopra ? null : { testo: 'Apri il set', clic: () => Router.vai('/set/' + setId) });
    }

    // Cartella e file collegati di un set (prima di una domanda all'assistente, o con "Aggiorna adesso")
    async function sincronizza(setId, opzioni = {}) {
        const esito = await sincronizzaCartella(setId, opzioni);
        await allineaFile(Dati.materialiDiSet(setId));
        return esito;
    }

    function materialiCollegati() { return Dati.tuttiSet().flatMap(s => Dati.materialiDiSet(s.id)).filter(m => m.collegato); }

    async function controlla() {
        if (document.hidden || controllando) return;
        controllando = true;
        try {
            for (const s of Dati.tuttiSet().filter(x => x.cartella)) await sincronizzaCartella(s.id).catch(e => console.warn(e));
            await allineaFile(materialiCollegati()).catch(e => console.warn(e));
        } finally {
            controllando = false;
        }
    }

    function avvia() {
        if (timer || !(Dati.tuttiSet().some(s => s.cartella) || materialiCollegati().length)) return;
        timer = setInterval(controlla, INTERVALLO);
        document.addEventListener('visibilitychange', controlla);
        window.addEventListener('focus', controlla);
        controlla();
    }

    return {
        collegata, stato, fileMancante, collega, collegaPercorso, scollega, collegaFile, ricollegaFile, scollegaFile, apriSulComputer,
        sincronizza, avvia, inizializza: avvia,
    };
})();
