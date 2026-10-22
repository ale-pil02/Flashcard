// Strumenti dell'assistente per le mappe mentali (sezione Mappe): tutto quello che l'utente fa nell'elenco delle
// mappe e nel loro editor, esposto a Gemini come gli altri strumenti (js/ia/strumenti.js, a cui si aggiungono).
// Ogni cambiamento passa da cambia(): la storia ne fa una voce annullabile dalla chat e, se la mappa è aperta,
// l'editor la ridisegna subito e mette il cambio nel suo Annulla (Ctrl+Z).

(() => {
    const S = Strumenti.S;
    const num = d => ({ type: 'NUMBER', description: d });
    const PT_BASE = 10.5;   // dimensione del testo in punti con scala 1 (come nell'editor)

    // ---- Aiuti -------------------------------------------------------------------------------------

    function editorDi(id) {
        const r = App.rottaAttiva, e = Viste.mappa && Viste.mappa.editor;
        return r && r.vista === 'mappa' && e && e.id === id ? e : null;
    }

    function richiediMappa(id) {
        const m = Mappe.mappa(id);
        if (!m) throw new Error(`Mappa «${id}» non trovata: usa elenca_mappe per gli id.`);
        return m;
    }

    function richiediNodo(m, id) {
        const n = id && m.nodi[id];
        if (!n) throw new Error(`Nodo «${id}» non trovato in «${m.nome}»: usa leggi_mappa per gli id.`);
        return n;
    }

    const nomeMappa = id => (Mappe.mappa(id) || {}).nome || 'una mappa';
    const breve = t => Ui.tronca(Mappe.testoSemplice(t) || '(vuoto)', 50);

    // Cambia una mappa; se qualcosa va storto la rimette com'era
    function cambia(id, fn) {
        const m = richiediMappa(id);
        Mappe.primaDiCambiare(id);
        const copia = structuredClone({ ...m, immagini: null });
        try {
            const esito = fn(m);
            if (Mappe.mappa(id)) Mappe.salva(m);
            return esito;
        } catch (e) {
            Object.assign(m, copia, { immagini: m.immagini });
            throw e;
        } finally {
            Mappe.cambiataDaFuori(id);
        }
    }

    // Mappa nuova (creata, duplicata, importata): entra nella storia come creazione
    function aggiungiMappa(m) {
        Mappe.primaDiCambiare(m.id);
        Mappe.aggiungi(m);
        return m;
    }

    // Apre la mappa nell'editor (se non lo è già) e aspetta che sia pronto
    async function apriMappa(id) {
        richiediMappa(id);
        if (!editorDi(id)) Router.vai('/mappa/' + id);
        for (let i = 0; i < 40 && !editorDi(id); i++) await new Promise(ok => setTimeout(ok, 100));
        const e = editorDi(id);
        if (!e) throw new Error('Non riesco ad aprire la mappa.');
        await new Promise(ok => setTimeout(ok, 150));
        return e;
    }

    // Larghezza e altezza vere di un'immagine (0 se non si riesce a leggerla)
    function misura(src) {
        if (typeof Image === 'undefined') return Promise.resolve({ w: 0, h: 0 });
        return new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok({ w: 0, h: 0 }); i.src = src; });
    }

    // Un'immagine come icona: al massimo 64 px di lato, in PNG, come «Carica icona» dell'editor
    function comeIcona(src) {
        if (typeof Image === 'undefined') return Promise.resolve(src);
        return new Promise(ok => {
            const i = new Image();
            i.onload = () => {
                const c = document.createElement('canvas');
                const s = Math.min(1, 64 / Math.max(i.naturalWidth, i.naturalHeight));
                c.width = Math.max(1, Math.round(i.naturalWidth * s)); c.height = Math.max(1, Math.round(i.naturalHeight * s));
                c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
                ok(c.toDataURL('image/png'));
            };
            i.onerror = () => ok(src);
            i.src = src;
        });
    }

    // Materia e set (undefined = come adesso): il set porta con sé la sua materia, e cambiando solo la materia
    // il set resta se ne fa parte
    function posto(materiaId, setId, attuale = {}) {
        let materia = materiaId === undefined ? attuale.materiaId || null : materiaId || null;
        let set = setId === undefined ? attuale.setId || null : setId || null;
        if (setId === undefined && materiaId !== undefined && set && (Dati.set(set) || {}).materiaId !== materia) set = null;
        if (set) {
            const s = Dati.set(set);
            if (!s) throw new Error(`Set «${set}» non trovato: usa panoramica.`);
            materia = s.materiaId;
        }
        if (materia && !Dati.materia(materia)) throw new Error(`Materia «${materia}» non trovata: usa panoramica.`);
        return { materiaId: materia, setId: set };
    }

    function temaValido(id) {
        if (!Mappe.temi().some(t => t.id === id)) throw new Error(`Tema «${id}» inesistente: i temi sono ${Mappe.temi().map(t => `${t.id} (${t.nome})`).join(', ')}.`);
        return id;
    }

    const DISPOSIZIONI_MAPPA = ['orizzontale', 'destra', 'sinistra', 'verticale', 'su', 'lineare', 'radiale', 'libera'];

    // Linee piegate a mano nel ramo di id (null = tutta la mappa): con un'altra disposizione tornano normali
    function raddrizza(m, id) {
        (id ? Mappe.discendenti(m, id) : Object.keys(m.nodi)).forEach(x => { if (m.nodi[x].piega) m.nodi[x].piega = null; if (m.nodi[x].percorso) m.nodi[x].percorso = null; });
    }

    // Disposizione della mappa (sulla radice) o dei figli di un nodo; '' = come il padre
    function impostaDisposizione(m, id, v) {
        const radice = id === m.radice;
        if (radice ? !DISPOSIZIONI_MAPPA.includes(v) : v && !DISPOSIZIONI_MAPPA.includes(v)) {
            throw new Error(`Disposizione «${v}» non valida: ${DISPOSIZIONI_MAPPA.join(', ')}${radice ? '' : " o '' (come il padre)"}.`);
        }
        const ed = editorDi(m.id);
        // Passando alla libera i nodi restano dove sono (servono le posizioni disegnate: solo con la mappa aperta)
        if (v === 'libera' && ed && !ed.posizioneLibera(id)) ed.fissaPosizioni(id);
        if (v !== 'libera') raddrizza(m, radice ? null : id);
        if (!radice) { m.nodi[id].disposizione = v || null; return; }
        if (v === 'destra' || v === 'sinistra') { m.disposizione = 'orizzontale'; m.direzione = v; }
        else { m.disposizione = v; if (v === 'orizzontale' && !['auto', 'orario'].includes(m.direzione)) m.direzione = 'auto'; }
    }

    // Campi del nodo che nodoPerIA mette con un altro nome (gli altri vanno in altri_dati)
    const CAMPI_NODO = ['id', 'genitore', 'figli', 'testo', 'nota', 'etichette', 'icona', 'immagine', 'figure', 'link', 'data', 'spunta', 'chiuso',
        'disposizione', 'larghezza', 'distanzaPrima', 'stilePredefinito', 'raccordo', 'rif', 'inPanoramica', 'legami', 'stile', 'lato', 'off', 'x', 'y', 'piega', 'percorso'];

    // Etichetta sopra il nodo: il testo, e con i dettagli anche sfondo, carattere, dimensione e posizione
    function etichettaPerIA(e, dettagli) {
        if (!dettagli) return e.testo;
        const s = e.stile || {};
        return {
            id: e.id, testo: e.testo, colore: s.riempimento || undefined, grassetto: s.grassetto || undefined, corsivo: s.corsivo || undefined,
            sottolineato: s.sottolineato || undefined, pt: s.scala ? Math.round(s.scala * PT_BASE * 10) / 10 : undefined, colore_testo: s.coloreTesto || undefined,
            dx: Math.round(e.dx || 0), dy: Math.round(e.dy || 0),
            ...Strumenti.altriDati(e, ['id', 'testo', 'dx', 'dy', 'stile']),
            ...(Strumenti.altriDati(s, ['riempimento', 'grassetto', 'corsivo', 'sottolineato', 'scala', 'coloreTesto']).altri_dati ? { stile: Strumenti.altriDati(s, ['riempimento', 'grassetto', 'corsivo', 'sottolineato', 'scala', 'coloreTesto']).altri_dati } : {}),
        };
    }

    // Nodo per il modello, con il suo ramo annidato
    function nodoPerIA(m, id, opz, livello = 0) {
        const n = m.nodi[id];
        if (!n) return null;
        const o = { id: n.id, testo: n.testo };
        if (n.nota) o.nota = n.nota;
        if (n.etichette && n.etichette.length) o.etichette = n.etichette.map(e => etichettaPerIA(e, opz.dettagli));
        if (n.icona) { o.icona = n.icona; if (String(n.icona).startsWith('img:')) o.icona_immagine = 'icona caricata dall\'utente (immagine della mappa)'; }
        if (n.immagine) o.immagine = { immagine_id: n.immagine.id, larghezza: n.immagine.larghezza, ...Strumenti.altriDati(n.immagine, ['id', 'larghezza']) };
        if ((n.figure || []).length) {
            o.immagini_accanto = n.figure.map(f => (opz.dettagli
                ? { id: f.id, immagine_id: f.img, larghezza: Math.round(f.larghezza), rapporto: f.rapporto, dx: Math.round(f.dx || 0), dy: Math.round(f.dy || 0), libera: !!f.fluttuante, ...Strumenti.altriDati(f, ['id', 'img', 'larghezza', 'rapporto', 'dx', 'dy', 'fluttuante']) }
                : { id: f.id, larghezza: Math.round(f.larghezza) }));
        }
        if (n.link) o.link = n.link;
        if (n.data) o.data = n.data;
        if (n.spunta != null) o.spunta = n.spunta ? 'fatta' : 'da_fare';
        if (n.chiuso) o.ramo_chiuso = true;
        if (n.disposizione) o.disposizione_figli = n.disposizione;
        if (+n.larghezza > 0) o.larghezza = Math.round(n.larghezza);
        if (+n.distanzaPrima > 0) o.distanza_dal_fratello_prima = n.distanzaPrima;
        if (n.stilePredefinito) { const x = Mappe.stilePredefinito(n.stilePredefinito); o.stile_predefinito = x ? { id: x.id, nome: x.nome } : n.stilePredefinito; }
        if (n.raccordo) o.raccordo = { nodi: n.raccordo.nodi, graffa: !!n.raccordo.graffa, ...Strumenti.altriDati(n.raccordo, ['nodi', 'graffa']) };
        if (n.rif) o.origine = n.rif.mappa ? { mappa_id: n.rif.mappa, nodo_id: n.rif.nodo, ...Strumenti.altriDati(n.rif, ['mappa', 'nodo']) } : { materia_id: n.rif.materia, ...Strumenti.altriDati(n.rif, ['materia']) };
        if (n.inPanoramica) o.in_link_argomenti = true;
        if (n.legami) o.altri_genitori = n.legami;
        if (opz.dettagli) {
            if (n.stile && Object.keys(n.stile).length) o.stile = n.stile;
            if (n.lato) o.lato = n.lato === 's' ? 'sinistra' : 'destra';
            if (n.off) o.posizione = { dx: Math.round(n.off.dx), dy: Math.round(n.off.dy) };
            if (!n.genitore && id !== m.radice && n.x != null) o.posizione = { x: Math.round(n.x), y: Math.round(n.y || 0) };
            if (n.piega) o.linea_piegata = n.piega;
            if (n.percorso) o.curvatura_linea = curvaturaPerIA(n.percorso);
        }
        Object.assign(o, Strumenti.altriDati(n, CAMPI_NODO));
        if (n.figli.length) {
            if (livello >= opz.profondita) o.discendenti_non_mostrati = Mappe.discendenti(m, id).length;
            else o.figli = n.figli.map(f => nodoPerIA(m, f, opz, livello + 1)).filter(Boolean);
        }
        return o;
    }

    function creatiPerIA(m, ids) {
        const albero = id => ({ id, testo: m.nodi[id].testo, ...(m.nodi[id].figli.length ? { figli: m.nodi[id].figli.map(albero) } : {}) });
        return ids.filter(id => m.nodi[id]).map(albero);
    }

    // ---- Stile dei nodi -------------------------------------------------------------------------------

    const FORME = Mappe.FORME.map(f => f[0]);
    const colore = v => (Mappe.coloreValido(v) ? v.toLowerCase() : undefined);
    const tra = (min, max) => v => (isFinite(+v) && v !== '' && v !== null ? limita(+v, min, max) : undefined);
    const traQuesti = lista => v => (lista.includes(v) ? v : undefined);
    const bool = v => (typeof v === 'boolean' ? v : undefined);
    const CHIAVI_STILE = {
        grassetto: [bool, S.bool('grassetto')], corsivo: [bool, S.bool('corsivo')], sottolineato: [bool, S.bool('sottolineato')],
        barrato: [bool, S.bool('barrato')], scala: [tra(0.4, 9), num('dimensione del testo in scala: 1 = normale (10,5 pt); meglio usare pt')],
        pt: [tra(4, 96), num('dimensione del testo in punti, come in Word (10,5 = normale; 8 piccolo, 14 grande)')],
        sottolineatura: [v => (v && typeof v === 'object' ? v : undefined), S.obj({
            colore: S.str("#rrggbb; '' = quello del ramo"), tratto: S.str('pieno | trattini | punti'), spessore: num('px (0.5-12)'),
        }, [], "forma 'sottolineata': la linea sotto il nodo, solo per lui (non cambia le linee verso il genitore e i figli)")],
        allinea: [traQuesti(['sinistra', 'centro', 'destra']), S.str('allineamento del testo: sinistra | centro | destra')],
        coloreTesto: [colore, S.str('colore del testo, #rrggbb')],
        forma: [traQuesti(FORME), S.str(`forma del nodo: ${FORME.join(' | ')}`)],
        tratto: [traQuesti(['pieno', 'trattini', 'punti']), S.str('bordo: pieno | trattini | punti')],
        spessore: [tra(0, 10), num('spessore del bordo in px (0 = senza bordo)')],
        colore: [colore, S.str('colore del ramo (#rrggbb): linee, bordo e sottolineatura; lo prendono anche i discendenti senza un colore proprio')],
        coloreBordo: [colore, S.str('colore del solo bordo, #rrggbb')],
        riempimento: [v => (v === 'nessuno' ? v : colore(v)), S.str("riempimento: #rrggbb oppure 'nessuno'")],
        larghezzaMin: [tra(0, 800), num('larghezza minima in px')], altezzaMin: [tra(0, 600), num('altezza minima in px')],
        lineaForma: [traQuesti(Mappe.FORME_LINEA.map(f => f[0])), S.str('linea verso il genitore, forma: curva | ortogonale | arrotondata | dritta')],
        linea: [traQuesti(Mappe.TRATTI_LINEA.map(f => f[0])), S.str("linea verso il genitore, tratto: auto (affusolata automatica) | affusolata | pieno | trattini | punti")],
        lineaSpessore: [tra(0.5, 20), num('linea verso il genitore, spessore in px (non vale per il tratto auto)')],
        frecciaInizio: [traQuesti(['nessuna', 'semplice', 'piena']), S.str('freccia all\'inizio della linea (sul genitore): nessuna | semplice | piena')],
        frecciaFine: [traQuesti(['nessuna', 'semplice', 'piena']), S.str('freccia alla fine della linea (sul nodo): nessuna | semplice | piena')],
        coloreLinea: [colore, S.str('colore della sola linea verso il genitore, #rrggbb')],
    };
    const SCHEMA_STILE = S.obj(Object.fromEntries(Object.entries(CHIAVI_STILE).map(([k, [, d]]) => [k, d])), [],
        'solo le proprietà da cambiare rispetto al tema');

    // Linea sotto il nodo (forma sottolineata): solo i campi validi; '' o null tolgono il campo
    function sottolineatura(attuale, v, avvisi) {
        const so = { ...(attuale || {}) };
        Object.entries(v).forEach(([k, x]) => {
            if (x == null || x === '') { delete so[k]; return; }
            if (k === 'colore' && Mappe.coloreValido(x)) so.colore = x.toLowerCase();
            else if (k === 'tratto' && ['pieno', 'trattini', 'punti'].includes(x)) so.tratto = x;
            else if (k === 'spessore' && isFinite(+x)) so.spessore = limita(+x, 0.5, 12);
            else avvisi.push(`sottolineatura: valore «${x}» non valido per ${k}`);
        });
        return Object.keys(so).length ? so : undefined;
    }

    function applicaStile(n, stile, avvisi) {
        n.stile = n.stile || {};
        Object.entries(stile || {}).forEach(([k, v]) => {
            const c = CHIAVI_STILE[k];
            if (!c) { avvisi.push(`stile: proprietà «${k}» sconosciuta`); return; }
            const valido = c[0](v);
            if (valido === undefined) { avvisi.push(`stile: valore «${v}» non valido per ${k}`); return; }
            if (k === 'pt') { n.stile.scala = Math.round(valido / 10.5 * 1000) / 1000; return; }
            if (k === 'sottolineatura') {
                const so = sottolineatura(n.stile.sottolineatura, valido, avvisi);
                if (so) n.stile.sottolineatura = so; else delete n.stile.sottolineatura;
                return;
            }
            n.stile[k] = valido;
            if (k === 'frecciaFine') delete n.stile.freccia;
            if (k === 'lineaForma') { n.piega = null; n.percorso = null; }
        });
    }

    // Curvatura semplice di una linea (come il cursore «Curvatura» dell'editor): un punto di passaggio a metà (arco) o due
    // opposti (onda a S), a valore/200 della lunghezza dalla linea dritta. Per i rami 0 = linea normale; per i
    // collegamenti 0 = dritto
    function percorsoCurvo(forma, valore, collegamento = false) {
        const v = Math.round(limita(+valore || 0, -100, 100) / 200 * 10000) / 10000;
        if (!v) return collegamento ? [{ u: 0.5, v: 0 }] : null;
        return forma === 'onda' ? [{ u: 0.3333, v }, { u: 0.6667, v: -v }] : [{ u: 0.5, v }];
    }
    const SCHEMA_CURVATURA = S.obj({
        valore: num('da -100 a 100: quanto si piega e da che parte (0 = normale)'), forma: S.str('arco (predefinita) | onda (a S)'),
        punti: S.arr(S.obj({ u: num('da 0 a 1: dove, lungo la linea'), v: num('scostamento in proporzione alla lunghezza della linea (-2…2; + da una parte, − dall\'altra)') }, ['u', 'v']),
            "al posto di valore: i punti di passaggio messi a mano, come trascinando la linea nell'editor (in lettura: curvatura.punti)"),
    });

    // Percorso della linea da una curvatura del modello: punti a mano oppure arco/onda
    function percorsoDa(c, collegamento = false) {
        if (Array.isArray(c.punti) && c.punti.length) {
            const p = puntiValidi(c.punti);
            if (!p) throw new Error('curvatura.punti: servono punti con u (0-1) e v numerici');
            return p;
        }
        return percorsoCurvo(c.forma, c.valore, collegamento);
    }

    function curvaturaPerIA(percorso) {
        if (!Disposizione.percorsoValido(percorso)) return undefined;
        const [p, q] = percorso;
        if (percorso.length === 1 && Math.abs(p.u - 0.5) < 0.01) return { forma: 'arco', valore: Math.round(p.v * 200) };
        if (percorso.length === 2 && Math.abs(p.u - 1 / 3) < 0.01 && Math.abs(q.u - 2 / 3) < 0.01 && Math.abs(p.v + q.v) < 0.0001) return { forma: 'onda', valore: Math.round(p.v * 200) };
        return { punti: percorso.map(x => ({ u: x.u, v: x.v })) };
    }

    // Punti di passaggio messi a mano (come trascinando la linea nell'editor): u da 0 a 1 lungo la linea, v = scostamento
    // in proporzione alla sua lunghezza (positivo da una parte, negativo dall'altra)
    function puntiValidi(punti) {
        const p = (punti || []).filter(x => x && isFinite(x.u) && isFinite(x.v)).map(x => ({ u: limita(+x.u, 0.01, 0.99), v: limita(+x.v, -2, 2) }))
            .sort((a, b) => a.u - b.u);
        return p.length && Disposizione.percorsoValido(p) ? p : null;
    }

    // Campi della mappa che leggi_mappa mette con un altro nome
    const CAMPI_MAPPA = ['id', 'nome', 'materiaId', 'setId', 'tema', 'disposizione', 'direzione', 'spaziatura', 'spaziaturaFratelli', 'griglia', 'linee',
        'paletta', 'coloreRadice', 'livelli', 'radice', 'nodi', 'relazioni', 'panoramica'];

    // Un tema com'è, per il modello
    function temaPerIA(t) {
        return {
            id: t.id, nome: t.nome, personale: !!t.personale || undefined, sfondo: t.sfondo, testo: t.testo, radice: t.radice, scuro: t.scuro || undefined,
            colori_rami: t.paletta, livelli: t.livelli,
            linee: { forma: t.linee.forma, affusolamento: t.linee.affusolamento, spessore_radice: t.linee.inizio, riduzione: +(1 - t.linee.fattore).toFixed(2), spessore_minimo: t.linee.minimo, spessore: t.linee.spessore },
            ...Strumenti.altriDati(t, ['id', 'nome', 'personale', 'sfondo', 'testo', 'radice', 'scuro', 'paletta', 'livelli', 'linee']),
        };
    }

    // ---- Strumenti ------------------------------------------------------------------------------------

    const LISTA = [
        {
            nome: 'elenca_mappe',
            descrizione: "Elenca le mappe mentali nell'ordine della sezione Mappe (id, nome, materia e set, numero di nodi, quale è aperta), i temi e gli stili predefiniti dei nodi. Con 'cerca' trova anche i nodi che contengono un testo, in tutte le mappe o in una.",
            parametri: S.obj({
                materia_id: S.str('facoltativo: solo le mappe di questa materia'), set_id: S.str('facoltativo: solo le mappe di questo set'),
                cerca: S.str('facoltativo: testo da cercare nei nodi (testo, nota, etichette)'), mappa_id: S.str('facoltativo: cerca solo in questa mappa'),
            }),
            etichetta: a => (a.cerca ? `Cerco «${a.cerca}» nelle mappe` : 'Guardo le mappe'),
            esegui: a => {
                const aperta = App.rottaAttiva && App.rottaAttiva.vista === 'mappa' ? App.rottaAttiva.params.id : null;
                let mappe = Mappe.ordinate();
                if (a.materia_id) mappe = mappe.filter(x => x.materiaId === a.materia_id);
                if (a.set_id) mappe = mappe.filter(x => x.setId === a.set_id);
                const out = {
                    mappe: mappe.map(x => ({
                        id: x.id, nome: x.nome, nodi: Mappe.contaNodi(x),
                        materia: x.materiaId && Dati.materia(x.materiaId) ? { id: x.materiaId, nome: Dati.materia(x.materiaId).nome } : null,
                        set: x.setId && Dati.set(x.setId) ? { id: x.setId, nome: Dati.set(x.setId).nome } : null,
                        modificata: chiaveGiorno(x.modificata || x.creata), ...(x.id === aperta ? { aperta: true } : {}),
                        ...(x.panoramica ? { link_argomenti: true } : {}),
                    })),
                    temi: Mappe.temi().map(t => ({ id: t.id, nome: t.nome, ...(t.personale ? { personale: true } : {}) })),
                    stili_predefiniti: Mappe.stiliPredefiniti().map((x, i) => ({ id: x.id, nome: x.nome, scorciatoia: i < 9 ? `Ctrl+Alt+${i + 1}` : undefined })),
                    ordine_mappe: Mappe.ordineMappe(),
                    materie_senza_link_argomenti: Panoramica.mancanti().map(x => ({ id: x.id, nome: x.nome })),
                };
                if (a.cerca) {
                    const q = String(a.cerca).toLowerCase();
                    const dove = a.mappa_id ? [richiediMappa(a.mappa_id)] : Mappe.tutte();
                    const trovati = [];
                    dove.forEach(x => Object.values(x.nodi).forEach(n => {
                        if (![n.testo, n.nota, ...(n.etichette || []).map(e => e.testo)].some(t => String(t || '').toLowerCase().includes(q))) return;
                        trovati.push({ mappa_id: x.id, mappa: x.nome, nodo_id: n.id, testo: n.testo, percorso: Mappe.antenati(x, n.id).map(p => breve(x.nodi[p].testo)).join(' › ') });
                    }));
                    out.trovati = trovati.slice(0, 80);
                    if (trovati.length > 80) out.altri_trovati = trovati.length - 80;
                }
                return out;
            },
        },
        {
            nome: 'leggi_mappa',
            descrizione: "Legge una mappa mentale: impostazioni (tema, disposizione, linee…), l'albero dei nodi con i loro id (testo, nota, etichette, icona, data, raccordi, figli comuni), i nodi liberi e i collegamenti tra rami. Con la mappa aperta dice anche quali nodi ha selezionato l'utente. Leggila prima di cambiarla.",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'), ramo_id: S.str('facoltativo: legge solo il ramo di questo nodo'),
                dettagli: S.bool('facoltativo: anche lo stile di ogni nodo, le posizioni e le linee piegate'),
                profondita: S.int('facoltativo: quanti livelli sotto la cima mostrare (predefinito tutti)'),
            }, ['mappa_id']),
            etichetta: a => `Leggo la mappa «${nomeMappa(a.mappa_id)}»`,
            esegui: a => {
                const m = richiediMappa(a.mappa_id);
                const opz = { dettagli: !!a.dettagli, profondita: a.profondita > 0 ? a.profondita : Infinity };
                const t = Mappe.tema(m);
                const ed = editorDi(m.id);
                if (a.ramo_id) {
                    richiediNodo(m, a.ramo_id);
                    return { mappa_id: m.id, percorso: Mappe.antenati(m, a.ramo_id).map(p => ({ id: p, testo: m.nodi[p].testo })), ramo: nodoPerIA(m, a.ramo_id, opz) };
                }
                const s = ed ? ed.stato() : null;
                return {
                    id: m.id, nome: m.nome, nodi_totali: Mappe.contaNodi(m),
                    mappa_d_insieme: m.panoramica ? "Mappa «link argomenti» della materia, tenuta dall'app: i nodi con 'origine' vengono dalle altre mappe (testi e struttura si cambiano lì); qui si cambiano aspetto, disposizione, nodi aggiunti a mano e collegamenti" : undefined,
                    materia: m.materiaId && Dati.materia(m.materiaId) ? Dati.materia(m.materiaId).nome : null, materia_id: m.materiaId,
                    set: m.setId && Dati.set(m.setId) ? Dati.set(m.setId).nome : null, set_id: m.setId,
                    impostazioni: {
                        tema: { id: t.id, nome: t.nome }, disposizione: m.disposizione, direzione_rami: m.direzione, spaziatura: m.spaziatura || 1,
                        distanza_fratelli: m.spaziaturaFratelli || 1, griglia: m.griglia ? { attiva: !!m.griglia.attiva, passo: m.griglia.passo || 20, ...Strumenti.altriDati(m.griglia, ['attiva', 'passo']) } : undefined,
                        linee: { forma: t.linee.forma, affusolamento: t.linee.affusolamento, spessore_radice: t.linee.inizio, riduzione: +(1 - t.linee.fattore).toFixed(2), spessore_minimo: t.linee.minimo, spessore: t.linee.spessore },
                        linee_proprie_della_mappa: m.linee && Object.keys(m.linee).length ? m.linee : undefined,
                        colori_rami: (m.paletta || []).length ? m.paletta : null, colore_radice: m.coloreRadice || null,
                        stili_per_livello_propri: m.livelli && m.livelli.length ? m.livelli : undefined,
                    },
                    // immagini = il contenuto delle immagini (dati binari: i nodi dicono quali hanno), anteprima = miniatura
                    // disegnata dall'app, vista = zoom e posizione dello schermo nell'editor
                    ...Strumenti.altriDati(m, CAMPI_MAPPA, ['immagini', 'anteprima', 'vista']),
                    radice: nodoPerIA(m, m.radice, opz),
                    nodi_liberi: Mappe.radiciLibere(m).map(l => nodoPerIA(m, l.id, opz)),
                    collegamenti: m.relazioni.map(r => ({
                        id: r.id, da: r.da, a: r.a, testo: r.testo || undefined, colore: r.colore || undefined, tratto: r.tratto || 'punti',
                        freccia_inizio: !!r.frecciaInizio, freccia_fine: r.frecciaFine !== false,
                        curvatura: r.percorso ? curvaturaPerIA(r.percorso) : undefined, curva_spostata_a_mano: r.curva || undefined,
                        ...Strumenti.altriDati(r, ['id', 'da', 'a', 'testo', 'colore', 'tratto', 'frecciaInizio', 'frecciaFine', 'percorso', 'curva']),
                    })),
                    aperta_nell_editor: !!ed || undefined,
                    selezione_utente: s && (s.selezionati.length || s.concentrato_su || s.linea_scelta || s.collegamento_scelto || s.etichetta_scelta || s.immagine_scelta) ? {
                        nodi: s.selezionati, concentrato_su: s.concentrato_su || undefined, linea_verso_il_nodo: s.linea_scelta || undefined,
                        collegamento: s.collegamento_scelto || undefined, etichetta: s.etichetta_scelta || undefined, immagine: s.immagine_scelta || undefined,
                    } : undefined,
                };
            },
        },
        {
            nome: 'crea_mappa',
            descrizione: "Crea una mappa mentale. Con 'schema' la riempie subito: elenco rientrato (tab o due spazi per livello, trattini facoltativi) o titoli Markdown (#, ##…). Se lo schema ha una sola riga in cima quella è la radice, altrimenti la radice è il nome e le righe in cima sono i rami principali. Con link_argomenti crea invece la mappa d'insieme «link argomenti» di una materia (come il riquadro «Crea «link argomenti»» della sezione Mappe; vedi materie_senza_link_argomenti in elenca_mappe).",
            parametri: S.obj({
                nome: S.str('nome della mappa (e tema centrale se non c\'è lo schema)'), schema: S.str('facoltativo: i nodi come elenco rientrato'),
                materia_id: S.str('facoltativa'), set_id: S.str('facoltativo: il set (la materia è la sua)'),
                tema: S.str('facoltativo: id del tema (vedi elenca_mappe)'),
                disposizione: S.str('facoltativa: orizzontale | destra | sinistra | verticale | su | lineare | radiale | libera'),
                apri: S.bool("facoltativo: apre la mappa nell'editor"),
                link_argomenti: S.bool("crea la mappa «link argomenti» della materia materia_id (nome e contenuto li mette l'app)"),
            }),
            modifica: true,
            etichetta: a => (a.link_argomenti ? 'Creo la mappa «link argomenti»' : `Creo la mappa «${a.nome}»`),
            esegui: a => {
                if (a.link_argomenti) {
                    if (!Dati.materia(a.materia_id)) throw new Error('Serve la materia (materia_id): vedi materie_senza_link_argomenti in elenca_mappe.');
                    const p = Panoramica.crea(a.materia_id);
                    if (!p) throw new Error('Questa materia ha già la sua mappa «link argomenti».');
                    if (a.apri) Router.vai('/mappa/' + p.id);
                    return { creata: true, mappa_id: p.id, nome: p.nome, nodi: Mappe.contaNodi(p), aperta: !!a.apri };
                }
                if (!String(a.nome || '').trim()) throw new Error('Serve il nome della mappa.');
                const nome = String(a.nome || '').trim() || 'Nuova mappa';
                const m = a.schema && String(a.schema).trim() ? FileMappe.daTesto(a.schema, nome) : Mappe.nuova({ nome });
                m.nome = nome;
                Object.assign(m, posto(a.materia_id || null, a.set_id || null));
                if (a.tema) m.tema = temaValido(a.tema);
                if (a.disposizione) impostaDisposizione(m, m.radice, a.disposizione);
                aggiungiMappa(m);
                if (a.apri) Router.vai('/mappa/' + m.id);
                return { creata: true, mappa_id: m.id, nome: m.nome, nodi: Mappe.contaNodi(m), radice_id: m.radice, aperta: !!a.apri };
            },
        },
        {
            nome: 'modifica_mappa',
            descrizione: "Cambia una mappa: nome, materia e set, tema, disposizione, lato dei rami principali, spaziatura, distanza tra i nodi fratelli, griglia di allineamento, colori dei rami principali e della radice, linee (forma, affusolamento automatico e spessori), oppure torna allo stile del tema.",
            parametri: S.obj({
                mappa_id: S.str('id'), nome: S.str('nuovo nome'),
                materia_id: S.str("materia; '' = nessuna"), set_id: S.str("set; '' = nessuno"),
                tema: S.str('id del tema (vedi elenca_mappe)'),
                disposizione: S.str('orizzontale | destra | sinistra | verticale | su (capovolta) | lineare | radiale | libera'),
                direzione_rami: S.str('rami principali (disposizione orizzontale o libera): auto | orario | destra | sinistra'),
                spaziatura: num('distanza tra i nodi, da 0.6 a 2 (1 = normale)'),
                distanza_fratelli: num('distanza tra i nodi fratelli (uno sotto l\'altro), da 0.2 a 12 (1 = normale)'),
                griglia: S.obj({ attiva: S.bool('accesa: i nodi spostati a mano si agganciano ai suoi punti'), passo: num('distanza tra i punti, 10-80 px') }, [], 'griglia di allineamento'),
                colori_rami: S.arr(S.str('#rrggbb'), "colori dei rami principali in ordine; lista vuota = quelli del tema"),
                colore_radice: S.str("#rrggbb; '' = quello del tema"),
                linee: S.obj({
                    forma: S.str('curva | ortogonale | arrotondata | dritta'), affusolamento: S.bool('affusolamento automatico'),
                    spessore_radice: num('spessore alla radice (2-20 px)'), riduzione: num('riduzione a ogni livello (0.1-0.7)'),
                    spessore_minimo: num('spessore minimo (0.5-6 px)'), spessore: num('spessore senza affusolamento (0.5-10 px)'),
                }, [], 'linee di tutta la mappa'),
                ripristina_tema: S.bool('toglie colori, stili per livello e linee propri della mappa: torna tutto come nel tema'),
                ripristina_linee: S.bool('solo le linee della mappa tornano come nel tema (il Reset di «Linee della mappa»)'),
            }, ['mappa_id']),
            modifica: true,
            etichetta: a => `Modifico la mappa «${nomeMappa(a.mappa_id)}»`,
            esegui: a => cambia(a.mappa_id, m => {
                const fatto = [];
                if (a.nome && a.nome.trim()) { m.nome = a.nome.trim(); fatto.push('nome'); }
                if (a.materia_id !== undefined || a.set_id !== undefined) { Object.assign(m, posto(a.materia_id, a.set_id, m)); fatto.push('posto'); }
                if (a.ripristina_tema) { m.paletta = null; m.coloreRadice = null; m.livelli = null; m.linee = null; fatto.push('stile del tema'); }
                if (a.ripristina_linee) { m.linee = null; fatto.push('linee del tema'); }
                if (a.tema) { m.tema = temaValido(a.tema); m.paletta = null; m.coloreRadice = null; m.livelli = null; m.linee = null; fatto.push('tema'); }
                if (a.disposizione) { impostaDisposizione(m, m.radice, a.disposizione); fatto.push('disposizione'); }
                if (a.direzione_rami) {
                    if (!['auto', 'orario', 'destra', 'sinistra'].includes(a.direzione_rami)) throw new Error('direzione_rami: auto | orario | destra | sinistra');
                    m.direzione = a.direzione_rami;
                    m.nodi[m.radice].figli.forEach(f => { m.nodi[f].lato = null; });
                    fatto.push('lato dei rami');
                }
                if (a.spaziatura != null) { m.spaziatura = limita(+a.spaziatura || 1, 0.6, 2); fatto.push('spaziatura'); }
                if (a.distanza_fratelli != null) { const v = limita(+a.distanza_fratelli || 1, 0.2, 12); m.spaziaturaFratelli = Math.abs(v - 1) < 0.01 ? null : v; fatto.push('distanza tra fratelli'); }
                if (a.griglia) {
                    const g = { attiva: !!(m.griglia && m.griglia.attiva), passo: (m.griglia && m.griglia.passo) || 20 };
                    if (typeof a.griglia.attiva === 'boolean') g.attiva = a.griglia.attiva;
                    if (a.griglia.passo != null) g.passo = limita(Math.round(+a.griglia.passo || 20), 10, 80);
                    m.griglia = g;
                    fatto.push('griglia');
                }
                if (Array.isArray(a.colori_rami)) { const c = a.colori_rami.filter(Mappe.coloreValido); m.paletta = c.length ? c : null; fatto.push('colori dei rami'); }
                if (a.colore_radice !== undefined) { m.coloreRadice = Mappe.coloreValido(a.colore_radice) ? a.colore_radice : null; fatto.push('colore della radice'); }
                if (a.linee) {
                    const l = a.linee, x = { ...(m.linee || {}) };
                    if (l.forma) { if (!Mappe.FORME_LINEA.some(f => f[0] === l.forma)) throw new Error('linee.forma: curva | ortogonale | arrotondata | dritta'); x.forma = l.forma; }
                    if (typeof l.affusolamento === 'boolean') x.affusolamento = l.affusolamento;
                    if (l.spessore_radice != null) x.inizio = limita(+l.spessore_radice, 2, 20);
                    if (l.riduzione != null) x.fattore = +(1 - limita(+l.riduzione, 0.1, 0.7)).toFixed(2);
                    if (l.spessore_minimo != null) x.minimo = limita(+l.spessore_minimo, 0.5, 6);
                    if (l.spessore != null) x.spessore = limita(+l.spessore, 0.5, 10);
                    m.linee = x;
                    fatto.push('linee');
                }
                return { modificata: true, cambiati: fatto };
            }),
        },
        {
            nome: 'duplica_mappa',
            descrizione: 'Fa una copia di una mappa (con un nome nuovo, se indicato).',
            parametri: S.obj({ mappa_id: S.str('id'), nome: S.str('facoltativo: nome della copia') }, ['mappa_id']),
            modifica: true,
            etichetta: a => `Duplico «${nomeMappa(a.mappa_id)}»`,
            esegui: a => {
                const orig = richiediMappa(a.mappa_id);
                const copia = structuredClone(orig);
                copia.id = uid();
                copia.nome = (a.nome && a.nome.trim()) || orig.nome + ' (copia)';
                copia.vista = null;
                aggiungiMappa(copia);
                return { creata: true, mappa_id: copia.id, nome: copia.nome };
            },
        },
        {
            nome: 'elimina_mappa',
            descrizione: "Elimina una mappa mentale. Chiede conferma all'utente.",
            parametri: S.obj({ mappa_id: S.str('id') }, ['mappa_id']),
            modifica: true,
            etichetta: a => `Elimino la mappa «${nomeMappa(a.mappa_id)}»`,
            esegui: async (a, ctx) => {
                const m = richiediMappa(a.mappa_id);
                if (!await ctx.conferma(`Eliminare la mappa <b>${esc(m.nome)}</b> con ${plurale(Mappe.contaNodi(m), 'nodo', 'nodi')}?`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                Mappe.primaDiCambiare(m.id);
                Mappe.elimina(m.id);
                Mappe.cambiataDaFuori(m.id);
                return { eliminata: true };
            },
        },
        {
            nome: 'importa_mappa_da_materiale',
            descrizione: "Crea una mappa da un materiale di un set: una mappa di SimpleMind (.smmx, con stili, icone e immagini), un'altra mappa (OPML, XMind, FreeMind) o uno schema Markdown. Per PDF e testi normali leggi il materiale e usa crea_mappa con uno schema.",
            parametri: S.obj({
                materiale_id: S.str('id del materiale'), nome: S.str('facoltativo: nome della mappa'),
                set_id: S.str('facoltativo: set della mappa (predefinito quello del materiale)'),
                posizioni_simplemind: S.bool('facoltativo, solo .smmx: tiene le posizioni dei nodi di SimpleMind (disposizione libera)'),
                apri: S.bool("facoltativo: apre la mappa nell'editor"),
            }, ['materiale_id']),
            modifica: true,
            etichetta: a => `Trasformo «${(Dati.materiale(a.materiale_id) || {}).nome || 'un materiale'}» in una mappa`,
            esegui: async a => {
                const mat = Dati.materiale(a.materiale_id);
                if (!mat) throw new Error('Materiale non trovato: usa elenca_materiali.');
                const nome = (a.nome && a.nome.trim()) || mat.nome.replace(/\.[^.]+$/, '');
                let m;
                if (mat.estensione === 'smmx' || /\.smmx$/i.test(mat.nome)) {
                    const blob = await Archivio.leggiFile(mat.id);
                    if (!blob) throw new Error('Il file del materiale non è più disponibile.');
                    m = await FileMappe.daSmmx(await blob.arrayBuffer(), { nome: a.nome || '', posizioniOriginali: !!a.posizioni_simplemind });
                } else if (mat.albero) {
                    const voce = x => ({ testo: x.titolo || '', nota: x.corpo || '', figli: (x.figli || []).map(voce) });
                    m = FileMappe.mappaDaVoci(nome, [voce(mat.albero)]);
                } else if (mat.testo && Materiali.sembraSchema(mat.testo)) m = FileMappe.daTesto(mat.testo, nome);
                else throw new Error('Questo materiale non è una mappa né uno schema: leggilo con leggi_materiale e crea la mappa con crea_mappa e uno schema.');
                if (a.nome) m.nome = a.nome.trim();
                Object.assign(m, posto(undefined, a.set_id || mat.setId || null));
                aggiungiMappa(m);
                if (a.apri) Router.vai('/mappa/' + m.id);
                return { creata: true, mappa_id: m.id, nome: m.nome, nodi: Mappe.contaNodi(m) };
            },
        },
        {
            nome: 'aggiungi_nodi',
            descrizione: "Aggiunge nodi a una mappa sotto un nodo (o come nodi liberi, senza genitore_id). Per un ramo intero usa 'schema' (elenco rientrato: le righe in cima diventano figli del genitore, quelle rientrate i loro figli); per pochi nodi con nota o icona usa 'nodi'. Restituisce gli id creati.",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'), genitore_id: S.str("id del nodo genitore; '' = nodi liberi, fuori dall'albero"),
                schema: S.str('facoltativo: i nodi come elenco rientrato'),
                nodi: S.arr(S.obj({ testo: S.str('testo del nodo, breve'), nota: S.str('facoltativa'), icona: S.str("facoltativa: un'emoji o 'n:1'…'n:10' (numero nel cerchio)") }, ['testo']), 'facoltativo: nodi figli del genitore, in ordine'),
                indice: S.int('facoltativo: posizione tra i figli (0 = primo); predefinito in fondo'),
            }, ['mappa_id']),
            modifica: true,
            etichetta: a => `Aggiungo nodi a «${nomeMappa(a.mappa_id)}»`,
            esegui: a => cambia(a.mappa_id, m => {
                const genitore = a.genitore_id || null;
                if (genitore) { richiediNodo(m, genitore).chiuso = false; }
                let cime = [];
                if (a.schema && String(a.schema).trim()) {
                    const voci = Mappe.alberoDaTesto(a.schema);
                    if (!voci.length) throw new Error('Lo schema non contiene righe.');
                    cime = Mappe.aggiungiAlbero(m, voci, genitore);
                }
                (a.nodi || []).forEach(x => {
                    if (!String(x.testo || '').trim()) return;
                    cime.push(Mappe.aggiungiNodo(m, { genitore, testo: String(x.testo).trim(), nota: x.nota || '', icona: x.icona || null }).id);
                });
                if (!cime.length) throw new Error("Niente da aggiungere: passa 'schema' o 'nodi'.");
                if (genitore && Number.isInteger(a.indice)) {
                    const resto = m.nodi[genitore].figli.filter(f => !cime.includes(f));
                    resto.splice(limita(a.indice, 0, resto.length), 0, ...cime);
                    m.nodi[genitore].figli = resto;
                }
                const ed = editorDi(m.id);
                if (ed && genitore) ed.posizionaNuovi(genitore, cime);
                return { creati: creatiPerIA(m, cime), nodi_totali: Mappe.contaNodi(m) };
            }),
        },
        {
            nome: 'modifica_nodi',
            descrizione: "Modifica uno o più nodi: testo (anche con parti in grassetto, corsivo, sottolineato o barrato), nota, link, data, casella da spuntare, icona, etichette, immagine, larghezza, disposizione dei figli e distanza tra loro, ramo aperto o chiuso, stile (carattere e dimensione in punti, forma, bordo, colori, linea sotto il nodo, dimensioni minime, linea verso il genitore e sua curvatura), stile predefinito, lato dei rami principali, posizione nelle disposizioni libere, raccordi e linee in più.",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'),
                modifiche: S.arr(S.obj({
                    nodo_id: S.str('id del nodo'),
                    testo: S.str('nuovo testo. Formattare solo una parte: **grassetto**, *corsivo*, __sottolineato__, ~~barrato~~ (anche dentro una parola e insieme: ***grassetto e corsivo***); \\* per un asterisco vero; a capo con \\n'),
                    nota: S.str("nota del nodo ('' per toglierla)"), link: S.str("link http(s) ('' per toglierlo)"),
                    data: S.str("data AAAA-MM-GG ('' per toglierla)"),
                    spunta: S.str('casella da spuntare: nessuna | da_fare | fatta'),
                    icona: S.str("un'emoji, 'n:1'…'n:10' (numero nel cerchio) o '' per toglierla"),
                    etichette: S.arr(S.obj({
                        testo: S.str('testo'), colore: S.str("sfondo #rrggbb o 'nessuno'"), colore_testo: S.str('colore del testo, #rrggbb'),
                        grassetto: S.bool('grassetto'), corsivo: S.bool('corsivo'), sottolineato: S.bool('sottolineato'), pt: num('dimensione in punti (normale 7,9)'),
                        dx: num('posizione rispetto al centro del nodo, orizzontale (px)'), dy: num('verticale (px; negativo = sopra)'),
                    }, ['testo']), "etichette sopra il nodo, in ordine (sostituiscono quelle che ci sono, tenendo di ognuna ciò che non dici; lista vuota = nessuna)"),
                    larghezza_immagine: S.int("larghezza dell'immagine del nodo in px (40-600)"), togli_immagine: S.bool("toglie l'immagine del nodo"),
                    disposizione_figli: S.str("come si dispongono i figli: '' (come il padre) | orizzontale | destra | sinistra | verticale | su | lineare | radiale | libera; per la radice è quella della mappa"),
                    distanza_figli: num('distanza tra tutti i figli di questo nodo (0.2-12, 1 = come gli altri fratelli); 0 = normale. Per pochi nodi usa distanza_tra_nodi'),
                    distanza_dal_fratello_prima: num('distanza di questo nodo dal fratello che gli sta prima nella sua pila (0.2-12, 1 = come gli altri); 0 = normale'),
                    larghezza: num('larghezza del nodo in px (40-1200): il testo va a capo dentro; 0 = automatica (segue il testo)'),
                    stile_predefinito: S.str("id di uno stile predefinito (vedi elenca_mappe) da dare al nodo; '' = nessuno"),
                    curvatura_linea: SCHEMA_CURVATURA,
                    ramo_chiuso: S.bool('chiude (true) o apre (false) il ramo'),
                    stile: SCHEMA_STILE,
                    ripristina: S.arr(S.str('nome della proprietà di stile'), 'proprietà di stile da riportare come nel tema'),
                    ripristina_stile: S.bool('tutto lo stile del nodo torna come nel tema'),
                    copia_stile_da: S.str('id di un nodo da cui copiare tutto lo stile (con lo stile predefinito)'),
                    solo_linea: S.bool('con copia_stile_da: copia solo lo stile della linea verso il genitore'),
                    raddrizza_linea: S.bool('la linea verso il genitore, se piegata a mano, torna normale'),
                    lato: S.str('solo rami principali: destra | sinistra | auto'),
                    posizione: S.obj({ dx: num('distanza orizzontale del centro da quello del genitore (genitore in disposizione libera)'), dy: num('distanza verticale'), x: num('nodi liberi: centro, x'), y: num('nodi liberi: centro, y') }),
                    raccordo_graffa: S.bool('nodo raccordo: true = graffa, false = una linea da ogni nodo raccolto'),
                    togli_collegamento_da: S.str("id di un nodo raccolto dal raccordo o di un genitore in più: quella linea sparisce"),
                    in_link_argomenti: S.bool("nodi dal terzo livello in giù: true = compare anche nella mappa d'insieme «link argomenti» della materia"),
                }, ['nodo_id'])),
            }, ['mappa_id', 'modifiche']),
            modifica: true,
            etichetta: a => `Modifico ${plurale((a.modifiche || []).length, 'nodo', 'nodi')} in «${nomeMappa(a.mappa_id)}»`,
            esegui: a => cambia(a.mappa_id, m => {
                const esiti = (a.modifiche || []).map(x => {
                    const n = m.nodi[x.nodo_id];
                    if (!n) return { nodo_id: x.nodo_id, errore: 'nodo non trovato' };
                    const avvisi = [];
                    if (m.panoramica && n.rif && (x.testo != null || x.nota != null)) {
                        avvisi.push("nodo preso da un'altra mappa: testo e nota si cambiano nella mappa d'origine (campo origine)");
                        x = { ...x, testo: undefined, nota: undefined };
                    }
                    if (typeof x.in_link_argomenti === 'boolean') {
                        if (Panoramica.sceglibile(m, n.id)) n.inPanoramica = x.in_link_argomenti || null;
                        else avvisi.push('«link argomenti»: si scelgono solo i nodi dal terzo livello in giù di una mappa che sta in una materia (gli altri ci sono già)');
                    }
                    if (x.testo != null) n.testo = String(x.testo).replace(/\\n/g, '\n');
                    if (x.nota != null) n.nota = String(x.nota);
                    if (x.link != null) {
                        if (x.link && !/^https?:\/\//i.test(x.link)) avvisi.push('il link deve iniziare con http:// o https://');
                        else n.link = x.link;
                    }
                    if (x.data != null) {
                        if (x.data && !/^\d{4}-\d{2}-\d{2}$/.test(x.data)) avvisi.push('data non valida (AAAA-MM-GG)');
                        else n.data = x.data || null;
                    }
                    if (['nessuna', 'da_fare', 'fatta'].includes(x.spunta)) n.spunta = x.spunta === 'nessuna' ? null : x.spunta === 'fatta';
                    if (x.icona != null) {
                        const i = String(x.icona).trim();
                        if (i.startsWith('img:') && !m.immagini[i.slice(4)]) avvisi.push('icona immagine inesistente');
                        else n.icona = i || null;
                    }
                    if (Array.isArray(x.etichette)) {
                        n.etichette = x.etichette.filter(e => String(e.testo || '').trim()).map((e, i) => {
                            const vecchia = (n.etichette || [])[i];
                            const fondo = e.colore === 'nessuno' ? 'nessuno' : Mappe.coloreValido(e.colore) ? e.colore : null;
                            const et = vecchia
                                ? { ...vecchia, testo: String(e.testo).trim(), stile: { ...(vecchia.stile || {}), ...(fondo ? { riempimento: fondo } : {}) } }
                                : { id: uid(), testo: String(e.testo).trim(), dx: 0, dy: -(26 + i * 22), stile: { riempimento: fondo || '#ffe0d2', scala: 0.75 } };
                            ['grassetto', 'corsivo', 'sottolineato'].forEach(k => { if (typeof e[k] === 'boolean') et.stile[k] = e[k]; });
                            if (isFinite(e.pt) && +e.pt > 0) et.stile.scala = Math.round(limita(+e.pt, 4, 96) / PT_BASE * 1000) / 1000;
                            if (e.colore_testo != null) { if (Mappe.coloreValido(e.colore_testo)) et.stile.coloreTesto = e.colore_testo; else delete et.stile.coloreTesto; }
                            if (isFinite(e.dx)) et.dx = +e.dx;
                            if (isFinite(e.dy)) et.dy = +e.dy;
                            return et;
                        });
                    }
                    if (x.togli_immagine) n.immagine = null;
                    else if (x.larghezza_immagine != null) {
                        if (n.immagine) n.immagine = { ...n.immagine, larghezza: limita(+x.larghezza_immagine || 120, 40, 600) };
                        else avvisi.push('il nodo non ha un\'immagine dentro (per aggiungerla: immagini_nodi)');
                    }
                    if (x.disposizione_figli != null) impostaDisposizione(m, n.id, x.disposizione_figli);
                    if (x.distanza_figli != null) {
                        const v = +x.distanza_figli;
                        n.figli.slice(1).forEach(f => { if (!m.nodi[f]) return; if (v > 0 && Math.abs(v - 1) > 0.01) m.nodi[f].distanzaPrima = limita(v, 0.2, 12); else delete m.nodi[f].distanzaPrima; });
                        delete n.distanzaFigli;
                    }
                    if (x.distanza_dal_fratello_prima != null) { const v = +x.distanza_dal_fratello_prima; if (v > 0 && Math.abs(v - 1) > 0.01) n.distanzaPrima = limita(v, 0.2, 12); else delete n.distanzaPrima; }
                    if (x.larghezza != null) n.larghezza = +x.larghezza > 0 ? Math.round(limita(+x.larghezza, 40, 1200)) : null;
                    if (x.stile_predefinito != null) {
                        const pre = x.stile_predefinito && Mappe.stilePredefinito(x.stile_predefinito);
                        if (!x.stile_predefinito) delete n.stilePredefinito;
                        else if (pre) {
                            // Come nell'editor: le scelte fatte sul nodo che lo stile decide si tolgono, così si vede lo stile
                            n.stilePredefinito = pre.id;
                            if (n.stile) Object.keys(pre.stile).forEach(k => { delete n.stile[k]; });
                        } else avvisi.push(`stile predefinito «${x.stile_predefinito}» inesistente (vedi elenca_mappe)`);
                    }
                    if (typeof x.ramo_chiuso === 'boolean') n.chiuso = x.ramo_chiuso && n.figli.length > 0;
                    if (x.ripristina_stile) { n.stile = {}; n.piega = null; n.percorso = null; }
                    if (x.copia_stile_da) {
                        // Come Copia/Incolla stile dell'editor: tutto lo stile con lo stile predefinito, oppure (solo_linea)
                        // solo quello della linea verso il genitore
                        const da = m.nodi[x.copia_stile_da];
                        if (!da) avvisi.push('nodo da cui copiare lo stile non trovato');
                        else if (x.solo_linea) {
                            n.stile = n.stile || {};
                            Mappe.CHIAVI_COLLEGAMENTO.forEach(k => { if (da.stile && k in da.stile) n.stile[k] = structuredClone(da.stile[k]); else delete n.stile[k]; });
                        } else {
                            n.stile = structuredClone(da.stile || {});
                            if (da.stilePredefinito) n.stilePredefinito = da.stilePredefinito; else delete n.stilePredefinito;
                        }
                    }
                    (x.ripristina || []).forEach(k => { if (n.stile) delete n.stile[k]; });
                    if (x.stile) applicaStile(n, x.stile, avvisi);
                    if (x.raddrizza_linea) { n.piega = null; n.percorso = null; }
                    if (x.curvatura_linea && n.genitore) { n.piega = null; n.percorso = percorsoDa(x.curvatura_linea); }
                    if (x.lato != null) {
                        if (n.genitore !== m.radice) avvisi.push('il lato vale solo per i rami principali');
                        else n.lato = { destra: 'd', sinistra: 's' }[x.lato] || null;
                    }
                    if (x.posizione) {
                        const p = x.posizione;
                        if (!n.genitore && n.id !== m.radice) { if (isFinite(p.x)) n.x = +p.x; if (isFinite(p.y)) n.y = +p.y; }
                        else if (n.genitore && (isFinite(p.dx) || isFinite(p.dy))) {
                            const prima = n.off || { dx: 0, dy: 0 };
                            n.off = { dx: isFinite(p.dx) ? +p.dx : prima.dx, dy: isFinite(p.dy) ? +p.dy : prima.dy };
                        }
                    }
                    if (typeof x.raccordo_graffa === 'boolean') {
                        if (n.raccordo) n.raccordo = { ...n.raccordo, graffa: x.raccordo_graffa };
                        else avvisi.push('il nodo non è un raccordo');
                    }
                    if (x.togli_collegamento_da) {
                        if (n.raccordo) n.raccordo = { ...n.raccordo, nodi: n.raccordo.nodi.filter(q => q !== x.togli_collegamento_da) };
                        if (n.legami) n.legami = n.legami.filter(q => q !== x.togli_collegamento_da);
                    }
                    return { nodo_id: n.id, ok: true, ...(avvisi.length ? { avvisi } : {}) };
                });
                Mappe.pulisciLegami(m);
                return { esiti };
            }),
        },
        {
            nome: 'sposta_nodi',
            descrizione: "Sposta nodi (con i loro rami) sotto un altro nodo, in una certa posizione tra i figli, o li rende nodi liberi; con copia=true li duplica. Con mappa_destinazione_id li porta (o copia) in un'altra mappa. Per riordinare tra fratelli: stesso genitore e il nuovo indice.",
            parametri: S.obj({
                mappa_id: S.str('mappa di partenza'), nodi_ids: S.arr(S.str('id')),
                genitore_id: S.str("nuovo genitore; '' = nodi liberi"), indice: S.int('facoltativo: posizione tra i figli del nuovo genitore (0 = primo)'),
                copia: S.bool('facoltativo: copia invece di spostare'), mappa_destinazione_id: S.str("facoltativo: un'altra mappa"),
            }, ['mappa_id', 'nodi_ids']),
            modifica: true,
            etichetta: a => `${a.copia ? 'Copio' : 'Sposto'} ${plurale((a.nodi_ids || []).length, 'nodo', 'nodi')}`,
            esegui: a => {
                const src = richiediMappa(a.mappa_id);
                const destId = a.mappa_destinazione_id || src.id;
                const dest = richiediMappa(destId);
                const genitore = a.genitore_id || null;
                if (genitore) richiediNodo(dest, genitore);
                const ids = (a.nodi_ids || []).filter(id => src.nodi[id]);
                if (!ids.length) throw new Error('Nessun nodo trovato: usa leggi_mappa per gli id.');
                const cime = ids.filter(id => !Mappe.antenati(src, id).some(x => ids.includes(x)));
                const indice = Number.isInteger(a.indice) ? a.indice : null;
                const esiti = [];
                if (destId !== src.id || a.copia) {
                    // Copia (anche in un'altra mappa); spostando in un'altra mappa poi si toglie dalla prima
                    const rami = cime.map(id => Mappe.copiaRamo(src, id));
                    cambia(destId, m => {
                        rami.forEach((r, i) => {
                            const nuovo = Mappe.incollaRamo(m, r, genitore, indice == null ? null : indice + i);
                            if (!genitore) { m.nodi[nuovo].x = null; m.nodi[nuovo].y = null; }
                            esiti.push({ da: r.cima, nuovo_id: nuovo });
                        });
                        if (genitore) m.nodi[genitore].chiuso = false;
                        const ed = editorDi(m.id);
                        if (ed && genitore) ed.posizionaNuovi(genitore, esiti.map(x => x.nuovo_id));
                    });
                    if (destId !== src.id && !a.copia) {
                        cambia(src.id, m => cime.forEach(id => { if (id !== m.radice) Mappe.eliminaNodo(m, id); }));
                    }
                    return { [a.copia ? 'copiati' : 'spostati']: esiti, mappa_destinazione_id: destId };
                }
                return cambia(src.id, m => {
                    cime.forEach((id, i) => {
                        if (id === m.radice) { esiti.push({ nodo_id: id, errore: 'la radice non si sposta' }); return; }
                        const n = m.nodi[id], prima = n.genitore;
                        if (!Mappe.sposta(m, id, genitore, indice == null ? null : indice + i)) {
                            esiti.push({ nodo_id: id, errore: 'non si può mettere un nodo dentro il suo stesso ramo' });
                            return;
                        }
                        if (prima !== genitore) { n.piega = null; n.percorso = null; n.off = null; }
                        if (!genitore) { n.x = null; n.y = null; }
                        esiti.push({ nodo_id: id, ok: true });
                    });
                    if (genitore) {
                        m.nodi[genitore].chiuso = false;
                        const ed = editorDi(m.id);
                        if (ed) ed.posizionaNuovi(genitore, esiti.filter(x => x.ok && !m.nodi[x.nodo_id].off).map(x => x.nodo_id));
                    }
                    return { esiti };
                });
            },
        },
        {
            nome: 'elimina_nodi',
            descrizione: "Elimina nodi da una mappa, con tutto il loro ramo. Chiede conferma all'utente.",
            parametri: S.obj({ mappa_id: S.str('id della mappa'), nodi_ids: S.arr(S.str('id')) }, ['mappa_id', 'nodi_ids']),
            modifica: true,
            etichetta: a => `Elimino ${plurale((a.nodi_ids || []).length, 'nodo', 'nodi')} da «${nomeMappa(a.mappa_id)}»`,
            esegui: async (a, ctx) => {
                const m = richiediMappa(a.mappa_id);
                const ids = (a.nodi_ids || []).filter(id => m.nodi[id] && id !== m.radice);
                if (!ids.length) throw new Error('Nessun nodo da eliminare (la radice non si elimina).');
                const tutti = new Set(ids.flatMap(id => [id, ...Mappe.discendenti(m, id)]));
                const esempi = ids.slice(0, 4).map(id => `<li>${esc(breve(m.nodi[id].testo))}</li>`).join('');
                // Flashcard collegate a questi nodi: l'utente lo deve sapere prima
                const collegate = Archivio.tutti('carte').filter(c => c.mappa && c.mappa.id === m.id && tutti.has(c.mappa.nodo));
                const avviso = collegate.length ? `<p><b>Attenzione:</b> ${collegate.length === 1 ? 'una flashcard è collegata' : `${collegate.length} flashcard sono collegate`} a questi nodi; resteranno, ma senza il collegamento alla mappa.</p>` : '';
                if (!await ctx.conferma(`Eliminare ${plurale(tutti.size, 'nodo', 'nodi')} da <b>${esc(m.nome)}</b>?<ul>${esempi}</ul>${ids.length > 4 ? '…' : ''}${avviso}`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                return cambia(m.id, x => {
                    ids.forEach(id => Mappe.eliminaNodo(x, id));
                    return { eliminati: tutti.size, ...(collegate.length ? { flashcard_ora_senza_nodo: collegate.map(c => ({ id: c.id, domanda: Ui.tronca(testoDaHtml(c.domanda), 80) })) } : {}) };
                });
            },
        },
        {
            nome: 'figlio_comune',
            descrizione: "Crea un nodo figlio di più nodi insieme. Se i nodi sono fratelli diventa un raccordo: sta oltre di loro, a metà altezza, collegato a ognuno da una linea oppure (graffa=true) da una parentesi graffa, come il riepilogo di XMind. Se non sono fratelli sta sotto il primo e dagli altri parte una linea in più verso di lui. La graffa vale solo per fratelli.",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'), nodi_ids: S.arr(S.str('id'), 'almeno due nodi'),
                testo: S.str('testo del nuovo nodo'), nota: S.str('facoltativa'), graffa: S.bool('facoltativo: graffa invece delle linee'),
            }, ['mappa_id', 'nodi_ids', 'testo']),
            modifica: true,
            etichetta: a => `Creo «${a.testo}», figlio comune di ${plurale((a.nodi_ids || []).length, 'nodo', 'nodi')}`,
            esegui: a => cambia(a.mappa_id, m => {
                const ids = [...new Set(a.nodi_ids || [])].filter(id => m.nodi[id]);
                if (ids.length < 2) throw new Error('Servono almeno due nodi esistenti.');
                const g = m.nodi[ids[0]].genitore;
                const fratelli = !!g && ids.every(id => m.nodi[id].genitore === g && !m.nodi[id].raccordo);
                if (a.graffa && !fratelli) throw new Error('La graffa raccoglie solo nodi con lo stesso genitore: senza graffa diventa un figlio comune con linee.');
                const dati = { testo: String(a.testo || '').trim(), nota: a.nota || '' };
                let nuovo;
                if (fratelli) {
                    const p = m.nodi[g];
                    const nodi = p.figli.filter(f => ids.includes(f));
                    nuovo = Mappe.aggiungiNodo(m, { ...dati, genitore: g, indice: p.figli.indexOf(nodi[nodi.length - 1]) + 1, lato: m.nodi[nodi[0]].lato, raccordo: { nodi, graffa: !!a.graffa } });
                    const ed = editorDi(m.id);
                    if (ed && ed.posizioneLibera(g)) nuovo.off = ed.offsetRaccordo(g, nodi, !!a.graffa);
                } else {
                    const [primo, ...altri] = ids;
                    m.nodi[primo].chiuso = false;
                    nuovo = Mappe.aggiungiNodo(m, { ...dati, genitore: primo, legami: altri });
                    Mappe.pulisciLegami(m);
                    const ed = editorDi(m.id);
                    if (ed) ed.posizionaNuovi(primo, [nuovo.id]);
                }
                return { creato: nuovo.id, tipo: fratelli ? (a.graffa ? 'raccordo con graffa' : 'raccordo con linee') : 'figlio comune con linee in più' };
            }),
        },
        {
            nome: 'collegamenti_mappa',
            descrizione: 'Gestisce i collegamenti tra rami (le frecce tra due nodi qualsiasi, con un testo facoltativo): aggiunge, modifica, raddrizza o elimina.',
            parametri: S.obj({
                mappa_id: S.str('id della mappa'),
                aggiungi: S.arr(S.obj({
                    da: S.str('id del nodo di partenza'), a: S.str('id del nodo di arrivo'), testo: S.str('facoltativo'),
                    colore: S.str('#rrggbb; predefinito quello del ramo'), tratto: S.str('pieno | trattini | punti (predefinito)'),
                    freccia_inizio: S.bool('predefinito false'), freccia_fine: S.bool('predefinito true'),
                }, ['da', 'a'])),
                modifica: S.arr(S.obj({
                    collegamento_id: S.str('id'), testo: S.str('testo'), colore: S.str("#rrggbb; '' = quello del ramo"), tratto: S.str('pieno | trattini | punti'),
                    freccia_inizio: S.bool('freccia all\'inizio'), freccia_fine: S.bool('freccia alla fine'), raddrizza: S.bool('torna alla curva normale'),
                    curvatura: SCHEMA_CURVATURA,
                }, ['collegamento_id'])),
                elimina: S.arr(S.str('id del collegamento')),
            }, ['mappa_id']),
            modifica: true,
            etichetta: a => `Sistemo i collegamenti di «${nomeMappa(a.mappa_id)}»`,
            esegui: a => cambia(a.mappa_id, m => {
                const tratto = v => (['pieno', 'trattini', 'punti'].includes(v) ? v : undefined);
                const creati = [], errori = [];
                (a.aggiungi || []).forEach(x => {
                    if (!m.nodi[x.da] || !m.nodi[x.a] || x.da === x.a) { errori.push(`collegamento ${x.da} → ${x.a}: nodi non validi`); return; }
                    const r = {
                        id: uid(), da: x.da, a: x.a, testo: String(x.testo || '').trim(), colore: Mappe.coloreValido(x.colore) ? x.colore : null,
                        tratto: tratto(x.tratto) || 'punti', frecciaInizio: !!x.freccia_inizio, frecciaFine: x.freccia_fine !== false, curva: null,
                    };
                    m.relazioni.push(r);
                    creati.push(r.id);
                });
                (a.modifica || []).forEach(x => {
                    const r = m.relazioni.find(q => q.id === x.collegamento_id);
                    if (!r) { errori.push(`collegamento ${x.collegamento_id} non trovato`); return; }
                    if (x.testo != null) r.testo = String(x.testo).trim();
                    if (x.colore != null) r.colore = Mappe.coloreValido(x.colore) ? x.colore : null;
                    if (tratto(x.tratto)) r.tratto = x.tratto;
                    if (typeof x.freccia_inizio === 'boolean') r.frecciaInizio = x.freccia_inizio;
                    if (typeof x.freccia_fine === 'boolean') r.frecciaFine = x.freccia_fine;
                    if (x.raddrizza) { r.curva = null; r.percorso = null; }
                    if (x.curvatura) { r.percorso = percorsoDa(x.curvatura, true); r.curva = null; }
                });
                const via = new Set(a.elimina || []);
                const prima = m.relazioni.length;
                m.relazioni = m.relazioni.filter(r => !via.has(r.id));
                return { creati, modificati: (a.modifica || []).length, eliminati: prima - m.relazioni.length, ...(errori.length ? { errori } : {}) };
            }),
        },
        {
            nome: 'immagini_nodi',
            descrizione: "Le immagini dei nodi, come nell'editor: aggiunge un'immagine (da un materiale immagine di un set, o riusando un'immagine che la mappa ha già) accanto al nodo, dentro il nodo o come sua icona; cambia le immagini accanto (larghezza, posizione, libera = segue il nodo senza spostare gli altri nodi), le mette dentro il nodo o porta fuori quella dentro; le elimina. Gli id si leggono con leggi_mappa e dettagli (immagine, immagini_accanto, icona). Il contenuto delle immagini non lo vedi, e i file del computer li aggiunge solo l'utente.",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'),
                aggiungi: S.arr(S.obj({
                    nodo_id: S.str('id del nodo'), materiale_id: S.str('materiale di tipo immagine (elenca_materiali)'),
                    immagine_id: S.str("oppure un'immagine che la mappa ha già (immagine_id in leggi_mappa)"),
                    dove: S.str('accanto (predefinito: libera, sopra il nodo) | dentro | icona'), larghezza: num('px'),
                }, ['nodo_id'])),
                modifica: S.arr(S.obj({
                    nodo_id: S.str('id del nodo'), immagine_accanto_id: S.str('id da immagini_accanto'), larghezza: num('px (24-1600)'),
                    dx: num('centro rispetto al centro del nodo, orizzontale (px)'), dy: num('verticale (px; negativo = sopra)'),
                    libera: S.bool('true = segue il nodo ma non sposta i nodi'), metti_dentro: S.bool("diventa l'immagine dentro il nodo (quella che c'era esce al suo posto)"),
                }, ['nodo_id', 'immagine_accanto_id'])),
                larghezza_dentro: S.arr(S.obj({ nodo_id: S.str('id del nodo'), larghezza: num('px (40-600)') }, ['nodo_id', 'larghezza']), "larghezza dell'immagine dentro il nodo"),
                porta_fuori: S.arr(S.str('id del nodo'), "l'immagine dentro questi nodi diventa un'immagine accanto, libera"),
                elimina: S.arr(S.obj({ nodo_id: S.str('id del nodo'), immagine_accanto_id: S.str("id da immagini_accanto; 'dentro' = l'immagine dentro il nodo; 'tutte' = tutte quelle del nodo") }, ['nodo_id', 'immagine_accanto_id'])),
            }, ['mappa_id']),
            modifica: true,
            etichetta: a => `Sistemo le immagini di «${nomeMappa(a.mappa_id)}»`,
            esegui: async a => {
                const m = richiediMappa(a.mappa_id);
                // Le immagini da leggere e misurare si preparano prima, poi la mappa cambia in un colpo solo
                const nuove = [];
                for (const x of a.aggiungi || []) {
                    richiediNodo(m, x.nodo_id);
                    let src = null;
                    if (x.immagine_id) src = m.immagini[x.immagine_id] || null;
                    else if (x.materiale_id) {
                        const mat = Dati.materiale(x.materiale_id);
                        if (!mat || mat.tipo !== 'immagine') throw new Error(`Il materiale ${x.materiale_id} non è un'immagine: usa elenca_materiali.`);
                        const blob = await Archivio.leggiFile(mat.id);
                        if (!blob) throw new Error(`Il file di «${mat.nome}» non è disponibile su questo dispositivo.`);
                        src = await Ricco.comprimiImmagine(blob);
                    }
                    if (!src) throw new Error(`Nodo ${x.nodo_id}: indica materiale_id (un'immagine dei materiali) o immagine_id (una della mappa).`);
                    if (x.dove === 'icona') src = await comeIcona(src);
                    nuove.push({ x, src, misure: await misura(src) });
                }
                const fuori = new Map();
                for (const id of a.porta_fuori || []) {
                    const n = richiediNodo(m, id);
                    if (n.immagine && m.immagini[n.immagine.id]) fuori.set(id, await misura(m.immagini[n.immagine.id]));
                }
                return cambia(m.id, mm => {
                    const fatto = [], errori = [];
                    // Prima si portano fuori le immagini di adesso (misurate qui sopra), poi arrivano le nuove
                    fuori.forEach((misure, id) => {
                        const n = mm.nodi[id];
                        const larghezza = n.immagine.larghezza, rapporto = misure.w ? misure.h / misure.w : 0.75;
                        n.figure = [...(n.figure || []), { id: uid(), img: n.immagine.id, larghezza, rapporto, dx: 0, dy: -(larghezza * rapporto / 2 + 30), fluttuante: true }];
                        n.immagine = null;
                        fatto.push(`immagine portata fuori da ${id}`);
                    });
                    nuove.forEach(({ x, src, misure }) => {
                        const n = mm.nodi[x.nodo_id];
                        // Un'icona è una copia rimpicciolita: non prende il posto dell'immagine da cui viene
                        const k = x.dove !== 'icona' && x.immagine_id && mm.immagini[x.immagine_id] ? x.immagine_id : uid();
                        mm.immagini[k] = src;
                        const dove = x.dove || 'accanto';
                        if (dove === 'icona') { n.icona = 'img:' + k; fatto.push(`icona di ${n.id}`); return; }
                        if (dove === 'dentro') {
                            n.immagine = { id: k, larghezza: Math.round(limita(+x.larghezza || Math.min(220, misure.w || 160), 40, 600)) };
                            fatto.push(`immagine dentro ${n.id}`);
                            return;
                        }
                        const larghezza = Math.round(limita(+x.larghezza || Math.min(240, misure.w || 160), 24, 1600));
                        const rapporto = misure.w ? misure.h / misure.w : 0.75;
                        const f = { id: uid(), img: k, larghezza, rapporto, dx: 0, dy: -(larghezza * rapporto / 2 + 30), fluttuante: true };
                        n.figure = [...(n.figure || []), f];
                        fatto.push(`immagine ${f.id} accanto a ${n.id}`);
                    });
                    (a.modifica || []).forEach(x => {
                        const n = mm.nodi[x.nodo_id];
                        const f = n && (n.figure || []).find(q => q.id === x.immagine_accanto_id);
                        if (!f) { errori.push(`immagine ${x.immagine_accanto_id} non trovata accanto al nodo ${x.nodo_id}`); return; }
                        if (isFinite(x.larghezza) && +x.larghezza > 0) f.larghezza = Math.round(limita(+x.larghezza, 24, 1600));
                        if (isFinite(x.dx)) f.dx = +x.dx;
                        if (isFinite(x.dy)) f.dy = +x.dy;
                        if (typeof x.libera === 'boolean') { if (x.libera) f.fluttuante = true; else delete f.fluttuante; }
                        if (x.metti_dentro) {
                            // Come «Mettila dentro il nodo»: quella che c'era dentro esce e prende il suo posto
                            const vecchia = n.immagine && mm.immagini[n.immagine.id] ? n.immagine : null;
                            n.figure = n.figure.filter(q => q.id !== f.id);
                            if (vecchia) n.figure.push({ id: uid(), img: vecchia.id, larghezza: vecchia.larghezza, rapporto: f.rapporto, dx: f.dx, dy: f.dy, fluttuante: true });
                            n.immagine = { id: f.img, larghezza: limita(Math.round(f.larghezza), 40, 600) };
                        }
                        fatto.push(`immagine ${f.id}`);
                    });
                    (a.larghezza_dentro || []).forEach(x => {
                        const n = mm.nodi[x.nodo_id];
                        if (!n || !n.immagine) { errori.push(`il nodo ${x.nodo_id} non ha un'immagine dentro`); return; }
                        n.immagine = { ...n.immagine, larghezza: Math.round(limita(+x.larghezza || 120, 40, 600)) };
                        fatto.push(`larghezza dell'immagine dentro ${n.id}`);
                    });
                    (a.elimina || []).forEach(x => {
                        const n = mm.nodi[x.nodo_id];
                        if (!n) { errori.push(`nodo ${x.nodo_id} non trovato`); return; }
                        if (x.immagine_accanto_id === 'tutte') { n.figure = []; n.immagine = null; }
                        else if (x.immagine_accanto_id === 'dentro') n.immagine = null;
                        else {
                            const prima = (n.figure || []).length;
                            n.figure = (n.figure || []).filter(q => q.id !== x.immagine_accanto_id);
                            if (n.figure.length === prima) { errori.push(`immagine ${x.immagine_accanto_id} non trovata accanto al nodo ${n.id}`); return; }
                        }
                        fatto.push(`eliminata ${x.immagine_accanto_id} di ${n.id}`);
                    });
                    return { fatto, ...(errori.length ? { errori } : {}) };
                });
            },
        },
        {
            nome: 'stili_predefiniti',
            descrizione: "Gli stili predefiniti dei nodi, creati dall'utente e validi per tutte le mappe (es. «Dettaglio»: piccolo e grigio): li elenca, ne crea uno (da proprietà di stile o copiando lo stile di un nodo), lo modifica o lo elimina. Per darlo ai nodi: modifica_nodi con stile_predefinito.",
            parametri: S.obj({
                azione: S.str('elenca | crea | modifica | elimina'), stile_id: S.str('modifica ed elimina: id dello stile'),
                nome: S.str('nome dello stile'), stile: SCHEMA_STILE,
                da_mappa_id: S.str('crea o modifica: copia lo stile di un nodo di questa mappa…'), da_nodo_id: S.str('…questo nodo'),
            }, ['azione']),
            modifica: true,
            etichetta: a => ({ elenca: 'Guardo gli stili predefiniti', crea: `Creo lo stile «${a.nome || ''}»`, modifica: 'Modifico uno stile predefinito', elimina: 'Elimino uno stile predefinito' })[a.azione] || 'Stili predefiniti',
            esegui: async (a, ctx) => {
                const elenco = () => Mappe.stiliPredefiniti().map((x, i) => ({ id: x.id, nome: x.nome, stile: x.stile, scorciatoia: i < 9 ? `Ctrl+Alt+${i + 1}` : undefined, ...Strumenti.altriDati(x, ['id', 'nome', 'stile']) }));
                if (a.azione === 'elenca') return { stili: elenco() };
                const attuale = a.stile_id ? Mappe.stilePredefinito(a.stile_id) : null;
                if (['modifica', 'elimina'].includes(a.azione) && !attuale) throw new Error(`Stile «${a.stile_id}» non trovato: usa azione elenca.`);
                if (a.azione === 'elimina') {
                    if (!await ctx.conferma(`Eliminare lo stile predefinito <b>${esc(attuale.nome)}</b>? I nodi che lo usano tornano al loro stile.`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                    Mappe.eliminaStilePredefinito(attuale.id);
                    return { eliminato: true, stili: elenco() };
                }
                if (!['crea', 'modifica'].includes(a.azione)) throw new Error('azione: elenca | crea | modifica | elimina');
                const avvisi = [];
                const finto = { stile: a.azione === 'modifica' ? structuredClone(attuale.stile) : {} };
                if (a.da_mappa_id || a.da_nodo_id) {
                    // L'aspetto proprio del nodo, come «Nuovo dallo stile del nodo» e «Aggiorna» dell'editor: lo stile
                    // predefinito che usa più le scelte fatte su di lui
                    const n = richiediNodo(richiediMappa(a.da_mappa_id), a.da_nodo_id);
                    const pre = Mappe.stilePredefinito(n.stilePredefinito);
                    finto.stile = structuredClone({ ...(pre ? pre.stile : {}), ...(n.stile || {}) });
                }
                if (a.stile) applicaStile(finto, a.stile, avvisi);
                const nome = String(a.nome || (attuale && attuale.nome) || '').trim();
                if (!nome) throw new Error('Serve un nome per lo stile.');
                const salvato = Mappe.salvaStilePredefinito({ id: attuale ? attuale.id : undefined, nome, stile: finto.stile });
                // Le mappe aperte lo mostrano subito
                Mappe.tutte().filter(x => Object.values(x.nodi).some(n => n.stilePredefinito === salvato.id)).forEach(x => Mappe.cambiataDaFuori(x.id));
                return { salvato: { id: salvato.id, nome: salvato.nome, stile: salvato.stile }, ...(avvisi.length ? { avvisi } : {}) };
            },
        },
        {
            nome: 'ordina_mappe',
            descrizione: "Decide l'ordine delle mappe nella sezione Mappe: a mano (con l'elenco delle mappe nell'ordine voluto: anche solo alcune, che prendono i posti che avevano), per nome o per ultima modificata.",
            parametri: S.obj({
                ordine: S.str('mano | nome | modifica'), mappe_ids: S.arr(S.str('id'), "con ordine 'mano': le mappe nel nuovo ordine"),
            }, ['ordine']),
            modifica: true,
            etichetta: () => "Riordino le mappe",
            esegui: a => {
                if (!Mappe.ORDINI_MAPPE.some(x => x[0] === a.ordine)) throw new Error('ordine: mano | nome | modifica');
                if (a.ordine === 'mano' && Array.isArray(a.mappe_ids) && a.mappe_ids.length) {
                    const ignote = a.mappe_ids.filter(id => !Mappe.mappa(id));
                    if (ignote.length) throw new Error(`Mappe non trovate: ${ignote.join(', ')} (usa elenca_mappe).`);
                    Mappe.riordina(a.mappe_ids);
                } else Mappe.impostaOrdineMappe(a.ordine);
                if (App.rottaAttiva && App.rottaAttiva.vista === 'mappe') App.ridisegna();
                return { ordine: Mappe.ordineMappe(), mappe: Mappe.ordinate().map(x => ({ id: x.id, nome: x.nome })) };
            },
        },
        {
            nome: 'tema_mappe',
            descrizione: "I temi delle mappe (valgono per tutte le mappe): li elenca con tutto il loro contenuto, oppure crea, modifica o elimina un tema personale: sfondo, colore del testo e della radice, colori dei rami, stile dei nodi per livello (radice, rami principali, secondo livello, successivi) e linee. Un tema nuovo può partire dall'aspetto di una mappa o da un altro tema; i temi di serie non si modificano.",
            parametri: S.obj({
                azione: S.str('elenca | crea | modifica | elimina'), tema_id: S.str('modifica ed elimina: id del tema personale'),
                parti_da_mappa_id: S.str('crea: parte dall\'aspetto di questa mappa'), parti_da_tema_id: S.str('crea: parte da questo tema'),
                nome: S.str('nome del tema'), sfondo: S.str('#rrggbb'), testo: S.str('colore del testo, #rrggbb'), radice: S.str('colore della radice, #rrggbb'),
                colori_rami: S.arr(S.str('#rrggbb'), 'colori dei rami principali, in ordine'),
                livelli: S.arr(S.obj({
                    forma: S.str(FORME.join(' | ')), spessore_bordo: num('px'), scala: num('dimensione del testo (1 = normale)'),
                    riempimento: S.str("nessuno | tenue (colore del ramo, chiaro) | ramo (colore del ramo) | #rrggbb"),
                    grassetto: S.bool('grassetto'), corsivo: S.bool('corsivo'),
                }), 'stile dei nodi: [radice, rami principali, secondo livello, livelli successivi]'),
                linee: S.obj({
                    forma: S.str('curva | ortogonale | arrotondata | dritta'), affusolamento: S.bool('affusolamento automatico'),
                    spessore_radice: num('px'), spessore_minimo: num('px'), riduzione: num('0.1-0.7 a ogni livello'), spessore: num('senza affusolamento, px'),
                }),
                applica_a_mappa_id: S.str('facoltativo: usa il tema in questa mappa'),
            }, ['azione']),
            modifica: true,
            etichetta: a => ({ elenca: 'Guardo i temi delle mappe', crea: `Creo il tema «${a.nome || 'nuovo'}»`, modifica: 'Modifico un tema', elimina: 'Elimino un tema' }[a.azione] || 'Temi delle mappe'),
            esegui: async (a, ctx) => {
                if (a.azione === 'elenca') return { temi: Mappe.temi().map(temaPerIA) };
                if (a.azione === 'elimina') {
                    const t = Mappe.temiPersonali().find(x => x.id === a.tema_id);
                    if (!t) throw new Error('Tema personale non trovato (i temi di serie non si eliminano).');
                    if (!await ctx.conferma(`Eliminare il tema <b>${esc(t.nome)}</b>? Le mappe che lo usano torneranno a «Naturale + colori».`)) return { annullato: true, motivo: "L'utente non ha confermato" };
                    Mappe.eliminaTema(t.id);
                    return { eliminato: true };
                }
                let base;
                if (a.azione === 'modifica') {
                    base = Mappe.temiPersonali().find(x => x.id === a.tema_id);
                    if (!base) throw new Error('Tema personale non trovato: i temi di serie non si modificano, creane uno nuovo con parti_da_tema_id.');
                } else if (a.azione === 'crea') {
                    if (a.parti_da_mappa_id) base = Mappe.temaDaMappa(richiediMappa(a.parti_da_mappa_id), a.nome || 'Il mio tema');
                    else {
                        const da = Mappe.temi().find(x => x.id === (a.parti_da_tema_id || 'naturale')) || Mappe.temi()[0];
                        base = { ...structuredClone(da), id: 'p' + uid(), nome: a.nome || 'Il mio tema' };
                    }
                } else throw new Error('azione: elenca | crea | modifica | elimina');
                const t = structuredClone(base);
                if (a.nome) t.nome = a.nome;
                ['sfondo', 'testo', 'radice'].forEach(k => { if (Mappe.coloreValido(a[k])) t[k] = a[k]; });
                if (Array.isArray(a.colori_rami) && a.colori_rami.some(Mappe.coloreValido)) t.paletta = a.colori_rami.filter(Mappe.coloreValido);
                if (Array.isArray(a.livelli)) {
                    while (t.livelli.length < 4) t.livelli.push({ ...t.livelli[t.livelli.length - 1] });
                    a.livelli.slice(0, 4).forEach((l, i) => {
                        const x = t.livelli[i];
                        if (FORME.includes(l.forma)) x.forma = l.forma;
                        if (l.spessore_bordo != null) x.spessore = limita(+l.spessore_bordo || 0, 0, 6);
                        if (l.scala != null) x.scala = limita(+l.scala || 1, 0.6, 3);
                        if (l.riempimento) x.riempimento = ['nessuno', 'tenue', 'ramo'].includes(l.riempimento) || Mappe.coloreValido(l.riempimento) ? l.riempimento : x.riempimento;
                        if (typeof l.grassetto === 'boolean') x.grassetto = l.grassetto;
                        if (typeof l.corsivo === 'boolean') x.corsivo = l.corsivo;
                    });
                }
                if (a.linee) {
                    const l = a.linee;
                    if (Mappe.FORME_LINEA.some(f => f[0] === l.forma)) t.linee.forma = l.forma;
                    if (typeof l.affusolamento === 'boolean') t.linee.affusolamento = l.affusolamento;
                    if (l.spessore_radice != null) t.linee.inizio = +l.spessore_radice;
                    if (l.spessore_minimo != null) t.linee.minimo = +l.spessore_minimo;
                    if (l.riduzione != null) t.linee.fattore = 1 - limita(+l.riduzione, 0.1, 0.7);
                    if (l.spessore != null) t.linee.spessore = +l.spessore;
                }
                const salvato = Mappe.salvaTema(t);
                if (a.applica_a_mappa_id) cambia(a.applica_a_mappa_id, m => { m.tema = salvato.id; m.paletta = null; m.coloreRadice = null; m.livelli = null; m.linee = null; });
                // Le mappe aperte con questo tema si ridisegnano
                const ed = Viste.mappa && Viste.mappa.editor;
                if (ed && !a.applica_a_mappa_id && (Mappe.mappa(ed.id) || {}).tema === salvato.id) { Mappe.primaDiCambiare(ed.id); Mappe.cambiataDaFuori(ed.id); }
                return { salvato: true, tema_id: salvato.id, nome: salvato.nome, applicato_a: a.applica_a_mappa_id || undefined };
            },
        },
        {
            nome: 'allinea_nodi',
            descrizione: "Allinea dei nodi in disposizione libera (figli di un nodo con disposizione libera, o nodi liberi): stesso bordo sinistro, stesso centro o stesso bordo destro, senza cambiarne l'altezza; ogni ramo segue il suo nodo. Se tra i nodi ce ne sono che non si spostano a mano (la radice, nodi in una disposizione automatica) gli altri si allineano a loro, altrimenti al riquadro che li contiene tutti. Apre la mappa (servono le posizioni disegnate).",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'), nodi_ids: S.arr(S.str('id'), 'almeno due nodi'),
                allineamento: S.str('sinistra | centro | destra'),
            }, ['mappa_id', 'nodi_ids', 'allineamento']),
            etichetta: a => `Allineo ${(a.nodi_ids || []).length} nodi ${a.allineamento === 'centro' ? 'al centro' : 'a ' + a.allineamento}`,
            esegui: async a => {
                const m = richiediMappa(a.mappa_id);
                const ids = [...new Set(a.nodi_ids || [])];
                ids.forEach(id => richiediNodo(m, id));
                if (!['sinistra', 'centro', 'destra'].includes(a.allineamento)) throw new Error('allineamento: sinistra | centro | destra');
                const ed = await apriMappa(m.id);
                const p = ed.preparaAllineamento(a.allineamento, ids);
                if (!p) throw new Error('Servono almeno due nodi, e almeno uno in disposizione libera (figlio di un nodo con disposizione libera, o nodo libero): gli altri li sistema la disposizione automatica.');
                if (!p.mossi) return { gia_allineati: true };
                cambia(m.id, () => p.applica());
                return { allineati: p.mobili, spostati: p.mossi };
            },
        },
        {
            nome: 'distanza_tra_nodi',
            descrizione: "Allontana (o avvicina) solo alcuni nodi tra loro nelle disposizioni automatiche (orizzontale, verticale, capovolta, lineare), come il cursore «Tra i nodi scelti»: cambia gli spazi dal primo all'ultimo dei nodi dati nella loro pila (con A e C e B in mezzo, sia A–B sia B–C); i nodi restano allineati e i loro rami li seguono. Con nodi di padri diversi si allontanano i rami che li contengono, padri compresi. Non vale nella disposizione radiale o libera. Apre la mappa (servono le posizioni disegnate).",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'), nodi_ids: S.arr(S.str('id'), 'almeno due nodi'),
                distanza: num('1 = come gli altri fratelli, 2 = il doppio, 0.5 = la metà (0.2-12)'),
            }, ['mappa_id', 'nodi_ids', 'distanza']),
            etichetta: a => `Cambio la distanza tra ${(a.nodi_ids || []).length} nodi`,
            esegui: async a => {
                const m = richiediMappa(a.mappa_id);
                const ids = [...new Set(a.nodi_ids || [])];
                ids.forEach(id => richiediNodo(m, id));
                const v = +a.distanza;
                if (!(v > 0)) throw new Error('distanza: un numero da 0.2 a 12 (1 = come gli altri fratelli)');
                const ed = await apriMappa(m.id);
                const p = ed.preparaDistanza(ids);
                if (!p) throw new Error("Tra questi nodi non c'è uno spazio da cambiare: servono almeno due nodi nella stessa pila di una disposizione automatica (nella radiale o libera i nodi si spostano con le posizioni).");
                cambia(m.id, () => p.applica(limita(v, 0.2, 12)));
                return { cambiati: p.bersagli.length, distanza: limita(v, 0.2, 12) };
            },
        },
        {
            nome: 'vista_mappa',
            descrizione: "Mostra una mappa all'utente: la apre nell'editor e, se serve, seleziona e mette in vista dei nodi, si concentra su un ramo (lo mostra da solo), torna alla mappa intera o la adatta alla finestra.",
            parametri: S.obj({
                mappa_id: S.str('id della mappa'), azione: S.str('apri | seleziona | concentra | mappa_intera | adatta'),
                nodi_ids: S.arr(S.str('id'), 'seleziona: i nodi; concentra: il nodo del ramo (il primo)'),
            }, ['mappa_id']),
            etichetta: a => `Apro «${nomeMappa(a.mappa_id)}»`,
            esegui: async a => {
                const ed = await apriMappa(a.mappa_id);
                const m = Mappe.mappa(a.mappa_id);
                const azione = a.azione || 'apri';
                if (azione === 'seleziona') return { selezionati: ed.seleziona(a.nodi_ids || []) };
                if (azione === 'concentra') { const id = (a.nodi_ids || [])[0]; richiediNodo(m, id); ed.concentra(id); return { concentrato_su: id }; }
                if (azione === 'mappa_intera') { ed.concentra(m.radice); return { ok: true }; }
                if (azione === 'adatta') { ed.adatta(); return { ok: true }; }
                return { aperta: true };
            },
        },
        {
            nome: 'esporta_mappa',
            descrizione: "Esporta una mappa (o un suo ramo): png = immagine scaricata, opml = file per altri programmi, testo = elenco rientrato restituito a te (per mostrarlo o usarlo).",
            parametri: S.obj({ mappa_id: S.str('id'), formato: S.str('png | opml | testo'), ramo_id: S.str('facoltativo: solo questo ramo') }, ['mappa_id', 'formato']),
            etichetta: a => `Esporto «${nomeMappa(a.mappa_id)}» (${a.formato})`,
            esegui: async a => {
                const m = richiediMappa(a.mappa_id);
                const cima = a.ramo_id ? (richiediNodo(m, a.ramo_id), a.ramo_id) : m.radice;
                if (a.formato === 'testo') {
                    const testo = [Mappe.testoRientrato(m, cima), ...(a.ramo_id ? [] : Mappe.radiciLibere(m).map(l => Mappe.testoRientrato(m, l.id)))].join('\n');
                    return { testo: Ui.tronca(testo, 60000) };
                }
                if (a.formato === 'opml') {
                    scaricaFile(nomeFileSicuro(m.nome).slice(0, 120) + '.opml', FileMappe.inOpml(m, cima), 'text/x-opml');
                    return { scaricato: true };
                }
                if (a.formato === 'png') {
                    const ed = await apriMappa(m.id);
                    await ed.esportaImmagine(a.ramo_id || null);
                    return { scaricato: true };
                }
                throw new Error('formato: png | opml | testo');
            },
        },
    ];

    Strumenti.aggiungi(LISTA);
})();
