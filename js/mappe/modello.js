// Mappe mentali (sezione "Mappe"): modello dei dati, temi e operazioni sui nodi.
// L'editor (js/mappe/editor.js) cambia le mappe solo attraverso queste funzioni; la posizione dei nodi
// la calcola js/mappe/disposizione.js, l'import da SimpleMind, OPML e testo sta in js/mappe/importa.js.
//
// mappa { id, nome, materiaId, setId, creata, modificata, tema, disposizione, direzione, spaziatura,
//         paletta, coloreRadice, radice, nodi: { id: nodo }, relazioni: [relazione], immagini: { id: dataURL },
//         linee (scelte sulle linee che valgono per tutta la mappa), vista: { x, y, zoom }, anteprima }
// nodo  { id, genitore, figli: [id], testo, lato, x, y, off, chiuso, icona, immagine, etichette, nota, link, spunta, data, stile }
//         genitore null e id diverso dalla radice = nodo libero, fuori dall'albero (come in SimpleMind): x, y = suo centro;
//         lato 'd' | 's' solo per i rami principali; off = { dx, dy } distanza del centro da quello del genitore,
//         usata quando il genitore dispone i figli in modo libero (così il ramo si sposta tutto insieme);
//         disposizione = come si dispongono i suoi figli (null = come il padre; la radice usa quella della mappa);
//         icona = emoji | 'n:3' (numero nel cerchio) | 'img:<id immagine>'; immagine = { id, larghezza };
//         etichette = [{ id, testo, dx, dy, stile }] riquadri attaccati al nodo (dx, dy dal centro del nodo);
//         figure = [{ id, img, larghezza, rapporto, dx, dy }] immagini libere attaccate al nodo, fuori dal riquadro:
//         img = chiave in "immagini", rapporto = altezza / larghezza, dx, dy = centro dell'immagine dal centro del nodo
//         (si muovono con lui e allargano il suo ingombro nella disposizione, come le etichette);
//         testo con **grassetto**, *corsivo*, __sottolineato__, ~~barrato~~; stile = solo ciò che cambia rispetto al tema,
//         compresa la linea che lo collega al genitore (lineaForma, linea, lineaSpessore, frecciaInizio, frecciaFine, coloreLinea);
//         piega = { c1: { dx, dy }, c2: { dx, dy } } linea verso il genitore piegata a mano: punti di controllo della curva,
//         c1 rispetto al punto dove parte (sul genitore), c2 rispetto a dove arriva (sul nodo);
//         raccordo = { nodi: [id], graffa } nodo che raccoglie alcuni fratelli: sta dopo di loro, collegato a ognuno
//         con una linea o con una graffa (come il riepilogo di XMind); genitore = il genitore dei fratelli raccolti;
//         legami = [id] altri genitori del nodo (figlio comune di nodi che non sono fratelli): ognuno ha una linea verso di lui
// relazione { id, da, a, testo, colore, tratto, frecciaInizio, frecciaFine, curva: { dx, dy } | null }
// Le immagini stanno a parte in "immagini", così l'annulla dell'editor non le copia a ogni passo.

const Mappe = (() => {

    // ---- Temi --------------------------------------------------------------------------------
    // livelli = stile dei nodi per livello (0 radice, 1 rami principali, …; l'ultimo vale per i più profondi).
    // Colori speciali: 'ramo' = colore del ramo, 'tenue' = colore del ramo schiarito verso lo sfondo.
    // linee: forma dei collegamenti, affusolamento automatico (lo spessore parte da "inizio" alla radice, a ogni
    // livello si riduce di "fattore" e non scende sotto "minimo"), spessore delle linee non affusolate.

    const VIVI = ['#d50000', '#fb8c00', '#f2b300', '#7cb342', '#00a152', '#00a6e8', '#2962ff', '#7e57c2', '#ab47bc', '#e91e63'];
    const LINEE_BASE = { forma: 'curva', affusolamento: true, inizio: 9, minimo: 1.5, fattore: 0.55, spessore: 2 };
    const LIVELLI_NATURALI = [
        { forma: 'pillola', spessore: 3, scala: 1.5, grassetto: true },
        { forma: 'sottolineata', scala: 1.3, grassetto: true },
        { forma: 'sottolineata', scala: 1.1 },
        { forma: 'sottolineata' },
    ];

    const TEMI = [
        {
            id: 'naturale', nome: 'Naturale + colori', sfondo: '#ffffff', testo: '#1f1f24', radice: '#3f51b5', paletta: VIVI,
            livelli: LIVELLI_NATURALI, linee: { ...LINEE_BASE },
        },
        {
            id: 'brillanti', nome: 'Colori brillanti', sfondo: '#ffffff', testo: '#1f1f24', radice: '#3949ab', paletta: VIVI,
            livelli: [
                { forma: 'pillola', riempimento: 'ramo', spessore: 0, scala: 1.5, grassetto: true },
                { forma: 'pillola', riempimento: 'ramo', spessore: 0, scala: 1.2, grassetto: true },
                { forma: 'arrotondata', riempimento: 'tenue', spessore: 1.5, scala: 1.05 },
                { forma: 'arrotondata', riempimento: 'tenue', spessore: 1 },
            ],
            linee: { ...LINEE_BASE, affusolamento: false, inizio: 6, fattore: 0.6, spessore: 2.5 },
        },
        {
            id: 'su-nero', nome: 'Colori su nero', sfondo: '#18181b', testo: '#f4f4f5', radice: '#ffb300', paletta: VIVI, scuro: true,
            livelli: [
                { forma: 'arrotondata', spessore: 2.5, scala: 1.45, grassetto: true },
                { forma: 'arrotondata', spessore: 2, scala: 1.15, grassetto: true },
                { forma: 'arrotondata', spessore: 1.5 },
            ],
            linee: { ...LINEE_BASE, affusolamento: false, inizio: 6, fattore: 0.6, spessore: 2 },
        },
        {
            id: 'naturale-nero', nome: 'Naturale su nero', sfondo: '#121214', testo: '#ececf1', radice: '#7c8cff', paletta: VIVI, scuro: true,
            livelli: LIVELLI_NATURALI, linee: { ...LINEE_BASE },
        },
    ];

    const FORME_LINEA = [['curva', 'Curva'], ['ortogonale', 'Ad angolo'], ['arrotondata', 'Angolo arrotondato'], ['dritta', 'Dritta']];
    const TRATTI_LINEA = [['auto', 'Affusolata automatica'], ['affusolata', 'Affusolata'], ['pieno', 'Piena'], ['trattini', 'A trattini'], ['punti', 'A punti']];
    const CHIAVI_COLLEGAMENTO = ['lineaForma', 'linea', 'lineaSpessore', 'frecciaInizio', 'frecciaFine', 'coloreLinea', 'freccia'];

    // Temi creati dall'utente: stanno nelle impostazioni, valgono per tutte le mappe e finiscono nel backup
    let cacheTemi = { fonte: null, lista: [] };
    function temiPersonali() {
        const fonte = (typeof Dati !== 'undefined' && Dati.impostazioni().temiMappe) || [];
        if (cacheTemi.fonte !== fonte) cacheTemi = { fonte, lista: (Array.isArray(fonte) ? fonte : []).filter(t => t && t.id).map(normalizzaTema) };
        return cacheTemi.lista;
    }

    function normalizzaTema(t) {
        const c = (v, r) => (coloreValido(v) ? v : r);
        const n = (v, min, max, r) => (isFinite(+v) && v !== null && v !== '' ? limita(+v, min, max) : r);
        const sfondo = c(t.sfondo, '#ffffff');
        const scuro = luminanza(sfondo) < 0.3;
        const paletta = (Array.isArray(t.paletta) ? t.paletta.filter(coloreValido) : []).slice(0, 24);
        const linee = { ...LINEE_BASE, ...(t.linee || {}) };
        return {
            id: String(t.id), nome: String(t.nome || 'Il mio tema').slice(0, 60), personale: true, scuro,
            sfondo, testo: c(t.testo, scuro ? '#f4f4f5' : '#1f1f24'), radice: c(t.radice, '#3f51b5'),
            paletta: paletta.length ? paletta : VIVI,
            livelli: (Array.isArray(t.livelli) && t.livelli.length ? t.livelli : LIVELLI_NATURALI).slice(0, 6).map(l => ({ ...l })),
            linee: {
                forma: FORME_LINEA.some(f => f[0] === linee.forma) ? linee.forma : 'curva', affusolamento: !!linee.affusolamento,
                inizio: n(linee.inizio, 1, 24, 9), minimo: n(linee.minimo, 0.5, 10, 1.5), fattore: n(linee.fattore, 0.3, 0.95, 0.55),
                spessore: n(linee.spessore, 0.5, 12, 2),
            },
        };
    }

    function temi() { return [...TEMI, ...temiPersonali()]; }

    // Tema della mappa, con le scelte sulle linee fatte solo per questa mappa
    function tema(mappa) {
        const base = temi().find(t => t.id === (mappa && mappa.tema)) || TEMI[0];
        return mappa && mappa.linee ? { ...base, linee: { ...base.linee, ...mappa.linee } } : base;
    }

    function salvaTema(t) {
        const pulito = { ...normalizzaTema(t) };
        delete pulito.personale;
        delete pulito.scuro;
        const lista = [...((Dati.impostazioni().temiMappe) || [])];
        const i = lista.findIndex(x => x && x.id === pulito.id);
        if (i >= 0) lista[i] = pulito; else lista.push(pulito);
        Dati.salvaImpostazioni({ temiMappe: lista });
        return pulito;
    }

    function eliminaTema(id) {
        Dati.salvaImpostazioni({ temiMappe: ((Dati.impostazioni().temiMappe) || []).filter(x => x && x.id !== id) });
        tutte().filter(m => m.tema === id).forEach(m => {
            primaDiCambiare(m.id);
            m.tema = 'naturale';
            Archivio.salva('mappe', m);
            cambiataDaFuori(m.id);
        });
    }

    // Un tema nuovo che parte dall'aspetto attuale della mappa (anche gli stili importati da SimpleMind)
    function temaDaMappa(mappa, nome = 'Il mio tema') {
        const t = tema(mappa);
        const livelli = (mappa.livelli && mappa.livelli.length ? mappa.livelli : t.livelli).map(l => ({ ...l }));
        while (livelli.length < 4) livelli.push({ ...livelli[livelli.length - 1] });
        const propria = (mappa.paletta || []).filter(coloreValido);
        return normalizzaTema({
            id: 'p' + uid(), nome, sfondo: t.sfondo, testo: t.testo,
            radice: coloreValido(mappa.coloreRadice) ? mappa.coloreRadice : t.radice,
            paletta: propria.length ? propria : [...t.paletta], livelli: livelli.slice(0, 4), linee: { ...t.linee },
        });
    }

    const BASE = {
        forma: 'sottolineata', tratto: 'pieno', spessore: 2, riempimento: 'nessuno', coloreBordo: 'ramo', coloreTesto: 'auto',
        grassetto: false, corsivo: false, sottolineato: false, barrato: false, scala: 1, allinea: 'centro',
        larghezzaMin: 0, altezzaMin: 0,
    };

    const FORME = [
        ['nessuna', 'Nessuna'], ['sottolineata', 'Sottolineata'], ['rettangolo', 'Rettangolo'], ['arrotondata', 'Arrotondata'],
        ['pillola', 'Pillola'], ['ellisse', 'Ellisse'], ['parallelogramma', 'Parallelogramma'],
    ];

    // Icone dei nodi (come la tavolozza di SimpleMind); 'n:1'… sono i numeri nel cerchio
    const ICONE = {
        Simboli: '✅ ❌ ⚙️ 🕐 ⏳ 📅 🔔 ❓ ℹ️ ⚠️ ❗ ⚡ ⭐ 🎯 🚩 🏁 ➕ ➖ 🔑 🔒 🔓 🗑️ 👍 👎 🤝 ⬆️ ⬇️ ⬅️ ➡️ 🔀 🔁 💬 💭'.split(' '),
        Numeri: ['n:1', 'n:2', 'n:3', 'n:4', 'n:5', 'n:6', 'n:7', 'n:8', 'n:9', 'n:10'],
        Facce: '😀 😊 😉 😐 😟 😢 😠 😮 🤔 ❤️ 💔 🎂 🎈 🎉'.split(' '),
        Persone: '👦 👧 👨 👩 👶 🧓 🧑‍🎓 🧑‍🏫 🧑‍⚕️ 👮 👥 👪 🧠 👁️ 🗣️'.split(' '),
        Oggetti: '📚 📖 📝 📌 📎 📁 📄 💡 🔦 ⚖️ 💰 💶 🛒 📊 📈 📉 🔧 🛠️ 🔨 ✂️ ✏️ 📏 🧪 🔬 💊 🩺 🎵 🎤 📷 📱 💻 🏠 🏫 🏥 🎁 🧩 🎨 🏆 🥇 👑 🚗 ✈️ 🧭 ⚓ 🔭 🧱'.split(' '),
        Natura: '🌳 🍀 🌱 🌹 🍁 🐱 🐶 🐦 🐞 🐝 🐬 🐘 🦁 🐌 🌞 🌙 ❄️ ☁️ 🌧️ 🔥 💧 🌍'.split(' '),
    };

    const DISPOSIZIONI = [
        ['orizzontale', 'Orizzontale'], ['verticale', 'Verticale'], ['su', 'Capovolta'],
        ['lineare', 'Lineare'], ['radiale', 'Radiale'], ['libera', 'Libera'],
    ];

    // ---- Colori ------------------------------------------------------------------------------

    function rgb(c) {
        const h = String(c || '').replace('#', '');
        const x = h.length === 3 ? h.split('').map(v => v + v).join('') : h.padEnd(6, '0');
        return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) || 0);
    }
    const esa = v => Math.round(limita(v, 0, 255)).toString(16).padStart(2, '0');
    function mescola(a, b, quantoA) {
        const x = rgb(a), y = rgb(b);
        return '#' + x.map((v, i) => esa(v * quantoA + y[i] * (1 - quantoA))).join('');
    }
    function luminanza(c) {
        const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function coloreValido(c) { return /^#[0-9a-f]{6}$/i.test(String(c || '')); }

    // Colore del ramo: quello scelto sul nodo, altrimenti la radice ha il suo, i rami principali
    // prendono la tavolozza in ordine e gli altri ereditano dal genitore
    function coloreRamo(mappa, nodo, livello, indice, ereditato) {
        if (nodo.stile && coloreValido(nodo.stile.colore)) return nodo.stile.colore;
        const pre = stilePredefinito(nodo.stilePredefinito);
        if (pre && coloreValido(pre.stile.colore)) return pre.stile.colore;
        const t = tema(mappa);
        if (livello === 0) return coloreValido(mappa.coloreRadice) ? mappa.coloreRadice : t.radice;
        if (livello === 1 || !ereditato) {
            const propria = (mappa.paletta || []).filter(coloreValido);
            const p = propria.length ? propria : t.paletta;
            return p[(indice || 0) % p.length];
        }
        return ereditato;
    }

    // ---- Stili predefiniti (come gli stili di Word) ---------------------------------------------
    // Creati dall'utente: { id, nome, stile } nelle impostazioni (stiliMappe), validi per tutte le mappe e nel backup. Un
    // nodo che ne usa uno (nodo.stilePredefinito = id) ne prende l'aspetto sopra il livello del tema; le scelte fatte sul
    // nodo restano sopra. Cambiando lo stile cambiano tutti i nodi che lo usano
    const CHIAVI_STILE = ['scala', 'grassetto', 'corsivo', 'sottolineato', 'barrato', 'coloreTesto', 'allinea', 'forma', 'riempimento',
        'coloreBordo', 'colore', 'spessore', 'tratto', 'larghezzaMin', 'altezzaMin', 'sottolineatura', ...CHIAVI_COLLEGAMENTO];

    // Solo le chiavi conosciute, con i colori validi (gli stili arrivano anche da backup e dall'assistente)
    function pulisciStile(st) {
        const fuori = {};
        CHIAVI_STILE.forEach(k => {
            if (!(k in (st || {})) || st[k] == null || st[k] === '') return;
            const v = st[k];
            if (/^colore|riempimento/.test(k) && typeof v === 'string' && !coloreValido(v) && !['ramo', 'tenue', 'auto', 'nessuno'].includes(v)) return;
            fuori[k] = k === 'sottolineatura' && typeof v === 'object' ? { ...v } : v;
        });
        return fuori;
    }

    let cacheStili = { fonte: null, lista: [] };
    function stiliPredefiniti() {
        const fonte = (typeof Dati !== 'undefined' && Dati.impostazioni().stiliMappe) || [];
        if (cacheStili.fonte !== fonte) {
            cacheStili = { fonte, lista: (Array.isArray(fonte) ? fonte : []).filter(x => x && x.id).map(x => ({ id: String(x.id), nome: String(x.nome || 'Stile').slice(0, 40), stile: pulisciStile(x.stile) })) };
        }
        return cacheStili.lista;
    }
    function stilePredefinito(id) { return id ? stiliPredefiniti().find(x => x.id === id) || null : null; }

    function salvaStilePredefinito(x) {
        const pulito = { id: String(x.id || uid()), nome: String(x.nome || 'Stile').trim().slice(0, 40) || 'Stile', stile: pulisciStile(x.stile) };
        const lista = [...stiliPredefiniti().map(y => ({ ...y }))];
        const i = lista.findIndex(y => y.id === pulito.id);
        if (i >= 0) lista[i] = pulito; else lista.push(pulito);
        Dati.salvaImpostazioni({ stiliMappe: lista });
        return pulito;
    }

    // I nodi che lo usavano tornano al loro stile (le scelte fatte sul nodo restano)
    function eliminaStilePredefinito(id) {
        Dati.salvaImpostazioni({ stiliMappe: stiliPredefiniti().filter(x => x.id !== id) });
        tutte().forEach(mp => {
            const usati = Object.values(mp.nodi || {}).filter(n => n.stilePredefinito === id);
            if (!usati.length) return;
            primaDiCambiare(mp.id);
            usati.forEach(n => { delete n.stilePredefinito; });
            Archivio.salva('mappe', mp);
            cambiataDaFuori(mp.id);
        });
    }

    // Stile finale di un nodo: base → livello del tema → stile predefinito → scelte fatte sul nodo, con i colori risolti
    function stile(mappa, nodo, livello, colore) {
        const t = tema(mappa);
        const livelli = mappa.livelli && mappa.livelli.length ? mappa.livelli : t.livelli;
        const pre = stilePredefinito(nodo.stilePredefinito);
        const s = { ...BASE, ...livelli[Math.min(livello, livelli.length - 1)], ...(pre ? pre.stile : {}), ...(nodo.stile || {}) };
        const risolvi = v => (v === 'ramo' ? colore : v === 'tenue' ? mescola(colore, t.sfondo, t.scuro ? 0.32 : 0.2) : v);
        // I colori finiscono nel disegno: si accettano solo #rrggbb (le mappe possono arrivare da file e backup)
        const valido = (c, riserva) => (coloreValido(c) ? c : riserva);
        s.colore = valido(colore, t.radice);
        s.riempimento = !s.riempimento || s.riempimento === 'nessuno' ? null : valido(risolvi(s.riempimento), null);
        s.coloreBordo = valido(risolvi(s.coloreBordo), s.colore);
        if (s.coloreTesto === 'auto' || !s.coloreTesto) {
            s.coloreTesto = s.riempimento ? (luminanza(s.riempimento) > 0.45 ? '#1f1f24' : '#ffffff') : t.testo;
        } else s.coloreTesto = valido(risolvi(s.coloreTesto), t.testo);
        return s;
    }

    // Spessore con l'affusolamento automatico alla fine dei collegamenti di un livello (e della sottolineatura dei suoi nodi)
    function spessoreLinea(mappa, livello) {
        const l = tema(mappa).linee;
        return Math.max(l.minimo, l.inizio * Math.pow(l.fattore, Math.max(0, livello)));
    }

    // Stile della linea che collega un nodo al genitore: tema della mappa + scelte fatte su quel collegamento
    function collegamento(mappa, nodo, colore) {
        const l = tema(mappa).linee;
        const pre = stilePredefinito(nodo.stilePredefinito);
        const s = { ...(pre ? pre.stile : {}), ...(nodo.stile || {}) };
        const freccia = v => (['nessuna', 'semplice', 'piena'].includes(v) ? v : null);
        const tratto = TRATTI_LINEA.some(t => t[0] === s.linea) ? s.linea : l.affusolamento ? 'auto' : 'pieno';
        return {
            forma: FORME_LINEA.some(f => f[0] === s.lineaForma) ? s.lineaForma : l.forma,
            tratto,
            spessore: +s.lineaSpessore > 0 ? limita(+s.lineaSpessore, 0.5, 20) : l.spessore,
            frecciaInizio: freccia(s.frecciaInizio) || 'nessuna',
            frecciaFine: freccia(s.frecciaFine) || (s.freccia ? 'piena' : 'nessuna'),
            colore: coloreValido(s.coloreLinea) ? s.coloreLinea : colore,
        };
    }

    // ---- Mappe -------------------------------------------------------------------------------

    function tutte() { return Archivio.tutti('mappe').sort((a, b) => (b.modificata || 0) - (a.modificata || 0)); }
    function mappa(id) { return Archivio.prendi('mappe', id); }

    // Le mappe nell'ordine scelto nella sezione Mappe: 'mano' (trascinandole), 'nome' o 'modifica' (ultima modificata
    // prima). Nell'ordine a mano quelle mai spostate (le nuove) vanno in cima, dalla più recente
    const ORDINI_MAPPE = [['mano', 'A mano'], ['modifica', 'Ultima modificata'], ['nome', 'Per nome']];
    function ordineMappe() { const o = Dati.impostazioni().ordineMappe; return ORDINI_MAPPE.some(x => x[0] === o) ? o : 'modifica'; }
    function ordinate() {
        const lista = tutte(), ordine = ordineMappe();
        if (ordine === 'nome') return lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true, sensitivity: 'base' }));
        if (ordine !== 'mano') return lista;
        const pos = new Map((Dati.impostazioni().ordineMappeMano || []).map((id, i) => [id, i]));
        return lista.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : -1) - (pos.has(b.id) ? pos.get(b.id) : -1));
    }
    // ids = le mappe (anche solo alcune, es. quelle di una materia) nel nuovo ordine: prendono i posti che avevano
    function riordina(ids) {
        const tuttiIds = ordinate().map(x => x.id);
        const scelti = ids.filter(id => tuttiIds.includes(id));
        const posti = tuttiIds.map((id, i) => (scelti.includes(id) ? i : -1)).filter(i => i >= 0);
        posti.forEach((p, k) => { tuttiIds[p] = scelti[k]; });
        Dati.salvaImpostazioni({ ordineMappe: 'mano', ordineMappeMano: tuttiIds });
    }
    function impostaOrdineMappe(ordine) {
        // Passando all'ordine a mano si parte da quello che si vede adesso
        const corrente = ordinate().map(x => x.id);
        Dati.salvaImpostazioni(ordine === 'mano' && !(Dati.impostazioni().ordineMappeMano || []).length
            ? { ordineMappe: ordine, ordineMappeMano: corrente } : { ordineMappe: ordine });
    }

    function nodoVuoto(dati = {}) {
        return {
            id: uid(), genitore: null, figli: [], testo: '', lato: null, x: null, y: null, off: null, chiuso: false,
            icona: null, immagine: null, etichette: [], figure: [], nota: '', link: '', spunta: null, data: null, disposizione: null, stile: {}, ...dati,
        };
    }

    // Mappa nuova con la sola radice, non ancora salvata (gli import la riempiono prima di salvarla)
    function nuova({ nome = 'Nuova mappa', materiaId = null, setId = null, tema: t = 'naturale' } = {}) {
        const ora = Date.now();
        const r = nodoVuoto({ testo: String(nome).trim() || 'Nuova mappa' });
        return {
            id: uid(), nome: String(nome).trim() || 'Nuova mappa', materiaId, setId, creata: ora, modificata: ora,
            tema: t, disposizione: 'orizzontale', direzione: 'auto', spaziatura: 1, paletta: null, coloreRadice: null, livelli: null, linee: null,
            radice: r.id, nodi: { [r.id]: r }, relazioni: [], immagini: {}, vista: null, anteprima: '',
        };
    }

    function crea(opzioni) { return aggiungi(nuova(opzioni)); }

    // Una mappa già pronta (da un import): solo controllo e salvataggio
    function aggiungi(m) {
        const ora = Date.now();
        Object.assign(m, { id: m.id || uid(), creata: m.creata || ora, modificata: ora });
        Archivio.salva('mappe', m);
        return m;
    }

    function salva(m) {
        m.modificata = Date.now();
        Archivio.salva('mappe', m);
    }

    function elimina(id) { return Archivio.elimina('mappe', id); }

    function duplica(id) {
        const orig = mappa(id);
        if (!orig) return null;
        const copia = JSON.parse(JSON.stringify(orig));
        copia.id = uid();
        copia.nome = orig.nome + ' (copia)';
        copia.vista = null;
        return aggiungi(copia);
    }

    function contaNodi(m) { return Object.keys(m.nodi || {}).length; }

    // Cambi che non vengono dall'editor (assistente, Annulla della chat): chi li fa li annuncia prima (la storia
    // fotografa la mappa, l'editor aperto su di lei si segna com'era) e dopo (l'editor ridisegna e ne fa un passo
    // del suo Annulla; se la mappa non c'è più torna all'elenco senza salvarla)
    function annuncia(id, fase) { document.dispatchEvent(new CustomEvent('mappa-da-fuori', { detail: { id, fase } })); }
    function primaDiCambiare(id) {
        if (typeof Storia !== 'undefined') Storia.primaDi('mappe', id);
        annuncia(id, 'prima');
    }
    function cambiataDaFuori(id) { annuncia(id, mappa(id) ? 'dopo' : 'eliminata'); }

    // La mappa resta nella sua materia ma esce dal set (e quindi dai suoi materiali)
    function togliDalSet(id) {
        const m = mappa(id);
        if (!m || !m.setId) return;
        primaDiCambiare(id);
        m.setId = null;
        salva(m);
        cambiataDaFuori(id);
    }

    // Mappe salvate prima della disposizione libera per nodo: le posizioni assolute dei nodi dell'albero
    // diventano distanze dal genitore (i nodi liberi tengono la loro posizione)
    function aggiorna(m) {
        const pos = id => { const n = m.nodi[id]; return n && n.x != null && n.y != null ? { x: n.x, y: n.y } : null; };
        const nuove = new Map();
        Object.values(m.nodi).forEach(n => {
            if (!n.genitore || n.off || !pos(n.id)) return;
            const p = n.genitore === m.radice ? pos(m.radice) || { x: 0, y: 0 } : pos(n.genitore);
            if (p) nuove.set(n.id, { dx: pos(n.id).x - p.x, dy: pos(n.id).y - p.y });
        });
        let cambiata = nuove.size > 0;
        nuove.forEach((off, id) => { m.nodi[id].off = off; });
        Object.values(m.nodi).forEach(n => {
            if ((n.genitore || n.id === m.radice) && (n.x != null || n.y != null)) { n.x = null; n.y = null; cambiata = true; }
        });
        return cambiata;
    }

    // ---- Albero ------------------------------------------------------------------------------

    function radiciLibere(m) {
        return Object.values(m.nodi).filter(n => !n.genitore && n.id !== m.radice);
    }

    // Profondità dalla radice; un nodo libero conta come ramo principale (livello 1)
    function livello(m, id) {
        let l = 0, n = m.nodi[id];
        while (n && n.genitore && m.nodi[n.genitore]) { l++; n = m.nodi[n.genitore]; }
        return n && n.id !== m.radice ? l + 1 : l;
    }

    function antenatoLibero(m, id) {
        let n = m.nodi[id];
        while (n && n.genitore) n = m.nodi[n.genitore];
        return n && n.id !== m.radice ? n : null;
    }

    function antenati(m, id) {
        const out = [];
        for (let n = m.nodi[id]; n && n.genitore; n = m.nodi[n.genitore]) out.unshift(n.genitore);
        return out;
    }

    function discendenti(m, id) {
        const out = [];
        const visita = x => (m.nodi[x] ? m.nodi[x].figli : []).forEach(f => { out.push(f); visita(f); });
        visita(id);
        return out;
    }

    function aggiungiNodo(m, { genitore = null, indice = null, ...dati } = {}) {
        const n = nodoVuoto({ ...dati, genitore });
        m.nodi[n.id] = n;
        if (genitore && m.nodi[genitore]) {
            const f = m.nodi[genitore].figli;
            f.splice(indice == null ? f.length : limita(indice, 0, f.length), 0, n.id);
        }
        return n;
    }

    function eliminaNodo(m, id) {
        if (id === m.radice || !m.nodi[id]) return false;
        const via = new Set([id, ...discendenti(m, id)]);
        const n = m.nodi[id];
        if (n.genitore && m.nodi[n.genitore]) m.nodi[n.genitore].figli = m.nodi[n.genitore].figli.filter(f => f !== id);
        via.forEach(x => delete m.nodi[x]);
        m.relazioni = m.relazioni.filter(r => !via.has(r.da) && !via.has(r.a));
        pulisciLegami(m);
        return true;
    }

    // Raccordi e genitori in più restano validi dopo eliminazioni e spostamenti: un raccordo tiene solo i fratelli
    // che ha ancora (senza nessuno torna un figlio normale), un figlio comune solo i genitori che esistono ancora
    function pulisciLegami(m) {
        Object.values(m.nodi).forEach(n => {
            if (n.raccordo) {
                const nodi = (n.raccordo.nodi || []).filter(x => x !== n.id && m.nodi[x] && m.nodi[x].genitore === n.genitore && !m.nodi[x].raccordo);
                n.raccordo = n.genitore && nodi.length ? { ...n.raccordo, nodi: [...new Set(nodi)] } : null;
            }
            if (n.legami) {
                const sotto = new Set(discendenti(m, n.id));
                const legami = n.legami.filter(x => x !== n.id && x !== n.genitore && m.nodi[x] && !sotto.has(x));
                n.legami = legami.length ? [...new Set(legami)] : null;
            }
        });
    }

    // Sposta un nodo (con il suo ramo) sotto un altro genitore; null = diventa libero
    function sposta(m, id, genitore, indice = null) {
        const n = m.nodi[id];
        if (!n || id === m.radice) return false;
        if (genitore && (genitore === id || discendenti(m, id).includes(genitore))) return false;
        if (n.genitore && m.nodi[n.genitore]) m.nodi[n.genitore].figli = m.nodi[n.genitore].figli.filter(f => f !== id);
        n.genitore = genitore || null;
        if (genitore) {
            const f = m.nodi[genitore].figli;
            f.splice(indice == null ? f.length : limita(indice, 0, f.length), 0, id);
        }
        if (genitore !== m.radice) n.lato = null;
        pulisciLegami(m);
        return true;
    }

    // ---- Copia e incolla di rami --------------------------------------------------------------

    function copiaRamo(m, id) {
        const ids = [id, ...discendenti(m, id)];
        const nodi = ids.map(x => JSON.parse(JSON.stringify(m.nodi[x])));
        const immagini = {};
        nodi.forEach(n => {
            const usa = k => { if (k && m.immagini[k]) immagini[k] = m.immagini[k]; };
            if (n.immagine) usa(n.immagine.id);
            if (String(n.icona || '').startsWith('img:')) usa(n.icona.slice(4));
            (n.figure || []).forEach(f => usa(f.img));
        });
        return { cima: id, nodi, immagini };
    }

    // Incolla con id nuovi; restituisce l'id della cima
    function incollaRamo(m, dati, genitore, indice = null) {
        const nuovi = new Map(dati.nodi.map(n => [n.id, uid()]));
        dati.nodi.forEach(orig => {
            const n = { ...nodoVuoto(), ...JSON.parse(JSON.stringify(orig)), id: nuovi.get(orig.id) };
            n.figli = (orig.figli || []).filter(f => nuovi.has(f)).map(f => nuovi.get(f));
            n.genitore = orig.id === dati.cima ? genitore : nuovi.get(orig.genitore);
            n.etichette = (n.etichette || []).map(e => ({ ...e, id: uid() }));
            n.figure = (n.figure || []).map(f => ({ ...f, id: uid() }));
            // Raccordi e figli comuni puntano ai nodi copiati insieme a loro (la cima non ha più i suoi fratelli)
            if (n.raccordo) n.raccordo = orig.id === dati.cima ? null : { ...n.raccordo, nodi: (n.raccordo.nodi || []).filter(x => nuovi.has(x)).map(x => nuovi.get(x)) };
            if (n.legami) n.legami = n.legami.map(x => nuovi.get(x) || x);
            delete n.rif;   // un nodo copiato dalla "link argomenti" diventa un nodo normale
            if (orig.id === dati.cima) { n.lato = null; n.off = null; if (genitore) { n.x = null; n.y = null; } }
            m.nodi[n.id] = n;
        });
        Object.assign(m.immagini, dati.immagini || {});
        const cima = nuovi.get(dati.cima);
        if (genitore) {
            const f = m.nodi[genitore].figli;
            f.splice(indice == null ? f.length : limita(indice, 0, f.length), 0, cima);
        }
        pulisciLegami(m);
        return cima;
    }

    // Albero semplice [{ testo, nota, figli }] → nodi sotto "genitore"; restituisce gli id delle cime
    function aggiungiAlbero(m, voci, genitore) {
        return voci.map(v => {
            const n = aggiungiNodo(m, { genitore, testo: v.testo || '', nota: v.nota || '' });
            aggiungiAlbero(m, v.figli || [], n.id);
            return n.id;
        });
    }

    // Testo rientrato (tab, spazi, trattini o titoli markdown) → [{ testo, figli }]
    // I titoli # contano per livello; le righe sotto un titolo stanno dentro di lui, rientrate a loro volta
    function alberoDaTesto(testo) {
        const radici = [];
        const pila = [];
        let chiaveTitolo = -1;
        String(testo || '').replace(/\r/g, '').split('\n').forEach(riga => {
            if (!riga.trim()) return;
            const titolo = riga.match(/^(#{1,6})\s+(.*)$/);
            let chiave, t;
            if (titolo) {
                chiave = chiaveTitolo = (titolo[1].length - 1) * 1000;
                t = titolo[2];
            } else {
                const spazi = riga.match(/^[\t ]*/)[0].replace(/\t/g, '    ').length;
                chiave = (chiaveTitolo >= 0 ? chiaveTitolo + 500 : 0) + spazi;
                t = riga.trim().replace(/^([-*+•◦▪]|\d+[.)])\s+/, '');
            }
            t = t.trim();
            if (!t) return;
            const voce = { testo: t, figli: [], chiave };
            while (pila.length && pila[pila.length - 1].chiave >= chiave) pila.pop();
            (pila.length ? pila[pila.length - 1].figli : radici).push(voce);
            pila.push(voce);
        });
        const pulisci = v => ({ testo: v.testo, figli: v.figli.map(pulisci) });
        return radici.map(pulisci);
    }

    function testoRientrato(m, id, livello = 0) {
        const n = m.nodi[id];
        if (!n) return '';
        const riga = '\t'.repeat(livello) + (n.testo || '').replace(/\n/g, ' ');
        return [riga, ...n.figli.map(f => testoRientrato(m, f, livello + 1))].join('\n');
    }

    // ---- Collegamenti con set e materie --------------------------------------------------------

    function scollegaSet(setId) {
        tutte().filter(m => m.setId === setId).forEach(m => {
            primaDiCambiare(m.id); m.setId = null; Archivio.salva('mappe', m); cambiataDaFuori(m.id);
        });
    }
    function scollegaMateria(materiaId) {
        tutte().filter(m => m.materiaId === materiaId).forEach(m => {
            primaDiCambiare(m.id); m.materiaId = null; m.setId = null; Archivio.salva('mappe', m); cambiataDaFuori(m.id);
        });
    }

    // ---- Testo dei nodi --------------------------------------------------------------------------

    // Il testo dei nodi: **grassetto**, *corsivo*, __sottolineato__, ~~barrato~~, anche dentro una parola o uno dentro
    // l'altro (***grassetto e corsivo***). Ogni segno accende o spegne il suo stile; vale solo se tocca il testo
    // (a destra quando apre, a sinistra quando chiude) e se più avanti c'è chi lo chiude: così «5 * 3» o «____»
    // restano come sono. \* (e \_ \~ \\) scrive il carattere così com'è.
    // → pezzi [{ t, b, i, u, s }] con il testo e gli stili di ogni tratto
    const SEGNI = { 1: ['i'], 2: ['b'], 3: ['b', 'i'] };
    function pezziTesto(t) {
        const s = String(t || '');
        const segni = [];
        const re = /\\[*_~\\]|\*+|_{2,}|~{2,}/g;
        let x;
        while ((x = re.exec(s))) {
            const v = x[0];
            const tipi = v[0] === '\\' ? null : v[0] === '*' ? SEGNI[v.length] : v.length === 2 ? [v[0] === '_' ? 'u' : 's'] : null;
            segni.push({ da: x.index, a: x.index + v.length, v, tipi, prima: s[x.index - 1], dopo: s[x.index + v.length] });
        }
        const tocca = c => c != null && !/\s/.test(c);
        const pezzi = [];
        const acceso = {};
        let testo = '', pos = 0;
        const chiudiPezzo = () => { if (testo) pezzi.push({ t: testo, ...acceso }); testo = ''; };
        segni.forEach((g, k) => {
            testo += s.slice(pos, g.da);
            pos = g.a;
            if (!g.tipi) { testo += g.v[0] === '\\' ? g.v[1] : g.v; return; }
            const validi = g.tipi.filter(tipo => acceso[tipo]
                ? tocca(g.prima)
                : tocca(g.dopo) && segni.slice(k + 1).some(h => h.tipi && h.tipi.includes(tipo) && tocca(h.prima)));
            // I segni che non valgono restano testo (** per il grassetto, * per il corsivo)
            const resto = g.tipi.filter(tipo => !validi.includes(tipo)).map(tipo => ({ b: '**', i: '*', u: '__', s: '~~' })[tipo]).join('');
            if (validi.length) {
                chiudiPezzo();
                validi.forEach(tipo => { if (acceso[tipo]) delete acceso[tipo]; else acceso[tipo] = true; });
            }
            testo += resto;
        });
        testo += s.slice(pos);
        chiudiPezzo();
        return pezzi;
    }

    // → HTML sicuro (gli a capo li tiene il CSS)
    function testoInHtml(t) {
        return pezziTesto(t).map(p => {
            let h = esc(p.t);
            if (p.s) h = `<s>${h}</s>`;
            if (p.u) h = `<u>${h}</u>`;
            if (p.i) h = `<i>${h}</i>`;
            if (p.b) h = `<b>${h}</b>`;
            return h;
        }).join('');
    }

    // Pezzi con i loro stili → testo con i segni (il contrario di pezziTesto). Senza stili il testo resta com'è;
    // con gli stili i caratteri * _ ~ \ del testo si scrivono con la \ davanti, e gli spazi ai bordi di un tratto
    // restano fuori dai segni (perché valgano)
    function testoDaPezzi(pezzi) {
        const CHIAVI = ['b', 'i', 'u', 's'];
        const stili = p => CHIAVI.filter(k => p[k]);
        const lista = [];
        pezzi.filter(p => p.t).forEach(p => {
            const ultimo = lista[lista.length - 1];
            if (ultimo && stili(ultimo).join() === stili(p).join()) ultimo.t += p.t; else lista.push({ ...p });
        });
        if (!lista.some(p => stili(p).length)) return lista.map(p => p.t).join('');
        // Spazi ai bordi: tengono solo gli stili comuni ai tratti accanto
        const tratti = [];
        lista.forEach(p => {
            const [, prima, centro, dopo] = p.t.match(/^(\s*)([\s\S]*?)(\s*)$/);
            if (prima) tratti.push({ t: prima, spazio: true });
            if (centro) tratti.push({ ...p, t: centro });
            if (dopo) tratti.push({ t: dopo, spazio: true });
        });
        tratti.forEach((p, k) => {
            if (!p.spazio) return;
            const a = tratti.slice(0, k).reverse().find(q => !q.spazio) || {}, d = tratti.slice(k + 1).find(q => !q.spazio) || {};
            CHIAVI.forEach(c => { p[c] = !!(a[c] && d[c]); });
        });
        let out = '';
        const ora = {};
        const stelle = k => '*'.repeat((k.includes('b') ? 2 : 0) + (k.includes('i') ? 1 : 0));
        // Prima si chiude (al contrario di come si apre), poi si apre: *__così__*
        const cambia = verso => {
            const giro = CHIAVI.filter(c => !!ora[c] !== !!verso[c]);
            const chiusi = giro.filter(c => ora[c]), aperti = giro.filter(c => !ora[c]);
            out += (chiusi.includes('s') ? '~~' : '') + (chiusi.includes('u') ? '__' : '') + stelle(chiusi)
                + stelle(aperti) + (aperti.includes('u') ? '__' : '') + (aperti.includes('s') ? '~~' : '');
            giro.forEach(c => { ora[c] = !ora[c]; });
        };
        tratti.forEach(p => { cambia(p); out += p.t.replace(/[\\*_~]/g, '\\$&'); });
        cambia({});
        return out;
    }

    function testoSemplice(t) { return pezziTesto(t).map(p => p.t).join('').replace(/\s+/g, ' ').trim(); }

    return {
        TEMI, FORME, FORME_LINEA, TRATTI_LINEA, CHIAVI_COLLEGAMENTO, DISPOSIZIONI, ICONE, BASE, LINEE_BASE,
        CHIAVI_STILE, stiliPredefiniti, stilePredefinito, salvaStilePredefinito, eliminaStilePredefinito, pulisciStile,
        temi, tema, temiPersonali, salvaTema, eliminaTema, temaDaMappa, normalizzaTema,
        stile, collegamento, coloreRamo, spessoreLinea, mescola, luminanza, coloreValido,
        tutte, mappa, nuova, crea, aggiungi, salva, elimina, duplica, contaNodi, nodoVuoto, aggiorna, primaDiCambiare, cambiataDaFuori, togliDalSet,
        radiciLibere, livello, antenati, discendenti, antenatoLibero, aggiungiNodo, eliminaNodo, sposta, pulisciLegami,
        copiaRamo, incollaRamo, aggiungiAlbero, alberoDaTesto, testoRientrato,
        scollegaSet, scollegaMateria, testoInHtml, testoSemplice, pezziTesto, testoDaPezzi,
        ORDINI_MAPPE, ordineMappe, ordinate, riordina, impostaOrdineMappe,
    };
})();
