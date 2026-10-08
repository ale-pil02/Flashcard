// Revisioni: spaced repetition degli argomenti, ricopiata dal database "Spaced Repetition System" di Notion.
//
// Ogni argomento (es. un capitolo o uno schema) ha N° Rep, Ultimo ripasso e Intervallo:
//   Prossima revisione = Ultimo ripasso + Intervallo
//   Alert = giorni tra la prossima revisione e oggi: < 0 "Da ripassare (N giorni)", 0 "Ripassare oggi", > 0 "Attendi N giorni"
// A ogni ripasso l'intervallo segue la sequenza delle impostazioni (Fibonacci: 1, 2, 3, 5, 8… giorni) e si adatta se
// ripassi in anticipo, in ritardo o lo stesso giorno (js/srs.js, dopoRipasso). Cambiando il N° Rep a mano l'intervallo
// torna quello della sequenza per quella rep.
// Lo Stato (Ottimo, Buono, Ok, Scarso, Incompleto) non cambia gli intervalli. N° Rep, ultimo ripasso, intervallo e
// prossima revisione si cambiano anche a mano nella tabella.
//
// Argomenti con le flashcard (carteDi): la riga del set (delSet, tutte le carte del set, anche quelle aggiunte dopo)
// oppure un argomento con solo alcune carte del set (carte = [id], scelte quando lo crei). Si comportano allo stesso
// modo, ognuno con le sue carte. Un set studiato che non ha argomenti con flashcard riceve la sua riga del set.
// Riga del set (delSet): ogni set con flashcard ha la sua riga, aggiornata dallo studio (registraSessione):
// - finita una sessione in cui hai valutato tutte le carte del set: N° Rep +1, ultimo ripasso e intervallo con la
//   formula (lo stesso giorno di un altro ripasso: solo N° Rep +1); se ne hai valutate solo una parte, la fine della
//   sessione chiede se segnarlo lo stesso. Le carte valutate Buono o Perfetto a quel ripasso prendono ultimo ripasso e
//   intervallo del set e restano al suo passo, tranne quelle che all'inizio della sessione erano nuove (mai valutate) o
//   Scarso: dopo un primo incontro o un errore servono intervalli corti, quindi seguono le loro regole come le Ok e
//   Scarso (js/srs.js);
// - il ripasso delle sole carte "da sistemare" (mai valutate, Ok, Scarso) e quello delle singole carte non contano per
//   il N° Rep del set, ma aggiornano le carte (se le carte da sistemare sono tutte, per esempio al primo ripasso, non si
//   chiede niente ed è un ripasso vero);
// - quando lo studio parte fuori dal giorno previsto (in anticipo, in ritardo o di nuovo lo stesso giorno) si chiede se
//   conta o se è un ripasso di prova, che non cambia niente (chiediSeConta);
// - lo stato viene dalle valutazioni delle carte (statoDaCarte): una Scarso → Scarso; se no una Ok → Ok; se no più
//   dell'80% Perfetto → Ottimo; se no Buono. Se c'è anche una carta mai valutata: Incompleto;
// - i materiali collegati vengono dalle carte (mappa o fonte della risposta), tranne quelli tolti a mano.
// Il pulsante Ripasso della riga fa partire lo studio del set (chiede se solo le carte da sistemare o tutto).
//
// Le singole flashcard hanno la stessa ripetizione (js/srs.js), con il loro N° Rep. Pannello "Per flashcard" (nella
// sezione Revisioni e nella pagina di ogni set): le carte che non vanno al passo con il loro argomento (carteDevianti):
// mai valutate o con una prossima revisione diversa dalla sua.
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

    function intervallo(a) { return Srs.intervalloDi(a.intervallo, a.ripetizioni); }

    // Testo "tra N giorni" per { intervallo, giorno } (js/srs.js, dopoRipasso)
    function quando(dopo) { return distanzaGiorni(aggiungiGiorni(daChiaveGiorno(dopo.giorno), dopo.intervallo)); }

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

    // Il prossimo esame della materia del set (Piano di studio) se la revisione p cade dopo di lui: { nome, data } o null
    function esamePrima(setId, p) {
        const s = Dati.set(setId);
        if (!s || !s.materiaId || p == null) return null;
        const giorno = chiaveGiorno(p);
        return Dati.prossimiEsami().find(e => e.materiaId === s.materiaId && e.data < giorno) || null;
    }

    const dataEsame = e => e.data.split('-').reverse().join('/');

    // Segno "dopo l'esame" accanto a una prossima revisione che cade dopo l'esame della materia
    function avvisoEsame(setId, p) {
        const e = esamePrima(setId, p);
        return e ? `<span class="dopo-esame" title="L'esame «${esc(e.nome)}» è il ${dataEsame(e)}: questa revisione cade dopo">${ico('avviso')}dopo l'esame</span>` : '';
    }

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

    // I mazzi (argomenti con le flashcard) già ripassati almeno una volta che contengono la carta: la riga del set e
    // quelli con alcune carte. Una carta ha una sola data, quindi ne segue uno solo (argomentoDi)
    function mazziDi(c) {
        if (!c) return [];
        return Dati.argomentiDiSet(c.setId).filter(a => automatico(a) && a.ultimoRipasso && (a.ripetizioni || 0) > 0
            && (!Array.isArray(a.carte) || a.carte.includes(c.id)));
    }

    // Il mazzo che la carta segue (si allinea a lui quando lo ripassi): quello scelto con "Riadegua" (c.srs.segue), se
    // no il primo con alcune carte che la contiene, se no la riga del set
    function argomentoDi(c) {
        const mazzi = mazziDi(c);
        const scelto = c && c.srs && c.srs.segue && mazzi.find(a => a.id === c.srs.segue);
        return scelto || mazzi.find(a => Array.isArray(a.carte)) || mazzi.find(a => !Array.isArray(a.carte)) || null;
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
    // perCarta = ripasso dal pannello delle flashcard: N° Rep dei set non cambia. nonAllineare = carte che all'inizio
    // della sessione erano nuove o Scarso: non prendono la data del set.
    // Restituisce per ogni set studiato { setId, argomentoId, esito, fatte, totale }, esito =
    // 'rep' (ripasso segnato) | 'oggi' (già segnato oggi) | 'parziale' | 'da-chiedere' (non tutte le carte valutate)
    // Ogni argomento con flashcard di cui hai valutato almeno una carta ha il suo esito; un set senza argomenti con
    // flashcard riceve la sua riga del set
    async function registraSessione({ valutate, parziale = false, perCarta = false, nonAllineare = new Set() }) {
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
                    let esito, stessoGiorno = false;
                    if (perCarta || (parziale && fatte < carte.length)) esito = 'parziale';
                    else if (fatte < carte.length) esito = 'da-chiedere';
                    else {
                        stessoGiorno = a.ultimoRipasso === oggi;
                        Dati.segnaRipasso(a.id, statoDi(a));
                        allineaValutate(a, carte, valutate, nonAllineare);
                        esito = 'rep';
                    }
                    esiti.push({ setId, argomentoId: a.id, esito, stessoGiorno, fatte, totale: carte.length });
                });
            });
        });
        return esiti;
    }

    // Dopo il ripasso del set che conta: le carte valutate Buono o Perfetto (alla prima valutazione della sessione)
    // prendono ultimo ripasso e intervallo del set e restano al suo passo. Non quelle in nonAllineare (nuove o Scarso
    // all'inizio della sessione): l'intervallo lungo del set sarebbe troppo per loro
    function allineaValutate(a, carte, valutate, nonAllineare = new Set()) {
        const bene = carte.filter(c => valutate.has(c.id) && valutate.get(c.id) >= Srs.BUONO && !nonAllineare.has(c.id) && argomentoDi(c) === a);
        if (bene.length) Dati.allineaAlSet(bene, a);
    }

    // Le carte che non prenderanno la data del set alla fine della sessione: nuove (mai valutate) o Scarso adesso
    function daNonAllineare(carte) {
        return new Set(carte.filter(c => { const v = Srs.valutazione(c); return v == null || v === Srs.SCARSO; }).map(c => c.id));
    }

    // Ripasso segnato lo stesso dopo una sessione che non ha valutato tutte le carte del set
    async function segnaComunque(argomentoId, valutate = new Map(), nonAllineare = new Set()) {
        const a = Dati.argomento(argomentoId);
        if (!a) return null;
        const dopo = Srs.dopoRipasso({ intervallo: intervallo(a), giorno: a.ultimoRipasso }, undefined, { esito: Srs.esitoDaStato(statoDi(a)) });
        await Storia.esegui(`«${a.nome || 'Argomento'}» ripassato: prossima revisione ${quando(dopo)}`, () => {
            Dati.segnaRipasso(a.id, statoDi(a));
            allineaValutate(a, carteDi(a) || [], valutate, nonAllineare);
        });
        return Dati.argomento(argomentoId);
    }

    // Testo per la fine della sessione
    function descriviEsito(e) {
        const a = Dati.argomento(e.argomentoId);
        const st = a ? STATI[statoDi(a)] : null;
        const stato = st ? ` · stato <span class="pill-stato stato-${st.classe}">${st.nome}</span>` : '';
        switch (e.esito) {
            case 'rep': {
                const esame = esamePrima(a.setId, prossima(a));
                return `Ripasso n° ${a.ripetizioni} segnato${e.stessoGiorno ? ' (era già stato ripassato oggi: la data non cambia)' : ''} · prossima revisione ${esc(distanzaGiorni(prossima(a)))}${esame ? ` <span class="dopo-esame">${ico('avviso')}dopo l'esame «${esc(esame.nome)}» del ${dataEsame(esame)}</span>` : ''}${stato}`;
            }
            case 'parziale': return `Ripasso di alcune carte: aggiornate le flashcard, N° Rep del set invariato${stato}`;
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
                <p class="nota">Ripassando solo quelle si aggiornano le flashcard e lo stato, non il N° Rep del set. Ripassarle tutte conta anche come ripasso del set.</p>`,
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

    // ---- Avvio dello studio: conta come ripasso o è una prova? -----------------------------

    // Se lo ripassi oggi e conta: { tra, il } della prossima revisione, per ogni esito possibile (js/srs.js, dopoRipasso)
    function esitiSeConta(a, oggi = chiaveGiorno()) {
        const st = { giorno: a.ultimoRipasso, intervallo: intervallo(a) };
        return Object.fromEntries(['perfetto', 'buono', 'male'].map(esito => {
            const x = Srs.dopoRipasso(st, oggi, { esito });
            const p = aggiungiGiorni(daChiaveGiorno(x.giorno), x.intervallo);
            return [esito, { tra: giorniTra(daChiaveGiorno(oggi), p), il: dataBreve(p) }];
        }));
    }

    // Com'è messa la sessione rispetto ai giorni previsti. Se è il ripasso completo di qualche set (ha tutte le sue carte e
    // non è il ripasso delle sole carte da sistemare o delle singole carte) contano i set: { a, tipo: 'mai' | 'puntuale' |
    // 'anticipo' | 'ritardo' | 'stesso-giorno', giorni, prevista, esiti }; le loro carte seguono le loro regole. Altrimenti
    // contano le carte: quelle con una data loro fuori giorno (flashcard) e i conti di quelle puntuali e senza data
    function situazioniAvvio(carte, { parziale = false, perCarta = false } = {}) {
        const oggi = chiaveGiorno();
        const ids = new Set(carte.map(c => c.id));
        const coperti = parziale || perCarta ? [] : [...new Set(carte.map(c => c.setId))].flatMap(setId => Dati.argomentiDiSet(setId).filter(automatico))
            .filter(a => { const sue = carteDi(a) || []; return sue.length && sue.every(c => ids.has(c.id)); });
        const argomenti = coperti.map(a => {
            if (!a.ultimoRipasso) return { a, tipo: 'mai', giorni: 0 };
            const x = Srs.situazione({ giorno: a.ultimoRipasso, intervallo: intervallo(a) }, oggi);
            return { a, ...x, esiti: esitiSeConta(a, oggi) };
        });
        const conti = { puntuali: 0, senzaData: 0 };
        const flashcard = coperti.length ? [] : carte.map(c => {
            const s = c.srs;
            if (!s || !s.giorno || s.daRifareDal || (s.ultimaValutazione == null && !s.allineata)) { conti.senzaData++; return null; }
            const x = Srs.situazione({ giorno: s.giorno, intervallo: Srs.intervalloDi(s.intervallo, s.rep) }, oggi);
            if (x.tipo === 'puntuale') { conti.puntuali++; return null; }
            return { c, ...x };
        }).filter(Boolean);
        return { argomenti, flashcard, conti, carte: carte.length };
    }

    const BADGE = { ritardo: 'In ritardo', anticipo: 'In anticipo', 'stesso-giorno': 'Già ripassato oggi', puntuale: 'Puntuale', mai: 'Prima volta' };
    const fuoriGiornoTipo = x => ['ritardo', 'anticipo', 'stesso-giorno'].includes(x.tipo);

    function testoSituazione(x, femminile = false) {
        if (x.tipo === 'stesso-giorno') return `già ripassat${femminile ? 'a' : 'o'} oggi`;
        return `in ${x.tipo === 'anticipo' ? 'anticipo' : 'ritardo'} di ${plurale(x.giorni, 'giorno', 'giorni')} (prevista il ${dataBreve(x.prevista)})`;
    }

    // Linea del tempo di un set: ultimo ripasso, prevista e oggi, nell'ordine in cui vengono
    function lineaDelTempo(x) {
        const tappa = (etichetta, data, classe = '') => `<span class="conta-tappa ${classe}"><small>${etichetta}</small><b>${data}</b></span>`;
        const tratto = (testo, classe = '') => `<span class="conta-tratto ${classe}"><i></i><small>${testo}</small></span>`;
        const ultimo = dataBreve(daChiaveGiorno(x.a.ultimoRipasso)), prevista = dataBreve(x.prevista), oggi = dataBreve(Date.now());
        const I = intervallo(x.a);
        if (x.tipo === 'stesso-giorno') return tappa('ultimo ripasso', 'oggi', 'oggi') + tratto(plurale(I, 'giorno', 'giorni')) + tappa('prevista', prevista);
        if (x.tipo === 'anticipo') return tappa('ultimo ripasso', ultimo) + tratto(plurale(I - x.giorni, 'giorno', 'giorni')) + tappa('oggi', oggi, 'oggi') + tratto(`mancano ${x.giorni}`) + tappa('prevista', prevista);
        return tappa('ultimo ripasso', ultimo) + tratto(plurale(I, 'giorno', 'giorni')) + tappa('prevista', prevista) + tratto(`+${plurale(x.giorni, 'giorno', 'giorni')}`, 'ritardo') + tappa('oggi', oggi, 'oggi');
    }

    function traGiorni(x, e) {
        return `tra ${plurale(x.esiti[e].tra, 'giorno', 'giorni')} <small>(${x.esiti[e].il})</small>${esamePrima(x.a.setId, aggiungiGiorni(Date.now(), x.esiti[e].tra)) ? ` <span class="dopo-esame">${ico('avviso')}dopo l'esame</span>` : ''}`;
    }

    function esitiSet(x) {
        if (x.tipo === 'stesso-giorno') return `<p class="conta-se">Se è effettivo: N° Rep ${(x.a.ripetizioni || 0) + 1}, la prossima revisione resta il <b>${dataBreve(prossima(x.a))}</b>.</p>`;
        if (x.tipo === 'anticipo') return `<p class="conta-se">Se è effettivo: prossima revisione <b>${traGiorni(x, 'buono')}</b>. La data va avanti, ma meno che aspettando.</p>`;
        return `<div class="conta-se"><span>Se è effettivo, la prossima revisione dipende da com'è andata:</span>
            <div class="conta-esiti">
                <span class="conta-esito stato-perfetto"><b>Ottimo</b>${traGiorni(x, 'perfetto')}</span>
                <span class="conta-esito stato-buono"><b>Buono</b>${traGiorni(x, 'buono')}</span>
                <span class="conta-esito stato-ok"><b>Ok, Scarso o incompleto</b>${traGiorni(x, 'male')}</span>
            </div></div>`;
    }

    // Quante carte per situazione, come pastiglie: "3 in ritardo (da 1 a 9 giorni)"
    function riepilogoCarte(voci) {
        return [['ritardo', 'in ritardo', 'in ritardo'], ['anticipo', 'in anticipo', 'in anticipo'], ['stesso-giorno', 'già ripassata oggi', 'già ripassate oggi']].map(([tipo, uno, piu]) => {
            const g = voci.filter(v => v.tipo === tipo).map(v => v.giorni);
            if (!g.length) return '';
            const min = Math.min(...g), max = Math.max(...g);
            const quanti = tipo === 'stesso-giorno' ? '' : min === max ? ` (${plurale(min, 'giorno', 'giorni')})` : ` (da ${min} a ${max} giorni)`;
            return `<span class="conta-badge conta-${tipo}"><b>${g.length}</b> ${g.length === 1 ? uno : piu}${quanti}</span>`;
        }).filter(Boolean).join('');
    }

    // A ogni avvio dello studio chiede se è un ripasso effettivo o di prova (che non cambia niente), e dice com'è messo
    // rispetto ai giorni previsti: i set fuori giorno con la linea del tempo e la prossima revisione per ogni esito,
    // quelli puntuali o alla prima volta in breve; nelle sessioni di carte quante sono fuori giorno.
    // opzioni.sorelle = { attivo }: mostra la casella "Mescola le domande sorelle" (per questa sessione).
    // Restituisce { scelta: 'conta' (effettivo) | 'prova', sorelle: bool } o null (annullato)
    function chiediSeConta(carte, opzioni = {}) {
        const { argomenti, flashcard, conti } = situazioniAvvio(carte, opzioni);
        const fuori = argomenti.filter(fuoriGiornoTipo);
        const inPari = argomenti.filter(x => !fuoriGiornoTipo(x));
        const voceSet = x => `
            <div class="conta-set conta-${x.tipo}">
                <div class="conta-set-testa"><b>${esc(x.a.nome || nomeSet(x.a.setId))}</b>
                    <span class="conta-badge conta-${x.tipo}">${BADGE[x.tipo]}${x.giorni ? ` di ${plurale(x.giorni, 'giorno', 'giorni')}` : ''}</span></div>
                <div class="conta-linea">${lineaDelTempo(x)}</div>
                ${esitiSet(x)}
            </div>`;
        const solo = inPari.length === 1 && !fuori.length;
        const primo = Srs.sequenza()[0];
        const bloccoInPari = inPari.length ? `
            <div class="conta-set conta-${solo ? inPari[0].tipo : 'puntuale'}">
                <div class="conta-set-testa"><b>${solo ? esc(inPari[0].a.nome || nomeSet(inPari[0].a.setId)) : 'Nel giorno previsto o alla prima volta'}</b>
                    ${solo ? `<span class="conta-badge conta-${inPari[0].tipo}">${BADGE[inPari[0].tipo]}</span>` : ''}</div>
                <ul class="conta-righe">${inPari.map(x => `<li>${solo ? '' : `<span><b>${esc(x.a.nome || nomeSet(x.a.setId))}</b> <span class="conta-badge conta-${x.tipo}">${BADGE[x.tipo]}</span></span>`}
                    <span>${x.tipo === 'mai' ? `Se è effettivo: N° Rep 1, prossima revisione ${primo === 1 ? 'domani' : `tra ${plurale(primo, 'giorno', 'giorni')}`}`
                        : `Se è effettivo: N° Rep ${(x.a.ripetizioni || 0) + 1}, prossima revisione ${traGiorni(x, 'buono')}`}</span></li>`).join('')}</ul>
            </div>` : '';
        const una = flashcard.length === 1 ? flashcard[0] : null;
        const bloccoCarte = flashcard.length ? `
            <div class="conta-set conta-carte">
                <div class="conta-set-testa"><b>${una ? esc(Ui.tronca(testoDaHtml(una.c.domanda), 110)) || 'Flashcard' : `${ico('carte')}${flashcard.length} flashcard fuori dal giorno previsto`}</b></div>
                <div class="conta-pastiglie">${riepilogoCarte(flashcard)}</div>
                ${una ? '' : `<details class="conta-dettagli"><summary>Quali sono</summary><ul>${flashcard.map(x =>
                    `<li><span>${esc(Ui.tronca(testoDaHtml(x.c.domanda), 90)) || '(senza domanda)'}</span><small>${testoSituazione(x, true)}</small></li>`).join('')}</ul></details>`}
                <p class="conta-se">Se è effettivo: ${[
                    flashcard.some(x => x.tipo === 'ritardo') && `${una ? '' : 'in ritardo, '}se la sai bene l'intervallo si allunga, se la sai così così si accorcia`,
                    flashcard.some(x => x.tipo === 'anticipo') && `${una ? '' : 'in anticipo, '}la data va avanti, ma meno che aspettando`,
                    flashcard.some(x => x.tipo === 'stesso-giorno') && `${una ? '' : 'già ripassate oggi, '}N° Rep +1 e la data resta`,
                ].filter(Boolean).join('; ')}.</p>
            </div>` : '';
        const altreCarte = !argomenti.length && (conti.puntuali || conti.senzaData)
            ? `<p class="conta-se">${[conti.puntuali && `${plurale(conti.puntuali, 'flashcard nel giorno previsto', 'flashcard nel giorno previsto')}`,
                conti.senzaData && `${plurale(conti.senzaData, 'nuova o da rifare', 'nuove o da rifare')}`].filter(Boolean).join(' · ')}${flashcard.length ? '' : ': valutazioni, N° Rep e date seguono le solite regole.'}</p>` : '';
        const intro = fuori.length ? (argomenti.length === 1 ? 'Questo set non è nel giorno previsto.' : fuori.length === 1 ? 'Un set non è nel giorno previsto.' : 'Alcuni set non sono nel giorno previsto.')
            : flashcard.length ? (una ? 'Questa flashcard non è nel giorno previsto.' : 'Alcune flashcard non sono nel giorno previsto.')
                : argomenti.length ? (argomenti.every(x => x.tipo === 'mai') ? (argomenti.length === 1 ? 'È il primo ripasso di questo set.' : 'È il primo ripasso di questi set.')
                    : 'Il ripasso è nel giorno previsto.') : `Stai per studiare ${plurale(carte.length, 'flashcard', 'flashcard')}.`;
        const soloStessoGiorno = (fuori.length || flashcard.length) && argomenti.every(x => x.tipo === 'stesso-giorno') && flashcard.every(x => x.tipo === 'stesso-giorno');
        return new Promise(risolvi => {
            let scelta = null;
            Ui.modale({
                titolo: 'Ripasso effettivo o di prova?', classe: 'modale-conta',
                corpo: `
                    <p class="conta-intro">${intro}</p>
                    ${fuori.map(voceSet).join('')}
                    ${bloccoInPari}
                    ${bloccoCarte}
                    ${altreCarte}
                    ${opzioni.sorelle ? `<label class="conta-sorelle"><input type="checkbox" data-sorelle ${opzioni.sorelle.attivo ? 'checked' : ''}>
                        <span><b>${ico('mescola')}Mescola le domande sorelle</b><small>La madre resta prima delle sue figlie, ma le domande allo stesso livello (es. i sottorami) escono in ordine casuale</small></span></label>` : ''}
                    <div class="conta-scelte">
                        <button type="button" class="conta-scelta conta-scelta-primaria" data-scelta="conta" autofocus>
                            <span class="conta-scelta-icona">${ico('spunta')}</span>
                            <span><b>Ripasso effettivo</b><small>${soloStessoGiorno ? 'N° Rep +1, le date restano' : argomenti.length ? 'Conta: N° Rep +1 e le nuove date qui sopra' : 'Conta: valutazioni, N° Rep e date si aggiornano'}</small></span>
                        </button>
                        <button type="button" class="conta-scelta" data-scelta="prova">
                            <span class="conta-scelta-icona">${ico('occhio')}</span>
                            <span><b>Ripasso di prova</b><small>Studi come sempre, ma set e flashcard restano com'erano. Il tempo va nelle statistiche</small></span>
                        </button>
                    </div>`,
                azioni: [{ testo: 'Annulla', classe: 'btn-fantasma' }],
                alApri: (el, m) => el.addEventListener('click', e => {
                    const b = e.target.closest('[data-scelta]');
                    if (!b) return;
                    const casella = $('[data-sorelle]', el);
                    scelta = { scelta: b.dataset.scelta, sorelle: !!(casella && casella.checked) };
                    m.chiudi();
                }),
                alChiudere: () => risolvi(scelta),
            });
        });
    }

    // ---- Ripasso di più set insieme ---------------------------------------------------------

    // Scegli quali set (quelli da ripassare sono già spuntati) e se le carte vanno in ordine (un set dopo l'altro) o
    // mescolate (si alternano: aiuta a distinguere argomenti simili; dentro ogni set l'ordine e la cascata restano).
    // Ogni set di cui valuti tutte le carte conta come ripasso del set. materiaId limita i set a una materia
    function ripassaPiuSet({ materiaId = null } = {}) {
        const righe = Dati.tuttiGliArgomenti().filter(a => conCarte(a) && (!materiaId || (Dati.set(a.setId) || {}).materiaId === materiaId));
        if (!righe.length) { Ui.toast('Non ci sono ancora set con flashcard nelle revisioni', 'info', 4000); return; }
        const ordinati = [...righe.filter(daRipassare).sort(perUrgenza), ...righe.filter(a => !daRipassare(a)).sort(perUrgenza)];
        const scelti = new Set(ordinati.filter(daRipassare).map(a => a.id));
        const carteScelte = () => [...new Set(ordinati.filter(a => scelti.has(a.id)).flatMap(a => (carteDi(a) || []).map(c => c.id)))];
        Ui.modale({
            titolo: 'Ripassa più set', classe: 'modale-piccola modale-piu-set',
            corpo: `
                <div class="campo"><span class="etichetta">Quali set <em>quelli da ripassare oggi sono già spuntati</em></span>
                    <div class="scelta-set lista-piu-set">${ordinati.map(a => `
                        <label class="voce-set"><input type="checkbox" value="${a.id}" ${scelti.has(a.id) ? 'checked' : ''}>
                            <span>${esc(a.nome || nomeSet(a.setId))}</span>${etichettaAvviso(a)}<small>${(carteDi(a) || []).length}</small></label>`).join('')}</div>
                    <div class="azioni-riga azioni-scelta-set">
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-piu-set="da-fare">Quelli da ripassare</button>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-piu-set="tutti">Tutti</button>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-piu-set="nessuno">Nessuno</button>
                    </div>
                </div>
                <div class="campo"><span class="etichetta">Le carte</span>
                    <div class="scelte-ordine">
                        <label class="scelta-radio"><input type="radio" name="ordine-piu-set" value="mescolato" checked>
                            <span><b>Mescolate</b> (consigliato)<small>Le carte dei set si alternano: aiuta a distinguere argomenti simili. Dentro ogni set l'ordine e la cascata restano.</small></span></label>
                        <label class="scelta-radio"><input type="radio" name="ordine-piu-set" value="set"><span><b>In ordine</b><small>Un set dopo l'altro.</small></span></label>
                    </div>
                </div>
                <p class="conteggio-sessione" data-conto-piu-set></p>`,
            alApri: el => {
                const aggiorna = () => {
                    const n = carteScelte().length;
                    $('[data-conto-piu-set]', el).innerHTML = n ? `<b>${plurale(scelti.size, 'set', 'set')}</b>, ${plurale(n, 'flashcard', 'flashcard')}` : 'Scegli almeno un set';
                    $('.modale-piede .btn-primario', el).disabled = !n;
                };
                el.addEventListener('change', e => {
                    const x = e.target.closest('.lista-piu-set input');
                    if (!x) return;
                    if (x.checked) scelti.add(x.value); else scelti.delete(x.value);
                    aggiorna();
                });
                el.addEventListener('click', e => {
                    const b = e.target.closest('[data-piu-set]');
                    if (!b) return;
                    scelti.clear();
                    ordinati.forEach(a => { if (b.dataset.piuSet === 'tutti' || (b.dataset.piuSet === 'da-fare' && daRipassare(a))) scelti.add(a.id); });
                    $$('.lista-piu-set input', el).forEach(x => { x.checked = scelti.has(x.value); });
                    aggiorna();
                });
                aggiorna();
            },
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: `${ico('fulmine')}Inizia`, classe: 'btn-primario', principale: true, clic: m => {
                    const ids = carteScelte();
                    if (!ids.length) return;
                    const scelte = ordinati.filter(a => scelti.has(a.id));
                    const mescola = $('[name=ordine-piu-set]:checked', m.el).value === 'mescolato';
                    m.chiudi();
                    Viste.studio.avvia({
                        setIds: [...new Set(scelte.map(a => a.setId))], ids, mescolaSet: mescola,
                        titolo: scelte.length === 1 ? (scelte[0].nome || nomeSet(scelte[0].setId)) : `${scelte.length} set${mescola ? ' mescolati' : ''}`,
                        ritorno: Router.corrente.replace(/^#/, ''),
                    });
                } },
            ],
        });
    }

    // ---- Flashcard che vanno per conto loro --------------------------------------------

    // Come sta una carta rispetto al suo argomento (il set, già ripassato almeno una volta):
    // { tipo, giorni, testo } con tipo 'senza-set' (set mai ripassato) | 'passo' (stessa prossima revisione) |
    // 'mai' (mai valutata) | 'scarso' (da rifare) | 'prima' | 'dopo' (la sua prossima revisione cade N giorni prima o dopo)
    // Se la carta sta in più mazzi, altri = come sta rispetto a quelli che non segue: [{ a, giorni, testo }]
    function sfasatura(c, a = argomentoDi(c)) {
        if (!a) return { tipo: 'senza-set', giorni: 0, testo: 'Set mai ripassato', altri: [] };
        const s = c.srs || {};
        if (Srs.valutazione(c) == null && !s.allineata) return { tipo: 'mai', giorni: 0, testo: 'Mai valutata', altri: [] };
        const p = Srs.prossima(c);
        const scarto = x => (p ? giorniTra(prossima(x), p) : 0);
        const setIntero = !Array.isArray(a.carte);
        const nome = x => `«${x.nome || nomeSet(x.setId)}»`;
        const g = scarto(a);
        const quanto = g ? `${plurale(Math.abs(g), 'giorno', 'giorni')} ${g < 0 ? (setIntero ? 'prima del set' : `prima di ${nome(a)}`) : (setIntero ? 'dopo il set' : `dopo ${nome(a)}`)}` : '';
        const altri = mazziDi(c).filter(x => x !== a).map(x => {
            const d = scarto(x);
            return { a: x, giorni: d, testo: `anche in ${nome(x)}${Array.isArray(x.carte) ? '' : ' (tutto il set)'}: ${d ? `${plurale(Math.abs(d), 'giorno', 'giorni')} ${d < 0 ? 'prima' : 'dopo'}` : 'al passo'}` };
        });
        if (s.ultimaValutazione === Srs.SCARSO) return { tipo: 'scarso', giorni: Math.abs(g), testo: `Scarso: da rifare${quanto ? ` · ${quanto}` : ''}`, altri };
        if (!g) return { tipo: 'passo', giorni: 0, testo: setIntero ? 'Al passo con il set' : `Al passo con ${nome(a)}`, altri };
        return { tipo: g < 0 ? 'prima' : 'dopo', giorni: Math.abs(g), testo: `${quanto}${s.ultimaValutazione === Srs.OK ? ' (Ok)' : ''}`, altri };
    }

    // Una voce del pannello delle flashcard: { carta, argomento, ripetizioni, intervallo, ultimoRipasso, sfasatura }
    function voceCarta(c) {
        const a = argomentoDi(c);
        const s = c.srs || {};
        return { carta: c, argomento: a, ripetizioni: s.rep || 0, intervallo: s.giorno ? Srs.intervalloDi(s.intervallo, s.rep) : null, ultimoRipasso: s.giorno || null, sfasatura: sfasatura(c, a) };
    }

    // Sfasata: non va al passo con il set già ripassato (mai valutata, Scarso, prossima revisione in un altro giorno)
    function sfasata(v) { return !['passo', 'senza-set'].includes(v.sfasatura.tipo); }

    // Tutte le flashcard (di una materia, di alcuni set o di tutti), nell'ordine dei set e dell'albero delle carte
    function tutteLeVoci({ materiaId = null, setIds = null } = {}) {
        const carte = setIds ? Dati.carteDiSetMultipli(setIds) : materiaId ? Dati.carteDiMateria(materiaId) : Dati.tutteLeCarte();
        return carte.map(voceCarta);
    }

    // Le carte dei set già ripassati che non vanno al passo con il loro set. Tornano con lui quando le ripassi Buono o
    // Perfetto in un ripasso completo del set, o subito con "Riadegua al set"
    function carteDevianti(ambito = {}) { return tutteLeVoci(ambito).filter(sfasata); }

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
        { col: 'set', ordina: 'set', testo: 'Set', icona: 'cartella', conSet: true },
        { col: 'fonte', testo: 'Schema / fonte', icona: 'elenco' },
        { col: 'num', ordina: 'ripetizioni', testo: 'N° Rep', icona: 'elenco-num' },
        { col: 'data', ordina: 'ultimo', testo: 'Ultimo ripasso', icona: 'calendario' },
        { col: 'intervallo', ordina: 'intervallo', testo: 'Intervallo', icona: 'ruota' },
        { col: 'prossima', ordina: 'prossima', testo: 'Prossima revisione', icona: 'orologio' },
        { col: 'avviso', ordina: 'avviso', testo: 'Alert', icona: 'avviso' },
        { col: 'stato', ordina: 'stato', testo: 'Stato', icona: 'obiettivo' },
        { col: 'azioni', testo: 'Ripasso' },
    ];
    const LARGHEZZE_PREDEFINITE = { nome: 220, set: 170, fonte: 150, num: 64, data: 134, intervallo: 92, prossima: 110, avviso: 172, stato: 116, azioni: 80 };
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

    function colonne(op) { return COLONNE.filter(c => (!c.conSet || op.colonnaSet) && !(op.nascoste && op.nascoste.has(c.col))); }

    // Ordinamenti delle tabelle: { confronta, vuoto } — le righe senza quel dato (mai ripassate, senza stato) vanno
    // sempre in fondo, in ordine crescente e decrescente
    const perNome = (x, y) => String(x || '').localeCompare(String(y || ''), 'it', { numeric: true });
    const ORDINI = {
        set: {
            nome: { confronta: (a, b) => perNome(a.nome, b.nome) },
            set: { confronta: (a, b) => perNome(nomeSet(a.setId), nomeSet(b.setId)) },
            ripetizioni: { confronta: (a, b) => (a.ripetizioni || 0) - (b.ripetizioni || 0) },
            ultimo: { confronta: (a, b) => a.ultimoRipasso.localeCompare(b.ultimoRipasso), vuoto: a => !a.ultimoRipasso },
            intervallo: { confronta: (a, b) => intervallo(a) - intervallo(b), vuoto: a => !a.ultimoRipasso },
            prossima: { confronta: perUrgenza, vuoto: a => prossima(a) == null },
            avviso: { confronta: perUrgenza, vuoto: a => prossima(a) == null },
            stato: { confronta: (a, b) => Object.keys(STATI).indexOf(statoDi(b)) - Object.keys(STATI).indexOf(statoDi(a)), vuoto: a => !STATI[statoDi(a)] },
        },
        carte: {
            carta: { confronta: (a, b) => perNome(testoDaHtml(a.carta.domanda), testoDaHtml(b.carta.domanda)) },
            set: { confronta: (a, b) => perNome(nomeSet(a.carta.setId), nomeSet(b.carta.setId)) },
            valutazione: { confronta: (a, b) => Srs.valutazione(a.carta) - Srs.valutazione(b.carta), vuoto: v => Srs.valutazione(v.carta) == null },
            sfasatura: { confronta: (a, b) => ordineSfasatura(a) - ordineSfasatura(b) },
            ripetizioni: { confronta: (a, b) => a.ripetizioni - b.ripetizioni },
            ultimo: { confronta: (a, b) => a.ultimoRipasso.localeCompare(b.ultimoRipasso), vuoto: v => !v.ultimoRipasso },
            intervallo: { confronta: (a, b) => a.intervallo - b.intervallo, vuoto: v => v.intervallo == null },
            prossima: { confronta: perUrgenza, vuoto: v => prossima(v) == null },
            avviso: { confronta: perUrgenza, vuoto: v => prossima(v) == null },
        },
    };
    // Rispetto al set, dalla più lontana: N giorni prima … al passo … N giorni dopo
    const ordineSfasatura = v => {
        const x = v.sfasatura;
        return { prima: -x.giorni, passo: 0, dopo: x.giorni, scarso: 1e5, mai: 2e5, 'senza-set': 3e5 }[x.tipo] ?? 0;
    };

    // ord = { colonna, verso: 1 crescente | -1 decrescente }; senza colonna resta l'ordine dato
    function ordina(tipo, lista, ord) {
        const o = ord && ord.colonna && ORDINI[tipo][ord.colonna];
        if (!o) return lista;
        const vuoto = o.vuoto || (() => false);
        return [...lista].sort((a, b) => {
            const va = vuoto(a), vb = vuoto(b);
            if (va || vb) return va - vb;
            return o.confronta(a, b) * ord.verso;
        });
    }

    // Le colonne che si possono nascondere (la prima, il nome, resta sempre)
    function colonneDi(tipo) {
        return (tipo === 'carte' ? COLONNE_CARTE : COLONNE).slice(1).map(c => ({ col: c.col, testo: c.testo }));
    }

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

    // Intervallo in giorni e prossima revisione, modificabili (attributo = data-campo o data-carta-campo)
    function campoIntervallo(attributo, giorniIntervallo) {
        return `<input class="campo-rev cella-num" type="number" min="1" max="${Srs.MAX_GIORNI}" step="1" ${attributo}="intervallo" value="${giorniIntervallo || ''}"
            ${giorniIntervallo ? '' : 'disabled'} placeholder="—" aria-label="Intervallo in giorni" title="Giorni dall'ultimo ripasso alla prossima revisione">`;
    }

    function campoProssima(attributo, p, minimo, bloccato) {
        const min = minimo ? chiaveGiorno(aggiungiGiorni(daChiaveGiorno(minimo), 1)) : '';
        return `<label class="sovrapposto"><span class="testo-sovrapposto" data-calcolato="prossima">${p ? aCapoDate(dataBreve(p)) : '<span class="tenue">—</span>'}</span>
            <input class="controllo-sovrapposto" type="date" ${attributo}="prossima" value="${p ? chiaveGiorno(p) : ''}" ${min ? `min="${min}"` : ''} ${bloccato ? 'disabled' : ''}
                aria-label="Prossima revisione" title="${bloccato ? "Prima serve l'ultimo ripasso (o una valutazione)" : `${p ? esc(formattaData(p)) + ' · ' : ''}Scegli la data: l'intervallo si adegua`}"></label>`;
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
                <td class="col-intervallo">${campoIntervallo('data-campo', a.ultimoRipasso ? intervallo(a) : null)}</td>
                <td class="col-prossima">${campoProssima('data-campo', p, a.ultimoRipasso, !a.ultimoRipasso)}${avvisoEsame(a.setId, p)}</td>
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

    // Clic ripetuti sull'intestazione: crescente → decrescente → ordine originale
    function cambiaOrdine(ord, col) {
        if (ord.colonna !== col) Object.assign(ord, { colonna: col, verso: 1 });
        else if (ord.verso > 0) ord.verso = -1;
        else Object.assign(ord, { colonna: null, verso: 1 });
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
    //            vuoto: html quando non ci sono righe, dopo: () => void dopo ogni modifica,
    //            ordinamento: { colonna, verso } condiviso con i filtri (se no uno per chiave), alOrdinare: () => void,
    //            nascoste: Set delle colonne nascoste }
    function monta(contenitore, opzioni) {
        const op = { colonnaSet: false, setModificabile: false, vuoto: '', dopo: () => {}, alOrdinare: () => {}, ...opzioni };
        if (!op.ordinamento && !ordinamenti.has(op.chiave)) ordinamenti.set(op.chiave, { colonna: null, verso: 1 });
        const ordine = () => op.ordinamento || ordinamenti.get(op.chiave);

        const righe = () => ordina('set', op.argomenti(), ordine());

        const disegna = (fuoco = null) => {
            const lista = righe();
            contenitore.innerHTML = lista.length ? `
                <div class="tabella-scorrevole riquadro riquadro-tabella">
                    <table class="tabella-revisioni" style="width:${larghezzaTabella(op)}px" data-nascoste="${[...(op.nascoste || [])].join(' ')}">
                        ${colgroup(op)}
                        <thead>${intestazione(op, ordine())}</thead>
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
            $('.col-prossima', tr).innerHTML = campoProssima('data-campo', p, a.ultimoRipasso, !a.ultimoRipasso) + avvisoEsame(a.setId, p);
            $('.col-intervallo', tr).innerHTML = campoIntervallo('data-campo', a.ultimoRipasso ? intervallo(a) : null);
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
            if (nome === 'prossima' && !erroreProssima(valore, Dati.argomento(id).ultimoRipasso, campo)) return;
            if (nome === 'intervallo' && !Srs.giorni(valore)) { Ui.toast("L'intervallo è di almeno 1 giorno", 'errore'); aggiornaCalcolate(id); return; }
            try {
                Dati.aggiornaArgomento(id, { [nome]: nome === 'ripetizioni' || nome === 'intervallo' ? +valore : valore });
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
                cambiaOrdine(ordine(), ordina.dataset.ordina);
                disegna();
                op.alOrdinare();
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

    // Controlla la prossima revisione scelta a mano: deve venire dopo l'ultimo ripasso. Se no avvisa e rimette il campo
    function erroreProssima(valore, ultimo, campo) {
        if (valore && (!ultimo || valore > ultimo)) return true;
        Ui.toast(valore ? "La prossima revisione deve venire dopo l'ultimo ripasso" : 'Scegli una data', 'errore');
        campo.value = campo.defaultValue;
        return false;
    }

    // ---- Azioni sulle righe ------------------------------------------------------------

    function menuRipasso(ancora, a, dopo) {
        if (!a) return;
        const segna = async stato => {
            await Storia.esegui(`«${a.nome || 'Argomento'}» ripassato: prossima revisione ${quando(Srs.dopoRipasso({ intervallo: intervallo(a), giorno: a.ultimoRipasso }, undefined, { esito: Srs.esitoDaStato(stato || a.stato) }))}`,
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

    // Dentro box: "Tutte le flashcard del set" (anche quelle che aggiungerai), "Tutte quelle di adesso" (le carte di oggi,
    // le nuove no) o "Solo alcune", con l'elenco ad albero da spuntare (una domanda porta con sé le sue figlie).
    // iniziali = null (tutte) o [id]. Restituisce { valore() → null | [id] }
    // escludi = l'argomento che si sta cambiando (non conta tra "gli altri mazzi")
    function montaSceltaCarte(box, setId, iniziali = null, escludi = null) {
        const albero = Dati.alberoDiSet(setId);
        const scelte = new Set(iniziali || []);
        const tutteDentro = Array.isArray(iniziali) && albero.length > 0 && albero.every(n => scelte.has(n.carta.id));
        let modo = !Array.isArray(iniziali) ? 'tutte' : tutteDentro ? 'adesso' : 'alcune';
        const alcune = () => modo === 'alcune';
        // Le flashcard scelte che stanno già in altri mazzi con alcune carte: una carta ha una sola data e ne segue uno
        const avvisaAltri = () => {
            const box2 = $('[data-altri-mazzi]', box);
            if (!box2) return;
            const ids = modo === 'tutte' ? [] : modo === 'adesso' ? albero.map(n => n.carta.id) : [...scelte];
            const altri = Dati.argomentiDiSet(setId).filter(a => a.id !== escludi && Array.isArray(a.carte))
                .map(a => ({ a, n: ids.filter(id => a.carte.includes(id)).length })).filter(x => x.n);
            const setIntero = modo !== 'tutte' && Dati.argomentiDiSet(setId).some(a => a.id !== escludi && a.delSet && !Array.isArray(a.carte));
            box2.innerHTML = [
                altri.length ? `<p class="avviso-mazzi">${ico('avviso')}<span>${altri.map(x => `${plurale(x.n, 'flashcard è', 'flashcard sono')} già in «${esc(x.a.nome || 'senza nome')}»`).join(', ')}.
                    Una flashcard ha una sola data, quindi segue un mazzo solo: queste continuano a seguire quello in cui erano (se l'hai già ripassato), e rispetto a questo le vedrai sfasate.
                    Per cambiare il mazzo che seguono: «Riadegua…» nel pannello Per flashcard.</span></p>` : '',
                setIntero && ids.length ? `<p class="nota">Le flashcard restano anche nel mazzo di tutto il set: dopo il primo ripasso di questo, seguono questo.</p>` : '',
            ].join('');
        };
        const conta = () => { const c = $('[data-conta-carte]', box); if (c) c.textContent = `${scelte.size} di ${albero.length} scelte`; avvisaAltri(); };
        const disegna = () => {
            box.innerHTML = `
                <div class="scelta-radio">
                    <label><input type="radio" name="carte-argomento" value="tutte" ${modo === 'tutte' ? 'checked' : ''}>
                        <span>Tutte le flashcard del set <small>(${albero.length}, e anche quelle che aggiungerai)</small></span></label>
                    <label><input type="radio" name="carte-argomento" value="adesso" ${modo === 'adesso' ? 'checked' : ''}>
                        <span>Tutte quelle che ci sono adesso <small>(${albero.length}; quelle che aggiungerai dopo no)</small></span></label>
                    <label><input type="radio" name="carte-argomento" value="alcune" ${alcune() ? 'checked' : ''}><span>Solo alcune</span></label>
                </div>
                ${alcune() ? (albero.length ? `
                <div class="scelta-set scelta-carte-arg">${albero.map(n => {
                    const t = testoDaHtml(n.carta.domanda);
                    return `<label class="voce-set" style="--livello:${n.livello}"><input type="checkbox" value="${n.carta.id}" ${scelte.has(n.carta.id) ? 'checked' : ''}>
                        <span title="${esc(t)}">${esc(t) || '(senza domanda)'}</span>${n.carta.tag.length ? `<small>${esc(n.carta.tag.join(', '))}</small>` : ''}</label>`;
                }).join('')}</div>
                <div class="azioni-riga azioni-scelta-set">
                    <button type="button" class="btn btn-fantasma btn-piccolo" data-carte-tutte="1">Seleziona tutte</button>
                    <button type="button" class="btn btn-fantasma btn-piccolo" data-carte-tutte="0">Nessuna</button>
                    <small class="conta-carte-arg" data-conta-carte></small>
                </div>` : '<p class="nota">Il set non ha ancora flashcard.</p>') : ''}
                <div data-altri-mazzi></div>`;
            conta();
        };
        box.addEventListener('change', e => {
            if (e.target.name === 'carte-argomento') { modo = e.target.value; disegna(); return; }
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
        return { valore: () => (modo === 'tutte' ? null : albero.map(n => n.carta.id).filter(id => modo === 'adesso' || scelte.has(id))) };
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
                alApri: el => { scelta = montaSceltaCarte($('[data-carte-arg]', el), a.setId, automatico(a) ? (Array.isArray(a.carte) ? a.carte : null) : null, a.id); },
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
        { col: 'carta', ordina: 'carta', testo: 'Flashcard', icona: 'carte', larghezza: 300 },
        { col: 'set', ordina: 'set', testo: 'Set', icona: 'cartella', larghezza: 160 },
        { col: 'stato', ordina: 'valutazione', testo: 'Valutazione', icona: 'obiettivo', larghezza: 122 },
        { col: 'sfasatura', ordina: 'sfasatura', testo: 'Rispetto al set', icona: 'sincronizza', larghezza: 196 },
        { col: 'num', ordina: 'ripetizioni', testo: 'N° Rep', icona: 'elenco-num', larghezza: 64 },
        { col: 'data', ordina: 'ultimo', testo: 'Ultimo ripasso', icona: 'calendario', larghezza: 134 },
        { col: 'intervallo', ordina: 'intervallo', testo: 'Intervallo', icona: 'ruota', larghezza: 92 },
        { col: 'prossima', ordina: 'prossima', testo: 'Prossima revisione', icona: 'orologio', larghezza: 110 },
        { col: 'avviso', ordina: 'avviso', testo: 'Alert', icona: 'avviso', larghezza: 172 },
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
        // La data si sceglie solo per le carte che ne hanno una loro (valutate o al passo con il set)
        const datata = Srs.prossima(c) != null;
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
                <td class="col-sfasatura"><span class="sfasatura sfasatura-${v.sfasatura.tipo}"${v.sfasatura.altri.length ? ' title="Il mazzo che la flashcard segue: si allinea a lui quando lo ripassi. Per cambiarlo: Riadegua…"' : ''}>${esc(v.sfasatura.testo)}</span>
                    ${v.sfasatura.altri.map(x => `<small class="sfasatura-altro${x.giorni ? '' : ' al-passo'}">${esc(x.testo)}</small>`).join('')}</td>
                <td class="col-num"><input class="campo-rev cella-num" type="number" min="0" step="1" data-carta-campo="rep" value="${v.ripetizioni}" aria-label="N° Rep"></td>
                <td class="col-data"><label class="sovrapposto"><span class="testo-sovrapposto">${v.ultimoRipasso ? dataLunga(v.ultimoRipasso) : '<span class="tenue">—</span>'}</span>
                    <input class="controllo-sovrapposto" type="date" data-carta-campo="giorno" value="${v.ultimoRipasso || ''}" max="${chiaveGiorno()}" aria-label="Ultimo ripasso"></label></td>
                <td class="col-intervallo">${campoIntervallo('data-carta-campo', v.intervallo)}</td>
                <td class="col-prossima">${campoProssima('data-carta-campo', p, val === Srs.SCARSO ? null : v.ultimoRipasso, !datata)}${datata ? avvisoEsame(c.setId, p) : ''}</td>
                <td class="col-avviso">${mai ? '<span class="avviso-rev avviso-mai"><i></i>Mai ripassata</span>' : etichettaAvviso(v)}</td>
                <td class="col-azioni">
                    <button type="button" class="btn-ripassato con-studio${v.ultimoRipasso === chiaveGiorno() ? ' fatto' : ''}" data-carta-ripassa
                        title="Ripassa questa flashcard" aria-label="Ripassa">${ico(v.ultimoRipasso === chiaveGiorno() ? 'spunta' : 'fulmine')}</button>
                    ${v.argomento && (sfasata(v) || v.sfasatura.altri.length) ? `<button type="button" class="btn btn-fantasma btn-piccolo btn-adegua" data-carta-adegua
                        title="${v.sfasatura.altri.length ? 'Scegli il mazzo da seguire: la flashcard prende ultimo ripasso e intervallo di quel mazzo (la stessa prossima revisione) e da lì in poi si allinea a lui; valutazione e N° Rep restano'
                            : 'Riadeguamento al set: prende ultimo ripasso e intervallo del set (la stessa prossima revisione) e torna al passo; valutazione e N° Rep restano'}">${ico('sincronizza')}${v.sfasatura.altri.length ? 'Riadegua…' : Array.isArray(v.argomento.carte) ? 'Riadegua' : 'Riadegua al set'}</button>` : ''}
                </td>
            </tr>`;
    }

    // opzioni: { voci: () => [voce di tutteLeVoci o carteDevianti], perUrgenza: le più urgenti prima (se no nell'ordine
    // dato), vuoto: html quando non ci sono righe, dopo: () => void, chiave: per ricordare l'ordine scelto,
    // ordinamento: { colonna, verso } condiviso con i filtri, alOrdinare: () => void, nascoste: Set delle colonne nascoste }
    // Un clic sull'intestazione ordina la colonna (crescente → decrescente → ordine di partenza)
    function montaCarte(contenitore, opzioni) {
        const op = { vuoto: '', dopo: () => {}, alOrdinare: () => {}, perUrgenza: true, ...opzioni };
        const chiave = 'carte:' + (op.chiave || '');
        if (!op.ordinamento && !ordinamenti.has(chiave)) ordinamenti.set(chiave, { colonna: null, verso: 1 });
        const ordine = () => op.ordinamento || ordinamenti.get(chiave);
        const visibili = () => COLONNE_CARTE.filter(c => !(op.nascoste && op.nascoste.has(c.col)));
        const voci = () => ordina('carte', op.perUrgenza ? [...op.voci()].sort(perUrgenzaCarte) : op.voci(), ordine());

        const disegna = () => {
            const lista = voci();
            const cols = visibili();
            const ord = ordine();
            contenitore.innerHTML = lista.length ? `
                <div class="tabella-scorrevole riquadro riquadro-tabella">
                    <table class="tabella-revisioni tabella-carte-rev" style="width:${cols.reduce((n, c) => n + c.larghezza, 0)}px" data-nascoste="${[...(op.nascoste || [])].join(' ')}">
                        <colgroup>${cols.map(c => `<col style="width:${c.larghezza}px">`).join('')}</colgroup>
                        <thead><tr>${cols.map(c => {
                            const etichetta = `${c.icona ? ico(c.icona) : ''}${c.testo}`;
                            const attivo = c.ordina && ord.colonna === c.ordina;
                            return `<th class="col-${c.col}">${c.ordina
                                ? `<button type="button" class="th-ordina${attivo ? ' attivo' : ''}" data-ordina-carte="${c.ordina}">${etichetta}${attivo ? ico(ord.verso > 0 ? 'giu' : 'su', 'freccia-ordine') : ''}</button>`
                                : `<span class="th-testo">${etichetta}</span>`}</th>`;
                        }).join('')}</tr></thead>
                        <tbody>${lista.map(rigaCartaHtml).join('')}</tbody>
                    </table>
                </div>` : op.vuoto;
        };

        contenitore.addEventListener('click', e => {
            const intestazione = e.target.closest('[data-ordina-carte]');
            if (intestazione) { cambiaOrdine(ordine(), intestazione.dataset.ordinaCarte); disegna(); op.alOrdinare(); return; }
            const data = e.target.closest('input[type=date].controllo-sovrapposto');
            if (data && data.showPicker) { try { data.showPicker(); } catch (err) { /* il browser lo apre da sé */ } }
            const adegua = e.target.closest('[data-carta-adegua]');
            if (adegua) { sceltaRiadegua(adegua, adegua.closest('tr[data-id]').dataset.id); return; }
            const b = e.target.closest('[data-carta-ripassa]');
            if (!b) return;
            const id = b.closest('tr[data-id]').dataset.id;
            const voce = op.voci().find(v => v.carta.id === id);
            if (voce) avviaRipassoCarte([voce]);
        });

        // Riadeguamento: la carta prende ultimo ripasso e intervallo del mazzo ed esce dall'elenco delle sfasate (si annulla
        // dall'avviso). Se sta in più mazzi si sceglie quale: da lì in poi segue quello
        const riadegua = async (id, a, segui) => {
            const c = Dati.carta(id);
            if (!c || !a) return;
            await Storia.esegui(`Flashcard riadeguata a «${a.nome || nomeSet(c.setId)}»: prossima revisione con lui`,
                () => Dati.allineaAlSet([c], a, { segui }));
            disegna();
            op.dopo();
            App.aggiornaPiede();
        };
        const sceltaRiadegua = (ancora, id) => {
            const c = Dati.carta(id);
            const mazzi = mazziDi(c);
            const segue = argomentoDi(c);
            if (mazzi.length < 2) { riadegua(id, segue, false); return; }
            Ui.menu(ancora, mazzi.map(a => ({
                testo: `Riadegua a «${a.nome || nomeSet(a.setId)}»${Array.isArray(a.carte) ? '' : ' (tutto il set)'}${a === segue ? ' · lo segue già' : ''}`,
                icona: a === segue ? 'spunta' : 'sincronizza',
                clic: () => riadegua(id, a, true),
            })));
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
                case 'intervallo':
                    if (!Srs.giorni(campo.value)) { Ui.toast("L'intervallo è di almeno 1 giorno", 'errore'); disegna(); return; }
                    Dati.aggiornaSrs(id, { intervallo: +campo.value });
                    break;
                case 'prossima':
                    if (!erroreProssima(campo.value, Srs.valutazione(c) === Srs.SCARSO ? null : c.srs.giorno, campo)) return;
                    Dati.aggiornaSrs(id, { prossima: campo.value });
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
        STATI, intervallo, prossima, esamePrima, avvisoEsame, giorniMancanti, avviso, daRipassare, perUrgenza, conteggi, quanteDaRipassare,
        etichettaAvviso, dataBreve, dataLunga, nomeSet, monta, formNuovo, unoPerOgniSet, ripristinaLarghezze,
        carteDelSet, statoDaCarte, statoDi, rigaDelSet, registraSessione, segnaComunque, descriviEsito,
        daNonAllineare, esitiSeConta, ripassaPiuSet, avviaRipasso, carteDevianti, tutteLeVoci, sfasata, sfasatura, cartaDaRipassare, maiValutata, argomentoDi, mazziDi, carteDi, automatico, dovutaDal, nuovaDaRipassare,
        avviaRipassoCarte, montaCarte, modaleCarte, chiediSeConta, situazioniAvvio, ordina, colonneDi, perUrgenzaCarte,
    };
})();
