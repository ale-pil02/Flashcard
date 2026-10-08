// Storia delle modifiche: permette di annullare un blocco di modifiche fatte tutte insieme,
// cioè un turno dell'assistente IA o un'azione su più flashcard selezionate.
//
// Mentre una registrazione è aperta l'archivio segnala quali documenti cambiano. All'inizio si
// fotografano i dati (copia profonda: le funzioni di Dati modificano gli oggetti prima di salvarli),
// alla fine per i soli documenti toccati si tengono la versione di prima e quella di dopo.
// Annullare rimette com'erano solo i campi cambiati in quel blocco: se nel frattempo hai studiato
// o modificato altro, quei cambiamenti restano. Anche l'annullamento è un blocco, quindi si può
// ripristinare. Le voci stanno nell'archivio a parte "storia" (le ultime MAX_VOCI), file compresi.
//
// voce { id, quando, origine: 'assistente' | 'utente' | 'annullamento', descrizione, riepilogo,
//        documenti: [{ c: collezione, id, prima, dopo }], file: [{ id, prima: Blob | null }],
//        stato: 'attiva' | 'annullata', annullataDa: id della voce che l'ha annullata }

const Storia = (() => {
    const MAX_VOCI = 40;
    const NON_REGISTRATE = ['ripassi', 'chat'];   // studio e conversazioni non si annullano
    // Documenti grandi (le mappe, con le immagini): non stanno nella fotografia iniziale, si fotografano quando chi li
    // cambia lo annuncia (primaDi). Le modifiche fatte nell'editor delle mappe hanno il suo Annulla e qui non contano.
    const SENZA_FOTO = ['mappe'];
    const AVVISI = { mappe: { prima: id => Mappe.primaDiCambiare(id), dopo: id => Mappe.cambiataDaFuori(id) } };
    // Campi che cambiano di riflesso (ordine tra sorelle, date): non contano nel riepilogo
    const CAMPI_MINORI = ['ordine', 'modificato', 'modificata', 'ultimoStudio', 'aggiornata'];
    const SEP = '\u0000';

    let aperta = null;   // registrazione in corso

    Archivio.alCambio((nome, operazioni) => {
        if (!aperta || NON_REGISTRATE.includes(nome)) return;
        if (operazioni.some(op => op.tipo === 'sostituisci')) { aperta.invalida = true; return; }
        operazioni.forEach(op => {
            const id = op.tipo === 'salva' ? op.valore.id : op.id;
            const chiave = nome + SEP + id;
            if (SENZA_FOTO.includes(nome) && !aperta.prime.has(chiave)) return;
            if (!aperta.escludi.has(chiave)) aperta.toccati.set(chiave, { nome, id });
        });
    });

    // I file si leggono prima che vengano sovrascritti o cancellati
    Archivio.osservaFile(ids => {
        const r = aperta;
        if (!r) return;
        const lettura = (async () => {
            for (const id of ids) {
                if (r.file.has(id)) continue;
                r.file.set(id, null);
                r.file.set(id, await Archivio.leggiFile(id));
            }
        })();
        r.attese.push(lettura);
        return lettura;
    });

    // ---- Registrazione ------------------------------------------------------------

    // escludi: [[collezione, id]] da non registrare (es. la conversazione in corso)
    function inizia({ origine = 'utente', descrizione = '', escludi = [] } = {}) {
        if (aperta) return null;   // dentro un blocco già aperto le modifiche finiscono in quello
        aperta = {
            id: uid(), quando: Date.now(), origine, descrizione,
            foto: Archivio.fotografia([...NON_REGISTRATE, ...SENZA_FOTO]), prime: new Map(),
            toccati: new Map(), file: new Map(), attese: [], invalida: false,
            escludi: new Set(escludi.map(([nome, id]) => nome + SEP + id)),
        };
        return aperta;
    }

    // Com'è un documento di SENZA_FOTO prima che lo si cambi (null se non esiste ancora: lo si sta creando)
    function primaDi(nome, id) {
        if (!aperta || !SENZA_FOTO.includes(nome)) return;
        const chiave = nome + SEP + id;
        if (aperta.prime.has(chiave)) return;
        const ora = Archivio.prendi(nome, id);
        aperta.prime.set(chiave, ora ? structuredClone(ora) : null);
    }

    // Delle mappe non si tiene ciò che si rigenera da solo (anteprima, vista) né le immagini se non sono cambiate
    function alleggerisci(nome, prima, dopo) {
        if (nome !== 'mappe' || !prima || !dopo) return;
        ['anteprima', 'vista', 'modificata'].forEach(k => { delete prima[k]; delete dopo[k]; });
        if (JSON.stringify(prima.immagini) === JSON.stringify(dopo.immagini)) { delete prima.immagini; delete dopo.immagini; }
    }

    async function termina(r) {
        if (!r || r !== aperta) return null;
        aperta = null;
        await Promise.allSettled(r.attese);
        if (r.invalida) return null;

        const documenti = [];
        for (const { nome, id } of r.toccati.values()) {
            const senzaFoto = SENZA_FOTO.includes(nome);
            const prima = senzaFoto ? r.prime.get(nome + SEP + id) || null : r.foto[nome].get(id) || null;
            const ora = Archivio.prendi(nome, id);
            const dopo = ora ? structuredClone(ora) : null;
            alleggerisci(nome, prima, dopo);
            if (JSON.stringify(prima) !== JSON.stringify(dopo)) documenti.push({ c: nome, id, prima, dopo });
        }
        const file = [];
        for (const [id, prima] of r.file) {
            if (prima || await Archivio.leggiFile(id)) file.push({ id, prima });
        }
        if (!documenti.length && !file.length) return null;

        const voce = {
            id: r.id, quando: r.quando, origine: r.origine, descrizione: r.descrizione,
            riepilogo: riepiloga(documenti), documenti, file, stato: 'attiva', annullataDa: null,
        };
        await Archivio.salvaRiga('storia', voce);
        pota();
        return voce;
    }

    async function pota() {
        const voci = (await Archivio.tutteLeRighe('storia')).sort((a, b) => b.quando - a.quando);
        if (voci.length > MAX_VOCI) Archivio.eliminaRighe('storia', voci.slice(MAX_VOCI).map(v => v.id));
    }

    // Esegue fn come un blocco unico e propone di annullarlo
    async function esegui(descrizione, fn) {
        const r = inizia({ origine: 'utente', descrizione });
        let voce = null;
        try {
            await fn();
        } finally {
            voce = await termina(r);
        }
        if (voce) Ui.toast(descrizione, 'successo', 9000, { testo: 'Annulla', clic: () => annullaConAvviso(voce.id) });
        else Ui.toast(descrizione, 'successo');
        return voce;
    }

    // ---- Riepilogo ------------------------------------------------------------------

    const NOMI = {
        carte: ['flashcard', 'flashcard', 'f'], set: ['set', 'set', 'm'], materie: ['materia', 'materie', 'f'],
        materiali: ['materiale', 'materiali', 'm'], esami: ['esame', 'esami', 'm'], argomenti: ['argomento', 'argomenti', 'm'],
        mappe: ['mappa', 'mappe', 'f'],
    };

    function participio(radice, n, genere) { return radice + (genere === 'f' ? (n === 1 ? 'a' : 'e') : (n === 1 ? 'o' : 'i')); }

    function campiCambiati(a, b) {
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    }

    function riepiloga(documenti) {
        const conti = {};
        documenti.forEach(d => {
            const tipo = !d.prima ? 'creat' : !d.dopo ? 'eliminat' : 'modificat';
            if (tipo === 'modificat' && !campiCambiati(d.prima, d.dopo).some(k => !CAMPI_MINORI.includes(k))) return;
            conti[d.c] = conti[d.c] || { creat: 0, modificat: 0, eliminat: 0 };
            conti[d.c][tipo]++;
        });
        const pezzi = [];
        Object.entries(NOMI).forEach(([c, [singolare, plur, genere]]) => {
            const n = conti[c];
            if (!n) return;
            const parti = ['creat', 'modificat', 'eliminat'].filter(t => n[t]).map((t, i) =>
                (i ? `${n[t]} ` : `${plurale(n[t], singolare, plur)} `) + participio(t, n[t], genere));
            pezzi.push(parti.join(', '));
        });
        if (conti.impostazioni) pezzi.push('impostazioni cambiate');
        return pezzi.join(' · ') || 'piccole modifiche (ordine delle carte)';
    }

    // ---- Annullamento ------------------------------------------------------------------

    async function annulla(idVoce) {
        if (aperta) throw new Error("Aspetta che l'assistente finisca di lavorare");
        const voce = await Archivio.leggiRiga('storia', idVoce);
        if (!voce) throw new Error('Questa modifica è troppo vecchia: non si può più annullare');
        if (voce.stato === 'annullata') return { saltati: 0 };

        const r = inizia({ origine: 'annullamento', descrizione: voce.riepilogo });
        let saltati = 0;
        const daSalvare = {}, daEliminare = {};
        const aggiungi = (mappa, c, x) => { (mappa[c] = mappa[c] || []).push(x); };
        // Chi ha bisogno di saperlo (l'editor di una mappa aperta) viene avvisato prima e dopo
        const avvisati = voce.documenti.filter(d => AVVISI[d.c]);
        avvisati.forEach(d => AVVISI[d.c].prima(d.id));
        for (const d of voce.documenti) {
            const ora = Archivio.prendi(d.c, d.id);
            if (!d.prima) { if (ora) aggiungi(daEliminare, d.c, d.id); continue; }
            if (!d.dopo) { if (!ora) aggiungi(daSalvare, d.c, structuredClone(d.prima)); continue; }
            if (!ora) { saltati++; continue; }   // eliminato dopo: resta eliminato
            let cambiato = false, conflitto = false;
            for (const k of campiCambiati(d.prima, d.dopo)) {
                // Campo cambiato di nuovo dopo questo blocco: si lascia com'è adesso
                if (JSON.stringify(ora[k]) !== JSON.stringify(d.dopo[k])) { if (!CAMPI_MINORI.includes(k)) conflitto = true; continue; }
                if (d.prima[k] === undefined) delete ora[k]; else ora[k] = structuredClone(d.prima[k]);
                cambiato = true;
            }
            if (conflitto) saltati++;
            if (cambiato) aggiungi(daSalvare, d.c, ora);
        }
        Object.entries(daEliminare).forEach(([c, ids]) => Archivio.eliminaMolti(c, ids));
        Object.entries(daSalvare).forEach(([c, lista]) => Archivio.salvaMolti(c, lista));
        avvisati.forEach(d => AVVISI[d.c].dopo(d.id));
        for (const f of voce.file) {
            if (f.prima) await Archivio.salvaFile(f.id, f.prima);
            else await Archivio.eliminaFile(f.id);
        }
        const inversa = await termina(r);

        voce.stato = 'annullata';
        voce.annullataDa = inversa ? inversa.id : null;
        await Archivio.salvaRiga('storia', voce);
        dopoCambio();
        return { saltati, inversa };
    }

    // Rifà le modifiche annullate (annulla l'annullamento)
    async function ripristina(idVoce) {
        const voce = await Archivio.leggiRiga('storia', idVoce);
        if (!voce || voce.stato !== 'annullata') return { saltati: 0 };
        if (!voce.annullataDa) throw new Error('Non c\'è niente da ripristinare');
        const esito = await annulla(voce.annullataDa);
        voce.stato = 'attiva';
        voce.annullataDa = null;
        await Archivio.salvaRiga('storia', voce);
        dopoCambio();
        return esito;
    }

    function dopoCambio() {
        App.applicaTema(Dati.impostazioni().tema);
        App.aggiornaDopoAssistente();
        document.dispatchEvent(new CustomEvent('storia-cambiata'));
    }

    function avvisoSaltati(saltati) {
        return saltati ? ` (${plurale(saltati, 'elemento lasciato', 'elementi lasciati')} com'è: l'hai cambiato dopo)` : '';
    }

    async function annullaConAvviso(idVoce) {
        try {
            const { saltati } = await annulla(idVoce);
            Ui.toast('Modifiche annullate' + avvisoSaltati(saltati), 'successo', 9000, { testo: 'Ripristina', clic: () => ripristinaConAvviso(idVoce) });
            return true;
        } catch (e) { Ui.toast(e.message, 'errore', 6000); return false; }
    }

    async function ripristinaConAvviso(idVoce) {
        try {
            const { saltati } = await ripristina(idVoce);
            Ui.toast('Modifiche ripristinate' + avvisoSaltati(saltati), 'successo', 6000);
            return true;
        } catch (e) { Ui.toast(e.message, 'errore', 6000); return false; }
    }

    // ---- Elenco delle modifiche recenti ---------------------------------------------------

    async function elenco() {
        const voci = (await Archivio.tutteLeRighe('storia'))
            .filter(v => v.origine !== 'annullamento')
            .sort((a, b) => b.quando - a.quando);
        const ico = Ui.ico;
        // Per l'assistente il titolo è cosa ha cambiato e sotto c'è la richiesta; per le tue azioni basta la descrizione
        const riga = v => `
            <div class="voce-storia${v.stato === 'annullata' ? ' annullata' : ''}" data-voce="${v.id}">
                <span class="voce-storia-icona">${ico(v.origine === 'assistente' ? 'scintille' : 'carte')}</span>
                <div class="voce-storia-testo">
                    <b>${esc(v.origine === 'assistente' || !v.descrizione ? v.riepilogo : v.descrizione)}</b>
                    <small>${v.origine === 'assistente' ? `Assistente · ${esc(quandoFa(v.quando))}${v.descrizione ? ` · «${esc(Ui.tronca(v.descrizione, 90))}»` : ''}` : `Tu · ${esc(quandoFa(v.quando))}`}</small>
                </div>
                ${v.stato === 'annullata'
                    ? `<button type="button" class="btn btn-fantasma btn-piccolo" data-storia="ripristina">${ico('ripeti')}Ripristina</button>`
                    : `<button type="button" class="btn btn-secondario btn-piccolo" data-storia="annulla">${ico('annulla')}Annulla</button>`}
            </div>`;
        Ui.modale({
            titolo: 'Modifiche recenti', classe: 'modale-larga',
            corpo: voci.length
                ? `<p class="nota">Le modifiche fatte dall'assistente e quelle su più flashcard insieme. Annullando torna com'era solo quello che hanno cambiato loro.</p>
                   <div class="lista-storia">${voci.map(riga).join('')}</div>`
                : Ui.vuoto({ icona: 'orologio', titolo: 'Nessuna modifica da annullare', testo: "Qui compaiono le modifiche dell'assistente e quelle fatte su più flashcard insieme." }),
            alApri: el => el.addEventListener('click', async e => {
                const b = e.target.closest('[data-storia]');
                if (!b) return;
                const id = b.closest('[data-voce]').dataset.voce;
                b.disabled = true;
                const ok = b.dataset.storia === 'annulla' ? await annullaConAvviso(id) : await ripristinaConAvviso(id);
                if (ok) {
                    const v = await Archivio.leggiRiga('storia', id);
                    if (v) b.closest('[data-voce]').outerHTML = riga(v);
                } else b.disabled = false;
            }),
        });
    }

    return {
        inizia, termina, primaDi, esegui, annulla, ripristina, annullaConAvviso, ripristinaConAvviso, elenco,
        get inCorso() { return !!aperta; },
    };
})();
