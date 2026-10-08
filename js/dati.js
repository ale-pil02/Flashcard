// Operazioni sui dati dell'app: materie → set (e sotto-set) → carte (ad albero), ripassi,
// esami, impostazioni. Le viste chiamano solo queste funzioni, mai l'Archivio direttamente.
//
// Modello (un oggetto per documento, tutti con "id"):
//   materia  { id, nome, emoji, colore, ordine, creata }
//   set      { id, materiaId, genitoreId, nome, descrizione, creato, modificato, ultimoStudio, cartella }
//              genitoreId = set che lo contiene (null = set principale della materia);
//              cartella = { nome, collegata } se è collegato a una cartella del computer (js/cartelle.js)
//   carta    { id, setId, genitoreId, ordine, domanda, risposte: [{ testo, corretta }], tag: [],
//              suggerimento, spiegazione, mappa, srs, creata, modificata }
//              genitoreId = domanda madre nello stesso set (null = domanda principale);
//              "ordine" vale tra sorelle. Una sola risposta = risposta aperta, più = scelta multipla;
//              mappa = { id, nodo } nodo di una mappa dell'app dove sta la risposta: nella risposta compare il suo
//              sottoramo (js/mappe/vista.js); con la mappa la risposta scritta può mancare;
//              fonte = { materiale, pagina, citazione } punto di un materiale (PDF, slide, testo…) dove sta la risposta:
//              dallo studio un clic lo apre lì (js/materiali.js);
//              srs = ripetizione spaziata della carta: valutazione, N° Rep, ultimo ripasso (js/srs.js)
//   ripasso  { id, cartaId, setId, ts, giorno, valutazione, modo, durata }
//   esame    { id, nome, data: "AAAA-MM-GG", materiaId, note }
//   materiale { id, setId, nome, tipo, mime, dimensione, creato, testo, pagine, albero, anteprima,
//              usaInChat, remoto, cartella, precedente, novita, mappaId }  file di studio di un set; il contenuto sta
//              in Archivio "file" con lo stesso id. albero = { titolo, corpo, figli } per mappe mentali e schemi.
//              mappaId = mappa dell'app (sezione Mappe) di cui è il riflesso: niente file, segue la mappa (js/materiali.js)
//              cartella = { percorso, modificato, dimensione } se viene da una cartella collegata;
//              precedente = { testo, albero, modificato } versione di prima dell'ultima modifica del file
//   chat     { id: "globale" | "set:<id>", storico (formato Gemini), vista, aggiornata }
//   argomento { id, setId, nome, fonte, materialeIds: [], fontiTolte: [], ripetizioni, ultimoRipasso: "AAAA-MM-GG" | null,
//              stato, delSet, carte, ordine, creato, storico: [{ giorno, stato, prima: { ripetizioni, ultimoRipasso, stato } }] }
//              carte = [id] argomento con solo alcune flashcard del set (null = tutte, se delSet; nessuna, se no)
//              riga delle revisioni (spaced repetition degli argomenti, js/revisioni.js);
//              stato = ottimo | buono | ok | scarso | incompleto | ''. delSet = la riga del set, aggiornata dallo studio:
//              il suo stato viene dalle valutazioni delle carte, i materiali dalle fonti delle carte (tranne fontiTolte,
//              quelli tolti a mano)
// Gli oggetti dei dati di prova hanno in più "prova: true".

const COLORI_MATERIA = ['#5b4ff5', '#2e90fa', '#0ea5a4', '#16a34a', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b'];
const EMOJI_MATERIA = ['📚', '🧠', '🧪', '🧬', '⚖️', '💊', '📐', '🌍', '🏛️', '💻', '📊', '🎨', '🔬', '🗣️', '🎵', '✏️', '🩺', '💶'];

const IMPOSTAZIONI_PREDEFINITE = {
    nome: '',
    nuovePerSessione: 10,       // carte nuove in una sessione
    maxPerSessione: 30,         // carte totali in una sessione
    ordineCasuale: false,       // false = ordine del set (quello dell'albero e dell'import)
    cascata: true,              // le domande figlie entrano solo dopo aver imparato la madre
    nascondiDettagli: false,    // le carte con il tag "dettaglio" (e i loro rami) spariscono da elenchi, conteggi e studio
    tema: 'sistema',
};

const MAX_RISPOSTE = 6;

const Dati = (() => {
    const ID_IMPOSTAZIONI = 'generali';
    const perCreazione = (a, b) => (a.creato - b.creato) || a.nome.localeCompare(b.nome, 'it', { numeric: true });

    // ---- Impostazioni ----------------------------------------------------

    function impostazioni() {
        return { ...IMPOSTAZIONI_PREDEFINITE, ...(Archivio.prendi('impostazioni', ID_IMPOSTAZIONI) || {}) };
    }

    function salvaImpostazioni(modifiche) {
        return Archivio.salva('impostazioni', { ...impostazioni(), ...modifiche, id: ID_IMPOSTAZIONI });
    }

    // ---- Materie ---------------------------------------------------------

    function materie() {
        return Archivio.tutti('materie').sort((a, b) => (a.ordine - b.ordine) || a.nome.localeCompare(b.nome, 'it'));
    }

    function materia(id) { return Archivio.prendi('materie', id); }

    function creaMateria({ nome, emoji, colore }) {
        const ordine = Math.max(0, ...Archivio.tutti('materie').map(m => m.ordine || 0)) + 1;
        const m = {
            id: uid(), nome: nome.trim(), emoji: emoji || EMOJI_MATERIA[0],
            colore: colore || COLORI_MATERIA[(ordine - 1) % COLORI_MATERIA.length], ordine, creata: Date.now(),
        };
        Archivio.salva('materie', m);
        return m;
    }

    function aggiornaMateria(id, modifiche) {
        const m = materia(id);
        if (!m) return null;
        Object.assign(m, modifiche);
        Archivio.salva('materie', m);
        return m;
    }

    function eliminaMateria(id) {
        setRadice(id).forEach(s => eliminaSet(s.id));
        esami().filter(e => e.materiaId === id).forEach(e => aggiornaEsame(e.id, { materiaId: null }));
        Mappe.scollegaMateria(id);
        return Archivio.elimina('materie', id);
    }

    // ---- Set e sotto-set ---------------------------------------------------

    function tuttiSet() { return Archivio.tutti('set'); }
    function set(id) { return Archivio.prendi('set', id); }

    // Un set il cui contenitore non esiste più (o sta in un'altra materia) torna principale
    function genitoreDiSet(s) {
        const g = s.genitoreId ? set(s.genitoreId) : null;
        return g && g.materiaId === s.materiaId ? g : null;
    }

    function sottoSet(setId) {
        return tuttiSet().filter(s => s.genitoreId === setId && genitoreDiSet(s)).sort(perCreazione);
    }

    function setRadice(materiaId) {
        return tuttiSet().filter(s => s.materiaId === materiaId && !genitoreDiSet(s)).sort(perCreazione);
    }

    // Tutti i set della materia in ordine d'albero: [{ set, livello }]
    function alberoSet(materiaId) {
        const out = [];
        const visita = (s, livello) => {
            out.push({ set: s, livello });
            sottoSet(s.id).forEach(f => visita(f, livello + 1));
        };
        setRadice(materiaId).forEach(s => visita(s, 0));
        return out;
    }

    function setDiMateria(materiaId) { return alberoSet(materiaId).map(n => n.set); }

    function discendentiSet(setId) {
        const out = [];
        const visita = id => sottoSet(id).forEach(f => { out.push(f.id); visita(f.id); });
        visita(setId);
        return out;
    }

    // Contenitori dal più esterno al più vicino (escluso il set stesso)
    function percorsoSet(setId) {
        const out = [];
        let s = set(setId);
        const visti = new Set();
        while (s && (s = genitoreDiSet(s)) && !visti.has(s.id)) { visti.add(s.id); out.unshift(s); }
        return out;
    }

    function creaSet({ materiaId, genitoreId = null, nome, descrizione = '' }) {
        const g = genitoreId ? set(genitoreId) : null;
        const ora = Date.now();
        const s = {
            id: uid(), materiaId: g ? g.materiaId : materiaId, genitoreId: g ? g.id : null,
            nome: nome.trim(), descrizione: descrizione.trim(), creato: ora, modificato: ora, ultimoStudio: null,
        };
        Archivio.salva('set', s);
        return s;
    }

    function aggiornaSet(id, modifiche) {
        const s = set(id);
        if (!s) return null;
        const vietati = new Set([id, ...discendentiSet(id)]);
        if ('genitoreId' in modifiche && modifiche.genitoreId && vietati.has(modifiche.genitoreId)) delete modifiche.genitoreId;
        const vecchiaMateria = s.materiaId;
        Object.assign(s, modifiche, { modificato: Date.now() });
        if (s.genitoreId && (!set(s.genitoreId) || set(s.genitoreId).materiaId !== s.materiaId)) s.genitoreId = null;
        const daSalvare = [s];
        // Spostando un set di materia si porta dietro i suoi sotto-set
        if (s.materiaId !== vecchiaMateria) {
            [...vietati].filter(x => x !== id).forEach(x => { const d = set(x); d.materiaId = s.materiaId; daSalvare.push(d); });
        }
        Archivio.salvaMolti('set', daSalvare);
        return s;
    }

    function eliminaSet(id) {
        const tutti = [id, ...discendentiSet(id)];
        const daTogliere = new Set(tutti);
        Archivio.eliminaMolti('carte', Archivio.tutti('carte').filter(c => daTogliere.has(c.setId)).map(c => c.id));
        const materiali = Archivio.tutti('materiali').filter(m => daTogliere.has(m.setId)).map(m => m.id);
        Archivio.eliminaMolti('materiali', materiali);
        Archivio.eliminaFile(materiali);
        Archivio.eliminaMolti('chat', tutti.map(x => 'set:' + x).filter(x => Archivio.prendi('chat', x)));
        Archivio.eliminaMolti('argomenti', Archivio.tutti('argomenti').filter(a => daTogliere.has(a.setId)).map(a => a.id));
        tutti.forEach(x => Mappe.scollegaSet(x));   // le mappe restano, senza set
        return Archivio.eliminaMolti('set', tutti);
    }

    // Set ordinati per ultimo utilizzo, per "Continua a studiare"
    function setRecenti(quanti = 4) {
        const conCarte = new Set(Archivio.tutti('carte').map(c => c.setId));
        return tuttiSet()
            .filter(s => conCarte.has(s.id))
            .sort((a, b) => (b.ultimoStudio || b.modificato || 0) - (a.ultimoStudio || a.modificato || 0))
            .slice(0, quanti);
    }

    // ---- Carte ad albero ---------------------------------------------------

    function carta(id) { return Archivio.prendi('carte', id); }
    function carteGrezze(setId) { return Archivio.tutti('carte').filter(c => c.setId === setId); }

    // Visita in profondità: madre, poi le figlie in ordine, poi la sorella successiva.
    // Restituisce [{ carta, livello, figlie }] con figlie = numero di figlie dirette.
    function ordinaAlbero(carte) {
        const ids = new Set(carte.map(c => c.id));
        const perMadre = new Map();
        carte.forEach(c => {
            const madre = c.genitoreId && ids.has(c.genitoreId) && c.genitoreId !== c.id ? c.genitoreId : null;
            if (!perMadre.has(madre)) perMadre.set(madre, []);
            perMadre.get(madre).push(c);
        });
        perMadre.forEach(lista => lista.sort((a, b) => (a.ordine - b.ordine) || (a.creata - b.creata)));
        const out = [];
        const visitate = new Set();
        const visita = (madre, livello) => (perMadre.get(madre) || []).forEach(c => {
            if (visitate.has(c.id)) return;
            visitate.add(c.id);
            out.push({ carta: c, livello, figlie: (perMadre.get(c.id) || []).length });
            visita(c.id, livello + 1);
        });
        visita(null, 0);
        // Rete di sicurezza: carte finite in un ciclo di madri tornano principali
        carte.filter(c => !visitate.has(c.id)).forEach(c => { visitate.add(c.id); out.push({ carta: c, livello: 0, figlie: 0 }); });
        return out;
    }

    // ---- Dettagli nascosti --------------------------------------------------
    // Con l'impostazione "nascondiDettagli" le carte con il tag "dettaglio", e quelle appese sotto di loro,
    // non compaiono negli elenchi qui sotto: niente righe, conteggi, avanzamento, ricerca né studio.
    // Restano nell'archivio; chi deve vederle tutte (assistente, export, eliminazioni) passa { tutte: true }.

    function eDettaglio(c) { return (c.tag || []).some(t => String(t).trim().toLowerCase() === 'dettaglio'); }
    function dettagliNascosti() { return !!impostazioni().nascondiDettagli; }

    // Toglie dall'albero i dettagli con i loro rami e ricalcola quante figlie restano a ogni carta
    function senzaDettagli(albero) {
        const out = [];
        let sotto = null;
        albero.forEach(n => {
            if (sotto !== null) { if (n.livello > sotto) return; sotto = null; }
            if (eDettaglio(n.carta)) { sotto = n.livello; return; }
            out.push(n);
        });
        const figlie = new Map();
        out.forEach(n => { if (n.carta.genitoreId) figlie.set(n.carta.genitoreId, (figlie.get(n.carta.genitoreId) || 0) + 1); });
        return out.map(n => (n.figlie === (figlie.get(n.carta.id) || 0) ? n : { ...n, figlie: figlie.get(n.carta.id) || 0 }));
    }

    function alberoDiSet(setId, { tutte = false } = {}) {
        const albero = ordinaAlbero(carteGrezze(setId));
        return tutte || !dettagliNascosti() ? albero : senzaDettagli(albero);
    }
    function carteDiSet(setId, opzioni) { return alberoDiSet(setId, opzioni).map(n => n.carta); }

    // Le carte di un set e di tutti i suoi sotto-set, nell'ordine in cui si studiano
    function carteConSottoSet(setId, opzioni) {
        return [setId, ...discendentiSet(setId)].flatMap(id => carteDiSet(id, opzioni));
    }

    function carteDiMateria(materiaId, opzioni) { return setDiMateria(materiaId).flatMap(s => carteDiSet(s.id, opzioni)); }

    // Carte di più set scelti, in ordine di materia, di albero dei set e di albero delle carte
    function carteDiSetMultipli(setIds, opzioni) {
        const scelti = new Set(setIds);
        return materie().flatMap(m => setDiMateria(m.id).filter(s => scelti.has(s.id)).flatMap(s => carteDiSet(s.id, opzioni)));
    }

    function tutteLeCarte(opzioni) { return materie().flatMap(m => carteDiMateria(m.id, opzioni)); }

    function madre(c) {
        const m = c.genitoreId ? carta(c.genitoreId) : null;
        return m && m.setId === c.setId ? m : null;
    }

    function figlie(c) {
        return carteGrezze(c.setId).filter(x => x.genitoreId === c.id).sort((a, b) => a.ordine - b.ordine);
    }

    function discendentiCarta(id) {
        const c = carta(id);
        if (!c) return [];
        const out = [];
        const visita = x => figlie(x).forEach(f => { out.push(f.id); visita(f); });
        visita(c);
        return out;
    }

    function idMadre(c) { const m = madre(c); return m ? m.id : null; }

    function sorelle(c) {
        const id = idMadre(c);
        return carteGrezze(c.setId).filter(x => idMadre(x) === id).sort((a, b) => a.ordine - b.ordine);
    }

    // Mette la carta tra le figlie di "genitoreId" (null = principali) alla posizione "indice"
    function colloca(c, genitoreId, indice = null) {
        const modificate = new Set([c]);
        const vecchie = sorelle(c).filter(x => x.id !== c.id);
        const cambiaMadre = idMadre(c) !== (genitoreId || null);
        c.genitoreId = genitoreId || null;
        const nuove = carteGrezze(c.setId)
            .filter(x => x.id !== c.id && idMadre(x) === c.genitoreId)
            .sort((a, b) => a.ordine - b.ordine);
        nuove.splice(indice == null ? nuove.length : limita(indice, 0, nuove.length), 0, c);
        const numera = lista => lista.forEach((x, i) => { if (x.ordine !== i + 1) { x.ordine = i + 1; modificate.add(x); } });
        numera(nuove);
        if (cambiaMadre) numera(vecchie);
        Archivio.salvaMolti('carte', [...modificate]);
    }

    function prossimoOrdine(setId, genitoreId = null) {
        return Math.max(0, ...carteGrezze(setId).filter(c => (c.genitoreId || null) === (genitoreId || null)).map(c => c.ordine || 0)) + 1;
    }

    function normalizzaCarta(dati) {
        const risposte = (dati.risposte || [])
            .filter(r => r && (testoDaHtml(r.testo) || /<img/i.test(r.testo || '')))
            .slice(0, MAX_RISPOSTE)
            .map(r => ({ testo: r.testo, corretta: !!r.corretta }));
        if (risposte.length === 1) risposte[0].corretta = true;
        return {
            domanda: dati.domanda || '',
            risposte,
            tag: [...new Set((dati.tag || []).map(t => String(t).trim()).filter(Boolean))],
            suggerimento: (dati.suggerimento || '').trim(),
            spiegazione: dati.spiegazione || '',
            mappa: dati.mappa && dati.mappa.id && dati.mappa.nodo ? { id: String(dati.mappa.id), nodo: String(dati.mappa.nodo) } : null,
            fonte: dati.fonte && dati.fonte.materiale ? {
                materiale: String(dati.fonte.materiale),
                pagina: Number.isInteger(+dati.fonte.pagina) && +dati.fonte.pagina > 0 ? +dati.fonte.pagina : null,
                citazione: String(dati.fonte.citazione || '').replace(/\s+/g, ' ').trim().slice(0, 500),
            } : null,
        };
    }

    function creaCarta(setId, dati, { genitoreId = null } = {}) {
        const ora = Date.now();
        const m = genitoreId ? carta(genitoreId) : null;
        const idMadre = m && m.setId === setId ? m.id : null;
        const c = {
            id: uid(), setId, genitoreId: idMadre, ordine: prossimoOrdine(setId, idMadre),
            ...normalizzaCarta(dati), srs: Srs.statoIniziale(), creata: ora, modificata: ora,
        };
        Archivio.salva('carte', c);
        aggiornaSet(setId, {});
        return c;
    }

    // Creazione in blocco (import). "genitore" facoltativo = indice della madre nella lista
    function creaCarte(setId, lista) {
        const ora = Date.now();
        let ordine = prossimoOrdine(setId);
        const nuove = lista.map(dati => ({
            id: uid(), setId, genitoreId: null, ordine: ordine++,
            ...normalizzaCarta(dati), srs: Srs.statoIniziale(), creata: ora, modificata: ora,
        }));
        lista.forEach((dati, i) => {
            if (dati.genitore != null && dati.genitore < i && nuove[dati.genitore]) nuove[i].genitoreId = nuove[dati.genitore].id;
        });
        Archivio.salvaMolti('carte', nuove);
        aggiornaSet(setId, {});
        return nuove;
    }

    function aggiornaCarta(id, dati) {
        const c = carta(id);
        if (!c) return null;
        Object.assign(c, normalizzaCarta({ ...c, ...dati }), { modificata: Date.now() });
        Archivio.salva('carte', c);
        return c;
    }

    // Cambia la domanda madre (in fondo alle sue figlie). Rifiuta se stessa e le discendenti.
    function impostaMadre(id, genitoreId) {
        const c = carta(id);
        if (!c || idMadre(c) === (genitoreId || null)) return false;
        if (genitoreId && (genitoreId === id || discendentiCarta(id).includes(genitoreId))) return false;
        colloca(c, genitoreId, null);
        return true;
    }

    // Sorella visibile più vicina nella direzione data (con i dettagli nascosti si scavalcano)
    function sorellaVisibile(lista, i, verso) {
        for (let j = i + verso; j >= 0 && j < lista.length; j += verso) {
            if (!dettagliNascosti() || !eDettaglio(lista[j])) return j;
        }
        return -1;
    }

    // Tab: diventa figlia della sorella che la precede
    function aumentaRientro(id) {
        const c = carta(id);
        const lista = sorelle(c);
        const j = sorellaVisibile(lista, lista.findIndex(x => x.id === id), -1);
        if (j < 0) return false;
        colloca(c, lista[j].id, null);
        return true;
    }

    // Maiusc+Tab: sale di un livello e si mette subito dopo la sua madre
    function riduciRientro(id) {
        const c = carta(id);
        const m = madre(c);
        if (!m) return false;
        const lista = sorelle(m);
        colloca(c, idMadre(m), lista.findIndex(x => x.id === m.id) + 1);
        return true;
    }

    function spostaTraSorelle(id, verso) {
        const c = carta(id);
        const lista = sorelle(c);
        const j = sorellaVisibile(lista, lista.findIndex(x => x.id === id), verso);
        if (j < 0) return false;
        colloca(c, idMadre(c), j);
        return true;
    }

    // Le figlie della carta eliminata prendono il suo posto, un livello più su
    function eliminaCarta(id) {
        const c = carta(id);
        if (!c) return Promise.resolve();
        const lista = sorelle(c);
        const i = lista.findIndex(x => x.id === id);
        const salite = figlie(c);
        salite.forEach(f => { f.genitoreId = idMadre(c); });
        const nuovaLista = [...lista.slice(0, i), ...salite, ...lista.slice(i + 1)];
        nuovaLista.forEach((x, k) => { x.ordine = k + 1; });
        Archivio.salvaMolti('carte', nuovaLista);
        return Archivio.elimina('carte', id);
    }

    // Sposta la carta con tutte le sue discendenti in un altro set, come domanda principale
    function spostaCarta(id, setId) {
        const c = carta(id);
        if (!c || c.setId === setId) return;
        const ramo = [c, ...discendentiCarta(id).map(carta)];
        const lista = sorelle(c).filter(x => x.id !== id);
        lista.forEach((x, k) => { x.ordine = k + 1; });
        c.genitoreId = null;
        c.ordine = prossimoOrdine(setId);
        ramo.forEach(x => { x.setId = setId; });
        Archivio.salvaMolti('carte', [...ramo, ...lista]);
    }

    function reimpostaProgressi(carte) {
        carte.forEach(c => { c.srs = Srs.statoIniziale(); });
        return Archivio.salvaMolti('carte', carte);
    }

    // Valutazione scelta a mano (null = mai valutata): cambia lo stato della carta e del suo set, non le date
    function impostaValutazione(carte, valutazione) {
        carte.forEach(c => { c.srs = Srs.conValutazione(c.srs, valutazione); });
        return Archivio.salvaMolti('carte', carte);
    }

    // Riadeguamento al set: la carta prende N° Rep e ultimo ripasso della riga del suo set (già ripassato) e li segue;
    // la valutazione resta quella che ha. Restituisce le carte cambiate
    function allineaAlSet(carte) {
        const cambiate = [];
        carte.forEach(c => {
            const a = Revisioni.argomentoDi(c);
            if (!a) return;
            c.srs = { ...Srs.normalizza(c.srs), rep: a.ripetizioni || 0, giorno: a.ultimoRipasso, allineata: true, daRifareDal: null };
            cambiate.push(c);
        });
        if (cambiate.length) Archivio.salvaMolti('carte', cambiate);
        return cambiate;
    }

    // N° Rep e ultimo ripasso di una carta, cambiati a mano nella tabella delle revisioni
    function aggiornaSrs(id, { rep, giorno } = {}) {
        const c = carta(id);
        if (!c) return null;
        c.srs = Srs.normalizza(c.srs);
        if (rep != null) c.srs.rep = Math.max(0, Math.round(+rep) || 0);
        if (giorno !== undefined) c.srs.giorno = giorno || null;
        Archivio.salva('carte', c);
        return c;
    }

    function tagDi(carte) {
        return [...new Set(carte.flatMap(c => c.tag || []))].sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
    }

    function sceltaMultipla(c) { return (c.risposte || []).length > 1; }

    // Conteggi per barre di avanzamento e riepiloghi
    function conteggi(carte) {
        // nuoveDovute = mai valutate ma da ripassare (il loro set è già stato ripassato): contano tra le nuove e tra le
        // da ripassare
        const c = { totale: carte.length, nuova: 0, scarso: 0, ok: 0, buono: 0, perfetto: 0, imparate: 0, daRipassare: 0, nuoveDovute: 0 };
        const ora = Date.now();
        carte.forEach(carta => {
            c[Srs.categoria(carta)]++;
            if (Srs.stato(carta) === 'imparata') c.imparate++;
            if (Srs.daRipassare(carta, ora)) c.daRipassare++;
            else if (Revisioni.nuovaDaRipassare(carta, ora)) { c.daRipassare++; c.nuoveDovute++; }
        });
        return c;
    }

    // ---- Materiali di un set ----------------------------------------------

    function materialiDiSet(setId) {
        return Archivio.tutti('materiali').filter(m => m.setId === setId).sort((a, b) => a.creato - b.creato);
    }

    function materiale(id) { return Archivio.prendi('materiali', id); }

    function creaMateriale(dati) {
        const m = {
            id: uid(), nome: 'Senza nome', tipo: 'testo', mime: '', dimensione: 0, creato: Date.now(),
            testo: '', pagine: null, albero: null, anteprima: null, usaInChat: true, remoto: null, ...dati,
        };
        Archivio.salva('materiali', m);
        return m;
    }

    function aggiornaMateriale(id, modifiche) {
        const m = materiale(id);
        if (!m) return null;
        Object.assign(m, modifiche);
        Archivio.salva('materiali', m);
        return m;
    }

    function eliminaMateriale(id) {
        const mat = materiale(id);
        const legati = Archivio.tutti('argomenti').filter(a => (a.materialeIds || []).includes(id));
        legati.forEach(a => { a.materialeIds = a.materialeIds.filter(x => x !== id); });
        Archivio.salvaMolti('argomenti', legati);
        Archivio.eliminaFile(id);
        const esito = Archivio.elimina('materiali', id);
        // Il materiale di una mappa dell'app: la mappa resta nella sezione Mappe, fuori dal set
        if (mat && mat.mappaId) Mappe.togliDalSet(mat.mappaId);
        return esito;
    }

    // ---- Argomenti delle revisioni (js/revisioni.js) -----------------------------
    // Come il database di Notion: una riga per argomento, con quante volte l'hai ripassato e quando.

    const perOrdine = (a, b) => ((a.ordine || 0) - (b.ordine || 0)) || (a.creato - b.creato);

    function argomento(id) { return Archivio.prendi('argomenti', id); }

    // Del set (ed eventualmente dei sotto-set), nell'ordine dell'albero dei set e poi in quello dato dall'utente
    function argomentiDiSet(setId, { conSottoSet = false } = {}) {
        const tutti = Archivio.tutti('argomenti');
        return (conSottoSet ? [setId, ...discendentiSet(setId)] : [setId])
            .flatMap(id => tutti.filter(a => a.setId === id).sort(perOrdine));
    }

    function argomentiDiMateria(materiaId) { return setDiMateria(materiaId).flatMap(s => argomentiDiSet(s.id)); }
    function tuttiGliArgomenti() { return materie().flatMap(m => argomentiDiMateria(m.id)); }

    function creaArgomento({ setId, nome = '', fonte = '', materialeIds = [], ripetizioni = 0, ultimoRipasso = null, stato = '', delSet = false, carte = null }) {
        if (!set(setId)) throw new Error('Set non trovato');
        const ordine = Math.max(0, ...Archivio.tutti('argomenti').filter(a => a.setId === setId).map(a => a.ordine || 0)) + 1;
        const a = {
            id: uid(), setId, nome: String(nome).trim(), fonte: String(fonte).trim(), materialeIds: [...new Set(materialeIds)], fontiTolte: [],
            ripetizioni: Math.max(0, Math.round(ripetizioni) || 0), ultimoRipasso: ultimoRipasso || null, stato, delSet: !!delSet,
            carte: Array.isArray(carte) ? [...new Set(carte)] : null,
            ordine, creato: Date.now(), storico: [],
        };
        Archivio.salva('argomenti', a);
        return a;
    }

    function aggiornaArgomento(id, modifiche) {
        const a = argomento(id);
        if (!a) return null;
        if ('ripetizioni' in modifiche) modifiche = { ...modifiche, ripetizioni: Math.max(0, Math.round(+modifiche.ripetizioni) || 0) };
        if ('setId' in modifiche && modifiche.setId !== a.setId) {
            if (!set(modifiche.setId)) throw new Error('Set non trovato');
            modifiche = { ...modifiche, ordine: Math.max(0, ...Archivio.tutti('argomenti').filter(x => x.setId === modifiche.setId).map(x => x.ordine || 0)) + 1 };
            // Spostata in un altro set: tiene solo i materiali di quel set e non è più la riga automatica del vecchio
            modifiche.materialeIds = (a.materialeIds || []).filter(id => (materiale(id) || {}).setId === modifiche.setId);
            modifiche.delSet = false;
            modifiche.carte = null;
        }
        Object.assign(a, modifiche);
        Archivio.salva('argomenti', a);
        return a;
    }

    function eliminaArgomento(id) { return Archivio.elimina('argomenti', id); }

    // "Ripassato": una ripetizione in più e la data di oggi, come facevi a mano in Notion
    function segnaRipasso(id, stato = '', giorno = chiaveGiorno()) {
        const a = argomento(id);
        if (!a) return null;
        a.storico = [...(a.storico || []), { giorno, stato: stato || a.stato || '', prima: { ripetizioni: a.ripetizioni || 0, ultimoRipasso: a.ultimoRipasso, stato: a.stato || '' } }];
        a.ripetizioni = (a.ripetizioni || 0) + 1;
        a.ultimoRipasso = giorno;
        if (stato) a.stato = stato;
        Archivio.salva('argomenti', a);
        return a;
    }

    function annullaUltimoRipasso(id) {
        const a = argomento(id);
        if (!a || !(a.storico || []).length) return null;
        const ultimo = a.storico[a.storico.length - 1];
        Object.assign(a, ultimo.prima, { storico: a.storico.slice(0, -1) });
        Archivio.salva('argomenti', a);
        return a;
    }

    // ---- Migrazioni (all'avvio, una volta sola) -------------------------------------
    // Dati fatti con versioni precedenti dell'app portati al modello attuale.
    function migra() {
        const fatte = impostazioni().migrazioni || {};
        const nuove = {};

        // Revisioni: da un solo materiale collegato a un elenco
        const vecchi = Archivio.tutti('argomenti').filter(a => !Array.isArray(a.materialeIds));
        vecchi.forEach(a => {
            a.materialeIds = a.materialeId && materiale(a.materialeId) ? [a.materialeId] : [];
            a.fontiTolte = a.fontiTolte || [];
            delete a.materialeId;
        });
        if (vecchi.length) Archivio.salvaMolti('argomenti', vecchi);

        // Carte: dagli intervalli in stile Vaia al N° Rep a raddoppio delle revisioni. Le carte già studiate di un set
        // che ha la sua riga nelle revisioni partono allineate a quella (stesso N° Rep e ultimo ripasso)
        if (!fatte.srsRaddoppio) {
            const daCambiare = Archivio.tutti('carte').filter(c => !c.srs || !('rep' in c.srs));
            daCambiare.forEach(c => {
                c.srs = Srs.normalizza(c.srs);
                const riga = Revisioni.rigaDelSet(c.setId);
                if (c.srs.ultimaValutazione != null && riga && riga.ultimoRipasso) {
                    c.srs.rep = riga.ripetizioni || 0;
                    c.srs.giorno = riga.ultimoRipasso;
                }
            });
            if (daCambiare.length) Archivio.salvaMolti('carte', daCambiare);
            nuove.srsRaddoppio = true;
        }

        if (Object.keys(nuove).length) salvaImpostazioni({ migrazioni: { ...fatte, ...nuove } });
    }

    // Tag della localizzazione fatti prima della correzione: sotto la carta "sottoramo" il primo livello è
    // "concetto 1" anche quando la carta unisce sottoramo e figlio unico. Si annulla da Modifiche recenti
    async function correggiTagConcetti() {
        const fatte = impostazioni().migrazioni || {};
        if (fatte.tagConcetti) return 0;
        const RE = /^concetto (\d+)$/i;
        const daCorreggere = [];
        Archivio.tutti('carte').forEach(c => {
            const i = (c.tag || []).findIndex(t => RE.test(String(t).trim()));
            if (i < 0) return;
            let passi = 0, x = c;
            const visti = new Set();
            while (x && !visti.has(x.id) && !(x.tag || []).some(t => /^sottoramo$/i.test(String(t).trim()))) {
                visti.add(x.id);
                x = x.genitoreId ? carta(x.genitoreId) : null;
                passi++;
            }
            if (!x || visti.has(x.id) || passi < 1) return;
            const giusto = `concetto ${passi}`;
            if (String(c.tag[i]).trim().toLowerCase() !== giusto) daCorreggere.push([c, i, giusto]);
        });
        salvaImpostazioni({ migrazioni: { ...fatte, tagConcetti: true } });
        if (!daCorreggere.length) return 0;
        await Storia.esegui(`Tag «concetto» corretti in ${plurale(daCorreggere.length, 'carta', 'carte')} (sotto il sottoramo ora c'è «concetto 1»)`, () => {
            daCorreggere.forEach(([c, i, giusto]) => { c.tag = c.tag.map((t, k) => (k === i ? giusto : t)); });
            Archivio.salvaMolti('carte', daCorreggere.map(([c]) => c));
        });
        return daCorreggere.length;
    }

    // ---- Conversazioni dell'assistente ---------------------------------------

    function chat(id) { return Archivio.prendi('chat', id); }
    function salvaChat(c) { c.aggiornata = Date.now(); return Archivio.salva('chat', c); }
    function eliminaChat(id) { return Archivio.elimina('chat', id); }

    // ---- Ripassi (registro di studio) --------------------------------------

    // Aggiorna la ripetizione spaziata e registra il ripasso. date = false per i ritorni della carta nella stessa
    // sessione: cambiano la valutazione, non N° Rep e date; rep = false: ultimo ripasso oggi, N° Rep invariato
    function registraRisposta(c, valutazione, durata, { date = true, rep = true } = {}) {
        c.srs = Srs.valuta(c.srs, valutazione, { date, rep });
        Archivio.salva('carte', c);
        const ts = Date.now();
        Archivio.salva('ripassi', {
            id: uid(), cartaId: c.id, setId: c.setId, ts, giorno: chiaveGiorno(ts),
            valutazione, modo: 'impara', durata: Math.round(limita(durata || 0, 0, 5 * 60 * 1000)),
        });
        const s = set(c.setId);
        if (s) { s.ultimoStudio = ts; Archivio.salva('set', s); }
        return c;
    }

    function ripassi() { return Archivio.tutti('ripassi'); }

    // Mappa giorno → { carte, durata, valutazioni[4] }
    function attivitaPerGiorno() {
        const mappa = new Map();
        ripassi().forEach(r => {
            let g = mappa.get(r.giorno);
            if (!g) { g = { carte: 0, durata: 0, valutazioni: [0, 0, 0, 0] }; mappa.set(r.giorno, g); }
            g.carte++;
            g.durata += r.durata || 0;
            if (r.valutazione != null && r.valutazione >= 0 && r.valutazione <= 3) g.valutazioni[r.valutazione]++;
        });
        return mappa;
    }

    function oggi(attivita = attivitaPerGiorno()) {
        const g = attivita.get(chiaveGiorno()) || { carte: 0, durata: 0 };
        return { carte: g.carte, durata: g.durata };
    }

    // ---- Esami (piano di studio) -----------------------------------------

    function esami() { return Archivio.tutti('esami').sort((a, b) => a.data.localeCompare(b.data)); }
    function esame(id) { return Archivio.prendi('esami', id); }

    function creaEsame(dati) {
        const e = { id: uid(), nome: dati.nome.trim(), data: dati.data, materiaId: dati.materiaId || null, note: (dati.note || '').trim() };
        Archivio.salva('esami', e);
        return e;
    }

    function aggiornaEsame(id, modifiche) {
        const e = esame(id);
        if (!e) return null;
        Object.assign(e, modifiche);
        Archivio.salva('esami', e);
        return e;
    }

    function eliminaEsame(id) { return Archivio.elimina('esami', id); }

    function prossimiEsami() {
        const oggiChiave = chiaveGiorno();
        return esami().filter(e => e.data >= oggiChiave);
    }

    return {
        impostazioni, salvaImpostazioni,
        materie, materia, creaMateria, aggiornaMateria, eliminaMateria,
        tuttiSet, set, sottoSet, setRadice, alberoSet, setDiMateria, discendentiSet, percorsoSet,
        creaSet, aggiornaSet, eliminaSet, setRecenti,
        carta, ordinaAlbero, alberoDiSet, carteDiSet, carteConSottoSet, carteDiMateria, carteDiSetMultipli, tutteLeCarte,
        eDettaglio, dettagliNascosti, madre, figlie, discendentiCarta, creaCarta, creaCarte, aggiornaCarta, impostaMadre,
        aumentaRientro, riduciRientro, spostaTraSorelle, eliminaCarta, spostaCarta, reimpostaProgressi, impostaValutazione, aggiornaSrs, allineaAlSet,
        tagDi, sceltaMultipla, conteggi, migra, correggiTagConcetti,
        materialiDiSet, materiale, creaMateriale, aggiornaMateriale, eliminaMateriale,
        argomento, argomentiDiSet, argomentiDiMateria, tuttiGliArgomenti, creaArgomento, aggiornaArgomento, eliminaArgomento,
        segnaRipasso, annullaUltimoRipasso,
        chat, salvaChat, eliminaChat,
        registraRisposta, ripassi, attivitaPerGiorno, oggi,
        esami, esame, creaEsame, aggiornaEsame, eliminaEsame, prossimiEsami,
    };
})();
