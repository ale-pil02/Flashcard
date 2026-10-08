// Dati di prova per provare e correggere l'app: materie, set con sotto-set, domande ad albero e una mappa.
// Ogni set ha uno scenario delle revisioni (mai ripassato, puntuale oggi, in ritardo, in anticipo, già ripassato oggi…)
// con lo storico dei ripassi coerente con la sequenza degli intervalli, e carte in casi diversi rispetto al set
// (al passo, Ok, Scarso, aggiunte dopo, ripassate per conto loro, collegate alla mappa).
// Ogni oggetto ha "prova: true", così Rimuovi toglie solo questi e lascia intatti i dati veri.

const DatiProva = (() => {
    // Nodo: [domanda, risposta (testo o lista di [testo, corretta]), tag, figlie?, extra?]
    // extra: suggerimento, spiegazione, nodo (nodo della mappa di prova a cui collegare la carta) e caso, cioè come sta la
    // carta rispetto al suo set (statoCarta): 'perfetto' | 'ok' | 'scarso' | 'aggiunta' (entrata dopo l'ultimo ripasso,
    // mai valutata) | 'perconto' (ripassata da sola il giorno dopo il set); senza caso è Buono e al passo con il set.
    // Ogni set ha uno scenario delle revisioni: rep = N° Rep (0 = mai ripassato), scarto = giorni rispetto alla data
    // prevista (+ in ritardo, − ancora da aspettare), oggi = già ripassato oggi. Le date si calcolano con la sequenza
    // delle impostazioni, quindi lo scenario è vero il giorno in cui carichi i dati.
    const CONTENUTI = [
        {
            materia: ['Psicologia dello sviluppo (prova)', '🧠', '#5b4ff5'],
            set: [
                {
                    nome: 'Capitolo 1 – Il temperamento', scenario: { rep: 0 },
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
                    nome: 'Capitolo 2 – L\'attaccamento', scenario: { rep: 4, scarto: -3 },
                    carte: [
                        ['Qual è l\'impianto complessivo della trattazione sull\'attaccamento?',
                            'La teoria di Bowlby (sistema comportamentale, fasi, modelli operativi interni) e la ricerca di Ainsworth (Strange Situation, stili di attaccamento, sensibilità materna).', 'generale', null, { caso: 'perfetto' }],
                    ],
                    sottoSet: [
                        {
                            nome: 'Bowlby', scenario: { rep: 4, scarto: 0 },
                            carte: [
                                ['In che cosa consiste la teoria dell\'attaccamento di Bowlby e su quali presupposti si fonda?',
                                    'L\'attaccamento è un sistema comportamentale innato, di origine evolutiva, che mantiene la vicinanza a una figura protettiva; integra etologia, psicoanalisi e teoria dei sistemi.', 'sottoramo', [
                                        ['Attraverso quali fasi si sviluppa l\'attaccamento secondo Bowlby?',
                                            'Pre-attaccamento (0-2 mesi), attaccamento in formazione (2-7 mesi), attaccamento vero e proprio (7-24 mesi), relazione reciproca dai 2 anni.', 'concetto 1'],
                                        ['Che cosa sono i modelli operativi interni?',
                                            'Rappresentazioni mentali di sé e della figura di attaccamento costruite nelle interazioni; orientano aspettative e comportamenti nelle relazioni successive.', 'concetto 1', [
                                                ['Perché i modelli operativi interni tendono a restare stabili nel tempo?',
                                                    'Perché filtrano le nuove esperienze in modo coerente con le aspettative e funzionano in gran parte fuori dalla consapevolezza.', 'dettaglio', null, { caso: 'perfetto' }],
                                            ]],
                                    ]],
                            ],
                        },
                        {
                            nome: 'Ainsworth e la Strange Situation', scenario: { rep: 3, scarto: 7 },
                            carte: [
                                ['In che cosa consiste la Strange Situation e che cosa permette di osservare?',
                                    'Procedura di laboratorio in 8 episodi di circa 3 minuti, con separazioni e riunioni dalla madre e un estraneo: si osserva l\'uso della madre come base sicura e il comportamento alla riunione.', 'sottoramo', [
                                        ['Quali stili di attaccamento sono stati individuati e come si riconoscono alla riunione?',
                                            'Sicuro (B): cerca la madre e si consola. Evitante (A): la ignora. Ambivalente (C): cerca il contatto ma resiste, è difficile da consolare. Disorganizzato (D): comportamenti contraddittori.', 'concetto 1', [
                                                ['Chi ha introdotto la categoria dell\'attaccamento disorganizzato?', 'Main e Solomon.', 'dettaglio', null, { caso: 'scarso' }],
                                                ['Quale quota di bambini risulta sicura nei campioni normativi?', 'Circa il 60-65%.', 'dettaglio'],
                                            ]],
                                        ['Che cosa si intende per sensibilità materna secondo Ainsworth?',
                                            'La capacità di cogliere i segnali del bambino, interpretarli correttamente e rispondere in modo pronto e adeguato.', 'concetto 1'],
                                        ['Che cosa misura l\'Adult Attachment Interview?',
                                            'Lo stato mentale dell\'adulto rispetto all\'attaccamento, dalla coerenza con cui racconta le esperienze infantili: sicuro-autonomo, distanziante, preoccupato, irrisolto.', 'concetto 1', null, { caso: 'aggiunta' }],
                                    ]],
                            ],
                        },
                    ],
                },
                {
                    nome: 'Capitolo 3 – Sviluppo delle emozioni', scenario: { rep: 5, scarto: -5 }, mappa: true,
                    carte: [
                        ['Qual è l\'impianto complessivo della trattazione sullo sviluppo delle emozioni?',
                            'La competenza socioemotiva e le sue tre macroaree, le fasi dello sviluppo dell\'espressione emotiva, la regolazione e la comprensione delle emozioni.', 'generale', [
                                ['In che cosa consiste la competenza socioemotiva e in quali macroaree si articola?',
                                    'Un insieme di abilità (Saarni, 1999) che permettono di usare le emozioni nelle relazioni; tre macroaree: espressione, regolazione e comprensione delle emozioni.', 'sottoramo', [
                                        ['Quali abilità rientrano nella competenza emotiva secondo Saarni?',
                                            'Consapevolezza del proprio stato emotivo, riconoscimento delle emozioni altrui, uso del lessico emotivo.', 'dettaglio', null, { caso: 'perconto', nodo: 'abilita' }],
                                    ], { nodo: 'competenza' }],
                                ['Attraverso quali fasi si sviluppa l\'espressione delle emozioni nei primi anni?',
                                    '0-2 mesi: risposte innate (sorriso endogeno). 2 mesi - 1° anno: dialogo emotivo e scambi protoconversazionali. 2-3 anni: emozioni sociali complesse (vergogna, orgoglio, colpa).', 'sottoramo', [
                                        ['Che cosa distingue il sorriso endogeno da quello sociale?',
                                            'Il sorriso endogeno compare nei primi giorni, spesso nel sonno, ed è legato a stati interni; quello sociale, dalle 6-8 settimane, è rivolto ai volti.', 'dettaglio'],
                                    ], { caso: 'perfetto', nodo: 'fasi' }],
                                ['Che cosa si intende per regolazione emotiva?',
                                    'L\'insieme dei processi con cui si monitorano, valutano e modificano le risposte emotive per raggiungere i propri scopi (Thompson, 1994).', 'sottoramo', null, { caso: 'ok', nodo: 'regolazione' }],
                            ], { nodo: 'radice' }],
                    ],
                },
                {
                    nome: 'Capitolo 4 – Teoria della mente', scenario: { rep: 2, oggi: true },
                    carte: [
                        ['In che cosa consiste la teoria della mente?',
                            'La capacità di attribuire stati mentali (credenze, desideri, intenzioni) a sé e agli altri per spiegare e prevedere il comportamento.', 'sottoramo', [
                                ['Che cosa verifica il compito della falsa credenza di Sally e Anne?',
                                    'Se il bambino capisce che Sally cercherà la biglia dove l\'ha lasciata, perché non ha visto lo spostamento: di solito si supera verso i 4 anni.', 'dettaglio'],
                                ['Quali precursori della teoria della mente si osservano entro il secondo anno?',
                                    'Attenzione condivisa, indicare dichiarativo, referenziamento sociale, gioco di finzione.', 'dettaglio', null, { caso: 'perfetto' }],
                            ]],
                    ],
                },
            ],
        },
        {
            materia: ['Neuroscienze (prova)', '🧬', '#0ea5a4'],
            set: [
                {
                    nome: 'Il neurone', scenario: { rep: 6, scarto: -2 },
                    carte: [
                        ['Quali sono le parti principali di un neurone?', 'Soma, dendriti, assone e terminali sinaptici; l\'assone è spesso rivestito di mielina.', null, null, { caso: 'perfetto' }],
                        ['A che cosa serve la guaina mielinica?', 'Isola l\'assone e permette la conduzione saltatoria tra i nodi di Ranvier, che rende il segnale più veloce.', null, null, { caso: 'perfetto' }],
                        ['Che differenza c\'è tra sinapsi elettriche e chimiche?', 'Le elettriche passano corrente tramite giunzioni comunicanti: veloci e bidirezionali. Le chimiche rilasciano neurotrasmettitori nella fessura: più lente e modulabili.', null, null, { caso: 'perfetto' }],
                        ['Che cosa fanno le cellule gliali?', 'Sostengono e nutrono i neuroni, formano la mielina (oligodendrociti e cellule di Schwann), regolano l\'ambiente extracellulare e partecipano alle risposte immunitarie (microglia).'],
                    ],
                    sottoSet: [
                        {
                            nome: 'Il potenziale d\'azione', scenario: { rep: 4, scarto: 1 },
                            carte: [
                                ['Che cos\'è il potenziale di riposo e quanto vale?', 'La differenza di potenziale tra interno ed esterno della membrana a riposo: circa −70 mV.'],
                                ['Che cosa dice la legge del tutto-o-nulla?', 'Se la soglia viene raggiunta il potenziale d\'azione parte con ampiezza piena, altrimenti non parte.'],
                                ['Che cos\'è il periodo refrattario assoluto?', 'L\'intervallo subito dopo un potenziale d\'azione in cui nessuno stimolo, per quanto forte, ne fa partire un altro: i canali del sodio sono inattivati.', null, null, { caso: 'ok' }],
                            ],
                        },
                    ],
                },
                {
                    nome: 'Neurotrasmettitori', scenario: { rep: 1, scarto: 0 },
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

    function presenti() {
        return Archivio.tutti('materie').some(m => m.prova);
    }

    // Lo scenario di un set: quanti giorni fa l'ultimo ripasso e la frase che lo spiega
    function scenario({ rep = 0, scarto = 0, oggi = false }) {
        const g = n => plurale(n, 'giorno', 'giorni');
        if (!rep) return { giorniFa: null, testo: 'Mai ripassato: la prima volta che lo ripassi è la rep 1, e la prossima revisione è domani. Le figlie arrivano a cascata.' };
        const I = Srs.intervalloPerRep(rep);
        if (oggi) return { giorniFa: 0, testo: `Già ripassato oggi (rep ${rep}): se lo ripassi di nuovo e scegli che conta, N° Rep +1 e la data resta.` };
        const giorniFa = Math.max(1, I + scarto);
        const reale = giorniFa - I;
        return {
            giorniFa,
            testo: reale === 0 ? `Da ripassare oggi, puntuale (rep ${rep}, intervallo ${g(I)}).`
                : reale > 0 ? `In ritardo di ${g(reale)} (rep ${rep}, intervallo ${g(I)}): ripassandolo, la prossima revisione si avvicina.`
                    : `Mancano ${g(-reale)} (rep ${rep}, intervallo ${g(I)}): ripassandolo adesso è in anticipo.`,
        };
    }

    function carica() {
        if (presenti()) { Ui.toast('I dati di prova sono già caricati'); return false; }
        const ora = Date.now();
        const giorno = d => chiaveGiorno(aggiungiGiorni(ora, d));
        // Ora di un ripasso fatto d giorni fa: alle 18 (oggi un'ora fa, per non finire nel futuro)
        const ts = (d, minuti = 0) => { if (d >= 0) return ora - 3600000 + minuti * 1000; const x = new Date(aggiungiGiorni(ora, d)); x.setHours(18, 0, 0, 0); return x.getTime() + minuti * 1000; };
        const materie = [], sets = [], carte = [], ripassi = [], argomenti = [], materiali = [], esami = [];
        const daCollegare = [];   // [carta, nodo della mappa di prova]
        const ordineBase = Math.max(0, ...Archivio.tutti('materie').map(m => m.ordine || 0));
        let seme = 7;
        const casuale = () => { seme = (seme * 9301 + 49297) % 233280; return seme / 233280; };
        let insetMappa = null;

        // Come sta la carta rispetto al set: date[j] = giorno (relativo a oggi) della rep j del set, N = la sua ultima
        function statoCarta(caso, N, date) {
            const base = Srs.statoIniziale();
            if (!N || caso === 'aggiunta') return base;
            const L = date[N], I = Srs.intervalloPerRep(N);
            const buona = { ...base, stato: 'imparata', ultimaValutazione: caso === 'perfetto' ? 3 : 2, rep: N, giorno: giorno(L), intervallo: I, allineata: true, ripetizioni: N, ultimoRipasso: ts(L) };
            if (caso === 'ok' && N > 1) {
                const x = Srs.dopoRipasso({ intervallo: Srs.intervalloPerRep(N - 1), giorno: giorno(date[N - 1]) }, giorno(L), { esito: 'ok' });
                return { ...buona, stato: 'apprendimento', ultimaValutazione: 1, intervallo: x.intervallo, allineata: false, ripetizioni: N + 1 };
            }
            if (caso === 'scarso' && N > 1) {
                return { ...base, stato: 'apprendimento', ultimaValutazione: 0, rep: N - 1, giorno: giorno(date[N - 1]), intervallo: Srs.dopoScarso(Srs.intervalloPerRep(N - 1)),
                    daRifareDal: giorno(L), errori: 1, ripetizioni: N, ultimoRipasso: ts(L) };
            }
            if (caso === 'perconto' && L <= -1) {
                const x = Srs.dopoRipasso({ intervallo: I, giorno: giorno(L) }, giorno(L + 1));
                return { ...buona, rep: N + 1, giorno: x.giorno, intervallo: x.intervallo, allineata: false, ripetizioni: N + 1, ultimoRipasso: ts(L + 1) };
            }
            return buona;
        }

        const aggiungiSet = (m, def, genitore = null) => {
            const sc = scenario(def.scenario || {});
            const N = def.scenario ? def.scenario.rep || 0 : 0;
            // Giorni (relativi a oggi) dei ripassi del set: rep N all'ultimo ripasso, quelle prima a ritroso, puntuali
            const date = [];
            if (N) { date[N] = -sc.giorniFa; for (let j = N - 1; j >= 1; j--) date[j] = date[j + 1] - Srs.intervalloPerRep(j); }
            const s = {
                id: uid(), materiaId: m.id, genitoreId: genitore ? genitore.id : null, nome: def.nome, descrizione: 'Scenario: ' + sc.testo,
                creato: ora + sets.length, modificato: ora, ultimoStudio: N ? ts(date[N]) : null, prova: true,
            };
            sets.push(s);
            if (def.mappa) insetMappa = s;
            const delSet = [];
            const aggiungiCarte = (nodi, madre = null) => nodi.forEach((nodo, i) => {
                const [domanda, risposta, tag, figlie, extra = {}] = nodo;
                const caso = extra.caso || '';
                const c = {
                    id: uid(), setId: s.id, genitoreId: madre ? madre.id : null, ordine: i + 1,
                    domanda: testoInHtml(domanda),
                    risposte: Array.isArray(risposta) ? risposta.map(([testo, corretta]) => ({ testo: testoInHtml(testo), corretta })) : [{ testo: testoInHtml(risposta), corretta: true }],
                    tag: tag ? [tag] : [], suggerimento: extra.suggerimento || '', spiegazione: extra.spiegazione ? testoInHtml(extra.spiegazione) : '',
                    srs: statoCarta(caso, N, date), creata: caso === 'aggiunta' && N ? ts(date[N] + 2) : aggiungiGiorni(ora, (date[1] || 0) - 3), modificata: ora, prova: true,
                };
                carte.push(c);
                delSet.push([c, caso]);
                if (extra.nodo) daCollegare.push([c, extra.nodo]);
                if (figlie) aggiungiCarte(figlie, c);
            });
            aggiungiCarte(def.carte || []);

            // Registro di studio coerente: a ogni ripasso del set ogni carta che c'era riceve una risposta
            for (let j = 1; j <= N; j++) {
                delSet.forEach(([c, caso], n) => {
                    if (caso === 'aggiunta') return;
                    const v = j < N ? (casuale() < 0.3 ? 3 : 2) : caso === 'scarso' ? 0 : caso === 'ok' ? 1 : caso === 'perfetto' ? 3 : 2;
                    ripassi.push({ id: uid(), cartaId: c.id, setId: s.id, ts: ts(date[j], n * 40), giorno: giorno(date[j]), valutazione: v, modo: 'impara', durata: 4000 + Math.floor(casuale() * 26000), prova: true });
                    if (j === N && (caso === 'scarso' || caso === 'ok')) {
                        ripassi.push({ id: uid(), cartaId: c.id, setId: s.id, ts: ts(date[j], n * 40 + 600), giorno: giorno(date[j]), valutazione: caso === 'scarso' ? 1 : 2, modo: 'impara', durata: 6000, prova: true });
                    }
                });
            }
            delSet.filter(([, caso]) => caso === 'perconto' && N).forEach(([c]) => ripassi.push({ id: uid(), cartaId: c.id, setId: s.id, ts: ts(date[N] + 1), giorno: giorno(date[N] + 1), valutazione: 2, modo: 'impara', durata: 9000, prova: true }));

            // Riga del set nelle revisioni, con la cronologia dei ripassi (anche per il set mai ripassato, vuota)
            if (!N && !genitore) {
                argomenti.push({ id: uid(), setId: s.id, nome: s.nome, fonte: 'Scenario: mai ripassato', materialeIds: [], fontiTolte: [], ripetizioni: 0, ultimoRipasso: null,
                    intervallo: Srs.intervalloPerRep(0), stato: '', delSet: true, carte: null, ordine: 1, creato: ora + argomenti.length, storico: [], prova: true });
            }
            if (N) {
                const storico = [];
                for (let j = 1; j <= N; j++) storico.push({ giorno: giorno(date[j]), stato: '', prima: { ripetizioni: j - 1, ultimoRipasso: j > 1 ? giorno(date[j - 1]) : null, intervallo: j > 1 ? Srs.intervalloPerRep(j - 1) : null, stato: '' } });
                argomenti.push({
                    id: uid(), setId: s.id, nome: s.nome, fonte: 'Scenario: ' + sc.testo.split(':')[0].replace(/\s*\(.*$/, ''), materialeIds: [], fontiTolte: [],
                    ripetizioni: N, ultimoRipasso: giorno(date[N]), intervallo: Srs.intervalloPerRep(N), stato: '', delSet: true, carte: null,
                    ordine: 1, creato: ora + argomenti.length, storico, prova: true,
                });
            }
            (def.sottoSet || []).forEach(sotto => aggiungiSet(m, sotto, s));
        };

        CONTENUTI.forEach((def, i) => {
            const [nome, emoji, colore] = def.materia;
            const m = { id: uid(), nome, emoji, colore, ordine: ordineBase + i + 1, creata: ora, prova: true };
            materie.push(m);
            def.set.forEach(s => aggiungiSet(m, s));
        });

        // Uno schema tra i materiali del Capitolo 1, per provare le flashcard di localizzazione da un materiale
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
        materiali.push({
            id: uid(), setId: capitolo1.id, nome: 'Schema – Il temperamento (prova).md', tipo: 'mappa', mime: 'text/markdown',
            dimensione: schema.length, creato: ora, testo: schema, pagine: null, albero: Materiali.alberoDaMarkdown(schema),
            anteprima: null, usaInChat: true, remoto: null, prova: true,
        });

        esami.push(
            { id: uid(), nome: 'Psicologia dello sviluppo — scritto (prova)', data: giorno(12), materiaId: materie[0].id, note: 'Capitoli 1-4', prova: true },
            { id: uid(), nome: 'Neuroscienze — orale (prova)', data: giorno(40), materiaId: materie[1].id, note: '', prova: true },
        );

        // La mappa del Capitolo 3: alcune carte nascono collegate ai suoi nodi (nello studio la risposta mostra quella parte)
        const nodi = mappaDiProva(materie[0], insetMappa);
        daCollegare.forEach(([c, chiave]) => { if (nodi.ids[chiave]) c.mappa = { id: nodi.mappa, nodo: nodi.ids[chiave] }; });

        Archivio.salvaMolti('materie', materie);
        Archivio.salvaMolti('set', sets);
        Archivio.salvaMolti('carte', carte);
        Archivio.salvaMolti('ripassi', ripassi);
        Archivio.salvaMolti('esami', esami);
        Archivio.salvaMolti('materiali', materiali);
        Archivio.salvaMolti('argomenti', argomenti);
        Materiali.allineaMappe();
        Ui.toast(`Caricati ${plurale(sets.length, 'set', 'set')} e ${plurale(carte.length, 'carta', 'carte')} di prova: ogni set ha il suo scenario (lo trovi nella descrizione del set e nella colonna «Schema / fonte» delle Revisioni)`, 'successo', 8000);
        return true;
    }

    // Mappa mentale d'esempio: rami principali colorati, forme diverse, etichette, icone, una relazione e un ramo chiuso.
    // Restituisce l'id della mappa e quelli di alcuni nodi, per collegarci le carte
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
        return { mappa: m.id, ids: { radice: r, competenza: comp.id, abilita: abilita.id, fasi: fasi.id, regolazione: regolazione.id } };
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
