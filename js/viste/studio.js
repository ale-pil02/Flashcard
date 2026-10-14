// Sessione di studio, una sola modalità: domanda → mostra risposta → Scarso / Ok / Buono / Perfetto.
// Buono e Perfetto chiudono la carta; Ok e Scarso la rimandano in fondo alla coda, finché non dai Buono o Perfetto.
// Solo la prima valutazione di una carta nella sessione muove N° Rep e date (js/srs.js); i ritorni cambiano solo la
// valutazione. La sessione si termina quando vuoi (✕ o Esc): le carte restano con l'ultima valutazione data.
// Alla fine le revisioni dei set studiati si aggiornano (Revisioni.registraSessione): ripasso segnato se hai valutato
// tutte le carte del set, altrimenti si chiede.
// Prima di cominciare, se set o carte non sono nel giorno previsto (in anticipo, in ritardo o già ripassati oggi), si
// chiede se il ripasso conta o se è di prova (Revisioni.chiediSeConta): il ripasso di prova non cambia né le carte né
// le revisioni, ma resta nelle statistiche.
//
// Studio a cascata (impostazione "cascata"): una domanda figlia mai vista entra solo dopo che la
// sua domanda madre è stata imparata. Appena la madre è imparata, le figlie arrivano subito dopo,
// così si procede dalla domanda più generale a quelle più specifiche.
//
// Indirizzo: #/studio ? set=ID | materia=ID | ambito=oggi|tutto  [& personalizzata=1]
// Con personalizzata=1 la sessione usa le scelte della finestra "Sessione personalizzata"
// (set, stato delle carte, tag, numero, ordine), conservate in sessionStorage. Le revisioni avviano così il
// ripasso di un set o di singole carte (avvia), con in più titolo, pagina di ritorno e parziale / perCarta.

Viste.studio = (() => {
    const CHIAVE_OPZIONI = 'flashcard-sessione';
    const LETTERE = 'ABCDEF';
    const ico = (...a) => Ui.ico(...a);

    let tasti = null;

    function impostaTasti(gestore) {
        if (tasti) document.removeEventListener('keydown', tasti);
        tasti = e => {
            if (Ui.finestraAperta() || e.ctrlKey || e.metaKey || e.altKey) return;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            if (document.querySelector('.ingrandimento')) return;
            gestore(e);
        };
        document.addEventListener('keydown', tasti);
    }

    function leggiOpzioni() {
        try { return JSON.parse(sessionStorage.getItem(CHIAVE_OPZIONI)) || null; } catch (e) { return null; }
    }

    function salvaOpzioni(opzioni) {
        try { sessionStorage.setItem(CHIAVE_OPZIONI, JSON.stringify(opzioni)); } catch (e) { /* resta la sessione predefinita */ }
    }

    // ---- Quali carte ----------------------------------------------------

    function ambitoDa(query, opzioni) {
        let ambito;
        if (query.set) {
            const s = Dati.set(query.set);
            if (!s) return null;
            ambito = {
                titolo: s.nome, ritorno: '/set/' + s.id, parametro: 'set=' + s.id, contesto: { setId: s.id, materiaId: s.materiaId },
                carte: Dati.carteConSottoSet(s.id), multiSet: Dati.discendentiSet(s.id).length > 0,
            };
        } else if (query.materia) {
            const m = Dati.materia(query.materia);
            if (!m) return null;
            ambito = { titolo: m.nome, ritorno: '/materia/' + m.id, parametro: 'materia=' + m.id, contesto: { materiaId: m.id }, carte: Dati.carteDiMateria(m.id), multiSet: true };
        } else {
            ambito = {
                titolo: query.ambito === 'oggi' ? 'Ripasso di oggi' : 'Tutte le materie', ritorno: '/home',
                parametro: 'ambito=' + (query.ambito || 'tutto'), contesto: {}, carte: Dati.tutteLeCarte(), multiSet: true,
            };
        }
        // Set scelti nella sessione personalizzata
        if (opzioni && opzioni.setIds) {
            const ids = opzioni.setIds.filter(id => Dati.set(id));
            ambito.carte = Dati.carteDiSetMultipli(ids);
            ambito.multiSet = ids.length > 1;
            if (ids.length === 1) ambito.titolo = Dati.set(ids[0]).nome;
            else if (ids.length > 1) ambito.titolo = `${ids.length} set`;
        }
        if (opzioni && opzioni.titolo) ambito.titolo = opzioni.titolo;
        if (opzioni && opzioni.ritorno) ambito.ritorno = opzioni.ritorno;
        return ambito;
    }

    function filtraPerOpzioni(carte, opzioni) {
        let lista = carte;
        if (opzioni.ids) {
            const ids = new Set(opzioni.ids);
            lista = lista.filter(c => ids.has(c.id));
            // Studio libero: le carte nell'ordine scelto (più urgenti, più deboli…), non in quello dei set
            if (opzioni.ordineIds) { const pos = new Map(opzioni.ids.map((id, i) => [id, i])); lista = [...lista].sort((a, b) => pos.get(a.id) - pos.get(b.id)); }
        }
        if (opzioni.categorie) lista = lista.filter(c => opzioni.categorie.includes(Srs.categoria(c)));
        if (opzioni.tag && opzioni.tag.length) lista = lista.filter(c => c.tag.some(t => opzioni.tag.includes(t)));
        return lista;
    }

    // Carte di più set mescolate: ogni carta prende un posto in proporzione alla sua posizione nel suo set, così i set si
    // alternano lungo tutta la sessione anche se hanno grandezze diverse; dentro ogni set l'ordine (e la cascata) resta
    function alternaSet(carte) {
        const gruppi = new Map();
        carte.forEach(c => { if (!gruppi.has(c.setId)) gruppi.set(c.setId, []); gruppi.get(c.setId).push(c); });
        const ordineSet = [...gruppi.keys()];
        return [...gruppi.values()].flatMap(g => g.map((c, i) => ({ c, chiave: (i + 0.5) / g.length })))
            .sort((a, b) => (a.chiave - b.chiave) || (ordineSet.indexOf(a.c.setId) - ordineSet.indexOf(b.c.setId)))
            .map(x => x.c);
    }

    // Le carte raggruppate per madre: per ognuna la madre più vicina che sta nella lista (dello stesso set), oppure il
    // set se non ce l'ha. Restituisce { gruppi: chiave → [carte nell'ordine dato], set: [setId in ordine] }
    function gruppiSorelle(lista) {
        const dentro = new Set(lista.map(c => c.id));
        const madreIn = c => {
            let m = c.genitoreId ? Dati.carta(c.genitoreId) : null;
            while (m && m.setId === c.setId && !dentro.has(m.id)) m = m.genitoreId ? Dati.carta(m.genitoreId) : null;
            return m && m.setId === c.setId ? m.id : null;
        };
        const gruppi = new Map(), set = [];
        lista.forEach(c => {
            const k = madreIn(c) || 'set:' + c.setId;
            if (k.startsWith('set:') && !set.includes(c.setId)) set.push(c.setId);
            if (!gruppi.has(k)) gruppi.set(k, []);
            gruppi.get(k).push(c);
        });
        return { gruppi, set };
    }

    // Ci sono domande sorelle da mescolare (almeno due con la stessa madre, o due senza madre nello stesso set)?
    function haSorelle(lista) { return [...gruppiSorelle(lista).gruppi.values()].some(g => g.length > 1); }

    // Ordine del set con le sorelle mescolate: la madre resta prima delle sue figlie (e di tutto il suo ramo), ma le
    // domande con la stessa madre escono in ordine casuale (es. i sottorami 4, 1, 3, 2). I set restano uno dopo l'altro
    function mescolaSorelle(lista) {
        const { gruppi, set } = gruppiSorelle(lista);
        const fuori = [];
        const visita = k => mescola(gruppi.get(k) || []).forEach(c => { fuori.push(c); visita(c.id); });
        set.forEach(s => visita('set:' + s));
        return fuori.length === lista.length ? fuori : lista;
    }

    // Prepara la sessione: { lista, riserva, quotaNuove, max }
    // "riserva" = carte nuove bloccate dalla cascata, che si sbloccano durante la sessione
    function preparaSessione(ambito, query, opzioni) {
        const imp = Dati.impostazioni();
        let pool = opzioni ? filtraPerOpzioni(ambito.carte, opzioni) : ambito.carte;
        if (opzioni && opzioni.mescolaSet) pool = alternaSet(pool);
        const posizione = new Map(pool.map((c, i) => [c.id, i]));
        const inSessione = id => posizione.has(id);
        const bloccata = c => imp.cascata && Srs.stato(c) === 'nuova' && c.genitoreId && inSessione(c.genitoreId)
            && Srs.stato(Dati.carta(c.genitoreId)) !== 'imparata';
        const casuale = opzioni ? !!opzioni.ordineCasuale : imp.ordineCasuale;
        // Nell'ordine del set le carte seguono l'albero: prima la madre, poi le figlie
        const ordina = lista => casuale ? mescola(lista) : lista.sort((a, b) => posizione.get(a.id) - posizione.get(b.id));

        if (opzioni) {
            const max = opzioni.quante > 0 ? opzioni.quante : Infinity;
            const libere = pool.filter(c => !bloccata(c));
            return { lista: ordina(libere).slice(0, max), riserva: pool.filter(bloccata), quotaNuove: Infinity, max };
        }

        const ora = Date.now();
        // Le mai valutate di un set già ripassato sono da ripassare come le Scarso (js/revisioni.js), se la cascata le lascia
        const dovuta = c => Revisioni.nuovaDaRipassare(c, ora);
        const daRipassare = pool.filter(c => Srs.daRipassare(c, ora) || (dovuta(c) && !bloccata(c)));
        const nuove = query.ambito === 'oggi' ? pool.filter(c => dovuta(c) && bloccata(c))
            : pool.filter(c => Srs.stato(c) === 'nuova' && !Srs.daRipassare(c, ora) && !(dovuta(c) && !bloccata(c)));
        const libere = nuove.filter(c => !bloccata(c));
        const limiti = Dati.limitiSessione(imp);
        const scelte = (imp.ordineCasuale ? mescola(libere) : libere).slice(0, limiti.nuove);
        const lista = [...daRipassare, ...scelte].slice(0, limiti.max);
        const nuoveDentro = lista.filter(c => Srs.stato(c) === 'nuova').length;
        return {
            lista: ordina(lista),
            riserva: nuove.filter(bloccata),
            quotaNuove: limiti.nuove - nuoveDentro,
            max: limiti.max,
        };
    }

    // ---- Pezzi della carta ------------------------------------------------

    function etichettaCarta(c, ambito) {
        const pezzi = [];
        const stato = Srs.stato(c);
        pezzi.push(stato === 'nuova' ? '<span class="chip chip-primario">Nuova</span>'
            : stato === 'apprendimento' ? '<span class="chip chip-ok">In apprendimento</span>'
                : '<span class="chip chip-buono">Ripasso</span>');
        if (ambito.multiSet) { const s = Dati.set(c.setId); if (s) pezzi.push(`<span class="chip chip-tenue">${esc(s.nome)}</span>`); }
        c.tag.forEach(t => pezzi.push(`<span class="chip">${esc(t)}</span>`));
        return `<div class="studio-etichette">${pezzi.join('')}</div>`;
    }

    // Carte a scelta multipla (importate o fatte prima): restano supportate nello studio.
    // soluzione = carta già valutata, rivista: le risposte corrette evidenziate, niente da scegliere
    function opzioniHtml(ordine, soluzione = false) {
        const corrette = ordine.filter(r => r.corretta).length;
        return `
            <div class="opzioni-studio" data-opzioni>
                <p class="nota">${soluzione ? (corrette > 1 ? 'Le risposte corrette' : 'La risposta corretta') : corrette > 1 ? `Seleziona tutte le risposte corrette (${corrette})` : 'Seleziona la risposta corretta'}</p>
                ${ordine.map((r, i) => `
                    <button type="button" class="opzione-studio${soluzione && r.corretta ? ' giusta' : ''}" ${soluzione ? 'disabled' : `data-azione="scegli" data-i="${i}"`}>
                        <span class="lettera">${LETTERE[i]}</span>
                        <div class="contenuto-ricco">${r.testo}</div>
                    </button>`).join('')}
            </div>`;
    }

    // Con una fonte (o una parte di mappa) la risposta si clicca e porta dove sta
    function rispostaHtml(c) {
        const testo = (c.risposte[0] || {}).testo;
        const cliccabile = c.fonte || c.mappa;
        return testo ? `<span class="etichetta">Risposta</span><div class="contenuto-ricco${cliccabile ? ' risposta-cliccabile' : ''}"${cliccabile ? ` data-vai-fonte title="${c.fonte ? 'Apri la fonte nel punto della risposta' : 'Ingrandisci la parte di mappa'}"` : ''}>${testo}</div>` : '';
    }

    function spiegazioneHtml(c) {
        return c.spiegazione ? `<div class="spiegazione"><span class="etichetta">${ico('lampadina')}Spiegazione</span><div class="contenuto-ricco">${c.spiegazione}</div></div>` : '';
    }

    function tastoNumero(e) {
        const n = parseInt(e.key, 10);
        return Number.isNaN(n) ? -1 : n - 1;
    }

    // ---- Sessione -----------------------------------------------------------
    // Frecce ‹ › ai lati dei pulsanti (o ← →), come in Vaia: ‹ torna alle carte già valutate in questa sessione, che si
    // rivedono con la risposta e si possono rivalutare (la nuova valutazione prende il posto di quella data allora:
    // N° Rep, date, statistiche e coda come se avessi scelto subito quella); › va avanti fino alla carta di adesso e,
    // sulla carta di adesso, la salta (torna in fondo alla coda, senza valutazione).
    // Una carta si rivaluta solo dall'ultima volta che l'hai valutata (prima di quella c'è solo da guardare).
    //
    // Mappe aperte dallo studio (Apri nell'editor, Apri la mappa): la sessione resta sospesa e la freccia indietro
    // dell'editor ci torna, sulla stessa carta e nella stessa fase (risposta visibile); se invece vai altrove la
    // sessione si conclude come con ✕ (revisioni aggiornate).

    let inCorso = null;    // la sessione aperta: { hash, titolo, contesto, finita(), sospendi(), riprendi(el), concludi() }
    let sospesa = null;    // la sessione lasciata per una mappa

    function studia(radice, preparata, ambito, opzioniSessione = {}) {
        let el = radice, corpo = null;
        const sessione = {
            coda: preparata.lista.map(c => c.id), riserva: preparata.riserva, quotaNuove: preparata.quotaNuove, max: preparata.max,
            totale: preparata.lista.length, fatte: 0, imparate: 0, sbloccate: 0, risposte: 0, valutazioni: [0, 0, 0, 0], inizio: Date.now(),
            prime: new Map(),   // cartaId → prima valutazione della sessione (quella che muove le date)
            senzaDate: new Set(),   // carte partite con Scarso: la prima volta che arrivano almeno a Ok prendono rep e data
            giaImparate: new Set([...preparata.lista, ...preparata.riserva].filter(x => Srs.stato(x) === 'imparata').map(x => x.id)),
            // Nuove o Scarso all'inizio: alla fine non prendono la data del set anche se le valuti Buono (js/revisioni.js)
            nonAllineare: Revisioni.daNonAllineare([...preparata.lista, ...preparata.riserva]),
            // Le valutazioni date, in ordine: { id, v, prima, senzaDatePrima, eraImparata, srsPrima, ripassoId, contata }
            storia: [],
            finita: false,
        };
        let c, fase, ordine, selezionate, suggerita, inizioCarta;
        let pos = null;       // la carta già valutata che stai rivedendo (indice in sessione.storia); null = la carta di adesso
        let ritorno = null;   // la carta di adesso quando la lasci (indietro o per una mappa): { id, fase, trascorso, ordine, selezionate }

        const avanzamento = () => {
            $('[data-barra]', el).style.width = `${sessione.totale ? Math.round(sessione.fatte / sessione.totale * 100) : 0}%`;
            $('[data-contatore]', el).textContent = `${Math.min(sessione.fatte + 1, sessione.totale)} / ${sessione.totale}`;
        };

        // Testata, corpo, tasti e pulsanti nel contenitore della vista (all'inizio e quando la sessione riprende)
        function aggancia(nuovo) {
            el = nuovo;
            el.innerHTML = `
                <div class="studio">
                    <header class="studio-testa">
                        <button type="button" class="btn-icona" data-azione="termina" title="Termina la sessione (Esc)" aria-label="Termina la sessione">${ico('chiudi')}</button>
                        <div class="studio-titolo"><b>Studio${opzioniSessione.diProva ? '<span class="chip chip-ok chip-prova" title="Non cambia né le flashcard né le revisioni">Prova</span>' : ''}</b><span>${esc(ambito.titolo)}</span></div>
                        <div class="studio-barra"><span data-barra></span></div>
                        <span class="studio-contatore" data-contatore></span>
                    </header>
                    <div class="studio-corpo" data-corpo></div>
                </div>`;
            corpo = $('[data-corpo]', el);
            // Le immagini nelle carte si aprono ingrandite
            corpo.addEventListener('click', e => {
                const img = e.target.closest('.contenuto-ricco img');
                if (img) { e.stopPropagation(); Ricco.ingrandisci(img.src); }
            }, true);
            // Clic sulla risposta (o sulla riga della fonte): si apre la fonte nel punto della risposta
            corpo.addEventListener('click', e => {
                const v = e.target.closest('[data-vai-fonte]');
                if (!v || e.target.closest('a') || !['risposta', 'passata'].includes(fase) || String(getSelection() || '').trim()) return;
                Materiali.vaiAllaFonte(c);
            });
            impostaTasti(suTasto);
            Ui.collegaAzioni(el, azioni);
        }

        function scena(carta, voce = null) {
            const passata = !!voce;
            const opz = passata ? (carta.risposte.length > 1 ? carta.risposte : null) : ordine;
            return `
                <div class="studio-scena">
                    <div class="studio-sopra-carta">
                        ${passata ? `<div class="studio-etichette"><span class="chip chip-primario">${ico('ruota')}Già valutata</span>
                            <button type="button" class="btn btn-fantasma btn-piccolo" data-azione="attuale" title="Torna alla carta di adesso (Invio)">Torna alla carta di adesso${ico('destra')}</button></div>`
                            : etichettaCarta(carta, ambito)}
                        <button type="button" class="btn btn-fantasma btn-piccolo carta-modifica" data-azione="modifica-carta" title="Correggi questa flashcard senza lasciare il ripasso (E)">${ico('matita')}Modifica</button>
                    </div>
                    <article class="carta-studio${passata ? ' carta-passata' : ''}">
                        <div class="carta-domanda contenuto-ricco">${carta.domanda}</div>
                        ${carta.suggerimento ? `<div class="suggerimento" data-suggerimento ${passata ? '' : 'hidden'}>${ico('lampadina')}<span>${esc(carta.suggerimento)}</span></div>` : ''}
                        ${opz ? opzioniHtml(opz, passata) : ''}
                        <div class="carta-risposta" data-risposta ${passata ? '' : 'hidden'}>
                            ${opz ? (passata ? '' : '<p class="esito" data-esito></p>') : rispostaHtml(carta)}
                            ${carta.mappa ? '<div data-risposta-mappa></div>' : ''}
                            ${Materiali.fonteHtml(carta)}
                            ${spiegazioneHtml(carta)}
                        </div>
                    </article>
                </div>
                <footer class="studio-piede" data-piede></footer>`;
        }

        // La carta di adesso (la prima della coda). Se la stavi guardando prima di tornare indietro (o di aprire una
        // mappa) riprende com'era: stessa fase, stesso tempo di risposta
        function disegna() {
            pos = null;
            if (!sessione.coda.length) return fine();
            c = Dati.carta(sessione.coda[0]);
            if (!c) { sessione.coda.shift(); sessione.totale--; return disegna(); }   // eliminata nel frattempo
            const torna = ritorno && ritorno.id === c.id ? ritorno : null;
            ritorno = null;
            VistaMappa.chiudiTutte();
            fase = 'domanda';
            selezionate = new Set();
            suggerita = null;
            inizioCarta = Date.now() - (torna ? torna.trascorso : 0);
            ordine = c.risposte.length > 1 ? (torna && torna.ordine) || mescola(c.risposte) : null;
            avanzamento();
            corpo.innerHTML = scena(c);
            disegnaPiede();
            if (torna && torna.fase === 'risposta') {
                if (ordine) selezionate = new Set(torna.selezionate);
                mostra({ scorri: false });
            }
        }

        // Una carta già valutata in questa sessione: domanda e risposta, con la valutazione data
        function disegnaPassata() {
            if (!sessione.storia.length) return disegna();
            pos = limita(pos, 0, sessione.storia.length - 1);
            const voce = sessione.storia[pos];
            c = Dati.carta(voce.id);
            if (!c) { sessione.storia.splice(pos, 1); return pos >= sessione.storia.length ? disegna() : disegnaPassata(); }
            VistaMappa.chiudiTutte();
            fase = 'passata';
            ordine = null;
            selezionate = new Set();
            suggerita = null;
            corpo.innerHTML = scena(c, voce);
            disegnaPiede();
            const boxMappa = $('[data-risposta-mappa]', corpo);
            if (boxMappa) VistaMappa.monta(boxMappa, c);
        }

        const puoIndietro = () => (pos === null ? sessione.storia.length > 0 : pos > 0);
        const puoAvanti = () => pos !== null || sessione.coda.length > 1;
        // Si rivaluta solo l'ultima valutazione di una carta (quelle prima le ha già superate)
        const correggibile = i => !sessione.storia.slice(i + 1).some(x => x.id === sessione.storia[i].id);

        function disegnaPiede() {
            const piede = $('[data-piede]', corpo);
            const frecce = centro => `
                <div class="studio-nav">
                    <button type="button" class="studio-freccia" data-azione="indietro" title="Carta precedente (←)" aria-label="Carta precedente" ${puoIndietro() ? '' : 'disabled'}>${ico('sinistra')}</button>
                    ${centro}
                    <button type="button" class="studio-freccia" data-azione="avanti" title="${pos !== null ? 'Carta successiva (→)' : 'Salta questa carta: la ritrovi in fondo (→)'}" aria-label="${pos !== null ? 'Carta successiva' : 'Salta questa carta'}" ${puoAvanti() ? '' : 'disabled'}>${ico('destra')}</button>
                </div>`;
            if (fase === 'passata') {
                const voce = sessione.storia[pos];
                const si = correggibile(pos);
                const nomeV = `<b>${Srs.VALUTAZIONI[voce.v].nome}</b>`;
                piede.innerHTML = `
                    <p class="domanda-valuta">${si ? `L'hai valutata ${nomeV}: per cambiarla scegli un'altra valutazione` : `L'hai valutata ${nomeV} e poi di nuovo più avanti: qui la puoi solo rivedere`}</p>
                    ${frecce(`<div class="valutazioni">${Srs.VALUTAZIONI.map(v => `
                        <button type="button" class="btn-valuta valuta-${v.chiave}${voce.v === v.valore ? ' data' : ''}" data-azione="correggi" data-v="${v.valore}" ${si ? '' : 'disabled'}>
                            <b>${v.nome}</b><small>${voce.v === v.valore ? 'la tua valutazione' : Srs.anteprima(voce.srsPrima, v.valore, { date: !opzioniSessione.diProva && (voce.prima || (voce.senzaDatePrima && v.valore >= Srs.OK)) })}</small><kbd>${v.valore + 1}</kbd>
                        </button>`).join('')}</div>`)}`;
                return;
            }
            if (fase === 'domanda') {
                piede.innerHTML = frecce(`
                    <div class="studio-nav-centro">
                        ${c.suggerimento ? `<button type="button" class="btn btn-fantasma" data-azione="suggerimento">${ico('lampadina')}Suggerimento</button>` : ''}
                        <button type="button" class="btn btn-primario btn-grande" data-azione="mostra" ${ordine && !selezionate.size ? 'disabled' : ''}>
                            ${ordine ? 'Verifica' : 'Mostra risposta'}<kbd>Spazio</kbd></button>
                    </div>`);
                return;
            }
            piede.innerHTML = `
                <p class="domanda-valuta">Quanto bene la sapevi?</p>
                ${frecce(`<div class="valutazioni">${Srs.VALUTAZIONI.map(v => `
                    <button type="button" class="btn-valuta valuta-${v.chiave}${suggerita === v.valore ? ' suggerita' : ''}" data-azione="valuta" data-v="${v.valore}">
                        <b>${v.nome}</b><small>${Srs.anteprima(c.srs, v.valore, { date: !opzioniSessione.diProva && (!sessione.prime.has(c.id) || sessione.senzaDate.has(c.id)) })}</small><kbd>${v.valore + 1}</kbd>
                    </button>`).join('')}</div>`)}`;
        }

        function mostra({ scorri = true } = {}) {
            if (fase !== 'domanda' || (ordine && !selezionate.size)) return;
            if (ordine) {
                let esatto = true;
                ordine.forEach((r, i) => {
                    const b = $(`[data-i="${i}"]`, corpo);
                    b.disabled = true;
                    if (r.corretta && selezionate.has(i)) b.classList.add('giusta');
                    else if (r.corretta) { b.classList.add('mancata'); esatto = false; }
                    else if (selezionate.has(i)) { b.classList.add('sbagliata'); esatto = false; }
                });
                suggerita = esatto ? Srs.BUONO : Srs.SCARSO;
                const esito = $('[data-esito]', corpo);
                esito.className = 'esito ' + (esatto ? 'esito-giusto' : 'esito-sbagliato');
                esito.innerHTML = esatto ? `${ico('ok-cerchio')}Esatto!`
                    : `${ico('no-cerchio')}Non proprio: ${ordine.filter(r => r.corretta).length > 1 ? 'le risposte corrette sono evidenziate' : 'la risposta corretta è evidenziata'} in verde`;
            }
            fase = 'risposta';
            $('[data-risposta]', corpo).hidden = false;
            // La parte di mappa si disegna adesso che si vede (serve la sua larghezza), com'è la mappa in questo momento
            const boxMappa = $('[data-risposta-mappa]', corpo);
            if (boxMappa) VistaMappa.monta(boxMappa, c);
            const sugg = $('[data-suggerimento]', corpo);
            if (sugg) sugg.hidden = false;
            disegnaPiede();
            if (scorri) $('[data-risposta]', corpo).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function scegli(i) {
            if (fase !== 'domanda' || !ordine || i < 0 || i >= ordine.length) return;
            if (ordine.filter(r => r.corretta).length > 1) { if (selezionate.has(i)) selezionate.delete(i); else selezionate.add(i); }
            else { selezionate.clear(); selezionate.add(i); }
            $$('[data-azione=scegli]', corpo).forEach(b => b.classList.toggle('selezionata', selezionate.has(+b.dataset.i)));
            $('[data-azione=mostra]', corpo).disabled = !selezionate.size;
        }

        // Cascata: appena una madre è imparata, le sue figlie nuove entrano subito dopo
        function sblocca(madre) {
            const figlie = sessione.riserva.filter(x => x.genitoreId === madre.id);
            const posto = Math.min(sessione.quotaNuove, sessione.max - sessione.totale);
            const entrano = figlie.slice(0, Math.max(0, posto));
            if (!entrano.length) return;
            sessione.riserva = sessione.riserva.filter(x => !entrano.includes(x));
            sessione.quotaNuove -= entrano.length;
            sessione.totale += entrano.length;
            sessione.sbloccate += entrano.length;
            sessione.coda.unshift(...entrano.map(x => x.id));
            Ui.toast(`${entrano.length === 1 ? 'Sbloccata 1 domanda più specifica' : `Sbloccate ${entrano.length} domande più specifiche`}`, 'info', 1800);
        }

        function valuta(v) {
            if (fase !== 'risposta') return;
            const eraImparata = Srs.stato(c) === 'imparata';
            const prima = !sessione.prime.has(c.id);
            const senzaDatePrima = sessione.senzaDate.has(c.id);
            // Partita con Scarso (date ferme): la prima volta che arriva almeno a Ok prende N° Rep +1 e ultimo ripasso oggi
            const recupero = !prima && senzaDatePrima && v >= Srs.OK;
            const voce = { id: c.id, v, prima, senzaDatePrima, eraImparata, srsPrima: structuredClone(c.srs || null), ripassoId: uid(), contata: false };
            Dati.registraRisposta(c, v, Date.now() - inizioCarta, { date: prima || recupero, diProva: !!opzioniSessione.diProva, id: voce.ripassoId });
            if (prima) sessione.prime.set(c.id, v);
            if (prima && v === Srs.SCARSO) sessione.senzaDate.add(c.id);
            if (v >= Srs.OK) sessione.senzaDate.delete(c.id);
            sessione.risposte++;
            sessione.valutazioni[v]++;
            sessione.coda.shift();
            if (v >= Srs.BUONO) {
                // Buono o Perfetto: la carta è fatta e non torna
                sessione.fatte++;
                if (!sessione.giaImparate.has(c.id)) { sessione.imparate++; sessione.giaImparate.add(c.id); voce.contata = true; }
                if (!eraImparata) sblocca(c);
            } else {
                // Ok o Scarso: torna in fondo, dopo tutte le altre
                sessione.coda.push(c.id);
            }
            sessione.storia.push(voce);
            passaOltre();
        }

        // Rivaluta una carta già valutata: la nuova valutazione prende il posto di quella data allora
        function correggi(v) {
            if (fase !== 'passata' || !correggibile(pos)) return;
            const voce = sessione.storia[pos];
            const carta = Dati.carta(voce.id);
            if (!carta || voce.v === v) return;
            const vecchia = voce.v;
            if (!opzioniSessione.diProva) {
                carta.srs = Srs.valuta(structuredClone(voce.srsPrima), v, { date: voce.prima || (voce.senzaDatePrima && v >= Srs.OK) });
                Archivio.salva('carte', carta);
            }
            const r = Archivio.prendi('ripassi', voce.ripassoId);
            if (r) Archivio.salva('ripassi', { ...r, valutazione: v });
            sessione.valutazioni[vecchia]--;
            sessione.valutazioni[v]++;
            if (voce.prima) sessione.prime.set(voce.id, v);
            if (voce.prima ? v === Srs.SCARSO : voce.senzaDatePrima && v < Srs.OK) sessione.senzaDate.add(voce.id);
            else sessione.senzaDate.delete(voce.id);
            const eraFatta = vecchia >= Srs.BUONO, fatta = v >= Srs.BUONO;
            if (eraFatta && !fatta) {
                // Ora è Ok o Scarso: torna in fondo alla coda
                sessione.fatte--;
                if (voce.contata) { sessione.imparate--; sessione.giaImparate.delete(voce.id); voce.contata = false; }
                if (!sessione.coda.includes(voce.id)) sessione.coda.push(voce.id);
            } else if (!eraFatta && fatta) {
                // Ora è Buono o Perfetto: esce dalla coda
                sessione.coda = sessione.coda.filter(id => id !== voce.id);
                sessione.fatte++;
                if (!sessione.giaImparate.has(voce.id)) { sessione.imparate++; sessione.giaImparate.add(voce.id); voce.contata = true; }
                if (!voce.eraImparata) sblocca(carta);
            }
            voce.v = v;
            avanzamento();
            disegnaPassata();
            Ui.toast(`Valutazione cambiata: ${Srs.VALUTAZIONI[vecchia].nome} → ${Srs.VALUTAZIONI[v].nome}`, 'successo', 1800);
        }

        // La carta esce con l'animazione e arriva la prossima
        function passaOltre() {
            fase = 'transizione';
            $('.carta-studio', corpo).classList.add('in-uscita');
            setTimeout(disegna, 160);
        }

        // Prima di lasciare la carta di adesso (indietro, mappa) se ne ricorda la fase
        function lasciaAttuale() {
            if (pos !== null || !c || !['domanda', 'risposta'].includes(fase) || sessione.coda[0] !== c.id) return;
            ritorno = { id: c.id, fase, trascorso: Date.now() - inizioCarta, ordine, selezionate: [...selezionate] };
        }

        function indietro() {
            if (!['domanda', 'risposta', 'passata'].includes(fase) || !puoIndietro()) return;
            if (pos === null) { lasciaAttuale(); pos = sessione.storia.length - 1; } else pos--;
            disegnaPassata();
        }

        function avanti() {
            if (fase === 'passata') {
                if (pos + 1 < sessione.storia.length) { pos++; disegnaPassata(); } else disegna();
            } else if (['domanda', 'risposta'].includes(fase) && sessione.coda.length > 1) {
                // Salta: la carta va in fondo alla coda, senza valutazione
                sessione.coda.push(sessione.coda.shift());
                ritorno = null;
                passaOltre();
            }
        }

        // Correzione al volo: la carta si ridisegna com'è adesso, nella stessa fase (se la risposta era già visibile resta
        // visibile; le carte a scelta multipla tornano alla domanda). Il tempo di risposta non riparte
        function modificaCarta() {
            if (!c || !['domanda', 'risposta', 'passata'].includes(fase)) return;
            const carta = c;
            if (fase === 'passata') {
                Viste.editor.modificaVeloce(carta, () => { if (!sessione.finita && fase === 'passata' && c && c.id === carta.id) disegnaPassata(); });
                return;
            }
            const eraRisposta = fase === 'risposta' && !ordine, inizio = inizioCarta;
            Viste.editor.modificaVeloce(carta, () => {
                if (sessione.finita || pos !== null || !sessione.coda.length || sessione.coda[0] !== carta.id) return;
                disegna();
                inizioCarta = inizio;
                if (eraRisposta) mostra();
            });
        }

        // ✕ o Esc: se hai già risposto la sessione finisce qui (riepilogo e revisioni), altrimenti si esce e basta
        function termina() {
            if (sessione.finita || !sessione.risposte) { sessione.finita = true; Router.vai(ambito.ritorno); return; }
            fine();
        }

        function argomentiRegistrati() {
            return Revisioni.registraSessione({ valutate: sessione.prime, parziale: !!opzioniSessione.parziale, perCarta: !!opzioniSessione.perCarta, nonAllineare: sessione.nonAllineare });
        }

        // Revisioni dei set studiati, una volta sola per sessione
        async function revisioni() {
            const box = $('[data-revisioni-fine]', corpo);
            if (opzioniSessione.diProva) {
                if (box) { box.innerHTML = `<h2>${ico('calendario-spunta')}Revisioni</h2><div class="esito-rev"><span>Ripasso di prova: flashcard e revisioni restano com'erano.</span></div>`; box.hidden = false; }
                return;
            }
            let esiti = [];
            try {
                esiti = await argomentiRegistrati();
            } catch (e) {
                console.error(e);
                Ui.toast(`Non sono riuscito ad aggiornare le revisioni: ${e.message || e}`, 'errore', 10000);
            }
            App.aggiornaPiede();
            if (!box || !esiti.length) return;
            const riga = e => {
                const a = Dati.argomento(e.argomentoId);
                return `<div class="esito-rev" data-esito-set="${e.setId}">
                    <b>${esc(a ? a.nome || Dati.set(e.setId).nome : Dati.set(e.setId).nome)}</b>
                    <span>${Revisioni.descriviEsito(e)}</span>
                    ${e.esito === 'da-chiedere' ? `<button type="button" class="btn btn-secondario btn-piccolo" data-azione="segna-comunque" data-argomento="${e.argomentoId}">${ico('spunta')}Segna come ripasso</button>` : ''}
                </div>`;
            };
            box.innerHTML = `<h2>${ico('calendario-spunta')}Revisioni</h2>${esiti.map(riga).join('')}`;
            box.hidden = false;
            box._esiti = esiti;
        }

        // Sessione lasciata per una mappa e poi abbandonata (sei andato altrove): si chiude come con ✕, senza riepilogo
        async function concludiFuori() {
            if (sessione.finita) return;
            sessione.finita = true;
            if (!sessione.risposte || opzioniSessione.diProva) return;
            try {
                const esiti = await argomentiRegistrati();
                App.aggiornaPiede();
                const nome = e => { const a = Dati.argomento(e.argomentoId); return `«${a && a.nome ? a.nome : (Dati.set(e.setId) || {}).nome || 'set'}»`; };
                const parti = esiti.filter(e => e.esito !== 'parziale').map(e => (e.esito === 'rep' ? `${nome(e)}: ripasso segnato`
                    : `${nome(e)}: ${e.fatte} carte su ${e.totale}, non conta come ripasso (dalle Revisioni: ⋯ → Segna il ripasso a mano)`));
                Ui.toast(`Studio interrotto: le valutazioni restano.${parti.length ? ' ' + parti.join(' · ') : ''}`, 'info', parti.length ? 9000 : 4000);
            } catch (e) {
                console.error(e);
                Ui.toast(`Non sono riuscito ad aggiornare le revisioni: ${e.message || e}`, 'errore', 10000);
            }
        }

        function fine() {
            if (sessione.finita) return;
            sessione.finita = true;
            fase = 'fine';
            VistaMappa.chiudiTutte();
            impostaTasti(e => { if (e.key === 'Escape') Router.vai(ambito.ritorno); });
            $('[data-barra]', el).style.width = '100%';
            $('[data-contatore]', el).textContent = '';
            const interrotta = sessione.coda.length > 0;
            const inCoda = [...new Set(sessione.coda)];
            const daRifare = inCoda.filter(id => sessione.prime.has(id)).length;   // Ok o Scarso, rimaste lì
            const nonViste = inCoda.length - daRifare;
            const resto = [daRifare && `${plurale(daRifare, 'carta resta', 'carte restano')} con la valutazione Ok o Scarso`, nonViste && `${plurale(nonViste, 'carta non vista', 'carte non viste')}`].filter(Boolean).join(' · ');
            const massimo = Math.max(1, ...sessione.valutazioni);
            corpo.innerHTML = `
                <div class="studio-fine">
                    <div class="fine-icona">${interrotta ? '✋' : '🎉'}</div>
                    <h1>${interrotta ? 'Sessione terminata' : 'Sessione completata!'}</h1>
                    <p>Hai dato ${plurale(sessione.risposte, 'risposta', 'risposte')} in ${formattaDurata(Date.now() - sessione.inizio)}${sessione.sbloccate ? ` · ${plurale(sessione.sbloccate, 'domanda sbloccata', 'domande sbloccate')} a cascata` : ''}${resto ? ` · ${resto}` : ''}</p>
                    <div class="fine-numeri">
                        <div><b>${sessione.imparate}</b><small>imparate ora</small></div>
                        <div><b>${sessione.prime.size}</b><small>carte viste</small></div>
                    </div>
                    <div class="distribuzione">${Srs.VALUTAZIONI.map(v => `
                        <div class="distribuzione-riga">
                            <span>${v.nome}</span>
                            <div class="distribuzione-barra"><span class="seg-${v.chiave}" style="width:${sessione.valutazioni[v.valore] / massimo * 100}%"></span></div>
                            <b>${sessione.valutazioni[v.valore]}</b>
                        </div>`).join('')}</div>
                    <section class="fine-revisioni" data-revisioni-fine hidden></section>
                    <div class="fine-azioni">
                        <button type="button" class="btn btn-secondario" data-azione="ancora">${ico('ruota')}Continua a studiare</button>
                        <button type="button" class="btn btn-primario" data-azione="esci">Fatto</button>
                    </div>
                </div>`;
            revisioni();
        }

        function suTasto(e) {
            if (e.key === 'Escape') { termina(); return; }
            if (['domanda', 'risposta', 'passata'].includes(fase) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                if (e.key === 'ArrowLeft') indietro(); else avanti();
                return;
            }
            // E = modifica (con 5 o più risposte a scelta la E sceglie la quinta)
            if (e.key.toLowerCase() === 'e' && ['domanda', 'risposta', 'passata'].includes(fase) && !(fase === 'domanda' && ordine && ordine.length > 4)) { e.preventDefault(); modificaCarta(); return; }
            if (fase === 'passata') {
                const v = tastoNumero(e);
                if (v >= 0 && v <= 3) { e.preventDefault(); correggi(v); }
                else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); disegna(); }
            } else if (fase === 'domanda') {
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); mostra(); }
                else if (e.key.toLowerCase() === 'h') { const s = $('[data-suggerimento]', corpo); if (s) s.hidden = false; }
                else if (ordine) {
                    const i = tastoNumero(e);
                    scegli(i >= 0 ? i : LETTERE.toLowerCase().indexOf(e.key.toLowerCase()));
                }
            } else if (fase === 'risposta') {
                const v = tastoNumero(e);
                if (v >= 0 && v <= 3) { e.preventDefault(); valuta(v); }
                else if ((e.key === ' ' || e.key === 'Enter') && suggerita != null) { e.preventDefault(); valuta(suggerita); }
            }
        }

        const azioni = {
            esci: () => Router.vai(ambito.ritorno),
            termina,
            'segna-comunque': async b => {
                b.disabled = true;
                const prima = Dati.argomento(b.dataset.argomento);
                const stessoGiorno = !!prima && prima.ultimoRipasso === chiaveGiorno();
                const a = await Revisioni.segnaComunque(b.dataset.argomento, sessione.prime, sessione.nonAllineare);
                const box = b.closest('.esito-rev');
                if (a && box) {
                    const esito = { setId: a.setId, argomentoId: a.id, esito: 'rep', stessoGiorno };
                    $('span', box).innerHTML = Revisioni.descriviEsito(esito);
                    b.remove();
                }
                App.aggiornaPiede();
            },
            mostra: () => mostra(),
            suggerimento: b => { const s = $('[data-suggerimento]', corpo); if (s) s.hidden = false; b.remove(); },
            scegli: b => scegli(+b.dataset.i),
            'modifica-carta': modificaCarta,
            valuta: b => valuta(+b.dataset.v),
            correggi: b => correggi(+b.dataset.v),
            indietro, avanti,
            attuale: () => { if (fase === 'passata') disegna(); },
            ancora: () => App.ridisegna(),
        };

        aggancia(el);
        disegna();
        inCorso = {
            hash: Router.corrente, titolo: ambito.titolo, contesto: ambito.contesto,
            finita: () => sessione.finita,
            sospendi: lasciaAttuale,
            riprendi: nuovo => { aggancia(nuovo); if (pos !== null) disegnaPassata(); else disegna(); },
            concludi: concludiFuori,
        };
    }

    // ---- Vista ---------------------------------------------------------------

    function mostra(el, params, query) {
        // Di ritorno da una mappa aperta dallo studio: la sessione riprende da dove l'avevi lasciata
        if (sospesa) {
            const s = sospesa;
            sospesa = null;
            if (s.hash === Router.corrente && /^#\/mappa\//.test(Router.precedente)) {
                App.contesto = s.contesto;
                document.title = `Studio · ${s.titolo}`;
                inCorso = s;
                s.riprendi(el);
                return;
            }
            s.concludi();
        }
        const opzioni = query.personalizzata ? leggiOpzioni() : null;
        const ambito = ambitoDa(query, opzioni);
        if (!ambito) {
            el.innerHTML = `<div class="pagina">${Ui.vuoto({ icona: 'avviso', titolo: 'Niente da studiare qui', azioni: `<a class="btn btn-secondario" href="#/home">Torna alla home</a>` })}</div>`;
            return;
        }
        App.contesto = ambito.contesto;
        document.title = `Studio · ${ambito.titolo}`;
        const preparata = preparaSessione(ambito, query, opzioni);

        if (preparata.lista.length) {
            // Fuori dal giorno previsto: prima si sceglie se conta o se è una prova (dietro, la testata dello studio)
            el.innerHTML = `<div class="studio"><header class="studio-testa"><div class="studio-titolo"><b>Studio</b><span>${esc(ambito.titolo)}</span></div></header></div>`;
            // Le carte della riserva (figlie bloccate dalla cascata) entrano durante la sessione: contano per dire se è il
            // ripasso di tutto il set
            // Nell'ordine del set (non casuale né scelto carta per carta) si può mescolare le domande sorelle per questa
            // sessione: si parte dall'impostazione (o dalla scelta della sessione personalizzata)
            const casuale = opzioni ? !!opzioni.ordineCasuale : Dati.impostazioni().ordineCasuale;
            const sorelle = !casuale && !(opzioni && opzioni.ordineIds) && haSorelle(preparata.lista)
                ? { attivo: opzioni && opzioni.mescolaSorelle != null ? !!opzioni.mescolaSorelle : !!Dati.impostazioni().mescolaSorelle } : null;
            Revisioni.chiediSeConta([...preparata.lista, ...preparata.riserva], { parziale: !!(opzioni && opzioni.parziale), perCarta: !!(opzioni && opzioni.perCarta), sorelle }).then(r => {
                if (!document.contains(el)) return;   // nel frattempo sei andato altrove
                if (!r) { Router.vai(ambito.ritorno); return; }
                if (sorelle && r.sorelle) {
                    preparata.lista = mescolaSorelle(preparata.lista);
                    if (opzioni && opzioni.mescolaSet) preparata.lista = alternaSet(preparata.lista);
                }
                studia(el, preparata, ambito, { ...(opzioni || {}), diProva: r.scelta === 'prova' });
            });
            return;
        }

        impostaTasti(e => { if (e.key === 'Escape') Router.vai(ambito.ritorno); });
        const prossima = ambito.carte.map(Srs.prossima).filter(Boolean).sort((a, b) => a - b)[0];
        const vuoto = !ambito.carte.length;
        el.innerHTML = `
            <div class="studio">
                <header class="studio-testa">
                    <button type="button" class="btn-icona" data-azione="esci" title="Esci (Esc)" aria-label="Esci">${ico('chiudi')}</button>
                    <div class="studio-titolo"><b>Studio</b><span>${esc(ambito.titolo)}</span></div>
                </header>
                <div class="studio-corpo">
                    <div class="studio-fine">
                        <div class="fine-icona">${vuoto ? '🗂️' : '✅'}</div>
                        <h1>${vuoto ? 'Non ci sono ancora flashcard' : opzioni ? 'Nessuna carta corrisponde' : 'Tutto ripassato!'}</h1>
                        <p>${vuoto ? 'Crea o importa qualche flashcard per iniziare.'
                            : opzioni ? 'Cambia le scelte della sessione personalizzata.'
                                : `Non ci sono carte da ripassare adesso.${prossima ? ` Il prossimo ripasso è ${distanzaGiorni(prossima)}.` : ''}`}</p>
                        <div class="fine-azioni">
                            ${!vuoto && !opzioni ? `<button type="button" class="btn btn-primario" data-azione="tutte">${ico('ruota')}Ripassa comunque tutte le carte</button>` : ''}
                            <button type="button" class="btn btn-fantasma" data-azione="esci">Torna indietro</button>
                        </div>
                    </div>
                </div>
            </div>`;
        Ui.collegaAzioni(el, {
            esci: () => Router.vai(ambito.ritorno),
            tutte: () => {
                salvaOpzioni({ ordineCasuale: Dati.impostazioni().ordineCasuale });
                Router.vai(`/studio?${ambito.parametro}&personalizzata=1`);
            },
        });
    }

    // Lasciando lo studio a metà (per una mappa, o con il tasto Indietro del browser) la sessione resta sospesa: riprende
    // se torni dalla mappa, altrimenti si conclude appena apri un'altra pagina (concludiSospesa, da App.mostra)
    function esci() {
        if (tasti) document.removeEventListener('keydown', tasti);
        tasti = null;
        if (inCorso && !inCorso.finita()) { inCorso.sospendi(); sospesa = inCorso; }
        inCorso = null;
    }

    function concludiSospesa() {
        if (!sospesa) return;
        const s = sospesa;
        sospesa = null;
        s.concludi();
    }

    function haSospesa() { return !!sospesa; }

    // Ripasso deciso da fuori (revisioni): carte precise di uno o più set.
    // parziale = solo le carte da sistemare, perCarta = dal pannello delle flashcard: N° Rep dei set non cambia;
    // mescolaSet = le carte dei set si alternano (Ripassa più set); ordineIds = le carte nell'ordine di ids (Studio
    // libero); ordineCasuale = mescolate
    function avvia({ setIds, ids, titolo = '', ritorno = '', parziale = false, perCarta = false, mescolaSet = false, ordineIds = false, ordineCasuale = false }) {
        salvaOpzioni({ setIds, ids, ordineCasuale, titolo, ritorno, parziale, perCarta, mescolaSet, ordineIds });
        Router.vai(`/studio?${setIds.length === 1 ? 'set=' + setIds[0] : 'ambito=tutto'}&personalizzata=1`);
    }

    // ---- Sessione personalizzata ------------------------------------------------

    function personalizza({ setId = null, materiaId = null } = {}) {
        const imp = Dati.impostazioni();
        const materiaCorrente = setId ? (Dati.set(setId) || {}).materiaId : materiaId;
        const iniziali = setId ? [setId, ...Dati.discendentiSet(setId)]
            : materiaId ? Dati.setDiMateria(materiaId).map(s => s.id)
                : Dati.tuttiSet().map(s => s.id);
        const scelti = new Set(iniziali);
        const escluse = new Set();          // stati delle carte tolti dall'utente
        const tagScelti = new Set();
        let quante = 0, ordineCasuale = imp.ordineCasuale, mescolaSorelle = !imp.ordineCasuale && !!imp.mescolaSorelle;

        // La materia da cui si parte viene per prima e aperta
        const materie = Dati.materie().filter(m => Dati.setRadice(m.id).length)
            .sort((a, b) => (b.id === materiaCorrente) - (a.id === materiaCorrente));

        const pool = () => Dati.carteDiSetMultipli([...scelti]);
        const filtrate = () => {
            const carte = pool();
            const tagPresenti = new Set(Dati.tagDi(carte));
            const tag = [...tagScelti].filter(t => tagPresenti.has(t));
            return filtraPerOpzioni(carte, { categorie: CATEGORIE.filter(k => !escluse.has(k)), tag });
        };

        Ui.modale({
            titolo: 'Sessione personalizzata',
            corpo: `
                <div class="campo"><span class="etichetta">Set <em>uno o più; spuntando un set prendi anche i suoi sotto-set</em></span>
                    <div class="scelta-set">
                        ${materie.map(m => `
                            <details class="gruppo-set" ${!materiaCorrente || m.id === materiaCorrente ? 'open' : ''}>
                                <summary>${esc(m.emoji)} ${esc(m.nome)}<small data-conta-materia="${m.id}"></small></summary>
                                ${Dati.alberoSet(m.id).map(n => `
                                    <label class="voce-set" style="--livello:${n.livello}">
                                        <input type="checkbox" value="${n.set.id}" ${scelti.has(n.set.id) ? 'checked' : ''}>
                                        <span>${esc(n.set.nome)}</span><small>${Dati.carteDiSet(n.set.id).length}</small>
                                    </label>`).join('')}
                            </details>`).join('')}
                    </div>
                    <div class="azioni-riga azioni-scelta-set">
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-tutti-set="1">Seleziona tutti</button>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-tutti-set="0">Nessuno</button>
                    </div>
                </div>
                <div class="campo"><span class="etichetta">Quali carte</span>
                    <div class="chips-scelta" data-categorie></div>
                </div>
                <div class="campo" data-campo-tag><span class="etichetta">Tag <em>nessuno selezionato = tutti</em></span>
                    <div class="chips-scelta" data-tag></div>
                </div>
                <div class="riga-campi">
                    <label class="campo"><span class="etichetta">Numero massimo <em>0 = tutte</em></span>
                        <input type="number" name="quante" min="0" step="1" value="0"></label>
                    <label class="campo"><span class="etichetta">Ordine</span>
                        <select name="ordine">
                            <option value="set" ${ordineCasuale || mescolaSorelle ? '' : 'selected'}>Ordine del set (a cascata)</option>
                            <option value="sorelle" ${mescolaSorelle ? 'selected' : ''}>Ordine del set, sorelle mescolate</option>
                            <option value="casuale" ${ordineCasuale ? 'selected' : ''}>Casuale</option>
                        </select></label>
                </div>
                <p class="conteggio-sessione" data-conteggio></p>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Inizia', classe: 'btn-primario', principale: true, clic: m => {
                    const carte = pool();
                    const tagPresenti = new Set(Dati.tagDi(carte));
                    if (!filtrate().length) return;
                    salvaOpzioni({
                        setIds: [...scelti], categorie: CATEGORIE.filter(k => !escluse.has(k)),
                        tag: [...tagScelti].filter(t => tagPresenti.has(t)), quante, ordineCasuale, mescolaSorelle,
                    });
                    m.chiudi();
                    const parametro = setId ? 'set=' + setId : materiaId ? 'materia=' + materiaId : 'ambito=tutto';
                    Router.vai(`/studio?${parametro}&personalizzata=1`);
                } },
            ],
            alApri: el => {
                const aggiorna = () => {
                    const carte = pool();
                    const c = Dati.conteggi(carte);
                    $('[data-categorie]', el).innerHTML = CATEGORIE.map(k =>
                        `<button type="button" class="chip-scelta${!escluse.has(k) && c[k] ? ' attivo' : ''}" data-categoria="${k}" ${c[k] ? '' : 'disabled'}>
                            <i class="pallino pallino-${k}"></i>${NOMI_CATEGORIE[k]}<small>${c[k]}</small></button>`).join('');
                    const tag = Dati.tagDi(carte);
                    $('[data-campo-tag]', el).hidden = !tag.length;
                    $('[data-tag]', el).innerHTML = tag.map(t =>
                        `<button type="button" class="chip-scelta${tagScelti.has(t) ? ' attivo' : ''}" data-valore-tag="${esc(t)}">${esc(t)}</button>`).join('');
                    materie.forEach(mt => {
                        const n = Dati.setDiMateria(mt.id).filter(s => scelti.has(s.id)).length;
                        const box = $(`[data-conta-materia="${mt.id}"]`, el);
                        if (box) box.textContent = n ? `${n} scelt${n === 1 ? 'o' : 'i'}` : '';
                    });
                    const n = Math.min(filtrate().length, quante || Infinity);
                    $('[data-conteggio]', el).innerHTML = n ? `<b>${plurale(n, 'carta', 'carte')}</b> in questa sessione` : 'Nessuna carta corrisponde alle scelte';
                    $('.modale-piede .btn-primario', el).disabled = !n;
                };

                el.addEventListener('change', e => {
                    const box = e.target.closest('.voce-set input');
                    if (!box) return;
                    // Spuntare un set porta con sé i suoi sotto-set
                    [box.value, ...Dati.discendentiSet(box.value)].forEach(id => {
                        if (box.checked) scelti.add(id); else scelti.delete(id);
                        const altro = $(`.voce-set input[value="${id}"]`, el);
                        if (altro) altro.checked = box.checked;
                    });
                    aggiorna();
                });
                el.addEventListener('click', e => {
                    const tutti = e.target.closest('[data-tutti-set]');
                    const cat = e.target.closest('[data-categoria]');
                    const tag = e.target.closest('[data-valore-tag]');
                    if (tutti) {
                        const si = tutti.dataset.tuttiSet === '1';
                        $$('.voce-set input', el).forEach(x => { x.checked = si; if (si) scelti.add(x.value); else scelti.delete(x.value); });
                    } else if (cat) {
                        const k = cat.dataset.categoria;
                        if (escluse.has(k)) escluse.delete(k); else escluse.add(k);
                    } else if (tag) {
                        const t = tag.dataset.valoreTag;
                        if (tagScelti.has(t)) tagScelti.delete(t); else tagScelti.add(t);
                    } else return;
                    aggiorna();
                });
                $('[name=quante]', el).addEventListener('input', e => { quante = Math.max(0, parseInt(e.target.value, 10) || 0); aggiorna(); });
                $('[name=ordine]', el).addEventListener('change', e => { ordineCasuale = e.target.value === 'casuale'; mescolaSorelle = e.target.value === 'sorelle'; });
                aggiorna();
            },
        });
    }

    return { nav: null, titolo: 'Studio', schermoIntero: true, mostra, esci, personalizza, avvia, concludiSospesa, haSospesa };
})();
