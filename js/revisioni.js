// Revisioni: spaced repetition degli argomenti, ricopiata dal database "Spaced Repetition System" di Notion.
//
// Ogni argomento (es. un capitolo o uno schema) ha N° Rep e Ultimo ripasso; da lì, come nelle formule di Notion:
//   Prossima revisione = Ultimo ripasso + 2^(N° Rep − 1) giorni   (N° Rep vuoto o 0 vale 1: 1, 2, 4, 8, 16… giorni)
//   Alert = giorni tra la prossima revisione e oggi: < 0 "Da ripassare (N giorni)", 0 "Ripassare oggi", > 0 "Attendi N giorni"
// Lo Stato (Ottimo, Buono, Ok, Scarso, Incompleto) non cambia gli intervalli.
//
// Argomenti con le flashcard (carteDi): la riga del set (delSet, tutte le carte del set, anche quelle aggiunte dopo)
// oppure un argomento con solo alcune carte del set (carte = [id], scelte quando lo crei). Si comportano allo stesso
// modo, ognuno con le sue carte. Un set studiato che non ha argomenti con flashcard riceve la sua riga del set.
// Riga del set (delSet): ogni set con flashcard ha la sua riga, aggiornata dallo studio (registraSessione):
// - finita una sessione in cui hai valutato tutte le carte del set: N° Rep +1 e ultimo ripasso = oggi (al massimo una
//   volta al giorno); se ne hai valutate solo una parte, la fine della sessione chiede se segnarlo lo stesso;
// - il ripasso delle sole carte "da sistemare" (mai valutate, Ok, Scarso) e quello delle singole carte non contano
//   (se le carte da sistemare sono tutte, per esempio al primo ripasso, non si chiede niente ed è un ripasso vero);
// - lo stato viene dalle valutazioni delle carte (statoDaCarte): una Scarso → Scarso; se no una Ok → Ok; se no più
//   dell'80% Perfetto → Ottimo; se no Buono. Se c'è anche una carta mai valutata: Incompleto;
// - i materiali collegati vengono dalle carte (mappa o fonte della risposta), tranne quelli tolti a mano.
// Il pulsante Ripasso della riga fa partire lo studio del set (chiede se solo le carte da sistemare o tutto).
//
// Le singole flashcard hanno la stessa ripetizione (js/srs.js). Pannello "Per flashcard": le carte che non vanno al
// passo con il loro argomento (carteDevianti): mai valutate, con la prossima revisione prima della sua o con un
// N° Rep diverso dal suo (anche più alto, per esempio dopo aver cambiato a mano il N° Rep dell'argomento).
// Una carta mai valutata di un set già ripassato è come una Scarso: da ripassare subito (dovutaDal), dal giorno in cui
// è entrata nel set o dall'ultimo ripasso del set se c'era già, e in ritardo i giorni dopo, finché non la valuti.
// Le carte dei set mai ripassati restano semplicemente nuove.
//
// La tabella si modifica sul posto. La usano la sezione Revisioni (tutti gli argomenti, si può anche cambiare
// il set di una riga) e la pagina di ogni set (solo gli argomenti di quel set e dei suoi sotto-set).
// Le colonne si allargano trascinando il bordo destro dell'intestazione (doppio clic: larghezza predefinita);
// le larghezze valgono per tutte le tabelle e restano in questo browser. Se una colonna è stretta il testo va
// a capo: nome e fonte sono campi a più righe, set, data e stato mostrano il valore come testo con sopra il
// controllo vero, trasparente (cliccando si apre il menu o il calendario).

const Revisioni = (() => {
    const STATI = {
        ottimo: { nome: 'Ottimo', classe: 'perfetto' },
        buono: { nome: 'Buono', classe: 'buono' },
        ok: { nome: 'Ok', classe: 'ok' },
        scarso: { nome: 'Scarso', classe: 'scarso' },
        incompleto: { nome: 'Incompleto', classe: 'incompleto' },
    };
    const SOGLIA_OTTIMO = 0.8;   // più dell'80% delle carte Perfetto → Ottimo
    const ico = (...a) => Ui.ico(...a);

    // ---- Formule ---------------------------------------------------------------------

    function intervallo(a) { return Srs.intervallo(a.ripetizioni); }

    // Le voci del pannello delle flashcard ({ carta, … }) seguono la formula della carta (js/srs.js: Scarso è da rifare
    // subito) e, se la carta non è mai stata valutata, il giorno da cui è dovuta
    function prossima(a) {
        if (a.carta) { const d = dovutaDal(a.carta); return d ? daChiaveGiorno(d) : Srs.prossima(a.carta); }
        return a.ultimoRipasso ? aggiungiGiorni(daChiaveGiorno(a.ultimoRipasso), intervallo(a)) : null;
    }

    function giorniMancanti(a, ora = Date.now()) {
        const p = prossima(a);
        return p == null ? null : giorniTra(ora, p);
    }

    function avviso(a) {
        const g = giorniMancanti(a);
        if (g == null) return { tipo: 'mai', testo: 'Mai ripassato' };
        if (g < 0) return { tipo: 'scaduto', testo: `Da ripassare (${plurale(-g, 'giorno', 'giorni')})` };
        if (g === 0) return { tipo: 'oggi', testo: 'Ripassare oggi' };
        return { tipo: 'attesa', testo: `Attendi ${plurale(g, 'giorno', 'giorni')}` };
    }

    function daRipassare(a) { const g = giorniMancanti(a); return g != null && g <= 0; }

    function dataBreve(ts) { const d = new Date(ts); return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; }
    // Nella tabella le date vanno a capo dopo le barre, non a metà numero
    const aCapoDate = testo => testo.replace(/\//g, '/<wbr>');

    // Più urgenti prima: in ritardo da più tempo, poi oggi, poi i più vicini; i mai ripassati in fondo
    function perUrgenza(a, b) {
        const ga = giorniMancanti(a), gb = giorniMancanti(b);
        if (ga == null || gb == null) return (ga == null) - (gb == null);
        return ga - gb;
    }

    function conteggi(lista) {
        const c = { scaduto: 0, oggi: 0, attesa: 0, mai: 0, totale: lista.length };
        lista.forEach(a => { c[avviso(a).tipo]++; });
        return c;
    }

    function quanteDaRipassare() { return Dati.tuttiGliArgomenti().filter(daRipassare).length + carteDevianti().filter(cartaDaRipassare).length; }

    // Una flashcard per conto suo è da ripassare se è scaduta o se non è mai stata valutata
    function cartaDaRipassare(v) { return Srs.daRipassare(v.carta) || !!dovutaDal(v.carta); }

    function maiValutata(v) { return Srs.stato(v.carta) === 'nuova'; }

    // L'argomento già ripassato almeno una volta a cui la carta appartiene: prima quelli con alcune carte, poi la riga
    // del set
    function argomentoDi(c) {
        if (!c) return null;
        const righe = Dati.argomentiDiSet(c.setId).filter(a => automatico(a) && a.ultimoRipasso && (a.ripetizioni || 0) > 0);
        return righe.find(a => Array.isArray(a.carte) && a.carte.includes(c.id)) || righe.find(a => !Array.isArray(a.carte)) || null;
    }

    // Carta mai valutata di un set già ripassato: da ripassare dal giorno in cui è entrata nel set, o dall'ultimo
    // ripasso del set se c'era già (allora quel ripasso l'ha saltata). Restituisce "AAAA-MM-GG" o null
    function dovutaDal(c) {
        if (!c || Srs.stato(c) !== 'nuova' || (c.srs && c.srs.allineata)) return null;
        const a = argomentoDi(c);
        if (!a) return null;
        const entrata = chiaveGiorno(c.creata || Date.now());
        return entrata > a.ultimoRipasso ? entrata : a.ultimoRipasso;
    }

    function nuovaDaRipassare(c, ora = Date.now()) { const d = dovutaDal(c); return !!d && d <= chiaveGiorno(ora); }

    // ---- Riga del set e stato dalle carte ------------------------------------------------

    // Le carte che contano per il set: le sue (non dei sotto-set), senza i dettagli nascosti
    function carteDelSet(setId) { return Dati.carteDiSet(setId); }

    function statoDaCarte(carte) {
        if (!carte.length) return '';
        const v = carte.map(Srs.valutazione);
        if (v.some(x => x == null)) return 'incompleto';
        if (v.includes(Srs.SCARSO)) return 'scarso';
        if (v.includes(Srs.OK)) return 'ok';
        return v.filter(x => x === Srs.PERFETTO).length / v.length > SOGLIA_OTTIMO ? 'ottimo' : 'buono';
    }

    // Argomento con le flashcard: la riga del set o un argomento con alcune carte scelte
    function automatico(a) { return !!a && (a.delSet || Array.isArray(a.carte)); }

    // Le flashcard di un argomento (null = argomento senza flashcard, il ripasso si segna a mano)
    function carteDi(a) {
        if (!automatico(a) || !Dati.set(a.setId)) return null;
        if (!Array.isArray(a.carte)) return carteDelSet(a.setId);
        const scelte = new Set(a.carte);
        return carteDelSet(a.setId).filter(c => scelte.has(c.id));
    }

    function conCarte(a) { const c = carteDi(a); return !!c && c.length > 0; }

    // Lo stato mostrato: gli argomenti con le flashcard lo prendono dalle carte, gli altri tengono quello scritto
    function statoDi(a) {
        const carte = carteDi(a);
        if (carte && carte.length) { const s = statoDaCarte(carte); if (s) return s; }
        return a.stato || '';
    }

    // La riga che rappresenta il set: quella già sua, oppure quella con il nome del set, oppure l'unica del set
    // (mai un argomento con solo alcune carte)
    function rigaDelSet(setId) {
        const righe = Dati.argomentiDiSet(setId).filter(a => !Array.isArray(a.carte));
        const s = Dati.set(setId);
        const nome = x => String(x || '').trim().toLowerCase();
        return righe.find(a => a.delSet) || (s && righe.find(a => nome(a.nome) === nome(s.nome))) || (righe.length === 1 ? righe[0] : null);
    }

    // Per lo studio: la riga del set, presa in carico o creata
    function rigaPerStudio(setId) {
        const a = rigaDelSet(setId);
        if (a) { if (!a.delSet) Dati.aggiornaArgomento(a.id, { delSet: true }); return a; }
        return Dati.creaArgomento({ setId, nome: Dati.set(setId).nome, delSet: true });
    }

    // Materiali da cui vengono le risposte: la mappa collegata (il suo materiale) e la fonte
    function fontiDelleCarte(carte) {
        const ids = new Set();
        carte.forEach(c => {
            if (c.fonte && c.fonte.materiale && Dati.materiale(c.fonte.materiale)) ids.add(c.fonte.materiale);
            if (c.mappa && c.mappa.id) { const m = Materiali.materialeDiMappa(c.mappa.id); if (m) ids.add(m.id); }
        });
        return [...ids];
    }

    function aggiungiFonti(a, carte) {
        const nuove = fontiDelleCarte(carte).filter(id => !(a.materialeIds || []).includes(id) && !(a.fontiTolte || []).includes(id));
        if (nuove.length) Dati.aggiornaArgomento(a.id, { materialeIds: [...(a.materialeIds || []), ...nuove] });
    }

    // ---- Fine di una sessione di studio ------------------------------------------------

    // valutate: Map cartaId → prima valutazione della sessione. parziale = ripasso delle sole carte da sistemare,
    // perCarta = ripasso dal pannello delle flashcard: N° Rep dei set non cambia.
    // Restituisce per ogni set studiato { setId, argomentoId, esito, fatte, totale }, esito =
    // 'rep' (ripasso segnato) | 'oggi' (già segnato oggi) | 'parziale' | 'da-chiedere' (non tutte le carte valutate)
    // Ogni argomento con flashcard di cui hai valutato almeno una carta ha il suo esito; un set senza argomenti con
    // flashcard riceve la sua riga del set
    async function registraSessione({ valutate, parziale = false, perCarta = false }) {
        const setIds = [...new Set([...valutate.keys()].map(Dati.carta).filter(c => c && Dati.set(c.setId)).map(c => c.setId))];
        if (!setIds.length) return [];
        const oggi = chiaveGiorno();
        const esiti = [];
        await Storia.esegui(perCarta ? 'Revisioni delle flashcard aggiornate' : `Revisioni aggiornate dopo lo studio (${plurale(setIds.length, 'set', 'set')})`, () => {
            setIds.forEach(setId => {
                let argomenti = Dati.argomentiDiSet(setId).filter(automatico);
                if (!argomenti.length) argomenti = [rigaPerStudio(setId)];
                argomenti.forEach(a => {
                    const carte = carteDi(a) || [];
                    const fatte = carte.filter(c => valutate.has(c.id)).length;
                    if (!fatte) return;
                    // I materiali sono un di più: se qualcosa va storto lì, il ripasso si segna lo stesso
                    try { aggiungiFonti(a, carte); } catch (e) { console.error(e); }
                    // Il ripasso delle sole carte da sistemare conta se erano tutte (per esempio al primo ripasso)
                    let esito;
                    if (perCarta || (parziale && fatte < carte.length)) esito = 'parziale';
                    else if (fatte < carte.length) esito = 'da-chiedere';
                    else if (a.ultimoRipasso === oggi && (a.storico || []).some(x => x.giorno === oggi)) esito = 'oggi';
                    else { Dati.segnaRipasso(a.id, statoDi(a)); esito = 'rep'; }
                    esiti.push({ setId, argomentoId: a.id, esito, fatte, totale: carte.length });
                });
            });
        });
        return esiti;
    }

    // Ripasso segnato lo stesso dopo una sessione che non ha valutato tutte le carte del set
    async function segnaComunque(argomentoId) {
        const a = Dati.argomento(argomentoId);
        if (!a) return null;
        if (a.ultimoRipasso === chiaveGiorno() && (a.storico || []).some(x => x.giorno === a.ultimoRipasso)) return a;
        await Storia.esegui(`«${a.nome || 'Argomento'}» ripassato: prossima revisione tra ${plurale(intervallo({ ripetizioni: (a.ripetizioni || 0) + 1 }), 'giorno', 'giorni')}`,
            () => Dati.segnaRipasso(a.id, statoDi(a)));
        return Dati.argomento(argomentoId);
    }

    // Testo per la fine della sessione
    function descriviEsito(e) {
        const a = Dati.argomento(e.argomentoId);
        const st = a ? STATI[statoDi(a)] : null;
        const stato = st ? ` · stato <span class="pill-stato stato-${st.classe}">${st.nome}</span>` : '';
        switch (e.esito) {
            case 'rep': return `Ripasso n° ${a.ripetizioni} segnato · prossima revisione ${esc(distanzaGiorni(prossima(a)))}${stato}`;
            case 'oggi': return `Ripasso già segnato oggi: aggiornato solo lo stato${stato}`;
            case 'parziale': return `Ripasso di alcune carte: N° Rep invariato${stato}`;
            default: return `Hai valutato ${e.fatte} carte su ${e.totale}: non lo segno come ripasso${stato}`;
        }
    }

    // ---- Avvio del ripasso dalla riga --------------------------------------------------

    // Carte "da sistemare": mai valutate, Ok o Scarso
    function daSistemare(c) { const v = Srs.valutazione(c); return v == null || v <= Srs.OK; }

    async function avviaRipasso(a) {
        const carte = carteDi(a) || [];
        if (!carte.length) return;
        const etichettaTutte = Array.isArray(a.carte) ? `Tutte e ${carte.length}` : `Tutto il set (${carte.length})`;
        const titolo = a.nome || (Dati.set(a.setId) || {}).nome || 'Set';
        const tutto = () => Viste.studio.avvia({ setIds: [a.setId], ids: carte.map(c => c.id), titolo, ritorno: Router.corrente.replace(/^#/, '') });
        const sistemare = carte.filter(daSistemare);
        // Niente da scegliere se nessuna è da sistemare o se lo sono tutte (al primo ripasso sono tutte mai valutate)
        if (!sistemare.length || sistemare.length === carte.length) { tutto(); return; }
        const conta = k => sistemare.filter(c => Srs.categoria(c) === k).length;
        const pezzi = [[conta('nuova'), 'mai valutata', 'mai valutate'], [conta('ok'), 'Ok', 'Ok'], [conta('scarso'), 'Scarso', 'Scarso']]
            .filter(([n]) => n).map(([n, uno, piu]) => `${n} ${n === 1 ? uno : piu}`);
        Ui.modale({
            titolo: `Ripasso di «${esc(titolo)}»`, classe: 'modale-piccola',
            corpo: `<p>${sistemare.length === 1 ? "C'è" : 'Ci sono'} <b>${plurale(sistemare.length, 'carta da sistemare', 'carte da sistemare')}</b> (${pezzi.join(', ')}).</p>
                <p class="nota">Ripassando solo quelle si aggiorna lo stato, non il N° Rep. Ripassarle tutte conta come ripasso.</p>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: `Solo quelle (${sistemare.length})`, classe: 'btn-secondario', clic: m => {
                    m.chiudi();
                    Viste.studio.avvia({ setIds: [a.setId], ids: sistemare.map(c => c.id), titolo: `${titolo} · da sistemare`, ritorno: Router.corrente.replace(/^#/, ''), parziale: true });
                } },
                { testo: etichettaTutte, classe: 'btn-primario', principale: true, clic: m => { m.chiudi(); tutto(); } },
            ],
        });
    }

    // ---- Flashcard che vanno per conto loro --------------------------------------------

    // Una carta di un argomento già ripassato almeno una volta che non è mai stata valutata, che ha la prossima
    // revisione prima di quella dell'argomento o un N° Rep diverso dal suo: non va al passo con l'argomento. Torna con
    // lui quando ha il suo stesso N° Rep e la sua revisione non cade prima (o subito, con "Riadegua al set").
    // Il N° Rep conta e non la data esatta: una carta ripassata il giorno dopo il set è comunque al passo.
    // Ogni carta diventa { carta, argomento, ripetizioni, ultimoRipasso } per le formule delle righe.
    function carteDevianti({ materiaId = null } = {}) {
        const out = [];
        Dati.tuttiGliArgomenti().filter(a => automatico(a) && a.ultimoRipasso && (a.ripetizioni || 0) > 0)
            .filter(a => { const s = Dati.set(a.setId); return s && (!materiaId || s.materiaId === materiaId); })
            .forEach(a => {
                const delSet = chiaveGiorno(prossima(a));
                const repSet = a.ripetizioni || 0;
                (carteDi(a) || []).forEach(c => {
                    if (argomentoDi(c) !== a) return;
                    const p = Srs.prossima(c);
                    const rep = (c.srs && c.srs.rep) || 0;
                    if ((Srs.valutazione(c) == null && !(c.srs && c.srs.allineata)) || !p || chiaveGiorno(p) < delSet || rep !== repSet) {
                        out.push({ carta: c, argomento: a, ripetizioni: (c.srs && c.srs.rep) || 0, ultimoRipasso: (c.srs && c.srs.giorno) || null });
                    }
                });
            });
        return out;
    }

    function avviaRipassoCarte(voci, titolo) {
        if (!voci.length) return;
        const carte = voci.map(v => v.carta);
        Viste.studio.avvia({
            setIds: [...new Set(carte.map(c => c.setId))], ids: carte.map(c => c.id),
            titolo: titolo || (carte.length === 1 ? 'Flashcard da ripassare' : `${carte.length} flashcard da ripassare`), ritorno: Router.corrente.replace(/^#/, ''), perCarta: true,
        });
    }

    function etichettaAvviso(a, conIcona = true) {
        const v = avviso(a);
        return `<span class="avviso-rev avviso-${v.tipo}">${conIcona ? '<i></i>' : ''}${esc(v.testo)}</span>`;
    }

    // ---- Tabella -------------------------------------------------------------------------

    const COLONNE = [
        { col: 'nome', ordina: 'nome', testo: 'Argomento', icona: 'documento' },
        { col: 'set', testo: 'Set', icona: 'cartella', conSet: true },
        { col: 'fonte', testo: 'Schema / fonte', icona: 'elenco' },
        { col: 'num', ordina: 'ripetizioni', testo: 'N° Rep', icona: 'elenco-num' },
        { col: 'data', ordina: 'ultimo', testo: 'Ultimo ripasso', icona: 'calendario' },
        { col: 'prossima', ordina: 'prossima', testo: 'Prossima revisione', icona: 'orologio' },
        { col: 'avviso', ordina: 'avviso', testo: 'Alert', icona: 'avviso' },
        { col: 'stato', ordina: 'stato', testo: 'Stato', icona: 'obiettivo' },
        { col: 'azioni', testo: 'Ripasso' },
    ];
    const LARGHEZZE_PREDEFINITE = { nome: 220, set: 170, fonte: 150, num: 64, data: 134, prossima: 98, avviso: 172, stato: 116, azioni: 80 };
    const LARGHEZZA_MIN = 48, LARGHEZZA_MAX = 700;
    const CHIAVE_LARGHEZZE = 'flashcard-colonne-revisioni';

    function larghezze() {
        let salvate = {};
        try { salvate = JSON.parse(localStorage.getItem(CHIAVE_LARGHEZZE) || '{}') || {}; } catch (e) { /* predefinite */ }
        return { ...LARGHEZZE_PREDEFINITE, ...salvate };
    }

    function salvaLarghezza(col, px) {
        const l = larghezze();
        if (px == null) delete l[col]; else l[col] = px;
        const diverse = Object.fromEntries(Object.entries(l).filter(([k, v]) => v !== LARGHEZZE_PREDEFINITE[k]));
        try { localStorage.setItem(CHIAVE_LARGHEZZE, JSON.stringify(diverse)); } catch (e) { /* resta per questa pagina */ }
    }

    function ripristinaLarghezze() {
        try { localStorage.removeItem(CHIAVE_LARGHEZZE); } catch (e) { /* niente da togliere */ }
    }

    function colonne(op) { return COLONNE.filter(c => !c.conSet || op.colonnaSet); }

    const COLONNE_ORDINABILI = {
        nome: (a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }),
        ripetizioni: (a, b) => (a.ripetizioni || 0) - (b.ripetizioni || 0),
        ultimo: (a, b) => (a.ultimoRipasso || '').localeCompare(b.ultimoRipasso || ''),
        prossima: perUrgenza,
        avviso: perUrgenza,
        stato: (a, b) => Object.keys(STATI).indexOf(statoDi(a)) - Object.keys(STATI).indexOf(statoDi(b)),
    };
    const ordinamenti = new Map();   // chiave della tabella → { colonna, verso }

    function nomeSet(setId, conMateria) {
        const s = Dati.set(setId);
        if (!s) return '?';
        const m = conMateria ? Dati.materia(s.materiaId) : null;
        return (m ? m.emoji + ' ' : '') + s.nome;
    }

    function dataLunga(chiave) { return chiave ? aCapoDate(chiave.split('-').reverse().join('/')) : ''; }

    function pillStato(a) {
        const v = STATI[statoDi(a)];
        return `<span class="pill-stato stato-${v ? v.classe : 'vuoto'}" data-pill-stato>${v ? v.nome : '—'}</span>`;
    }

    // Il pulsante della colonna Ripasso: con le flashcard fa partire lo studio, senza segna il ripasso a mano
    function pulsanteRipasso(a) {
        const fatto = a.ultimoRipasso === chiaveGiorno();
        return conCarte(a)
            ? `<button type="button" class="btn-ripassato con-studio${fatto ? ' fatto' : ''}" data-rev="ripassa"
                title="${fatto ? 'Ripassato oggi · ' : ''}Ripassa le flashcard ${Array.isArray(a.carte) ? "dell'argomento" : 'del set'}" aria-label="Ripassa">${ico(fatto ? 'spunta' : 'fulmine')}</button>`
            : `<button type="button" class="btn-ripassato${fatto ? ' fatto' : ''}" data-rev="ripassato"
                title="${fatto ? 'Ripassato oggi' : 'Ripassato: N° Rep +1 e Ultimo ripasso = oggi'}" aria-label="Ripassato">${ico('spunta')}</button>`;
    }

    function chipMateriali(a) {
        return (a.materialeIds || []).map(Dati.materiale).filter(Boolean).map(mat =>
            `<button type="button" class="chip chip-primario chip-fonte" data-rev="apri-fonte" data-materiale="${mat.id}" title="Apri «${esc(mat.nome)}»">${ico(Materiali.TIPI[mat.tipo] ? Materiali.TIPI[mat.tipo].icona : 'documento')}<span>${esc(mat.nome)}</span></button>`).join('');
    }

    function rigaHtml(a, op) {
        const s = Dati.set(a.setId);
        const conMateriali = (a.materialeIds || []).some(id => Dati.materiale(id));
        const oggi = chiaveGiorno();
        const p = prossima(a);
        return `
            <tr data-id="${a.id}" class="${avviso(a).tipo === 'scaduto' ? 'scaduto' : ''}">
                <td class="col-nome"><textarea class="campo-rev cella-nome" rows="1" data-campo="nome" placeholder="Argomento" aria-label="Argomento">${esc(a.nome)}</textarea>
                    ${Array.isArray(a.carte) && s ? `<button type="button" class="chip chip-tenue chip-carte-arg" data-rev="scegli-carte" title="Scegli le flashcard dell'argomento">${ico('carte')}${(carteDi(a) || []).length} di ${carteDelSet(a.setId).length} flashcard</button>` : ''}</td>
                ${op.colonnaSet ? `<td class="col-set">${op.setModificabile
                    ? `<label class="sovrapposto"><span class="testo-sovrapposto">${esc(s ? s.nome : '?')}</span>
                        <select class="controllo-sovrapposto" data-campo="setId" aria-label="Set">${Ui.opzioniSet(a.setId)}</select></label>`
                    : `<a class="link-set" href="#/set/${a.setId}">${esc(s ? s.nome : '?')}</a>`}</td>` : ''}
                <td class="col-fonte">
                    <div class="cella-fonte">
                        ${chipMateriali(a)}
                        <textarea class="campo-rev" rows="1" data-campo="fonte" placeholder="${conMateriali ? '' : '—'}" aria-label="Schema o fonte">${esc(a.fonte || '')}</textarea>
                        <button type="button" class="btn-icona mini" data-rev="collega-fonte" title="Collega o togli i materiali">${ico('collega')}</button>
                    </div>
                </td>
                <td class="col-num"><input class="campo-rev cella-num" type="number" min="0" step="1" data-campo="ripetizioni" value="${a.ripetizioni || 0}" aria-label="N° Rep"></td>
                <td class="col-data"><label class="sovrapposto"><span class="testo-sovrapposto" data-testo-data>${a.ultimoRipasso ? dataLunga(a.ultimoRipasso) : '<span class="tenue">—</span>'}</span>
                    <input class="controllo-sovrapposto" type="date" data-campo="ultimoRipasso" value="${a.ultimoRipasso || ''}" max="${oggi}" aria-label="Ultimo ripasso"></label></td>
                <td class="col-prossima" data-calcolato="prossima" title="${p ? esc(formattaData(p)) : ''}">${p ? aCapoDate(dataBreve(p)) : '<span class="tenue">—</span>'}</td>
                <td class="col-avviso" data-calcolato="avviso">${etichettaAvviso(a)}</td>
                <td class="col-stato">
                    ${conCarte(a)
                        ? `<span class="sovrapposto stato-dalle-carte" title="Dalle valutazioni delle sue flashcard: per cambiarlo cambia la valutazione delle carte">${pillStato(a)}</span>`
                        : `<label class="sovrapposto">${pillStato(a)}
                        <select class="controllo-sovrapposto" data-campo="stato" aria-label="Stato">
                            <option value="">—</option>
                            ${Object.entries(STATI).map(([k, v]) => `<option value="${k}" ${a.stato === k ? 'selected' : ''}>${v.nome}</option>`).join('')}
                        </select></label>`}
                </td>
                <td class="col-azioni">
                    ${pulsanteRipasso(a)}
                    <button type="button" class="btn-icona" data-rev="menu" aria-label="Altre azioni">${ico('altro')}</button>
                </td>
            </tr>`;
    }

    function intestazione(op, ord) {
        return `<tr>${colonne(op).map(c => {
            const attivo = c.ordina && ord.colonna === c.ordina;
            const etichetta = `${c.icona ? ico(c.icona) : ''}${c.testo}`;
            return `<th class="col-${c.col}">
                ${c.ordina ? `<button type="button" class="th-ordina${attivo ? ' attivo' : ''}" data-ordina="${c.ordina}">${etichetta}${attivo ? ico(ord.verso > 0 ? 'giu' : 'su', 'freccia-ordine') : ''}</button>`
                    : `<span class="th-testo">${etichetta}</span>`}
                <span class="maniglia-colonna" data-maniglia="${c.col}" title="Trascina per cambiare la larghezza · doppio clic per tornare a quella predefinita"></span>
            </th>`;
        }).join('')}</tr>`;
    }

    function colgroup(op) {
        const l = larghezze();
        return `<colgroup>${colonne(op).map(c => `<col data-col="${c.col}" style="width:${l[c.col]}px">`).join('')}</colgroup>`;
    }

    function larghezzaTabella(op) { const l = larghezze(); return colonne(op).reduce((n, c) => n + l[c.col], 0); }

    // opzioni: { chiave, argomenti: () => [], colonnaSet, setModificabile, nuovo: async () => argomento | null,
    //            vuoto: html quando non ci sono righe, dopo: () => void dopo ogni modifica }
    function monta(contenitore, opzioni) {
        const op = { colonnaSet: false, setModificabile: false, vuoto: '', dopo: () => {}, ...opzioni };
        if (!ordinamenti.has(op.chiave)) ordinamenti.set(op.chiave, { colonna: null, verso: 1 });

        const righe = () => {
            const lista = op.argomenti();
            const ord = ordinamenti.get(op.chiave);
            if (!ord.colonna) return lista;
            return [...lista].sort((a, b) => COLONNE_ORDINABILI[ord.colonna](a, b) * ord.verso);
        };

        const disegna = (fuoco = null) => {
            const lista = righe();
            contenitore.innerHTML = lista.length ? `
                <div class="tabella-scorrevole riquadro riquadro-tabella">
                    <table class="tabella-revisioni" style="width:${larghezzaTabella(op)}px">
                        ${colgroup(op)}
                        <thead>${intestazione(op, ordinamenti.get(op.chiave))}</thead>
                        <tbody>${lista.map(a => rigaHtml(a, op)).join('')}</tbody>
                    </table>
                    ${op.nuovo ? `<button type="button" class="riga-nuova" data-rev="nuovo">${ico('piu')}Nuovo argomento</button>` : ''}
                </div>` : op.vuoto;
            adatta(contenitore);
            if (fuoco) {
                const campo = $(`tr[data-id="${fuoco}"] [data-campo="nome"]`, contenitore);
                if (campo) { campo.focus(); campo.select(); }
            }
        };

        // Dopo una modifica cambiano solo le colonne calcolate: il resto della riga (e il fuoco) restano
        const aggiornaCalcolate = id => {
            const a = Dati.argomento(id);
            const tr = $(`tr[data-id="${id}"]`, contenitore);
            if (!a || !tr) return;
            const p = prossima(a);
            const cella = $('[data-calcolato="prossima"]', tr);
            cella.innerHTML = p ? aCapoDate(dataBreve(p)) : '<span class="tenue">—</span>';
            cella.title = p ? formattaData(p) : '';
            $('[data-calcolato="avviso"]', tr).innerHTML = etichettaAvviso(a);
            tr.classList.toggle('scaduto', avviso(a).tipo === 'scaduto');
            const pill = $('[data-pill-stato]', tr);
            if (pill) pill.outerHTML = pillStato(a);
            $('[data-testo-data]', tr).innerHTML = a.ultimoRipasso ? dataLunga(a.ultimoRipasso) : '<span class="tenue">—</span>';
        };

        // I campi a più righe crescono con il testo (dove il browser non lo fa da solo)
        const crescono = CSS.supports && CSS.supports('field-sizing', 'content');
        const adatta = radice => {
            if (crescono) return;
            $$('textarea.campo-rev', radice).forEach(t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; });
        };
        contenitore.addEventListener('input', e => { if (e.target.matches('textarea.campo-rev')) adatta(e.target.parentNode); });

        // Data: il calendario si apre cliccando sul testo (il campo vero è trasparente sopra)
        contenitore.addEventListener('click', e => {
            const data = e.target.closest('input[type=date].controllo-sovrapposto');
            if (data && data.showPicker) { try { data.showPicker(); } catch (err) { /* il browser lo apre da sé */ } }
        });

        const cambiato = () => { op.dopo(); App.aggiornaPiede(); };

        contenitore.addEventListener('change', e => {
            const campo = e.target.closest('[data-campo]');
            const tr = campo && campo.closest('tr[data-id]');
            if (!tr) return;
            const id = tr.dataset.id;
            const nome = campo.dataset.campo;
            let valore = campo.value;
            if (nome === 'ultimoRipasso') valore = valore || null;
            if (nome === 'ultimoRipasso' && valore && valore > chiaveGiorno()) { Ui.toast("L'ultimo ripasso non può essere nel futuro", 'errore'); campo.value = Dati.argomento(id).ultimoRipasso || ''; return; }
            try {
                Dati.aggiornaArgomento(id, { [nome]: nome === 'ripetizioni' ? +valore : valore });
            } catch (err) { Ui.toast(err.message, 'errore'); return; }
            if (nome === 'setId') { disegna(); Ui.toast(`Spostato in «${nomeSet(valore)}»`, 'successo'); }
            else aggiornaCalcolate(id);
            cambiato();
        });

        // Larghezza delle colonne: si trascina la maniglia sul bordo destro dell'intestazione
        contenitore.addEventListener('pointerdown', e => {
            const maniglia = e.target.closest('[data-maniglia]');
            if (!maniglia || e.button !== 0) return;
            e.preventDefault();
            const col = maniglia.dataset.maniglia;
            const tabella = maniglia.closest('table');
            const colonna = $(`col[data-col="${col}"]`, tabella);
            const iniziale = larghezze()[col];
            const totale = parseFloat(tabella.style.width) || tabella.offsetWidth;
            const partenza = e.clientX;
            let attuale = iniziale;
            maniglia.setPointerCapture(e.pointerId);
            maniglia.classList.add('attiva');
            document.body.classList.add('ridimensiona-colonne');
            const muovi = ev => {
                attuale = Math.round(limita(iniziale + ev.clientX - partenza, LARGHEZZA_MIN, LARGHEZZA_MAX));
                colonna.style.width = attuale + 'px';
                tabella.style.width = (totale - iniziale + attuale) + 'px';
                adatta(tabella);
            };
            const fine = () => {
                maniglia.removeEventListener('pointermove', muovi);
                maniglia.classList.remove('attiva');
                document.body.classList.remove('ridimensiona-colonne');
                if (attuale !== iniziale) salvaLarghezza(col, attuale);
            };
            maniglia.addEventListener('pointermove', muovi);
            maniglia.addEventListener('pointerup', fine, { once: true });
            maniglia.addEventListener('pointercancel', fine, { once: true });
        });

        contenitore.addEventListener('dblclick', e => {
            const maniglia = e.target.closest('[data-maniglia]');
            if (!maniglia) return;
            salvaLarghezza(maniglia.dataset.maniglia, null);
            disegna();
        });

        contenitore.addEventListener('keydown', e => {
            // Invio conferma (nome e fonte vanno a capo da soli, non con Invio)
            if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.campo-rev')) { e.preventDefault(); e.target.blur(); }
        });

        contenitore.addEventListener('click', async e => {
            const ordina = e.target.closest('[data-ordina]');
            if (ordina) {
                const ord = ordinamenti.get(op.chiave);
                const col = ordina.dataset.ordina;
                // Clic ripetuti: crescente → decrescente → ordine originale
                if (ord.colonna !== col) Object.assign(ord, { colonna: col, verso: 1 });
                else if (ord.verso > 0) ord.verso = -1;
                else Object.assign(ord, { colonna: null, verso: 1 });
                disegna();
                return;
            }
            const b = e.target.closest('[data-rev]');
            if (!b) return;
            const tr = b.closest('tr[data-id]');
            const a = tr ? Dati.argomento(tr.dataset.id) : null;
            switch (b.dataset.rev) {
                case 'nuovo': {
                    const nuovo = await op.nuovo();
                    if (nuovo) { disegna(nuovo.id); cambiato(); }
                    break;
                }
                case 'ripassato': menuRipasso(b, a, () => { disegna(); cambiato(); }); break;
                case 'ripassa': if (a) avviaRipasso(a); break;
                case 'menu': menuRiga(b, a, op, () => { disegna(); cambiato(); }); break;
                case 'apri-fonte': if (b.dataset.materiale) Materiali.apriPredefinito(b.dataset.materiale); break;
                case 'collega-fonte': menuFonte(b, a, () => { disegna(); cambiato(); }); break;
                case 'scegli-carte': if (a && await modaleCarte(a)) { disegna(); cambiato(); } break;
            }
        });

        disegna();
        return { disegna };
    }

    // ---- Azioni sulle righe ------------------------------------------------------------

    function menuRipasso(ancora, a, dopo) {
        if (!a) return;
        const segna = async stato => {
            await Storia.esegui(`«${a.nome || 'Argomento'}» ripassato: prossima revisione tra ${plurale(intervallo({ ripetizioni: (a.ripetizioni || 0) + 1 }), 'giorno', 'giorni')}`,
                () => Dati.segnaRipasso(a.id, stato));
            dopo();
        };
        const fattoOggi = a.ultimoRipasso === chiaveGiorno() && (a.storico || []).length;
        const dalleCarte = conCarte(a);
        Ui.menu(ancora, [
            ...(dalleCarte ? [{ testo: 'Ripassato oggi (stato dalle carte)', icona: 'spunta', clic: () => segna(statoDi(a)) }]
                : [...Object.entries(STATI).filter(([k]) => k !== 'incompleto').map(([k, v]) => ({ testo: `Ripassato oggi · ${v.nome}`, icona: 'spunta', clic: () => segna(k) })),
                    { testo: 'Ripassato oggi (senza giudizio)', icona: 'spunta', clic: () => segna('') }]),
            fattoOggi && '-',
            fattoOggi && { testo: 'Annulla il ripasso di oggi', icona: 'annulla', clic: async () => {
                await Storia.esegui(`Ripasso di «${a.nome || 'Argomento'}» annullato`, () => Dati.annullaUltimoRipasso(a.id));
                dopo();
            } },
        ]);
    }

    // Materiali del set (e quelli già collegati da altri set): clic = collega o togli. Quelli tolti a mano
    // non tornano quando lo studio aggiunge le fonti delle carte
    function menuFonte(ancora, a, dopo) {
        if (!a) return;
        const collegati = (a.materialeIds || []).filter(id => Dati.materiale(id));
        const materiali = [...Dati.materialiDiSet(a.setId), ...collegati.map(Dati.materiale).filter(m => m.setId !== a.setId)];
        if (!materiali.length) { Ui.toast('Questo set non ha materiali da collegare: caricali o collegali nella pagina del set', 'info', 5000); return; }
        const alterna = m => {
            const dentro = collegati.includes(m.id);
            Dati.aggiornaArgomento(a.id, {
                materialeIds: dentro ? collegati.filter(id => id !== m.id) : [...collegati, m.id],
                fontiTolte: dentro ? [...new Set([...(a.fontiTolte || []), m.id])] : (a.fontiTolte || []).filter(id => id !== m.id),
            });
            dopo();
        };
        Ui.menu(ancora, [
            ...materiali.map(m => ({ testo: (collegati.includes(m.id) ? '✓ ' : '') + m.nome, icona: Materiali.TIPI[m.tipo] ? Materiali.TIPI[m.tipo].icona : 'documento', clic: () => alterna(m) })),
            collegati.length > 1 && '-',
            collegati.length > 1 && { testo: 'Togli tutti i materiali', icona: 'scollega', clic: () => {
                Dati.aggiornaArgomento(a.id, { materialeIds: [], fontiTolte: [...new Set([...(a.fontiTolte || []), ...collegati])] });
                dopo();
            } },
        ]);
    }

    function menuRiga(ancora, a, op, dopo) {
        if (!a) return;
        const conStudio = conCarte(a);
        Ui.menu(ancora, [
            op.colonnaSet && op.setModificabile && { testo: 'Apri il set', icona: 'cartella', clic: () => Router.vai('/set/' + a.setId) },
            Dati.set(a.setId) && { testo: "Flashcard dell'argomento…", icona: 'carte', clic: async () => { if (await modaleCarte(a)) dopo(); } },
            conStudio && { testo: 'Segna il ripasso a mano…', icona: 'spunta', clic: () => menuRipasso(ancora, a, dopo) },
            (a.storico || []).length && { testo: `Cronologia dei ripassi (${a.storico.length})`, icona: 'orologio', clic: () => cronologia(a) },
            (a.storico || []).length && { testo: "Annulla l'ultimo ripasso", icona: 'annulla', clic: async () => {
                await Storia.esegui(`Ultimo ripasso di «${a.nome || 'Argomento'}» annullato`, () => Dati.annullaUltimoRipasso(a.id));
                dopo();
            } },
            '-',
            { testo: 'Elimina', icona: 'cestino', pericolo: true, clic: async () => {
                if (!await Ui.conferma(`Elimini <b>${esc(a.nome || 'questo argomento')}</b> dalle revisioni? Le flashcard e i materiali non vengono toccati.`,
                    { titolo: "Eliminare l'argomento?", ok: 'Elimina', pericolo: true })) return;
                await Storia.esegui(`«${a.nome || 'Argomento'}» tolto dalle revisioni`, () => Dati.eliminaArgomento(a.id));
                dopo();
            } },
        ]);
    }

    function cronologia(a) {
        const voci = [...(a.storico || [])].reverse();
        Ui.modale({
            titolo: `Ripassi di «${a.nome || 'Argomento'}»`, classe: 'modale-piccola',
            corpo: `<div class="cronologia-rev">${voci.map((v, i) => `
                <div class="voce-cronologia">
                    <span class="numero-rep">${voci.length - i}</span>
                    <span>${esc(formattaData(daChiaveGiorno(v.giorno)))}</span>
                    ${STATI[v.stato] ? `<span class="pill-stato stato-${STATI[v.stato].classe}">${STATI[v.stato].nome}</span>` : ''}
                </div>`).join('')}</div>`,
            azioni: [{ testo: 'Chiudi', classe: 'btn-secondario' }],
        });
    }

    // ---- Flashcard di un argomento: tutte quelle del set o solo alcune -------------------------------

    // Dentro box: "Tutte le flashcard del set" / "Solo alcune", con l'elenco ad albero da spuntare (una domanda porta
    // con sé le sue figlie). iniziali = null (tutte) o [id]. Restituisce { valore() → null | [id] }
    function montaSceltaCarte(box, setId, iniziali = null) {
        const albero = Dati.alberoDiSet(setId);
        const scelte = new Set(iniziali || []);
        let alcune = Array.isArray(iniziali);
        const conta = () => { const c = $('[data-conta-carte]', box); if (c) c.textContent = `${scelte.size} di ${albero.length} scelte`; };
        const disegna = () => {
            box.innerHTML = `
                <div class="scelta-radio">
                    <label><input type="radio" name="carte-argomento" value="tutte" ${alcune ? '' : 'checked'}>
                        <span>Tutte le flashcard del set <small>(${albero.length}, e anche quelle che aggiungerai)</small></span></label>
                    <label><input type="radio" name="carte-argomento" value="alcune" ${alcune ? 'checked' : ''}><span>Solo alcune</span></label>
                </div>
                ${alcune ? (albero.length ? `
                <div class="scelta-set scelta-carte-arg">${albero.map(n => {
                    const t = testoDaHtml(n.carta.domanda);
                    return `<label class="voce-set" style="--livello:${n.livello}"><input type="checkbox" value="${n.carta.id}" ${scelte.has(n.carta.id) ? 'checked' : ''}>
                        <span title="${esc(t)}">${esc(t) || '(senza domanda)'}</span>${n.carta.tag.length ? `<small>${esc(n.carta.tag.join(', '))}</small>` : ''}</label>`;
                }).join('')}</div>
                <div class="azioni-riga azioni-scelta-set">
                    <button type="button" class="btn btn-fantasma btn-piccolo" data-carte-tutte="1">Seleziona tutte</button>
                    <button type="button" class="btn btn-fantasma btn-piccolo" data-carte-tutte="0">Nessuna</button>
                    <small class="conta-carte-arg" data-conta-carte></small>
                </div>` : '<p class="nota">Il set non ha ancora flashcard.</p>') : ''}`;
            conta();
        };
        box.addEventListener('change', e => {
            if (e.target.name === 'carte-argomento') { alcune = e.target.value === 'alcune'; disegna(); return; }
            const x = e.target.closest('.voce-set input');
            if (!x) return;
            [x.value, ...Dati.discendentiCarta(x.value)].forEach(id => {
                if (x.checked) scelte.add(id); else scelte.delete(id);
                const y = $(`.voce-set input[value="${id}"]`, box);
                if (y) y.checked = x.checked;
            });
            conta();
        });
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-carte-tutte]');
            if (!b) return;
            const si = b.dataset.carteTutte === '1';
            albero.forEach(n => { if (si) scelte.add(n.carta.id); else scelte.delete(n.carta.id); });
            $$('.voce-set input', box).forEach(x => { x.checked = si; });
            conta();
        });
        disegna();
        return { valore: () => (alcune ? albero.map(n => n.carta.id).filter(id => scelte.has(id)) : null) };
    }

    // Controlla la scelta prima di salvarla: almeno una carta, e una sola riga con tutte le carte per set.
    // Restituisce il messaggio d'errore o ''
    function erroreCarte(setId, carte, escludi = null) {
        if (Array.isArray(carte) && !carte.length) return 'Scegli almeno una flashcard, o «Tutte le flashcard del set»';
        if (carte == null) {
            const gia = Dati.argomentiDiSet(setId).find(a => a.id !== escludi && a.delSet && !Array.isArray(a.carte));
            if (gia) return `«${gia.nome || 'Argomento'}» ha già tutte le flashcard di questo set: scegli «Solo alcune», o cambia quello`;
        }
        return '';
    }

    // Cambia le flashcard di un argomento che c'è già (menu ⋯ della riga o etichetta "N di M flashcard")
    function modaleCarte(a) {
        return new Promise(risolvi => {
            let salvando = false, scelta = null;
            Ui.modale({
                titolo: `Flashcard di «${esc(a.nome || 'Argomento')}»`, classe: 'modale-piccola',
                corpo: `<p class="nota">Lo stato, il pulsante Ripasso e il N° Rep di questo argomento seguono le flashcard che scegli.</p><div data-carte-arg></div>`,
                alApri: el => { scelta = montaSceltaCarte($('[data-carte-arg]', el), a.setId, automatico(a) ? (Array.isArray(a.carte) ? a.carte : null) : null); },
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: 'Salva', classe: 'btn-primario', principale: true, clic: async m => {
                        const carte = scelta.valore();
                        const errore = erroreCarte(a.setId, carte, a.id);
                        if (errore) { Ui.toast(errore, 'errore', 6000); return; }
                        salvando = true;
                        m.chiudi();
                        await Storia.esegui(`Flashcard di «${a.nome || 'Argomento'}» cambiate`, () => Dati.aggiornaArgomento(a.id, { carte, delSet: carte == null }));
                        risolvi(true);
                    } },
                ],
                alChiudere: () => { if (!salvando) risolvi(false); },
            });
        });
    }

    // Nuovo argomento: set (scelto, o fisso dalla pagina del set), nome e flashcard (tutte quelle del set o solo
    // alcune). materiaId limita la scelta del set a una materia
    function formNuovo({ materiaId = null, setId = null } = {}) {
        const sets = Dati.tuttiSet().filter(s => (!materiaId || s.materiaId === materiaId) && (!setId || s.id === setId));
        if (!sets.length) { Ui.toast('Prima crea un set: ogni argomento appartiene a un set', 'errore', 5000); return Promise.resolve(null); }
        return new Promise(risolvi => {
            let creato = null, scelta = null;
            const opzioni = Dati.materie().filter(m => !materiaId || m.id === materiaId).map(m => {
                const albero = Dati.alberoSet(m.id).filter(n => !setId || n.set.id === setId);
                return albero.length ? `<optgroup label="${esc(m.emoji + ' ' + m.nome)}">${albero.map(n =>
                    `<option value="${n.set.id}">${setId ? '' : Ui.rientroOpzione(n.livello)}${esc(n.set.nome)}</option>`).join('')}</optgroup>` : '';
            }).join('');
            Ui.modale({
                titolo: 'Nuovo argomento', classe: 'modale-piccola',
                corpo: `
                    <label class="campo"${setId ? ' hidden' : ''}><span>Set</span><select name="set">${opzioni}</select></label>
                    <label class="campo"><span>Argomento <em>di solito il nome del capitolo o dello schema</em></span>
                        <input type="text" name="nome" maxlength="160" autofocus></label>
                    <div class="campo"><span class="etichetta">Flashcard dell'argomento <em>contano per lo stato, il ripasso e il N° Rep</em></span>
                        <div data-carte-arg></div></div>`,
                alApri: el => {
                    const sceltaSet = $('[name=set]', el), nome = $('[name=nome]', el);
                    const proponi = () => { if (!nome.dataset.toccato) nome.value = (Dati.set(sceltaSet.value) || {}).nome || ''; };
                    // Un set che ha già la riga con tutte le carte parte da "Solo alcune"
                    const carte = () => {
                        const box = document.createElement('div');
                        $('[data-carte-arg]', el).replaceChildren(box);
                        scelta = montaSceltaCarte(box, sceltaSet.value, erroreCarte(sceltaSet.value, null) ? [] : null);
                    };
                    nome.addEventListener('input', () => { nome.dataset.toccato = '1'; });
                    sceltaSet.addEventListener('change', () => { proponi(); carte(); });
                    proponi();
                    carte();
                    nome.select();
                },
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: 'Aggiungi', classe: 'btn-primario', principale: true, clic: m => {
                        const set = $('[name=set]', m.el).value;
                        const carte = scelta.valore();
                        const errore = erroreCarte(set, carte);
                        if (errore) { Ui.toast(errore, 'errore', 6000); return; }
                        creato = Dati.creaArgomento({ setId: set, nome: $('[name=nome]', m.el).value, carte, delSet: carte == null });
                        m.chiudi();
                    } },
                ],
                alChiudere: () => risolvi(creato),
            });
        });
    }

    // Un argomento per ogni set che non ne ha ancora (per partire in fretta)
    async function unoPerOgniSet(sets) {
        const senza = sets.filter(s => !Dati.argomentiDiSet(s.id).length);
        if (!senza.length) { Ui.toast('Ogni set ha già almeno un argomento'); return 0; }
        await Storia.esegui(`${plurale(senza.length, 'argomento aggiunto', 'argomenti aggiunti')} alle revisioni`,
            () => senza.forEach(s => Dati.creaArgomento({ setId: s.id, nome: s.nome, delSet: true })));
        return senza.length;
    }

    // ---- Tabella delle flashcard per conto loro (pannello "Per flashcard") ------------------------

    const COLONNE_CARTE = [
        { col: 'carta', testo: 'Flashcard', icona: 'carte', larghezza: 300 },
        { col: 'set', testo: 'Set', icona: 'cartella', larghezza: 160 },
        { col: 'stato', testo: 'Valutazione', icona: 'obiettivo', larghezza: 122 },
        { col: 'num', testo: 'N° Rep', icona: 'elenco-num', larghezza: 64 },
        { col: 'data', testo: 'Ultimo ripasso', icona: 'calendario', larghezza: 134 },
        { col: 'prossima', testo: 'Prossima revisione', icona: 'orologio', larghezza: 98 },
        { col: 'avviso', testo: 'Alert', icona: 'avviso', larghezza: 172 },
        { col: 'azioni', testo: 'Ripasso', larghezza: 214 },
    ];

    // Mai valutate prima, poi le più urgenti
    // Più urgenti prima; a parità, le mai valutate
    function perUrgenzaCarte(a, b) {
        return perUrgenza(a, b) || (maiValutata(b) - maiValutata(a));
    }

    function pillValutazione(c) {
        const v = Srs.valutazione(c);
        return `<span class="pill-stato stato-${v == null ? 'vuoto' : Srs.VALUTAZIONI[v].chiave === 'perfetto' ? 'perfetto' : Srs.VALUTAZIONI[v].chiave}">${v == null ? 'Mai valutata' : Srs.VALUTAZIONI[v].nome}</span>`;
    }

    function rigaCartaHtml(v) {
        const c = v.carta;
        const p = prossima(v);
        const val = Srs.valutazione(c);
        const mai = !prossima(v);
        return `
            <tr data-id="${c.id}" class="${!mai && avviso(v).tipo === 'scaduto' ? 'scaduto' : ''}">
                <td class="col-carta"><a class="cella-carta" href="#/carta/${c.id}" title="Apri la flashcard">${esc(testoDaHtml(c.domanda)) || '<span class="tenue">(senza domanda)</span>'}</a></td>
                <td class="col-set"><a class="link-set" href="#/set/${c.setId}">${esc(nomeSet(c.setId))}</a></td>
                <td class="col-stato">
                    <label class="sovrapposto">${pillValutazione(c)}
                        <select class="controllo-sovrapposto" data-carta-campo="valutazione" aria-label="Valutazione">
                            <option value="" ${val == null ? 'selected' : ''}>Mai valutata</option>
                            ${Srs.VALUTAZIONI.map(x => `<option value="${x.valore}" ${val === x.valore ? 'selected' : ''}>${x.nome}</option>`).join('')}
                        </select></label>
                </td>
                <td class="col-num"><input class="campo-rev cella-num" type="number" min="0" step="1" data-carta-campo="rep" value="${v.ripetizioni}" aria-label="N° Rep"></td>
                <td class="col-data"><label class="sovrapposto"><span class="testo-sovrapposto">${v.ultimoRipasso ? dataLunga(v.ultimoRipasso) : '<span class="tenue">—</span>'}</span>
                    <input class="controllo-sovrapposto" type="date" data-carta-campo="giorno" value="${v.ultimoRipasso || ''}" max="${chiaveGiorno()}" aria-label="Ultimo ripasso"></label></td>
                <td class="col-prossima" title="${p ? esc(formattaData(p)) : ''}">${p ? aCapoDate(dataBreve(p)) : '<span class="tenue">—</span>'}</td>
                <td class="col-avviso">${mai ? '<span class="avviso-rev avviso-mai"><i></i>Mai ripassata</span>' : etichettaAvviso(v)}</td>
                <td class="col-azioni">
                    <button type="button" class="btn-ripassato con-studio${v.ultimoRipasso === chiaveGiorno() ? ' fatto' : ''}" data-carta-ripassa
                        title="Ripassa questa flashcard" aria-label="Ripassa">${ico(v.ultimoRipasso === chiaveGiorno() ? 'spunta' : 'fulmine')}</button>
                    <button type="button" class="btn btn-fantasma btn-piccolo btn-adegua" data-carta-adegua
                        title="Riadeguamento al set: prende N° Rep e ultimo ripasso del set (${esc(String(v.argomento.ripetizioni || 0))} rep) ed esce da questo elenco; la valutazione resta">${ico('sincronizza')}Riadegua al set</button>
                </td>
            </tr>`;
    }

    // opzioni: { voci: () => [voce di carteDevianti], vuoto: html quando non ci sono righe, dopo: () => void }
    function montaCarte(contenitore, opzioni) {
        const op = { vuoto: '', dopo: () => {}, ...opzioni };
        const larghezza = COLONNE_CARTE.reduce((n, c) => n + c.larghezza, 0);
        const voci = () => [...op.voci()].sort(perUrgenzaCarte);

        const disegna = () => {
            const lista = voci();
            contenitore.innerHTML = lista.length ? `
                <div class="tabella-scorrevole riquadro riquadro-tabella">
                    <table class="tabella-revisioni tabella-carte-rev" style="width:${larghezza}px">
                        <colgroup>${COLONNE_CARTE.map(c => `<col style="width:${c.larghezza}px">`).join('')}</colgroup>
                        <thead><tr>${COLONNE_CARTE.map(c => `<th class="col-${c.col}"><span class="th-testo">${c.icona ? ico(c.icona) : ''}${c.testo}</span></th>`).join('')}</tr></thead>
                        <tbody>${lista.map(rigaCartaHtml).join('')}</tbody>
                    </table>
                </div>` : op.vuoto;
        };

        contenitore.addEventListener('click', e => {
            const data = e.target.closest('input[type=date].controllo-sovrapposto');
            if (data && data.showPicker) { try { data.showPicker(); } catch (err) { /* il browser lo apre da sé */ } }
            const adegua = e.target.closest('[data-carta-adegua]');
            if (adegua) { riadegua(adegua.closest('tr[data-id]').dataset.id); return; }
            const b = e.target.closest('[data-carta-ripassa]');
            if (!b) return;
            const id = b.closest('tr[data-id]').dataset.id;
            const voce = op.voci().find(v => v.carta.id === id);
            if (voce) avviaRipassoCarte([voce]);
        });

        // Riadeguamento al set: la carta prende N° Rep e data del set ed esce dall'elenco (si annulla dall'avviso)
        const riadegua = async id => {
            const c = Dati.carta(id);
            const a = argomentoDi(c);
            if (!a) return;
            await Storia.esegui(`Flashcard riadeguata al set «${a.nome || nomeSet(c.setId)}»: N° Rep ${a.ripetizioni || 0}, prossima revisione con il set`,
                () => Dati.allineaAlSet([c]));
            disegna();
            op.dopo();
            App.aggiornaPiede();
        };

        contenitore.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.matches('.campo-rev')) { e.preventDefault(); e.target.blur(); }
        });

        contenitore.addEventListener('change', e => {
            const campo = e.target.closest('[data-carta-campo]');
            const tr = campo && campo.closest('tr[data-id]');
            if (!tr) return;
            const id = tr.dataset.id;
            const c = Dati.carta(id);
            if (!c) return;
            switch (campo.dataset.cartaCampo) {
                case 'valutazione': Dati.impostaValutazione([c], campo.value === '' ? null : +campo.value); break;
                case 'rep': Dati.aggiornaSrs(id, { rep: campo.value }); break;
                case 'giorno':
                    if (campo.value && campo.value > chiaveGiorno()) { Ui.toast("L'ultimo ripasso non può essere nel futuro", 'errore'); campo.value = (c.srs && c.srs.giorno) || ''; return; }
                    Dati.aggiornaSrs(id, { giorno: campo.value || null });
                    break;
            }
            disegna();
            op.dopo();
            App.aggiornaPiede();
        });

        disegna();
        return { disegna };
    }

    return {
        STATI, intervallo, prossima, giorniMancanti, avviso, daRipassare, perUrgenza, conteggi, quanteDaRipassare,
        etichettaAvviso, dataBreve, dataLunga, nomeSet, monta, formNuovo, unoPerOgniSet, ripristinaLarghezze,
        carteDelSet, statoDaCarte, statoDi, rigaDelSet, registraSessione, segnaComunque, descriviEsito,
        avviaRipasso, carteDevianti, cartaDaRipassare, maiValutata, argomentoDi, carteDi, automatico, dovutaDal, nuovaDaRipassare,
        avviaRipassoCarte, montaCarte, modaleCarte,
    };
})();
