// Strumenti dell'assistente: ogni operazione che l'utente può fare nell'app, esposta a Gemini
// come funzione (function calling). Ogni strumento ha:
//   dichiarazione → nome, descrizione e parametri (schema Gemini)
//   esegui(args, ctx) → fa l'operazione con Dati/Materiali e restituisce un oggetto JSON
//   etichetta(args) → la riga che compare nella chat mentre l'assistente lavora
// Le operazioni che cancellano dati chiedono conferma all'utente (ctx.conferma).

const Strumenti = (() => {
    const S = {
        str: d => ({ type: 'STRING', description: d }),
        int: d => ({ type: 'INTEGER', description: d }),
        bool: d => ({ type: 'BOOLEAN', description: d }),
        arr: (items, d) => ({ type: 'ARRAY', items, description: d }),
        obj: (properties, required = [], d) => ({ type: 'OBJECT', properties, ...(required.length ? { required } : {}), ...(d ? { description: d } : {}) }),
    };

    // ---- Conversioni testo ⇄ HTML delle carte ---------------------------------------

    // Testo del modello (con **grassetto**, *corsivo*, __sottolineato__, ~~barrato~~ e a capo) → HTML sicuro della carta
    function htmlDaTesto(testo) {
        return testoInHtml(String(testo || ''))
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/__(?=\S)(.+?)__/g, '<u>$1</u>')
            .replace(/~~(?=\S)(.+?)~~/g, '<s>$1</s>')
            .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>');
    }

    const testo = html => testoMultiriga(html || '');

    // Formattazione che il testo non mostra (grassetto, corsivo, sottolineato e barrato diventano **, *, __ e ~~)
    const RICCO = /<(sub|sup|ul|ol|li|table|a|code|pre|blockquote|mark|h3|h4)\b/i;
    const IMMAGINE = /<img\b[^>]*>/gi;

    // HTML della carta → testo per il modello, con la formattazione che htmlDaTesto sa rifare
    function testoConSegni(html) {
        return testo(String(html || '')
            .replace(/<\/?(b|strong)\b[^>]*>/gi, '**').replace(/<\/?(i|em)\b[^>]*>/gi, '*')
            .replace(/<\/?u\b[^>]*>/gi, '__').replace(/<\/?(s|strike|del)\b[^>]*>/gi, '~~'));
    }

    // Un campo della carta (domanda, risposta, spiegazione) per il modello: le immagini diventano [immagine 1],
    // [immagine 2]…, così riscrivendo il campo le può tenere, spostare o togliere; se c'è formattazione che il testo non
    // mostra (elenchi, apici, tabelle, link…) arriva anche l'HTML, in <nome>_html
    function campoPerIA(nome, html) {
        let n = 0, k = 0;
        const out = { [nome]: testoConSegni(String(html || '').replace(IMMAGINE, () => `[immagine ${++n}]`)) };
        if (RICCO.test(html || '')) out[nome + '_html'] = String(html).replace(IMMAGINE, () => `<img src="immagine:${++k}">`);
        return out;
    }

    // Il contrario: dal testo del modello (formattazione come in htmlDaTesto) o dal suo HTML all'HTML della carta. I
    // segnaposto [immagine N] e <img src="immagine:N"> tornano le immagini del campo di prima
    function campoDaIA(valore, prima = '') {
        const immagini = String(prima || '').match(IMMAGINE) || [];
        const metti = (t, k) => immagini[k - 1] || '';
        const s = String(valore || '');
        if (/<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(s)) {
            return Ricco.pulisci(s.replace(/<img\b[^>]*src=["']?immagine:(\d+)["']?[^>]*>/gi, metti).replace(/\[immagine (\d+)\]/g, metti));
        }
        return htmlDaTesto(s).replace(/\[immagine (\d+)\]/g, metti);
    }

    // ---- Tutti i campi dei dati arrivano all'assistente ------------------------------------------------------
    // Regola dell'utente (CLAUDE.md): quello che l'utente vede, l'assistente lo legge. Ogni lettura per il modello mette
    // i campi che conosce con il suo nome e poi, in altri_dati, tutti gli altri campi dell'oggetto così come sono: un
    // campo aggiunto domani ai dati arriva subito anche all'assistente (test/parita-ia.test.js lo controlla).
    // gestiti = campi già messi con un altro nome; nascosti = campi lasciati fuori (il motivo sta accanto, dove si usa)
    function altriDati(oggetto, gestiti, nascosti = []) {
        const fuori = {};
        Object.keys(oggetto || {}).forEach(k => {
            // prova: segna gli oggetti dei dati di prova, così «Rimuovi» toglie solo quelli; per l'utente non è un dato
            if (k === 'prova' || gestiti.includes(k) || nascosti.includes(k)) return;
            const v = oggetto[k];
            if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
            fuori[k] = istante(v);
        });
        return Object.keys(fuori).length ? { altri_dati: fuori } : {};
    }

    // I numeri che sono istanti (millisecondi dal 1970, tra il 2001 e il 2096) diventano "AAAA-MM-GG hh:mm"
    function istante(v) {
        if (typeof v !== 'number' || v < 1e12 || v > 4e12) return v;
        const d = new Date(v);
        return `${chiaveGiorno(v)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    const giorno = ts => (ts ? chiaveGiorno(ts) : null);

    // Impostazioni che panoramica mette con il loro nome; quelle delle mappe hanno i loro strumenti
    const CAMPI_IMPOSTAZIONI = ['nome', 'nuovePerSessione', 'maxPerSessione', 'ordineCasuale', 'mescolaSorelle', 'cascata', 'nascondiDettagli', 'tema', 'sequenzaRevisioni'];
    const IMPOSTAZIONI_MAPPE = ['temiMappe', 'stiliMappe', 'ordineMappe', 'ordineMappeMano', 'panoramicheCreate'];

    function nomeSet(id) { const s = Dati.set(id); return s ? s.nome : id; }

    function richiediSet(id) {
        const s = Dati.set(id);
        if (!s) throw new Error(`Set «${id}» non trovato: usa panoramica per vedere gli id.`);
        return s;
    }

    // Riga delle revisioni per il modello, con le colonne calcolate come in Notion
    const CAMPI_ARGOMENTO = ['id', 'nome', 'setId', 'fonte', 'materialeIds', 'delSet', 'carte', 'ripetizioni', 'ultimoRipasso', 'intervallo', 'stato', 'storico'];
    function argomentoPerIA(a) {
        const p = Revisioni.prossima(a);
        const materiali = (a.materialeIds || []).map(Dati.materiale).filter(Boolean).map(m => ({ id: m.id, nome: m.nome }));
        const stato = Revisioni.statoDi(a) || undefined;
        const esame = p ? Revisioni.esamePrima(a.setId, p) : null;
        return {
            id: a.id, nome: a.nome, set_id: a.setId, set: nomeSet(a.setId), fonte: a.fonte || undefined,
            materiali: materiali.length ? materiali : undefined,
            riga_del_set: a.delSet ? 'aggiornata dallo studio; stato dalle valutazioni delle carte' : undefined,
            flashcard: Array.isArray(a.carte) ? { solo_alcune: (Revisioni.carteDi(a) || []).map(c => c.id) } : a.delSet ? 'tutte quelle del set' : undefined,
            ripetizioni: a.ripetizioni || 0, ultimo_ripasso: a.ultimoRipasso, intervallo_giorni: a.ultimoRipasso ? Revisioni.intervallo(a) : null, prossima_revisione: p ? chiaveGiorno(p) : null,
            dopo_l_esame: esame ? `${esame.nome} (${esame.data})` : undefined,
            alert: Revisioni.avviso(a).testo, stato, stato_scritto: a.stato && a.stato !== stato ? a.stato : undefined,
            ripassi_registrati: (a.storico || []).length,
            storico: (a.storico || []).length ? a.storico.map(x => ({
                giorno: x.giorno, stato: x.stato || undefined, n_rep_prima: (x.prima || {}).ripetizioni, ultimo_ripasso_prima: (x.prima || {}).ultimoRipasso || undefined,
                ...altriDati(x, ['giorno', 'stato', 'prima']), ...(altriDati(x.prima, ['ripetizioni', 'ultimoRipasso']).altri_dati ? { prima: altriDati(x.prima, ['ripetizioni', 'ultimoRipasso']).altri_dati } : {}),
            })) : undefined,
            ...altriDati(a, CAMPI_ARGOMENTO),
        };
    }

    const VALUTAZIONE = { scarso: Srs.SCARSO, ok: Srs.OK, buono: Srs.BUONO, perfetto: Srs.PERFETTO };

    function dataValida(testo) { return /^\d{4}-\d{2}-\d{2}$/.test(String(testo || '')) ? testo : null; }

    function richiediCarta(id) {
        const c = Dati.carta(id);
        if (!c) throw new Error(`Carta «${id}» non trovata.`);
        return c;
    }

    // Campi della carta e della sua ripetizione spaziata che cartaPerIA mette con un altro nome
    const CAMPI_CARTA = ['id', 'setId', 'genitoreId', 'domanda', 'risposte', 'tag', 'suggerimento', 'spiegazione', 'fonte', 'mappa', 'srs'];
    const CAMPI_SRS = ['stato', 'ultimaValutazione', 'rep', 'giorno', 'intervallo'];

    function cartaPerIA(c, extra = {}) {
        const out = { id: c.id, ...extra, ...campoPerIA('domanda', c.domanda) };
        if (c.risposte.length > 1) out.risposte = c.risposte.map(r => ({ ...campoPerIA('testo', r.testo), corretta: r.corretta, ...altriDati(r, ['testo', 'corretta']) }));
        else {
            Object.assign(out, campoPerIA('risposta', (c.risposte[0] || {}).testo));
            const altri = altriDati(c.risposte[0], ['testo', 'corretta']).altri_dati;
            if (altri) out.risposta_altri_dati = altri;
        }
        if (c.tag.length) out.tag = c.tag;
        if (c.suggerimento) out.suggerimento = c.suggerimento;
        if (c.spiegazione) Object.assign(out, campoPerIA('spiegazione', c.spiegazione));
        if (c.fonte) {
            const f = Materiali.fonteDi(c);
            out.fonte = { ...(f ? { materiale_id: f.m.id, materiale: f.m.nome, pagina: f.pagina || undefined, citazione: f.citazione || undefined } : { materiale_id: c.fonte.materiale, nota: 'materiale non più presente' }), ...altriDati(c.fonte, ['materiale', 'pagina', 'citazione']) };
        }
        if (c.mappa) {
            const x = VistaMappa.risolvi(c);
            out.parte_della_mappa = { mappa_id: c.mappa.id, nodo_id: c.mappa.nodo, nodo: x ? Mappe.testoSemplice(x.n.testo) : '(nodo non più nella mappa)', ...altriDati(c.mappa, ['id', 'nodo']) };
        }
        out.stato = Srs.descrivi(c);
        const v = Srs.valutazione(c);
        if (v != null) out.valutazione = Srs.VALUTAZIONI[v].chiave;
        if (c.srs && c.srs.giorno) Object.assign(out, { n_rep: c.srs.rep || 0, ultimo_ripasso: c.srs.giorno, intervallo_giorni: Srs.intervalloDi(c.srs.intervallo, c.srs.rep), prossima_revisione: chiaveGiorno(Srs.prossima(c)) });
        // Il resto della ripetizione spaziata: da rifare dal, allineata al mazzo, mazzo seguito, risposte date, errori…
        const srs = altriDati(c.srs, CAMPI_SRS).altri_dati;
        if (srs) out.ripetizione_spaziata = srs;
        return Object.assign(out, altriDati(c, CAMPI_CARTA));
    }

    // Fonte di una carta ({ materiale, pagina, citazione } o null) dai parametri del modello; avvisa se la citazione
    // non si trova nel testo del materiale (allora nello studio non si potrà evidenziare)
    function legameFonte(f, avvisi) {
        if (!f || !f.materiale_id) return null;
        const m = Dati.materiale(f.materiale_id);
        if (!m) throw new Error(`Materiale «${f.materiale_id}» non trovato: usa elenca_materiali.`);
        const pagina = Number.isInteger(f.pagina) && f.pagina > 0 ? f.pagina : null;
        if (pagina && m.pagine && pagina > m.pagine) throw new Error(`«${m.nome}» ha ${m.pagine} pagine: la pagina ${pagina} non c'è.`);
        const citazione = String(f.citazione || '').replace(/\s+/g, ' ').trim().slice(0, 500);
        if (citazione && m.testo && !Materiali.trovaCitazione(m.testo, citazione)) avvisi.push(`citazione non trovata alla lettera in «${m.nome}»: «${Ui.tronca(citazione, 60)}»`);
        return { materiale: m.id, pagina, citazione };
    }
    const SCHEMA_FONTE = S.obj({
        materiale_id: S.str("materiale dove sta la risposta ('' = togli la fonte)"),
        pagina: S.int('pagina (PDF) o diapositiva (presentazioni) dove sta la risposta'),
        citazione: S.str('frase del materiale dove sta la risposta, copiata alla lettera (max 300 caratteri): verrà evidenziata'),
    }, [], 'punto del materiale dove sta la risposta: nello studio un clic sulla risposta lo apre');

    // Collegamento di una carta al nodo di una mappa ({ id, nodo } o null); errore se il nodo non c'è
    function legameMappa(mappaId, nodoId) {
        if (!nodoId) return null;
        const m = Mappe.mappa(mappaId);
        if (!m) throw new Error(`Mappa «${mappaId}» non trovata: usa elenca_mappe.`);
        if (!m.nodi[nodoId]) throw new Error(`Nodo «${nodoId}» non trovato in «${m.nome}»: usa leggi_mappa.`);
        return { id: m.id, nodo: nodoId };
    }

    function conteggiBrevi(carte) {
        const c = Dati.conteggi(carte);
        return { carte: c.totale, imparate: c.imparate, da_ripassare: c.daRipassare, mai_studiate: c.nuova };
    }

    // ---- Definizioni -----------------------------------------------------------

    const LISTA = [
        // --- Lettura ---
        {
            nome: 'panoramica',
            descrizione: "Panoramica di tutta l'app: materie con l'albero dei set (id, livello, conteggi, materiali, ultimo studio), esami con le note, carte studiate oggi, impostazioni (compresa la sequenza degli intervalli). Usala per trovare gli id prima di agire.",
            etichetta: () => 'Guardo la libreria',
            esegui: () => {
                const imp = Dati.impostazioni();
                const attivita = Dati.attivitaPerGiorno();
                return {
                    oggi: chiaveGiorno(),
                    nome_utente: imp.nome || null,
                    materie: Dati.materie().map(m => ({
                        id: m.id, nome: m.nome, emoji: m.emoji, colore: m.colore,
                        set: Dati.alberoSet(m.id).map(({ set: s, livello }) => ({
                            id: s.id, nome: s.nome, livello, contenitore_id: s.genitoreId || null,
                            ...conteggiBrevi(Dati.carteDiSet(s.id)), materiali: Dati.materialiDiSet(s.id).length,
                            ultimo_studio: giorno(s.ultimoStudio) || undefined,
                        })),
                        ...altriDati(m, ['id', 'nome', 'emoji', 'colore']),
                    })),
                    esami: Dati.esami().map(e => ({
                        id: e.id, nome: e.nome, data: e.data, materia_id: e.materiaId, tra_giorni: giorniTra(Date.now(), daChiaveGiorno(e.data)),
                        note: e.note || undefined, ...altriDati(e, ['id', 'nome', 'data', 'materiaId', 'note']),
                    })),
                    studio_oggi: Dati.oggi(attivita),
                    impostazioni: {
                        nuove_per_sessione: imp.nuovePerSessione == null ? 'senza limite' : imp.nuovePerSessione, max_per_sessione: imp.maxPerSessione == null ? 'senza limite' : imp.maxPerSessione,
                        ordine_casuale: imp.ordineCasuale, sorelle_mescolate: imp.mescolaSorelle, studio_a_cascata: imp.cascata, dettagli_nascosti: imp.nascondiDettagli, tema: imp.tema,
                        sequenza_revisioni: Srs.sequenza(), ultimo_backup: imp.ultimoBackup ? istante(imp.ultimoBackup) : undefined,
                        // migrazioni: aggiornamenti dei dati già fatti all'avvio (l'utente non li vede); le impostazioni delle
                        // mappe si leggono con elenca_mappe, stili_predefiniti e tema_mappe
                        ...altriDati(imp, [...CAMPI_IMPOSTAZIONI, 'id', 'ultimoBackup'], ['migrazioni', ...IMPOSTAZIONI_MAPPE]),
                    },
                };
            },
        },
        {
            nome: 'leggi_set',
            descrizione: "Legge un set: dati, sotto-set, materiali e le sue flashcard in ordine d'albero (livello e madre_id indicano la cascata).",
            parametri: S.obj({ set_id: S.str('id del set'), max_carte: S.int('quante carte al massimo (predefinito 300)') }, ['set_id']),
            etichetta: a => `Leggo il set «${nomeSet(a.set_id)}»`,
            esegui: a => {
                const s = richiediSet(a.set_id);
                const albero = Dati.alberoDiSet(s.id, { tutte: true });
                const visibili = new Set(Dati.carteDiSet(s.id).map(c => c.id));
                const max = a.max_carte > 0 ? a.max_carte : 300;
                return {
                    id: s.id, nome: s.nome, descrizione: s.descrizione, materia_id: s.materiaId, contenitore_id: s.genitoreId || null,
                    ...altriDati(s, ['id', 'nome', 'descrizione', 'materiaId', 'genitoreId']),
                    percorso: Dati.percorsoSet(s.id).map(p => p.nome),
                    sotto_set: Dati.sottoSet(s.id).map(x => ({ id: x.id, nome: x.nome, ...conteggiBrevi(Dati.carteConSottoSet(x.id)) })),
                    materiali: Dati.materialiDiSet(s.id).map(m => ({ id: m.id, nome: m.nome, tipo: m.tipo, descrizione: Materiali.descrivi(m) })),
                    ...conteggiBrevi(albero.map(n => n.carta)),
                    dettagli_nascosti: albero.length - visibili.size || undefined,
                    flashcard: albero.slice(0, max).map(n => cartaPerIA(n.carta, { livello: n.livello, madre_id: (Dati.madre(n.carta) || {}).id || null, ...(visibili.has(n.carta.id) ? {} : { nascosta: true }) })),
                    troncato: albero.length > max ? `mostrate ${max} su ${albero.length}` : undefined,
                };
            },
        },
        {
            nome: 'cerca_carte',
            descrizione: 'Cerca flashcard per testo (domanda, risposta, tag, suggerimento, spiegazione), in tutta l\'app o in un set.',
            parametri: S.obj({ testo: S.str('testo da cercare'), set_id: S.str('facoltativo: limita al set (sotto-set compresi)') }, ['testo']),
            etichetta: a => `Cerco «${a.testo}»`,
            esegui: a => {
                const q = String(a.testo || '').toLowerCase();
                const carte = a.set_id ? Dati.carteConSottoSet(richiediSet(a.set_id).id, { tutte: true }) : Dati.tutteLeCarte({ tutte: true });
                const trovate = carte.filter(c => [c.domanda, c.spiegazione, ...c.risposte.map(r => r.testo)].some(h => testo(h).toLowerCase().includes(q))
                    || [c.suggerimento, ...c.tag].some(t => String(t || '').toLowerCase().includes(q)));
                return { trovate: trovate.length, carte: trovate.slice(0, 40).map(c => cartaPerIA(c, { set_id: c.setId, set: nomeSet(c.setId) })) };
            },
        },
        {
            nome: 'statistiche',
            descrizione: "Statistiche di studio come nella pagina Statistiche: oggi, i giorni indietro scelti (carte, minuti e valutazioni date; 140 = il calendario di 20 settimane), lo stato di tutte le carte, l'avanzamento per materia, i set studiati di recente («Continua a studiare») e il tempo medio per carta. Con carta_id dà i ripassi registrati di quella carta.",
            parametri: S.obj({ giorni: S.int('quanti giorni indietro (predefinito 14, massimo 140)'), carta_id: S.str('facoltativo: i ripassi di questa carta') }),
            etichetta: () => 'Guardo le statistiche',
            esegui: a => {
                if (a.carta_id) {
                    const c = richiediCarta(a.carta_id);
                    const ripassi = Dati.ripassi().filter(r => r.cartaId === c.id).sort((x, y) => x.ts - y.ts);
                    return {
                        carta: cartaPerIA(c),
                        ripassi: ripassi.map(r => ({
                            quando: istante(r.ts), valutazione: (Srs.VALUTAZIONI[r.valutazione] || {}).chiave, secondi: Math.round((r.durata || 0) / 1000),
                            di_prova: r.ripassoDiProva || undefined, ...altriDati(r, ['id', 'cartaId', 'setId', 'ts', 'giorno', 'valutazione', 'durata', 'ripassoDiProva']),
                        })),
                    };
                }
                const attivita = Dati.attivitaPerGiorno();
                const n = limita(Math.round(a.giorni) || 14, 1, 140);
                const giorni = [];
                for (let i = n - 1; i >= 0; i--) {
                    const g = chiaveGiorno(aggiungiGiorni(Date.now(), -i));
                    const x = attivita.get(g) || { carte: 0, durata: 0, valutazioni: [0, 0, 0, 0] };
                    giorni.push({ giorno: g, carte: x.carte, minuti: Math.round(x.durata / 60000), ...(x.carte ? { valutazioni: Object.fromEntries(Srs.VALUTAZIONI.map(v => [v.chiave, x.valutazioni[v.valore]])) } : {}) });
                }
                const c = Dati.conteggi(Dati.tutteLeCarte());
                return {
                    oggi: Dati.oggi(attivita), giorni,
                    stato_delle_carte: { totale: c.totale, mai_valutate: c.nuova, scarso: c.scarso, ok: c.ok, buono: c.buono, perfetto: c.perfetto, imparate: c.imparate, da_ripassare: c.daRipassare },
                    materie: Dati.materie().map(m => ({ id: m.id, nome: m.nome, ...conteggiBrevi(Dati.carteDiMateria(m.id)) })),
                    studiati_di_recente: Dati.setRecenti(4).map(s => ({ id: s.id, nome: s.nome, ultimo_studio: istante(s.ultimoStudio || s.modificato) })),
                    secondi_a_carta: StudioLibero.secondiACarta(),
                };
            },
        },

        // --- Materie ---
        {
            nome: 'crea_materia',
            descrizione: 'Crea una materia (contenitore dei set di un esame o corso).',
            parametri: S.obj({ nome: S.str('nome'), emoji: S.str('facoltativa, una emoji'), colore: S.str('facoltativo, colore esadecimale tipo #5b4ff5') }, ['nome']),
            modifica: true,
            etichetta: a => `Creo la materia «${a.nome}»`,
            esegui: a => {
                const m = Dati.creaMateria({ nome: a.nome, emoji: a.emoji, colore: /^#[0-9a-f]{6}$/i.test(a.colore || '') ? a.colore : undefined });
                return { creata: true, materia_id: m.id, nome: m.nome };
            },
        },
        {
            nome: 'modifica_materia',
            descrizione: 'Rinomina una materia o ne cambia emoji e colore.',
            parametri: S.obj({ materia_id: S.str('id'), nome: S.str('nuovo nome'), emoji: S.str('nuova emoji'), colore: S.str('colore esadecimale') }, ['materia_id']),
            modifica: true,
            etichetta: () => 'Modifico la materia',
            esegui: a => {
                if (!Dati.materia(a.materia_id)) throw new Error('Materia non trovata.');
                const mod = {};
                if (a.nome) mod.nome = a.nome.trim();
                if (a.emoji) mod.emoji = a.emoji;
                if (/^#[0-9a-f]{6}$/i.test(a.colore || '')) mod.colore = a.colore;
                Dati.aggiornaMateria(a.materia_id, mod);
                return { modificata: true };
            },
        },
        {
            nome: 'elimina_materia',
            descrizione: "Elimina una materia con tutti i suoi set, carte e materiali. Chiede conferma all'utente.",
            parametri: S.obj({ materia_id: S.str('id') }, ['materia_id']),
            modifica: true,
            etichetta: () => 'Elimino una materia',
            esegui: async (a, ctx) => {
                const m = Dati.materia(a.materia_id);
                if (!m) throw new Error('Materia non trovata.');
                const n = Dati.carteDiMateria(m.id, { tutte: true }).length;
                if (!await ctx.conferma(`Eliminare la materia <b>${esc(m.nome)}</b> con ${plurale(n, 'flashcard', 'flashcard')}?`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                Dati.eliminaMateria(m.id);
                return { eliminata: true };
            },
        },

        // --- Set ---
        {
            nome: 'crea_set',
            descrizione: 'Crea un set di flashcard in una materia; con contenitore_id diventa un sotto-set di quel set.',
            parametri: S.obj({ nome: S.str('nome'), materia_id: S.str('id della materia'), contenitore_id: S.str('facoltativo: id del set che lo contiene'), descrizione: S.str('facoltativa') }, ['nome', 'materia_id']),
            modifica: true,
            etichetta: a => `Creo il set «${a.nome}»`,
            esegui: a => {
                if (!Dati.materia(a.materia_id) && !(a.contenitore_id && Dati.set(a.contenitore_id))) throw new Error('Materia non trovata: usa panoramica o crea_materia.');
                const s = Dati.creaSet({ materiaId: a.materia_id, genitoreId: a.contenitore_id || null, nome: a.nome, descrizione: a.descrizione || '' });
                return { creato: true, set_id: s.id, nome: s.nome, contenitore_id: s.genitoreId };
            },
        },
        {
            nome: 'modifica_set',
            descrizione: 'Rinomina un set, ne cambia la descrizione o lo sposta (in un\'altra materia o dentro un altro set; contenitore_id vuoto = set principale).',
            parametri: S.obj({ set_id: S.str('id'), nome: S.str('nuovo nome'), descrizione: S.str('nuova descrizione'), materia_id: S.str('nuova materia'), contenitore_id: S.str('nuovo contenitore; stringa vuota = set principale') }, ['set_id']),
            modifica: true,
            etichetta: a => `Modifico il set «${nomeSet(a.set_id)}»`,
            esegui: a => {
                richiediSet(a.set_id);
                const mod = {};
                if (a.nome) mod.nome = a.nome.trim();
                if (a.descrizione != null) mod.descrizione = a.descrizione;
                if (a.materia_id) { if (!Dati.materia(a.materia_id)) throw new Error('Materia non trovata.'); mod.materiaId = a.materia_id; }
                if (a.contenitore_id != null) mod.genitoreId = a.contenitore_id || null;
                const s = Dati.aggiornaSet(a.set_id, mod);
                return { modificato: true, set: { id: s.id, nome: s.nome, materia_id: s.materiaId, contenitore_id: s.genitoreId } };
            },
        },
        {
            nome: 'elimina_set',
            descrizione: "Elimina un set con sotto-set, carte e materiali. Chiede conferma all'utente.",
            parametri: S.obj({ set_id: S.str('id') }, ['set_id']),
            modifica: true,
            etichetta: a => `Elimino il set «${nomeSet(a.set_id)}»`,
            esegui: async (a, ctx) => {
                const s = richiediSet(a.set_id);
                const n = Dati.carteConSottoSet(s.id, { tutte: true }).length;
                if (!await ctx.conferma(`Eliminare il set <b>${esc(s.nome)}</b> con ${plurale(n, 'flashcard', 'flashcard')}?`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                Dati.eliminaSet(s.id);
                return { eliminato: true };
            },
        },

        // --- Carte ---
        {
            nome: 'crea_carte',
            descrizione: "Crea flashcard in un set (di solito a risposta aperta; a scelta multipla con 'risposte' solo se l'utente lo chiede). Per le domande a cascata indica la madre: 'madre' = indice (da 0) di una carta precedente in questa stessa lista, oppure 'madre_id' = id di una carta già esistente nel set. Se la risposta sta in una mappa dell'app, collega la carta al nodo (mappa_id e nodo_id): nella risposta comparirà il suo sottoramo, e la risposta scritta può restare vuota. Massimo 60 carte per chiamata.",
            parametri: S.obj({
                set_id: S.str('id del set'),
                mappa_id: S.str('facoltativo: mappa a cui appartengono i nodo_id delle carte'),
                carte: S.arr(S.obj({
                    domanda: S.str('domanda; puoi usare **grassetto**, *corsivo*, __sottolineato__, ~~barrato~~ e a capo, oppure HTML (elenchi, apici, tabelle…)'),
                    risposta: S.str('risposta (facoltativa solo se la carta ha nodo_id)'),
                    risposte: S.arr(S.obj({ testo: S.str('testo della risposta'), corretta: S.bool('è giusta') }, ['testo']), "scelta multipla (2-6 risposte, almeno una giusta), al posto di 'risposta': solo se l'utente lo chiede"),
                    nodo_id: S.str('facoltativo: nodo della mappa dove sta la risposta'),
                    fonte: SCHEMA_FONTE,
                    tag: S.arr(S.str('tag'), 'tag, es. generale / sottoramo / concetto 1 / dettaglio'),
                    suggerimento: S.str('facoltativo'),
                    spiegazione: S.str('facoltativa, mostrata dopo la risposta'),
                    madre: S.int('facoltativo: indice nella lista della domanda madre'),
                    madre_id: S.str('facoltativo: id di una carta esistente che fa da madre'),
                }, ['domanda']), 'le carte da creare, nell\'ordine in cui vanno studiate'),
            }, ['set_id', 'carte']),
            modifica: true,
            etichetta: a => `Creo ${plurale((a.carte || []).length, 'carta', 'carte')} in «${nomeSet(a.set_id)}»`,
            esegui: a => {
                const s = richiediSet(a.set_id);
                const lista = (a.carte || []).slice(0, 60);
                if (!lista.length) throw new Error('Nessuna carta da creare.');
                lista.forEach((c, i) => {
                    const multipla = Array.isArray(c.risposte) && c.risposte.length;
                    if (!String(c.domanda || '').trim() || (!String(c.risposta || '').trim() && !multipla && !c.nodo_id)) throw new Error(`Carta ${i}: servono la domanda e la risposta (o il nodo della mappa).`);
                    if (multipla && (c.risposte.length < 2 || !c.risposte.some(r => r.corretta))) throw new Error(`Carta ${i}: una scelta multipla ha almeno 2 risposte, almeno una giusta.`);
                });
                const avvisi = [];
                const legami = lista.map((c, i) => {
                    try { return legameMappa(a.mappa_id, c.nodo_id); } catch (e) { throw new Error(`Carta ${i}: ${e.message}`); }
                });
                const fonti = lista.map((c, i) => {
                    try {
                        const prima = avvisi.length;
                        const f = legameFonte(c.fonte, avvisi);
                        for (let k = prima; k < avvisi.length; k++) avvisi[k] = `carta ${i}: ${avvisi[k]}`;
                        return f;
                    } catch (e) { throw new Error(`Carta ${i}: ${e.message}`); }
                });
                const create = Dati.creaCarte(s.id, lista.map((c, i) => ({
                    domanda: campoDaIA(c.domanda),
                    risposte: Array.isArray(c.risposte) && c.risposte.length ? c.risposte.map(r => ({ testo: campoDaIA(r.testo), corretta: !!r.corretta }))
                        : String(c.risposta || '').trim() ? [{ testo: campoDaIA(c.risposta), corretta: true }] : [],
                    mappa: legami[i], fonte: fonti[i],
                    tag: c.tag || [], suggerimento: c.suggerimento || '', spiegazione: c.spiegazione ? campoDaIA(c.spiegazione) : '',
                    genitore: Number.isInteger(c.madre) ? c.madre : null,
                })));
                lista.forEach((c, i) => { if (c.madre_id && !Number.isInteger(c.madre)) Dati.impostaMadre(create[i].id, c.madre_id); });
                return { create: create.length, ids: create.map(c => c.id), set: s.nome, ignorate: (a.carte || []).length - lista.length || undefined, ...(avvisi.length ? { avvisi } : {}) };
            },
        },
        {
            nome: 'modifica_carte',
            descrizione: "Modifica una o più flashcard: testo, risposta (o le risposte di una scelta multipla), tag, suggerimento, spiegazione, domanda madre (madre_id vuoto = domanda principale), valutazione (come se l'utente la cambiasse a mano: cambia lo stato del set, non le date) o la sua ripetizione spaziata (n_rep, ultimo_ripasso, intervallo_giorni o prossima_revisione; cambiando solo n_rep l'intervallo torna quello della sequenza per quella rep). I testi valgono come in crea_carte: le immagini del campo restano dove scrivi [immagine N] (come in lettura); per la formattazione che il testo non mostra riscrivi l'HTML di <campo>_html.",
            parametri: S.obj({
                modifiche: S.arr(S.obj({
                    carta_id: S.str('id'), domanda: S.str('nuova domanda'), risposta: S.str('nuova risposta (carte a risposta aperta)'),
                    risposte: S.arr(S.obj({ testo: S.str('testo'), corretta: S.bool('è giusta') }, ['testo']), 'tutte le risposte di una scelta multipla, nell\'ordine (sostituiscono quelle di prima; una sola = risposta aperta)'),
                    tag: S.arr(S.str('tag'), 'sostituisce i tag'), suggerimento: S.str('nuovo suggerimento'), spiegazione: S.str('nuova spiegazione'),
                    madre_id: S.str('nuova domanda madre; stringa vuota = principale'),
                    mappa_id: S.str('mappa del nodo_id'), nodo_id: S.str("nodo della mappa dove sta la risposta; '' = togli il collegamento"),
                    fonte: SCHEMA_FONTE,
                    valutazione: S.str("scarso | ok | buono | perfetto | nessuna (= mai valutata)"),
                    n_rep: S.int('N° Rep della carta'), ultimo_ripasso: S.str('AAAA-MM-GG ("" per svuotare)'),
                    intervallo_giorni: S.int('giorni dall\'ultimo ripasso alla prossima revisione'), prossima_revisione: S.str('AAAA-MM-GG, dopo l\'ultimo ripasso: l\'intervallo si adegua'),
                    riadegua_al_set: S.bool('true = la carta prende ultimo ripasso e intervallo del suo set (già ripassato) ed esce dalle flashcard per conto loro; valutazione e N° Rep restano'),
                    riadegua_al_mazzo_id: S.str('come riadegua_al_set, ma al mazzo indicato tra quelli della carta (mazzi in elenca_revisioni con flashcard): da lì in poi la carta segue lui'),
                }, ['carta_id'])),
            }, ['modifiche']),
            modifica: true,
            etichetta: a => `Modifico ${plurale((a.modifiche || []).length, 'carta', 'carte')}`,
            esegui: a => {
                const esiti = (a.modifiche || []).map(m => {
                    const c = Dati.carta(m.carta_id);
                    if (!c) return { carta_id: m.carta_id, errore: 'non trovata' };
                    const dati = {};
                    if (m.domanda) dati.domanda = campoDaIA(m.domanda, c.domanda);
                    if (Array.isArray(m.risposte) && m.risposte.length) {
                        if (m.risposte.length > 1 && !m.risposte.some(r => r.corretta)) return { carta_id: c.id, errore: 'una scelta multipla ha almeno una risposta giusta' };
                        dati.risposte = m.risposte.map((r, i) => ({ testo: campoDaIA(r.testo, (c.risposte[i] || {}).testo), corretta: m.risposte.length === 1 || !!r.corretta }));
                    } else if (m.risposta) {
                        if (c.risposte.length > 1) return { carta_id: c.id, errore: "è una scelta multipla: cambia le risposte con 'risposte'" };
                        dati.risposte = [{ testo: campoDaIA(m.risposta, (c.risposte[0] || {}).testo), corretta: true }];
                    }
                    if (Array.isArray(m.tag)) dati.tag = m.tag;
                    if (m.suggerimento != null) dati.suggerimento = m.suggerimento;
                    if (m.spiegazione != null) dati.spiegazione = m.spiegazione ? campoDaIA(m.spiegazione, c.spiegazione) : '';
                    if (m.nodo_id != null) {
                        try { dati.mappa = legameMappa(m.mappa_id || (c.mappa || {}).id, m.nodo_id); } catch (e) { return { carta_id: c.id, errore: e.message }; }
                    }
                    const avvisi = [];
                    if (m.fonte) {
                        try { dati.fonte = legameFonte(m.fonte, avvisi); } catch (e) { return { carta_id: c.id, errore: e.message }; }
                    }
                    Dati.aggiornaCarta(c.id, dati);
                    if (m.valutazione != null && (m.valutazione in VALUTAZIONE || m.valutazione === 'nessuna')) Dati.impostaValutazione([c], m.valutazione === 'nessuna' ? null : VALUTAZIONE[m.valutazione]);
                    if (m.n_rep != null || m.ultimo_ripasso != null || m.intervallo_giorni != null || m.prossima_revisione) {
                        Dati.aggiornaSrs(c.id, {
                            rep: m.n_rep, intervallo: m.intervallo_giorni, prossima: dataValida(m.prossima_revisione) || undefined,
                            ...(m.ultimo_ripasso != null ? { giorno: dataValida(m.ultimo_ripasso) } : {}),
                        });
                    }
                    if (m.riadegua_al_set && !Dati.allineaAlSet([Dati.carta(c.id)]).length) return { carta_id: c.id, errore: 'il set della carta non è ancora stato ripassato: non c\'è niente a cui riadeguarla' };
                    if (m.riadegua_al_mazzo_id) {
                        const mazzo = Revisioni.mazziDi(Dati.carta(c.id)).find(x => x.id === m.riadegua_al_mazzo_id);
                        if (!mazzo) return { carta_id: c.id, errore: `il mazzo ${m.riadegua_al_mazzo_id} non è tra quelli già ripassati che contengono la carta (vedi elenca_revisioni con flashcard)` };
                        Dati.allineaAlSet([Dati.carta(c.id)], mazzo, { segui: true });
                    }
                    let madre;
                    if (m.madre_id != null) madre = Dati.impostaMadre(c.id, m.madre_id || null) ? 'cambiata' : 'invariata (non valida o uguale)';
                    return { carta_id: c.id, ok: true, madre, ...(avvisi.length ? { avvisi } : {}) };
                });
                return { esiti };
            },
        },
        {
            nome: 'collega_carte_fonte',
            descrizione: "Collega flashcard al punto di un materiale (PDF, slide, Word, testo, nota) dove sta la loro risposta: pagina o diapositiva e frase copiata alla lettera. Nello studio, sotto la risposta, compare la fonte e un clic apre il materiale lì (il PDF alla pagina, i testi con la frase evidenziata). materiale_id '' toglie la fonte. Per le carte che stanno in una mappa dell'app usa collega_carte_mappa.",
            parametri: S.obj({
                collegamenti: S.arr(S.obj({
                    carta_id: S.str('id della carta'), materiale_id: S.str("id del materiale; '' = togli la fonte"),
                    pagina: S.int('pagina o diapositiva'), citazione: S.str('frase del materiale copiata alla lettera (max 300 caratteri)'),
                }, ['carta_id', 'materiale_id'])),
            }, ['collegamenti']),
            modifica: true,
            etichetta: a => `Collego ${plurale((a.collegamenti || []).length, 'carta', 'carte')} alle fonti`,
            esegui: a => {
                let collegate = 0, tolte = 0;
                const errori = [], avvisi = [];
                (a.collegamenti || []).forEach(x => {
                    const c = Dati.carta(x.carta_id);
                    if (!c) { errori.push(`carta ${x.carta_id} non trovata`); return; }
                    try {
                        const prima = avvisi.length;
                        const fonte = legameFonte({ materiale_id: x.materiale_id, pagina: x.pagina, citazione: x.citazione }, avvisi);
                        for (let k = prima; k < avvisi.length; k++) avvisi[k] = `carta ${c.id}: ${avvisi[k]}`;
                        Dati.aggiornaCarta(c.id, { fonte });
                        if (fonte) collegate++; else tolte++;
                    } catch (e) { errori.push(`carta ${c.id}: ${e.message}`); }
                });
                return { collegate, tolte, ...(errori.length ? { errori } : {}), ...(avvisi.length ? { avvisi } : {}) };
            },
        },
        {
            nome: 'collega_carte_mappa',
            descrizione: "Collega flashcard ai nodi di una mappa dell'app dove sta la loro risposta: nello studio, sotto la risposta, compare tutto il sottoramo che contiene il nodo (sempre aggiornato con la mappa), con il nodo evidenziato. nodo_id '' toglie il collegamento. Non collegare le carte che non corrispondono a un nodo (per esempio quelle fatte da materiali in prosa).",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'),
                collegamenti: S.arr(S.obj({ carta_id: S.str('id della carta'), nodo_id: S.str("id del nodo; '' = togli il collegamento") }, ['carta_id', 'nodo_id'])),
            }, ['mappa_id', 'collegamenti']),
            modifica: true,
            etichetta: a => `Collego ${plurale((a.collegamenti || []).length, 'carta', 'carte')} alla mappa «${(Mappe.mappa(a.mappa_id) || {}).nome || '?'}»`,
            esegui: a => {
                const m = Mappe.mappa(a.mappa_id);
                if (!m) throw new Error('Mappa non trovata: usa elenca_mappe.');
                let collegate = 0, tolte = 0;
                const errori = [];
                (a.collegamenti || []).forEach(x => {
                    const c = Dati.carta(x.carta_id);
                    if (!c) { errori.push(`carta ${x.carta_id} non trovata`); return; }
                    if (x.nodo_id && !m.nodi[x.nodo_id]) { errori.push(`nodo ${x.nodo_id} non trovato (carta ${c.id})`); return; }
                    Dati.aggiornaCarta(c.id, { mappa: x.nodo_id ? { id: m.id, nodo: x.nodo_id } : null });
                    if (x.nodo_id) collegate++; else tolte++;
                });
                return { collegate, tolte, ...(errori.length ? { errori } : {}) };
            },
        },
        {
            nome: 'elimina_carte',
            descrizione: "Elimina flashcard (le loro figlie salgono di un livello). Chiede conferma all'utente.",
            parametri: S.obj({ carte_ids: S.arr(S.str('id')) }, ['carte_ids']),
            modifica: true,
            etichetta: a => `Elimino ${plurale((a.carte_ids || []).length, 'carta', 'carte')}`,
            esegui: async (a, ctx) => {
                const carte = (a.carte_ids || []).map(Dati.carta).filter(Boolean);
                if (!carte.length) throw new Error('Nessuna carta trovata.');
                const esempi = carte.slice(0, 3).map(c => `<li>${esc(Ui.tronca(testo(c.domanda), 90))}</li>`).join('');
                if (!await ctx.conferma(`Eliminare ${plurale(carte.length, 'flashcard', 'flashcard')}?<ul>${esempi}</ul>${carte.length > 3 ? '…' : ''}`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                carte.forEach(c => Dati.eliminaCarta(c.id));
                return { eliminate: carte.length };
            },
        },
        {
            nome: 'sposta_carte',
            descrizione: 'Sposta flashcard (con le loro figlie) in un altro set, come domande principali.',
            parametri: S.obj({ carte_ids: S.arr(S.str('id')), set_id: S.str('set di destinazione') }, ['carte_ids', 'set_id']),
            modifica: true,
            etichetta: a => `Sposto ${plurale((a.carte_ids || []).length, 'carta', 'carte')} in «${nomeSet(a.set_id)}»`,
            esegui: a => {
                richiediSet(a.set_id);
                const ids = (a.carte_ids || []).filter(id => Dati.carta(id));
                ids.forEach(id => Dati.spostaCarta(id, a.set_id));
                return { spostate: ids.length };
            },
        },
        {
            nome: 'riordina_carta',
            descrizione: "Cambia la posizione di una carta nell'albero: 'rientra' (diventa figlia della sorella sopra), 'esci' (sale di un livello), 'su' o 'giu' (tra le sorelle).",
            parametri: S.obj({ carta_id: S.str('id'), azione: S.str('rientra | esci | su | giu') }, ['carta_id', 'azione']),
            modifica: true,
            etichetta: () => 'Riordino una carta',
            esegui: a => {
                richiediCarta(a.carta_id);
                const op = { rientra: () => Dati.aumentaRientro(a.carta_id), esci: () => Dati.riduciRientro(a.carta_id), su: () => Dati.spostaTraSorelle(a.carta_id, -1), giu: () => Dati.spostaTraSorelle(a.carta_id, 1) }[a.azione];
                if (!op) throw new Error('Azione non valida: usa rientra, esci, su o giu.');
                return { fatto: op() };
            },
        },
        {
            nome: 'reimposta_progressi',
            descrizione: "Riporta a 'mai studiate' le carte di un set (sotto-set compresi) o quelle indicate. Chiede conferma.",
            parametri: S.obj({ set_id: S.str('facoltativo'), carte_ids: S.arr(S.str('id'), 'facoltativo') }),
            modifica: true,
            etichetta: () => 'Reimposto i progressi',
            esegui: async (a, ctx) => {
                const carte = a.set_id ? Dati.carteConSottoSet(richiediSet(a.set_id).id, { tutte: true }) : (a.carte_ids || []).map(Dati.carta).filter(Boolean);
                if (!carte.length) throw new Error('Nessuna carta indicata.');
                if (!await ctx.conferma(`Riportare ${plurale(carte.length, 'flashcard', 'flashcard')} a <b>mai studiate</b>?`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                Dati.reimpostaProgressi(carte);
                return { reimpostate: carte.length };
            },
        },

        // --- Materiali ---
        {
            nome: 'elenca_materiali',
            descrizione: "Elenca i materiali di studio di un set (PDF, slide, mappe, note…). Le mappe create nell'app hanno mappa_id: per leggerle o cambiarle usa gli strumenti delle mappe.",
            parametri: S.obj({ set_id: S.str('id del set') }, ['set_id']),
            etichetta: a => `Guardo i materiali di «${nomeSet(a.set_id)}»`,
            esegui: a => {
                const s = richiediSet(a.set_id);
                return {
                    materiali: Dati.materialiDiSet(s.id).map(m => ({
                        id: m.id, nome: m.nome, tipo: m.tipo, descrizione: Materiali.descrivi(m), ha_schema: !!m.albero, caratteri_testo: (m.testo || '').length,
                        mappa_id: m.mappaId || undefined, usa_in_chat: m.usaInChat !== false,
                        cambiato_di_recente: m.precedente ? true : undefined, novita_da_vedere: m.novita || undefined,
                        // testo, albero e precedente si leggono con leggi_materiale; anteprima = miniatura (immagine),
                        // remoto = riferimento interno al file mandato a Gemini per la chat
                        ...altriDati(m, ['id', 'nome', 'tipo', 'mappaId', 'usaInChat', 'novita', 'setId'], ['testo', 'albero', 'precedente', 'anteprima', 'remoto']),
                    })),
                };
            },
        },
        {
            nome: 'leggi_materiale',
            descrizione: "Legge il testo estratto di un materiale (a pezzi se è lungo) e, per mappe e schemi, l'albero come elenco rientrato.",
            parametri: S.obj({ materiale_id: S.str('id'), da: S.int('carattere di partenza (predefinito 0)'), lunghezza: S.int('caratteri da leggere (predefinito 40000)') }, ['materiale_id']),
            etichetta: a => `Leggo «${(Dati.materiale(a.materiale_id) || {}).nome || 'un materiale'}»`,
            esegui: a => {
                const m = Dati.materiale(a.materiale_id);
                if (!m) throw new Error('Materiale non trovato.');
                const da = Math.max(0, a.da || 0), lunghezza = limita(a.lunghezza || 40000, 1000, 120000);
                const t = m.testo || '';
                return {
                    nome: m.nome, tipo: m.tipo, descrizione: Materiali.descrivi(m),
                    schema: m.albero ? Materiali.alberoInTesto(m.albero) : undefined,
                    testo: t.slice(da, da + lunghezza), da, caratteri_totali: t.length,
                    continua: da + lunghezza < t.length ? `leggi ancora con da=${da + lunghezza}` : undefined,
                    novita_rispetto_alla_versione_precedente: m.precedente && !da ? Ui.tronca(Materiali.differenzeInTesto(Materiali.differenze(m)), 20000) : undefined,
                    nota: !t && (m.tipo === 'immagine' || m.tipo === 'pdf') ? 'Nessun testo estratto: il contenuto è visibile solo come file nella chat del set.' : undefined,
                };
            },
        },
        {
            nome: 'crea_nota',
            descrizione: "Salva una nota tra i materiali di un set (es. un riassunto). Se il testo è uno schema a titoli ed elenchi rientrati diventa anche una mappa.",
            parametri: S.obj({ set_id: S.str('id del set'), titolo: S.str('titolo'), testo: S.str('contenuto in Markdown') }, ['set_id', 'titolo', 'testo']),
            modifica: true,
            etichetta: a => `Salvo la nota «${a.titolo}»`,
            esegui: a => {
                richiediSet(a.set_id);
                const m = Materiali.creaNota(a.set_id, a.titolo, a.testo);
                return { creata: true, materiale_id: m.id, schema: !!m.albero };
            },
        },
        {
            nome: 'modifica_materiale',
            descrizione: "Cambia un materiale come dal suo menu ⋯: nome, set in cui sta, se entra nella chat del set (usa_in_chat), il testo di una nota (riscrive tutta la nota), «Segna come visto» (toglie l'avviso di versione nuova). Per il materiale di una mappa dell'app nome e set valgono per la mappa.",
            parametri: S.obj({
                materiale_id: S.str('id'), nome: S.str('nuovo nome'), set_id: S.str('sposta in questo set'),
                usa_in_chat: S.bool('true = il materiale entra nella chat del set (predefinito), false = ne resta fuori'),
                testo: S.str('solo note: il nuovo testo in Markdown (sostituisce tutto)'), segna_visto: S.bool('toglie l\'avviso «aggiornato» dopo una versione nuova'),
            }, ['materiale_id']),
            modifica: true,
            etichetta: a => `Modifico «${(Dati.materiale(a.materiale_id) || {}).nome || 'un materiale'}»`,
            esegui: a => {
                const m = Dati.materiale(a.materiale_id);
                if (!m) throw new Error('Materiale non trovato: usa elenca_materiali.');
                if (a.testo != null && m.tipo !== 'nota') throw new Error('Il testo si riscrive solo nelle note: gli altri materiali sono copie di file. Non ho cambiato niente.');
                const fatto = [];
                if (a.set_id && a.set_id !== m.setId) richiediSet(a.set_id);
                const nome = a.nome && String(a.nome).trim();
                if (m.mappaId && Mappe.mappa(m.mappaId) && (nome || a.set_id)) {
                    // Il materiale segue la mappa (Materiali.allineaMappe): si cambia lei
                    Mappe.primaDiCambiare(m.mappaId);
                    const x = Mappe.mappa(m.mappaId);
                    if (nome) { x.nome = nome; fatto.push('nome della mappa'); }
                    if (a.set_id && a.set_id !== x.setId) { x.setId = a.set_id; x.materiaId = Dati.set(a.set_id).materiaId; fatto.push('set della mappa'); }
                    Mappe.salva(x);
                    Mappe.cambiataDaFuori(x.id);
                    Materiali.allineaMappe();
                } else {
                    if (nome) { Dati.aggiornaMateriale(m.id, { nome }); fatto.push('nome'); }
                    if (a.set_id && a.set_id !== m.setId) { Dati.aggiornaMateriale(m.id, { setId: a.set_id }); fatto.push('set'); }
                }
                if (typeof a.usa_in_chat === 'boolean') { Dati.aggiornaMateriale(m.id, { usaInChat: a.usa_in_chat }); fatto.push('chat del set'); }
                if (a.testo != null) {
                    Materiali.aggiornaTestoNota(m.id, nome || Dati.materiale(m.id).nome, String(a.testo));
                    fatto.push('testo');
                }
                if (a.segna_visto && m.novita) { Dati.aggiornaMateriale(m.id, { novita: false }); fatto.push('visto'); }
                return { modificato: fatto };
            },
        },
        {
            nome: 'elimina_materiale',
            descrizione: "Elimina un materiale da un set. Chiede conferma all'utente. Per il materiale di una mappa dell'app toglie la mappa dal set (la mappa resta nella sezione Mappe; per eliminarla usa elimina_mappa).",
            parametri: S.obj({ materiale_id: S.str('id') }, ['materiale_id']),
            modifica: true,
            etichetta: () => 'Elimino un materiale',
            esegui: async (a, ctx) => {
                const m = Dati.materiale(a.materiale_id);
                if (!m) throw new Error('Materiale non trovato.');
                if (!await ctx.conferma(m.mappaId ? `Togliere la mappa <b>${esc(m.nome)}</b> dai materiali del set? Resta nella sezione Mappe.`
                    : `Eliminare il materiale <b>${esc(m.nome)}</b>?`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                Dati.eliminaMateriale(m.id);
                return m.mappaId ? { tolta_dal_set: true, mappa_id: m.mappaId } : { eliminato: true };
            },
        },

        // --- Revisioni degli argomenti (spaced repetition come nel database di Notion) ---
        {
            nome: 'elenca_revisioni',
            descrizione: "Elenca gli argomenti delle revisioni (spaced repetition degli argomenti): N° Rep, ultimo ripasso, intervallo, prossima revisione (ultimo ripasso + intervallo), alert, stato e storico dei ripassi segnati. Filtra per set (sotto-set compresi), per materia o solo quelli da ripassare. Con flashcard = true elenca invece il pannello «Per flashcard»: le carte sfasate rispetto al loro mazzo (anche quelle già valutate di un mazzo mai ripassato), da ripassare per conto loro, con i mazzi in cui stanno e quello che seguono.",
            parametri: S.obj({ set_id: S.str('facoltativo'), materia_id: S.str('facoltativo'), solo_da_ripassare: S.bool('solo quelli in ritardo o da fare oggi'), flashcard: S.bool('le flashcard per conto loro invece degli argomenti') }),
            etichetta: () => 'Guardo le revisioni',
            esegui: a => {
                if (a.flashcard) {
                    let voci = Revisioni.carteDevianti({ materiaId: a.materia_id || null });
                    if (a.set_id) { const ids = new Set([richiediSet(a.set_id).id, ...Dati.discendentiSet(a.set_id)]); voci = voci.filter(v => ids.has(v.carta.setId)); }
                    if (a.solo_da_ripassare) voci = voci.filter(Revisioni.cartaDaRipassare);
                    return {
                        oggi: chiaveGiorno(),
                        flashcard: voci.slice(0, 200).map(v => {
                            const segue = Revisioni.argomentoDi(v.carta), mazzi = Revisioni.mazziDi(v.carta);
                            return cartaPerIA(v.carta, {
                                set: nomeSet(v.carta.setId), alert: Revisioni.avviso(v).testo + (Revisioni.maiValutata(v) ? ' (mai valutata)' : ''), rispetto_al_mazzo: v.sfasatura.testo,
                                segue_il_mazzo: segue ? { id: segue.id, nome: segue.nome } : undefined,
                                mazzi: mazzi.length > 1 ? mazzi.map(x => ({ id: x.id, nome: x.nome })) : undefined,
                            });
                        }),
                        totale: voci.length,
                    };
                }
                let lista = a.set_id ? Dati.argomentiDiSet(richiediSet(a.set_id).id, { conSottoSet: true })
                    : a.materia_id ? Dati.argomentiDiMateria(a.materia_id) : Dati.tuttiGliArgomenti();
                if (a.solo_da_ripassare) lista = lista.filter(Revisioni.daRipassare).sort(Revisioni.perUrgenza);
                return { oggi: chiaveGiorno(), argomenti: lista.map(argomentoPerIA) };
            },
        },
        {
            nome: 'crea_argomento_revisione',
            descrizione: "Aggiunge un argomento alle revisioni di un set (es. un capitolo o uno schema). Le sue flashcard: tutte quelle del set (tutte_le_flashcard, una sola riga così per set) o solo alcune (carte_ids); con le flashcard l'argomento si aggiorna dallo studio e lo stato viene dalle carte. Senza, il ripasso si segna a mano. Se l'utente l'ha già ripassato, indica ripetizioni e ultimo_ripasso (e intervallo_giorni se lo sa; se no vale quello della sequenza per quel N° Rep).",
            parametri: S.obj({
                set_id: S.str('id del set'), nome: S.str('nome dell\'argomento (di solito capitolo o schema)'), fonte: S.str('schema o fonte (testo libero)'),
                materiali_ids: S.arr(S.str('id'), 'facoltativo: materiali da collegare'), ripetizioni: S.int('N° Rep'), ultimo_ripasso: S.str('AAAA-MM-GG'),
                intervallo_giorni: S.int('giorni dall\'ultimo ripasso alla prossima revisione'),
                tutte_le_flashcard: S.bool("l'argomento comprende tutte le flashcard del set"), carte_ids: S.arr(S.str('id'), "solo queste flashcard del set"),
                stato: S.str('ottimo | buono | ok | scarso'),
            }, ['set_id', 'nome']),
            modifica: true,
            etichetta: a => `Aggiungo «${a.nome}» alle revisioni`,
            esegui: a => {
                const s = richiediSet(a.set_id);
                const carte = Array.isArray(a.carte_ids) && a.carte_ids.length ? a.carte_ids.filter(id => (Dati.carta(id) || {}).setId === s.id) : null;
                // Come nel modulo dell'app: almeno una carta, e una sola riga con tutte le carte per set
                if (carte || a.tutte_le_flashcard) { const errore = Revisioni.erroreCarte(s.id, carte); if (errore) throw new Error(errore); }
                const x = Dati.creaArgomento({
                    setId: s.id, nome: a.nome, fonte: a.fonte || '', materialeIds: (a.materiali_ids || []).filter(id => Dati.materiale(id)),
                    ...(carte ? { carte } : a.tutte_le_flashcard ? { delSet: true } : {}),
                    ripetizioni: a.ripetizioni || 0, ultimoRipasso: dataValida(a.ultimo_ripasso), intervallo: a.intervallo_giorni, stato: Revisioni.STATI[a.stato] ? a.stato : '',
                });
                return { creato: argomentoPerIA(x) };
            },
        },
        {
            nome: 'modifica_argomento_revisione',
            descrizione: "Modifica un argomento delle revisioni: nome, fonte, materiali collegati, le sue flashcard (tutte quelle del set o solo alcune, come «Flashcard del mazzo…»), N° Rep (cambiandolo da solo, l'intervallo torna quello della sequenza per quella rep), ultimo ripasso, intervallo, prossima revisione, stato o set. Lo stato della riga di un set (riga_del_set) viene dalle valutazioni delle carte: per cambiarlo cambia la valutazione delle carte (modifica_carte).",
            parametri: S.obj({
                argomento_id: S.str('id'), nome: S.str('nome'), fonte: S.str('fonte'), materiali_ids: S.arr(S.str('id'), 'sostituisce i materiali collegati ([] = nessuno)'),
                ripetizioni: S.int('N° Rep'), ultimo_ripasso: S.str('AAAA-MM-GG ("" per svuotare)'), stato: S.str('ottimo | buono | ok | scarso | ""'), set_id: S.str('sposta in un altro set'),
                intervallo_giorni: S.int('giorni dall\'ultimo ripasso alla prossima revisione'), prossima_revisione: S.str('AAAA-MM-GG, dopo l\'ultimo ripasso: l\'intervallo si adegua'),
                tutte_le_flashcard: S.bool("true = il mazzo comprende tutte le flashcard del set (una sola riga così per set)"),
                carte_ids: S.arr(S.str('id'), 'il mazzo comprende solo queste flashcard del set (sostituisce la scelta di prima)'),
            }, ['argomento_id']),
            modifica: true,
            etichetta: a => `Modifico «${(Dati.argomento(a.argomento_id) || {}).nome || 'un mazzo'}»`,
            esegui: a => {
                const x = Dati.argomento(a.argomento_id);
                if (!x) throw new Error('Argomento non trovato: usa elenca_revisioni.');
                const mod = {};
                if (a.nome != null) mod.nome = a.nome;
                if (a.fonte != null) mod.fonte = a.fonte;
                if (Array.isArray(a.materiali_ids)) {
                    mod.materialeIds = [...new Set(a.materiali_ids.filter(id => Dati.materiale(id)))];
                    // Quelli tolti non tornano quando lo studio aggiunge le fonti delle carte
                    mod.fontiTolte = [...new Set([...(x.fontiTolte || []), ...(x.materialeIds || []).filter(id => !mod.materialeIds.includes(id))])].filter(id => !mod.materialeIds.includes(id));
                }
                if (a.ripetizioni != null) mod.ripetizioni = a.ripetizioni;
                if (a.ultimo_ripasso != null) mod.ultimoRipasso = dataValida(a.ultimo_ripasso);
                if (a.intervallo_giorni != null) mod.intervallo = a.intervallo_giorni;
                if (a.prossima_revisione && dataValida(a.prossima_revisione)) mod.prossima = dataValida(a.prossima_revisione);
                if (a.stato != null) mod.stato = Revisioni.STATI[a.stato] ? a.stato : '';
                if (a.set_id) mod.setId = richiediSet(a.set_id).id;
                if (Array.isArray(a.carte_ids) && a.carte_ids.length || a.tutte_le_flashcard) {
                    const setId = mod.setId || x.setId;
                    const carte = a.tutte_le_flashcard ? null : a.carte_ids.filter(id => (Dati.carta(id) || {}).setId === setId);
                    const errore = Revisioni.erroreCarte(setId, carte, x.id);
                    if (errore) throw new Error(errore);
                    Object.assign(mod, { carte, delSet: carte == null });
                }
                const fatto = Dati.aggiornaArgomento(a.argomento_id, mod);
                // Spostato in un altro set perde le sue flashcard (aggiornaArgomento): la scelta nuova vale per quello
                if (mod.setId && 'carte' in mod) Dati.aggiornaArgomento(fatto.id, { carte: mod.carte, delSet: mod.delSet });
                return { modificato: argomentoPerIA(Dati.argomento(a.argomento_id)) };
            },
        },
        {
            nome: 'segna_ripasso_argomento',
            descrizione: "Segna che l'utente ha ripassato un argomento (come il suo 'Ripassato' in Notion): N° Rep +1, ultimo ripasso = oggi (o la data indicata) e nuovo intervallo secondo la sequenza, adattato se è in anticipo, in ritardo o lo stesso giorno; con lo stato se lo dice. Con annulla_ultimo toglie invece l'ultimo ripasso segnato (come «Annulla il ripasso» del menu): tornano N° Rep, date e stato di prima. Per un ripasso fatto studiando le flashcard usa registra_ripasso.",
            parametri: S.obj({ argomento_id: S.str('id'), stato: S.str('ottimo | buono | ok | scarso'), giorno: S.str('AAAA-MM-GG, predefinito oggi'), annulla_ultimo: S.bool("toglie l'ultimo ripasso segnato") }, ['argomento_id']),
            modifica: true,
            etichetta: a => `${a.annulla_ultimo ? 'Annullo' : 'Segno'} il ripasso di «${(Dati.argomento(a.argomento_id) || {}).nome || 'un mazzo'}»`,
            esegui: a => {
                const x = Dati.argomento(a.argomento_id);
                if (!x) throw new Error('Argomento non trovato: usa elenca_revisioni.');
                if (a.annulla_ultimo) {
                    if (!(x.storico || []).length) throw new Error('Questo mazzo non ha ripassi segnati da annullare.');
                    return { annullato_il_ripasso: argomentoPerIA(Dati.annullaUltimoRipasso(x.id)) };
                }
                return { aggiornato: argomentoPerIA(Dati.segnaRipasso(a.argomento_id, Revisioni.STATI[a.stato] ? a.stato : '', dataValida(a.giorno) || chiaveGiorno())) };
            },
        },
        {
            nome: 'elimina_argomento_revisione',
            descrizione: "Toglie un argomento dalle revisioni (flashcard e materiali restano). Chiede conferma all'utente.",
            parametri: S.obj({ argomento_id: S.str('id') }, ['argomento_id']),
            modifica: true,
            etichetta: () => 'Tolgo un mazzo dalle revisioni',
            esegui: async (a, ctx) => {
                const x = Dati.argomento(a.argomento_id);
                if (!x) throw new Error('Argomento non trovato.');
                if (!await ctx.conferma(`Togliere <b>${esc(x.nome)}</b> dalle revisioni?`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                Dati.eliminaArgomento(x.id);
                return { eliminato: true };
            },
        },

        // --- Esami, impostazioni, navigazione, export ---
        {
            nome: 'crea_esame',
            descrizione: 'Aggiunge un esame al piano di studio.',
            parametri: S.obj({ nome: S.str('nome'), data: S.str('data AAAA-MM-GG'), materia_id: S.str('facoltativa'), note: S.str('facoltative') }, ['nome', 'data']),
            modifica: true,
            etichetta: a => `Aggiungo l'esame «${a.nome}»`,
            esegui: a => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(a.data || '')) throw new Error('Data non valida: usa AAAA-MM-GG.');
                const e = Dati.creaEsame({ nome: a.nome, data: a.data, materiaId: Dati.materia(a.materia_id) ? a.materia_id : null, note: a.note || '' });
                return { creato: true, esame_id: e.id };
            },
        },
        {
            nome: 'modifica_esame',
            descrizione: 'Modifica un esame del piano di studio.',
            parametri: S.obj({ esame_id: S.str('id'), nome: S.str('nome'), data: S.str('data AAAA-MM-GG'), materia_id: S.str('materia; vuota = nessuna'), note: S.str('note') }, ['esame_id']),
            modifica: true,
            etichetta: () => "Modifico un esame",
            esegui: a => {
                if (!Dati.esame(a.esame_id)) throw new Error('Esame non trovato.');
                const mod = {};
                if (a.nome) mod.nome = a.nome;
                if (a.data) { if (!/^\d{4}-\d{2}-\d{2}$/.test(a.data)) throw new Error('Data non valida.'); mod.data = a.data; }
                if (a.materia_id != null) mod.materiaId = a.materia_id || null;
                if (a.note != null) mod.note = a.note;
                Dati.aggiornaEsame(a.esame_id, mod);
                return { modificato: true };
            },
        },
        {
            nome: 'elimina_esame',
            descrizione: "Elimina un esame. Chiede conferma all'utente.",
            parametri: S.obj({ esame_id: S.str('id') }, ['esame_id']),
            modifica: true,
            etichetta: () => "Elimino un esame",
            esegui: async (a, ctx) => {
                const e = Dati.esame(a.esame_id);
                if (!e) throw new Error('Esame non trovato.');
                if (!await ctx.conferma(`Eliminare l'esame <b>${esc(e.nome)}</b>?`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                Dati.eliminaEsame(e.id);
                return { eliminato: true };
            },
        },
        {
            nome: 'modifica_impostazioni',
            descrizione: "Cambia le impostazioni: nome dell'utente, carte nuove e massime per sessione, ordine casuale, studio a cascata, dettagli nascosti (le carte con tag dettaglio spariscono da elenchi, conteggi e studio), tema (sistema | chiaro | scuro), sequenza degli intervalli delle revisioni (vale dal prossimo ripasso; con applica_sequenza_alle_revisioni ricalcola subito l'intervallo di ogni mazzo e flashcard già ripassati, come «Applica alle revisioni»).",
            parametri: S.obj({
                nome: S.str('nome'), nuove_per_sessione: S.int('carte nuove per sessione (-1 = senza limite)'),
                max_per_sessione: S.int('carte massime per sessione (-1 = senza limite)'), ordine_casuale: S.bool('ordine casuale'), sorelle_mescolate: S.bool("nell'ordine del set, le domande sorelle (stessa madre) in ordine casuale"), studio_a_cascata: S.bool('studio a cascata'), nascondi_dettagli: S.bool('nascondi le carte con tag dettaglio'), tema: S.str('sistema | chiaro | scuro'),
                sequenza_revisioni: S.arr(S.int('giorni'), 'giorni dopo la rep 1, 2, 3… ripassando puntuale: almeno due interi crescenti (Fibonacci 1, 2, 3, 5, 8, 13, 21; Raddoppio 1, 2, 4, 8, 16, 32)'),
                applica_sequenza_alle_revisioni: S.bool("ogni mazzo e flashcard già ripassati prende l'intervallo della sequenza per il suo N° Rep, dall'ultimo ripasso: le prossime revisioni si spostano"),
            }),
            modifica: true,
            etichetta: () => 'Cambio le impostazioni',
            esegui: a => {
                const mod = {};
                if (a.nome != null) mod.nome = a.nome;
                if (a.nuove_per_sessione != null) mod.nuovePerSessione = a.nuove_per_sessione < 0 ? null : limita(a.nuove_per_sessione, 0, 500);
                if (a.max_per_sessione) mod.maxPerSessione = a.max_per_sessione < 0 ? null : limita(a.max_per_sessione, 1, 1000);
                if (a.ordine_casuale != null) mod.ordineCasuale = !!a.ordine_casuale;
                if (a.sorelle_mescolate != null) mod.mescolaSorelle = !!a.sorelle_mescolate;
                if (a.studio_a_cascata != null) mod.cascata = !!a.studio_a_cascata;
                if (a.nascondi_dettagli != null) mod.nascondiDettagli = !!a.nascondi_dettagli;
                if (['sistema', 'chiaro', 'scuro'].includes(a.tema)) { mod.tema = a.tema; App.applicaTema(a.tema); }
                if (Array.isArray(a.sequenza_revisioni)) {
                    const seq = Srs.sequenzaValida(a.sequenza_revisioni);
                    if (!seq) throw new Error('sequenza_revisioni: almeno due numeri interi crescenti, da 1 in su (es. 1, 2, 3, 5, 8).');
                    mod.sequenzaRevisioni = seq;
                }
                Dati.salvaImpostazioni(mod);
                const ricalcolati = a.applica_sequenza_alle_revisioni ? Dati.ricalcolaIntervalli() : undefined;
                if (mod.sequenzaRevisioni || ricalcolati) App.aggiornaPiede();
                return { salvate: Object.keys(mod), sequenza_revisioni: Srs.sequenza(), ricalcolati };
            },
        },
        {
            nome: 'apri_pagina',
            descrizione: "Porta l'utente a una pagina dell'app: home, libreria, revisioni, mappe (l'elenco delle mappe mentali), statistiche, piano, impostazioni, materia (id), set (id), carta (id), mappa (id di una mappa mentale; per selezionare nodi usa vista_mappa), studio (id di un set o di una materia: avvia la sessione).",
            parametri: S.obj({ pagina: S.str('home | libreria | revisioni | mappe | statistiche | piano | impostazioni | materia | set | carta | mappa | studio'), id: S.str('id, quando serve') }, ['pagina']),
            etichetta: a => `Apro ${a.pagina}`,
            esegui: a => {
                const id = a.id || '';
                const rotte = { home: '/home', libreria: '/libreria', revisioni: '/revisioni', mappe: '/mappe', statistiche: '/statistiche', piano: '/piano', impostazioni: '/impostazioni', materia: '/materia/' + id, set: '/set/' + id, carta: '/carta/' + id, mappa: '/mappa/' + id };
                let rotta = rotte[a.pagina];
                if (a.pagina === 'studio') rotta = Dati.set(id) ? '/studio?set=' + id : Dati.materia(id) ? '/studio?materia=' + id : '/studio?ambito=oggi';
                if (!rotta) throw new Error('Pagina sconosciuta.');
                Router.vai(rotta);
                return { aperta: rotta };
            },
        },
        {
            nome: 'esporta_set',
            descrizione: "Esporta le flashcard di un set (di solito con i sotto-set). testo = file .md leggibile e reimportabile (domande ad albero, sotto-set, risposte, tag, suggerimenti, spiegazioni, fonti); excel = tabella con livello, stato e prossimo ripasso; copia = il testo restituito a te, per mostrarlo o lavorarci.",
            parametri: S.obj({
                set_id: S.str('id del set'), formato: S.str('testo | excel | copia'),
                sotto_set: S.bool('con i sotto-set (predefinito sì)'), stato: S.bool('nel testo anche lo stato di studio di ogni carta'),
            }, ['set_id']),
            etichetta: a => `Esporto «${nomeSet(a.set_id)}»`,
            esegui: async a => {
                const s = richiediSet(a.set_id);
                const o = { conSottoSet: a.sotto_set !== false, conStato: !!a.stato };
                if (a.formato === 'excel') return { scaricato: true, carte: await Importa.esportaXlsx(s.id, o) };
                const { testo, carte } = Importa.testoDiSet(s.id, o);
                if (a.formato === 'copia') return { carte, testo: Ui.tronca(testo, 80000) };
                scaricaFile(nomeFileSicuro(s.nome).slice(0, 120) + '.md', testo, 'text/markdown');
                return { scaricato: true, carte };
            },
        },
        {
            nome: 'importa_testo',
            descrizione: "Importa flashcard da un testo, come «Importa» dell'app con il testo incollato. Formato dell'app: '# Set' e '## Sotto-set', 'D:' domanda, 'R:' risposta (le righe sotto continuano il campo), '[x]' / '[ ]' risposte giuste e sbagliate di una scelta multipla, 'Tag: a, b', 'Suggerimento:', 'Spiegazione:', una tabulazione in più prima di 'D:' = domanda figlia della precedente; oppure una tabella CSV/TSV (domanda, risposta, tag, suggerimento, spiegazione). Le carte con la stessa domanda di una già nel set si aggiornano e tengono i progressi (aggiorna_esistenti, predefinito sì). Per creare carte nuove senza un testo da importare usa crea_carte.",
            parametri: S.obj({
                set_id: S.str('set di destinazione (i ## diventano suoi sotto-set, creati se mancano)'), testo: S.str('il testo da importare'),
                aggiorna_esistenti: S.bool('le carte con la stessa domanda si aggiornano invece di raddoppiare (predefinito true)'),
            }, ['set_id', 'testo']),
            modifica: true,
            etichetta: a => `Importo flashcard in «${nomeSet(a.set_id)}»`,
            esegui: a => {
                const s = richiediSet(a.set_id);
                const letti = Importa.leggiTesto(String(a.testo || ''));
                const n = letti.sezioni.reduce((t, x) => t + x.carte.length, 0);
                if (!n) throw new Error("Nel testo non ho trovato flashcard: usa il formato dell'app (D: / R:) o una tabella domanda, risposta.");
                const esito = Importa.applica(letti, s.id, { aggiorna: a.aggiorna_esistenti !== false });
                return { carte_nuove: esito.nuove, carte_aggiornate: esito.aggiornate, sotto_set_creati: esito.sottoSet, formato: letti.formato || undefined, righe_saltate: letti.saltate || undefined };
            },
        },

        // --- Studio, modifiche recenti e dati dell'app ---
        {
            nome: 'registra_ripasso',
            descrizione: "Registra un ripasso di flashcard come una sessione di studio dell'app, per esempio dopo aver interrogato l'utente in chat: le valutazioni (scarso | ok | buono | perfetto) nell'ordine in cui le ha date. La prima valutazione di ogni carta sposta N° Rep e date come nello studio (Scarso: la carta resta da rifare); una carta Ok o Scarso si può rivalutare più avanti nella stessa lista. Alla fine aggiorna le revisioni come la fine della sessione: per ogni mazzo di cui sono state valutate tutte le carte N° Rep +1 (e le carte Buono o Perfetto prendono la data del mazzo); se non tutte, il ripasso del mazzo si segna solo con segna_comunque. di_prova = ripasso di prova: va nelle statistiche ma non cambia carte né revisioni. Valuta come l'utente stesso dice di essere andato, non inventare.",
            parametri: S.obj({
                valutazioni: S.arr(S.obj({
                    carta_id: S.str('id'), valutazione: S.str('scarso | ok | buono | perfetto'), secondi: S.int('facoltativo: quanto ci ha messo a rispondere'),
                }, ['carta_id', 'valutazione']), 'le valutazioni, in ordine'),
                di_prova: S.bool('ripasso di prova: carte e revisioni restano come sono'),
                solo_da_sistemare: S.bool("ripasso delle sole carte da sistemare di un mazzo (mai valutate, Ok, Scarso): le carte si aggiornano, il N° Rep del mazzo no (salvo che fossero tutte)"),
                per_flashcard: S.bool('ripasso delle carte per conto loro (pannello «Per flashcard»): il N° Rep dei mazzi non cambia'),
                segna_comunque: S.bool('mazzi di cui non sono state valutate tutte le carte: segna lo stesso il ripasso (come «Segna come ripasso» a fine sessione)'),
            }, ['valutazioni']),
            modifica: true,
            etichetta: a => `Registro il ripasso di ${plurale((a.valutazioni || []).length, 'carta', 'carte')}`,
            esegui: async a => {
                const lista = (a.valutazioni || []).map(x => ({ c: Dati.carta(x.carta_id), v: VALUTAZIONE[x.valutazione], x }));
                const errate = lista.filter(y => !y.c || y.v == null);
                if (!lista.length) throw new Error('Nessuna valutazione.');
                if (errate.length) throw new Error(`Valutazioni non valide (carta inesistente o valutazione diversa da scarso | ok | buono | perfetto): ${errate.map(y => y.x.carta_id).join(', ')}`);
                // Come la sessione di studio (js/viste/studio.js, valuta): solo la prima valutazione sposta le date, salvo una
                // carta partita Scarso che arriva almeno a Ok; le carte nuove o Scarso all'inizio non prendono la data del mazzo
                const nonAllineare = Revisioni.daNonAllineare([...new Map(lista.map(y => [y.c.id, y.c])).values()]);
                const prime = new Map(), senzaDate = new Set();
                lista.forEach(({ c, v, x }) => {
                    const prima = !prime.has(c.id);
                    const recupero = !prima && senzaDate.has(c.id) && v >= Srs.OK;
                    Dati.registraRisposta(c, v, x.secondi > 0 ? x.secondi * 1000 : 0, { date: prima || recupero, diProva: !!a.di_prova });
                    if (prima) prime.set(c.id, v);
                    if (prima && v === Srs.SCARSO) senzaDate.add(c.id);
                    if (v >= Srs.OK) senzaDate.delete(c.id);
                });
                const carte = [...prime.keys()].map(id => cartaPerIA(Dati.carta(id)));
                if (a.di_prova) return { registrate: lista.length, di_prova: 'carte e revisioni restano come prima', carte };
                const esiti = await Revisioni.registraSessione({ valutate: prime, parziale: !!a.solo_da_sistemare, perCarta: !!a.per_flashcard, nonAllineare });
                for (const e of esiti.filter(x => x.esito === 'da-chiedere' && a.segna_comunque)) {
                    await Revisioni.segnaComunque(e.argomentoId, prime, nonAllineare);
                    e.esito = 'rep';
                }
                const DESCRIZIONI = {
                    rep: 'ripasso del mazzo segnato', parziale: 'ripasso di alcune carte: le flashcard sono aggiornate, il N° Rep del mazzo no',
                    'da-chiedere': 'non sono state valutate tutte le sue carte: il ripasso del mazzo non è segnato (segna_comunque se l\'utente lo vuole)',
                };
                App.aggiornaPiede();
                return {
                    registrate: lista.length, carte,
                    revisioni: esiti.map(e => ({ esito: DESCRIZIONI[e.esito] || e.esito, carte_valutate: e.fatte, carte_del_mazzo: e.totale, mazzo: Dati.argomento(e.argomentoId) ? argomentoPerIA(Dati.argomento(e.argomentoId)) : e.argomentoId })),
                };
            },
        },
        {
            nome: 'modifiche_recenti',
            descrizione: "Le modifiche recenti (Impostazioni → Modifiche recenti): le ultime modifiche dell'assistente e quelle dell'utente fatte su più cose insieme (importazioni, azioni sulle carte selezionate, revisioni dopo lo studio…). Le elenca, oppure ne annulla o ripristina una: annullando torna com'era solo quello che ha cambiato quella voce, e ciò che è stato cambiato di nuovo dopo resta com'è. Le modifiche fatte in questa stessa risposta si annullano con il pulsante Annulla sotto di lei.",
            parametri: S.obj({ azione: S.str('elenca | annulla | ripristina'), voce_id: S.str('annulla e ripristina: id della voce (da elenca)') }, ['azione']),
            modifica: true,
            etichetta: a => ({ elenca: 'Guardo le modifiche recenti', annulla: 'Annullo una modifica', ripristina: 'Ripristino una modifica' }[a.azione] || 'Modifiche recenti'),
            esegui: async a => {
                if (a.azione === 'elenca') {
                    return {
                        voci: (await Storia.voci()).map(v => ({
                            id: v.id, quando: istante(v.quando), fa: quandoFa(v.quando), chi: v.origine === 'assistente' ? 'assistente' : 'utente',
                            richiesta_o_azione: v.descrizione || undefined, cosa_ha_cambiato: v.riepilogo, stato: v.stato === 'annullata' ? 'annullata' : 'attiva',
                        })),
                    };
                }
                if (!['annulla', 'ripristina'].includes(a.azione)) throw new Error('azione: elenca | annulla | ripristina');
                if (!a.voce_id) throw new Error('Serve voce_id: usa prima azione elenca.');
                const esito = a.azione === 'annulla' ? await Storia.annullaNelTurno(a.voce_id) : await Storia.ripristinaNelTurno(a.voce_id);
                if (!esito || !esito.inversa) return { fatto: `niente: la voce era già ${a.azione === 'annulla' ? 'annullata' : 'attiva'} o non c'era niente da cambiare` };
                return { fatto: a.azione === 'annulla' ? 'annullata' : 'ripristinata', lasciati_com_erano_perche_cambiati_dopo: esito.saltati || undefined };
            },
        },
        {
            nome: 'dati_app',
            descrizione: "Operazioni su tutti i dati, come in Impostazioni: backup (scarica sul dispositivo il file di backup con tutti i dati e i file dei materiali), carica_prova e rimuovi_prova (i dati di prova per provare l'app; rimuovi toglie solo quelli), elimina_tutto (cancella TUTTI i dati, anche nel cloud: non si annulla; solo se l'utente lo chiede esplicitamente, e chiede conferma).",
            parametri: S.obj({ azione: S.str('backup | carica_prova | rimuovi_prova | elimina_tutto') }, ['azione']),
            modifica: true,
            etichetta: a => ({ backup: 'Preparo il backup', carica_prova: 'Carico i dati di prova', rimuovi_prova: 'Tolgo i dati di prova', elimina_tutto: 'Elimino tutti i dati' }[a.azione] || 'Dati dell\'app'),
            esegui: async (a, ctx) => {
                if (a.azione === 'backup') { await Importa.esportaBackup(); return { scaricato: true }; }
                if (a.azione === 'carica_prova') return DatiProva.carica() ? { caricati: true } : { gia_presenti: true };
                if (a.azione === 'rimuovi_prova') {
                    if (!DatiProva.presenti()) return { niente_da_togliere: true };
                    if (!await ctx.conferma('Tolgo materie, set, carte, storico ed esami <b>di prova</b>, compreso quello aggiunto dentro le materie di prova. I tuoi dati restano.')) return { annullato: true, motivo: "L'utente non ha confermato" };
                    DatiProva.rimuovi();
                    return { rimossi: true };
                }
                if (a.azione === 'elimina_tutto') {
                    if (!await ctx.conferma(`Cancello <b>tutto</b>: materie, set, flashcard, mappe, statistiche ed esami${Cloud.attivo ? ', <b>anche nel cloud e sugli altri dispositivi</b>' : ''}. <b>Non si può annullare</b>: senza un backup non si recuperano.`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                    await Dati.eliminaTutto();
                    Router.vai('/home');
                    return { eliminati: 'tutti i dati' };
                }
                throw new Error('azione: backup | carica_prova | rimuovi_prova | elimina_tutto');
            },
        },

        // --- Creazione flashcard per profondità (skill delle flashcard di localizzazione) ---
        {
            nome: 'prepara_piano_localizzazione',
            descrizione: "Passi 1-3 della creazione flashcard per profondità (skill delle flashcard di localizzazione): dall'albero della fonte calcola l'elenco esatto delle carte da scrivere (tag, ordine, localizzazioni, foglie assorbite, catene collassate). Se la fonte è una mappa dell'app passa mappa_id (le carte nasceranno collegate ai loro nodi); se è un materiale che è già una mappa o uno schema passa materiale_id; altrimenti trascrivi tu la fonte in 'schema' come elenco puntato rientrato (prima riga '# Titolo della fonte'), senza riassumere né riordinare. Puoi rilanciarlo con le correzioni (override).",
            parametri: S.obj({
                mappa_id: S.str("mappa dell'app (sezione Mappe): la fonte migliore, le carte nascono collegate ai nodi"),
                materiale_id: S.str('materiale con mappa o schema'),
                schema: S.str("albero trascritto: '# Titolo' e poi righe '- nodo' rientrate di due spazi per livello; 'Nome: testo' separa titolo e corpo del nodo"),
                titolo: S.str('facoltativo: titolo della fonte da usare alla radice'),
                etichette_forzate: S.arr(S.str('id nodo, es. 2.1.3'), 'nodi da trattare come foglie-etichetta (assorbite nella carta del padre)'),
                etichette_annullate: S.arr(S.str('id nodo'), 'foglie-etichetta a cui ridare una carta propria'),
                numerazione_sottorami: S.arr(S.obj({ nodo_id: S.str('id del sottoramo, es. 3'), numero: S.str('numero da usare') }, ['nodo_id', 'numero']), 'numeri dei sottorami letti male o assenti'),
                nodi_mappa: S.arr(S.str('id di un nodo della mappa'), 'solo con mappa_id: le carte solo di questi nodi (tag, risposte e madri restano quelli di tutta la mappa)'),
                con_rami: S.bool('con nodi_mappa: anche i rami sotto ai nodi (predefinito true)'),
                set_id: S.str('con nodi_mappa: set in cui andranno le carte, per agganciarle alle carte che ha già'),
                salta_esistenti: S.bool('con nodi_mappa: niente carte per i nodi che nel set hanno già una flashcard'),
            }),
            etichetta: () => "Preparo il piano delle flashcard per profondità",
            esegui: a => {
                let albero = null, fonte = '', mappaId = null, nota;
                const daMappa = mappa => {
                    albero = JSON.parse(JSON.stringify(Materiali.alberoDaMappa(mappa)));
                    mappaId = mappa.id;
                    fonte = mappa.nome;
                };
                if (a.mappa_id) {
                    const mappa = Mappe.mappa(a.mappa_id);
                    if (!mappa) throw new Error('Mappa non trovata: usa elenca_mappe.');
                    daMappa(mappa);
                } else if (a.materiale_id) {
                    const m = Dati.materiale(a.materiale_id);
                    if (!m) throw new Error('Materiale non trovato.');
                    if (m.mappaId && Mappe.mappa(m.mappaId)) daMappa(Mappe.mappa(m.mappaId));
                    else {
                        fonte = m.nome;
                        albero = m.albero || (m.testo && Materiali.sembraSchema(m.testo) ? Materiali.alberoDaMarkdown(m.testo) : null);
                        if (!albero) throw new Error(`«${m.nome}» non è una mappa né uno schema: trascrivi la fonte nel parametro 'schema'.`);
                        albero = JSON.parse(JSON.stringify(albero));
                        if (m.albero) nota = "Questo materiale non è una mappa dell'app: le carte non saranno collegate a una mappa. Se la mappa è stata importata nell'app, rilancia con mappa_id.";
                    }
                } else if (a.schema) {
                    albero = Materiali.alberoDaMarkdown(a.schema);
                    fonte = 'trascrizione';
                    nota = "Da una trascrizione le carte non si collegano a una mappa: se la fonte è una mappa dell'app, rilancia con mappa_id.";
                }
                if (!albero) throw new Error("Serve una fonte: mappa_id, materiale_id oppure 'schema'.");
                if (a.titolo) albero.titolo = a.titolo;
                const numerazione = {};
                (a.numerazione_sottorami || []).forEach(x => { if (x && x.nodo_id) numerazione[x.nodo_id] = String(x.numero); });
                const piano = Localizzazione.preparaPiano(albero, {
                    etichetteForzate: a.etichette_forzate || [], etichetteAnnullate: a.etichette_annullate || [], numerazione, fonte, mappaId,
                    ...(mappaId && Array.isArray(a.nodi_mappa) && a.nodi_mappa.length ? { soloNodi: a.nodi_mappa, conRami: a.con_rami !== false, setId: a.set_id || null, saltaEsistenti: !!a.salta_esistenti } : {}),
                });
                return { ...Localizzazione.pianoPerIA(piano), collegamento_alla_mappa: mappaId ? `sì, ai nodi di «${fonte}»` : 'no', ...(nota ? { nota } : {}) };
            },
        },
        {
            nome: 'scrivi_domande_localizzazione',
            descrizione: "Passo 4 della skill: registra le domande per le voci del piano (anche a blocchi; un id già scritto viene sostituito). Restituisce errori e avvisi dei controlli: correggi gli errori riscrivendo quegli id.",
            parametri: S.obj({
                piano_id: S.str('id del piano'),
                domande: S.arr(S.obj({ id: S.str('id della voce, es. c003'), domanda: S.str('la domanda, aperta, su una riga, che finisce con ?'), target: S.str('che cosa deve ricostruire lo studente (non finisce nella carta)') }, ['id', 'domanda', 'target'])),
            }, ['piano_id', 'domande']),
            etichetta: a => `Scrivo ${plurale((a.domande || []).length, 'domanda', 'domande')} delle flashcard per profondità`,
            esegui: a => Localizzazione.scriviDomande(a.piano_id, (a.domande || []).map(d => ({ id: d.id, question: d.domanda, target: d.target }))),
        },
        {
            nome: 'crea_carte_localizzazione',
            descrizione: "Passo 5 della skill: controlla tutto il piano (domande mancanti, doppioni…) e, se non ci sono errori, crea le carte nel set già ad albero, con la localizzazione come risposta e il tag. Se ci sono errori non crea niente e li elenca.",
            parametri: S.obj({ piano_id: S.str('id del piano'), set_id: S.str('set in cui creare le carte (crealo prima con crea_set se serve)') }, ['piano_id', 'set_id']),
            modifica: true,
            etichetta: a => `Creo le flashcard per profondità in «${nomeSet(a.set_id)}»`,
            esegui: a => Localizzazione.creaCarte(a.piano_id, a.set_id),
        },
    ];

    const PER_NOME = new Map(LISTA.map(s => [s.nome, s]));

    // Strumenti definiti altrove (js/ia/strumenti-mappe.js)
    function aggiungi(lista) { lista.forEach(s => { LISTA.push(s); PER_NOME.set(s.nome, s); }); }

    function dichiarazioni() {
        return LISTA.map(s => ({ name: s.nome, description: s.descrizione, ...(s.parametri ? { parameters: s.parametri } : {}) }));
    }

    function etichetta(nome, args) {
        const s = PER_NOME.get(nome);
        try { return s ? s.etichetta(args || {}) : nome; } catch (e) { return nome; }
    }

    async function esegui(nome, args, ctx) {
        const s = PER_NOME.get(nome);
        if (!s) return { errore: `Strumento sconosciuto: ${nome}` };
        try {
            const risultato = await s.esegui(args || {}, ctx);
            return JSON.parse(JSON.stringify(risultato === undefined ? { ok: true } : risultato));
        } catch (e) {
            console.warn('Strumento', nome, e);
            return { errore: e.message || String(e) };
        }
    }

    function modifica(nome) { const s = PER_NOME.get(nome); return !!(s && s.modifica); }

    return { dichiarazioni, etichetta, esegui, modifica, htmlDaTesto, aggiungi, altriDati, istante, S };
})();
