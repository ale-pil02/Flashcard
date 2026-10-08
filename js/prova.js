// Dati di prova per provare e correggere l'app: materie, set con sotto-set, domande ad albero,
// carte in ogni stato di studio, un mese di storico e qualche esame.
// Ogni oggetto ha "prova: true", così Rimuovi toglie solo questi e lascia intatti i dati veri.

const DatiProva = (() => {
    // Nodo: [domanda, risposta (testo o lista di [testo, corretta]), tag, figlie?, extra?]
    const CONTENUTI = [
        {
            materia: ['Psicologia dello sviluppo (prova)', '🧠', '#5b4ff5'],
            set: [
                {
                    nome: 'Capitolo 1 – Il temperamento', descrizione: 'Tutto nuovo: serve a provare lo studio a cascata', stati: 'nuove',
                    carte: [
                        ['Qual è l\'impianto complessivo della trattazione sul temperamento?',
                            'Il temperamento come base biologica della personalità: i modelli di Thomas e Chess, di Kagan e di Rothbart, la stabilità nel tempo e l\'interazione con l\'ambiente.', 'generale', [
                                ['In che cosa consiste lo studio longitudinale di New York e su quali aspetti si fonda?',
                                    'Studio avviato nel 1956 su 133 bambini seguiti dall\'infanzia all\'età adulta, con interviste ai genitori e osservazioni: individua nove dimensioni comportamentali e tre profili temperamentali.', 'sottoramo', [
                                        ['Su quali dimensioni Thomas e Chess hanno costruito la valutazione del temperamento, e che cosa misura ciascuna?',
                                            'Livello di attività, ritmicità, approccio/ritiro, adattabilità, intensità della reazione, soglia di responsività, qualità dell\'umore, distraibilità, durata dell\'attenzione e persistenza.', 'concetto 1', [
                                                ['Nella griglia di Thomas e Chess, che cosa valuta la dimensione del livello di attività?',
                                                    'La quantità di movimento e la proporzione tra periodi attivi e inattivi.', 'dettaglio'],
                                                ['Nella griglia di Thomas e Chess, a che cosa si riferisce la ritmicità?',
                                                    'Alla regolarità delle funzioni biologiche: sonno e veglia, fame, evacuazione.', 'dettaglio'],
                                            ]],
                                        ['Quali profili temperamentali infantili hanno isolato Thomas e Chess e come si caratterizza ciascuno?',
                                            'Facile (circa 40%): regolare, positivo, si adatta. Difficile (circa 10%): irregolare, reazioni intense e negative. Lento a scaldarsi (circa 15%): poco attivo, all\'inizio si ritira ma poi si adatta. Gli altri non sono classificabili.', 'concetto 1'],
                                        ['Come viene definita la bontà di adattamento?',
                                            'L\'adattamento migliore nasce dalla corrispondenza tra il temperamento del bambino e le richieste e aspettative del suo ambiente.', 'dettaglio', null,
                                            { suggerimento: 'Goodness of fit' }],
                                    ]],
                                ['Nel modello di Kagan, in che cosa consiste l\'inibizione comportamentale e come si manifesta?',
                                    'Una tendenza stabile a reagire con timore, ritiro e cautela davanti a persone, oggetti e situazioni non familiari; già a 4 mesi si osserva come alta reattività.', 'sottoramo', [
                                        ['Quali correlati fisiologici accompagnano l\'inibizione comportamentale?',
                                            'Maggiore attivazione dell\'amigdala, battito cardiaco più alto e meno variabile, cortisolo elevato, dilatazione pupillare.', 'dettaglio'],
                                    ]],
                                ['Come viene impostato il modello di Rothbart e su quali dimensioni si fonda?',
                                    'Il temperamento come differenze individuali di reattività e autoregolazione, su tre dimensioni: estroversione, affettività negativa, controllo volontario.', 'sottoramo', [
                                        ['Che cosa si intende per controllo volontario?',
                                            'La capacità di inibire una risposta dominante per attivarne una meno immediata: dirigere e spostare l\'attenzione, frenare un comportamento.', 'dettaglio', null,
                                            { spiegazione: 'In inglese effortful control: matura soprattutto tra i 2 e i 7 anni, insieme alle reti attentive frontali.' }],
                                    ]],
                            ]],
                    ],
                },
                {
                    nome: 'Capitolo 2 – L\'attaccamento', descrizione: 'Con due sotto-set e carte in stati diversi', stati: 'misti',
                    carte: [
                        ['Qual è l\'impianto complessivo della trattazione sull\'attaccamento?',
                            'La teoria di Bowlby (sistema comportamentale, fasi, modelli operativi interni) e la ricerca di Ainsworth (Strange Situation, stili di attaccamento, sensibilità materna).', 'generale'],
                    ],
                    sottoSet: [
                        {
                            nome: 'Bowlby', stati: 'misti',
                            carte: [
                                ['In che cosa consiste la teoria dell\'attaccamento di Bowlby e su quali presupposti si fonda?',
                                    'L\'attaccamento è un sistema comportamentale innato, di origine evolutiva, che mantiene la vicinanza a una figura protettiva; integra etologia, psicoanalisi e teoria dei sistemi.', 'sottoramo', [
                                        ['Attraverso quali fasi si sviluppa l\'attaccamento secondo Bowlby?',
                                            'Pre-attaccamento (0-2 mesi), attaccamento in formazione (2-7 mesi), attaccamento vero e proprio (7-24 mesi), relazione reciproca dai 2 anni.', 'concetto 1'],
                                        ['Che cosa sono i modelli operativi interni?',
                                            'Rappresentazioni mentali di sé e della figura di attaccamento costruite nelle interazioni; orientano aspettative e comportamenti nelle relazioni successive.', 'concetto 1', [
                                                ['Perché i modelli operativi interni tendono a restare stabili nel tempo?',
                                                    'Perché filtrano le nuove esperienze in modo coerente con le aspettative e funzionano in gran parte fuori dalla consapevolezza.', 'dettaglio'],
                                            ]],
                                    ]],
                            ],
                        },
                        {
                            nome: 'Ainsworth e la Strange Situation', stati: 'misti',
                            carte: [
                                ['In che cosa consiste la Strange Situation e che cosa permette di osservare?',
                                    'Procedura di laboratorio in 8 episodi di circa 3 minuti, con separazioni e riunioni dalla madre e un estraneo: si osserva l\'uso della madre come base sicura e il comportamento alla riunione.', 'sottoramo', [
                                        ['Quali stili di attaccamento sono stati individuati e come si riconoscono alla riunione?',
                                            'Sicuro (B): cerca la madre e si consola. Evitante (A): la ignora. Ambivalente (C): cerca il contatto ma resiste, è difficile da consolare. Disorganizzato (D): comportamenti contraddittori.', 'concetto 1', [
                                                ['Chi ha introdotto la categoria dell\'attaccamento disorganizzato?', 'Main e Solomon.', 'dettaglio'],
                                                ['Quale quota di bambini risulta sicura nei campioni normativi?', 'Circa il 60-65%.', 'dettaglio'],
                                            ]],
                                        ['Che cosa si intende per sensibilità materna secondo Ainsworth?',
                                            'La capacità di cogliere i segnali del bambino, interpretarli correttamente e rispondere in modo pronto e adeguato.', 'concetto 1'],
                                    ]],
                            ],
                        },
                    ],
                },
            ],
        },
        {
            materia: ['Neuroscienze (prova)', '🧬', '#0ea5a4'],
            set: [
                {
                    nome: 'Il neurone', stati: 'misti',
                    carte: [
                        ['Quali sono le parti principali di un neurone?', 'Soma, dendriti, assone e terminali sinaptici; l\'assone è spesso rivestito di mielina.'],
                        ['Che cos\'è il potenziale di riposo e quanto vale?', 'La differenza di potenziale tra interno ed esterno della membrana a riposo: circa −70 mV.'],
                        ['A che cosa serve la guaina mielinica?', 'Isola l\'assone e permette la conduzione saltatoria tra i nodi di Ranvier, che rende il segnale più veloce.'],
                        ['Che cosa dice la legge del tutto-o-nulla?', 'Se la soglia viene raggiunta il potenziale d\'azione parte con ampiezza piena, altrimenti non parte.'],
                        ['Che differenza c\'è tra sinapsi elettriche e chimiche?', 'Le elettriche passano corrente tramite giunzioni comunicanti: veloci e bidirezionali. Le chimiche rilasciano neurotrasmettitori nella fessura: più lente e modulabili.'],
                    ],
                },
                {
                    nome: 'Neurotrasmettitori', stati: 'misti',
                    carte: [
                        ['Qual è il principale neurotrasmettitore eccitatorio del sistema nervoso centrale?',
                            [['Glutammato', true], ['GABA', false], ['Dopamina', false], ['Glicina', false]], 'dettaglio', null,
                            { suggerimento: 'È anche un amminoacido', spiegazione: 'Il GABA è il principale inibitorio; il glutammato agisce sui recettori AMPA, NMDA e kainato. (Carta a scelta multipla.)' }],
                        ['Quali funzioni sono associate alla dopamina?', 'Movimento (via nigrostriatale), motivazione e ricompensa (mesolimbica), funzioni esecutive (mesocorticale), inibizione della prolattina.'],
                        ['Che effetto hanno gli SSRI sulla serotonina?', 'Ne bloccano la ricaptazione nel neurone presinaptico, così ne resta di più nella fessura sinaptica.'],
                        ['Quale neurotrasmettitore agisce nella giunzione neuromuscolare?', 'L\'acetilcolina.'],
                    ],
                },
            ],
        },
    ];

    // Stati di studio a rotazione per i set "misti"
    const GIRO_STATI = ['scaduta', 'futura', 'apprendimento', 'futura', 'nuova', 'oggi', 'scarso', 'futura'];

    function presenti() {
        return Archivio.tutti('materie').some(m => m.prova);
    }

    // N° Rep e ultimo ripasso come nelle revisioni (prossima = ultimo + 2^(rep − 1) giorni)
    function statoSrs(tipo, k, ora) {
        const base = Srs.statoIniziale();
        const giorno = n => chiaveGiorno(aggiungiGiorni(ora, n));
        const ts = n => aggiungiGiorni(ora, n);
        switch (tipo) {
            case 'scaduta': return { ...base, stato: 'imparata', ultimaValutazione: 2, rep: 2, giorno: giorno(-4 - k % 3), ripetizioni: 4, ultimoRipasso: ts(-4 - k % 3) };
            case 'oggi': return { ...base, stato: 'imparata', ultimaValutazione: 2, rep: 2, giorno: giorno(-2), ripetizioni: 3, ultimoRipasso: ts(-2) };
            case 'futura': return { ...base, stato: 'imparata', ultimaValutazione: k % 2 ? 3 : 2, rep: 3 + k % 2, giorno: giorno(-1), ripetizioni: 5, ultimoRipasso: ts(-1) };
            case 'apprendimento': return { ...base, stato: 'apprendimento', ultimaValutazione: 1, rep: 1, giorno: giorno(-1), ripetizioni: 2, ultimoRipasso: ts(-1) };
            case 'scarso': return { ...base, stato: 'apprendimento', ultimaValutazione: 0, rep: 1, giorno: giorno(-1), errori: 1, ripetizioni: 6, ultimoRipasso: ts(-1) };
            default: return base;
        }
    }

    function carica() {
        if (presenti()) { Ui.toast('I dati di prova sono già caricati'); return false; }
        const ora = Date.now();
        const materie = [], sets = [], carte = [], ripassi = [], esami = [];
        let k = 0;
        const ordineBase = Math.max(0, ...Archivio.tutti('materie').map(m => m.ordine || 0));

        const aggiungiCarte = (s, nodi, stati, genitore = null) => nodi.forEach((nodo, i) => {
            const [domanda, risposta, tag, figlie, extra = {}] = nodo;
            const c = {
                id: uid(), setId: s.id, genitoreId: genitore ? genitore.id : null, ordine: i + 1,
                domanda: testoInHtml(domanda),
                risposte: Array.isArray(risposta) ? risposta.map(([testo, corretta]) => ({ testo: testoInHtml(testo), corretta })) : [{ testo: testoInHtml(risposta), corretta: true }],
                tag: tag ? [tag] : [], suggerimento: extra.suggerimento || '', spiegazione: extra.spiegazione ? testoInHtml(extra.spiegazione) : '',
                srs: statoSrs(stati === 'nuove' ? 'nuova' : GIRO_STATI[k % GIRO_STATI.length], k, ora),
                creata: ora, modificata: ora, prova: true,
            };
            k++;
            carte.push(c);
            if (figlie) aggiungiCarte(s, figlie, stati, c);
        });

        const aggiungiSet = (m, def, genitore = null) => {
            const s = {
                id: uid(), materiaId: m.id, genitoreId: genitore ? genitore.id : null, nome: def.nome, descrizione: def.descrizione || '',
                creato: ora + sets.length, modificato: ora, ultimoStudio: def.stati === 'nuove' ? null : aggiungiGiorni(ora, -1 - sets.length % 3), prova: true,
            };
            sets.push(s);
            aggiungiCarte(s, def.carte || [], def.stati);
            (def.sottoSet || []).forEach(sotto => aggiungiSet(m, sotto, s));
        };

        CONTENUTI.forEach((def, i) => {
            const [nome, emoji, colore] = def.materia;
            const m = { id: uid(), nome, emoji, colore, ordine: ordineBase + i + 1, creata: ora, prova: true };
            materie.push(m);
            def.set.forEach(s => aggiungiSet(m, s));
        });

        // Storico: 30 giorni con qualche pausa, ultimi 6 giorni di fila (oggi ancora da fare)
        const studiate = carte.filter(c => c.srs.stato !== 'nuova');
        const pause = new Set([7, 11, 12, 18, 23, 24]);
        let seme = 7;
        const casuale = () => { seme = (seme * 9301 + 49297) % 233280; return seme / 233280; };
        for (let giorniFa = 30; giorniFa >= 1; giorniFa--) {
            if (pause.has(giorniFa)) continue;
            const giorno = new Date(aggiungiGiorni(ora, -giorniFa));
            giorno.setHours(18, 0, 0, 0);
            const quante = 6 + Math.floor(casuale() * 28);
            for (let n = 0; n < quante; n++) {
                const c = studiate[Math.floor(casuale() * studiate.length)];
                const r = casuale();
                const ts = giorno.getTime() + n * 40000;
                ripassi.push({
                    id: uid(), cartaId: c.id, setId: c.setId, ts, giorno: chiaveGiorno(ts),
                    valutazione: r < 0.12 ? 0 : r < 0.3 ? 1 : r < 0.75 ? 2 : 3, modo: 'impara', durata: 4000 + Math.floor(casuale() * 26000), prova: true,
                });
            }
        }

        // Una mappa mentale tra i materiali del Capitolo 1, per provare le flashcard di localizzazione
        const schema = [
            '# Schema 1. Il temperamento',
            '- Sottoramo 1. Thomas e Chess',
            '  - Studio longitudinale di New York: 133 bambini seguiti dall\'infanzia all\'età adulta',
            '  - Nove dimensioni comportamentali',
            '    - Livello di attività: quantità di movimento e proporzione tra periodi attivi e inattivi',
            '    - Ritmicità: regolarità delle funzioni biologiche',
            '    - Approccio/ritiro',
            '  - Profili temperamentali',
            '    - Facile',
            '    - Difficile',
            '    - Lento a scaldarsi',
            '  - Bontà di adattamento: corrispondenza tra temperamento e richieste dell\'ambiente',
            '- Sottoramo 2. Kagan',
            '  - Inibizione comportamentale: timore e ritiro davanti al nuovo',
            '    - Correlati fisiologici: amigdala, cortisolo e battito cardiaco più alti',
            '- Sottoramo 3. Rothbart',
            '  - Reattività e autoregolazione: due facce delle differenze individuali',
            '  - Controllo volontario: inibire una risposta dominante per attivarne una subordinata',
        ].join('\n');
        const capitolo1 = sets.find(s => s.nome.startsWith('Capitolo 1'));
        const materiali = [{
            id: uid(), setId: capitolo1.id, nome: 'Mappa – Il temperamento (prova).md', tipo: 'mappa', mime: 'text/markdown',
            dimensione: schema.length, creato: ora, testo: schema, pagine: null, albero: Materiali.alberoDaMarkdown(schema),
            anteprima: null, usaInChat: true, remoto: null, prova: true,
        }];

        esami.push(
            { id: uid(), nome: 'Psicologia dello sviluppo — scritto (prova)', data: chiaveGiorno(aggiungiGiorni(ora, 12)), materiaId: materie[0].id, note: 'Capitoli 1-2', prova: true },
            { id: uid(), nome: 'Neuroscienze — orale (prova)', data: chiaveGiorno(aggiungiGiorni(ora, 40)), materiaId: materie[1].id, note: '', prova: true },
            { id: uid(), nome: 'Esonero di neuroscienze (prova)', data: chiaveGiorno(aggiungiGiorni(ora, -10)), materiaId: materie[1].id, note: '', prova: true },
        );

        Archivio.salvaMolti('materie', materie);
        Archivio.salvaMolti('set', sets);
        Archivio.salvaMolti('carte', carte);
        Archivio.salvaMolti('ripassi', ripassi);
        Archivio.salvaMolti('esami', esami);
        Archivio.salvaMolti('materiali', materiali);

        // Revisioni degli argomenti: una per set principale, in stati diversi (in ritardo, oggi, in attesa, mai)
        const argomentiProva = sets.filter(s => !s.genitoreId).map((s, i) => {
            const giro = [[3, -6, 'ok'], [2, -2, 'ottimo'], [2, 0, 'buono'], [0, null, '']][i % 4];
            const [ripetizioni, giorni, stato] = giro;
            const storico = Array.from({ length: ripetizioni }, (_, j) => ({ giorno: chiaveGiorno(aggiungiGiorni(ora, giorni - (ripetizioni - 1 - j) * 3)), stato }))
                .map((v, j, tutte) => ({ ...v, prima: { ripetizioni: j, ultimoRipasso: j ? tutte[j - 1].giorno : null, stato: j ? stato : '' } }));
            return {
                id: uid(), setId: s.id, nome: s.nome, fonte: i % 2 ? '' : `Schema ${i + 1}`, materialeIds: [], fontiTolte: [], ripetizioni,
                ultimoRipasso: giorni == null ? null : chiaveGiorno(aggiungiGiorni(ora, giorni)), stato, delSet: true, ordine: 1, creato: ora + i, storico, prova: true,
            };
        });
        Archivio.salvaMolti('argomenti', argomentiProva);
        mappaDiProva(materie[0], sets.find(s => s.materiaId === materie[0].id && !s.genitoreId));
        Ui.toast(`Caricati ${plurale(sets.length, 'set', 'set')} e ${plurale(carte.length, 'carta', 'carte')} di prova`, 'successo');
        return true;
    }

    // Mappa mentale d'esempio: rami principali colorati, forme diverse, etichette, icone, una relazione e un ramo chiuso
    function mappaDiProva(materia, set) {
        const m = Mappe.nuova({ nome: 'Sviluppo delle emozioni (prova)', materiaId: materia.id, setId: set ? set.id : null });
        m.prova = true;
        const r = m.radice;
        m.nodi[r].testo = 'Sviluppo delle emozioni';
        const n = (genitore, testo, extra = {}) => Mappe.aggiungiNodo(m, { genitore, testo, ...extra });
        const etichetta = (nodo, testo) => nodo.etichette.push({ id: uid(), testo, dx: 0, dy: -26, stile: { riempimento: '#ffe0d2', scala: 0.7 } });

        const intro = n(r, '1. INTRO');
        const comp = n(intro.id, 'COMPETENZA\nSOCIOEMOTIVA');
        const macro = n(comp.id, '3 MACROAREE', { icona: '🔀', stile: { forma: 'pillola', spessore: 2 } });
        ['espressione', 'regolazione', 'comprensione'].forEach((t, i) =>
            n(macro.id, `${i + 1}- ${t} delle emozioni`, { stile: { forma: 'parallelogramma', spessore: 1, grassetto: true, scala: 0.9 } }));
        const abilita = n(comp.id, 'insieme di **abilità**', { icona: '🧠' });
        etichetta(abilita, "Saarni ('99)");
        ['consapevolezza del proprio stato emotivo', 'riconoscimento delle emozioni altrui', 'uso del lessico emotivo'].forEach((t, i) => n(abilita.id, `${i + 1}- ${t}`));

        const sviluppo = n(r, '2. SVILUPPO\nESPRESSIONE EMOZIONI');
        const fasi = n(sviluppo.id, 'FASI SVILUPPO', { icona: '📈', stile: { forma: 'pillola', spessore: 2 } });
        [['0-2 mesi', 'risposte innate', 'sorriso endogeno'], ['2 mesi - 1° anno', 'dialogo emotivo', 'scambio protoconversazionale'], ['2-3 anni', 'emozioni sociali complesse', 'vergogna, orgoglio, colpa']]
            .forEach(([quando, a, b], i) => {
                const f = n(fasi.id, 'fase', { icona: 'n:' + (i + 1), stile: { forma: 'rettangolo', spessore: 1.5 } });
                etichetta(f, quando);
                n(f.id, '- ' + a);
                n(f.id, '- ' + b);
            });

        const regolazione = n(r, '3. REGOLAZIONE', { chiuso: true });
        n(regolazione.id, 'DEFINIZIONE', { icona: 'ℹ️', nota: 'Insieme dei processi coinvolti nel monitoraggio, nella valutazione e nella modifica delle risposte emotive.' });
        n(regolazione.id, 'strategie', { spunta: false });
        const comprensione = n(r, '4. COMPRENSIONE');
        n(comprensione.id, 'teoria della mente', { link: 'https://it.wikipedia.org/wiki/Teoria_della_mente' });

        m.relazioni.push({ id: uid(), da: macro.id, a: abilita.id, testo: 'a cui sono riconducibili', colore: null, tratto: 'punti', frecciaInizio: false, frecciaFine: true, curva: null });
        Mappe.aggiungi(m);
    }

    // Toglie anche ciò che hai aggiunto dentro materie e set di prova, per non lasciare orfani
    function rimuovi() {
        const materieProva = new Set(Archivio.tutti('materie').filter(m => m.prova).map(m => m.id));
        const set = new Set(Archivio.tutti('set').filter(s => s.prova || materieProva.has(s.materiaId)).map(s => s.id));
        Archivio.eliminaMolti('carte', Archivio.tutti('carte').filter(c => c.prova || set.has(c.setId)).map(c => c.id));
        const materiali = Archivio.tutti('materiali').filter(m => m.prova || set.has(m.setId)).map(m => m.id);
        Archivio.eliminaMolti('materiali', materiali);
        Archivio.eliminaFile(materiali);
        Archivio.eliminaMolti('chat', [...set].map(id => 'set:' + id).filter(id => Archivio.prendi('chat', id)));
        Archivio.eliminaMolti('argomenti', Archivio.tutti('argomenti').filter(a => a.prova || set.has(a.setId)).map(a => a.id));
        Archivio.eliminaMolti('set', [...set]);
        Archivio.eliminaMolti('materie', Archivio.tutti('materie').filter(m => m.prova).map(m => m.id));
        Archivio.eliminaMolti('ripassi', Archivio.tutti('ripassi').filter(r => r.prova).map(r => r.id));
        Archivio.eliminaMolti('esami', Archivio.tutti('esami').filter(e => e.prova).map(e => e.id));
        Archivio.eliminaMolti('mappe', Archivio.tutti('mappe').filter(m => m.prova).map(m => m.id));
        Ui.toast('Dati di prova rimossi');
    }

    return { carica, rimuovi, presenti };
})();
