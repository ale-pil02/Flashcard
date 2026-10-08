// Tour: tutorial interattivo che gira nell'app vera usando i dati di prova (js/prova.js). A ogni passo apre la pagina
// giusta, mette in luce un elemento e spiega con gli scenari di prova (puntuale, in ritardo, in anticipo, già ripassato
// oggi, mai ripassato, flashcard sfasate). Non blocca la pagina: mentre leggi puoi cliccare e provare; i numeri del
// testo si calcolano dai dati di quel momento. Si propone dopo il caricamento dei dati di prova (Impostazioni).

const Tour = (() => {
    const ico = (...a) => Ui.ico(...a);
    const giorni = n => plurale(n, 'giorno', 'giorni');
    let passo = 0, scheda = null, luce = null, timer = null, bersaglio = [];

    // ---- Dati di prova --------------------------------------------------------------------

    const arg = nome => Dati.tuttiGliArgomenti().find(a => a.prova && a.nome === nome) || null;
    const setDi = nome => Dati.tuttiSet().find(s => s.prova && s.nome === nome) || null;
    const carta = inizio => Dati.tutteLeCarte().find(c => c.prova && testoDaHtml(c.domanda).startsWith(inizio)) || null;
    const mappa = () => Mappe.tutte().find(m => m.prova) || null;
    const riga = nome => { const a = arg(nome); return a ? $(`tr[data-id="${a.id}"]`) : null; };
    const data = (giorno, intervallo) => Revisioni.dataBreve(aggiungiGiorni(daChiaveGiorno(giorno), intervallo));
    // Se lo ripassi oggi con un ripasso effettivo: { tra, il } della prossima revisione
    const seConta = a => {
        const x = Srs.dopoRipasso({ intervallo: Revisioni.intervallo(a), giorno: a.ultimoRipasso });
        return { tra: giorniTra(Date.now(), aggiungiGiorni(daChiaveGiorno(x.giorno), x.intervallo)), il: data(x.giorno, x.intervallo) };
    };

    const PASSI = [
        {
            titolo: 'Benvenuto: le revisioni dei set',
            rotta: '/revisioni', prima: () => Object.assign(Viste.revisioni, { pannello: 'set', scheda: 'tutte' }),
            trova: () => $('.tabella-revisioni'),
            testo: () => `<p>Ogni set ha una riga: <b>Prossima revisione = Ultimo ripasso + Intervallo</b>. Ripassando il giorno giusto
                l'intervallo segue la sequenza (${esc(Srs.anteprimaSequenza(6).join(', '))}… giorni).</p>
                <p>Nei dati di prova ogni set ha uno scenario diverso: lo leggi nella colonna <b>Schema / fonte</b>. Mentre segui il
                tutorial puoi cliccare e provare; con <b>Avanti</b> ti porto al passo successivo.</p>`,
        },
        {
            titolo: 'Puntuale: si ripassa oggi',
            rotta: '/revisioni', trova: () => riga('Bowlby'),
            testo: () => {
                const a = arg('Bowlby');
                if (!a) return '<p>Il set «Bowlby» non c\'è più nei dati di prova.</p>';
                const x = seConta(a);
                return `<p>«Bowlby» è alla rep ${a.ripetizioni} con un intervallo di ${giorni(Revisioni.intervallo(a))}: ${esc(Revisioni.avviso(a).testo.toLowerCase())}.</p>
                    <p>Con ${ico('fulmine')} nella colonna Ripasso parte lo studio del set. Prima di iniziare l'app ti chiede sempre se è un <b>ripasso effettivo</b> o <b>di prova</b>. Se è effettivo e valuti tutte le
                    carte diventa rep ${a.ripetizioni + 1} e la prossima revisione è tra ${giorni(x.tra)} (il ${x.il}).</p>`;
            },
        },
        {
            titolo: 'In ritardo: dipende da com\'è andata',
            rotta: '/revisioni', trova: () => riga('Ainsworth e la Strange Situation'),
            testo: () => {
                const a = arg('Ainsworth e la Strange Situation');
                if (!a) return '<p>Il set «Ainsworth» non c\'è più nei dati di prova.</p>';
                const e = Revisioni.esitiSeConta(a);
                return `<p>«Ainsworth» doveva essere ripassato ${esc(distanzaGiorni(Revisioni.prossima(a)))}. Premendo ${ico('fulmine')} l'app te lo dice e chiede se
                    è un ripasso effettivo o di prova. Se è effettivo, la prossima revisione dipende da com'è andata:</p>
                    <ul class="tour-elenco"><li>set <b>Ottimo</b>: tra ${giorni(e.perfetto.tra)}, perché ricordare dopo più tempo dice che la memoria è solida;</li>
                    <li>set <b>Buono</b>: tra ${giorni(e.buono.tra)};</li>
                    <li>set <b>Ok, Scarso o incompleto</b>: tra ${giorni(e.male.tra)}, perché nel frattempo hai dimenticato qualcosa.</li></ul>
                    <p>Con <b>Ripasso di prova</b> invece studi, ma set e carte restano com'erano.</p>`;
            },
        },
        {
            titolo: 'In anticipo: la data va avanti, ma meno',
            rotta: '/revisioni', trova: () => riga('Capitolo 3 – Sviluppo delle emozioni'),
            testo: () => {
                const a = arg('Capitolo 3 – Sviluppo delle emozioni');
                if (!a) return '<p>Il set del Capitolo 3 non c\'è più nei dati di prova.</p>';
                const x = seConta(a);
                return `<p>Il Capitolo 3 andrebbe ripassato ${esc(distanzaGiorni(Revisioni.prossima(a)))} (il ${Revisioni.dataBreve(Revisioni.prossima(a))}).
                    Se lo ripassi adesso con un ripasso effettivo, la prossima revisione sarà il ${x.il}: la data va avanti, ma meno che aspettando,
                    perché il ripasso vale solo per la parte di intervallo che hai aspettato.</p>`;
            },
        },
        {
            titolo: 'Già ripassato oggi',
            rotta: '/revisioni', trova: () => riga('Capitolo 4 – Teoria della mente'),
            testo: () => `<p>Il Capitolo 4 è già stato ripassato oggi. Se lo ripassi di nuovo e scegli <b>Ripasso effettivo</b>, il N° Rep sale di 1 ma la data resta:
                un secondo ripasso nello stesso giorno non allunga la memoria. Se vuoi solo esercitarti, scegli <b>Ripasso di prova</b>.</p>`,
        },
        {
            titolo: 'Mai ripassato: si parte dalla rep 1',
            rotta: '/revisioni', trova: () => riga('Capitolo 1 – Il temperamento'),
            testo: () => `<p>Il Capitolo 1 non è mai stato ripassato: con un ripasso effettivo diventa rep 1 e la revisione successiva è il giorno dopo.</p>
                <p>Le sue flashcard sono ad albero: nello studio a cascata le domande figlie arrivano dopo che hai imparato la madre. I tag
                (generale, sottoramo, concetto 1, dettaglio) dicono a che livello sta ogni carta.</p>`,
        },
        {
            titolo: 'Tutto si cambia anche a mano',
            rotta: '/revisioni', trova: () => { const r = riga('Bowlby'); return r ? [$('.col-num', r), $('.col-prossima', r)] : null; },
            testo: () => `<p><b>N° Rep</b>: cambiandolo, l'intervallo torna quello della sequenza per quella rep. <b>Ultimo ripasso</b> e
                <b>Intervallo</b>: la prossima revisione è la loro somma. <b>Prossima revisione</b>: scegli la data e l'intervallo si adegua.</p>
                <p>Le modifiche a mano valgono sempre. Se sbagli: menu ${ico('altro')} → Modifiche recenti.</p>`,
        },
        {
            titolo: 'Per flashcard: tutte le carte',
            rotta: '/revisioni', prima: () => Object.assign(Viste.revisioni, { pannello: 'carte', scheda: 'tutte', soloSfasate: false }),
            trova: () => [$('.filtro-carte-rev'), $('.tabella-carte-rev')],
            testo: () => `<p>Anche ogni flashcard ha le sue date, con il suo N° Rep. La colonna <b>Rispetto al set</b> dice se la carta va al passo con il
                suo set o di quanto è sfasata.</p><p>Nel ripasso completo di un set, le carte che valuti Buono o Perfetto prendono la data del set.</p>`,
        },
        {
            titolo: 'Solo le sfasate',
            rotta: '/revisioni', prima: () => Object.assign(Viste.revisioni, { pannello: 'carte', scheda: 'tutte', soloSfasate: true }),
            trova: () => $('.tabella-carte-rev') || $('[data-tabella]'),
            testo: () => {
                const voci = Revisioni.carteDevianti().filter(v => v.carta.prova).slice(0, 5);
                return `<p>Con <b>Solo sfasate</b> restano le carte che vanno per conto loro${voci.length ? ', per esempio:' : '.'}</p>
                    ${voci.length ? `<ul class="tour-elenco">${voci.map(v => `<li><b>${esc(v.sfasatura.testo)}</b> · ${esc(Ui.tronca(testoDaHtml(v.carta.domanda), 60))}</li>`).join('')}</ul>` : ''}
                    <p>Ok le fa tornare un po' prima, Scarso le rende da rifare. <b>Ripassa le sfasate da fare</b> le studia tutte insieme;
                    <b>Riadegua al set</b> rimette una carta al passo senza ripassarla.</p>`;
            },
        },
        {
            titolo: 'La pagina di una flashcard',
            rotta: () => { const c = carta('Che cosa si intende per regolazione emotiva'); return c ? '/carta/' + c.id : '/libreria'; },
            trova: () => [$('.campo-valutazione'), $('.campo-ripasso')],
            testo: () => `<p>In fondo a ogni flashcard trovi la valutazione e la ripetizione spaziata: N° Rep, ultimo ripasso, intervallo e prossima
                revisione. Si cambiano a mano e valgono subito. Questa carta del Capitolo 3 è stata valutata Ok: per questo torna un po' prima del suo set.</p>`,
        },
        {
            titolo: 'Le revisioni dentro il set',
            rotta: () => { const s = setDi('Capitolo 3 – Sviluppo delle emozioni'); return s ? '/set/' + s.id : '/libreria'; },
            prima: () => Object.assign(Viste.set, { pannelloRevisioni: 'carte', soloSfasate: false }),
            trova: () => $('.sezione-revisioni'),
            testo: () => `<p>Ogni set ha la sua sezione Revisioni, con <b>Per argomento</b> e <b>Per flashcard</b> (anche qui c'è «Solo sfasate»): vedi e
                cambi solo le righe e le carte di questo set e dei suoi sotto-set.</p>`,
        },
        {
            titolo: 'Flashcard dai nodi di una mappa',
            rotta: () => { const m = mappa(); return m ? '/mappa/' + m.id : '/mappe'; },
            trova: () => $('[data-a="flashcard"]'),
            testo: () => `<p>Seleziona uno o più nodi (Maiusc o Ctrl + clic, oppure Maiusc + trascina) e premi questo pulsante: l'assistente IA
                scrive le flashcard di quei nodi, con tag e rientri come la creazione flashcard per profondità, già collegate alla mappa. Serve la chiave di Gemini
                (Impostazioni → Assistente IA).</p>
                <p>Con il pulsante Immagine puoi anche mettere un'immagine <b>fluttuante</b>: segue il suo nodo, ma spostandola non sposti i nodi.</p>`,
        },
        {
            titolo: 'La sequenza degli intervalli',
            rotta: '/impostazioni', trova: () => $('#impostazioni-revisioni'),
            testo: () => `<p>Qui scegli la sequenza: Fibonacci (predefinita), Raddoppio o i numeri che vuoi. Vale dal prossimo ripasso;
                «Applica» ricalcola anche le revisioni che hai già. Più su, nella sezione Studio, le carte per sessione (anche senza limite).</p>`,
        },
        {
            titolo: 'Ora tocca a te',
            rotta: '/revisioni', prima: () => Object.assign(Viste.revisioni, { pannello: 'set', scheda: 'tutte' }),
            testo: () => `<ol class="tour-elenco">
                    <li>Ripassa «Bowlby» con ${ico('fulmine')}: è puntuale, scegli «Ripasso effettivo».</li>
                    <li>Prova <b>Ripassa più set</b> (in alto, nelle Revisioni) con le carte mescolate.</li>
                    <li>Ripassa «Ainsworth»: guarda l'avviso del ritardo e, alla fine, la nuova data.</li>
                    <li>Ripassa il Capitolo 4 scegliendo «Ripasso di prova»: non cambia niente.</li>
                    <li>Apri «Per flashcard» → «Solo sfasate» e guarda dove sono finite le carte Ok e Scarso.</li>
                </ol>
                <p>Quando hai finito: Impostazioni → Dati di prova → Rimuovi. La guida «Come funziona» resta in Revisioni.</p>`,
        },
    ];

    // ---- Disegno ----------------------------------------------------------------------------

    function elementi(p) {
        let x = null;
        try { x = p.trova ? p.trova() : null; } catch (e) { x = null; }
        return (Array.isArray(x) ? x : [x]).filter(e => e && document.contains(e) && e.getClientRects().length);
    }

    function unione(lista) {
        const r = lista.map(e => e.getBoundingClientRect());
        if (!r.length) return null;
        return { left: Math.min(...r.map(x => x.left)), top: Math.min(...r.map(x => x.top)), right: Math.max(...r.map(x => x.right)), bottom: Math.max(...r.map(x => x.bottom)) };
    }

    function posiziona() {
        if (!scheda) return;
        // Nello studio il tutorial si fa da parte: torna quando esci dalla sessione
        const nascosto = document.body.dataset.vista === 'studio';
        scheda.hidden = nascosto;
        const r = !nascosto && unione(bersaglio.filter(e => document.contains(e)));
        luce.hidden = !r;
        const vw = innerWidth, vh = innerHeight, m = 16;
        const w = scheda.offsetWidth, h = scheda.offsetHeight;
        if (r) {
            const g = 6;
            Object.assign(luce.style, { left: r.left - g + 'px', top: r.top - g + 'px', width: r.right - r.left + 2 * g + 'px', height: r.bottom - r.top + 2 * g + 'px' });
        }
        let x, y;
        if (vw < 640 || !r) { x = vw < 640 ? m : vw - w - 24; y = vh - h - (vw < 640 ? m : 24); }
        else if (r.bottom + 14 + h < vh - m) { x = r.left; y = r.bottom + 14; }
        else if (r.top - 14 - h > m) { x = r.left; y = r.top - 14 - h; }
        else if (r.right + 14 + w < vw - m) { x = r.right + 14; y = r.top; }
        else { x = vw - w - 24; y = vh - h - 24; }
        scheda.style.left = limita(x, m, Math.max(m, vw - w - m)) + 'px';
        scheda.style.top = limita(y, m, Math.max(m, vh - h - m)) + 'px';
    }

    function disegnaScheda() {
        const p = PASSI[passo];
        scheda.innerHTML = `
            <div class="tour-testa"><span class="tour-numero">${ico('lampadina')}Tutorial · ${passo + 1} di ${PASSI.length}</span>
                <button type="button" class="btn-icona" data-tour="esci" title="Esci dal tutorial" aria-label="Esci dal tutorial">${ico('chiudi')}</button></div>
            <h3>${esc(p.titolo)}</h3>
            <div class="tour-testo">${p.testo()}</div>
            <div class="tour-piede">
                <button type="button" class="btn btn-fantasma btn-piccolo" data-tour="indietro" ${passo ? '' : 'hidden'}>${ico('sinistra')}Indietro</button>
                <span class="spinta"></span>
                ${passo < PASSI.length - 1
                    ? `<button type="button" class="btn btn-primario btn-piccolo" data-tour="avanti">Avanti${ico('destra')}</button>`
                    : '<button type="button" class="btn btn-primario btn-piccolo" data-tour="esci">Fine</button>'}
            </div>`;
    }

    // Aspetta che la pagina mostri l'elemento del passo (dopo un cambio di pagina ci vuole un attimo)
    function attendi(p, ms = 2500) {
        return new Promise(fatto => {
            const fine = Date.now() + ms;
            const prova = () => { const e = elementi(p); if (e.length || Date.now() > fine) fatto(e); else setTimeout(prova, 80); };
            prova();
        });
    }

    async function vai(i) {
        passo = limita(i, 0, PASSI.length - 1);
        const p = PASSI[passo];
        const voluto = passo;
        if (p.prima) p.prima();
        const rotta = typeof p.rotta === 'function' ? p.rotta() : p.rotta;
        if (rotta && Router.corrente !== '#' + rotta) Router.vai(rotta);
        else if (p.prima) App.ridisegna();
        bersaglio = [];
        disegnaScheda();
        posiziona();
        const trovati = await attendi(p);
        if (voluto !== passo || !scheda) return;
        bersaglio = trovati;
        if (trovati[0]) trovati[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        disegnaScheda();   // il testo si ricalcola sui dati della pagina appena aperta
        posiziona();
    }

    function avvia(da = 0) {
        if (!DatiProva.presenti()) { Ui.toast('Il tutorial usa i dati di prova: caricali da Impostazioni → Dati di prova', 'info', 5000); return; }
        esci();
        // Le tabelle si mostrano intere: niente filtri di set e stato
        FiltriRevisioni.azzera('set'); FiltriRevisioni.azzera('carte');
        luce = document.createElement('div');
        luce.className = 'tour-luce';
        luce.hidden = true;
        scheda = document.createElement('div');
        scheda.className = 'tour-scheda';
        scheda.setAttribute('role', 'dialog');
        scheda.setAttribute('aria-label', 'Tutorial');
        document.body.append(luce, scheda);
        scheda.addEventListener('click', e => {
            const b = e.target.closest('[data-tour]');
            if (!b) return;
            if (b.dataset.tour === 'esci') esci();
            else vai(passo + (b.dataset.tour === 'avanti' ? 1 : -1));
        });
        addEventListener('resize', posiziona);
        addEventListener('scroll', posiziona, true);
        timer = setInterval(posiziona, 300);
        vai(da);
    }

    function esci() {
        clearInterval(timer);
        timer = null;
        removeEventListener('resize', posiziona);
        removeEventListener('scroll', posiziona, true);
        if (scheda) scheda.remove();
        if (luce) luce.remove();
        scheda = luce = null;
        bersaglio = [];
    }

    // Dopo il caricamento dei dati di prova
    function proponi() {
        Ui.modale({
            titolo: 'Vuoi un tutorial?', classe: 'modale-piccola',
            corpo: `<p>Ti mostro come funzionano flashcard e revisioni direttamente nell'app, usando i dati di prova appena caricati:
                un set puntuale, uno in ritardo, uno in anticipo, uno già ripassato oggi, le flashcard sfasate e la mappa.</p>
                <p class="nota">Puoi cliccare e provare mentre lo segui, e uscire quando vuoi. Lo ritrovi in Impostazioni → Dati di prova.</p>`,
            azioni: [
                { testo: 'No, grazie', classe: 'btn-fantasma' },
                { testo: `${ico('lampadina')}Sì, iniziamo`, classe: 'btn-primario', principale: true, clic: m => { m.chiudi(); avvia(); } },
            ],
        });
    }

    return { avvia, esci, proponi, get attivo() { return !!scheda; } };
})();
