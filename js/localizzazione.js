// Creazione flashcard per profondità (prima "localizzazione"): porta nell'app la skill "creatore-flashcard-mappe-mentali".
//
// La risposta di queste carte non è la spiegazione ma il punto della fonte dove ripassare
// (titolo della fonte più sottoramo); il tag colloca la carta nell'albero.
// Come nella skill, tutto il lavoro meccanico è qui (ricalca scripts/albero.py e
// scripts/costruisci_xlsx.py): livelli, tag, ordine depth-first, localizzazioni, catene
// passanti collassate, foglie-etichetta assorbite e controlli sulle domande.
// Unica differenza voluta: il numero di "concetto N" segue l'albero delle carte, non la profondità
// del nodo nella mappa (vedi tagDi), così sotto la carta "sottoramo" ci sono sempre i "concetto 1".
// All'assistente IA resta solo il lavoro di giudizio: scrivere le domande.
// In più rispetto alla skill, le carte create nel set sono già ad albero (madre → figlie),
// così si studiano a cascata.
// Da una mappa dell'app si possono fare le carte solo di alcuni nodi (scelti nell'editor della mappa, con o senza i
// rami sotto): il piano si calcola su tutta la mappa, così tag, risposte e madri restano quelli giusti, e poi tiene
// solo le carte di quei nodi. Una carta la cui madre resta fuori va sotto la carta che il set ha già per quel nodo.

const Localizzazione = (() => {
    const MAX_PAROLE_ETICHETTA = 6;
    const RE_CORPO = /^([^:]{2,60}?)\s*:\s+([\s\S]+)$/;
    const RE_NUMERO = /^\s*(?:sotto\s*-?\s*ramo|sottoramo|ramo|sezione|capitolo|cap\.?|parte|schema|unit[aà]|modulo)?\s*[.\-–—]?\s*(\d+(?:\.\d+)*)\b/i;
    const RE_TAG = /^(?:generale|sottoramo|dettaglio|concetto [1-9][0-9]*)$/;

    // Citano la fonte come oggetto grafico: la domanda va riscritta
    const TOPOGRAFIA_ERRORE = ['nella mappa', 'nello schema', 'nel sottoramo', 'nel diagramma', 'riquadro'];
    // Possono essere topografia oppure contenuto vero: si segnalano e decide chi scrive
    const TOPOGRAFIA_AVVISO = ['in alto', 'in basso', 'a destra', 'a sinistra', 'nel ramo', 'nel nodo', 'colore', 'freccia'];
    const STOPWORD = new Set(('il lo la i gli le un uno una di del della dei delle dello a al allo alla ai agli alle da dal dallo dalla dai '
        + 'dagli dalle in nel nello nella nei negli nelle con col su sul sullo sulla sui sugli sulle per tra fra e ed o od che chi cui non '
        + 'come cosa quale quali quanto quanti quando dove perche si sono essere viene vengono consiste consistono secondo entro interno '
        + 'ambito cornice quadro modello teoria autore punto vista questo questa questi queste').split(' '));

    const piani = new Map();   // piani preparati in questa sessione, per id

    // ---- Albero ---------------------------------------------------------------

    // "Definizione: tendenza a ritrarsi" → titolo "Definizione", corpo il resto
    function separaTitoloCorpo(testo, corpo) {
        testo = String(testo || '').trim();
        corpo = String(corpo || '').trim();
        if (corpo) return [testo, corpo];
        const m = testo.match(RE_CORPO);
        if (m && m[2].trim().split(/\s+/).length >= 2) return [m[1].trim(), m[2].trim()];
        return [testo, ''];
    }

    // Albero semplice { titolo, corpo, figli } (quello dei materiali) → nodi con padre, id e livello
    function daSemplice(a, padre = null) {
        const [titolo, corpo] = separaTitoloCorpo(a.titolo, a.corpo);
        const n = { titolo, corpo, figli: [], padre, id: '', livello: 0, etichetta: false, mappaNodo: a.mappaNodo || null };
        (a.figli || []).forEach(f => n.figli.push(daSemplice(f, n)));
        return n;
    }

    function numera(n, prefisso = '', livello = 0) {
        n.livello = livello;
        n.id = prefisso || '0';
        n.figli.forEach((f, i) => numera(f, prefisso ? `${prefisso}.${i + 1}` : String(i + 1), livello + 1));
    }

    function discendenti(n) {
        const out = [];
        const visita = x => x.figli.forEach(f => { out.push(f); visita(f); });
        visita(n);
        return out;
    }

    // Foglia il cui unico contenuto è il proprio nome: viene assorbita nella carta del padre
    function sembraEtichetta(n) {
        if (n.figli.length || n.corpo) return false;
        if (n.titolo.split(/\s+/).filter(Boolean).length > MAX_PAROLE_ETICHETTA) return false;
        return !/[.;?!]$/.test(n.titolo);
    }

    function marcaEtichette(radice, forzate, annullate) {
        discendenti(radice).forEach(n => {
            n.etichetta = sembraEtichetta(n);
            if (forzate.has(n.id)) n.etichetta = true;
            if (annullate.has(n.id)) n.etichetta = false;
        });
    }

    // profondita = livello della carta nell'albero delle flashcard (radice 0, sottoramo 1…). Non è il livello del nodo
    // nella mappa: se un sottoramo ha un solo figlio i due diventano una carta sola, e i nipoti stanno subito sotto
    // la carta del sottoramo, quindi sono "concetto 1" (non 2). Così il tag segue sempre la cascata delle domande.
    function tagDi(n, profondita) {
        if (profondita === 0) return 'generale';
        if (profondita === 1) return 'sottoramo';
        return n.figli.length ? `concetto ${profondita - 1}` : 'dettaglio';
    }

    function numeroSottoramo(n) {
        const m = n.titolo.match(RE_NUMERO);
        return m ? m[1] : null;
    }

    function antenatoDiPrimoLivello(n) {
        while (n && n.livello > 1) n = n.padre;
        return n && n.livello === 1 ? n : null;
    }

    // La coordinata si ferma sempre al primo livello, anche per un dettaglio molto profondo
    function localizza(n, titoloFonte, numeri) {
        if (n.livello === 0) return titoloFonte;
        const ramo = antenatoDiPrimoLivello(n);
        if (!ramo) return titoloFonte;
        return `${titoloFonte}, sottoramo ${numeri[ramo.id] || ramo.titolo}`;
    }

    function percorso(n) {
        const out = [];
        for (let x = n; x; x = x.padre) out.unshift(x.titolo);
        return out;
    }

    const sintesi = n => (n.corpo ? { id: n.id, titolo: n.titolo, corpo: n.corpo } : { id: n.id, titolo: n.titolo });

    function costruisciCarte(radice, titoloFonte, numeri) {
        const carte = [];
        const emetti = (n, profondita) => {
            // Catena passante: finché c'è un figlio solo, la carta resta una sola
            const catena = [n];
            let cur = n;
            while (cur.livello >= 1 && cur.figli.length === 1) { cur = cur.figli[0]; catena.push(cur); }
            const assorbiti = cur.figli.filter(f => f.etichetta);
            const propri = cur.figli.filter(f => !f.etichetta);
            carte.push({
                id: `c${String(carte.length + 1).padStart(3, '0')}`,
                nodo_id: n.id,
                tag: tagDi(n, profondita),
                answer: localizza(n, titoloFonte, numeri),
                percorso: percorso(n),
                catena: catena.map(sintesi),
                assorbiti: assorbiti.map(sintesi),
                figli_con_card_propria: propri.map(f => f.titolo),
                nodi_coperti: [...catena.map(x => x.id), ...assorbiti.map(f => f.id)],
                discendenti_totali: discendenti(n).length,
                nodo: n,
                nodi: [...catena, ...assorbiti],
                mappaNodo: cur.mappaNodo || n.mappaNodo || null,
            });
            propri.forEach(f => emetti(f, profondita + 1));
        };
        emetti(radice, 0);
        return carte;
    }

    // Solo le carte che coprono i nodi scelti della mappa (con conRami anche tutti quelli sotto). La madre di una carta è
    // la carta tenuta più vicina sopra di lei, oppure la carta che il set ha già per quel nodo (genitoreEsistente).
    // saltaEsistenti: niente carte per i nodi che nel set hanno già una carta collegata
    function soloNodiScelti(radice, carte, { soloNodi, conRami, mappaId, setId, saltaEsistenti }) {
        const scelti = new Set(soloNodi);
        const dentro = new Set();
        [radice, ...discendenti(radice)].forEach(n => {
            if (!scelti.has(n.mappaNodo)) return;
            dentro.add(n);
            if (conRami) discendenti(n).forEach(d => dentro.add(d));
        });
        const nelSet = setId && mappaId ? Dati.carteDiSet(setId, { tutte: true }).filter(c => c.mappa && c.mappa.id === mappaId) : [];
        const cartaDelNodo = new Map(nelSet.map(c => [c.mappa.nodo, c.id]));
        const giaFatte = c => cartaDelNodo.has(c.mappaNodo);
        const tenute = carte.map((c, i) => (c.nodi.some(n => dentro.has(n)) && !(saltaEsistenti && giaFatte(c)) ? i : -1)).filter(i => i >= 0);
        const nuovoIndice = new Map(tenute.map((i, k) => [i, k]));
        const saltate = carte.filter(c => c.nodi.some(n => dentro.has(n)) && saltaEsistenti && giaFatte(c)).length;
        const scelte = tenute.map(i => {
            const c = { ...carte[i], madre: null, genitoreEsistente: null };
            for (let su = carte[i].madre; su != null; su = carte[su].madre) {
                if (nuovoIndice.has(su)) { c.madre = nuovoIndice.get(su); break; }
                const gia = carte[su].nodi.map(n => cartaDelNodo.get(n.mappaNodo)).find(Boolean);
                if (gia) { c.genitoreEsistente = gia; break; }
            }
            return c;
        });
        return { carte: scelte, saltate };
    }

    // albero: { titolo, corpo, figli }. opzioni: etichetteForzate, etichetteAnnullate, numerazione { nodoId: numero }
    // mappaId = mappa dell'app da cui viene l'albero (i suoi nodi hanno mappaNodo): le carte nascono collegate al loro nodo.
    // soloNodi = [id dei nodi della mappa]: solo le carte di quei nodi (conRami: anche dei rami sotto); setId e
    // saltaEsistenti servono per agganciarle alle carte che il set ha già e per non rifare quelle già fatte
    function preparaPiano(albero, { etichetteForzate = [], etichetteAnnullate = [], numerazione = {}, fonte = '', mappaId = null,
        soloNodi = null, conRami = true, setId = null, saltaEsistenti = false } = {}) {
        if (!albero || !String(albero.titolo || '').trim()) throw new Error('La fonte non ha un titolo alla radice: va chiesto all\'utente.');
        const radice = daSemplice(albero);
        numera(radice);
        marcaEtichette(radice, new Set(etichetteForzate), new Set(etichetteAnnullate));

        const avvisi = [];
        const titoloFonte = radice.titolo;
        if (!numeroSottoramo(radice)) avvisi.push(`Il titolo della fonte non ha numerazione: uso il titolo per esteso («${titoloFonte}»).`);
        const numeri = {};
        radice.figli.forEach(r => { const n = numeroSottoramo(r); if (n) numeri[r.id] = n; });
        Object.assign(numeri, numerazione);
        const senzaNumero = radice.figli.filter(r => !numeri[r.id]).map(r => r.titolo);
        if (senzaNumero.length) avvisi.push('Sottorami senza numerazione, localizzati per nome: ' + senzaNumero.join('; '));

        const carte = costruisciCarte(radice, titoloFonte, numeri);
        const coperti = new Set(carte.flatMap(c => c.nodi_coperti));
        const scoperti = discendenti(radice).filter(n => !coperti.has(n.id)).map(n => n.id);
        if (scoperti.length) throw new Error('Errore nel piano: nodi non coperti ' + scoperti.join(', '));

        // Madre di ogni carta nell'albero delle flashcard: la carta che copre il nodo padre
        const cartaDelNodo = new Map();
        carte.forEach((c, i) => c.nodi_coperti.forEach(id => cartaDelNodo.set(id, i)));
        carte.forEach(c => { c.madre = c.nodo.padre ? cartaDelNodo.get(c.nodo.padre.id) : null; });

        let tutte = carte, saltate = 0;
        if (soloNodi && soloNodi.length) {
            ({ carte: tutte, saltate } = soloNodiScelti(radice, carte, { soloNodi, conRami, mappaId, setId, saltaEsistenti }));
            if (saltate) avvisi.push(`${saltate} nodi scelti hanno già una flashcard nel set: saltati.`);
        }

        const piano = {
            id: 'p' + uid().slice(0, 8),
            fonte, mappaId,
            titolo_fonte: titoloFonte,
            nodi_totali: 1 + discendenti(radice).length,
            numerazione_sottorami: Object.fromEntries(radice.figli.map(r => [r.titolo, numeri[r.id] || '(per nome)'])),
            foglie_assorbite: tutte.flatMap(c => c.assorbiti.map(v => ({ id: v.id, titolo: v.titolo, dentro: c.catena[c.catena.length - 1].titolo }))),
            catene_collassate: tutte.filter(c => c.catena.length > 1).map(c => ({ card: c.id, nodi: c.catena.map(n => n.titolo) })),
            ...(soloNodi && soloNodi.length ? { solo_nodi_scelti: { nodi: soloNodi.length, con_i_rami_sotto: !!conRami, carte_saltate_perche_gia_fatte: saltate } } : {}),
            avvisi,
            carte: tutte,
            domande: new Map(),
        };
        piani.set(piano.id, piano);
        return piano;
    }

    // Versione del piano da dare al modello (senza i riferimenti interni)
    function pianoPerIA(piano) {
        return {
            piano_id: piano.id,
            titolo_fonte: piano.titolo_fonte,
            nodi_totali: piano.nodi_totali,
            carte_da_scrivere: piano.carte.length,
            numerazione_sottorami: piano.numerazione_sottorami,
            foglie_assorbite: piano.foglie_assorbite,
            catene_collassate: piano.catene_collassate,
            ...(piano.solo_nodi_scelti ? { solo_nodi_scelti: piano.solo_nodi_scelti } : {}),
            avvisi: piano.avvisi,
            carte: piano.carte.map(c => ({
                id: c.id, nodo_id: c.nodo_id, tag: c.tag, percorso: c.percorso.join(' › '),
                catena: c.catena, assorbiti: c.assorbiti.map(a => a.titolo), figli_con_card_propria: c.figli_con_card_propria,
            })),
        };
    }

    // ---- Controlli sulle domande ------------------------------------------------

    function normalizza(testo) {
        return String(testo || '').toLowerCase().normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function gettoni(testo) {
        return new Set(normalizza(testo).split(' ').filter(p => p.length > 2 && !STOPWORD.has(p)));
    }

    function jaccard(a, b) {
        if (!a.size || !b.size) return 0;
        let comuni = 0;
        a.forEach(x => { if (b.has(x)) comuni++; });
        return comuni / (a.size + b.size - comuni);
    }

    // Il termine compare nella domanda come parola intera (accenti ignorati)
    function contieneParola(domanda, termine) {
        const t = normalizza(termine);
        if (t.length < 4) return false;
        return new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(normalizza(domanda));
    }

    function controllaCarta(v, c, errori, avvisi) {
        const q = String(c.question || '').trim();
        const target = String(c.target || '').trim();
        const eti = `${v.id} (${v.tag}, ${v.percorso.slice(1).join('/') || v.percorso[0]})`;
        if (!q) { errori.push(`${eti}: domanda vuota`); return; }
        if (!target) errori.push(`${eti}: manca il campo target`);
        if (/[\t\n\r]/.test(q)) errori.push(`${eti}: la domanda contiene un TAB o un a capo`);
        if (!q.endsWith('?')) errori.push(`${eti}: la domanda non finisce con un punto interrogativo`);
        if (q.length < 30) errori.push(`${eti}: domanda troppo corta per essere autosufficiente`);
        if (!RE_TAG.test(v.tag)) errori.push(`${eti}: tag «${v.tag}» non valido`);
        const nq = normalizza(q);
        TOPOGRAFIA_ERRORE.forEach(p => { if (nq.includes(p)) errori.push(`${eti}: la domanda cita la fonte come oggetto grafico («${p}»)`); });
        TOPOGRAFIA_AVVISO.forEach(p => { if (nq.includes(p)) avvisi.push(`${eti}: «${p}» nella domanda: se è una posizione nella mappa e non contenuto, riscrivi`); });
        v.assorbiti.forEach(f => {
            if (contieneParola(q, f.titolo)) errori.push(`${eti}: la domanda nomina «${f.titolo}», che è una delle voci che lo studente deve rievocare`);
        });
        v.figli_con_card_propria.forEach(f => {
            if (contieneParola(q, f)) avvisi.push(`${eti}: la domanda nomina «${f}», che si dirama da questo nodo: verifica che non sia un'anticipazione della risposta`);
        });
        v.catena.forEach(n => gettoni(n.corpo || '').forEach(p => {
            if (p.length >= 7 && contieneParola(q, p)) avvisi.push(`${eti}: la domanda riprende «${p}» dal contenuto del nodo`);
        }));
    }

    function controllaDoppioni(piano, scritte, errori, avvisi) {
        const voci = new Map(piano.carte.map(v => [v.id, v]));
        const ramo = c => { const p = voci.get(c.id).percorso; return p.length > 1 ? p[1] : '(radice)'; };
        for (let i = 0; i < scritte.length; i++) {
            for (let j = i + 1; j < scritte.length; j++) {
                const a = scritte[i], b = scritte[j];
                const eti = `${a.id} e ${b.id}`;
                const ga = gettoni(a.question), gb = gettoni(b.question);
                const sim = jaccard(ga, gb);
                if (normalizza(a.question) === normalizza(b.question)) errori.push(`${eti}: domande identiche`);
                else if (sim >= 0.9) errori.push(`${eti}: domande di fatto uguali (sovrapposizione ${Math.round(sim * 100)}%)`);
                else if (sim >= 0.65 && ramo(a) === ramo(b)) avvisi.push(`${eti}: domande molto simili nello stesso ramo (${Math.round(sim * 100)}%)`);
                if (String(a.target || '').trim() && normalizza(a.target) === normalizza(b.target)) errori.push(`${eti}: stesso target, sono la stessa carta`);
            }
        }
    }

    function piano(id) {
        const p = piani.get(id);
        if (!p) throw new Error(`Piano «${id}» non trovato: preparalo di nuovo con prepara_piano_localizzazione.`);
        return p;
    }

    // Registra (o corregge) un blocco di domande e controlla quelle appena arrivate
    function scriviDomande(idPiano, domande) {
        const p = piano(idPiano);
        const voci = new Map(p.carte.map(v => [v.id, v]));
        const errori = [], avvisi = [];
        (domande || []).forEach(d => {
            const c = { id: String(d.id || '').trim(), question: String(d.question || d.domanda || '').trim(), target: String(d.target || '').trim() };
            const v = voci.get(c.id);
            if (!v) { errori.push(`id inesistente nel piano: ${c.id || '(vuoto)'}`); return; }
            p.domande.set(c.id, c);
            controllaCarta(v, c, errori, avvisi);
        });
        const mancanti = p.carte.filter(v => !p.domande.has(v.id)).map(v => v.id);
        return { errori, avvisi, scritte: p.domande.size, da_scrivere: p.carte.length, mancanti: mancanti.slice(0, 40) };
    }

    // Controllo completo come costruisci_xlsx.py; se passa, crea le carte nel set, già ad albero
    function creaCarte(idPiano, setId) {
        const p = piano(idPiano);
        if (!Dati.set(setId)) throw new Error(`Set «${setId}» non trovato.`);
        const errori = [], avvisi = [];
        const mancanti = p.carte.filter(v => !p.domande.has(v.id)).map(v => v.id);
        if (mancanti.length) errori.push(`${mancanti.length} carte del piano senza domanda: ${mancanti.slice(0, 12).join(', ')}${mancanti.length > 12 ? ' …' : ''}`);
        const scritte = p.carte.filter(v => p.domande.has(v.id)).map(v => p.domande.get(v.id));
        const voci = new Map(p.carte.map(v => [v.id, v]));
        scritte.forEach(c => controllaCarta(voci.get(c.id), c, errori, avvisi));
        controllaDoppioni(p, scritte, errori, avvisi);
        if (errori.length) return { creato: false, errori, avvisi };

        const lista = p.carte.map(v => ({
            domanda: testoInHtml(p.domande.get(v.id).question),
            risposte: [{ testo: testoInHtml(v.answer), corretta: true }],
            tag: [v.tag],
            genitore: v.madre,
            genitoreEsistente: v.genitoreEsistente || null,
            mappa: p.mappaId && v.mappaNodo && Mappe.mappa(p.mappaId) && Mappe.mappa(p.mappaId).nodi[v.mappaNodo] ? { id: p.mappaId, nodo: v.mappaNodo } : null,
        }));
        const create = Dati.creaCarte(setId, lista);
        return {
            creato: true, carte_create: create.length, set_id: setId, avvisi,
            collegate_alla_mappa: create.filter(c => c.mappa).length,
            foglie_assorbite: p.foglie_assorbite.length, catene_collassate: p.catene_collassate.length, nodi_totali: p.nodi_totali,
        };
    }

    return { separaTitoloCorpo, preparaPiano, pianoPerIA, scriviDomande, creaCarte, piano, normalizza };
})();
