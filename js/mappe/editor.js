// Editor delle mappe mentali (rotta /mappa/:id), sul modello di SimpleMind.
//
// Disegno: i nodi sono <div> posizionati in un "mondo" che si sposta e si ingrandisce con una trasformazione CSS;
// rami, sottolineature e relazioni stanno in un <svg> sotto i nodi. A ogni cambiamento si ridisegna tutto:
// contenuti → misure → disposizione (js/mappe/disposizione.js) → posizioni → linee.
// Maniglie, finestrelle e ricerca stanno in un livello sopra, in coordinate dello schermo.
// Ogni modifica passa da modifica(): salva un'istantanea per Annulla/Ripeti, ridisegna e salva poco dopo.
// In sola lettura (opzioni.solaLettura, per la risposta di una flashcard: js/mappe/vista.js) disegna un solo ramo
// con tutti i rami aperti, evidenzia un nodo, si sposta e ingrandisce soltanto, e non salva mai niente.

Viste.mappa = {
    nav: 'mappe',
    titolo: 'Mappa',
    schermoIntero: true,

    mostra(el, params, query = {}) {
        const m = Mappe.mappa(params.id);
        if (!m) {
            el.innerHTML = `<div class="pagina">${Ui.vuoto({ icona: 'mappa', titolo: 'Mappa non trovata', testo: 'Forse è stata eliminata.',
                azioni: '<a class="btn btn-secondario" href="#/mappe">Torna alle mappe</a>' })}</div>`;
            return;
        }
        App.contesto = { setId: m.setId, materiaId: m.materiaId };
        document.title = m.nome + ' · Flashcard';
        if (Mappe.aggiorna(m)) Archivio.salva('mappe', m);
        // La freccia indietro torna alla pagina da cui si è aperta la mappa, come il tasto Indietro (per esempio ai
        // materiali del set, o alla "link argomenti"). Dallo studio torna alla stessa carta e il ripasso continua (la
        // sessione resta sospesa: js/viste/studio.js); senza pagina precedente va all'elenco delle mappe
        const da = Router.precedente;
        const vista = da && (Router.analizza(da) || {}).vista;
        const daStudio = vista === 'studio' && Viste.studio.haSospesa();
        this.editor = EditorMappa(el, m, {
            nodo: query.nodo || null, indietroStoria: !!vista && (vista !== 'studio' || daStudio),
            titoloIndietro: daStudio ? 'Torna al ripasso' : null,
        });
    },

    esci() {
        if (this.editor) this.editor.chiudi();
        this.editor = null;
    },
};

// opzioni: nodo = nodo da selezionare all'apertura; solaLettura, ramo (cima da mostrare), evidenzia (nodo da
// evidenziare), zoomLibero (la rotellina ingrandisce anche senza Ctrl)
function EditorMappa(radiceEl, m, opzioni = {}) {
    const SOLA = !!opzioni.solaLettura;
    const ico = Ui.ico;
    const URL_IMMAGINE = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
    const CHIAVE_PANNELLO = 'flashcard-mappe-pannello';
    const COLORI = ['#000000', '#424242', '#757575', '#bdbdbd', '#ffffff', '#d50000', '#ff6d00', '#ffab00', '#ffd600', '#aeea00',
        '#00c853', '#00bfa5', '#00b8d4', '#2962ff', '#3d5afe', '#6200ea', '#aa00ff', '#c51162', '#8d6e63',
        '#ffe0d2', '#fff3c4', '#e3f2fd', '#e8f5e9', '#fce4ec', '#ede7f6'];
    const TRATTI = { pieno: 'solid', trattini: 'dashed', punti: 'dotted' };

    const st = {
        sel: new Set(), attivo: null, rel: null, et: null, fig: null, arco: null, arcoDa: null,
        vista: !SOLA && m.vista && isFinite(m.vista.zoom) ? { ...m.vista } : null,
        modifica: null, focus: SOLA && opzioni.ramo && opzioni.ramo !== m.radice && m.nodi[opzioni.ramo] ? opzioni.ramo : null, collegando: null,
        pannello: SOLA ? null : (() => { try { return localStorage.getItem(CHIAVE_PANNELLO) || null; } catch (e) { return null; } })(),
        passato: [], futuro: [], continua: null,
        cerca: { aperta: false, testo: '', trovati: [], indice: -1 },
        appunti: null, stileCopiato: null, popDisp: null, popDispMulti: false, popDistanza: false, punto: null, focusLato: null,
    };
    const geo = new Map();          // id → riquadro disposto (x, y, w, h, dir, livello, colore, s = stile)
    const elementi = new Map();     // id → <div class="nodo">
    const elEtichette = new Map();  // "nodo:etichetta" → <div>
    const elFigure = new Map();     // "nodo:figura" → <img> (immagini libere attaccate ai nodi)
    let alberoB = null, liberiB = [], archi = [], htmlEtichetteRel = '';

    // ---- Struttura della pagina -------------------------------------------------------------------

    const pulsante = (azione, icona, titolo, extra = '') =>
        `<button type="button" class="btn-icona mappa-btn" data-a="${azione}" title="${esc(titolo)}" aria-label="${esc(titolo)}" ${extra}>${icona}</button>`;

    radiceEl.innerHTML = `
        <div class="editor-mappa${SOLA ? ' sola-lettura' : ''}">
            <header class="mappa-barra">
                <a class="btn-icona mappa-btn${opzioni.titoloIndietro ? ' torna-ripasso' : ''}" href="#/mappe" data-indietro title="${esc(opzioni.titoloIndietro || (opzioni.indietroStoria ? 'Torna indietro' : 'Torna alle mappe'))}" aria-label="${esc(opzioni.titoloIndietro || 'Torna indietro')}">${ico('sinistra')}${opzioni.titoloIndietro ? `<span>${esc(opzioni.titoloIndietro)}</span>` : ''}</a>
                <input class="mappa-nome" value="${esc(m.nome)}" maxlength="120" aria-label="Nome della mappa" spellcheck="false">
                ${m.panoramica ? `<button type="button" class="chip chip-panoramica" data-a="panoramica" title="Mappa d'insieme della materia, tenuta dall'app">${ico('mappa')}d'insieme</button>` : ''}
                <span class="mappa-salvato" data-salvato>Salvata</span>
                <div class="mappa-strumenti">
                    <div class="mappa-gruppo">
                        ${pulsante('annulla', ico('annulla'), 'Annulla (Ctrl+Z)')}
                        ${pulsante('ripeti', ico('ripeti'), 'Ripeti (Ctrl+Y)')}
                    </div>
                    <div class="mappa-gruppo">
                        ${pulsante('figlio', ico('piu'), 'Nuovo nodo figlio (Tab)')}
                        ${pulsante('etichetta', ico('testo-t'), 'Aggiungi etichetta al nodo')}
                        ${pulsante('relazione', ico('collega'), 'Collega a un altro nodo')}
                        ${pulsante('immagine', ico('immagine'), 'Immagine: libera (agganciata al nodo) o dentro il nodo')}
                    </div>
                    <div class="mappa-gruppo mappa-zoom">
                        ${pulsante('zoom-meno', ico('meno'), 'Riduci (Ctrl+−)')}
                        <button type="button" class="mappa-zoom-valore" data-a="zoom-100" title="Torna al 100%">100%</button>
                        ${pulsante('zoom-piu', ico('piu'), 'Ingrandisci (Ctrl++)')}
                        ${pulsante('adatta', ico('adatta'), 'Adatta alla finestra (Ctrl+0)')}
                    </div>
                    <div class="mappa-gruppo">
                        ${pulsante('cerca', ico('cerca'), 'Cerca nella mappa (Ctrl+F)')}
                        ${pulsante('griglia', ico('griglia'), 'Griglia di allineamento (Ctrl+G): i nodi spostati si agganciano ai suoi punti')}
                    </div>
                    <div class="mappa-gruppo mappa-pannelli">
                        ${pulsante('p-disposizione', ico('ramo'), 'Disposizione (distanze e griglia)', 'data-p="disposizione"')}
                        ${pulsante('p-tema', ico('tavolozza'), 'Tema e linee', 'data-p="tema"')}
                        ${pulsante('p-stile', ico('pennello'), 'Stile del nodo', 'data-p="stile"')}
                        ${pulsante('p-icone', ico('faccina'), 'Icone', 'data-p="icone"')}
                        ${pulsante('p-nota', ico('nota'), 'Nota, link e data', 'data-p="nota"')}
                        ${pulsante('p-struttura', ico('elenco'), 'Struttura (elenco dei nodi)', 'data-p="struttura"')}
                    </div>
                    ${pulsante('flashcard', ico('carte'), 'Flashcard dai nodi scelti: le scrive l\'IA, con tag e rientri come la creazione flashcard per profondità')}
                    ${pulsante('assistente', ico('scintille'), "Assistente IA: chiedigli di modificare la mappa")}
                    ${pulsante('altro', ico('altro'), 'Altre azioni')}
                </div>
            </header>
            <div class="mappa-corpo">
                <div class="mappa-tela" tabindex="-1">
                    <div class="mappa-mondo">
                        <svg class="mappa-svg" width="1" height="1" aria-hidden="true"><defs></defs><g data-archi></g><g data-relazioni></g><g data-temp></g></svg>
                        <div class="mappa-livello" data-nodi></div>
                        <div class="mappa-livello" data-extra></div>
                    </div>
                    <div class="mappa-sopra" data-sopra></div>
                    <div class="mappa-focus" data-focus hidden></div>
                    <div class="mappa-ricerca" data-ricerca hidden>
                        ${ico('cerca')}
                        <input type="search" placeholder="Cerca nella mappa" aria-label="Cerca nella mappa">
                        <span class="mappa-ricerca-conto" data-conto></span>
                        ${pulsante('cerca-prec', ico('su'), 'Precedente (Maiusc+Invio)')}
                        ${pulsante('cerca-succ', ico('giu'), 'Successivo (Invio)')}
                        ${pulsante('cerca-chiudi', ico('chiudi'), 'Chiudi (Esc)')}
                    </div>
                </div>
                <aside class="mappa-pannello" data-pannello hidden></aside>
            </div>
        </div>`;

    const editorEl = $('.editor-mappa', radiceEl);
    const tela = $('.mappa-tela', radiceEl);
    const mondo = $('.mappa-mondo', radiceEl);
    const svg = $('.mappa-svg', radiceEl);
    const defsEl = $('defs', svg), archiEl = $('[data-archi]', svg), relEl = $('[data-relazioni]', svg), tempEl = $('[data-temp]', svg);
    const nodiEl = $('[data-nodi]', radiceEl), extraEl = $('[data-extra]', radiceEl);
    const sopraEl = $('[data-sopra]', radiceEl);
    const pannelloEl = $('[data-pannello]', radiceEl);
    const nomeEl = $('.mappa-nome', radiceEl);

    // ---- Storia (Annulla / Ripeti) e salvataggio ------------------------------------------------------

    const CAMPI_STORIA = ['nome', 'nodi', 'relazioni', 'radice', 'tema', 'disposizione', 'direzione', 'spaziatura', 'spaziaturaFratelli', 'paletta', 'coloreRadice', 'livelli', 'linee'];
    const istantanea = () => JSON.stringify(Object.fromEntries(CAMPI_STORIA.map(k => [k, m[k]])));
    const ripristina = json => Object.assign(m, JSON.parse(json));

    function modifica(fn) {
        const prima = istantanea();
        const esito = fn();
        if (esito === false) return false;
        st.passato.push(prima);
        if (st.passato.length > 200) st.passato.shift();
        st.futuro = [];
        st.continua = null;
        cambiato();
        return esito;
    }

    // Modifiche a più passi (scrivere una nota, trascinare un cursore): una sola voce nella storia
    function modificaContinua(chiave, fn) {
        if (st.continua !== chiave) {
            st.passato.push(istantanea());
            st.futuro = [];
            st.continua = chiave;
        }
        fn();
        disegnaPresto();
        salvaPresto();
        aggiornaStoria();
        aggiornaReset();
    }

    // I pulsanti Reset dei pannelli si accendono appena un valore non è più quello predefinito (anche mentre trascini)
    function aggiornaReset() {
        $$('[data-reset-sezione]', pannelloEl).forEach(b => { const r = RESET[b.dataset.resetSezione]; b.disabled = !(r && r.serve()); });
    }

    function annulla() {
        if (st.modifica) concludiModifica();
        if (!st.passato.length) return;
        st.futuro.push(istantanea());
        ripristina(st.passato.pop());
        st.continua = null;
        cambiato();
    }

    function ripeti() {
        if (!st.futuro.length) return;
        st.passato.push(istantanea());
        ripristina(st.futuro.pop());
        st.continua = null;
        cambiato();
    }

    function cambiato() {
        [...st.sel].forEach(id => { if (!m.nodi[id]) st.sel.delete(id); });
        if (st.attivo && !m.nodi[st.attivo]) st.attivo = [...st.sel].pop() || null;
        if (st.rel && !m.relazioni.some(r => r.id === st.rel)) st.rel = null;
        if (st.arco && !(m.nodi[st.arco] && m.nodi[st.arco].genitore)) st.arco = st.arcoDa = null;
        if (st.arcoDa && !partenze(st.arco).includes(st.arcoDa)) st.arco = st.arcoDa = null;
        if (st.et && !(m.nodi[st.et.nodo] && m.nodi[st.et.nodo].etichette.some(e => e.id === st.et.id))) st.et = null;
        if (st.fig && !figura(st.fig)) st.fig = null;
        if (st.focus && !m.nodi[st.focus]) st.focus = null;
        if (nomeEl.value !== m.nome && document.activeElement !== nomeEl) nomeEl.value = m.nome;
        disegna();
        salvaPresto();
        aggiornaStoria();
        aggiornaPannello();
    }

    // Cambi di sola vista (rami aperti o chiusi): si salvano ma non entrano nella storia
    function cambiatoSenzaStoria() {
        disegna();
        salvaPresto();
        aggiornaPannello();
    }

    function aggiornaStoria() {
        $('[data-a="annulla"]', radiceEl).disabled = !st.passato.length;
        $('[data-a="ripeti"]', radiceEl).disabled = !st.futuro.length;
    }

    let timerSalva = null;
    function salvaPresto() {
        $('[data-salvato]', radiceEl).textContent = 'Salvataggio…';
        clearTimeout(timerSalva);
        timerSalva = setTimeout(salvaOra, 500);
    }
    function salvaOra() {
        clearTimeout(timerSalva);
        timerSalva = null;
        if (!st.focus) m.anteprima = anteprima();
        Mappe.salva(m);
        const e = $('[data-salvato]', radiceEl);
        if (e) e.textContent = 'Salvata';
    }

    let timerVista = null;
    function salvaVistaPresto() {
        if (SOLA) return;
        clearTimeout(timerVista);
        timerVista = setTimeout(() => { m.vista = { ...st.vista }; Archivio.salva('mappe', m); }, 800);
    }

    let rafDisegno = null;
    function disegnaPresto() {
        if (rafDisegno) return;
        rafDisegno = requestAnimationFrame(() => { rafDisegno = null; disegna(); });
    }

    // ---- Disegno -------------------------------------------------------------------------------------

    function livelliEColori() {
        const info = new Map();
        const visita = (id, livello, indice, ereditato) => {
            const n = m.nodi[id];
            if (!n || info.has(id)) return;
            const colore = Mappe.coloreRamo(m, n, livello, indice, ereditato);
            info.set(id, { livello, colore });
            const raccordi = [];
            n.figli.forEach((f, i) => {
                const r = m.nodi[f] && m.nodi[f].raccordo;
                if (r && (r.nodi || []).some(x => x !== f && n.figli.includes(x))) raccordi.push([f, i]);
                else visita(f, livello + 1, i, colore);
            });
            raccordi.forEach(([f, i]) => {
                const primo = info.get(m.nodi[f].raccordo.nodi.find(x => info.has(x)));
                if (primo) visita(f, primo.livello + 1, i, primo.colore); else visita(f, livello + 1, i, colore);
            });
        };
        visita(m.radice, 0, 0, null);
        Mappe.radiciLibere(m).forEach((l, i) => visita(l.id, 1, m.nodi[m.radice].figli.length + i, null));
        return info;
    }

    function iconaHtml(icona) {
        if (!icona) return '';
        if (icona.startsWith('n:')) return `<span class="nodo-numero">${esc(icona.slice(2))}</span>`;
        if (icona.startsWith('img:')) {
            const src = m.immagini[icona.slice(4)];
            return src ? `<img class="nodo-icona-img" src="${esc(src)}" alt="" draggable="false">` : '';
        }
        return `<span class="nodo-icona">${esc(icona)}</span>`;
    }

    function contenuto(n) {
        const src = n.immagine && m.immagini[n.immagine.id];
        const img = src ? `<img class="nodo-img" src="${esc(src)}" style="width:${limita(+n.immagine.larghezza || 120, 24, 900)}px" alt="" draggable="false">` : '';
        const spunta = n.spunta != null ? `<span class="nodo-spunta${n.spunta ? ' fatta' : ''}" data-spunta title="Segna come fatto">${n.spunta ? '✓' : ''}</span>` : '';
        const segni = (n.nota ? `<span class="nodo-segno" data-segno-nota title="${esc(Ui.tronca(n.nota, 300))}">${ico('nota')}</span>` : '')
            + (n.link && /^https?:\/\//i.test(n.link) ? `<a class="nodo-segno" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer" title="${esc(n.link)}" data-link>${ico('collega')}</a>` : '')
            + (n.data ? `<span class="nodo-data">${esc(formattaData(daChiaveGiorno(n.data), true))}</span>` : '')
            + (m.panoramica && n.rif && n.rif.mappa ? `<span class="nodo-segno segno-origine" data-vai-origine title="Apri nella sua mappa">${ico('destra')}</span>` : '')
            + (!m.panoramica && n.inPanoramica ? `<span class="nodo-segno" title="Compare in «${Panoramica.NOME}»">${ico('mappa')}</span>` : '');
        const testo = Mappe.testoInHtml(n.testo) || '<span class="nodo-vuoto"></span>';
        return `${img}<div class="nodo-riga">${spunta}${iconaHtml(n.icona)}<div class="nodo-testo">${testo}</div>${segni}</div>`;
    }

    function stileElemento(el, s, conBordo) {
        const deco = [s.sottolineato && 'underline', s.barrato && 'line-through'].filter(Boolean).join(' ') || 'none';
        el.style.setProperty('--colore', s.colore);
        el.style.setProperty('--bordo', s.coloreBordo);
        el.style.setProperty('--riempimento', s.riempimento || 'transparent');
        el.style.setProperty('--spessore', (conBordo ? Math.max(0, +s.spessore || 0) : 0) + 'px');
        el.style.setProperty('--tratto', TRATTI[s.tratto] || 'solid');
        el.style.color = s.coloreTesto;
        el.style.fontSize = (14 * (+s.scala || 1)).toFixed(2) + 'px';
        el.style.fontWeight = s.grassetto ? '700' : '400';
        el.style.fontStyle = s.corsivo ? 'italic' : 'normal';
        el.style.textDecoration = deco;
        el.style.textAlign = s.allinea === 'sinistra' ? 'left' : s.allinea === 'destra' ? 'right' : 'center';
        el.style.minWidth = s.larghezzaMin ? s.larghezzaMin + 'px' : '';
        el.style.minHeight = s.altezzaMin ? s.altezzaMin + 'px' : '';
    }

    function stileEtichetta(e) {
        const t = Mappe.tema(m);
        const s = { scala: 0.8, ...(e.stile || {}) };
        const fondo = s.riempimento && s.riempimento !== 'nessuno' ? s.riempimento : null;
        return {
            ...s, riempimento: fondo,
            coloreTesto: s.coloreTesto || (fondo ? (Mappe.luminanza(fondo) > 0.45 ? '#1f1f24' : '#ffffff') : t.testo),
        };
    }

    function disegna({ contenuti = true } = {}) {
        if (!m.nodi[m.radice]) return;
        tela.style.setProperty('--sfondo-mappa', Mappe.tema(m).sfondo);
        const info = livelliEColori();
        if (st.focus && !m.nodi[st.focus]) st.focus = null;
        const cima = st.focus || m.radice;
        const tutti = [];
        const crea = id => {
            const n = m.nodi[id];
            const i = info.get(id) || { livello: 1, colore: Mappe.tema(m).radice };
            const s = Mappe.stile(m, n, i.livello, i.colore);
            const b = {
                id, n, s, livello: i.livello, colore: i.colore, sotto: s.forma === 'sottolineata',
                lato: !st.focus && n.genitore === m.radice ? n.lato : null, off: n.off || null, figli: [],
                fx: n.genitore || id === m.radice ? null : n.x, fy: n.genitore || id === m.radice ? null : n.y,
                modo: id === m.radice ? null : n.disposizione || null, fratelli: +n.distanzaFigli || null, prima: +n.distanzaPrima || null,
            };
            tutti.push(b);
            if (!n.chiuso || SOLA) b.figli = n.figli.filter(f => m.nodi[f]).map(crea);
            // Un raccordo vale se almeno uno dei fratelli che raccoglie è visibile accanto a lui
            b.figli.forEach(c => {
                const r = c.n.raccordo;
                const nodi = r && (r.nodi || []).filter(x => x !== c.id && b.figli.some(f => f.id === x && !f.n.raccordo));
                c.raccordo = nodi && nodi.length ? { nodi, graffa: !!r.graffa } : null;
            });
            return b;
        };
        alberoB = crea(cima);
        liberiB = st.focus ? [] : Mappe.radiciLibere(m).map(l => crea(l.id));

        // 1. Contenuti (solo dove sono cambiati)
        const visti = new Set(), etVisti = new Set();
        const inModifica = id => st.modifica && st.modifica.tipo === 'nodo' && st.modifica.id === id;
        tutti.forEach(b => {
            visti.add(b.id);
            let el = elementi.get(b.id);
            if (!el) {
                el = document.createElement('div');
                el.dataset.id = b.id;
                nodiEl.appendChild(el);
                elementi.set(b.id, el);
            }
            if (!inModifica(b.id) && contenuti) {
                const firma = JSON.stringify([b.n.testo, b.n.icona, b.n.immagine, b.n.nota, b.n.link, b.n.spunta, b.n.data, !!b.n.rif, !!b.n.inPanoramica]);
                if (el._firma !== firma) { el.innerHTML = contenuto(b.n); el._firma = firma; }
            }
            const conBordo = !['nessuna', 'sottolineata'].includes(b.s.forma);
            const fissa = +b.n.larghezza > 0;
            el.className = `nodo forma-${b.s.forma}${b.id === m.radice ? ' radice' : ''}${inModifica(b.id) ? ' in-modifica' : ''}${fissa ? ' larghezza-fissa' : ''}`;
            stileElemento(el, b.s, conBordo);
            // Larghezza scelta con la maniglia ◂▸: il testo va a capo dentro (senza, il nodo segue il testo)
            el.style.width = fissa ? limita(+b.n.larghezza, LARGHEZZA_NODO.min, LARGHEZZA_NODO.max) + 'px' : '';
            (b.n.etichette || []).forEach(e => {
                const chiave = b.id + ':' + e.id;
                etVisti.add(chiave);
                let ee = elEtichette.get(chiave);
                if (!ee) {
                    ee = document.createElement('div');
                    ee.className = 'mappa-etichetta';
                    ee.dataset.nodo = b.id;
                    ee.dataset.et = e.id;
                    nodiEl.appendChild(ee);
                    elEtichette.set(chiave, ee);
                }
                const inMod = st.modifica && st.modifica.tipo === 'etichetta' && st.modifica.chiave === chiave;
                if (!inMod && ee._testo !== e.testo) { ee.innerHTML = Mappe.testoInHtml(e.testo); ee._testo = e.testo; }
                const se = stileEtichetta(e);
                stileElemento(ee, { ...se, colore: b.colore, coloreBordo: b.colore, spessore: 0 }, false);
                ee.style.setProperty('--riempimento', se.riempimento || 'transparent');
                ee.classList.toggle('con-fondo', !!se.riempimento);
            });
        });
        // Immagini libere: un <img> per ognuna, con la sua larghezza (l'altezza viene dal rapporto salvato)
        const figVisti = new Set();
        tutti.forEach(b => (b.n.figure || []).forEach(f => {
            const src = m.immagini[f.img];
            if (!src) return;
            const chiave = b.id + ':' + f.id;
            figVisti.add(chiave);
            let fe = elFigure.get(chiave);
            if (!fe) {
                fe = document.createElement('img');
                fe.className = 'mappa-figura';
                fe.alt = '';
                fe.draggable = false;
                fe.dataset.nodo = b.id;
                fe.dataset.fig = f.id;
                nodiEl.appendChild(fe);
                elFigure.set(chiave, fe);
            }
            if (fe._src !== src) { fe.src = src; fe._src = src; }
            const w = limita(+f.larghezza || 160, 24, 1600);
            fe.style.width = w + 'px';
            fe.style.height = (w * (+f.rapporto || 0.75)) + 'px';
        }));
        elementi.forEach((el, id) => { if (!visti.has(id)) { el.remove(); elementi.delete(id); } });
        elEtichette.forEach((el, k) => { if (!etVisti.has(k)) { el.remove(); elEtichette.delete(k); } });
        elFigure.forEach((el, k) => { if (!figVisti.has(k)) { el.remove(); elFigure.delete(k); } });

        // 2. Misure (con le etichette, che allargano l'ingombro del nodo)
        tutti.forEach(b => {
            const el = elementi.get(b.id);
            b.w = el.offsetWidth;
            b.h = el.offsetHeight;
            b.ext = { alto: 0, basso: b.h, sx: 0, dx: b.w };
            b.et = (b.n.etichette || []).map(e => {
                const ee = elEtichette.get(b.id + ':' + e.id);
                const w = ee.offsetWidth, h = ee.offsetHeight;
                const x = b.w / 2 + e.dx - w / 2, y = b.h / 2 + e.dy - h / 2;
                b.ext.alto = Math.min(b.ext.alto, y); b.ext.basso = Math.max(b.ext.basso, y + h);
                b.ext.sx = Math.min(b.ext.sx, x); b.ext.dx = Math.max(b.ext.dx, x + w);
                return { e, ee, x, y, w, h };
            });
            // Le immagini libere allargano l'ingombro come le etichette: la disposizione ne tiene conto. Quelle fluttuanti
            // no: seguono il nodo ma non spostano gli altri nodi; contano solo per i limiti della mappa (extTutto)
            b.extTutto = { ...b.ext };
            const allarga = (e, x, y, w, h) => {
                e.alto = Math.min(e.alto, y); e.basso = Math.max(e.basso, y + h);
                e.sx = Math.min(e.sx, x); e.dx = Math.max(e.dx, x + w);
            };
            b.fig = (b.n.figure || []).map(f => {
                const fe = elFigure.get(b.id + ':' + f.id);
                if (!fe) return null;
                const w = limita(+f.larghezza || 160, 24, 1600), h = w * (+f.rapporto || 0.75);
                const x = b.w / 2 + (+f.dx || 0) - w / 2, y = b.h / 2 + (+f.dy || 0) - h / 2;
                if (!f.fluttuante) allarga(b.ext, x, y, w, h);
                allarga(b.extTutto, x, y, w, h);
                fe.classList.toggle('fluttuante', !!f.fluttuante);
                return { f, fe, x, y, w, h };
            }).filter(Boolean);
        });

        // 3. Disposizione
        let tipo = m.disposizione;
        if (st.focus) {
            // Il ramo isolato tiene la sua disposizione; in orizzontale cresce dal lato dov'era nella mappa
            tipo = 'orizzontale';
            const mf = modoEffettivo(cima);
            alberoB.modo = mf === 'orizzontale' ? st.focusLato || 'destra' : mf;
        }
        const direzione = m.direzione;
        Disposizione.calcola(alberoB, liberiB, { tipo, direzione, spaziatura: m.spaziatura, fratelli: m.spaziaturaFratelli });

        // 4. Posizioni
        geo.clear();
        tutti.forEach(b => {
            geo.set(b.id, b);
            const el = elementi.get(b.id);
            el.style.left = b.x + 'px';
            el.style.top = b.y + 'px';
            b.et.forEach(x => { x.ee.style.left = (b.x + x.x) + 'px'; x.ee.style.top = (b.y + x.y) + 'px'; });
            b.fig.forEach(x => { x.fe.style.left = (b.x + x.x) + 'px'; x.fe.style.top = (b.y + x.y) + 'px'; });
        });

        disegnaLinee();
        disegnaExtra();
        aggiornaSelezione();
        aggiornaFocus();
        if (st.cerca.aperta) evidenziaRicerca();
    }

    // Disposizione con cui si dispongono i figli del nodo: la sua, quella del primo antenato che ne ha una
    // (i figli di un nodo radiale vanno in orizzontale) o quella della mappa
    function modoEffettivo(id) {
        let primo = true;
        for (let x = m.nodi[id]; x && x.id !== m.radice; x = m.nodi[x.genitore]) {
            if (x.disposizione) return !primo && x.disposizione === 'radiale' ? 'orizzontale' : x.disposizione;
            primo = false;
        }
        if (m.disposizione === 'radiale' && id !== m.radice) return 'orizzontale';
        if (m.disposizione === 'orizzontale' && id === m.radice && ['destra', 'sinistra'].includes(m.direzione)) return m.direzione;
        return m.disposizione;
    }

    function tratteggio(tipo, w) {
        if (tipo === 'trattini') return ` stroke-dasharray="${(w * 3.5).toFixed(1)} ${(w * 2.5).toFixed(1)}"`;
        if (tipo === 'punti') return ` stroke-dasharray="0.1 ${(Math.max(w, 1.5) * 2.4).toFixed(1)}"`;
        return '';
    }

    // Icone delle forme e dei tratti delle linee (pannelli Stile e Tema e linee)
    function iconaLinea(tipo) {
        const d = {
            curva: '<path d="M2 13 C13 13 13 3 24 3" fill="none" stroke="currentColor" stroke-width="2"/>',
            ortogonale: '<path d="M2 13 H13 V3 H24" fill="none" stroke="currentColor" stroke-width="2"/>',
            arrotondata: '<path d="M2 13 H8 Q13 13 13 9 V7 Q13 3 18 3 H24" fill="none" stroke="currentColor" stroke-width="2"/>',
            dritta: '<path d="M2 13 L24 3" fill="none" stroke="currentColor" stroke-width="2"/>',
            auto: '<path d="M2 5 L10 6.2 L10 11.8 L2 13 Z M10 6.8 L17 7.6 L17 10.4 L10 11.2 Z M17 8 L25 8.5 L25 9.5 L17 10 Z" fill="currentColor"/>',
            affusolata: '<path d="M2 5.5 L25 8.5 L25 9.5 L2 12.5 Z" fill="currentColor"/>',
            pieno: '<path d="M2 9 H25" stroke="currentColor" stroke-width="2.5"/>',
            trattini: '<path d="M2 9 H25" stroke="currentColor" stroke-width="2.5" stroke-dasharray="5 3"/>',
            punti: '<path d="M3 9 H25" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 5"/>',
        }[tipo] || '';
        return `<svg class="icona-linea" viewBox="0 0 27 16" aria-hidden="true">${d}</svg>`;
    }

    // Nodi da cui parte una linea in più verso id: fratelli raccolti (raccordo) e altri genitori (figlio comune)
    function partenze(id) {
        const n = id && m.nodi[id];
        return n ? [...((n.raccordo || {}).nodi || []), ...(n.legami || [])] : [];
    }

    // Linee in più verso un nodo (raccordi e figli comuni): arrivano dallo stesso lato della linea dal genitore
    // se il nodo di partenza sta tutto da quella parte, altrimenti dal lato più comodo
    function versoLegame(q, f) {
        const versi = { d: q.x + q.w < f.x, s: q.x > f.x + f.w, giu: q.y + q.h < f.y, su: q.y > f.y + f.h };
        if (versi[f.dir]) return f;
        return { ...f, dir: ['d', 's', 'giu', 'su'].find(v => versi[v]) || null };
    }

    function disegnaLinee() {
        const parti = [];
        const frecce = new Map();
        // Un marcatore per tipo e colore: semplice = punta aperta, piena = triangolo
        const freccia = (tipo, col) => { const id = `fr-${tipo}-${col.slice(1)}`; frecce.set(id, { tipo, col }); return `url(#${id})`; };
        archi = [];
        const arrivo = new Map();   // spessore con cui la linea arriva al nodo: continua nella sua sottolineatura
        const spessori = (c, livello) => {
            if (c.tratto === 'auto') {
                const w1 = Mappe.spessoreLinea(m, livello);
                return [Math.max(w1, Mappe.spessoreLinea(m, livello - 1)), w1];
            }
            if (c.tratto === 'affusolata') return [c.spessore, Math.max(0.8, c.spessore * 0.35)];
            return [c.spessore, c.spessore];
        };
        const colpo = (d, id, da) => `<path d="${d}" class="arco-colpo" data-arco="${id}"${da ? ` data-arco-da="${da}"` : ''}/>`;
        // Una linea: nastro che si assottiglia o tratto, con frecce, alone se è scelta e fascia per prenderla col mouse
        const traccia = (arc, c, w0, w1, id, da, scelta) => {
            const marcatori = (c.frecciaInizio !== 'nessuna' ? ` marker-start="${freccia(c.frecciaInizio, c.colore)}"` : '')
                + (c.frecciaFine !== 'nessuna' ? ` marker-end="${freccia(c.frecciaFine, c.colore)}"` : '');
            if (scelta) parti.push(`<path d="${arc.d}" class="arco-scelto" stroke-width="${(Math.max(w0, w1) + 10).toFixed(1)}"/>`);
            if ((c.tratto === 'auto' || c.tratto === 'affusolata') && arc.c1) {
                parti.push(`<path d="${Disposizione.nastro(arc, w0, w1)}" fill="${c.colore}"/>`);
                if (marcatori) parti.push(`<path d="${arc.d}" fill="none" stroke="none"${marcatori}/>`);
            } else {
                const w = (w0 + w1) / 2;
                const tratto = c.tratto === 'trattini' || c.tratto === 'punti' ? c.tratto : 'pieno';
                parti.push(`<path d="${arc.d}" fill="none" stroke="${c.colore}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${tratteggio(tratto, w)}${marcatori}/>`);
            }
            parti.push(colpo(arc.d, id, da));
            archi.push({ d: arc.d, colore: c.colore, w: (w0 + w1) / 2 });
        };
        // Graffa lungo l'ingombro dei fratelli raccolti, con la linea dalla punta al raccordo
        const graffa = (f, membri, c, w, scelta) => {
            const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            membri.forEach(q => {
                bb.x0 = Math.min(bb.x0, q.x + q.blocco.x0); bb.y0 = Math.min(bb.y0, q.y + q.blocco.y0);
                bb.x1 = Math.max(bb.x1, q.x + q.blocco.x1); bb.y1 = Math.max(bb.y1, q.y + q.blocco.y1);
            });
            const fc = Disposizione.centro(f);
            const verso = ['d', 's', 'giu', 'su'].includes(f.dir) ? f.dir : fc.x > bb.x1 ? 'd' : fc.x < bb.x0 ? 's' : fc.y > bb.y1 ? 'giu' : 'su';
            const g = 10;
            const [a, b] = verso === 'd' ? [{ x: bb.x1 + g, y: bb.y0 }, { x: bb.x1 + g, y: bb.y1 }]
                : verso === 's' ? [{ x: bb.x0 - g, y: bb.y0 }, { x: bb.x0 - g, y: bb.y1 }]
                : verso === 'giu' ? [{ x: bb.x0, y: bb.y1 + g }, { x: bb.x1, y: bb.y1 + g }]
                : [{ x: bb.x0, y: bb.y0 - g }, { x: bb.x1, y: bb.y0 - g }];
            const gr = Disposizione.graffa(a, b, verso, 16);
            const pt = gr.punta, q = Disposizione.attacco(f, { d: 's', s: 'd', giu: 'su', su: 'giu' }[verso]);
            const f1 = v => v.toFixed(1);
            const coda = verso === 'd' || verso === 's'
                ? `M${f1(pt.x)},${f1(pt.y)} C${f1((pt.x + q.x) / 2)},${f1(pt.y)} ${f1((pt.x + q.x) / 2)},${f1(q.y)} ${f1(q.x)},${f1(q.y)}`
                : `M${f1(pt.x)},${f1(pt.y)} C${f1(pt.x)},${f1((pt.y + q.y) / 2)} ${f1(q.x)},${f1((pt.y + q.y) / 2)} ${f1(q.x)},${f1(q.y)}`;
            const d = gr.d + ' ' + coda;
            if (scelta) parti.push(`<path d="${d}" class="arco-scelto" stroke-width="${(w + 10).toFixed(1)}"/>`);
            const tratto = c.tratto === 'trattini' || c.tratto === 'punti' ? c.tratto : 'pieno';
            const punta = c.frecciaFine !== 'nessuna' ? ` marker-end="${freccia(c.frecciaFine, c.colore)}"` : '';
            parti.push(`<path d="${d}" fill="none" stroke="${c.colore}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${tratteggio(tratto, w)}${punta}/>`);
            parti.push(colpo(d, f.id));
            archi.push({ d, colore: c.colore, w });
        };
        const visita = p => p.figli.forEach(f => {
            const c = Mappe.collegamento(m, f.n, f.colore);
            const [w0, w1] = spessori(c, f.livello);
            arrivo.set(f.id, w1);
            const scelto = st.arco === f.id;
            if (f.raccordo) {
                // Raccordo: niente linea dal genitore, ma una da ogni fratello raccolto (o una graffa su tutti)
                const membri = f.raccordo.nodi.map(x => geo.get(x)).filter(Boolean);
                if (f.raccordo.graffa) graffa(f, membri, c, Math.max(1.5, w1), scelto);
                else membri.forEach(q => traccia(Disposizione.arco(q, versoLegame(q, f), c.forma), c, w0, w1, f.id, q.id, scelto));
            } else traccia(Disposizione.arco(p, f, c.forma, f.n.piega, f.n.percorso), c, w0, w1, f.id, null, scelto && !st.arcoDa);
            // Figlio comune: una linea anche da ognuno degli altri genitori, con lo stesso stile
            (f.n.legami || []).forEach(pid => {
                const q = geo.get(pid);
                if (q && q !== p) traccia(Disposizione.arco(q, versoLegame(q, f), c.forma), c, w0, w1, f.id, pid, scelto && st.arcoDa === pid);
            });
            visita(f);
        });
        [alberoB, ...liberiB].forEach(visita);
        // Linea sotto i nodi sottolineati: continua quella che arriva, salvo colore, tratto e spessore scelti solo per lei
        geo.forEach(b => {
            if (!b.sotto) return;
            const so = b.s.sottolineatura || {};
            const w = +so.spessore > 0 ? limita(+so.spessore, 0.5, 20) : Math.max(1.2, arrivo.get(b.id) || Mappe.spessoreLinea(m, b.livello));
            const col = Mappe.coloreValido(so.colore) ? so.colore : b.s.coloreBordo;
            const tr = ['pieno', 'trattini', 'punti'].includes(so.tratto) ? so.tratto : b.s.tratto;
            parti.push(`<path d="M${b.x.toFixed(1)},${(b.y + b.h).toFixed(1)} H${(b.x + b.w).toFixed(1)}" fill="none" stroke="${col}" stroke-width="${w.toFixed(2)}" stroke-linecap="round"${tratteggio(tr, w)}/>`);
            archi.push({ d: `M${b.x},${b.y + b.h} H${b.x + b.w}`, colore: col, w });
        });
        archiEl.innerHTML = parti.join('');

        // Relazioni tra rami
        const rel = [];
        const etRel = [];
        m.relazioni.forEach(r => {
            const g = geometriaRelazione(r);
            if (!g) return;
            const col = Mappe.coloreValido(r.colore) ? r.colore : (geo.get(r.da) || {}).colore || '#888888';
            const sel = st.rel === r.id;
            rel.push(`<path d="${g.d}" fill="none" stroke="${col}" stroke-width="${sel ? 3 : 2}" stroke-linecap="round"${tratteggio(r.tratto || 'punti', 2)}`
                + `${r.frecciaFine !== false ? ` marker-end="${freccia('piena', col)}"` : ''}${r.frecciaInizio ? ` marker-start="${freccia('piena', col)}"` : ''}/>`
                + `<path d="${g.d}" class="rel-colpo" data-rel="${r.id}"/>`);
            if (r.testo) etRel.push(`<div class="mappa-etichetta-rel${sel ? ' selezionata' : ''}" data-rel="${r.id}" style="left:${g.h.x}px;top:${g.h.y}px;--colore:${col}">${Mappe.testoInHtml(r.testo)}</div>`);
        });
        relEl.innerHTML = rel.join('');
        defsEl.innerHTML = [...frecce].map(([id, { tipo, col }]) => `<marker id="${id}" viewBox="0 0 10 10" refX="${tipo === 'semplice' ? 8 : 8.5}" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">`
            + (tipo === 'semplice'
                ? `<path d="M1.5,1.5 L8.5,5 L1.5,8.5" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
                : `<path d="M0,0 L10,5 L0,10 z" fill="${col}"/>`) + '</marker>').join('');
        htmlEtichetteRel = etRel.join('');
    }

    // Collegamento tra rami: curva (con il punto di controllo c, spostato a mano in r.curva) o, se ha i punti di
    // passaggio (r.percorso, nel riferimento dei due centri), linea morbida che passa da tutti. arc = la curva in tratti
    // di Bézier, per prenderla col mouse; h = dove va il testo
    function geometriaRelazione(r) {
        const A = geo.get(r.da), B = geo.get(r.a);
        if (!A || !B) return null;
        const ca = Disposizione.centro(A), cb = Disposizione.centro(B);
        if (Disposizione.percorsoValido(r.percorso)) {
            const punti = Disposizione.daPercorso(ca, cb, r.percorso);
            const p0 = Disposizione.bordoVerso(A, punti[0]), p1 = Disposizione.bordoVerso(B, punti[punti.length - 1]);
            const arc = Disposizione.curvaPer(p0, p1, punti);
            const k = punti.length % 2 ? punti[(punti.length - 1) / 2] : null;
            const g = arc.segmenti[Math.floor(arc.segmenti.length / 2)];
            const h = k || Disposizione.puntoBezier(g.a, g.c1, g.c2, g.b, 0.5);
            return { d: arc.d, p0, p1, h, ca, cb, arc, punti };
        }
        const dx = cb.x - ca.x, dy = cb.y - ca.y, l = Math.hypot(dx, dy) || 1;
        const base = { x: (ca.x + cb.x) / 2 - dy / l * l * 0.18, y: (ca.y + cb.y) / 2 + dx / l * l * 0.18 };
        const c = r.curva ? { x: base.x + r.curva.dx, y: base.y + r.curva.dy } : base;
        const p0 = Disposizione.bordoVerso(A, c), p1 = Disposizione.bordoVerso(B, c);
        const h = { x: 0.25 * p0.x + 0.5 * c.x + 0.25 * p1.x, y: 0.25 * p0.y + 0.5 * c.y + 0.25 * p1.y };
        // La stessa curva come Bézier cubica
        const arc = { a: p0, b: p1, c1: { x: p0.x + (c.x - p0.x) * 2 / 3, y: p0.y + (c.y - p0.y) * 2 / 3 }, c2: { x: p1.x + (c.x - p1.x) * 2 / 3, y: p1.y + (c.y - p1.y) * 2 / 3 } };
        return { d: `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`, p0, p1, c, h, base, ca, cb, arc, punti: [] };
    }

    // Bolle dei rami chiusi (quanti nodi nascondono) ed etichette delle relazioni
    function disegnaExtra() {
        const bolle = [];
        geo.forEach(b => {
            if (SOLA || !b.n.chiuso || !b.n.figli.length) return;
            const conta = Mappe.discendenti(m, b.id).length;
            const yc = b.sotto ? b.y + b.h - 10 : b.y + b.h / 2 - 10;
            const pos = b.verso === 's' ? { x: b.x - 30, y: yc } : b.verso === 'giu' || b.verso === 'lineare' ? { x: b.x + b.w / 2 - 12, y: b.y + b.h + 6 }
                : b.verso === 'su' ? { x: b.x + b.w / 2 - 12, y: b.y - 26 } : { x: b.x + b.w + 6, y: yc };
            bolle.push(`<button type="button" class="nodo-bolla" data-bolla="${b.id}" style="left:${pos.x}px;top:${pos.y}px;--colore:${b.colore}" title="Apri il ramo (${conta} nodi)">${conta}</button>`);
        });
        extraEl.innerHTML = bolle.join('') + htmlEtichetteRel;
    }

    // ---- Vista: spostamento e zoom --------------------------------------------------------------------

    function applicaVista() {
        const v = st.vista;
        mondo.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
        $('.mappa-zoom-valore', radiceEl).textContent = Math.round(v.zoom * 100) + '%';
        editorEl.style.setProperty('--zoom', v.zoom);
        if (m.griglia && m.griglia.attiva) mostraGriglia();
        posizionaSopra();
    }

    function limitiVisibili() {
        const b = Disposizione.limiti([alberoB, ...liberiB].filter(Boolean));
        return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, w: b.x1 - b.x0, h: b.y1 - b.y0 };
    }

    function adatta(massimo = 1.1) {
        const r = tela.getBoundingClientRect();
        const b = limitiVisibili();
        const z = limita(Math.min(Math.max(r.width - 80, r.width * 0.7) / Math.max(b.w, 1), Math.max(r.height - 80, r.height * 0.7) / Math.max(b.h, 1), massimo), 0.12, 3);
        st.vista = { zoom: z, x: (r.width - b.w * z) / 2 - b.x0 * z, y: (r.height - b.h * z) / 2 - b.y0 * z };
        applicaVista();
        salvaVistaPresto();
    }

    function zoomA(z, cx, cy) {
        const r = tela.getBoundingClientRect();
        if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
        const v = st.vista;
        z = limita(z, 0.12, 3);
        const wx = (cx - v.x) / v.zoom, wy = (cy - v.y) / v.zoom;
        st.vista = { zoom: z, x: cx - wx * z, y: cy - wy * z };
        applicaVista();
        salvaVistaPresto();
    }

    function aMondo(cx, cy) {
        const r = tela.getBoundingClientRect();
        return { x: (cx - r.left - st.vista.x) / st.vista.zoom, y: (cy - r.top - st.vista.y) / st.vista.zoom };
    }
    function aSchermo(x, y) { return { x: x * st.vista.zoom + st.vista.x, y: y * st.vista.zoom + st.vista.y }; }

    // Porta il nodo dentro la finestra se ne è fuori
    function mostraNodo(id, centra = false) {
        const b = geo.get(id);
        if (!b) return;
        const r = tela.getBoundingClientRect();
        const a = aSchermo(b.x, b.y), z = st.vista.zoom;
        const margine = 60;
        const fuori = a.x < margine || a.y < margine || a.x + b.w * z > r.width - margine || a.y + b.h * z > r.height - margine;
        if (!fuori && !centra) return;
        st.vista.x += r.width / 2 - (a.x + b.w * z / 2);
        st.vista.y += r.height / 2 - (a.y + b.h * z / 2);
        applicaVista();
        salvaVistaPresto();
    }

    // ---- Selezione e livello sopra (maniglie, finestrelle) ------------------------------------------------

    function seleziona(id, { aggiungi = false } = {}) {
        if (st.modifica) concludiModifica();
        if (!aggiungi) { st.sel.clear(); st.popDispMulti = false; st.popDistanza = false; }
        st.punto = null;
        if (id && m.nodi[id]) {
            if (aggiungi && st.sel.has(id)) st.sel.delete(id); else st.sel.add(id);
        }
        st.attivo = id && st.sel.has(id) ? id : [...st.sel].pop() || null;
        st.rel = null;
        st.et = null;
        st.fig = null;
        if (st.popDisp !== st.attivo) st.popDisp = null;
        if (st.arco) { st.arco = st.arcoDa = null; disegnaLinee(); }
        aggiornaSelezione();
        aggiornaPannello();
    }

    function selezionaRelazione(id) {
        st.sel.clear(); st.attivo = null; st.et = null; st.fig = null; st.arco = st.arcoDa = null; st.rel = id; st.punto = null;
        disegnaLinee(); disegnaExtra(); aggiornaSelezione(); aggiornaPannello();
    }

    function selezionaEtichetta(nodo, id) {
        const ridisegna = !!st.arco;
        st.sel.clear(); st.attivo = null; st.rel = null; st.fig = null; st.arco = st.arcoDa = null; st.et = { nodo, id };
        if (ridisegna) disegnaLinee();
        aggiornaSelezione(); aggiornaPannello();
    }

    // Un'immagine libera: si sposta trascinandola, si ingrandisce dall'angolo; il suo nodo resta il riferimento
    function selezionaFigura(nodo, id) {
        if (st.modifica) concludiModifica();
        const ridisegna = !!st.arco;
        st.sel.clear(); st.attivo = null; st.rel = null; st.et = null; st.arco = st.arcoDa = null; st.popDisp = null; st.fig = { nodo, id };
        if (ridisegna) disegnaLinee();
        aggiornaSelezione(); aggiornaPannello();
    }

    function figura(ref) {
        const n = ref && m.nodi[ref.nodo];
        return (n && (n.figure || []).find(f => f.id === ref.id)) || null;
    }

    // Una linea tra un nodo e il suo genitore: si sceglie col clic e si modifica nel pannello Stile
    function selezionaArco(id, da = null) {
        if (st.modifica) concludiModifica();
        st.sel.clear(); st.attivo = null; st.rel = null; st.et = null; st.fig = null; st.popDisp = null; st.arco = id; st.arcoDa = da || null; st.punto = null;
        disegnaLinee();
        aggiornaSelezione();
        if (st.pannello !== 'stile') {
            st.pannello = 'stile';
            try { localStorage.setItem(CHIAVE_PANNELLO, 'stile'); } catch (e) { /* solo comodità */ }
        }
        aggiornaPannello(true);
        requestAnimationFrame(posizionaSopra);
    }

    function aggiornaSelezione() {
        elementi.forEach((el, id) => {
            el.classList.toggle('selezionato', st.sel.has(id));
            el.classList.toggle('evidenziato', !!opzioni.evidenzia && id === opzioni.evidenzia);
        });
        elEtichette.forEach(el => el.classList.toggle('selezionata', !!st.et && el.dataset.nodo === st.et.nodo && el.dataset.et === st.et.id));
        elFigure.forEach(el => el.classList.toggle('selezionata', !!st.fig && el.dataset.nodo === st.fig.nodo && el.dataset.fig === st.fig.id));
        posizionaSopra();
    }

    function posizionaSopra() {
        if (!st.vista) return;
        // Mentre trascini il cursore della distanza nella barra dei nodi scelti la barra resta com'è (ridisegnandola il
        // cursore sparirebbe da sotto il puntatore); si aggiorna quando lo lasci
        if (sopraEl.contains(document.activeElement) && document.activeElement.matches('[data-distanza-scelti]')) return;
        const z = st.vista.zoom;
        const parti = [];
        const b = st.attivo && st.sel.size === 1 && !st.modifica && !st.collegando ? geo.get(st.attivo) : null;
        if (b) {
            const a = aSchermo(b.x, b.y), w = b.w * z, h = b.h * z;
            const cy = a.y + h / 2;
            // Il + sta dal lato dove crescono i figli, il ▾ dal lato opposto
            const v = b.verso;
            const sotto = v === 'giu' || v === 'lineare';
            const fuori = v === 's' ? { x: a.x - 16, y: cy } : sotto ? { x: a.x + w / 2, y: a.y + h + 16 }
                : v === 'su' ? { x: a.x + w / 2, y: a.y - 16 } : { x: a.x + w + 16, y: cy };
            const dentro = v === 's' ? { x: a.x + w + 16, y: cy } : sotto ? { x: a.x - 16, y: a.y + h + 14 } : { x: a.x - 16, y: cy };
            const man = (k, p, testo, titolo) => `<button type="button" class="maniglia${st.popDisp && k === 'disposizione' ? ' attiva' : ''}" data-m="${k}" style="left:${p.x}px;top:${p.y}px" title="${esc(titolo)}" aria-label="${esc(titolo)}">${testo}</button>`;
            parti.push(man('menu', { x: a.x - 12, y: a.y - 12 }, '⋯', 'Altre azioni'));
            parti.push(man('etichetta', { x: a.x + w + 12, y: a.y - 12 }, 'T', 'Aggiungi etichetta'));
            parti.push(man('disposizione', v === 'su' ? { x: a.x + w / 2, y: a.y + h + 14 } : { x: a.x + w / 2, y: a.y - 14 }, ico('ramo'), 'Disposizione dei figli di questo nodo'));
            parti.push(man('figlio', fuori, '+', 'Nuovo nodo figlio (Tab)'));
            parti.push(man('relazione', { x: a.x + w + 12, y: a.y + h + 12 }, '↗', 'Collega a un altro nodo'));
            parti.push(man('larghezza', { x: a.x + w - Math.min(26, w / 4), y: a.y + h + 14 }, '<svg class="freccette" viewBox="0 0 16 10" aria-hidden="true"><path d="M1 5 L6 1 V9 Z M15 5 L10 1 V9 Z" fill="currentColor"/></svg>',
                b.n.larghezza ? `Larghezza ${Math.round(b.n.larghezza)} px: trascina per cambiarla · doppio clic: automatica` : 'Trascina per scegliere la larghezza del nodo (il testo va a capo)'));
            if (b.n.figli.length && b.id !== (st.focus || m.radice)) {
                parti.push(man('chiudi', dentro, b.n.chiuso ? '▸' : '▾', b.n.chiuso ? 'Apri il ramo (Spazio)' : 'Chiudi il ramo (Spazio)'));
            }
            if (st.popDisp === b.id) {
                const altezza = tela.getBoundingClientRect().height;
                const sopra = a.y + h + 300 > altezza && a.y > 300;
                parti.push(popDisposizione(b.id, { x: a.x + w / 2, y: sopra ? a.y - 28 : a.y + h + 30 }, sopra));
            }
        }
        // Nodo in modifica: la barra per formattare la parte di testo selezionata
        const inMod = st.modifica && st.modifica.tipo === 'nodo' ? geo.get(st.modifica.id) : null;
        if (inMod) {
            const a = aSchermo(inMod.x, inMod.y);
            parti.push(barraTesto({ x: Math.max(4, a.x), y: Math.max(4, a.y - 38) }));
        }
        // Linea scelta (un ramo o un collegamento): i suoi punti di passaggio, da spostare (doppio clic per toglierli), e a
        // metà di ogni tratto un pallino vuoto per aggiungerne uno
        const linea = !st.modifica && lineaScelta();
        if (linea) {
            const scelto = puntoScelto();
            const pieni = linea.punti.map(q => aSchermo(q.x, q.y));
            // Prima i pallini vuoti (sotto), senza quelli troppo vicini a un punto: non devono coprire i punti veri
            const tratti = linea.punti.length ? linea.arc.segmenti : [linea.curva];
            tratti.forEach((g, i) => {
                const q = Disposizione.puntoBezier(g.a, g.c1, g.c2, g.b, 0.5), ps = aSchermo(q.x, q.y);
                if (pieni.some(p => Math.hypot(p.x - ps.x, p.y - ps.y) < 18)) return;
                parti.push(`<span class="maniglia-punto nuovo" data-punto-nuovo="${i}" style="left:${ps.x}px;top:${ps.y}px" title="Trascina per aggiungere un punto di passaggio"></span>`);
            });
            pieni.forEach((ps, i) => {
                parti.push(`<span class="maniglia-punto${i === scelto ? ' scelto' : ''}" data-punto="${i}" style="left:${ps.x}px;top:${ps.y}px" title="Trascina per spostare il punto · clic per sceglierlo (poi Canc o × per toglierlo) · doppio clic o clic destro per toglierlo"></span>`);
            });
            if (scelto != null) {
                const ps = pieni[scelto];
                parti.push(`<button type="button" class="punto-togli" data-punto-togli="${scelto}" style="left:${ps.x + 15}px;top:${ps.y - 15}px" title="Togli questo punto (Canc)" aria-label="Togli questo punto">${ico('chiudi')}</button>`);
            }
        }
        // Più nodi scelti: figlio comune (linee da tutti) o graffa che li raccoglie. La barra sta ferma in alto al centro
        // della mappa, così non copre i nodi da scegliere
        const scelti = !st.modifica && !st.collegando && st.sel.size > 1 ? [...st.sel].map(id => geo.get(id)).filter(Boolean) : [];
        if (scelti.length > 1) {
            const fratelli = sonoFratelli([...st.sel]);
            const allineabili = daAllineare();
            const distanziabili = bersagliDistanza().length > 0;
            if (!distanziabili) st.popDistanza = false;
            parti.push(`<div class="mappa-pop pop-multipla in-alto" data-pop="multi">
                <span class="pop-titolo">${st.sel.size} nodi</span>
                ${allineabili ? `<span class="pop-allinea" title="${allineabili.fermi.length ? 'Allinea i nodi in disposizione libera a quelli che non si spostano (per esempio la radice)' : 'Allinea i nodi scelti tra di loro (l\'altezza non cambia)'}">
                    <span class="pop-etichetta">Allinea</span>
                    ${ALLINEAMENTI.map(([v, t]) => `<button type="button" data-allinea="${v}" title="Allinea ${t}" aria-label="Allinea ${t}">${iconaAllinea(v)}</button>`).join('')}
                </span>` : ''}
                <button type="button" class="btn btn-secondario btn-piccolo" data-multi="figlio" title="Un nodo nuovo, figlio di tutti i nodi scelti">${ico('piu')}Figlio comune</button>
                <button type="button" class="btn btn-secondario btn-piccolo" data-multi="graffa" ${fratelli ? 'title="Una graffa raccoglie i nodi scelti e li porta a un nodo nuovo"' : 'disabled title="La graffa raccoglie nodi con lo stesso genitore"'}><b class="segno-graffa">}</b>Graffa</button>
                <button type="button" class="btn btn-secondario btn-piccolo" data-multi="flashcard" title="Le flashcard di questi nodi, scritte dall'IA">${ico('carte')}Flashcard</button>
                <button type="button" class="btn btn-secondario btn-piccolo${st.popDispMulti ? ' attivo' : ''}" data-multi="disposizione" aria-expanded="${st.popDispMulti}" title="Disposizione dei figli di tutti i nodi scelti, in un colpo solo">${ico('ramo')}Disposizione</button>
                ${distanziabili ? `<button type="button" class="btn btn-secondario btn-piccolo${st.popDistanza ? ' attivo' : ''}" data-multi="distanza" aria-expanded="${!!st.popDistanza}" title="Allontana o avvicina solo questi nodi: restano allineati e i loro rami li seguono">${iconaDistanza()}Distanza</button>` : ''}
                ${st.popDistanza ? controlliDistanzaScelti(true) : ''}
                ${st.popDispMulti ? griglieDisposizioneMulti() : ''}
            </div>`);
        }
        if (st.rel) {
            const r = m.relazioni.find(x => x.id === st.rel);
            const g = r && geometriaRelazione(r);
            if (g) parti.push(popRelazione(r, aSchermo(g.h.x, g.h.y)));
        }
        if (st.et) {
            const ee = elEtichette.get(st.et.nodo + ':' + st.et.id);
            const n = m.nodi[st.et.nodo];
            const e = n && n.etichette.find(x => x.id === st.et.id);
            if (ee && e && !st.modifica) {
                const r = ee.getBoundingClientRect(), rt = tela.getBoundingClientRect();
                parti.push(popEtichetta(e, { x: r.left - rt.left + r.width / 2, y: r.bottom - rt.top + 10 }));
            }
        }
        if (st.fig && !st.modifica) {
            const fe = elFigure.get(st.fig.nodo + ':' + st.fig.id);
            if (fe) {
                const r = fe.getBoundingClientRect(), rt = tela.getBoundingClientRect();
                const x1 = r.right - rt.left, y1 = r.bottom - rt.top;
                parti.push(`<span class="maniglia-figura" data-ridimensiona-figura style="left:${x1}px;top:${y1}px" title="Trascina per cambiare la grandezza"></span>`);
                // La finestrella va dal lato opposto al nodo, per non coprirlo
                const f = figura(st.fig);
                const sopra = f && f.dy < 0 && r.top - rt.top > 70;
                parti.push(popFigura({ x: r.left - rt.left + r.width / 2, y: sopra ? r.top - rt.top - 12 : y1 + 14 }, sopra));
            }
        }
        sopraEl.innerHTML = parti.join('');
        if (inMod) segnaFormatiAttivi();
    }

    function popFigura(p, sopra = false) {
        const f = figura(st.fig) || {};
        return `<div class="mappa-pop${sopra ? ' sopra' : ''}" data-pop="fig" style="left:${p.x}px;top:${p.y}px">
            <div class="mappa-pop-riga">
                ${f.fluttuante ? '' : `<button type="button" data-fig-az="fluttuante" title="Occupa spazio: i nodi le fanno posto. Clic per renderla libera (segue il nodo, non sposta i nodi)">${ico('collega')}</button>`}
                <button type="button" data-fig-az="ingrandisci" title="Guarda l'immagine ingrandita">${ico('occhio')}</button>
                <button type="button" data-fig-az="piu" title="Più grande">+</button>
                <button type="button" data-fig-az="meno" title="Più piccola">−</button>
                <button type="button" data-fig-az="dentro" title="Mettila dentro il nodo">${ico('immagine')}</button>
                <button type="button" class="pericolo" data-fig-az="elimina" title="Elimina l'immagine (Canc)">${ico('cestino')}</button>
            </div>
        </div>`;
    }

    function sceltaColori(attributo, attuale, { nessuno = false, auto = false } = {}) {
        return `<div class="mappa-colori">
            ${auto ? `<button type="button" class="colore-auto${!attuale ? ' attivo' : ''}" ${attributo}="" title="Automatico">A</button>` : ''}
            ${nessuno ? `<button type="button" class="colore-nessuno${attuale === 'nessuno' ? ' attivo' : ''}" ${attributo}="nessuno" title="Nessuno"></button>` : ''}
            ${COLORI.map(c => `<button type="button" style="--c:${c}" class="${attuale === c ? 'attivo' : ''}" ${attributo}="${c}" title="${c}"></button>`).join('')}
            <label class="colore-libero" title="Altro colore"><input type="color" ${attributo}-libero value="${Mappe.coloreValido(attuale) ? attuale : '#5b4ff5'}"></label>
        </div>`;
    }

    function popRelazione(r, p) {
        const t = r.tratto || 'punti';
        return `<div class="mappa-pop" data-pop="rel" style="left:${p.x}px;top:${p.y + 18}px">
            <input type="text" data-rel-testo value="${esc(r.testo || '')}" placeholder="Testo sul collegamento" maxlength="200">
            <div class="mappa-pop-riga">
                <button type="button" class="${r.frecciaInizio ? 'attivo' : ''}" data-rel-az="inizio" title="Freccia all'inizio">←</button>
                <button type="button" class="${r.frecciaFine !== false ? 'attivo' : ''}" data-rel-az="fine" title="Freccia alla fine">→</button>
                <span class="mappa-pop-sep"></span>
                ${['pieno', 'trattini', 'punti'].map(x => `<button type="button" class="${t === x ? 'attivo' : ''}" data-rel-tratto="${x}" title="${x}"><span class="tratto-${x}"></span></button>`).join('')}
                <span class="mappa-pop-sep"></span>
                <button type="button" data-rel-az="dritta" title="Raddrizza">⟋</button>
                <button type="button" class="pericolo" data-rel-az="elimina" title="Elimina il collegamento">${ico('cestino')}</button>
            </div>
            <label class="pop-curva" title="Curvatura del collegamento (0 = dritto)"><span>Curvatura</span>
                <input type="range" min="-100" max="100" step="5" value="${curvaturaRelazione(r)}" data-rel-curva></label>
            ${sceltaColori('data-rel-colore', r.colore, { auto: true })}
        </div>`;
    }

    // Curvatura di un collegamento per il cursore: quella della curva normale se non è stata cambiata
    function curvaturaRelazione(r) {
        const cv = curvaturaDi(r.percorso);
        if (cv.forma) return cv.valore;
        if (cv.aMano) return 0;
        const g = geometriaRelazione(r);
        if (!g || !g.base) return 36;
        // Curva normale (punto di controllo c): il punto a metà dista dalla linea dritta metà di quanto dista c
        const l = Math.hypot(g.cb.x - g.ca.x, g.cb.y - g.ca.y) || 1;
        const v = ((g.c.y - (g.ca.y + g.cb.y) / 2) * (g.cb.x - g.ca.x) - (g.c.x - (g.ca.x + g.cb.x) / 2) * (g.cb.y - g.ca.y)) / (l * l) / 2;
        return Math.round(limita(v * 200, -100, 100) / 5) * 5;
    }

    // Scelta della disposizione di un nodo (per la radice è quella di tutta la mappa)
    const SCELTE_NODO = [['', 'Come il padre'], ['orizzontale', 'Orizzontale'], ['destra', 'A destra'], ['sinistra', 'A sinistra'],
        ['verticale', 'Verticale'], ['su', 'Capovolta'], ['lineare', 'Lineare'], ['radiale', 'Radiale'], ['libera', 'Libera']];
    const SCELTE_RADICE = [['orizzontale', 'Ai due lati'], ['destra', 'A destra'], ['sinistra', 'A sinistra'], ['verticale', 'Verticale'],
        ['su', 'Capovolta'], ['lineare', 'Lineare'], ['radiale', 'Radiale'], ['libera', 'Libera']];

    function popDisposizione(id, p, sopra) {
        const radice = id === m.radice;
        const attuale = radice
            ? (m.disposizione === 'orizzontale' && ['destra', 'sinistra'].includes(m.direzione) ? m.direzione : m.disposizione)
            : m.nodi[id].disposizione || '';
        const ereditata = !radice && !attuale ? ` (ora: ${(SCELTE_NODO.find(x => x[0] === modoEffettivo(id)) || ['', ''])[1].toLowerCase()})` : '';
        return `<div class="mappa-pop pop-disposizione${sopra ? ' sopra' : ''}" data-pop="disp" style="left:${p.x}px;top:${p.y}px">
            <span class="pop-titolo">${radice ? 'Disposizione della mappa' : 'Disposizione dei figli di questo nodo'}${esc(ereditata)}</span>
            <div class="griglia-disposizioni">${(radice ? SCELTE_RADICE : SCELTE_NODO).map(([v, t]) => `
                <button type="button" class="scelta-disposizione${attuale === v ? ' attivo' : ''}" data-disp-nodo="${v}">${miniaturaDisposizione(v || 'eredita')}<span>${t}</span></button>`).join('')}
            </div>
        </div>`;
    }

    // Cambia la disposizione di un nodo (della mappa, se è la radice), dentro una modifica
    function impostaDisposizione(id, v) {
        const n = m.nodi[id];
        if (!n) return;
        // Con un'altra disposizione le linee piegate a mano non avrebbero più senso: tornano normali
        if (v !== 'libera') raddrizza(id === m.radice ? null : id);
        if (id === m.radice) {
            if (!v) return;   // la radice non ha un padre da cui prenderla
            if (v === 'libera' && m.disposizione !== 'libera') fissaPosizioni(m.radice);
            if (v === 'destra' || v === 'sinistra') { m.disposizione = 'orizzontale'; m.direzione = v; }
            else { m.disposizione = v; if (v === 'orizzontale' && !['auto', 'orario'].includes(m.direzione)) m.direzione = 'auto'; }
        } else {
            // Passando alla disposizione libera i nodi restano dove sono adesso, poi si spostano a mano
            if (v === 'libera' && (geo.get(id) || {}).disp !== 'libera') fissaPosizioni(id);
            n.disposizione = v || null;
        }
    }

    function scegliDisposizione(id, v) {
        if (!m.nodi[id]) return;
        modifica(() => impostaDisposizione(id, v));
        st.popDisp = null;
        posizionaSopra();
        mostraNodo(id);
    }

    // Più nodi scelti: la disposizione dei figli di tutti, con una sola modifica (un solo Ctrl+Z). La radice, se c'è,
    // cambia quella della mappa ("Come il padre" per lei non vale)
    function griglieDisposizioneMulti() {
        const ids = [...st.sel].filter(id => m.nodi[id]);
        const valore = id => (id === m.radice
            ? (m.disposizione === 'orizzontale' && ['destra', 'sinistra'].includes(m.direzione) ? m.direzione : m.disposizione)
            : m.nodi[id].disposizione || '');
        const comune = ids.every(id => valore(id) === valore(ids[0])) ? valore(ids[0]) : null;
        return `<div class="griglia-disposizioni griglia-disposizioni-multi">${SCELTE_NODO.map(([v, t]) => `
            <button type="button" class="scelta-disposizione${comune === v ? ' attivo' : ''}" data-disp-multi="${v}">${miniaturaDisposizione(v || 'eredita')}<span>${t}</span></button>`).join('')}
        </div>`;
    }

    function scegliDisposizioneMulti(v) {
        const ids = [...st.sel].filter(id => m.nodi[id]);
        if (!ids.length) return;
        // Prima i nodi più in alto: passando alla libera, i rami sotto restano dove sono
        ids.sort((a, b) => Mappe.antenati(m, a).length - Mappe.antenati(m, b).length);
        modifica(() => ids.forEach(id => impostaDisposizione(id, v)));
        st.popDispMulti = false;
        posizionaSopra();
        Ui.toast(`Disposizione di ${plurale(ids.length, 'nodo', 'nodi')}: ${(SCELTE_NODO.find(x => x[0] === v) || ['', v])[1].toLowerCase()}`, 'successo', 2200);
    }

    // ---- Allineamento dei nodi scelti (disposizione libera) ------------------------------------------
    // Si allineano i nodi che restano dove li si lascia: figli di un nodo in disposizione libera e nodi liberi. Come
    // nella disposizione orizzontale, ma scegli tu: bordo sinistro, centro o bordo destro alla stessa x (l'altezza non
    // cambia). Il riferimento sono i nodi scelti che non si possono spostare (la radice, o nodi in una disposizione
    // automatica), se ce ne sono; altrimenti il riquadro che contiene tutti i nodi scelti. Ogni ramo segue il suo nodo.

    const ALLINEAMENTI = [['sinistra', 'a sinistra'], ['centro', 'al centro'], ['destra', 'a destra']];

    function siAllineaAMano(id) {
        const n = m.nodi[id];
        if (!n || id === m.radice || id === st.focus || !geo.has(id)) return false;
        return !n.genitore || (geo.get(n.genitore) || {}).disp === 'libera';
    }

    // { mobili, fermi } tra i nodi scelti (o dati); null se non c'è niente da allineare
    function daAllineare(ids = [...st.sel]) {
        const scelti = ids.filter(id => geo.has(id));
        const mobili = scelti.filter(siAllineaAMano);
        if (!mobili.length || scelti.length < 2) return null;
        return { mobili, fermi: scelti.filter(id => !mobili.includes(id)) };
    }

    function iconaAllinea(tipo) {
        const [asse, x1, x2] = { sinistra: [2, 4, 4], centro: [10, 3, 5.5], destra: [18, 4, 8] }[tipo];
        const [w1, w2] = tipo === 'centro' ? [14, 9] : [12, 8];
        return `<svg class="icona-allinea" viewBox="0 0 20 18" aria-hidden="true"><rect x="${x1}" y="3" width="${w1}" height="4" rx="1.2" fill="currentColor" opacity=".8"/>
            <rect x="${x2}" y="11" width="${w2}" height="4" rx="1.2" fill="currentColor" opacity=".8"/><path d="M${asse} 1 V17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    }

    // Prepara l'allineamento dei nodi (quelli scelti, se non si dicono) dalle posizioni disegnate adesso:
    // { mobili, mossi, applica } dove applica() cambia le posizioni nella mappa (dentro una modifica); null se non
    // c'è niente da allineare. La usa anche l'assistente (js/ia/strumenti-mappe.js)
    function preparaAllineamento(tipo, ids) {
        const x = daAllineare(ids);
        if (!x || !ALLINEAMENTI.some(a => a[0] === tipo)) return null;
        const riquadro = lista => {
            const bb = lista.map(id => geo.get(id));
            return { x0: Math.min(...bb.map(b => b.x)), x1: Math.max(...bb.map(b => b.x + b.w)) };
        };
        const r = riquadro(x.fermi.length ? x.fermi : x.mobili);
        const bersaglio = b => (tipo === 'sinistra' ? r.x0 + b.w / 2 : tipo === 'destra' ? r.x1 - b.w / 2 : (r.x0 + r.x1) / 2);
        const centro = b => b.x + b.w / 2;
        const mossi = x.mobili.filter(id => Math.abs(bersaglio(geo.get(id)) - centro(geo.get(id))) > 0.5).length;
        // Dall'alto in basso: un nodo scelto sotto un altro nodo scelto si allinea rispetto a dove il padre è arrivato
        const profondita = id => Mappe.antenati(m, id).length;
        const ordinati = [...x.mobili].sort((a, b) => profondita(a) - profondita(b));
        const posizioni = new Map(ordinati.map(id => [id, { ...geo.get(id) }]));
        const padri = new Map([...new Set(ordinati.map(id => m.nodi[id].genitore).filter(Boolean))].map(pid => [pid, {
            centro: Disposizione.centro(geo.get(pid)),
            figli: m.nodi[pid].figli.filter(f => geo.has(f)).map(f => [f, Disposizione.centro(geo.get(f))]),
        }]));
        const applica = () => {
            const spostamento = new Map();   // id → di quanto si sposta in orizzontale il suo centro
            const spostamentoDi = id => {
                for (let q = id; q; q = m.nodi[q] && m.nodi[q].genitore) if (spostamento.has(q)) return spostamento.get(q);
                return 0;
            };
            // Nella disposizione libera i fratelli senza una posizione propria si mettono in colonna attorno a quelli
            // fermi: prima di spostarne qualcuno si fermano dove sono, così non si muovono
            padri.forEach((p, pid) => p.figli.forEach(([f, c]) => {
                if (m.nodi[f] && m.nodi[f].genitore === pid && !m.nodi[f].off) m.nodi[f].off = { dx: c.x - p.centro.x, dy: c.y - p.centro.y };
            }));
            ordinati.forEach(id => {
                const n = m.nodi[id], b = posizioni.get(id);
                if (!n) return;
                const dopo = bersaglio(b);
                spostamento.set(id, dopo - centro(b));
                if (!n.genitore) { n.x = dopo; return; }
                const p = padri.get(n.genitore);
                if (!p || !n.off) return;
                const dx = dopo - (p.centro.x + spostamentoDi(n.genitore));
                const primaDx = n.off.dx;
                n.off = { dx, dy: n.off.dy };
                // Passando dall'altra parte del padre il ramo si ribalta, come trascinandolo
                if ((primaDx < 0) !== (dx < 0)) ribalta(id);
            });
        };
        return { mobili: x.mobili, mossi, applica };
    }

    // ---- Distanza tra i nodi scelti (disposizioni automatiche) --------------------------------------
    // Allarga (o stringe) solo lo spazio tra i nodi scelti, non tra tutti i fratelli: i nodi tengono l'allineamento della
    // disposizione e i loro rami li seguono, come se li spostassi nella disposizione libera. Per ogni nodo che ha almeno
    // due figli "toccati" dalla selezione (scelti loro o qualcuno sotto di loro) nella stessa pila, cambiano tutti gli
    // spazi dal primo all'ultimo toccato: con A e C scelti e B in mezzo, sia A–B sia B–C. Con nodi di padri diversi si
    // allontanano i rami che li contengono, padri compresi. Nel modello: distanzaPrima sul nodo = distanza dal fratello
    // che gli sta prima nella sua pila (moltiplica quella normale). Radiale e libera no: lì i nodi si trascinano.

    // I nodi a cui va la distanza dal fratello precedente ([] se tra i nodi scelti non c'è uno spazio da cambiare)
    function bersagliDistanza(ids = [...st.sel]) {
        const toccati = new Map();   // genitore → figli toccati dalla selezione
        ids.filter(id => geo.has(id)).forEach(id => {
            for (let x = id; m.nodi[x] && m.nodi[x].genitore && geo.has(m.nodi[x].genitore); x = m.nodi[x].genitore) {
                const g = m.nodi[x].genitore;
                if (!toccati.has(g)) toccati.set(g, new Set());
                toccati.get(g).add(x);
            }
        });
        const bersagli = [];
        toccati.forEach((figli, g) => {
            if (figli.size < 2 || !['orizzontale', 'verticale', 'su', 'lineare'].includes(geo.get(g).disp)) return;
            // Le pile dei figli: a destra e a sinistra (la radice ai due lati), in riga, in elenco; i raccordi no
            const pile = new Map();
            m.nodi[g].figli.forEach(f => {
                const b = geo.get(f);
                if (!b || b.raccordo) return;
                if (!pile.has(b.dir)) pile.set(b.dir, []);
                pile.get(b.dir).push(b);
            });
            pile.forEach((lista, dir) => {
                const asse = dir === 'giu' || dir === 'su' ? 'x' : 'y';
                lista.sort((a, b) => a[asse] - b[asse]);
                const dentro = lista.map((b, i) => (figli.has(b.id) ? i : -1)).filter(i => i >= 0);
                if (dentro.length > 1) lista.slice(dentro[0] + 1, dentro[dentro.length - 1] + 1).forEach(b => bersagli.push(b.id));
            });
        });
        return bersagli;
    }

    const distanzaDi = id => (+(m.nodi[id] || {}).distanzaPrima > 0 ? +m.nodi[id].distanzaPrima : 1);

    function iconaDistanza() {
        return `<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="2" width="12" height="4" rx="1.5" fill="currentColor"/><rect x="4" y="14" width="12" height="4" rx="1.5" fill="currentColor"/>
            <path d="M10 7.5 V12.5 M7.8 9.2 L10 7.2 L12.2 9.2 M7.8 10.8 L10 12.8 L12.2 10.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    function impostaDistanza(bersagli, v) {
        bersagli.forEach(id => {
            const n = m.nodi[id];
            if (!n) return;
            if (!(v > 0) || Math.abs(v - 1) < 0.01) delete n.distanzaPrima; else n.distanzaPrima = Math.round(limita(v, 0.2, 12) * 100) / 100;
        });
    }

    // Il cursore "Tra i nodi scelti" (pannello Disposizione e barra dei nodi scelti)
    function controlliDistanzaScelti(inBarra = false) {
        const bersagli = bersagliDistanza();
        if (!bersagli.length && inBarra) return '';
        const valori = bersagli.map(distanzaDi);
        const v = valori.length ? valori[0] : 1, diversi = valori.some(x => Math.abs(x - v) > 0.001);
        const etichetta = bersagli.length ? `${Math.round(v * 100)}%${diversi ? ' (diverse)' : ''}` : '—';
        if (inBarra) {
            const via = valori.some(x => x !== 1) ? `<button type="button" class="btn btn-fantasma btn-piccolo" data-distanza-via title="Lo spazio tra questi nodi torna come quello tra gli altri fratelli (100%)">${ico('ruota')}Reset</button>` : '';
            return `<div class="pop-distanza"><span>Distanza tra i nodi scelti</span>
                <input type="range" min="0.2" max="12" step="0.1" value="${v}" data-distanza-scelti aria-label="Distanza tra i nodi scelti">
                <b data-ds-valore>${etichetta}</b>${via}</div>`;
        }
        // Senza nodi da distanziare il cursore resta spento (il perché sta nel suggerimento al passaggio del mouse)
        const perche = !bersagli.length ? (st.sel.size > 1 ? 'Nella disposizione radiale o libera i nodi si spostano trascinandoli; ai due lati della radice vale tra nodi dello stesso lato'
            : 'Scegli due o più nodi (Ctrl+clic)') : '';
        return `
            <label class="campo campo-compatto${bersagli.length ? '' : ' spento'}"${perche ? ` title="${esc(perche)}"` : ''}><span>Tra i nodi scelti <b data-ds-valore>${etichetta}</b></span>
                <input type="range" min="0.2" max="12" step="0.1" value="${v}" data-distanza-scelti ${bersagli.length ? '' : 'disabled'}></label>`;
    }

    function cursoreDistanza(t) {
        const v = +t.value;
        const bersagli = bersagliDistanza();
        if (!bersagli.length) return;
        $$('[data-ds-valore]', radiceEl).forEach(b => { b.textContent = Math.round(v * 100) + '%'; });
        $$('[data-distanza-scelti]', radiceEl).forEach(x => { if (x !== t) x.value = v; });
        modificaContinua('distanza:' + bersagli.join(), () => impostaDistanza(bersagli, v));
    }

    function distanzaComeGliAltri() {
        const bersagli = bersagliDistanza();
        if (bersagli.length) modifica(() => impostaDistanza(bersagli, 1));
        aggiornaPannello(true);
        posizionaSopra();
    }

    // Per l'assistente (js/ia/strumenti-mappe.js): { bersagli, applica(v) } con le posizioni disegnate adesso
    function preparaDistanza(ids) {
        const bersagli = bersagliDistanza(ids);
        return bersagli.length ? { bersagli, applica: v => impostaDistanza(bersagli, v) } : null;
    }

    function allinea(tipo) {
        const p = preparaAllineamento(tipo);
        if (!p) return;
        const nome = (ALLINEAMENTI.find(a => a[0] === tipo) || ['', ''])[1];
        if (!p.mossi) { Ui.toast(`I nodi sono già allineati ${nome}`, 'info', 2200); return; }
        modifica(p.applica);
        Ui.toast(`${plurale(p.mossi, 'nodo allineato', 'nodi allineati')} ${nome}`, 'successo', 2200);
    }

    function popEtichetta(e, p) {
        const s = e.stile || {};
        return `<div class="mappa-pop" data-pop="et" style="left:${p.x}px;top:${p.y}px">
            <div class="mappa-pop-riga">
                <button type="button" class="${s.grassetto ? 'attivo' : ''}" data-et-az="grassetto" title="Grassetto"><b>G</b></button>
                <button type="button" class="${s.corsivo ? 'attivo' : ''}" data-et-az="corsivo" title="Corsivo"><i>C</i></button>
                <button type="button" class="${s.sottolineato ? 'attivo' : ''}" data-et-az="sottolineato" title="Sottolineato"><u>S</u></button>
                ${campoDimensione('data-et-pt', s.scala || 0.8, "Dimensione dell'etichetta (punti)")}
                <button type="button" data-et-az="modifica" title="Modifica il testo">${ico('matita')}</button>
                <button type="button" class="pericolo" data-et-az="elimina" title="Elimina l'etichetta">${ico('cestino')}</button>
            </div>
            ${sceltaColori('data-et-colore', s.riempimento || 'nessuno', { nessuno: true })}
        </div>`;
    }

    // ---- Operazioni sui nodi --------------------------------------------------------------------------

    // Il ramo di "id" resta com'è adesso: ogni nodo ricorda la distanza dal genitore (per la disposizione libera)
    function fissaPosizioni(id) {
        Mappe.discendenti(m, id).forEach(d => {
            const b = geo.get(d), p = geo.get(m.nodi[d].genitore);
            if (!b || !p) return;
            const cb = Disposizione.centro(b), cp = Disposizione.centro(p);
            m.nodi[d].off = { dx: cb.x - cp.x, dy: cb.y - cp.y };
        });
    }

    // Linee piegate a mano dentro il ramo di id (null = in tutta la mappa) di nuovo normali
    function raddrizza(id) {
        (id ? Mappe.discendenti(m, id) : Object.keys(m.nodi)).forEach(x => { if (m.nodi[x].piega) m.nodi[x].piega = null; if (m.nodi[x].percorso) m.nodi[x].percorso = null; });
    }

    // Posto per un nodo nuovo (o appena spostato) sotto un genitore libero: accanto a lui, sotto gli altri figli
    function offsetAccanto(pid, escludi, w = 90, h = 24) {
        const p = geo.get(pid);
        if (!p) return null;
        const via = new Set([].concat(escludi || []));
        const pc = Disposizione.centro(p);
        const dir = p.verso === 's' ? -1 : 1;
        const fratelli = m.nodi[pid].figli.filter(f => !via.has(f)).map(f => geo.get(f))
            .filter(f => f && (Disposizione.centro(f).x - pc.x) * dir >= 0);
        const cy = fratelli.length ? Math.max(...fratelli.map(f => f.y + f.h)) + 22 + h / 2 : pc.y;
        return { dx: dir * (p.w / 2 + 60 + w / 2), dy: cy - pc.y };
    }

    function posizionaNuovo(n) {
        const p = n.genitore && geo.get(n.genitore);
        if (p && p.disp === 'libera') n.off = offsetAccanto(n.genitore, n.id);
    }

    // Ribalta un ramo da un lato all'altro del genitore: le distanze orizzontali e i lati scelti a mano cambiano verso
    function ribalta(id) {
        const scambia = { destra: 'sinistra', sinistra: 'destra' };
        [id, ...Mappe.discendenti(m, id)].forEach(x => {
            const nx = m.nodi[x];
            if (x !== id && nx.off) nx.off = { dx: -nx.off.dx, dy: nx.off.dy };
            if (scambia[nx.disposizione]) nx.disposizione = scambia[nx.disposizione];
            if (Disposizione.piegaValida(nx.piega)) nx.piega = { c1: { dx: -nx.piega.c1.dx, dy: nx.piega.c1.dy }, c2: { dx: -nx.piega.c2.dx, dy: nx.piega.c2.dy } };
            // Specchiata, ogni punto di passaggio resta alla stessa distanza lungo la linea ma dall'altra parte
            if (Disposizione.percorsoValido(nx.percorso)) nx.percorso = nx.percorso.map(q => ({ u: q.u, v: -q.v }));
        });
    }

    function sonoFratelli(ids) {
        const g = ids.length && m.nodi[ids[0]] && m.nodi[ids[0]].genitore;
        return !!g && ids.every(id => m.nodi[id] && m.nodi[id].genitore === g && !m.nodi[id].raccordo);
    }

    // Raccordo nuovo sotto un genitore in disposizione libera: oltre i fratelli raccolti, a metà della loro altezza
    function offsetRaccordo(gid, nodi, graffa) {
        const p = geo.get(gid), bb = nodi.map(x => geo.get(x)).filter(Boolean);
        if (!p || !bb.length) return null;
        const pc = Disposizione.centro(p);
        const destra = bb.reduce((t, q) => t + Disposizione.centro(q).x, 0) / bb.length >= pc.x;
        const bordo = destra ? Math.max(...bb.map(q => q.x + q.blocco.x1)) : Math.min(...bb.map(q => q.x + q.blocco.x0));
        const cy = (Math.min(...bb.map(q => q.y)) + Math.max(...bb.map(q => q.y + q.h))) / 2;
        return { dx: bordo + (destra ? 1 : -1) * ((graffa ? 64 : 56) + 45) - pc.x, dy: cy - pc.y };
    }

    // Nodo nuovo figlio di tutti i nodi scelti. Se sono fratelli lo diventa il raccordo che li raccoglie (linee da
    // ognuno o una graffa, e sta oltre di loro); se no sta sotto il primo scelto e gli altri hanno una linea verso di lui
    function figlioComune(graffa = false) {
        const ids = [...st.sel].filter(id => m.nodi[id]);
        if (ids.length < 2) { Ui.toast('Seleziona almeno due nodi tenendo premuto Ctrl'); return; }
        const fratelli = sonoFratelli(ids);
        if (graffa && !fratelli) { Ui.toast('La graffa raccoglie nodi con lo stesso genitore', 'errore'); return; }
        let nuovo;
        modifica(() => {
            if (fratelli) {
                const gid = m.nodi[ids[0]].genitore, p = m.nodi[gid];
                const nodi = p.figli.filter(f => ids.includes(f));
                nuovo = Mappe.aggiungiNodo(m, { genitore: gid, indice: p.figli.indexOf(nodi[nodi.length - 1]) + 1, lato: m.nodi[nodi[0]].lato, raccordo: { nodi, graffa } });
                const pg = geo.get(gid);
                if (pg && pg.disp === 'libera') nuovo.off = offsetRaccordo(gid, nodi, graffa);
            } else {
                const [primo, ...altri] = ids;
                m.nodi[primo].chiuso = false;
                nuovo = Mappe.aggiungiNodo(m, { genitore: primo, legami: altri });
                Mappe.pulisciLegami(m);
                posizionaNuovo(nuovo);
            }
        });
        seleziona(nuovo.id);
        mostraNodo(nuovo.id);
        modificaNodo(nuovo.id, { nuovo: true });
    }

    function aggiungiFiglio(id = st.attivo) {
        if (!id || !m.nodi[id]) return;
        let nuovo;
        modifica(() => {
            m.nodi[id].chiuso = false;
            nuovo = Mappe.aggiungiNodo(m, { genitore: id });
            posizionaNuovo(nuovo);
        });
        seleziona(nuovo.id);
        mostraNodo(nuovo.id);
        modificaNodo(nuovo.id, { nuovo: true });
    }

    function aggiungiFratello(id = st.attivo) {
        const n = id && m.nodi[id];
        if (!n) return;
        if (!n.genitore || (st.focus && id === st.focus)) { aggiungiFiglio(id); return; }
        let nuovo;
        modifica(() => {
            const p = m.nodi[n.genitore];
            nuovo = Mappe.aggiungiNodo(m, { genitore: n.genitore, indice: p.figli.indexOf(id) + 1, lato: n.lato });
            posizionaNuovo(nuovo);
        });
        seleziona(nuovo.id);
        mostraNodo(nuovo.id);
        modificaNodo(nuovo.id, { nuovo: true });
    }

    function nodoLibero(x, y) {
        let nuovo;
        modifica(() => { nuovo = Mappe.aggiungiNodo(m, { genitore: null, x, y }); });
        seleziona(nuovo.id);
        modificaNodo(nuovo.id, { nuovo: true });
    }

    // "link argomenti": i nodi presi dalle mappe d'origine (n.rif) si cambiano lì
    const generato = id => !!(m.panoramica && m.nodi[id] && m.nodi[id].rif);
    function vaiAllOrigine(id) {
        const o = Panoramica.origine(m, id);
        if (o) Router.vai(`/mappa/${o.m.id}?nodo=${o.nodo}`);
        else Ui.toast('Questo nodo non viene da una mappa', 'info');
    }
    function avvisoGenerato(id, cosa) {
        const o = Panoramica.origine(m, id);
        Ui.toast(`${cosa} si ${cosa === 'Il testo' ? 'cambia' : 'decide'} nella mappa d'origine${o ? ` «${o.m.nome}»` : ''}: qui si aggiorna da solo`, 'info', 6000,
            o ? { testo: 'Apri', clic: () => vaiAllOrigine(id) } : undefined);
    }

    function eliminaSelezionati() {
        if (st.rel) { modifica(() => { m.relazioni = m.relazioni.filter(r => r.id !== st.rel); }); return; }
        if (st.et) { eliminaEtichetta(st.et.nodo, st.et.id); return; }
        if (st.fig) { eliminaFigura(); return; }
        const tutti = [...st.sel].filter(id => id !== m.radice && m.nodi[id] && id !== st.focus);
        if (tutti.some(generato)) Ui.toast(`I nodi presi dalle mappe della materia non si eliminano qui: toglili dalla mappa d'origine (o togli «Mostra in ${Panoramica.NOME}»)`, 'info', 7000);
        const ids = tutti.filter(id => !generato(id));
        if (!ids.length) return;
        // Nodi (o loro discendenti) collegati a flashcard: prima un avviso
        const via = new Set(ids.flatMap(id => [id, ...Mappe.discendenti(m, id)]));
        const collegate = Archivio.tutti('carte').filter(c => c.mappa && c.mappa.id === m.id && via.has(c.mappa.nodo));
        if (collegate.length && !st.eliminaConfermata) { avvisoNodiConFlashcard(ids, via, collegate); return; }
        st.eliminaConfermata = false;
        const primo = m.nodi[ids[0]];
        const fratelli = primo.genitore ? m.nodi[primo.genitore].figli : [];
        const i = fratelli.indexOf(primo.id);
        const dopo = fratelli.filter(f => !ids.includes(f))[Math.max(0, i - 1)] || primo.genitore || st.focus || m.radice;
        modifica(() => ids.forEach(id => Mappe.eliminaNodo(m, id)));
        seleziona(m.nodi[dopo] ? dopo : m.radice);
    }

    async function avvisoNodiConFlashcard(ids, via, collegate) {
        const nome = id => '«' + esc(Ui.tronca(Mappe.testoSemplice(m.nodi[id] && m.nodi[id].testo) || '(vuoto)', 40)) + '»';
        const nodiCol = [...new Set(collegate.map(c => c.mappa.nodo))];
        const domanda = c => esc(Ui.tronca(testoDaHtml(c.domanda || ''), 70) || '(senza domanda)');
        const set = c => { const x = Dati.set(c.setId); return x ? ` <small>· ${esc(x.nome)}</small>` : ''; };
        const elenco = collegate.slice(0, 6).map(c => `<span>${domanda(c)}${set(c)}</span>`).join('') + (collegate.length > 6 ? `<span>… e altre ${collegate.length - 6}</span>` : '');
        const quali = ids.length === 1 ? `Il nodo ${nome(ids[0])}` : `I ${ids.length} nodi scelti`;
        const dentro = nodiCol.some(x => !ids.includes(x)) ? ' (anche nei nodi sotto di lui)' : '';
        const ok = await Ui.conferma(`${quali}${dentro} ${collegate.length === 1 ? 'è collegato a una flashcard' : `è collegato a ${collegate.length} flashcard`}:
            <span class="elenco-avviso">${elenco}</span>
            Se lo elimini le flashcard restano, ma non porteranno più a questo punto della mappa (con Annulla, Ctrl+Z, torna tutto com'era).`,
            { titolo: 'Nodo collegato a flashcard', ok: 'Elimina comunque', pericolo: true });
        if (!ok) return;
        st.sel = new Set(ids.filter(id => m.nodi[id]));
        st.eliminaConfermata = true;
        eliminaSelezionati();
    }

    function alternaRamo(ids = [...st.sel]) {
        const conFigli = ids.map(id => m.nodi[id]).filter(n => n && n.figli.length && n.id !== (st.focus || m.radice));
        if (!conFigli.length) return;
        const chiudi = !conFigli[0].chiuso;
        conFigli.forEach(n => { n.chiuso = chiudi; });
        cambiatoSenzaStoria();
    }

    function spostaTraFratelli(delta) {
        const n = m.nodi[st.attivo];
        if (!n || !n.genitore) return;
        const f = m.nodi[n.genitore].figli;
        const i = f.indexOf(n.id), j = i + delta;
        if (j < 0 || j >= f.length) return;
        modifica(() => { f.splice(i, 1); f.splice(j, 0, n.id); });
    }

    function aggiungiEtichetta(id = st.attivo) {
        const n = id && m.nodi[id];
        if (!n) return;
        const b = geo.get(id);
        let e;
        modifica(() => {
            const sopra = n.etichette.length;
            e = { id: uid(), testo: '', dx: 0, dy: -((b ? b.h / 2 : 12) + 14 + sopra * 22), stile: { riempimento: '#ffe0d2', scala: 0.75 } };
            n.etichette.push(e);
        });
        modificaEtichetta(id, e.id, { nuova: true });
    }

    function eliminaEtichetta(nodo, id) {
        modifica(() => { const n = m.nodi[nodo]; n.etichette = n.etichette.filter(e => e.id !== id); });
        st.et = null;
        posizionaSopra();
    }

    function creaRelazione(da, a) {
        if (!m.nodi[da] || !m.nodi[a] || da === a) return;
        let r;
        modifica(() => {
            r = { id: uid(), da, a, testo: '', colore: null, tratto: 'punti', frecciaInizio: false, frecciaFine: true, curva: null };
            m.relazioni.push(r);
        });
        selezionaRelazione(r.id);
        const campo = $('[data-rel-testo]', sopraEl);
        if (campo) campo.focus();
    }

    function iniziaCollegamento(id = st.attivo) {
        if (!id) return;
        st.collegando = id;
        editorEl.classList.add('collegando');
        posizionaSopra();
        Ui.toast('Clicca il nodo da collegare · Esc per annullare', 'info', 3000);
    }

    function fineCollegamento() {
        st.collegando = null;
        editorEl.classList.remove('collegando');
        tempEl.innerHTML = '';
        posizionaSopra();
    }

    function applicaStile(chiave, valore, ids = [...st.sel]) {
        if (!ids.length) return;
        modifica(() => ids.forEach(id => {
            const n = m.nodi[id];
            if (!n) return;
            n.stile = n.stile || {};
            if (valore === null || valore === undefined) delete n.stile[chiave]; else n.stile[chiave] = valore;
        }));
    }

    // Stile delle linee scelte (o delle linee che portano ai nodi selezionati)
    function applicaCollegamento(chiave, valore) {
        const ids = idsCollegamento();
        if (!ids.length) return;
        modifica(() => ids.forEach(id => {
            const s = m.nodi[id].stile = m.nodi[id].stile || {};
            if (valore === null || valore === undefined || valore === '') delete s[chiave]; else s[chiave] = valore;
            if (chiave === 'frecciaFine') delete s.freccia;
            if (chiave === 'lineaForma') { m.nodi[id].piega = null; m.nodi[id].percorso = null; }
        }));
    }

    function copiaStile() {
        const n = m.nodi[st.attivo || st.arco];
        if (!n) { Ui.toast('Seleziona il nodo da cui copiare lo stile'); return; }
        st.stileCopiato = { ...(n.stile || {}), ...(n.stilePredefinito ? { __pre: n.stilePredefinito } : {}) };
        Ui.toast('Stile copiato: seleziona altri nodi e premi Ctrl+Alt+V');
        aggiornaPannello(true);
    }

    // Sui nodi scelti va tutto lo stile; su una linea scelta solo lo stile della linea
    function incollaStile() {
        if (!st.stileCopiato) { Ui.toast('Prima copia uno stile (Ctrl+Alt+C)'); return; }
        const copiato = st.stileCopiato;
        const { __pre, ...stileCopiato } = copiato;
        if (st.sel.size) {
            modifica(() => st.sel.forEach(id => {
                const n = m.nodi[id];
                if (!n) return;
                n.stile = { ...stileCopiato };
                if (__pre) n.stilePredefinito = __pre; else delete n.stilePredefinito;
            }));
        }
        else if (st.arco && m.nodi[st.arco]) {
            modifica(() => {
                const s = m.nodi[st.arco].stile = m.nodi[st.arco].stile || {};
                Mappe.CHIAVI_COLLEGAMENTO.forEach(k => { if (k in copiato) s[k] = copiato[k]; else delete s[k]; });
            });
        } else Ui.toast('Seleziona i nodi a cui dare lo stile');
    }

    function stileAttivo() {
        const b = geo.get(st.attivo);
        return b ? b.s : { ...Mappe.BASE };
    }

    // ---- Modifica del testo (direttamente nel nodo) ----------------------------------------------------

    // ricco: il testo del nodo, che si scrive già formattato (grassetto, corsivo… su parti del testo)
    function rendiModificabile(el, ricco = false) {
        el.contentEditable = ricco ? 'true' : 'plaintext-only';
        if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
        el.spellcheck = true;
    }

    // ---- Grassetto, corsivo, sottolineato e barrato su parti del testo -------------------------------
    // Mentre si scrive nel nodo il testo è formattato com'è; alla fine diventa **grassetto**, *corsivo*,
    // __sottolineato__, ~~barrato~~ (vedi Mappe.pezziTesto)

    const FORMATI_TESTO = [
        ['grassetto', 'bold', 'B', 'Grassetto (Ctrl+B)'],
        ['corsivo', 'italic', 'I', 'Corsivo (Ctrl+I)'],
        ['sottolineato', 'underline', 'U', 'Sottolineato (Ctrl+U)'],
        ['barrato', 'strikeThrough', 'S', 'Barrato (Ctrl+Maiusc+X)'],
    ];

    function formattaTesto(tipo) {
        const f = FORMATI_TESTO.find(x => x[0] === tipo);
        if (!f || !st.modifica || st.modifica.tipo !== 'nodo') return;
        // Se tutto il nodo è già così (dallo stile), una sua parte non si distingue
        const cs = getComputedStyle(st.modifica.el), dec = cs.textDecorationLine || '';
        const giaTutto = { grassetto: +cs.fontWeight >= 600, corsivo: cs.fontStyle === 'italic', sottolineato: /underline/.test(dec), barrato: /line-through/.test(dec) }[tipo];
        if (giaTutto) {
            Ui.toast(`Tutto il nodo è già ${tipo}: per evidenziarne solo una parte toglilo prima dal pannello Stile`, 'info', 3800);
            return;
        }
        document.execCommand('styleWithCSS', false, false);
        document.execCommand(f[1]);
        segnaFormatiAttivi();
        disegnaPresto();
    }

    function segnaFormatiAttivi() {
        $$('[data-fmt]', sopraEl).forEach(b => {
            const f = FORMATI_TESTO.find(x => x[0] === b.dataset.fmt);
            let attivo = false;
            try { attivo = document.queryCommandState(f[1]); } catch (e) { /* niente */ }
            b.classList.toggle('attivo', attivo);
        });
    }

    function barraTesto(p) {
        return `<div class="barra-testo-nodo" style="left:${p.x}px;top:${p.y}px" role="toolbar" aria-label="Formato del testo selezionato">${FORMATI_TESTO.map(([k, , l, t]) =>
            `<button type="button" data-fmt="${k}" title="${t}" aria-label="${t}"><span class="fmt-${k}">${l}</span></button>`).join('')}</div>`;
    }

    // Dal nodo in modifica al testo con i segni
    function testoDaModifica(el) {
        const pezzi = [];
        const visita = (x, f) => {
            if (x.nodeType === 3) { pezzi.push({ t: x.nodeValue.replace(/\u00a0/g, ' '), ...f }); return; }
            if (x.nodeType !== 1) return;
            const tag = x.tagName;
            if (tag === 'BR') { pezzi.push({ t: '\n', ...f }); return; }
            if (['DIV', 'P', 'LI'].includes(tag) && pezzi.length && !/\n$/.test(pezzi[pezzi.length - 1].t)) pezzi.push({ t: '\n', ...f });
            const g = { ...f }, cs = x.style;
            if (['B', 'STRONG'].includes(tag)) g.b = true;
            if (cs.fontWeight) g.b = cs.fontWeight === 'bold' || cs.fontWeight === 'bolder' || +cs.fontWeight >= 600;
            if (['I', 'EM'].includes(tag)) g.i = true;
            if (cs.fontStyle) g.i = cs.fontStyle === 'italic';
            const dec = cs.textDecorationLine || cs.textDecoration || '';
            if (tag === 'U' || /underline/.test(dec)) g.u = true;
            if (['S', 'STRIKE', 'DEL'].includes(tag) || /line-through/.test(dec)) g.s = true;
            x.childNodes.forEach(c => visita(c, g));
        };
        el.childNodes.forEach(c => visita(c, {}));
        return Mappe.testoDaPezzi(pezzi).replace(/\n+$/, '').replace(/[ \t]+$/gm, '');
    }

    function incollaSemplice(e) {
        e.preventDefault();
        const t = (e.clipboardData || window.clipboardData).getData('text/plain');
        if (t) document.execCommand('insertText', false, t);
    }

    function selezionaTutto(el, allaFine) {
        const r = document.createRange();
        r.selectNodeContents(el);
        if (allaFine) r.collapse(false);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
    }

    function modificaNodo(id, { sostituisci = null, nuovo = false } = {}) {
        if (st.modifica) concludiModifica();
        if (generato(id)) { avvisoGenerato(id, 'Il testo'); return; }
        const el = elementi.get(id);
        const n = m.nodi[id];
        if (!el || !n) return;
        const t = $('.nodo-testo', el);
        st.modifica = { tipo: 'nodo', id, el: t, nuovo, originale: n.testo };
        el.classList.add('in-modifica');
        rendiModificabile(t, true);
        t.innerHTML = Mappe.testoInHtml(n.testo);
        // Il testo com'è prima di cambiarlo (per capire alla fine se è cambiato davvero)
        st.modifica.normale = testoDaModifica(t);
        if (sostituisci != null) t.textContent = sostituisci;
        t.focus({ preventScroll: true });
        selezionaTutto(t, sostituisci != null);
        posizionaSopra();
        t.addEventListener('input', disegnaPresto);
        t.addEventListener('keydown', tastiModifica);
        t.addEventListener('paste', incollaSemplice);
        t.addEventListener('drop', vietaTrascinamento);
        t.addEventListener('blur', () => { if (st.modifica && st.modifica.el === t) concludiModifica(); });
        disegnaPresto();
    }

    function modificaEtichetta(nodo, id, { nuova = false } = {}) {
        if (st.modifica) concludiModifica();
        const chiave = nodo + ':' + id;
        const ee = elEtichette.get(chiave);
        const e = m.nodi[nodo] && m.nodi[nodo].etichette.find(x => x.id === id);
        if (!ee || !e) return;
        st.sel.clear(); st.attivo = null; st.et = { nodo, id };
        st.modifica = { tipo: 'etichetta', nodo, id, chiave, el: ee, nuovo: nuova, originale: e.testo };
        ee.classList.add('in-modifica');
        rendiModificabile(ee);
        ee.textContent = e.testo;
        ee.focus({ preventScroll: true });
        selezionaTutto(ee, false);
        aggiornaSelezione();
        ee.addEventListener('input', disegnaPresto);
        ee.addEventListener('keydown', tastiModifica);
        ee.addEventListener('blur', () => { if (st.modifica && st.modifica.el === ee) concludiModifica(); });
    }

    function vietaTrascinamento(e) { e.preventDefault(); }

    function tastiModifica(e) {
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && !e.altKey && st.modifica && st.modifica.tipo === 'nodo') {
            const k = e.key.toLowerCase();
            const tipo = e.shiftKey ? (k === 'x' ? 'barrato' : null) : { b: 'grassetto', i: 'corsivo', u: 'sottolineato' }[k];
            if (tipo) { e.preventDefault(); formattaTesto(tipo); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); concludiModifica(); }
        else if (e.key === 'Escape') { e.preventDefault(); concludiModifica(true); }
        else if (e.key === 'Tab' && st.modifica && st.modifica.tipo === 'nodo') {
            e.preventDefault();
            const id = st.modifica.id;
            concludiModifica();
            if (m.nodi[id]) { if (e.shiftKey) aggiungiFratello(id); else aggiungiFiglio(id); }
        }
    }

    // Toglie l'ultima voce della storia (la creazione appena annullata) e torna com'era
    function scartaCreazione() {
        if (!st.passato.length) return;
        ripristina(st.passato.pop());
        cambiato();
    }

    function concludiModifica(annullata = false) {
        const mod = st.modifica;
        if (!mod) return;
        st.modifica = null;
        const testo = mod.tipo === 'nodo' ? testoDaModifica(mod.el) : mod.el.innerText.replace(/ /g, ' ').replace(/\n+$/, '').replace(/[ \t]+$/gm, '');
        mod.el.contentEditable = 'false';
        mod.el.removeEventListener('input', disegnaPresto);
        mod.el.removeEventListener('keydown', tastiModifica);
        mod.el.removeEventListener('paste', incollaSemplice);
        mod.el.removeEventListener('drop', vietaTrascinamento);
        const el = mod.tipo === 'nodo' ? elementi.get(mod.id) : mod.el;
        if (el) el.classList.remove('in-modifica');
        if (mod.tipo === 'nodo') {
            const n = m.nodi[mod.id];
            if (el) el._firma = null;
            if (!n) { disegna(); return; }
            if ((annullata || !testo.trim()) && mod.nuovo) { scartaCreazione(); if (n.genitore && m.nodi[n.genitore]) seleziona(n.genitore); return; }
            if (annullata || testo === mod.originale || testo === mod.normale) { disegna(); posizionaSopra(); return; }
            if (mod.nuovo) { n.testo = testo; cambiato(); } else modifica(() => { n.testo = testo; });
        } else {
            const n = m.nodi[mod.nodo];
            const e = n && n.etichette.find(x => x.id === mod.id);
            mod.el._testo = null;
            if (!e) { disegna(); return; }
            if ((annullata || !testo.trim()) && mod.nuovo) { scartaCreazione(); st.et = null; posizionaSopra(); return; }
            if (!testo.trim()) { eliminaEtichetta(mod.nodo, mod.id); return; }
            if (annullata || testo === mod.originale) { disegna(); return; }
            if (mod.nuovo) { e.testo = testo; cambiato(); } else modifica(() => { e.testo = testo; });
        }
        tela.focus({ preventScroll: true });
    }

    // ---- Copia, taglia, incolla -----------------------------------------------------------------------

    function cime(ids) {
        const scelti = new Set(ids);
        return ids.filter(id => !Mappe.antenati(m, id).some(a => scelti.has(a)));
    }

    function copia() {
        const ids = cime([...st.sel].filter(id => m.nodi[id]));
        if (!ids.length) return null;
        const testo = ids.map(id => Mappe.testoRientrato(m, id)).join('\n');
        st.appunti = { testo, rami: ids.map(id => Mappe.copiaRamo(m, id)) };
        return testo;
    }

    function incolla(testo, dest = st.attivo || st.focus || m.radice) {
        if (!m.nodi[dest]) return;
        let cimeNuove = [];
        if (st.appunti && testo != null && testo.replace(/\r/g, '') === st.appunti.testo) {
            modifica(() => { m.nodi[dest].chiuso = false; cimeNuove = st.appunti.rami.map(r => Mappe.incollaRamo(m, r, dest)); });
        } else {
            const voci = Mappe.alberoDaTesto(testo);
            if (!voci.length) return;
            modifica(() => { m.nodi[dest].chiuso = false; cimeNuove = Mappe.aggiungiAlbero(m, voci, dest); });
        }
        if (cimeNuove.length) { seleziona(cimeNuove[0]); cimeNuove.slice(1).forEach(id => seleziona(id, { aggiungi: true })); }
    }

    // ---- Immagini ---------------------------------------------------------------------------------

    async function scegliImmagine(id = st.attivo) {
        if (!id) { Ui.toast('Seleziona prima un nodo'); return; }
        const file = await scegliFile('image/*');
        if (file) await mettiImmagine(id, file);
    }

    async function mettiImmagine(id, file) {
        try {
            const src = await Ricco.comprimiImmagine(file);
            const larghezza = await new Promise(ok => { const i = new Image(); i.onload = () => ok(Math.min(220, i.naturalWidth)); i.onerror = () => ok(160); i.src = src; });
            const k = uid();
            m.immagini[k] = src;
            modifica(() => { m.nodi[id].immagine = { id: k, larghezza }; });
        } catch (e) {
            Ui.toast('Immagine non leggibile', 'errore');
        }
    }

    // Immagine libera agganciata al nodo, sopra di lui (o dove la si lascia, in coordinate della mappa): è fluttuante,
    // cioè segue il nodo ma non occupa spazio nella disposizione (spostarla non sposta i nodi)
    async function scegliFigura(id = st.attivo, { fluttuante = true } = {}) {
        if (!id) { Ui.toast('Seleziona prima un nodo'); return; }
        const file = await scegliFile('image/*');
        if (file) await mettiFigura(id, file, null, { fluttuante });
    }

    async function leggiImmagine(file) {
        const src = await Ricco.comprimiImmagine(file);
        const misure = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok({ w: 160, h: 120 }); i.src = src; });
        return { src, misure };
    }

    async function mettiFigura(id, file, punto = null, { fluttuante = true } = {}) {
        const n = m.nodi[id];
        if (!n) return;
        try {
            const { src, misure } = await leggiImmagine(file);
            const k = uid();
            m.immagini[k] = src;
            const larghezza = Math.min(240, misure.w || 160);
            const rapporto = misure.w ? misure.h / misure.w : 0.75;
            const f = { id: uid(), img: k, larghezza, rapporto, ...posizioneFigura(id, larghezza, larghezza * rapporto, punto), ...(fluttuante ? { fluttuante: true } : {}) };
            modifica(() => { n.figure = [...(n.figure || []), f]; });
            selezionaFigura(id, f.id);
        } catch (e) {
            Ui.toast('Immagine non leggibile', 'errore');
        }
    }

    // Centro dell'immagine rispetto al centro del nodo: dove l'hai lasciata, oppure sopra il nodo (sopra le sue
    // etichette e le altre immagini), dove non copre le linee verso il genitore e i figli
    function posizioneFigura(id, w, h, punto = null, esclusa = null) {
        const b = geo.get(id);
        if (!b) return { dx: 0, dy: -(h / 2 + 30) };
        const c = Disposizione.centro(b);
        if (punto) return { dx: punto.x - c.x, dy: punto.y - c.y };
        const cima = Math.min(0, ...(b.et || []).map(x => x.y), ...(b.fig || []).filter(x => x.f.id !== esclusa).map(x => x.y));
        return { dx: 0, dy: cima - b.h / 2 - 12 - h / 2 };
    }

    // Le immagini delle mappe vecchie che occupano spazio diventano libere (fluttuanti): l'immagine resta dov'è rispetto al suo nodo
    function alternaFluttuante(ref = st.fig) {
        const f = figura(ref);
        if (!f || f.fluttuante) return;
        modifica(() => { f.fluttuante = true; });
        Ui.toast('Ora è libera: segue il nodo ma non sposta i nodi', 'successo', 2400);
    }

    // Quante immagini ha un nodo: le libere più quella dentro
    function immaginiDelNodo(n) { return (n.figure || []).length + (n.immagine && m.immagini[n.immagine.id] ? 1 : 0); }

    // Elimina tutte le immagini dei nodi (libere e dentro); si annulla con Ctrl+Z
    function eliminaImmaginiNodi(ids) {
        const nodi = ids.map(id => m.nodi[id]).filter(n => n && immaginiDelNodo(n));
        const quante = nodi.reduce((t, n) => t + immaginiDelNodo(n), 0);
        if (!quante) return;
        modifica(() => nodi.forEach(n => { n.figure = []; n.immagine = null; }));
        st.fig = null;
        aggiornaPannello();
        Ui.toast(`${plurale(quante, 'immagine eliminata', 'immagini eliminate')} (Ctrl+Z per annullare)`, 'successo', 3000);
    }

    function eliminaFigura(ref = st.fig) {
        const n = ref && m.nodi[ref.nodo];
        if (!n) return;
        modifica(() => { n.figure = (n.figure || []).filter(f => f.id !== ref.id); });
        st.fig = null;
        posizionaSopra();
    }

    // Immagine libera → dentro il nodo (quella che c'era dentro esce e prende il suo posto)
    function figuraDentro(ref = st.fig) {
        const n = ref && m.nodi[ref.nodo];
        const f = figura(ref);
        if (!f) return;
        modifica(() => {
            const vecchia = n.immagine && m.immagini[n.immagine.id] ? n.immagine : null;
            n.figure = n.figure.filter(x => x.id !== f.id);
            if (vecchia) n.figure.push({ id: uid(), img: vecchia.id, larghezza: vecchia.larghezza, rapporto: f.rapporto, dx: f.dx, dy: f.dy, fluttuante: true });
            n.immagine = { id: f.img, larghezza: limita(Math.round(f.larghezza), 40, 600) };
        });
        seleziona(ref.nodo);
    }

    // Immagine dentro il nodo → libera, agganciata al nodo
    async function immagineFuori(id = st.attivo) {
        const n = m.nodi[id];
        if (!n || !n.immagine || !m.immagini[n.immagine.id]) return;
        const { misure } = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ misure: { w: i.naturalWidth, h: i.naturalHeight } }); i.onerror = () => ok({ misure: { w: 4, h: 3 } }); i.src = m.immagini[n.immagine.id]; });
        const larghezza = n.immagine.larghezza, rapporto = misure.w ? misure.h / misure.w : 0.75;
        const f = { id: uid(), img: n.immagine.id, larghezza, rapporto, ...posizioneFigura(id, larghezza, larghezza * rapporto), fluttuante: true };
        modifica(() => { n.immagine = null; n.figure = [...(n.figure || []), f]; });
        selezionaFigura(id, f.id);
    }

    function scaleFigura(fattore, ref = st.fig) {
        const f = figura(ref);
        if (!f) return;
        modifica(() => {
            const w0 = f.larghezza, w1 = limita(Math.round(w0 * fattore), 24, 1600);
            // L'angolo in alto a sinistra resta fermo
            f.dx += (w1 - w0) / 2; f.dy += (w1 - w0) * (f.rapporto || 0.75) / 2;
            f.larghezza = w1;
        });
    }

    function sceltaImmagine(ancora) {
        const id = st.attivo;
        if (!id) { Ui.toast('Seleziona prima un nodo'); return; }
        Ui.menu(ancora, [
            { testo: 'Libera, agganciata al nodo (segue il nodo, non sposta i nodi)', icona: 'collega', clic: () => scegliFigura(id) },
            { testo: 'Dentro il nodo', icona: 'immagine', clic: () => scegliImmagine(id) },
        ]);
    }

    function pulisciImmagini() {
        const usate = new Set();
        Object.values(m.nodi).forEach(n => {
            if (n.immagine) usate.add(n.immagine.id);
            if (String(n.icona || '').startsWith('img:')) usate.add(n.icona.slice(4));
            (n.figure || []).forEach(f => usate.add(f.img));
        });
        let tolte = 0;
        Object.keys(m.immagini || {}).forEach(k => { if (!usate.has(k)) { delete m.immagini[k]; tolte++; } });
        return tolte;
    }

    // ---- Ricerca --------------------------------------------------------------------------------------

    const normalizza = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    function apriRicerca() {
        const box = $('[data-ricerca]', radiceEl);
        st.cerca.aperta = true;
        box.hidden = false;
        const input = $('input', box);
        input.focus();
        input.select();
        cerca(input.value);
    }

    function chiudiRicerca() {
        st.cerca = { aperta: false, testo: '', trovati: [], indice: -1 };
        $('[data-ricerca]', radiceEl).hidden = true;
        elementi.forEach(el => el.classList.remove('trovato', 'trovato-attivo'));
        tela.focus({ preventScroll: true });
    }

    function cerca(testo) {
        const q = normalizza(testo.trim());
        st.cerca.testo = q;
        st.cerca.trovati = q ? Object.values(m.nodi)
            .filter(n => normalizza(n.testo).includes(q) || normalizza(n.nota).includes(q) || n.etichette.some(e => normalizza(e.testo).includes(q)))
            .map(n => n.id) : [];
        st.cerca.indice = -1;
        evidenziaRicerca();
    }

    function evidenziaRicerca() {
        const trovati = new Set(st.cerca.trovati);
        const attivo = st.cerca.trovati[st.cerca.indice];
        elementi.forEach((el, id) => { el.classList.toggle('trovato', trovati.has(id)); el.classList.toggle('trovato-attivo', id === attivo); });
        const conto = $('[data-conto]', radiceEl);
        conto.textContent = !st.cerca.testo ? '' : st.cerca.trovati.length
            ? `${st.cerca.indice >= 0 ? st.cerca.indice + 1 + '/' : ''}${st.cerca.trovati.length}` : 'nessuno';
    }

    function vaiATrovato(delta) {
        const t = st.cerca.trovati;
        if (!t.length) return;
        st.cerca.indice = (st.cerca.indice + delta + t.length) % t.length;
        const id = t[st.cerca.indice];
        if (st.focus && st.focus !== id && !Mappe.antenati(m, id).includes(st.focus)) st.focus = null;
        let aperti = false;
        Mappe.antenati(m, id).forEach(a => { if (m.nodi[a].chiuso) { m.nodi[a].chiuso = false; aperti = true; } });
        if (aperti) cambiatoSenzaStoria(); else disegna();
        st.sel = new Set([id]); st.attivo = id;
        aggiornaSelezione();
        aggiornaPannello();
        mostraNodo(id, true);
        evidenziaRicerca();
    }

    // ---- Concentrati su un ramo -------------------------------------------------------------------------

    function concentra(id) {
        if (!m.nodi[id]) return;
        st.focusLato = (geo.get(id) || {}).dir === 's' ? 'sinistra' : 'destra';
        st.focus = id === m.radice ? null : id;
        disegna();
        adatta();
    }

    function aggiornaFocus() {
        const barra = $('[data-focus]', radiceEl);
        if (!st.focus || SOLA) { barra.hidden = true; editorEl.classList.remove('con-focus'); return; }
        editorEl.classList.add('con-focus');
        barra.hidden = false;
        const percorso = Mappe.antenati(m, st.focus);
        barra.innerHTML = `
            <button type="button" class="btn btn-secondario btn-piccolo" data-focus-vai="">${ico('sinistra')}Mappa intera</button>
            <span class="mappa-focus-percorso">${percorso.map(a => `<button type="button" data-focus-vai="${a}">${esc(Ui.tronca(Mappe.testoSemplice(m.nodi[a].testo), 28))}</button>`).join('<span>›</span>')}
            ${percorso.length ? '<span>›</span>' : ''}<b>${esc(Ui.tronca(Mappe.testoSemplice(m.nodi[st.focus].testo), 40))}</b></span>`;
    }

    // ---- Esportazione -------------------------------------------------------------------------------------

    async function esportaImmagine(id = null) {
        if (st.modifica) concludiModifica();
        const focusPrima = st.focus, selPrima = new Set(st.sel), attivoPrima = st.attivo;
        if (id && id !== m.radice) st.focus = id;
        st.sel.clear(); st.attivo = null; st.rel = null; st.et = null; st.fig = null;
        editorEl.classList.add('esportando');
        disegna();
        try {
            Ui.toast('Preparo l\'immagine…', 'info', 1500);
            await caricaScript(URL_IMMAGINE);
            const b = limitiVisibili();
            const margine = 28;
            const x0 = b.x0 - margine, y0 = b.y0 - margine;
            const w = Math.ceil(b.w + margine * 2), h = Math.ceil(b.h + margine * 2);
            const url = await htmlToImage.toPng(mondo, {
                width: w, height: h, pixelRatio: 2, backgroundColor: Mappe.tema(m).sfondo, skipFonts: true,
                style: { transform: `translate(${-x0}px, ${-y0}px)`, transformOrigin: '0 0', left: '0', top: '0' },
            });
            const nome = id && id !== m.radice ? `${m.nome} - ${Mappe.testoSemplice(m.nodi[id].testo)}` : m.nome;
            scaricaFile(nomeFileSicuro(nome).slice(0, 120) + '.png', await (await fetch(url)).blob());
        } catch (e) {
            console.error(e);
            Ui.toast('Non riesco a creare l\'immagine: ' + (e.message || e), 'errore', 6000);
        } finally {
            editorEl.classList.remove('esportando');
            st.focus = focusPrima;
            st.sel = selPrima;
            st.attivo = attivoPrima;
            disegna();
        }
    }

    // Miniatura per l'elenco delle mappe: linee e riquadri, senza testo
    function anteprima() {
        const t = Mappe.tema(m);
        const b = limitiVisibili();
        if (!isFinite(b.w) || b.w <= 0) return '';
        const W = 320, H = 190;
        const s = Math.min((W - 24) / b.w, (H - 24) / b.h, 0.6);
        const ox = (W - b.w * s) / 2 - b.x0 * s, oy = (H - b.h * s) / 2 - b.y0 * s;
        const linee = archi.map(a => `<path d="${a.d}" stroke="${a.colore}" stroke-width="${Math.max(1, a.w).toFixed(1)}" fill="none" stroke-linecap="round"/>`).join('');
        const riquadri = [];
        geo.forEach(x => {
            const pieno = x.s.riempimento;
            const bordo = !['nessuna', 'sottolineata'].includes(x.s.forma) && x.s.spessore > 0;
            const raggio = ['pillola', 'ellisse'].includes(x.s.forma) ? x.h / 2 : x.s.forma === 'arrotondata' ? 10 : 2;
            if (pieno || bordo) riquadri.push(`<rect x="${x.x.toFixed(0)}" y="${x.y.toFixed(0)}" width="${x.w.toFixed(0)}" height="${x.h.toFixed(0)}" rx="${raggio.toFixed(0)}" fill="${pieno || t.sfondo}" stroke="${bordo ? x.s.coloreBordo : 'none'}" stroke-width="${bordo ? Math.max(1.5, x.s.spessore) : 0}"/>`);
            (x.fig || []).forEach(q => riquadri.push(`<rect x="${(x.x + q.x).toFixed(0)}" y="${(x.y + q.y).toFixed(0)}" width="${q.w.toFixed(0)}" height="${q.h.toFixed(0)}" rx="3" fill="${x.s.coloreTesto}" opacity=".12"/>`));
            const righe = Math.max(1, Math.round((x.h - 8) / (18 * (x.s.scala || 1))));
            for (let i = 0; i < Math.min(righe, 3); i++) {
                const lh = x.h / (righe + 1);
                riquadri.push(`<rect x="${(x.x + x.w * 0.18).toFixed(0)}" y="${(x.y + lh * (i + 1) - 2.5).toFixed(0)}" width="${(x.w * 0.64).toFixed(0)}" height="5" rx="2.5" fill="${x.s.coloreTesto}" opacity=".28"/>`);
            }
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${t.sfondo}"/><g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)}) scale(${s.toFixed(4)})">${linee}${riquadri.join('')}</g></svg>`;
    }

    // ---- Pannello laterale -----------------------------------------------------------------------------

    function apriPannello(nome) {
        st.pannello = st.pannello === nome ? null : nome;
        try { if (st.pannello) localStorage.setItem(CHIAVE_PANNELLO, st.pannello); else localStorage.removeItem(CHIAVE_PANNELLO); } catch (e) { /* solo comodità */ }
        aggiornaPannello(true);
        requestAnimationFrame(posizionaSopra);
    }

    function aggiornaPannello(forza = false) {
        $$('[data-p]', radiceEl).forEach(b => b.classList.toggle('attivo', b.dataset.p === st.pannello));
        pannelloEl.hidden = !st.pannello;
        editorEl.classList.toggle('con-pannello', !!st.pannello);
        if (!st.pannello) return;
        // Mentre si scrive nel pannello non lo si ridisegna (si perderebbe il cursore)
        const chiave = st.pannello + ':' + [...st.sel].join(',') + ':' + (st.arco || '') + ':' + (st.arcoDa || '');
        if (!forza && pannelloEl.contains(document.activeElement) && pannelloEl._chiave === chiave
            && document.activeElement.matches('input[type=text], input[type=url], input[type=search], textarea')) return;
        pannelloEl._chiave = chiave;
        if (st.pannello === 'aspetto') st.pannello = 'disposizione';   // pannello di prima, ricordato nel browser
        const titoli = { disposizione: 'Disposizione', tema: 'Tema e linee', stile: 'Stile', icone: 'Icone', nota: 'Nota e dettagli', struttura: 'Struttura' };
        const fabbrica = { disposizione: pannelloDisposizione, tema: pannelloTema, stile: pannelloStile, icone: pannelloIcone, nota: pannelloNota, struttura: pannelloStruttura }[st.pannello];
        if (!fabbrica) { st.pannello = null; pannelloEl.hidden = true; editorEl.classList.remove('con-pannello'); return; }
        const corpo = fabbrica();
        const scorrimento = pannelloEl.querySelector('.pannello-corpo') ? pannelloEl.querySelector('.pannello-corpo').scrollTop : 0;
        pannelloEl.innerHTML = `
            <div class="pannello-testa"><h2>${titoli[st.pannello]}</h2>${pulsante('chiudi-pannello', ico('chiudi'), 'Chiudi il pannello')}</div>
            <div class="pannello-corpo">${corpo}</div>`;
        sezioniApribili();
        pannelloEl.querySelector('.pannello-corpo').scrollTop = scorrimento;
    }

    // Sezioni dei pannelli che si aprono e chiudono con un clic sul titolo. Quelle chiuse restano chiuse in tutte le
    // mappe (in questo browser): una sezione è "pannello:titolo"
    const CHIAVE_SEZIONI = 'flashcard-mappe-sezioni-chiuse';
    const sezioniChiuse = (() => { try { return JSON.parse(localStorage.getItem(CHIAVE_SEZIONI) || '{}') || {}; } catch (e) { return {}; } })();

    function sezioniApribili() {
        $$('.pannello-sezione', pannelloEl).forEach(sez => {
            const h = sez.firstElementChild;
            if (!h || h.tagName !== 'H3') return;
            const chiave = st.pannello + ':' + h.textContent.trim();
            const chiusa = !!sezioniChiuse[chiave];
            sez.classList.add('apribile');
            sez.classList.toggle('chiusa', chiusa);
            // Reset: riporta i valori della sezione a quelli predefiniti (RESET); spento se lo sono già
            const r = RESET[sez.dataset.reset];
            const reset = r ? `<button type="button" class="pannello-reset" data-reset-sezione="${sez.dataset.reset}" ${r.serve() ? '' : 'disabled'}
                title="Riporta ai valori predefiniti: ${esc(r.valori)}" aria-label="Reset: ${esc(r.nome)}">${ico('ruota')}Reset</button>` : '';
            h.innerHTML = `<button type="button" class="pannello-interruttore" data-sezione="${esc(chiave)}" aria-expanded="${!chiusa}" title="${chiusa ? 'Apri' : 'Chiudi'} la sezione">${ico('destra', 'freccia-sezione')}<span>${h.innerHTML}</span></button>${reset}`;
        });
    }

    function alternaSezione(b) {
        const sez = b.closest('.pannello-sezione');
        const chiusa = !sez.classList.contains('chiusa');
        sez.classList.toggle('chiusa', chiusa);
        b.setAttribute('aria-expanded', String(!chiusa));
        b.title = `${chiusa ? 'Apri' : 'Chiudi'} la sezione`;
        if (chiusa) sezioniChiuse[b.dataset.sezione] = true; else delete sezioniChiuse[b.dataset.sezione];
        try { localStorage.setItem(CHIAVE_SEZIONI, JSON.stringify(sezioniChiuse)); } catch (e) { /* resta per questa pagina */ }
    }

    const nessunNodo = testo => `<p class="pannello-vuoto">${testo}</p>`;

    function miniaturaDisposizione(tipo) {
        const linee = {
            orizzontale: 'M30 25 C40 25 40 10 50 10 M30 25 C40 25 40 40 50 40 M20 25 C10 25 10 10 2 10 M20 25 C10 25 10 40 2 40',
            verticale: 'M26 14 C26 24 8 22 8 34 M26 14 C26 24 26 24 26 34 M26 14 C26 24 44 22 44 34',
            su: 'M26 36 C26 26 8 28 8 16 M26 36 C26 26 26 26 26 16 M26 36 C26 26 44 28 44 16',
            lineare: 'M8 12 V40 M8 22 H22 M8 32 H22 M8 40 H22',
            radiale: 'M26 25 L8 10 M26 25 L44 10 M26 25 L8 40 M26 25 L44 40 M26 25 L26 4',
            libera: 'M26 25 Q16 6 6 14 M26 25 Q44 30 46 12 M26 25 Q20 40 10 42',
            destra: 'M18 25 C30 25 28 8 44 8 M18 25 H44 M18 25 C30 25 28 42 44 42',
            sinistra: 'M34 25 C22 25 24 8 8 8 M34 25 H8 M34 25 C22 25 24 42 8 42',
            eredita: 'M10 16 V32 Q10 38 16 38 H40 M34 32 L40 38 L34 44',
        }[tipo];
        const pos = { lineare: [2, 4], verticale: [18, 6], su: [18, 36], destra: [2, 20], sinistra: [34, 20], eredita: [2, 6] }[tipo] || [18, 20];
        return `<svg viewBox="0 0 52 50" aria-hidden="true"><path d="${linee}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="${pos[0]}" y="${pos[1]}" width="16" height="9" rx="4.5" fill="currentColor"/></svg>`;
    }

    // Anteprima di un tema: radice, quattro rami principali e qualche figlio, con forme, colori e linee del tema
    function anteprimaTema(t) {
        const lin = { ...Mappe.LINEE_BASE, ...t.linee };
        const sp = liv => (lin.affusolamento ? Math.max(lin.minimo, lin.inizio * Math.pow(lin.fattore, liv)) : lin.spessore);
        const L = i => ({ ...Mappe.BASE, ...(t.livelli[Math.min(i, t.livelli.length - 1)] || {}) });
        const p = t.paletta && t.paletta.length ? t.paletta : ['#888888'];
        const linee = [], nodi = [];
        const riquadro = (cx, cy, w, h, liv, col) => {
            const s = L(liv);
            const fill = s.riempimento === 'ramo' ? col : s.riempimento === 'tenue' ? Mappe.mescola(col, t.sfondo, t.scuro ? 0.32 : 0.2)
                : Mappe.coloreValido(s.riempimento) ? s.riempimento : null;
            const testo = fill ? (Mappe.luminanza(fill) > 0.45 ? '#1f1f24' : '#ffffff') : t.testo;
            const x = cx - w / 2, y = cy - h / 2;
            const sotto = s.forma === 'sottolineata';
            if (sotto) nodi.push(`<path d="M${x},${y + h} H${x + w}" stroke="${col}" stroke-width="${Math.max(1.2, sp(liv)).toFixed(1)}" stroke-linecap="round"/>`);
            else if (s.forma !== 'nessuna' || fill) {
                const r = ['pillola', 'ellisse'].includes(s.forma) ? h / 2 : s.forma === 'arrotondata' ? 5 : 2;
                const bordo = s.forma !== 'nessuna' && +s.spessore > 0;
                nodi.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill || t.sfondo}" stroke="${bordo ? col : 'none'}" stroke-width="${bordo ? Math.min(3, +s.spessore) : 0}"${s.forma === 'parallelogramma' ? ` transform="translate(${(cy * 0.25).toFixed(1)} 0) skewX(-14)"` : ''}/>`);
            }
            const lw = w * 0.58;
            nodi.push(`<rect x="${cx - lw / 2}" y="${cy - (s.grassetto ? 2 : 1.5) - (sotto ? 1 : 0)}" width="${lw}" height="${s.grassetto ? 4 : 3}" rx="1.5" fill="${testo}" opacity="${s.grassetto ? 0.8 : 0.55}"/>`);
            return { x, y, w, h, sotto, cx, cy };
        };
        const linea = (a, b, liv, col) => {
            const xm = (a.x + b.x) / 2;
            if (lin.forma === 'curva' && lin.affusolamento) {
                linee.push(`<path d="${Disposizione.nastro({ a, b, c1: { x: xm, y: a.y }, c2: { x: xm, y: b.y } }, sp(liv - 1), sp(liv))}" fill="${col}"/>`);
                return;
            }
            const d = lin.forma === 'dritta' ? `M${a.x},${a.y} L${b.x},${b.y}` : lin.forma === 'curva' ? `M${a.x},${a.y} C${xm},${a.y} ${xm},${b.y} ${b.x},${b.y}`
                : `M${a.x},${a.y} H${xm} V${b.y} H${b.x}`;
            linee.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${(lin.affusolamento ? (sp(liv - 1) + sp(liv)) / 2 : lin.spessore).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
        };
        const r = riquadro(120, 65, 58, 20, 0, t.radice);
        [[1, -1], [1, 1], [-1, -1], [-1, 1]].forEach(([lato, riga], i) => {
            const col = p[i % p.length];
            const a = riquadro(120 + lato * 66, 65 + riga * 30, 38, 14, 1, col);
            linea({ x: lato > 0 ? r.x + r.w : r.x, y: r.cy }, { x: lato > 0 ? a.x : a.x + a.w, y: a.sotto ? a.y + a.h : a.cy }, 1, col);
            [-1, 1].forEach(k => {
                const f = riquadro(120 + lato * 104, a.cy + k * 10, 24, 9, 2, col);
                linea({ x: lato > 0 ? a.x + a.w : a.x, y: a.sotto ? a.y + a.h : a.cy }, { x: lato > 0 ? f.x : f.x + f.w, y: f.sotto ? f.y + f.h : f.cy }, 2, col);
            });
        });
        return `<svg viewBox="0 0 240 130" aria-hidden="true"><rect width="240" height="130" rx="8" fill="${t.sfondo}"/>${linee.join('')}${nodi.join('')}</svg>`;
    }

    // Editor di un tema personale: colori, tavolozza dei rami, stile dei nodi per livello e linee
    function editorTema(base, nuovo) {
        if (!base) return;
        const NOMI = ['Radice', 'Rami principali', 'Secondo livello', 'Livelli successivi'];
        const lv = i => base.livelli[Math.min(i, base.livelli.length - 1)] || {};
        const opz = (lista, att) => lista.map(([v, t]) => `<option value="${esc(v)}" ${String(att) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('');
        const SCALE = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.5].map(v => [v, Math.round(v * 100) + '%']);
        const BORDI = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map(v => [v, v + ' px']);
        const riempimenti = att => [['nessuno', 'Nessuno'], ['tenue', 'Colore del ramo, chiaro'], ['ramo', 'Colore del ramo'],
            ...(Mappe.coloreValido(att) ? [[att, 'Colore ' + att]] : [])];
        const voceTavolozza = c => `<span class="voce-paletta"><input type="color" value="${c}" data-pal aria-label="Colore di un ramo"><button type="button" data-pal-togli title="Togli il colore" aria-label="Togli il colore">×</button></span>`;
        const l = base.linee;
        const leggi = el => {
            const v = n => $(`[name="${n}"]`, el);
            return {
                ...base, nome: v('nome').value.trim() || 'Il mio tema',
                sfondo: v('sfondo').value, testo: v('testo').value, radice: v('radice').value,
                paletta: $$('[data-pal]', el).map(i => i.value),
                livelli: [0, 1, 2, 3].map(i => {
                    const riga = $(`tr[data-livello="${i}"]`, el);
                    const q = n => $(`[name="${n}"]`, riga);
                    return {
                        ...lv(i), forma: q('forma').value, spessore: +q('spessore').value, scala: +q('scala').value,
                        riempimento: q('riempimento').value, grassetto: q('grassetto').checked, corsivo: q('corsivo').checked,
                    };
                }),
                linee: {
                    ...l, forma: v('lineaForma').value, affusolamento: v('affusolamento').checked,
                    inizio: +v('inizio').value || l.inizio, minimo: +v('minimo').value || l.minimo, spessore: +v('spessoreLinee').value || l.spessore,
                },
            };
        };
        Ui.modale({
            titolo: nuovo ? 'Nuovo tema' : 'Modifica il tema', classe: 'modale-tema',
            corpo: `
                <div class="editor-tema">
                    <div class="editor-tema-campi">
                        <label class="campo"><span>Nome</span><input type="text" name="nome" maxlength="60" value="${esc(base.nome)}"></label>
                        <div class="riga-colori-tema">
                            <label>Sfondo <input type="color" name="sfondo" value="${base.sfondo}"></label>
                            <label>Testo <input type="color" name="testo" value="${base.testo}"></label>
                            <label>Radice <input type="color" name="radice" value="${base.radice}"></label>
                        </div>
                        <span class="etichetta-campo">Colori dei rami principali, in ordine</span>
                        <div class="paletta-tema">${base.paletta.map(voceTavolozza).join('')}
                            <button type="button" class="btn btn-secondario btn-piccolo" data-pal-aggiungi>${ico('piu')}Colore</button></div>
                        <span class="etichetta-campo">Nodi</span>
                        <div class="tabella-scorrevole"><table class="tabella livelli-tema">
                            <thead><tr><th>Livello</th><th>Forma</th><th>Bordo</th><th>Testo</th><th>Riempimento</th><th title="Grassetto">G</th><th title="Corsivo">C</th></tr></thead>
                            <tbody>${NOMI.map((nome, i) => `<tr data-livello="${i}"><th>${nome}</th>
                                <td><select name="forma">${opz(Mappe.FORME, lv(i).forma || 'sottolineata')}</select></td>
                                <td><select name="spessore">${opz(BORDI, lv(i).spessore != null ? lv(i).spessore : 2)}</select></td>
                                <td><select name="scala">${opz(SCALE, lv(i).scala || 1)}</select></td>
                                <td><select name="riempimento">${opz(riempimenti(lv(i).riempimento), lv(i).riempimento || 'nessuno')}</select></td>
                                <td><input type="checkbox" name="grassetto" ${lv(i).grassetto ? 'checked' : ''} aria-label="Grassetto"></td>
                                <td><input type="checkbox" name="corsivo" ${lv(i).corsivo ? 'checked' : ''} aria-label="Corsivo"></td></tr>`).join('')}
                            </tbody></table></div>
                        <span class="etichetta-campo">Linee</span>
                        <div class="riga-campi-tema">
                            <label>Forma <select name="lineaForma">${opz(Mappe.FORME_LINEA, l.forma)}</select></label>
                            <label class="spunta-semplice"><input type="checkbox" name="affusolamento" ${l.affusolamento ? 'checked' : ''}> Affusolamento automatico</label>
                        </div>
                        <div class="riga-campi-tema">
                            <label>Alla radice <input type="number" name="inizio" min="1" max="24" step="0.5" value="${l.inizio}"> px</label>
                            <label>Minimo <input type="number" name="minimo" min="0.5" max="10" step="0.5" value="${l.minimo}"> px</label>
                            <label>Senza affusolamento <input type="number" name="spessoreLinee" min="0.5" max="12" step="0.5" value="${l.spessore}"> px</label>
                        </div>
                    </div>
                    <div class="editor-tema-anteprima" data-anteprima-tema>${anteprimaTema(base)}</div>
                </div>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                ...(nuovo ? [] : [{ testo: 'Elimina il tema', classe: 'btn-secondario', clic: async md => {
                    const ok = await Ui.conferma(`Elimini il tema <b>${esc(base.nome)}</b>? Le mappe che lo usano torneranno a «Naturale + colori».`,
                        { titolo: 'Eliminare il tema?', ok: 'Elimina', pericolo: true });
                    if (!ok) return;
                    md.chiudi();
                    Mappe.eliminaTema(base.id);
                    cambiato();
                } }]),
                { testo: nuovo ? 'Crea e usa' : 'Salva', classe: 'btn-primario', principale: true, clic: md => {
                    const t = Mappe.salvaTema(leggi(md.el));
                    md.chiudi();
                    modifica(() => { m.tema = t.id; m.paletta = null; m.coloreRadice = null; m.livelli = null; m.linee = null; });
                    Ui.toast(nuovo ? `Tema «${t.nome}» creato: lo trovi in tutte le mappe` : 'Tema salvato', 'successo');
                } },
            ],
            alApri: el => {
                const aggiorna = () => { $('[data-anteprima-tema]', el).innerHTML = anteprimaTema(Mappe.normalizzaTema(leggi(el))); };
                el.addEventListener('input', aggiorna);
                el.addEventListener('change', aggiorna);
                el.addEventListener('click', e => {
                    const aggiungi = e.target.closest('[data-pal-aggiungi]');
                    if (aggiungi) { aggiungi.insertAdjacentHTML('beforebegin', voceTavolozza('#888888')); aggiorna(); return; }
                    const togli = e.target.closest('[data-pal-togli]');
                    if (togli && $$('[data-pal]', el).length > 1) { togli.parentElement.remove(); aggiorna(); }
                });
            },
        });
    }

    // Disposizione: la disposizione di base, le distanze globali (tutta la mappa), le distanze tra i nodi selezionati
    // e la griglia di allineamento. Ogni sezione ha il suo Reset (RESET, qui sotto)
    function pannelloDisposizione() {
        const sp = m.spaziatura || 1, fr = m.spaziaturaFratelli || 1;
        const conDirezione = ['orizzontale', 'libera'].includes(m.disposizione);
        const g = griglia();
        const perc = v => Math.round(v * 100) + '%';
        return `
            <section class="pannello-sezione" data-reset="disposizione">
                <h3>Disposizione della mappa</h3>
                <div class="griglia-disposizioni">${Mappe.DISPOSIZIONI.map(([id, nome]) => `
                    <button type="button" class="scelta-disposizione${m.disposizione === id ? ' attivo' : ''}" data-disp="${id}">${miniaturaDisposizione(id)}<span>${nome}</span></button>`).join('')}
                </div>
                ${conDirezione ? `
                <label class="campo campo-compatto"><span>Rami principali</span>
                    <select data-direzione>
                        ${[['auto', 'Automatico'], ['orario', 'Automatico in senso orario'], ['destra', 'Tutti a destra'], ['sinistra', 'Tutti a sinistra']]
                            .map(([v, t]) => `<option value="${v}" ${m.direzione === v ? 'selected' : ''}>${t}</option>`).join('')}
                    </select></label>` : ''}
            </section>
            <section class="pannello-sezione" data-reset="distanze-globali">
                <h3>Distanze globali</h3>
                <label class="campo campo-compatto"><span>Spazio tra tutti i nodi <b data-sp-valore>${perc(sp)}</b></span>
                    <input type="range" min="0.6" max="2" step="0.1" value="${sp}" data-spaziatura></label>
                <label class="campo campo-compatto"><span>Distanza tra fratelli <b data-fr-valore>${perc(fr)}</b></span>
                    <input type="range" min="0.2" max="12" step="0.1" value="${fr}" data-fratelli></label>
            </section>
            <section class="pannello-sezione" data-reset="distanze-scelti">
                <h3>Distanze tra nodi selezionati</h3>
                ${controlliDistanzaScelti()}
            </section>
            <section class="pannello-sezione" data-reset="griglia">
                <h3>Griglia di allineamento</h3>
                <label class="spunta-semplice" title="Ctrl+G; con Alt premuto sposti i nodi liberamente"><input type="checkbox" data-griglia-attiva ${g.attiva ? 'checked' : ''}> <b>Aggancia i nodi alla griglia</b></label>
                <label class="campo campo-compatto"><span>Passo della griglia <b data-gr-valore>${g.passo} px</b></span>
                    <input type="range" min="10" max="80" step="5" value="${g.passo}" data-griglia-passo></label>
            </section>`;
    }

    // ---- Reset delle sezioni dei pannelli ---------------------------------------------------------------
    // Ogni sezione con data-reset ha nel titolo il pulsante Reset, che riporta i suoi valori a quelli predefiniti: per la
    // mappa quelli di una mappa nuova, per i nodi scelti quelli del tema (o del loro stile predefinito). Il pulsante è
    // spento se i valori sono già quelli. serve() = c'è qualcosa da riportare; fai() = lo riporta (dentro una modifica)
    const CHIAVI_TESTO = ['grassetto', 'corsivo', 'sottolineato', 'barrato', 'scala', 'allinea', 'coloreTesto', 'colore', 'riempimento'];
    const CHIAVI_FORMA = ['forma', 'tratto', 'spessore', 'coloreBordo', 'sottolineatura'];
    const nodiScelti = () => [...st.sel].map(id => m.nodi[id]).filter(Boolean);
    const conStile = chiavi => nodiScelti().some(n => n.stile && chiavi.some(k => k in n.stile));
    const togliStile = chiavi => nodiScelti().forEach(n => { if (n.stile) chiavi.forEach(k => { delete n.stile[k]; }); });
    const RESET = {
        disposizione: {
            nome: 'Disposizione della mappa', valori: 'orizzontale, rami principali automatici',
            serve: () => m.disposizione !== 'orizzontale' || (m.direzione || 'auto') !== 'auto' || m.nodi[m.radice].figli.some(f => m.nodi[f] && m.nodi[f].lato),
            fai: () => {
                raddrizza(null);
                m.disposizione = 'orizzontale';
                m.direzione = 'auto';
                m.nodi[m.radice].figli.forEach(f => { if (m.nodi[f]) m.nodi[f].lato = null; });
            },
            dopo: () => requestAnimationFrame(() => adatta()),
        },
        'distanze-globali': {
            nome: 'Distanze globali', valori: 'spazio tra tutti i nodi 100%, distanza tra fratelli 100%',
            serve: () => (+m.spaziatura || 1) !== 1 || (+m.spaziaturaFratelli || 1) !== 1,
            fai: () => { m.spaziatura = 1; m.spaziaturaFratelli = null; },
        },
        'distanze-scelti': {
            nome: 'Distanze tra nodi selezionati', valori: 'gli spazi tra i nodi scelti tornano come quelli tra gli altri fratelli (100%)',
            serve: () => bersagliDistanza().some(id => distanzaDi(id) !== 1),
            fai: () => impostaDistanza(bersagliDistanza(), 1),
        },
        griglia: {
            nome: 'Griglia di allineamento', valori: 'spenta, passo 20 px', senzaStoria: true,
            serve: () => griglia().attiva || griglia().passo !== 20,
            fai: () => impostaGriglia({ attiva: false, passo: 20 }),
        },
        tema: {
            nome: 'Tema', valori: 'il tema Naturale, senza colori e livelli propri della mappa',
            serve: () => m.tema !== 'naturale' || !!(m.paletta || m.coloreRadice || m.livelli || m.linee),
            fai: () => { m.tema = 'naturale'; m.paletta = null; m.coloreRadice = null; m.livelli = null; m.linee = null; },
        },
        linee: {
            nome: 'Linee della mappa', valori: 'le linee del tema',
            serve: () => !!m.linee,
            fai: () => { m.linee = null; },
        },
        testo: {
            nome: 'Testo', valori: 'carattere, dimensione, allineamento e colori del tema (o dello stile predefinito) per i nodi scelti',
            serve: () => conStile(CHIAVI_TESTO),
            fai: () => togliStile(CHIAVI_TESTO),
        },
        forma: {
            nome: 'Forma e bordo', valori: 'forma, bordo e linea sotto il nodo del tema (o dello stile predefinito) per i nodi scelti',
            serve: () => conStile(CHIAVI_FORMA),
            fai: () => togliStile(CHIAVI_FORMA),
        },
        'linea-padre': {
            nome: 'Linea verso il nodo padre', valori: 'linea del tema, senza curve o punti di passaggio',
            serve: () => idsCollegamento().some(id => { const n = m.nodi[id]; return !!(n.piega || n.percorso || (n.stile && Mappe.CHIAVI_COLLEGAMENTO.some(k => k in n.stile))); }),
            fai: () => idsCollegamento().forEach(id => {
                const n = m.nodi[id];
                if (n.stile) Mappe.CHIAVI_COLLEGAMENTO.forEach(k => { delete n.stile[k]; });
                n.piega = null;
                n.percorso = null;
            }),
        },
        dimensioni: {
            nome: 'Dimensioni del nodo', valori: 'larghezza automatica, senza minimi',
            serve: () => nodiScelti().some(n => +n.larghezza > 0) || conStile(['larghezzaMin', 'altezzaMin']),
            fai: () => { nodiScelti().forEach(n => { delete n.larghezza; }); togliStile(['larghezzaMin', 'altezzaMin']); },
        },
    };

    function resetSezione(chiave) {
        const r = RESET[chiave];
        if (!r || !r.serve()) return;
        if (r.senzaStoria) r.fai(); else modifica(() => { r.fai(); });
        if (r.dopo) r.dopo();
        aggiornaPannello(true);
        posizionaSopra();
        Ui.toast(`${r.nome}: valori predefiniti`, 'successo', 2000);
    }

    // Tema e linee di tutta la mappa
    function pannelloTema() {
        const lin = Mappe.tema(m).linee;
        return `
            <section class="pannello-sezione" data-reset="tema">
                <h3>Tema</h3>
                <div class="griglia-temi">${Mappe.temi().map(t => `
                    <div class="scheda-tema">
                        <button type="button" class="scelta-tema${m.tema === t.id && !m.livelli ? ' attivo' : ''}" data-tema-mappa="${esc(t.id)}">${anteprimaTema(t)}<span>${esc(t.nome)}</span></button>
                        ${t.personale ? `<button type="button" class="modifica-tema" data-tema-modifica="${esc(t.id)}" title="Modifica il tema" aria-label="Modifica il tema ${esc(t.nome)}">${ico('matita')}</button>` : ''}
                    </div>`).join('')}
                    <button type="button" class="scelta-tema nuovo-tema" data-tema-nuovo>${ico('piu')}<span>Nuovo tema</span></button>
                </div>
            </section>
            <section class="pannello-sezione" data-reset="linee">
                <h3>Linee della mappa</h3>
                <div class="riga-bottoni">${Mappe.FORME_LINEA.map(([v, t]) => `<button type="button" class="${lin.forma === v ? 'attivo' : ''}" data-linee="forma" data-valore="${v}" title="${t}">${iconaLinea(v)}</button>`).join('')}</div>
                <label class="spunta-semplice"><input type="checkbox" data-linee-auto ${lin.affusolamento ? 'checked' : ''}> <b>Affusolamento automatico</b></label>
                ${lin.affusolamento ? `
                <label class="campo campo-compatto"><span>Spessore alla radice <b data-val="inizio">${lin.inizio} px</b></span>
                    <input type="range" min="2" max="20" step="0.5" value="${lin.inizio}" data-linee-num="inizio"></label>
                <label class="campo campo-compatto"><span>Riduzione a ogni livello <b data-val="riduzione">${Math.round((1 - lin.fattore) * 100)}%</b></span>
                    <input type="range" min="0.1" max="0.7" step="0.05" value="${(1 - lin.fattore).toFixed(2)}" data-linee-num="riduzione"></label>
                <label class="campo campo-compatto"><span>Spessore minimo <b data-val="minimo">${lin.minimo} px</b></span>
                    <input type="range" min="0.5" max="6" step="0.5" value="${lin.minimo}" data-linee-num="minimo"></label>` : `
                <label class="campo campo-compatto"><span>Spessore delle linee <b data-val="spessore">${lin.spessore} px</b></span>
                    <input type="range" min="0.5" max="10" step="0.5" value="${lin.spessore}" data-linee-num="spessore"></label>`}
            </section>`;
    }

    // ---- Griglia di allineamento --------------------------------------------------------------------

    function griglia() {
        const g = m.griglia || {};
        return { attiva: !!g.attiva, passo: limita(+g.passo || 20, 10, 80) };
    }

    function impostaGriglia(cambi) {
        m.griglia = { ...griglia(), ...cambi };
        cambiatoSenzaStoria();
        mostraGriglia();
        $$('[data-a="griglia"]', radiceEl).forEach(b => b.classList.toggle('attivo', griglia().attiva));
    }

    // I punti della griglia sullo sfondo, che seguono zoom e spostamento della vista
    function mostraGriglia() {
        const g = griglia();
        tela.classList.toggle('con-griglia', g.attiva);
        if (!g.attiva || !st.vista) { tela.style.backgroundSize = ''; tela.style.backgroundPosition = ''; return; }
        const passo = g.passo * st.vista.zoom;
        tela.style.backgroundSize = `${passo}px ${passo}px`;
        tela.style.backgroundPosition = `${st.vista.x}px ${st.vista.y}px`;
    }

    // Il punto della griglia più vicino (in coordinate della mappa)
    function sullaGriglia(v) { const p = griglia().passo; return Math.round(v / p) * p; }

    function idsCollegamento() {
        if (st.arco && m.nodi[st.arco]) return [st.arco];
        return [...st.sel].filter(id => m.nodi[id] && m.nodi[id].genitore);
    }

    // ---- Curvatura semplice delle linee ---------------------------------------------------------------
    // Al posto dei punti di passaggio messi a mano: un punto a metà della linea (arco) o due opposti (onda a S),
    // lontani dalla linea dritta quanto dice il cursore (−100…100 = metà della lunghezza della linea; 0 = linea normale)
    function curvaturaDi(percorso) {
        if (!Disposizione.percorsoValido(percorso)) return { forma: null, valore: 0, aMano: false };
        const [p, q] = percorso;
        if (percorso.length === 1 && Math.abs(p.u - 0.5) < 0.01) return { forma: 'arco', valore: Math.round(p.v * 200), aMano: false };
        if (percorso.length === 2 && Math.abs(p.u - 1 / 3) < 0.01 && Math.abs(q.u - 2 / 3) < 0.01 && Math.abs(p.v + q.v) < 0.002) {
            return { forma: 'onda', valore: Math.round(p.v * 200), aMano: false };
        }
        return { forma: null, valore: 0, aMano: true };
    }

    function percorsoCurvo(forma, valore) {
        const v = Math.round(limita(+valore || 0, -100, 100) / 200 * 10000) / 10000;
        if (!v) return null;
        return forma === 'onda' ? [{ u: 0.3333, v }, { u: 0.6667, v: -v }] : [{ u: 0.5, v }];
    }

    function controlliCurvatura(ids) {
        const n = m.nodi[ids[0]];
        const cv = curvaturaDi(n.percorso);
        const forma = cv.forma || st.formaCurva || 'arco';
        const att = cond => (cond ? ' attivo' : '');
        return `
            <span class="etichetta-campo">Curvatura</span>
            <div class="riga-curvatura">
                <div class="riga-bottoni">
                    <button type="button" class="${att(forma === 'arco')}" data-curva-forma="arco" title="Ad arco">${iconaCurva('arco')}</button>
                    <button type="button" class="${att(forma === 'onda')}" data-curva-forma="onda" title="A onda (S)">${iconaCurva('onda')}</button>
                </div>
                <input type="range" min="-100" max="100" step="5" value="${cv.valore}" data-curvatura aria-label="Curvatura della linea">
                <b data-curva-valore>${cv.aMano ? 'a mano' : cv.valore}</b>
            </div>`;
    }

    function iconaCurva(forma) {
        const d = forma === 'onda' ? 'M2 9 C7 1 10 1 14 8 S21 15 26 7' : 'M2 12 Q14 -2 26 12';
        return `<svg class="icona-linea" viewBox="0 0 28 16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    }

    function applicaCurvatura(valore, forma) {
        const ids = idsCollegamento().filter(id => !st.arcoDa && !(geo.get(id) || {}).raccordo);
        modificaContinua('curva:' + ids.join(), () => ids.forEach(id => {
            const n = m.nodi[id];
            n.piega = null;
            n.percorso = percorsoCurvo(forma, valore);
        }));
    }

    function controlliCollegamento() {
        const ids = idsCollegamento();
        const n = m.nodi[ids[0]];
        const b = geo.get(ids[0]);
        const c = Mappe.collegamento(m, n, b ? b.colore : Mappe.tema(m).radice);
        const att = cond => (cond ? ' attivo' : '');
        const SPESSORI = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
        return `
            <span class="etichetta-campo">Forma</span>
            <div class="riga-bottoni">${Mappe.FORME_LINEA.map(([v, t]) => `<button type="button" class="${att(c.forma === v)}" data-coll="lineaForma" data-valore="${v}" title="${t}">${iconaLinea(v)}</button>`).join('')}</div>
            <span class="etichetta-campo">Tratto</span>
            <div class="lista-scelte">${Mappe.TRATTI_LINEA.map(([v, t]) => `<button type="button" class="${att(c.tratto === v)}" data-coll="linea" data-valore="${v}">${iconaLinea(v)}<span>${t}</span></button>`).join('')}</div>
            ${c.tratto === 'auto' ? '' : `
            <label class="campo campo-compatto"><span>Spessore</span>
                <select data-coll-num="lineaSpessore">${SPESSORI.map(v => `<option value="${v}" ${Math.abs(c.spessore - v) < 0.01 ? 'selected' : ''}>${v} px</option>`).join('')}
                    ${SPESSORI.some(v => Math.abs(c.spessore - v) < 0.01) ? '' : `<option value="${c.spessore}" selected>${c.spessore} px</option>`}</select></label>`}
            <span class="etichetta-campo">Frecce</span>
            <div class="riga-bottoni">
                ${[['nessuna', '—', 'nessuna'], ['semplice', '‹', 'semplice'], ['piena', '◀', 'piena']].map(([v, t, d]) => `<button type="button" class="${att(c.frecciaInizio === v)}" data-coll="frecciaInizio" data-valore="${v}" title="All'inizio: ${d}">${t}</button>`).join('')}
                <span class="mappa-pop-sep"></span>
                ${[['nessuna', '—', 'nessuna'], ['semplice', '›', 'semplice'], ['piena', '▶', 'piena']].map(([v, t, d]) => `<button type="button" class="${att(c.frecciaFine === v)}" data-coll="frecciaFine" data-valore="${v}" title="Alla fine: ${d}">${t}</button>`).join('')}
            </div>
            <div class="campi-colore">${campoColore('coloreLinea', 'Colore della linea', (n.stile || {}).coloreLinea, c.colore)}</div>
            ${!st.arcoDa && !(b && b.raccordo) ? controlliCurvatura(ids) : ''}`;
    }

    function pannelloCollegamento() {
        const n = m.nodi[st.arco];
        const b = geo.get(st.arco);
        const nome = x => '«' + esc(Ui.tronca(Mappe.testoSemplice(x && x.testo) || '(vuoto)', 30)) + '»';
        const da = st.arcoDa && m.nodi[st.arcoDa];
        let testa, extra = '';
        if (b && b.raccordo) {
            const membri = b.raccordo.nodi.map(x => m.nodi[x]).filter(Boolean);
            testa = `Raccordo da ${membri.map(nome).join(', ')} a ${nome(n)}.`;
            extra = `
                <section class="pannello-sezione">
                    <h3>Raccordo</h3>
                    <div class="lista-scelte">
                        <button type="button" class="${b.raccordo.graffa ? '' : 'attivo'}" data-racc="linee" title="Una linea da ogni nodo">${iconaLinea('curva')}<span>Linee</span></button>
                        <button type="button" class="${b.raccordo.graffa ? 'attivo' : ''}" data-racc="graffa" title="Una graffa su tutti i nodi"><b class="segno-graffa">}</b><span>Graffa</span></button>
                    </div>
                    ${da ? `<button type="button" class="btn btn-secondario btn-piccolo" data-coll-az="scollega">Togli ${nome(da)} dal raccordo</button>` : ''}
                </section>`;
        } else if (da) {
            testa = `Linea in più da ${nome(da)} a ${nome(n)}: ${nome(n)} è figlio comune anche di ${nome(m.nodi[n.genitore])}.`;
            extra = `<button type="button" class="btn btn-secondario btn-piccolo" data-coll-az="scollega">Togli questa linea</button>`;
        } else {
            testa = `Linea da ${nome(m.nodi[n.genitore])} a ${nome(n)}.`;
            extra = n.piega || Disposizione.percorsoValido(n.percorso)
                ? `<button type="button" class="btn btn-secondario btn-piccolo" data-coll-az="raddrizza" title="Toglie i punti di passaggio messi a mano">Raddrizza la linea</button>` : '';
        }
        return `
            <p class="pannello-nota">${testa}</p>
            ${extra}
            <section class="pannello-sezione" data-reset="linea-padre"><h3>Linea</h3>${controlliCollegamento()}</section>
            <div class="pannello-azioni">
                <button type="button" class="btn btn-secondario btn-piccolo" data-coll-az="ramo" title="Stesso stile per tutte le linee del ramo che parte da qui">Applica a tutto il ramo</button>
            </div>`;
    }

    // Dimensione del testo in punti, come Word: 10,5 pt = la dimensione normale (scala 1, 14 px sullo schermo)
    const PT_BASE = 10.5;
    const DIMENSIONI_PT = [6, 7, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72];
    const inPunti = scala => Math.round((+scala || 1) * PT_BASE * 2) / 2;
    const testoPunti = pt => String(pt).replace('.', ',');

    // Campo della dimensione: si scrive un numero o si sceglie dall'elenco (come in Word e Fogli Google)
    function campoDimensione(attributo, scala, titolo = 'Dimensione del testo (punti)') {
        const pt = inPunti(scala);
        return `<label class="campo-pt" title="${titolo}"><input type="number" min="4" max="96" step="0.5" value="${pt}" ${attributo} list="mappa-dimensioni-pt" aria-label="${titolo}"><span>pt</span></label>
            <datalist id="mappa-dimensioni-pt">${DIMENSIONI_PT.map(v => `<option value="${v}">`).join('')}</datalist>`;
    }

    // Colore compatto: un pulsante con il colore attuale ("A" = automatico) che apre la tavolozza in una tendina.
    // tipo: coloreTesto | colore | riempimento (stile del nodo), sott (linea sotto il nodo), coloreLinea (linea verso il padre)
    function campoColore(tipo, nome, proprio, effettivo, titolo = '', nessuno = false) {
        const auto = !proprio;
        const vuoto = proprio === 'nessuno' || (!proprio && tipo === 'riempimento' && !effettivo);
        const mostra = Mappe.coloreValido(proprio) ? proprio : Mappe.coloreValido(effettivo) ? effettivo : null;
        return `<button type="button" class="campo-colore" data-campo-colore="${tipo}" data-nessuno="${nessuno ? 1 : ''}" title="${esc(titolo || nome)}">
            <span class="campione${vuoto ? ' senza-colore' : ''}" style="${mostra && !vuoto ? `background:${mostra}` : ''}">${auto ? 'A' : ''}</span>
            <span class="campo-colore-nome">${esc(nome)}<small>${vuoto ? 'nessuno' : auto ? 'automatico' : esc(proprio)}</small></span>
            ${ico('giu')}</button>`;
    }

    function applicaColore(tipo, v) {
        if (tipo === 'sott') applicaSottolineatura('colore', v);
        else if (tipo === 'coloreLinea') applicaCollegamento('coloreLinea', v);
        else applicaStile(tipo, v);
    }

    function apriTavolozza(bottone) {
        const tipo = bottone.dataset.campoColore;
        const attuale = tipo === 'sott' ? ((m.nodi[st.attivo] || {}).stile || {}).sottolineatura?.colore
            : tipo === 'coloreLinea' ? ((m.nodi[idsCollegamento()[0]] || {}).stile || {}).coloreLinea
                : ((m.nodi[st.attivo] || {}).stile || {})[tipo];
        Ui.tendina(bottone, {
            classe: 'tendina-colori',
            html: sceltaColori('data-tav data-c', attuale || '', { auto: true, nessuno: !!bottone.dataset.nessuno }),
            alApri: el => {
                el.addEventListener('click', e => {
                    const b = e.target.closest('button[data-tav]');
                    if (!b) return;
                    Ui.chiudiMenu();
                    applicaColore(tipo, coloreScelto(b, 'data-c'));
                });
                el.addEventListener('change', e => {
                    if (!e.target.matches('[data-tav-libero], [data-c-libero]')) return;
                    Ui.chiudiMenu();
                    applicaColore(tipo, e.target.value);
                });
            },
        });
    }

    // Anteprima di uno stile predefinito sul suo pulsante: "Aa" con colore, grassetto, corsivo, dimensione
    function anteprimaStile(x) {
        const st2 = x.stile || {};
        const col = Mappe.coloreValido(st2.coloreTesto) ? st2.coloreTesto : '';
        const fondo = Mappe.coloreValido(st2.riempimento) ? st2.riempimento : '';
        return `<span class="anteprima-stile" style="${col ? `color:${col};` : ''}${fondo ? `background:${fondo};` : ''}font-weight:${st2.grassetto ? 700 : 500};font-style:${st2.corsivo ? 'italic' : 'normal'};${st2.sottolineato ? 'text-decoration:underline;' : ''}font-size:${Math.max(0.7, Math.min(1.25, +st2.scala || 1))}em">Aa</span>`;
    }

    function pannelloStile() {
        if (st.arco && m.nodi[st.arco]) return pannelloCollegamento();
        if (!st.sel.size) return nessunNodo('Nessun nodo selezionato');
        const s = stileAttivo();
        const nodo = m.nodi[st.attivo] || {};
        const proprio = nodo.stile || {};
        const att = (cond) => (cond ? ' attivo' : '');
        const stili = Mappe.stiliPredefiniti();
        const usato = Mappe.stilePredefinito(nodo.stilePredefinito);
        const so = s.sottolineatura || {};
        return `
            ${st.sel.size > 1 ? `<p class="pannello-nota">${st.sel.size} nodi selezionati</p>` : ''}
            <section class="pannello-sezione">
                <h3>Stili predefiniti</h3>
                ${stili.length ? `<div class="stili-predefiniti">${stili.map((x, i) => `
                    <button type="button" class="chip-stile${att(usato && usato.id === x.id)}" data-stile-pre="${x.id}" title="Applica «${esc(x.nome)}» ai nodi scelti${i < 9 ? ` (Ctrl+Alt+${i + 1})` : ''}">${anteprimaStile(x)}<span>${esc(x.nome)}</span></button>`).join('')}
                </div>` : ''}
                <div class="pannello-azioni">
                    <button type="button" class="btn btn-secondario btn-piccolo" data-stile-pre-az="nuovo" title="Un nuovo stile con l'aspetto di questo nodo">${ico('piu')}Nuovo dallo stile del nodo</button>
                    ${usato ? `<button type="button" class="btn btn-secondario btn-piccolo" data-stile-pre-az="aggiorna" title="Lo stile prende l'aspetto attuale di questo nodo: cambiano tutti i nodi che lo usano">Aggiorna «${esc(usato.nome)}»</button>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-stile-pre-az="togli">Togli lo stile</button>
                        <button type="button" class="btn-icona" data-stile-pre-az="menu" title="Rinomina o elimina «${esc(usato.nome)}»" aria-label="Altre azioni sullo stile">${ico('altro')}</button>` : ''}
                </div>
            </section>
            <section class="pannello-sezione" data-reset="testo">
                <h3>Testo</h3>
                <div class="riga-bottoni">
                    <button type="button" class="${att(s.grassetto)}" data-stile-inv="grassetto" title="Grassetto (Ctrl+B)"><b>G</b></button>
                    <button type="button" class="${att(s.corsivo)}" data-stile-inv="corsivo" title="Corsivo (Ctrl+I)"><i>C</i></button>
                    <button type="button" class="${att(s.sottolineato)}" data-stile-inv="sottolineato" title="Sottolineato (Ctrl+U)"><u>S</u></button>
                    <button type="button" class="${att(s.barrato)}" data-stile-inv="barrato" title="Barrato"><s>B</s></button>
                    <span class="mappa-pop-sep"></span>
                    ${campoDimensione('data-stile-pt', s.scala)}
                </div>
                <div class="riga-bottoni">
                    ${[['sinistra', '⇤', 'a sinistra'], ['centro', '↔', 'al centro'], ['destra', '⇥', 'a destra']].map(([v, t, d]) => `<button type="button" class="${att(s.allinea === v)}" data-stile="allinea" data-valore="${v}" title="Allinea ${d}">${t}</button>`).join('')}
                </div>
                <div class="campi-colore">
                    ${campoColore('coloreTesto', 'Testo', proprio.coloreTesto, s.coloreTesto)}
                    ${campoColore('colore', 'Ramo', proprio.colore, s.colore, 'Linee, bordo e sottolineatura del ramo')}
                    ${campoColore('riempimento', 'Riempimento', proprio.riempimento, s.riempimento, '', true)}
                </div>
            </section>
            <section class="pannello-sezione" data-reset="forma">
                <h3>Forma e bordo</h3>
                <div class="griglia-forme">${Mappe.FORME.map(([id, nome]) => `
                    <button type="button" class="scelta-forma${att(s.forma === id)}" data-stile="forma" data-valore="${id}" title="${nome}"><span class="anteprima-forma forma-${id}"></span></button>`).join('')}
                </div>
                ${s.forma === 'sottolineata' ? `
                <span class="etichetta-campo">Linea sotto il nodo</span>
                <div class="riga-bottoni">
                    ${['pieno', 'trattini', 'punti'].map(v => `<button type="button" class="${att((so.tratto || s.tratto || 'pieno') === v)}" data-sott="tratto" data-valore="${v}" title="${v}"><span class="tratto-${v}"></span></button>`).join('')}
                    <select data-sott-spessore title="Spessore della linea sotto il nodo">
                        <option value="" ${so.spessore ? '' : 'selected'}>Come la linea</option>
                        ${[0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8].map(v => `<option value="${v}" ${Math.abs((+so.spessore || 0) - v) < 0.01 ? 'selected' : ''}>${v} px</option>`).join('')}</select>
                </div>
                <div class="campi-colore">${campoColore('sott', 'Colore', so.colore, so.colore || s.coloreBordo)}</div>` : `
                <span class="etichetta-campo">Bordo</span>
                <div class="riga-bottoni">
                    ${['pieno', 'trattini', 'punti'].map(v => `<button type="button" class="${att((s.tratto || 'pieno') === v)}" data-stile="tratto" data-valore="${v}" title="Bordo ${v}"><span class="tratto-${v}"></span></button>`).join('')}
                    <select data-stile-spessore title="Spessore del bordo">${[0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map(v =>
                        `<option value="${v}" ${Math.abs((+s.spessore || 0) - v) < 0.01 ? 'selected' : ''}>${v} px</option>`).join('')}</select>
                </div>`}
            </section>
            ${idsCollegamento().length ? `<section class="pannello-sezione" data-reset="linea-padre"><h3>Linea verso il nodo padre</h3>${controlliCollegamento()}</section>` : ''}
            <section class="pannello-sezione" data-reset="dimensioni">
                <h3>Dimensioni del nodo</h3>
                ${[...st.sel].some(id => m.nodi[id] && +m.nodi[id].larghezza > 0)
                    ? `<p class="pannello-nota">${st.sel.size === 1 && +nodo.larghezza > 0 ? `Larghezza: ${Math.round(nodo.larghezza)} px` : 'Larghezza scelta a mano'}</p>
                       <button type="button" class="btn btn-secondario btn-piccolo" data-stile-az="larghezza-auto">Larghezza automatica</button>`
                    : '<p class="pannello-nota">Larghezza: automatica</p>'}
                <div class="riga-campi-piccoli">
                    <span>Minimo</span>
                    <label>largo <input type="number" min="0" max="800" step="10" value="${+s.larghezzaMin || 0}" data-stile-num="larghezzaMin"></label>
                    <label>alto <input type="number" min="0" max="600" step="10" value="${+s.altezzaMin || 0}" data-stile-num="altezzaMin"></label>
                </div>
            </section>
            <div class="pannello-azioni">
                <button type="button" class="btn btn-secondario btn-piccolo" data-stile-az="copia" title="Ctrl+Alt+C">Copia stile</button>
                <button type="button" class="btn btn-secondario btn-piccolo" data-stile-az="incolla" title="Ctrl+Alt+V" ${st.stileCopiato ? '' : 'disabled'}>Incolla stile</button>
                <button type="button" class="btn btn-fantasma btn-piccolo" data-stile-az="ripristina" title="Toglie le scelte fatte su questi nodi (anche lo stile predefinito)">Stile del tema</button>
            </div>`;
    }

    // ---- Stili predefiniti ------------------------------------------------------------------------

    // Dà lo stile ai nodi: le scelte fatte sul nodo che lo stile decide si tolgono, così si vede lo stile
    function applicaStilePredefinito(idStile, ids = [...st.sel]) {
        const x = Mappe.stilePredefinito(idStile);
        if (!x || !ids.length) return;
        modifica(() => ids.forEach(id => {
            const n = m.nodi[id];
            if (!n) return;
            n.stilePredefinito = x.id;
            if (n.stile) Object.keys(x.stile).forEach(k => { delete n.stile[k]; });
        }));
    }

    function chiediNome(titolo, iniziale = '') {
        return new Promise(risolvi => {
            let valore = null;
            Ui.modale({
                titolo, classe: 'modale-piccola',
                corpo: `<label class="campo"><span>Nome</span><input type="text" name="nome-stile" maxlength="40" value="${esc(iniziale)}" autofocus></label>`,
                alApri: el => { const i = $('[name=nome-stile]', el); i.select(); i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('.modale-piede .btn-primario', el.closest('.modale') || document).click(); } }); },
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: 'Salva', classe: 'btn-primario', principale: true, clic: md => { valore = $('[name=nome-stile]', md.el).value.trim(); if (!valore) return; md.chiudi(); } },
                ],
                alChiudere: () => risolvi(valore),
            });
        });
    }

    // L'aspetto proprio del nodo: lo stile predefinito che usa più le scelte fatte su di lui
    function aspettoNodo(n) {
        const pre = Mappe.stilePredefinito(n.stilePredefinito);
        return { ...(pre ? pre.stile : {}), ...(n.stile || {}) };
    }

    async function azioneStilePredefinito(az, ancora) {
        const n = m.nodi[st.attivo];
        if (!n) return;
        const usato = Mappe.stilePredefinito(n.stilePredefinito);
        if (az === 'nuovo') {
            const nome = await chiediNome('Nuovo stile predefinito', usato ? usato.nome + ' 2' : '');
            if (!nome) return;
            const x = Mappe.salvaStilePredefinito({ nome, stile: aspettoNodo(n) });
            applicaStilePredefinito(x.id, [...st.sel]);
            Ui.toast(`Stile «${x.nome}» creato: lo trovi in Stile → Stili predefiniti, in tutte le mappe`, 'successo', 3500);
        } else if (az === 'aggiorna' && usato) {
            Mappe.salvaStilePredefinito({ ...usato, stile: aspettoNodo(n) });
            modifica(() => { n.stile = {}; });
            Ui.toast(`«${usato.nome}» aggiornato: cambiano tutti i nodi che lo usano`, 'successo', 3000);
        } else if (az === 'togli') {
            modifica(() => st.sel.forEach(id => { if (m.nodi[id]) delete m.nodi[id].stilePredefinito; }));
        } else if (az === 'menu' && usato) {
            Ui.menu(ancora, [
                { testo: 'Rinomina', icona: 'matita', clic: async () => {
                    const nome = await chiediNome('Rinomina lo stile', usato.nome);
                    if (nome) { Mappe.salvaStilePredefinito({ ...usato, nome }); aggiornaPannello(true); }
                } },
                { testo: 'Elimina lo stile', icona: 'cestino', pericolo: true, clic: async () => {
                    if (!await Ui.conferma(`Elimini lo stile <b>${esc(usato.nome)}</b>? I nodi che lo usano (in tutte le mappe) tornano al loro aspetto.`, { titolo: 'Eliminare lo stile?', ok: 'Elimina', pericolo: true })) return;
                    Mappe.eliminaStilePredefinito(usato.id);
                } },
            ]);
            return;
        }
        aggiornaPannello(true);
    }

    // Linea sotto il nodo (forma sottolineata): colore, tratto e spessore suoi, che non cambiano le linee ai lati
    function applicaSottolineatura(k, v, ids = [...st.sel]) {
        modifica(() => ids.forEach(id => {
            const n = m.nodi[id];
            if (!n) return;
            n.stile = n.stile || {};
            const so = { ...(n.stile.sottolineatura || {}) };
            if (v == null || v === '') delete so[k]; else so[k] = v;
            if (Object.keys(so).length) n.stile.sottolineatura = so; else delete n.stile.sottolineatura;
        }));
    }

    function pannelloIcone() {
        if (!st.sel.size) return nessunNodo('Nessun nodo selezionato');
        const attuale = (m.nodi[st.attivo] || {}).icona;
        const mie = [...new Set(Object.values(m.nodi).map(n => n.icona).filter(i => String(i || '').startsWith('img:') && m.immagini[i.slice(4)]))];
        const bottone = i => `<button type="button" class="scelta-icona${attuale === i ? ' attivo' : ''}" data-icona="${esc(i)}" title="${esc(i.startsWith('n:') ? 'Numero ' + i.slice(2) : '')}">${iconaHtml(i)}</button>`;
        return `
            <div class="pannello-azioni">
                <button type="button" class="btn btn-secondario btn-piccolo" data-icona="">Nessuna icona</button>
                <button type="button" class="btn btn-secondario btn-piccolo" data-icona-carica>${ico('carica')}Carica icona</button>
            </div>
            ${mie.length ? `<section class="pannello-sezione"><h3>Le mie icone</h3><div class="griglia-icone">${mie.map(bottone).join('')}</div></section>` : ''}
            ${Object.entries(Mappe.ICONE).map(([gruppo, lista]) => `
                <section class="pannello-sezione"><h3>${gruppo}</h3><div class="griglia-icone">${lista.map(bottone).join('')}</div></section>`).join('')}`;
    }

    function pannelloNota() {
        const n = m.nodi[st.attivo];
        if (!n || st.sel.size !== 1) return nessunNodo(st.sel.size > 1 ? 'Più nodi selezionati' : 'Nessun nodo selezionato');
        return `
            <section class="pannello-sezione">
                <h3>Nota</h3>
                <textarea class="nota-nodo" data-nodo-campo="nota" rows="8" placeholder="Appunti, spiegazioni, esempi… Restano nel nodo senza ingombrare la mappa.">${esc(n.nota || '')}</textarea>
            </section>
            <section class="pannello-sezione">
                <h3>Link</h3>
                <input type="url" data-nodo-campo="link" value="${esc(n.link || '')}" placeholder="https://…">
            </section>
            <section class="pannello-sezione">
                <h3>Data e attività</h3>
                <div class="riga-campi-piccoli">
                    <input type="date" data-nodo-campo="data" value="${esc(n.data || '')}">
                    <label class="spunta-semplice"><input type="checkbox" data-nodo-spunta ${n.spunta != null ? 'checked' : ''}> Casella da spuntare</label>
                </div>
            </section>
            <section class="pannello-sezione">
                <h3>Immagini libere</h3>
                ${(n.figure || []).length ? `<div class="miniature-figure">${n.figure.map(f => `
                    <span class="miniatura-figura">
                        <button type="button" class="miniatura-figura-img" data-fig-scegli="${f.id}" title="Scegli l'immagine nella mappa">${m.immagini[f.img] ? `<img src="${m.immagini[f.img]}" alt="">` : ''}</button>
                        <button type="button" class="miniatura-figura-togli" data-fig-togli="${f.id}" title="Elimina l'immagine" aria-label="Elimina l'immagine">${ico('chiudi')}</button>
                    </span>`).join('')}</div>` : ''}
                <div class="azioni-riga">
                    <button type="button" class="btn btn-secondario btn-piccolo" data-fig-aggiungi title="Segue il nodo, ma spostandola non sposti i nodi">${ico('collega')}Aggiungi immagine libera</button>
                    ${immaginiDelNodo(n) > 1 ? `<button type="button" class="btn btn-fantasma btn-piccolo" data-img-tutte title="Le immagini libere e quella dentro il nodo">${ico('cestino')}Elimina tutte (${immaginiDelNodo(n)})</button>` : ''}
                </div>
            </section>
            <section class="pannello-sezione">
                <h3>Immagine dentro il nodo</h3>
                ${n.immagine && m.immagini[n.immagine.id] ? `
                    <label class="campo campo-compatto"><span>Larghezza <b data-img-valore>${n.immagine.larghezza} px</b></span>
                        <input type="range" min="40" max="600" step="10" value="${n.immagine.larghezza}" data-img-larghezza></label>
                    <div class="pannello-azioni">
                        <button type="button" class="btn btn-secondario btn-piccolo" data-img-dentro>Cambia</button>
                        <button type="button" class="btn btn-secondario btn-piccolo" data-img-fuori>Portala fuori dal nodo</button>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-img-togli>Togli l'immagine</button>
                    </div>` : `<button type="button" class="btn btn-secondario btn-piccolo" data-img-dentro>${ico('immagine')}Metti un'immagine dentro</button>
`}
            </section>`;
    }

    function pannelloStruttura() {
        const righe = [];
        const visita = (id, livello) => {
            const n = m.nodi[id];
            if (!n) return;
            righe.push(`<div class="riga-struttura${st.sel.has(id) ? ' attiva' : ''}" data-struttura="${id}" style="--rientro:${livello}">
                ${n.figli.length ? `<button type="button" class="giro" data-giro="${id}" aria-label="${n.chiuso ? 'Apri' : 'Chiudi'}">${n.chiuso ? '▸' : '▾'}</button>` : '<span class="giro"></span>'}
                <span class="testo-struttura">${iconaHtml(n.icona)}${esc(Mappe.testoSemplice(n.testo) || '(vuoto)')}</span></div>`);
            if (!n.chiuso) n.figli.forEach(f => visita(f, livello + 1));
        };
        visita(m.radice, 0);
        Mappe.radiciLibere(m).forEach(l => visita(l.id, 0));
        return `<div class="struttura">${righe.join('')}</div>`;
    }

    // ---- Menu --------------------------------------------------------------------------------------

    function menuNodo(id, x, y) {
        const n = m.nodi[id];
        if (!n) return;
        const ancora = { getBoundingClientRect: () => ({ left: x, right: x + 1, top: y, bottom: y, width: 1, height: 1 }) };
        const radice = id === m.radice;
        const multipla = st.sel.size > 1 && st.sel.has(id);
        Ui.menu(ancora, [
            multipla && { testo: 'Figlio comune dei nodi scelti', icona: 'piu', clic: () => figlioComune(false) },
            multipla && sonoFratelli([...st.sel]) && { testo: 'Graffa sui nodi scelti', icona: 'ramo', clic: () => figlioComune(true) },
            { testo: multipla ? 'Flashcard dei nodi scelti (IA)' : 'Flashcard da questo nodo (IA)', icona: 'carte', clic: () => flashcardDaiNodi(multipla ? [...st.sel] : [id]) },
            '-',
            { testo: 'Nuovo nodo figlio', icona: 'piu', clic: () => aggiungiFiglio(id) },
            !radice && n.genitore && { testo: 'Nuovo nodo fratello', icona: 'ramo', clic: () => aggiungiFratello(id) },
            { testo: 'Aggiungi etichetta', icona: 'testo-t', clic: () => aggiungiEtichetta(id) },
            { testo: 'Aggiungi immagine libera', icona: 'immagine', clic: () => scegliFigura(id) },
            (multipla ? [...st.sel] : [id]).some(x => m.nodi[x] && immaginiDelNodo(m.nodi[x])) && {
                testo: multipla ? 'Elimina le immagini dei nodi scelti' : 'Elimina le immagini del nodo', icona: 'cestino', pericolo: true,
                clic: () => eliminaImmaginiNodi(multipla ? [...st.sel] : [id]) },
            { testo: 'Collega a un altro nodo', icona: 'collega', clic: () => iniziaCollegamento(id) },
            { testo: radice ? 'Disposizione della mappa' : 'Disposizione dei figli', icona: 'ramo', clic: () => { seleziona(id); st.popDisp = id; posizionaSopra(); } },
            '-',
            !radice && { testo: 'Concentrati su questo ramo', icona: 'obiettivo', clic: () => concentra(id) },
            { testo: 'Esporta il ramo come immagine', icona: 'scarica', clic: () => esportaImmagine(id) },
            n.figli.length && !radice && { testo: n.chiuso ? 'Apri il ramo' : 'Chiudi il ramo', icona: n.chiuso ? 'occhio' : 'occhio-chiuso', clic: () => alternaRamo([id]) },
            n.figli.length && { testo: 'Seleziona tutto il ramo', icona: 'seleziona', clic: () => { seleziona(id); Mappe.discendenti(m, id).forEach(d => { if (geo.has(d)) st.sel.add(d); }); aggiornaSelezione(); } },
            Panoramica.sceglibile(m, id) && { testo: n.inPanoramica ? `Togli da «${Panoramica.NOME}»` : `Mostra in «${Panoramica.NOME}»`, icona: 'mappa', clic: () => {
                const metti = !n.inPanoramica;
                const ids = (st.sel.has(id) ? [...st.sel] : [id]).filter(x => Panoramica.sceglibile(m, x));
                modifica(() => ids.forEach(x => { m.nodi[x].inPanoramica = metti || null; }));
                Ui.toast(metti ? `${plurale(ids.length, 'nodo', 'nodi')} anche nella mappa «${Panoramica.NOME}» della materia` : `Tolto da «${Panoramica.NOME}»`, 'successo', 3000);
            } },
            generato(id) && n.rif.mappa && { testo: 'Apri nella sua mappa', icona: 'destra', clic: () => vaiAllOrigine(id) },
            '-',
            { testo: 'Copia', icona: 'copia', clic: () => { seleziona(id); const t = copia(); if (t) navigator.clipboard.writeText(t).catch(() => {}); } },
            { testo: 'Incolla qui', icona: 'carica', clic: async () => { let t = ''; try { t = await navigator.clipboard.readText(); } catch (e) { t = st.appunti ? st.appunti.testo : ''; } incolla(t, id); } },
            !radice && { testo: 'Duplica il ramo', icona: 'copia', clic: () => {
                let nuovo;
                modifica(() => { const p = n.genitore; nuovo = Mappe.incollaRamo(m, Mappe.copiaRamo(m, id), p, p ? m.nodi[p].figli.indexOf(id) + 1 : null); if (!p) { m.nodi[nuovo].x = (n.x || 0) + 40; m.nodi[nuovo].y = (n.y || 0) + 40; } });
                seleziona(nuovo);
            } },
            !radice && n.genitore && { testo: 'Stacca dal ramo (nodo libero)', icona: 'scollega', clic: () => {
                const b = geo.get(id);
                modifica(() => { Mappe.sposta(m, id, null); n.off = null; if (b) { n.x = b.x + b.w / 2 + 40; n.y = b.y + b.h / 2 + 40; } });
            } },
            '-',
            !radice && { testo: 'Elimina', icona: 'cestino', pericolo: true, clic: () => { seleziona(id); eliminaSelezionati(); } },
        ]);
    }

    function menuFigura(x, y) {
        const ref = st.fig, f = figura(ref);
        if (!f) return;
        const ancora = { getBoundingClientRect: () => ({ left: x, right: x + 1, top: y, bottom: y, width: 1, height: 1 }) };
        Ui.menu(ancora, [
            { testo: 'Guarda ingrandita', icona: 'occhio', clic: () => Ricco.ingrandisci(m.immagini[f.img]) },
            { testo: 'Più grande', icona: 'piu', clic: () => scaleFigura(1.25, ref) },
            { testo: 'Più piccola', icona: 'meno', clic: () => scaleFigura(0.8, ref) },
            !f.fluttuante && { testo: 'Rendila libera (segue il nodo, non sposta i nodi)', icona: 'collega', clic: () => alternaFluttuante(ref) },
            { testo: 'Mettila dentro il nodo', icona: 'immagine', clic: () => figuraDentro(ref) },
            '-',
            { testo: 'Elimina l\'immagine', icona: 'cestino', pericolo: true, clic: () => eliminaFigura(ref) },
        ]);
    }

    function menuTela(x, y) {
        const p = aMondo(x, y);
        const ancora = { getBoundingClientRect: () => ({ left: x, right: x + 1, top: y, bottom: y, width: 1, height: 1 }) };
        Ui.menu(ancora, [
            !st.focus && { testo: 'Nuovo nodo libero qui', icona: 'piu', clic: () => nodoLibero(p.x, p.y) },
            st.focus && { testo: 'Torna alla mappa intera', icona: 'sinistra', clic: () => concentra(m.radice) },
            { testo: 'Adatta alla finestra', icona: 'adatta', clic: () => adatta() },
            { testo: 'Seleziona tutto', icona: 'seleziona', clic: () => { st.sel = new Set(geo.keys()); st.attivo = st.focus || m.radice; aggiornaSelezione(); aggiornaPannello(); } },
        ]);
    }

    // ---- Flashcard dai nodi scelti -----------------------------------------------------------------
    // L'app prepara il piano della localizzazione (js/localizzazione.js) su tutta la mappa e tiene solo le carte dei nodi
    // scelti (con o senza i rami sotto): tag, risposte e rientri sono quelli della localizzazione, e le carte nascono
    // collegate ai loro nodi. Le domande le scrive l'assistente IA, che poi crea le carte nel set (si annulla dalla chat)
    function flashcardDaiNodi(ids = [...st.sel]) {
        ids = ids.filter(id => m.nodi[id]);
        if (!ids.length) { Ui.toast('Seleziona prima uno o più nodi (Ctrl + clic, oppure Ctrl + trascina dallo sfondo)', 'info', 5000); return; }
        if (!Dati.tuttiSet().length) { Ui.toast('Prima crea un set in cui mettere le flashcard', 'errore', 5000); return; }
        const nomi = ids.map(id => Mappe.testoSemplice(m.nodi[id].testo) || '(senza testo)');
        let piano = null;
        const prepara = el => {
            const setId = $('[name=set]', el).value;
            const conRami = $('[name=rami]', el).checked;
            const salta = $('[name=salta]', el).checked;
            const box = $('[data-conto-flashcard]', el);
            try {
                piano = Localizzazione.preparaPiano(JSON.parse(JSON.stringify(Materiali.alberoDaMappa(m))), { fonte: m.nome, mappaId: m.id, soloNodi: ids, conRami, setId, saltaEsistenti: salta });
                const n = piano.carte.length;
                const saltate = piano.solo_nodi_scelti ? piano.solo_nodi_scelti.carte_saltate_perche_gia_fatte : 0;
                box.innerHTML = n ? `L'IA scriverà <b>${plurale(n, 'flashcard', 'flashcard')}</b>${saltate ? `; ${plurale(saltate, 'nodo ha', 'nodi hanno')} già la sua nel set` : ''}.`
                    : saltate ? `Tutti i nodi scelti hanno già la loro flashcard in questo set.` : 'Nessuna flashcard da scrivere per questi nodi.';
                $('.modale-piede .btn-primario', el).disabled = !n;
            } catch (e) { piano = null; box.textContent = e.message; $('.modale-piede .btn-primario', el).disabled = true; }
        };
        Ui.modale({
            titolo: 'Flashcard dai nodi scelti', classe: 'modale-piccola',
            corpo: `
                <p>${ids.length === 1 ? 'Nodo scelto' : `${ids.length} nodi scelti`}: <b>${esc(nomi.slice(0, 4).join(' · '))}</b>${nomi.length > 4 ? ` e altri ${nomi.length - 4}` : ''}.</p>
                <p class="nota">Le domande le scrive l'assistente IA. Tag (generale, sottoramo, concetto N, dettaglio), risposte e rientri sono quelli
                    della creazione flashcard per profondità, e ogni carta resta collegata al suo nodo: nello studio la risposta mostra quella parte di mappa.</p>
                <label class="campo"><span class="etichetta">Set</span><select name="set">${Ui.opzioniSet(m.setId)}</select></label>
                <label class="spunta-riga"><input type="checkbox" name="rami" checked><span>Anche i rami sotto ai nodi scelti</span></label>
                <label class="spunta-riga"><input type="checkbox" name="salta" checked><span>Salta i nodi che hanno già una flashcard in questo set</span></label>
                <p class="conteggio-sessione" data-conto-flashcard></p>`,
            alApri: el => { prepara(el); el.addEventListener('change', () => prepara(el)); },
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: `${ico('scintille')}Scrivile con l'IA`, classe: 'btn-primario', principale: true, clic: md => {
                    if (!piano || !piano.carte.length) return;
                    const setId = $('[name=set]', md.el).value;
                    md.chiudi();
                    Assistente.apri({ setId });
                    Assistente.invia(`/profondita Scrivi le flashcard per profondità ${ids.length === 1 ? `del nodo «${nomi[0]}»` : `dei ${ids.length} nodi scelti`} della mappa «${m.nome}» e mettile nel set «${Dati.set(setId).nome}» (id ${setId}). Il piano è già pronto (piano_id ${piano.id}, ${plurale(piano.carte.length, 'carta', 'carte')}): non rifarlo, scrivi le domande e crea le carte.`,
                        { dettagli: `[Piano già preparato dall'app]\n${JSON.stringify(Localizzazione.pianoPerIA(piano))}`, etichetta: `Piano di ${plurale(piano.carte.length, 'carta', 'carte')} dai nodi della mappa` });
                } },
            ],
        });
    }

    function menuAltro(ancora) {
        Ui.menu(ancora, [
            { testo: 'Esporta come immagine (PNG)', icona: 'immagine', clic: () => esportaImmagine() },
            { testo: 'Esporta in OPML', icona: 'scarica', clic: () => scaricaFile(nomeFileSicuro(m.nome) + '.opml', FileMappe.inOpml(m), 'text/x-opml') },
            { testo: 'Copia come elenco rientrato', icona: 'copia', clic: async () => {
                const testo = [Mappe.testoRientrato(m, m.radice), ...Mappe.radiciLibere(m).map(l => Mappe.testoRientrato(m, l.id))].join('\n');
                try { await navigator.clipboard.writeText(testo); Ui.toast('Mappa copiata: incollala in un documento o in una chat', 'successo'); } catch (e) { Ui.toast('Copia non riuscita', 'errore'); }
            } },
            '-',
            !m.panoramica && m.materiaId && Panoramica.di(m.materiaId) && { testo: `Apri «${Panoramica.NOME}» della materia`, icona: 'mappa', clic: () => Router.vai('/mappa/' + Panoramica.di(m.materiaId).id) },
            m.panoramica && { testo: `Che cos'è «${Panoramica.NOME}»`, icona: 'avviso', clic: spiegaPanoramica },
            { testo: 'Proprietà della mappa', icona: 'ingranaggio', clic: () => Viste.mappe.proprieta(m, () => { nomeEl.value = m.nome; App.contesto = { setId: m.setId, materiaId: m.materiaId }; }) },
            { testo: 'Scorciatoie da tastiera', icona: 'tastiera', clic: scorciatoie },
            '-',
            { testo: 'Elimina la mappa', icona: 'cestino', pericolo: true, clic: async () => {
                const ok = await Ui.conferma(`Elimini <b>${esc(m.nome)}</b>? Non si può annullare.`, { titolo: 'Eliminare la mappa?', ok: 'Elimina', pericolo: true });
                if (!ok) return;
                clearTimeout(timerSalva); timerSalva = null; clearTimeout(timerVista);
                st.eliminata = true;
                Mappe.elimina(m.id);
                Ui.toast('Mappa eliminata');
                Router.vai('/mappe');
            } },
        ]);
    }

    function spiegaPanoramica() {
        const mat = Dati.materia(m.materiaId);
        Ui.modale({
            titolo: `«${Panoramica.NOME}»`, classe: 'modale-piccola',
            corpo: `<p>È la mappa d'insieme della materia${mat ? ` <b>${esc(mat.nome)}</b>` : ''}: la tiene l'app, con il titolo, i sottorami e i concetti di
                primo livello di tutte le sue mappe. Si aggiorna da sola quando cambi le mappe.</p>
                <ul>
                    <li>Per aggiungere nodi più profondi: nella mappa d'origine, menu del nodo → <b>Mostra in «${Panoramica.NOME}»</b>.</li>
                    <li>Testi e struttura si cambiano nelle mappe d'origine (la freccia accanto a ogni nodo ti ci porta).</li>
                    <li>Qui scegli aspetto, disposizione e tema, e puoi aggiungere nodi tuoi e <b>collegamenti tra argomenti</b> di mappe diverse: restano.</li>
                </ul>`,
            azioni: [{ testo: 'Ho capito', classe: 'btn-primario', principale: true }],
        });
    }

    function scorciatoie() {
        const righe = [
            ['Tab', 'nuovo nodo figlio'], ['Invio', 'nuovo nodo fratello'], ['F2 · doppio clic · inizia a scrivere', 'modifica il testo'],
            ['Maiusc+Invio (mentre scrivi)', 'a capo nel nodo'], ['Canc', 'elimina i nodi selezionati'], ['Frecce', 'spostati tra i nodi'],
            ['Alt+↑ / Alt+↓', 'sposta il nodo tra i fratelli'], ['Spazio', 'apri o chiudi il ramo'], ['Ctrl+Z · Ctrl+Y', 'annulla · ripeti'],
            ['Ctrl+C · Ctrl+X · Ctrl+V', 'copia, taglia, incolla rami (anche elenchi rientrati da altri programmi)'],
            ['Ctrl+B · Ctrl+I · Ctrl+U', 'grassetto, corsivo, sottolineato'], ['Ctrl+Alt+C · Ctrl+Alt+V', 'copia e incolla lo stile'],
            ['Ctrl+F', 'cerca'], ['Ctrl+A', 'seleziona tutto'],
            ['Ctrl+clic', 'aggiungi o togli un nodo dalla selezione (trascinandone uno si spostano tutti)'],
            ['Trascina una linea', 'aggiungi lì un punto di passaggio (i pallini pieni si spostano)'],
            ['Clic su un punto + Canc · doppio clic · clic destro', 'togli un punto di passaggio (gli altri restano)'],
            ['Maniglia ◂▸ sotto il nodo scelto', 'trascinala per la larghezza del nodo (il testo va a capo); doppio clic: automatica'],
            ['Ctrl+0 · Ctrl++ · Ctrl+−', 'adatta alla finestra, ingrandisci, riduci'], ['Rotellina · Maiusc+rotellina', 'zoom · scorri'],
            ['Trascina lo sfondo · Ctrl+trascina (o Maiusc)', 'sposta la mappa · finestra di selezione: prende i nodi che tocca'], ['Doppio clic sullo sfondo', 'nuovo nodo libero'],
            ['**testo** · *testo* · __testo__', 'grassetto, corsivo, sottolineato dentro un nodo'],
        ];
        Ui.modale({
            titolo: 'Scorciatoie da tastiera', classe: 'modale-larga',
            corpo: `<table class="tabella tabella-scorciatoie"><tbody>${righe.map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`,
            azioni: [{ testo: 'Chiudi', classe: 'btn-primario', principale: true }],
        });
    }

    // ---- Puntatore: selezione, trascinamento, spostamento della vista, zoom -----------------------------

    const puntatori = new Map();
    let pizzico = null;

    function suPuntatoreGiu(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        if (e.target.closest('[data-m="larghezza"]')) { trascinaLarghezza(e, st.attivo); return; }
        if (e.target.closest('.mappa-pop, [data-ricerca], [data-focus], .maniglia, .barra-testo-nodo')) return;
        puntatori.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (puntatori.size === 2) {
            const [a, b] = [...puntatori.values()];
            pizzico = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: st.vista.zoom };
            return;
        }
        if (st.modifica && !e.target.closest('.in-modifica')) concludiModifica();
        if (e.target.closest('.in-modifica')) return;

        const bolla = e.target.closest('[data-bolla]');
        if (bolla) { alternaRamo([bolla.dataset.bolla]); return; }
        const nodoEl = e.target.closest('.nodo');
        if (st.collegando) {
            if (nodoEl && nodoEl.dataset.id !== st.collegando) { const da = st.collegando; fineCollegamento(); creaRelazione(da, nodoEl.dataset.id); }
            else fineCollegamento();
            return;
        }
        if (e.target.closest('[data-spunta]') && nodoEl) {
            const n = m.nodi[nodoEl.dataset.id];
            modifica(() => { n.spunta = !n.spunta; });
            return;
        }
        if (e.target.closest('[data-link]')) return;
        if (e.target.closest('[data-vai-origine]') && nodoEl) { vaiAllOrigine(nodoEl.dataset.id); return; }
        if (e.target.closest('[data-segno-nota]') && nodoEl) { seleziona(nodoEl.dataset.id); if (st.pannello !== 'nota') apriPannello('nota'); return; }
        // Ctrl (o Maiusc) + trascina fuori dai nodi: finestra di selezione, come sul desktop di Windows
        if ((e.ctrlKey || e.metaKey) && !nodoEl && !e.target.closest('.mappa-figura, .mappa-etichetta, [data-punto], [data-punto-nuovo]')) { rettangoloSelezione(e); return; }
        const togli = e.target.closest('[data-punto-togli]');
        if (togli) { togliPunto(+togli.dataset.puntoTogli); return; }
        const punto = e.target.closest('[data-punto], [data-punto-nuovo]');
        if (punto) {
            if (punto.dataset.punto != null) trascinaPunto(e, +punto.dataset.punto);
            else trascinaPunto(e, +punto.dataset.puntoNuovo, { nuovo: true });
            return;
        }
        if (e.target.closest('[data-ridimensiona-figura]')) { ridimensionaFigura(e); return; }
        const figEl = e.target.closest('.mappa-figura');
        if (figEl) { trascinaFigura(e, figEl); return; }
        const etEl = e.target.closest('.mappa-etichetta');
        if (etEl) { trascinaEtichetta(e, etEl); return; }
        const relEt = e.target.closest('[data-rel]');
        if (relEt) {
            // Clic su un collegamento: lo sceglie; trascinandolo da un punto qualsiasi si aggiunge lì un punto di passaggio
            if (st.rel !== relEt.dataset.rel) selezionaRelazione(relEt.dataset.rel);
            if (relEt.classList.contains('rel-colpo')) trascinaPunto(e, null, { nuovo: true });
            else {
                // Il testo sta a metà della linea: trascinandolo si sposta il punto di passaggio di mezzo (o se ne aggiunge uno)
                const L = lineaScelta(), n = L ? L.punti.length : 0;
                if (L) trascinaPunto(e, n % 2 ? (n - 1) / 2 : n / 2, { nuovo: !(n % 2) });
            }
            return;
        }
        const arcoEl = e.target.closest('[data-arco]');
        if (arcoEl && !nodoEl) { trascinaArco(e, arcoEl.dataset.arco, arcoEl.dataset.arcoDa || null); return; }
        if (nodoEl) { trascinaNodo(e, nodoEl.dataset.id); return; }
        if (e.shiftKey) rettangoloSelezione(e); else spostaVista(e);
    }

    function trascina(e, { muovi, fine, soglia = 4 }) {
        const x0 = e.clientX, y0 = e.clientY;
        let partito = false;
        const mv = ev => {
            if (pizzico) return;
            const dx = ev.clientX - x0, dy = ev.clientY - y0;
            if (!partito && Math.hypot(dx, dy) < soglia) return;
            partito = true;
            muovi(dx, dy, ev);
        };
        const su = ev => {
            window.removeEventListener('pointermove', mv);
            window.removeEventListener('pointerup', su);
            window.removeEventListener('pointercancel', su);
            fine(partito, ev.clientX - x0, ev.clientY - y0, ev);
        };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', su);
        window.addEventListener('pointercancel', su);
    }

    function spostaVista(e, { deseleziona = true } = {}) {
        const v0 = { ...st.vista };
        tela.classList.add('spostando');
        trascina(e, {
            soglia: 3,
            muovi: (dx, dy) => { st.vista.x = v0.x + dx; st.vista.y = v0.y + dy; applicaVista(); },
            fine: partito => {
                tela.classList.remove('spostando');
                if (partito) salvaVistaPresto();
                else if (deseleziona && (st.sel.size || st.rel || st.et || st.fig || st.arco)) seleziona(null);
            },
        });
    }

    // Finestra di selezione: si aggiungono alla selezione i nodi che tocca (mentre trascini si vedono già evidenziati).
    // Un clic senza trascinare toglie la selezione
    function rettangoloSelezione(e) {
        const r = tela.getBoundingClientRect();
        const x0 = e.clientX - r.left, y0 = e.clientY - r.top;
        const box = document.createElement('div');
        box.className = 'mappa-rettangolo';
        sopraEl.appendChild(box);
        const dentro = (dx, dy) => {
            const a = { x: (Math.min(x0, x0 + dx) - st.vista.x) / st.vista.zoom, y: (Math.min(y0, y0 + dy) - st.vista.y) / st.vista.zoom };
            const b = { x: a.x + Math.abs(dx) / st.vista.zoom, y: a.y + Math.abs(dy) / st.vista.zoom };
            const ids = [];
            geo.forEach((g, id) => { if (g.x < b.x && g.x + g.w > a.x && g.y < b.y && g.y + g.h > a.y) ids.push(id); });
            return ids;
        };
        trascina(e, {
            soglia: 3,
            muovi: (dx, dy) => {
                Object.assign(box.style, { left: Math.min(x0, x0 + dx) + 'px', top: Math.min(y0, y0 + dy) + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
                const ids = new Set(dentro(dx, dy));
                elementi.forEach((el, id) => el.classList.toggle('nel-riquadro', ids.has(id)));
            },
            fine: (partito, dx, dy) => {
                box.remove();
                elementi.forEach(el => el.classList.remove('nel-riquadro'));
                if (!partito) { if (st.sel.size || st.rel || st.et || st.fig || st.arco) seleziona(null); return; }
                const ids = dentro(dx, dy);
                if (!ids.length) return;
                if (st.rel || st.et || st.fig || st.arco) { st.rel = null; st.et = null; st.fig = null; st.arco = st.arcoDa = null; disegnaLinee(); }
                ids.forEach(id => st.sel.add(id));
                st.attivo = ids[ids.length - 1];
                aggiornaSelezione();
                aggiornaPannello();
            },
        });
    }

    function bersaglioSotto(x, y, esclusi) {
        const el = document.elementsFromPoint(x, y).find(t => t.classList && t.classList.contains('nodo') && !esclusi.has(t.dataset.id));
        if (!el) return null;
        const id = el.dataset.id;
        const r = el.getBoundingClientRect();
        const b = geo.get(id);
        const verticale = b && ['giu', 'su'].includes(b.dir);
        const rel = verticale ? (x - r.left) / r.width : (y - r.top) / r.height;
        const cimaFissa = id === (st.focus || m.radice) || !m.nodi[id].genitore;
        const zona = cimaFissa || (rel > 0.28 && rel < 0.72) ? 'figlio' : rel <= 0.28 ? 'prima' : 'dopo';
        return { id, el, zona };
    }

    function attiva(id) {
        st.attivo = id; st.rel = null; st.et = null;
        aggiornaSelezione();
        aggiornaPannello();
    }

    function trascinaNodo(e, id) {
        const aggiungi = e.shiftKey || e.ctrlKey || e.metaKey;
        if (id === m.radice) {   // la radice non si sposta: trascinarla sposta la vista (un clic la lascia selezionata)
            if (aggiungi) { seleziona(id, { aggiungi: true }); return; }
            if (!st.sel.has(id)) seleziona(id); else attiva(id);
            spostaVista(e, { deseleziona: false });
            return;
        }
        // Con Ctrl (o Maiusc) un clic aggiunge o toglie il nodo dalla selezione; trascinando si spostano tutti i nodi scelti
        const giaScelto = st.sel.has(id);
        if (!giaScelto) seleziona(id, { aggiungi });
        else attiva(id);
        const ordine = [...geo.keys()];
        const scelti = [...st.sel].filter(x => m.nodi[x] && x !== m.radice && x !== st.focus && geo.has(x));
        const gruppo = (st.sel.has(id) && scelti.length > 1 ? cime(scelti) : [id]).sort((a, b) => ordine.indexOf(a) - ordine.indexOf(b));
        const muovibili = [...new Set(gruppo.flatMap(x => [x, ...Mappe.discendenti(m, x)]))].filter(x => geo.has(x));
        const esclusi = new Set(muovibili);
        let bersaglio = null;
        const segna = b => {
            if (bersaglio) bersaglio.el.classList.remove('bersaglio-figlio', 'bersaglio-prima', 'bersaglio-dopo');
            bersaglio = b;
            if (b) b.el.classList.add('bersaglio-' + b.zona);
        };
        // Durante il trascinamento si spostano davvero i nodi, i loro rami e le loro linee (anche quelle verso i genitori)
        const origini = new Map(muovibili.map(x => [x, { x: geo.get(x).x, y: geo.get(x).y }]));
        const spostaRamo = (ddx, ddy, ridisegna = true) => {
            muovibili.forEach(x => {
                const q = geo.get(x), o = origini.get(x);
                if (!q || !o) return;
                q.x = o.x + ddx;
                q.y = o.y + ddy;
                if (!ridisegna) return;
                const el = elementi.get(x);
                if (el) { el.style.left = q.x + 'px'; el.style.top = q.y + 'px'; }
                (q.et || []).forEach(v => { v.ee.style.left = (q.x + v.x) + 'px'; v.ee.style.top = (q.y + v.y) + 'px'; });
            });
            if (ridisegna) { disegnaLinee(); disegnaExtra(); }
        };
        // Griglia di allineamento: il centro del nodo trascinato va sul punto più vicino (con Alt si sposta liberamente).
        // Vale per i nodi che restano dove li si lascia: liberi o figli di un genitore in disposizione libera
        const rif = gruppo.includes(id) ? id : gruppo[0];
        const aMano = x => { const n = m.nodi[x]; return n && (!n.genitore || (geo.get(n.genitore) || {}).disp === 'libera'); };
        let senzaGriglia = false;
        const aggancia = (dx, dy) => {
            const q = origini.get(rif);
            if (!griglia().attiva || senzaGriglia || !q || !aMano(rif)) return [dx, dy];
            const g = geo.get(rif), cx = q.x + g.w / 2, cy = q.y + g.h / 2;
            return [sullaGriglia(cx + dx) - cx, sullaGriglia(cy + dy) - cy];
        };
        let rafRamo = null, ultimo = [0, 0];
        trascina(e, {
            muovi: (dx, dy, ev) => {
                editorEl.classList.add('trascinando');
                senzaGriglia = ev.altKey;
                ultimo = aggancia(dx / st.vista.zoom, dy / st.vista.zoom);
                if (!rafRamo) rafRamo = requestAnimationFrame(() => { rafRamo = null; spostaRamo(...ultimo); });
                segna(bersaglioSotto(ev.clientX, ev.clientY, esclusi));
            },
            fine: (partito, dx, dy) => {
                if (rafRamo) { cancelAnimationFrame(rafRamo); rafRamo = null; }
                editorEl.classList.remove('trascinando');
                const b = bersaglio;
                segna(null);
                spostaRamo(0, 0, false);
                if (!partito) {
                    // Un clic senza trascinare: con Ctrl toglie il nodo già scelto, senza Ctrl lascia scelto solo lui
                    if (aggiungi && giaScelto) seleziona(id, { aggiungi: true });
                    else if (!aggiungi && st.sel.size > 1) seleziona(id);
                    return;
                }
                const passi = st.passato.length;
                lasciaNodi(gruppo, ...(b ? [dx / st.vista.zoom, dy / st.vista.zoom] : aggancia(dx / st.vista.zoom, dy / st.vista.zoom)), b);
                if (st.passato.length === passi) disegna();   // niente è cambiato: tutto torna al suo posto
            },
        });
    }

    // Nodi lasciati dopo un trascinamento (ids = cime dei rami trascinati, in ordine di disegno), spostati di dx, dy;
    // b = nodo sotto il puntatore: dentro di lui diventano suoi figli, sopra o sotto diventano suoi fratelli
    function lasciaNodi(ids, dx, dy, b) {
        const pos = new Map(ids.filter(id => geo.has(id)).map(id => [id, geo.get(id)]));
        // Nella "link argomenti" i nodi generati si spostano solo dove la disposizione è libera: l'ordine e il genitore
        // vengono dalle mappe d'origine
        if (m.panoramica && ids.some(generato)) {
            const fermi = ids.filter(id => generato(id) && (b || !(geo.get(m.nodi[id].genitore) || {}).disp || geo.get(m.nodi[id].genitore).disp !== 'libera'));
            if (fermi.length) {
                avvisoGenerato(fermi[0], "L'ordine dei nodi");
                ids = ids.filter(id => !fermi.includes(id));
                if (!ids.length) return;
            }
        }
        if (b) {
            const t = m.nodi[b.id];
            modifica(() => {
                const genitore = b.zona === 'figlio' ? b.id : t.genitore;
                if (!genitore) return false;
                const prima = new Map(ids.map(id => [id, m.nodi[id].genitore]));
                const spostati = ids.filter(id => Mappe.sposta(m, id, genitore));
                if (!spostati.length) return false;
                if (b.zona === 'figlio') t.chiuso = false;
                else {
                    const resto = m.nodi[genitore].figli.filter(x => !spostati.includes(x));
                    resto.splice(resto.indexOf(b.id) + (b.zona === 'dopo' ? 1 : 0), 0, ...spostati);
                    m.nodi[genitore].figli = resto;
                    if (genitore === m.radice) {
                        const lato = t.lato || ((geo.get(b.id) || {}).dir === 's' ? 's' : 'd');
                        spostati.forEach(id => { m.nodi[id].lato = lato; });
                    }
                }
                // Sotto un genitore in disposizione libera vanno accanto agli altri figli, uno sotto l'altro;
                // con un genitore nuovo la linea piegata a mano torna normale
                const pg = geo.get(genitore);
                let sotto = null;
                spostati.forEach(id => {
                    const n = m.nodi[id], g = pos.get(id) || { w: 90, h: 24 };
                    if (prima.get(id) !== genitore) { n.piega = null; n.percorso = null; }
                    if (!(pg && pg.disp === 'libera')) { n.off = null; return; }
                    const o = offsetAccanto(genitore, spostati, g.w, g.h);
                    if (o && sotto != null) o.dy = sotto + g.h / 2;
                    if (o) sotto = o.dy + g.h / 2 + 22;
                    n.off = o;
                });
            });
            return;
        }
        modifica(() => {
            const automatici = new Map();
            ids.forEach(id => {
                const n = m.nodi[id], g = pos.get(id);
                if (!g) return;
                if (!n.genitore) {
                    // Nodo libero (fuori dall'albero): va dove lo si lascia, il suo ramo lo segue
                    n.x = g.x + g.w / 2 + dx;
                    n.y = g.y + g.h / 2 + dy;
                    return;
                }
                const pg = geo.get(n.genitore);
                if (pg && pg.disp === 'libera') {
                    // Disposizione libera: il nodo resta dove lo si lascia; se passa dall'altra parte del genitore
                    // il ramo si ribalta (i figli vanno dal lato opposto), come in SimpleMind
                    const pc = Disposizione.centro(pg);
                    const primaX = g.x + g.w / 2 - pc.x, dopoX = primaX + dx;
                    n.off = { dx: dopoX, dy: g.y + g.h / 2 + dy - pc.y };
                    if ((primaX < 0) !== (dopoX < 0)) ribalta(id);
                    return;
                }
                if (!automatici.has(n.genitore)) automatici.set(n.genitore, []);
                automatici.get(n.genitore).push(id);
            });
            automatici.forEach((lista, pid) => riordina(pid, lista, pos, dx, dy));
        });
    }

    // Disposizioni automatiche: i nodi lasciati si mettono tra i fratelli fermi secondo dove cadono
    // (e i rami principali cambiano lato); più nodi lasciati nello stesso punto restano nel loro ordine
    function riordina(pid, lista, pos, dx, dy) {
        const p = m.nodi[pid], pg = geo.get(pid);
        const asse = pg && ['giu', 'su'].includes(pg.verso) ? 'x' : 'y';
        const centroDi = x => { const q = geo.get(x); return asse === 'x' ? q.x + q.w / 2 : q.y + q.h / 2; };
        const risultato = p.figli.filter(x => !lista.includes(x));
        lista.forEach(id => {
            const n = m.nodi[id], g = pos.get(id);
            const centro = { x: g.x + g.w / 2 + dx, y: g.y + g.h / 2 + dy };
            let lato = n.lato;
            if (pid === m.radice && pg && pg.verso === 'centro') lato = centro.x < pg.x + pg.w / 2 ? 's' : 'd';
            const fratelli = risultato.filter(x => !lista.includes(x) && geo.has(x) && (pid !== m.radice || !lato || geo.get(x).dir === lato));
            const rovescio = pid === m.radice && lato === 's' && m.direzione === 'orario';
            const prima = fratelli.filter(x => (rovescio ? centroDi(x) > centro[asse] : centroDi(x) < centro[asse]));
            let indice;
            if (prima.length) {
                indice = risultato.indexOf(prima[prima.length - 1]) + 1;
                while (indice < risultato.length && lista.includes(risultato[indice])) indice++;
            } else indice = fratelli.length ? risultato.indexOf(fratelli[0]) : risultato.length;
            risultato.splice(indice, 0, id);
            if (pid === m.radice && lato) n.lato = lato;
        });
        p.figli = risultato;
    }

    function trascinaEtichetta(e, el) {
        const nodo = el.dataset.nodo, id = el.dataset.et;
        selezionaEtichetta(nodo, id);
        trascina(e, {
            muovi: (dx, dy) => { el.style.translate = `${dx / st.vista.zoom}px ${dy / st.vista.zoom}px`; sopraEl.innerHTML = ''; },
            fine: (partito, dx, dy) => {
                el.style.translate = '';
                if (!partito) { posizionaSopra(); return; }
                const et = m.nodi[nodo].etichette.find(x => x.id === id);
                modifica(() => { et.dx += dx / st.vista.zoom; et.dy += dy / st.vista.zoom; });
            },
        });
    }

    function trascinaFigura(e, el) {
        const nodo = el.dataset.nodo, id = el.dataset.fig;
        selezionaFigura(nodo, id);
        trascina(e, {
            muovi: (dx, dy) => { el.style.translate = `${dx / st.vista.zoom}px ${dy / st.vista.zoom}px`; sopraEl.innerHTML = ''; },
            fine: (partito, dx, dy) => {
                el.style.translate = '';
                if (!partito) { posizionaSopra(); return; }
                const f = figura({ nodo, id });
                if (f) modifica(() => { f.dx += dx / st.vista.zoom; f.dy += dy / st.vista.zoom; });
            },
        });
    }

    // Maniglia nell'angolo in basso a destra: la larghezza segue il puntatore, le proporzioni restano, l'angolo
    // opposto sta fermo
    function ridimensionaFigura(e) {
        const ref = st.fig, f = figura(ref);
        const el = ref && elFigure.get(ref.nodo + ':' + ref.id);
        if (!f || !el) return;
        const w0 = f.larghezza, r = f.rapporto || 0.75;
        let w1 = w0;
        trascina(e, {
            soglia: 1,
            muovi: (dx, dy) => {
                const z = st.vista.zoom;
                // Conta lo spostamento più lungo, misurato lungo la diagonale dell'immagine
                w1 = limita(Math.round(w0 + Math.max(dx / z, dy / z / r)), 24, 1600);
                el.style.width = w1 + 'px';
                el.style.height = (w1 * r) + 'px';
                sopraEl.innerHTML = '';
            },
            fine: partito => {
                if (!partito || w1 === w0) { el.style.width = w0 + 'px'; el.style.height = (w0 * r) + 'px'; posizionaSopra(); return; }
                modifica(() => { f.dx += (w1 - w0) / 2; f.dy += (w1 - w0) * r / 2; f.larghezza = w1; });
            },
        });
    }

    // Linea tra un nodo e il suo genitore come curva di Bézier (per piegarla): le curve tengono i loro punti,
    // le altre forme partono da una curva che le somiglia. null per le linee che non si piegano (raccordi)
    function arcoPiegabile(id) {
        const n = id && m.nodi[id], f = n && geo.get(id), p = n && geo.get(n.genitore);
        if (!f || !p || f.raccordo) return null;
        const c = Mappe.collegamento(m, n, f.colore);
        const arc = Disposizione.arco(p, f, c.forma, n.piega);
        if (arc.c1) return arc;
        const { a, b } = arc;
        if (f.dir === 'lineare') return { a, b, c1: { x: a.x, y: b.y }, c2: { x: a.x, y: b.y } };
        if (c.forma === 'dritta') return { a, b, c1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, c2: { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 } };
        return arc.orizzontale
            ? { a, b, c1: { x: (a.x + b.x) / 2, y: a.y }, c2: { x: (a.x + b.x) / 2, y: b.y } }
            : { a, b, c1: { x: a.x, y: (a.y + b.y) / 2 }, c2: { x: b.x, y: (a.y + b.y) / 2 } };
    }

    // ---- Larghezza del nodo (maniglia ◂▸, come SimpleMind) -------------------------------------------

    const LARGHEZZA_NODO = { min: 40, max: 1200 };

    // Trascinando la maniglia sotto il nodo scelto il suo bordo destro segue il puntatore e il testo va a capo, con una
    // linea guida sul bordo; lasciando, la mappa si ridispone. Doppio clic sulla maniglia: larghezza automatica
    function trascinaLarghezza(e, id) {
        const n = m.nodi[id], el = elementi.get(id);
        if (!n || !el) return;
        const w0 = el.offsetWidth, z = st.vista.zoom;
        let w1 = w0;
        const guida = document.createElement('div');
        guida.className = 'guida-larghezza';
        const mostraGuida = () => {
            const r = el.getBoundingClientRect(), rt = tela.getBoundingClientRect();
            Object.assign(guida.style, { left: (r.right - rt.left) + 'px', top: (r.top - rt.top - 14) + 'px', height: (r.height + 28) + 'px' });
            const man = $('[data-m="larghezza"]', sopraEl);
            if (man) Object.assign(man.style, { left: (r.right - rt.left - Math.min(26, r.width / 4)) + 'px', top: (r.bottom - rt.top + 14) + 'px' });
        };
        trascina(e, {
            soglia: 2,
            muovi: dx => {
                if (!guida.parentNode) { sopraEl.appendChild(guida); tela.classList.add('allargando'); }
                w1 = Math.round(limita(w0 + dx / z, LARGHEZZA_NODO.min, LARGHEZZA_NODO.max));
                el.style.width = w1 + 'px';
                el.classList.add('larghezza-fissa');
                mostraGuida();
            },
            fine: partito => {
                guida.remove();
                tela.classList.remove('allargando');
                if (!partito) return;
                if (w1 === w0 && n.larghezza) { disegna(); return; }
                modifica(() => { n.larghezza = w1; });
                aggiornaPannello();
            },
        });
    }

    function larghezzaAutomatica(ids) {
        const con = ids.filter(id => m.nodi[id] && m.nodi[id].larghezza);
        if (!con.length) return;
        modifica(() => con.forEach(id => { delete m.nodi[id].larghezza; }));
        aggiornaPannello();
    }

    // ---- Percorso delle linee: punti di passaggio scelti a mano ---------------------------------------

    // La linea scelta, se si può modificare: un ramo (la linea dal genitore) o un collegamento tra rami.
    // { o: nodo o relazione, A, B: il riferimento dei punti, punti: quelli di passaggio (nel mondo), arc: la linea con i
    // punti, curva: la linea com'è adesso come Bézier cubica (per prenderla col mouse), vecchia: piegata col vecchio
    // sistema (un solo punto di controllo) }
    function lineaScelta() {
        if (st.rel) {
            const r = m.relazioni.find(x => x.id === st.rel);
            const g = r && geometriaRelazione(r);
            if (!g) return null;
            return { o: r, A: g.ca, B: g.cb, punti: g.punti, arc: g.arc, curva: g.arc.segmenti ? null : g.arc, vecchia: !g.punti.length && !!r.curva };
        }
        if (!st.arco || st.arcoDa) return null;
        const n = m.nodi[st.arco], f = geo.get(st.arco), p = n && geo.get(n.genitore);
        if (!f || !p || f.raccordo) return null;
        const c = Mappe.collegamento(m, n, f.colore);
        const arc = Disposizione.arco(p, f, c.forma, n.piega, n.percorso);
        const punti = arc.conPercorso ? arc.punti : [];
        return { o: n, A: arc.a, B: arc.b, punti, arc, curva: punti.length ? null : arcoPiegabile(st.arco), vecchia: !punti.length && Disposizione.piegaValida(n.piega) };
    }

    function salvaPunti(L, punti) {
        L.o.percorso = punti.length ? punti.map(P => Disposizione.inPercorso(L.A, L.B, P)) : null;
        if ('piega' in L.o) L.o.piega = null;
        if ('curva' in L.o) L.o.curva = null;
    }

    // Sposta il punto di passaggio i della linea scelta; nuovo = ne aggiunge uno nel tratto i (null = nel punto della linea
    // dove hai cliccato) e lo sposta. Una linea piegata col vecchio sistema diventa una linea con un punto, a metà
    function trascinaPunto(e, i, { nuovo = false } = {}) {
        const L = lineaScelta();
        if (!L) return;
        let punti = L.punti.map(q => ({ ...q }));
        if (L.vecchia) {
            const g = L.curva;
            punti = [Disposizione.puntoBezier(g.a, g.c1, g.c2, g.b, 0.5)];
        }
        if (nuovo && i == null) {
            // Il tratto della linea più vicino al clic
            const q = aMondo(e.clientX, e.clientY);
            if (L.punti.length) i = Disposizione.vicinoSuCurva(L.arc, q).i;
            else i = L.vecchia ? (Disposizione.vicinoSuCurva(L.curva, q).t < 0.5 ? 0 : 1) : 0;
        } else if (nuovo && L.vecchia) { nuovo = false; i = 0; }   // il pallino a metà è proprio quel punto
        let prima = null;
        trascina(e, {
            soglia: nuovo ? 3 : 1,
            muovi: (dx, dy, ev) => {
                const h = aMondo(ev.clientX, ev.clientY);
                if (!prima) { prima = istantanea(); if (nuovo) punti.splice(i, 0, h); }
                punti[i] = h;
                salvaPunti(L, punti);
                disegnaLinee(); disegnaExtra(); posizionaSopra();
            },
            fine: partito => {
                // Il punto preso (o appena aggiunto) resta scelto: Canc o la × accanto lo tolgono
                if ((!nuovo || partito) && !(st.punto && st.punto.linea === chiaveLinea() && st.punto.i === i)) { st.punto = { linea: chiaveLinea(), i }; posizionaSopra(); }
                if (!partito || !prima) return;
                st.passato.push(prima);
                if (st.passato.length > 200) st.passato.shift();
                st.futuro = [];
                st.continua = null;
                cambiato();
                if (st.arco) aggiornaPannello();
            },
        });
    }

    const chiaveLinea = () => st.rel || (st.arco && !st.arcoDa ? st.arco : null);

    // L'indice del punto di passaggio scelto sulla linea scelta, o null
    function puntoScelto() {
        const L = st.punto && st.punto.linea === chiaveLinea() && lineaScelta();
        return L && L.punti[st.punto.i] ? st.punto.i : null;
    }

    // Toglie il punto di passaggio i, lasciando gli altri dove sono (senza punti la linea torna normale)
    function togliPunto(i) {
        const L = lineaScelta();
        if (!L || !L.punti[i]) return;
        st.punto = null;
        modifica(() => salvaPunti(L, L.punti.filter((q, k) => k !== i)));
        if (st.arco) aggiornaPannello();
    }

    // Clic destro su un punto di passaggio
    function menuPunto(i, x, y) {
        const ancora = { getBoundingClientRect: () => ({ left: x, right: x + 1, top: y, bottom: y, width: 1, height: 1 }) };
        st.punto = { linea: chiaveLinea(), i };
        posizionaSopra();
        Ui.menu(ancora, [
            { testo: 'Togli questo punto', icona: 'chiudi', clic: () => togliPunto(i) },
            { testo: 'Togli tutti i punti (linea normale)', icona: 'annulla', clic: () => {
                const L = lineaScelta();
                if (!L) return;
                st.punto = null;
                modifica(() => salvaPunti(L, []));
                if (st.arco) aggiornaPannello();
            } },
        ]);
    }

    // Clic su una linea: la sceglie. Trascinandola da un punto qualsiasi si aggiunge lì un punto di passaggio, che segue
    // il puntatore (la linea resta attaccata ai due nodi)
    function trascinaArco(e, id, da = null) {
        if (!id || !m.nodi[id]) return;
        if (st.arco !== id || st.arcoDa !== (da || null)) selezionaArco(id, da);
        if (!da) trascinaPunto(e, null, { nuovo: true });
    }

    function suRotella(e) {
        if (SOLA && !opzioni.zoomLibero && !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        const r = tela.getBoundingClientRect();
        if (!e.shiftKey) zoomA(st.vista.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
        else {
            const k = e.deltaMode === 1 ? 16 : 1;
            st.vista.x -= (e.deltaX || 0) * k;
            st.vista.y -= e.deltaY * k;
            applicaVista();
            salvaVistaPresto();
        }
    }

    function suPuntatoreMosso(e) {
        if (puntatori.has(e.pointerId)) puntatori.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pizzico && puntatori.size === 2) {
            const [a, b] = [...puntatori.values()];
            const r = tela.getBoundingClientRect();
            zoomA(pizzico.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pizzico.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        }
        if (st.collegando) {
            const da = geo.get(st.collegando);
            if (!da) return;
            const p = aMondo(e.clientX, e.clientY);
            const c = Disposizione.centro(da);
            tempEl.innerHTML = `<path d="M${c.x},${c.y} L${p.x},${p.y}" stroke="${da.colore}" stroke-width="2" stroke-dasharray="6 5" fill="none"/>`;
        }
    }

    function suPuntatoreSu(e) {
        puntatori.delete(e.pointerId);
        if (puntatori.size < 2) pizzico = null;
    }

    function suDoppioClic(e) {
        if (e.target.closest('[data-m="larghezza"]')) { larghezzaAutomatica([st.attivo]); return; }
        const punto = e.target.closest('[data-punto]');
        if (punto) { togliPunto(+punto.dataset.punto); return; }
        if (e.target.closest('.mappa-pop, [data-ricerca], [data-focus], .maniglia, [data-punto-nuovo], .in-modifica')) return;
        const figEl = e.target.closest('.mappa-figura');
        if (figEl) { Ricco.ingrandisci(figEl.src); return; }
        const etEl = e.target.closest('.mappa-etichetta');
        if (etEl) { modificaEtichetta(etEl.dataset.nodo, etEl.dataset.et); return; }
        const relEt = e.target.closest('[data-rel]');
        if (relEt) { selezionaRelazione(relEt.dataset.rel); const c = $('[data-rel-testo]', sopraEl); if (c) c.focus(); return; }
        const nodoEl = e.target.closest('.nodo');
        if (nodoEl) { seleziona(nodoEl.dataset.id); modificaNodo(nodoEl.dataset.id); return; }
        if (!st.focus && !e.target.closest('[data-bolla]')) { const p = aMondo(e.clientX, e.clientY); nodoLibero(p.x, p.y); }
    }

    function suMenuContestuale(e) {
        if (e.target.closest('.in-modifica, input, textarea')) return;
        e.preventDefault();
        const punto = e.target.closest('[data-punto]');
        if (punto) { menuPunto(+punto.dataset.punto, e.clientX, e.clientY); return; }
        const figEl = e.target.closest('.mappa-figura');
        if (figEl) { selezionaFigura(figEl.dataset.nodo, figEl.dataset.fig); menuFigura(e.clientX, e.clientY); return; }
        const nodoEl = e.target.closest('.nodo');
        if (nodoEl) {
            if (!st.sel.has(nodoEl.dataset.id)) seleziona(nodoEl.dataset.id);
            menuNodo(nodoEl.dataset.id, e.clientX, e.clientY);
        } else if (!e.target.closest('.mappa-pop')) menuTela(e.clientX, e.clientY);
    }

    // ---- Tastiera ------------------------------------------------------------------------------------

    function vicino(direzione) {
        const a = geo.get(st.attivo);
        if (!a) { seleziona(st.focus || m.radice); return; }
        const ca = Disposizione.centro(a);
        let migliore = null, punti = Infinity;
        geo.forEach((b, id) => {
            if (id === st.attivo) return;
            const c = Disposizione.centro(b);
            const dx = c.x - ca.x, dy = c.y - ca.y;
            const [lungo, largo] = direzione === 'destra' ? [dx, dy] : direzione === 'sinistra' ? [-dx, dy] : direzione === 'giu' ? [dy, dx] : [-dy, dx];
            if (lungo <= 2 || Math.abs(largo) > lungo * 3 + 30) return;
            const p = lungo + Math.abs(largo) * 2.4;
            if (p < punti) { punti = p; migliore = id; }
        });
        if (migliore) { seleziona(migliore); mostraNodo(migliore); }
    }

    function inCampo(t) {
        return t && t.closest && !!t.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
    }

    function suTasto(e) {
        if (!document.contains(editorEl) || Ui.finestraAperta() || document.querySelector('body > .menu')) return;
        if (st.modifica) return;
        const ctrl = e.ctrlKey || e.metaKey;
        const k = e.key;
        if (inCampo(e.target)) {
            if (k === 'Escape' && e.target.closest('[data-ricerca]')) { e.preventDefault(); chiudiRicerca(); }
            else if (k === 'Enter' && e.target.closest('[data-ricerca]')) { e.preventDefault(); vaiATrovato(e.shiftKey ? -1 : 1); }
            else if (k === 'Enter' && e.target === nomeEl) { e.preventDefault(); nomeEl.blur(); }
            return;
        }
        if (ctrl && e.altKey && (e.code === 'KeyC' || e.code === 'KeyV')) {
            e.preventDefault();
            if (e.code === 'KeyC') copiaStile(); else incollaStile();
            return;
        }
        // Ctrl+Alt+1…9: lo stile predefinito 1…9 ai nodi scelti
        if (ctrl && e.altKey && /^Digit[1-9]$/.test(e.code)) {
            const x = Mappe.stiliPredefiniti()[+e.code.slice(5) - 1];
            if (x && st.sel.size) { e.preventDefault(); applicaStilePredefinito(x.id); aggiornaPannello(true); }
            return;
        }
        if (ctrl && k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); annulla(); return; }
        if (ctrl && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); ripeti(); return; }
        if (ctrl && k.toLowerCase() === 'f') { e.preventDefault(); apriRicerca(); return; }
        if (ctrl && k.toLowerCase() === 'g') { e.preventDefault(); $('[data-a="griglia"]', radiceEl)?.click(); return; }
        if (ctrl && k === '0') { e.preventDefault(); adatta(); return; }
        if (ctrl && (k === '+' || k === '=')) { e.preventDefault(); zoomA(st.vista.zoom * 1.2); return; }
        if (ctrl && (k === '-' || k === '_')) { e.preventDefault(); zoomA(st.vista.zoom / 1.2); return; }
        if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); st.sel = new Set(geo.keys()); st.attivo = st.attivo || st.focus || m.radice; aggiornaSelezione(); aggiornaPannello(); return; }
        if (ctrl && ['b', 'i', 'u'].includes(k.toLowerCase()) && st.sel.size) {
            e.preventDefault();
            const chiave = { b: 'grassetto', i: 'corsivo', u: 'sottolineato' }[k.toLowerCase()];
            applicaStile(chiave, !stileAttivo()[chiave]);
            return;
        }
        if (ctrl || e.altKey && !['ArrowUp', 'ArrowDown'].includes(k)) return;
        if (k === 'Escape') {
            if (st.collegando) fineCollegamento();
            else if (st.cerca.aperta) chiudiRicerca();
            else if (st.sel.size || st.rel || st.et || st.fig || st.arco) seleziona(null);
            else if (st.focus) concentra(m.radice);
            return;
        }
        // Un punto di passaggio scelto: Canc toglie lui (non la linea)
        if ((k === 'Delete' || k === 'Backspace') && puntoScelto() != null) { e.preventDefault(); togliPunto(puntoScelto()); return; }
        if (st.et && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); eliminaSelezionati(); return; }
        if (st.et && (k === 'F2' || k === 'Enter')) { e.preventDefault(); modificaEtichetta(st.et.nodo, st.et.id); return; }
        if (st.rel && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); eliminaSelezionati(); return; }
        if (st.fig && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); eliminaFigura(); return; }
        if (st.fig && (k === '+' || k === '-')) { e.preventDefault(); scaleFigura(k === '+' ? 1.1 : 1 / 1.1); return; }
        if (!st.attivo) {
            if (k.startsWith('Arrow') || k === 'Enter' || k === 'Tab') { e.preventDefault(); seleziona(st.focus || m.radice); }
            return;
        }
        if (e.altKey && k === 'ArrowUp') { e.preventDefault(); spostaTraFratelli(-1); return; }
        if (e.altKey && k === 'ArrowDown') { e.preventDefault(); spostaTraFratelli(1); return; }
        switch (k) {
            case 'Tab': case 'Insert': e.preventDefault(); if (e.shiftKey) { const p = m.nodi[st.attivo].genitore; if (p) seleziona(p); } else aggiungiFiglio(); return;
            case 'Enter': e.preventDefault(); aggiungiFratello(); return;
            case 'F2': e.preventDefault(); modificaNodo(st.attivo); return;
            case 'Delete': case 'Backspace': e.preventDefault(); eliminaSelezionati(); return;
            case ' ': e.preventDefault(); alternaRamo(); return;
            case 'ArrowRight': e.preventDefault(); vicino('destra'); return;
            case 'ArrowLeft': e.preventDefault(); vicino('sinistra'); return;
            case 'ArrowUp': e.preventDefault(); vicino('su'); return;
            case 'ArrowDown': e.preventDefault(); vicino('giu'); return;
        }
        // Un carattere qualsiasi comincia a scrivere nel nodo, al posto del testo (come in SimpleMind)
        if (k.length === 1 && st.sel.size === 1) { e.preventDefault(); modificaNodo(st.attivo, { sostituisci: k }); }
    }

    function suCopia(e) {
        if (!document.contains(editorEl) || st.modifica || inCampo(e.target) || Ui.finestraAperta()) return;
        const testo = copia();
        if (testo == null) return;
        e.preventDefault();
        e.clipboardData.setData('text/plain', testo);
    }

    function suTaglia(e) {
        if (!document.contains(editorEl) || st.modifica || inCampo(e.target) || Ui.finestraAperta()) return;
        const testo = copia();
        if (testo == null) return;
        e.preventDefault();
        e.clipboardData.setData('text/plain', testo);
        eliminaSelezionati();
    }

    function suIncolla(e) {
        if (!document.contains(editorEl) || st.modifica || inCampo(e.target) || Ui.finestraAperta()) return;
        const file = [...(e.clipboardData.files || [])].find(f => f.type.startsWith('image/'));
        e.preventDefault();
        if (file) { if (st.attivo) mettiImmagine(st.attivo, file); else Ui.toast('Seleziona un nodo per incollare l\'immagine'); return; }
        incolla(e.clipboardData.getData('text/plain'));
    }

    // ---- Pulsanti, pannello e finestrelle --------------------------------------------------------------

    function suClic(e) {
        if (e.target.closest('[data-indietro]') && opzioni.indietroStoria) { e.preventDefault(); history.back(); return; }
        const fmt = e.target.closest('[data-fmt]');
        if (fmt && sopraEl.contains(fmt)) { formattaTesto(fmt.dataset.fmt); return; }
        const a = e.target.closest('[data-a]');
        if (a && radiceEl.contains(a)) {
            const azioni = {
                annulla, ripeti,
                figlio: () => (st.attivo ? aggiungiFiglio() : seleziona(m.radice)),
                etichetta: () => (st.attivo ? aggiungiEtichetta() : Ui.toast('Seleziona prima un nodo')),
                relazione: () => (st.attivo ? iniziaCollegamento() : Ui.toast('Seleziona prima un nodo')),
                immagine: () => sceltaImmagine(a),
                'zoom-meno': () => zoomA(st.vista.zoom / 1.2), 'zoom-piu': () => zoomA(st.vista.zoom * 1.2), 'zoom-100': () => zoomA(1), adatta: () => adatta(),
                cerca: () => (st.cerca.aperta ? chiudiRicerca() : apriRicerca()),
                'cerca-prec': () => vaiATrovato(-1), 'cerca-succ': () => vaiATrovato(1), 'cerca-chiudi': chiudiRicerca,
                altro: () => menuAltro(a), 'chiudi-pannello': () => apriPannello(null),
                assistente: () => Assistente.alterna(),
                flashcard: () => flashcardDaiNodi(),
                griglia: () => { impostaGriglia({ attiva: !griglia().attiva }); Ui.toast(griglia().attiva ? `Griglia accesa: i nodi spostati si agganciano ogni ${griglia().passo} px` : 'Griglia spenta', 'info', 2200); if (st.pannello === 'disposizione') aggiornaPannello(true); },
                panoramica: spiegaPanoramica,
            };
            if (a.dataset.p) apriPannello(a.dataset.p);
            else if (azioni[a.dataset.a]) azioni[a.dataset.a]();
            return;
        }
        const man = e.target.closest('[data-m]');
        if (man) {
            const id = st.attivo;
            const r = man.getBoundingClientRect();
            ({ figlio: () => aggiungiFiglio(id), etichetta: () => aggiungiEtichetta(id), relazione: () => iniziaCollegamento(id),
                disposizione: () => { st.popDisp = st.popDisp === id ? null : id; posizionaSopra(); },
                chiudi: () => alternaRamo([id]), menu: () => menuNodo(id, r.left, r.bottom), larghezza: () => {} })[man.dataset.m]();
            return;
        }
        const fv = e.target.closest('[data-focus-vai]');
        if (fv) { concentra(fv.dataset.focusVai || m.radice); return; }
        if (pannelloEl.contains(e.target)) clicPannello(e);
        else if (e.target.closest('.mappa-pop')) clicPop(e);
    }

    function coloreScelto(el, attributo) {
        const v = el.getAttribute(attributo);
        return v === '' ? null : v;
    }

    function clicPannello(e) {
        const t = e.target;
        let x;
        if ((x = t.closest('[data-reset-sezione]'))) {
            resetSezione(x.dataset.resetSezione);
        } else if ((x = t.closest('[data-sezione]'))) {
            alternaSezione(x);
        } else if ((x = t.closest('[data-disp]'))) {
            const tipo = x.dataset.disp;
            modifica(() => {
                if (tipo === 'libera' && m.disposizione !== 'libera') fissaPosizioni(m.radice);
                if (tipo !== 'libera') raddrizza(null);
                m.disposizione = tipo;
            });
            requestAnimationFrame(() => adatta());
        } else if ((x = t.closest('[data-tema-modifica]'))) {
            editorTema(Mappe.temi().find(q => q.id === x.dataset.temaModifica), false);
        } else if (t.closest('[data-tema-nuovo]')) {
            editorTema(Mappe.temaDaMappa(m, 'Il mio tema'), true);
        } else if ((x = t.closest('[data-tema-mappa]'))) {
            modifica(() => { m.tema = x.dataset.temaMappa; m.paletta = null; m.coloreRadice = null; m.livelli = null; m.linee = null; });
        } else if ((x = t.closest('[data-linee]'))) {
            modifica(() => { m.linee = { ...(m.linee || {}), [x.dataset.linee]: x.dataset.valore }; });
        } else if ((x = t.closest('[data-curva-forma]'))) {
            st.formaCurva = x.dataset.curvaForma;
            const cv = curvaturaDi((m.nodi[idsCollegamento()[0]] || {}).percorso);
            if (cv.valore) applicaCurvatura(cv.valore, st.formaCurva);
            aggiornaPannello(true);
        } else if (t.closest('[data-distanza-via]')) {
            distanzaComeGliAltri();
        } else if ((x = t.closest('[data-campo-colore]'))) {
            apriTavolozza(x);
        } else if ((x = t.closest('[data-stile-pre]'))) {
            applicaStilePredefinito(x.dataset.stilePre);
        } else if ((x = t.closest('[data-stile-pre-az]'))) {
            azioneStilePredefinito(x.dataset.stilePreAz, x);
        } else if ((x = t.closest('[data-sott]'))) {
            applicaSottolineatura(x.dataset.sott, x.dataset.valore);
        } else if ((x = t.closest('[data-sott-colore]')) && x.tagName === 'BUTTON') {
            applicaSottolineatura('colore', coloreScelto(x, 'data-c'));
        } else if ((x = t.closest('[data-coll]'))) {
            applicaCollegamento(x.dataset.coll, x.dataset.valore);
        } else if ((x = t.closest('[data-coll-colore]')) && x.tagName === 'BUTTON') {
            applicaCollegamento('coloreLinea', coloreScelto(x, 'data-c'));
        } else if ((x = t.closest('[data-racc]'))) {
            const n = m.nodi[st.arco];
            if (n && n.raccordo) modifica(() => { n.raccordo = { ...n.raccordo, graffa: x.dataset.racc === 'graffa' }; });
        } else if ((x = t.closest('[data-coll-az]'))) {
            const ids = idsCollegamento();
            const chiavi = Mappe.CHIAVI_COLLEGAMENTO;
            const az = x.dataset.collAz;
            if (az === 'ripristina') modifica(() => ids.forEach(id => { chiavi.forEach(k => delete m.nodi[id].stile[k]); m.nodi[id].piega = null; m.nodi[id].percorso = null; }));
            else if (az === 'raddrizza') modifica(() => ids.forEach(id => { m.nodi[id].piega = null; m.nodi[id].percorso = null; }));
            else if (az === 'scollega') {
                const n = m.nodi[st.arco], da = st.arcoDa;
                if (!n || !da) return;
                modifica(() => {
                    if (n.raccordo) n.raccordo = { ...n.raccordo, nodi: n.raccordo.nodi.filter(q => q !== da) };
                    if (n.legami) n.legami = n.legami.filter(q => q !== da);
                    Mappe.pulisciLegami(m);
                });
            } else modifica(() => ids.forEach(id => {
                const fonte = m.nodi[id].stile || {};
                Mappe.discendenti(m, id).forEach(d => {
                    const s = m.nodi[d].stile = m.nodi[d].stile || {};
                    chiavi.forEach(k => { if (k in fonte) s[k] = fonte[k]; else delete s[k]; });
                });
            }));
        } else if ((x = t.closest('[data-stile-inv]'))) {
            const k = x.dataset.stileInv;
            applicaStile(k, !stileAttivo()[k]);
        } else if ((x = t.closest('[data-stile]'))) {
            applicaStile(x.dataset.stile, x.dataset.valore);
        } else if ((x = t.closest('[data-stile-colore]')) && x.tagName === 'BUTTON') {
            applicaStile(x.dataset.stileColore, coloreScelto(x, 'data-c'));
        } else if ((x = t.closest('[data-stile-az]'))) {
            const az = x.dataset.stileAz;
            if (az === 'copia') copiaStile();
            else if (az === 'incolla') incollaStile();
            else if (az === 'ripristina') modifica(() => st.sel.forEach(id => { m.nodi[id].stile = {}; delete m.nodi[id].stilePredefinito; }));
            else if (az === 'larghezza-auto') larghezzaAutomatica([...st.sel]);
        } else if ((x = t.closest('[data-icona]'))) {
            const v = x.dataset.icona || null;
            const tutte = [...st.sel].every(id => m.nodi[id].icona === v);
            modifica(() => st.sel.forEach(id => { m.nodi[id].icona = tutte ? null : v; }));
        } else if (t.closest('[data-icona-carica]')) {
            caricaIcona();
        } else if ((x = t.closest('[data-giro]'))) {
            const n = m.nodi[x.dataset.giro];
            n.chiuso = !n.chiuso;
            cambiatoSenzaStoria();
        } else if ((x = t.closest('[data-struttura]'))) {
            const id = x.dataset.struttura;
            if (st.focus && id !== st.focus && !Mappe.antenati(m, id).includes(st.focus)) { st.focus = null; disegna(); }
            seleziona(id);
            mostraNodo(id, true);
        } else if (t.closest('[data-img-togli]')) {
            modifica(() => { m.nodi[st.attivo].immagine = null; });
        } else if (t.closest('[data-img-dentro]')) {
            scegliImmagine();
        } else if (t.closest('[data-img-fuori]')) {
            immagineFuori();
        } else if ((x = t.closest('[data-fig-aggiungi]'))) {
            scegliFigura(st.attivo);
        } else if ((x = t.closest('[data-fig-togli]'))) {
            const id = st.attivo;
            modifica(() => { m.nodi[id].figure = (m.nodi[id].figure || []).filter(f => f.id !== x.dataset.figTogli); });
            aggiornaPannello();
        } else if ((x = t.closest('[data-fig-scegli]'))) {
            selezionaFigura(st.attivo, x.dataset.figScegli);
        } else if (t.closest('[data-img-tutte]')) {
            eliminaImmaginiNodi([st.attivo]);
        }
    }

    async function caricaIcona() {
        if (!st.sel.size) return;
        const file = await scegliFile('image/*');
        if (!file) return;
        try {
            const src = await new Promise((ok, ko) => {
                const i = new Image();
                i.onload = () => {
                    const c = document.createElement('canvas');
                    const lato = 64, s = Math.min(1, lato / Math.max(i.naturalWidth, i.naturalHeight));
                    c.width = Math.round(i.naturalWidth * s); c.height = Math.round(i.naturalHeight * s);
                    c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
                    ok(c.toDataURL('image/png'));
                };
                i.onerror = ko;
                i.src = URL.createObjectURL(file);
            });
            const k = uid();
            m.immagini[k] = src;
            modifica(() => st.sel.forEach(id => { m.nodi[id].icona = 'img:' + k; }));
        } catch (e) { Ui.toast('Immagine non leggibile', 'errore'); }
    }

    function suInputPannello(e) {
        const t = e.target;
        if (t.matches('[data-spaziatura]')) {
            $('[data-sp-valore]', pannelloEl).textContent = Math.round(t.value * 100) + '%';
            modificaContinua('spaziatura', () => { m.spaziatura = +t.value; });
        } else if (t.matches('[data-fratelli]')) {
            $('[data-fr-valore]', pannelloEl).textContent = Math.round(t.value * 100) + '%';
            modificaContinua('fratelli', () => { m.spaziaturaFratelli = Math.abs(+t.value - 1) < 0.01 ? null : +t.value; });
        } else if (t.matches('[data-distanza-scelti]')) {
            cursoreDistanza(t);
        } else if (t.matches('[data-curvatura]')) {
            const v = +t.value;
            $('[data-curva-valore]', pannelloEl).textContent = v;
            const cv = curvaturaDi((m.nodi[idsCollegamento()[0]] || {}).percorso);
            applicaCurvatura(v, cv.forma || st.formaCurva || 'arco');
        } else if (t.matches('[data-griglia-passo]')) {
            $('[data-gr-valore]', pannelloEl).textContent = t.value + ' px';
            impostaGriglia({ passo: +t.value });
        } else if (t.matches('[data-linee-num]')) {
            const k = t.dataset.lineeNum, v = +t.value;
            const etichetta = $(`[data-val="${k}"]`, pannelloEl);
            if (etichetta) etichetta.textContent = k === 'riduzione' ? Math.round(v * 100) + '%' : v + ' px';
            modificaContinua('linee:' + k, () => {
                m.linee = { ...(m.linee || {}), ...(k === 'riduzione' ? { fattore: +(1 - v).toFixed(2) } : { [k]: v }) };
            });
        } else if (t.matches('[data-nodo-campo="nota"]')) {
            const id = st.attivo;
            modificaContinua('nota:' + id, () => { m.nodi[id].nota = t.value; });
        } else if (t.matches('[data-img-larghezza]')) {
            const id = st.attivo;
            $('[data-img-valore]', pannelloEl).textContent = t.value + ' px';
            modificaContinua('img:' + id, () => { m.nodi[id].immagine.larghezza = +t.value; });
            const el = elementi.get(id);
            if (el) el._firma = null;
        }
    }

    function suCambioPannello(e) {
        const t = e.target;
        if (t.matches('[data-direzione]')) modifica(() => { m.direzione = t.value; m.nodi[m.radice].figli.forEach(f => { m.nodi[f].lato = null; }); });
        else if (t.matches('[data-stile-scala]')) applicaStile('scala', +t.value);
        else if (t.matches('[data-stile-pt]')) {
            const pt = limita(+t.value || PT_BASE, 4, 96);
            applicaStile('scala', Math.abs(pt - PT_BASE) < 0.01 ? null : Math.round(pt / PT_BASE * 1000) / 1000);
        } else if (t.matches('[data-sott-spessore]')) applicaSottolineatura('spessore', +t.value || null);
        else if (t.matches('[data-stile-spessore]')) applicaStile('spessore', +t.value);
        else if (t.matches('[data-stile-num]')) applicaStile(t.dataset.stileNum, Math.max(0, +t.value || 0) || null);
        else if (t.matches('[data-c-libero]')) {
            if (t.hasAttribute('data-sott-colore')) applicaSottolineatura('colore', t.value);
            else if (t.dataset.collColore) applicaCollegamento('coloreLinea', t.value); else applicaStile(t.dataset.stileColore, t.value);
        } else if (t.matches('[data-coll-num]')) applicaCollegamento('lineaSpessore', +t.value);
        else if (t.matches('[data-linee-auto]')) modifica(() => { m.linee = { ...(m.linee || {}), affusolamento: t.checked }; });
        else if (t.matches('[data-griglia-attiva]')) impostaGriglia({ attiva: t.checked });
        else if (t.matches('[data-nodo-campo="link"]')) {
            const v = t.value.trim();
            if (v && !/^https?:\/\//i.test(v)) { Ui.toast('Il link deve iniziare con http:// o https://', 'errore'); return; }
            modifica(() => { m.nodi[st.attivo].link = v; });
        } else if (t.matches('[data-nodo-campo="data"]')) modifica(() => { m.nodi[st.attivo].data = t.value || null; });
        else if (t.matches('[data-nodo-spunta]')) modifica(() => { m.nodi[st.attivo].spunta = t.checked ? false : null; });
    }

    function clicPop(e) {
        const t = e.target;
        let x;
        if ((x = t.closest('[data-disp-nodo]')) && st.popDisp) { scegliDisposizione(st.popDisp, x.dataset.dispNodo); return; }
        if ((x = t.closest('[data-disp-multi]'))) { scegliDisposizioneMulti(x.dataset.dispMulti); return; }
        if ((x = t.closest('[data-allinea]'))) { allinea(x.dataset.allinea); return; }
        if (t.closest('[data-distanza-via]')) { distanzaComeGliAltri(); return; }
        if ((x = t.closest('[data-multi]'))) {
            if (x.dataset.multi === 'disposizione') { st.popDispMulti = !st.popDispMulti; posizionaSopra(); return; }
            if (x.dataset.multi === 'distanza') { st.popDistanza = !st.popDistanza; posizionaSopra(); return; }
            if (x.dataset.multi === 'flashcard') flashcardDaiNodi(); else figlioComune(x.dataset.multi === 'graffa');
            return;
        }
        const r = m.relazioni.find(q => q.id === st.rel);
        if (r && (x = t.closest('[data-rel-az]'))) {
            const az = x.dataset.relAz;
            if (az === 'elimina') { eliminaSelezionati(); return; }
            const g = geometriaRelazione(r);
            modifica(() => {
                if (az === 'inizio') r.frecciaInizio = !r.frecciaInizio;
                if (az === 'fine') r.frecciaFine = r.frecciaFine === false;
                // Linea dritta: il punto di controllo va a metà tra i due centri
                if (az === 'dritta' && g) {
                    const a = Disposizione.centro(geo.get(r.da)), b = Disposizione.centro(geo.get(r.a));
                    r.percorso = null;
                    const base = geometriaRelazione(r).base;
                    r.curva = { dx: (a.x + b.x) / 2 - base.x, dy: (a.y + b.y) / 2 - base.y };
                }
            });
        } else if (r && (x = t.closest('[data-rel-tratto]'))) modifica(() => { r.tratto = x.dataset.relTratto; });
        else if (r && (x = t.closest('[data-rel-colore]')) && x.tagName === 'BUTTON') modifica(() => { r.colore = coloreScelto(x, 'data-rel-colore'); });

        if (st.fig && (x = t.closest('[data-fig-az]'))) {
            const ref = st.fig, f = figura(ref);
            if (!f) return;
            const az = x.dataset.figAz;
            if (az === 'elimina') eliminaFigura(ref);
            else if (az === 'fluttuante') alternaFluttuante(ref);
            else if (az === 'dentro') figuraDentro(ref);
            else if (az === 'ingrandisci') Ricco.ingrandisci(m.immagini[f.img]);
            else if (az === 'piu' || az === 'meno') scaleFigura(az === 'piu' ? 1.25 : 0.8, ref);
            return;
        }
        const et = st.et && m.nodi[st.et.nodo] && m.nodi[st.et.nodo].etichette.find(q => q.id === st.et.id);
        if (et && (x = t.closest('[data-et-az]'))) {
            const az = x.dataset.etAz;
            if (az === 'elimina') eliminaEtichetta(st.et.nodo, st.et.id);
            else if (az === 'modifica') modificaEtichetta(st.et.nodo, st.et.id);
            else modifica(() => { et.stile = { ...(et.stile || {}), [az]: !(et.stile || {})[az] }; });
        } else if (et && (x = t.closest('[data-et-colore]')) && x.tagName === 'BUTTON') {
            modifica(() => { et.stile = { ...(et.stile || {}), riempimento: x.getAttribute('data-et-colore') }; });
        }
    }

    function suCambioPop(e) {
        const t = e.target;
        const r = m.relazioni.find(q => q.id === st.rel);
        if (r && t.matches('[data-rel-testo]')) modifica(() => { r.testo = t.value.trim(); });
        else if (r && t.matches('[data-rel-curva]')) {
            const v = +t.value;
            // A 0 il collegamento è dritto: passa dal punto a metà tra i due nodi
            modifica(() => { r.percorso = percorsoCurvo('arco', v) || [{ u: 0.5, v: 0 }]; });
        }
        else if (r && t.matches('[data-rel-colore-libero]')) modifica(() => { r.colore = t.value; });
        const et = st.et && m.nodi[st.et.nodo] && m.nodi[st.et.nodo].etichette.find(q => q.id === st.et.id);
        if (et && t.matches('[data-et-scala]')) modifica(() => { et.stile = { ...(et.stile || {}), scala: +t.value }; });
        if (et && t.matches('[data-et-pt]')) modifica(() => { et.stile = { ...(et.stile || {}), scala: Math.round(limita(+t.value || 8.4, 4, 96) / PT_BASE * 1000) / 1000 }; });
        else if (et && t.matches('[data-et-colore-libero]')) modifica(() => { et.stile = { ...(et.stile || {}), riempimento: t.value }; });
    }

    // Immagine trascinata: sopra un nodo va dentro il nodo; in un punto vuoto diventa un'immagine libera del nodo
    // selezionato (o di quella selezionata), proprio dove la lasci
    function suTrascinaFile(e) {
        if (![...(e.dataTransfer.types || [])].includes('Files')) return;
        e.preventDefault();
    }
    function suLasciaFile(e) {
        const file = [...(e.dataTransfer.files || [])].find(f => f.type.startsWith('image/'));
        if (!file) return;
        e.preventDefault();
        const nodoEl = e.target.closest('.nodo');
        if (nodoEl) { mettiImmagine(nodoEl.dataset.id, file); return; }
        const figEl = e.target.closest('.mappa-figura');
        const id = figEl ? figEl.dataset.nodo : st.fig ? st.fig.nodo : st.attivo;
        if (id) mettiFigura(id, file, aMondo(e.clientX, e.clientY));
        else Ui.toast('Seleziona un nodo e lascia l\'immagine dove la vuoi (o sopra un nodo per metterla dentro)', 'info', 5000);
    }

    // ---- Cambi che arrivano da fuori (assistente, Annulla della chat) -------------------------------------
    // Prima del cambio l'editor si segna com'era la mappa, dopo la ridisegna: il cambio diventa un passo del suo
    // Annulla (Ctrl+Z). Se la mappa è stata eliminata si torna all'elenco senza salvarla.

    function suMappaDaFuori(e) {
        const { id, fase } = e.detail || {};
        if (id !== m.id || st.eliminata) return;
        if (fase === 'prima') {
            if (st.modifica) concludiModifica();
            if (!st.primaFuori) st.primaFuori = istantanea();
            return;
        }
        if (fase === 'eliminata') {
            st.eliminata = true;
            clearTimeout(timerSalva); timerSalva = null; clearTimeout(timerVista);
            if (App.rottaAttiva && App.rottaAttiva.vista === 'mappa') Router.vai('/mappe');
            return;
        }
        const prima = st.primaFuori;
        st.primaFuori = null;
        if (prima && prima !== istantanea()) {
            st.passato.push(prima);
            if (st.passato.length > 200) st.passato.shift();
            st.futuro = [];
        }
        st.continua = null;
        document.title = m.nome + ' · Flashcard';
        App.contesto = { setId: m.setId, materiaId: m.materiaId };
        cambiato();
    }

    // Per l'assistente: cosa sta guardando l'utente e qualche azione sulla vista
    function stato() {
        return { selezionati: [...st.sel].filter(id => m.nodi[id]), attivo: st.attivo, concentrato_su: st.focus, linea_scelta: st.arco };
    }

    function selezionaDaFuori(ids) {
        ids = ids.filter(id => m.nodi[id]);
        if (!ids.length) return 0;
        if (st.focus && ids.some(id => id !== st.focus && !Mappe.antenati(m, id).includes(st.focus))) st.focus = null;
        let aperti = false;
        ids.forEach(id => Mappe.antenati(m, id).forEach(a => { if (m.nodi[a].chiuso) { m.nodi[a].chiuso = false; aperti = true; } }));
        if (aperti) cambiatoSenzaStoria(); else disegna();
        if (st.modifica) concludiModifica();
        st.sel = new Set(ids); st.attivo = ids[ids.length - 1]; st.rel = null; st.et = null; st.arco = st.arcoDa = null;
        aggiornaSelezione();
        aggiornaPannello();
        mostraNodo(ids[0], true);
        return ids.length;
    }

    // Nodi nuovi sotto un genitore in disposizione libera: accanto agli altri figli, uno sotto l'altro
    function posizionaNuovi(pid, ids) {
        const p = geo.get(pid);
        if (!p || p.disp !== 'libera') return;
        let o = offsetAccanto(pid, ids);
        ids.forEach(id => {
            if (!o || !m.nodi[id]) return;
            m.nodi[id].off = { ...o };
            o = { dx: o.dx, dy: o.dy + 36 };
        });
    }

    function posizioneLibera(id) { const b = geo.get(id); return !!b && b.disp === 'libera'; }

    // ---- Sola lettura: niente modifiche, solo spostarsi e ingrandire --------------------------------------

    // Tutto il ramo in larghezza, senza superare il 100% né scendere sotto un minimo leggibile (nella vista
    // ingrandita anche in altezza); se non ci sta tutto, in vista il nodo evidenziato
    function inquadra() {
        const r = tela.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return;
        const b = limitiVisibili(), g = 16;
        const libero = !!opzioni.zoomLibero;
        const z = limita(Math.min(1, (r.width - g * 2) / Math.max(b.w, 1), libero ? (r.height - g * 2) / Math.max(b.h, 1) : Infinity), libero ? 0.12 : 0.55, 1);
        let x = b.w * z <= r.width - g * 2 ? (r.width - b.w * z) / 2 - b.x0 * z : g - b.x0 * z;
        let y = b.h * z <= r.height - g * 2 ? (r.height - b.h * z) / 2 - b.y0 * z : g - b.y0 * z;
        const e = opzioni.evidenzia && geo.get(opzioni.evidenzia);
        if (e) {
            const sx = e.x * z + x, sy = e.y * z + y;
            if (sx < g || sx + e.w * z > r.width - g) x = r.width / 2 - (e.x + e.w / 2) * z;
            if (sy < g || sy + e.h * z > r.height - g) y = r.height / 2 - (e.y + e.h / 2) * z;
        }
        st.vista = { zoom: z, x, y };
        applicaVista();
    }

    function suPuntatoreGiuLettura(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        if (e.target.closest('[data-link]')) return;
        puntatori.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (puntatori.size === 2) {
            const [a, b] = [...puntatori.values()];
            pizzico = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: st.vista.zoom };
            return;
        }
        spostaVista(e, { deseleziona: false });
    }

    // ---- Avvio e chiusura -----------------------------------------------------------------------------

    if (SOLA) {
        tela.addEventListener('pointerdown', suPuntatoreGiuLettura);
        tela.addEventListener('wheel', suRotella, { passive: false });
        window.addEventListener('pointermove', suPuntatoreMosso);
        window.addEventListener('pointerup', suPuntatoreSu);
        window.addEventListener('pointercancel', suPuntatoreSu);
        disegna();
        st.vista = { x: 0, y: 0, zoom: 1 };
        inquadra();
        const osserva = new ResizeObserver(() => inquadra());
        osserva.observe(tela);
        return {
            id: m.id, inquadra,
            misure: () => limitiVisibili(),
            chiudi() {
                window.removeEventListener('pointermove', suPuntatoreMosso);
                window.removeEventListener('pointerup', suPuntatoreSu);
                window.removeEventListener('pointercancel', suPuntatoreSu);
                osserva.disconnect();
            },
        };
    }

    tela.addEventListener('pointerdown', suPuntatoreGiu);
    tela.addEventListener('dblclick', suDoppioClic);
    tela.addEventListener('contextmenu', suMenuContestuale);
    tela.addEventListener('wheel', suRotella, { passive: false });
    tela.addEventListener('dragover', suTrascinaFile);
    tela.addEventListener('drop', suLasciaFile);
    window.addEventListener('pointermove', suPuntatoreMosso);
    window.addEventListener('pointerup', suPuntatoreSu);
    window.addEventListener('pointercancel', suPuntatoreSu);
    radiceEl.addEventListener('click', suClic);
    pannelloEl.addEventListener('input', suInputPannello);
    pannelloEl.addEventListener('change', suCambioPannello);
    pannelloEl.addEventListener('focusout', () => { st.continua = null; });
    pannelloEl.addEventListener('dblclick', e => {
        const r = e.target.closest('[data-struttura]');
        if (r) { seleziona(r.dataset.struttura); modificaNodo(r.dataset.struttura); }
    });
    sopraEl.addEventListener('change', suCambioPop);
    sopraEl.addEventListener('input', e => { if (e.target.matches('[data-distanza-scelti]')) cursoreDistanza(e.target); });
    sopraEl.addEventListener('focusout', e => {
        if (!e.target.matches('[data-distanza-scelti]')) return;
        st.continua = null;
        // Verso un pulsante della stessa barra no: ridisegnandola adesso il clic andrebbe perso
        if (!sopraEl.contains(e.relatedTarget)) requestAnimationFrame(() => { posizionaSopra(); aggiornaPannello(true); });
    });
    // I pulsanti della barra del testo non tolgono il cursore (né la selezione) dal nodo in modifica
    sopraEl.addEventListener('mousedown', e => { if (e.target.closest('.barra-testo-nodo')) e.preventDefault(); });
    const suSelezioneTesto = () => { if (st.modifica && st.modifica.tipo === 'nodo') segnaFormatiAttivi(); };
    document.addEventListener('selectionchange', suSelezioneTesto);
    sopraEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-rel-testo]')) e.target.blur(); });
    $('[data-ricerca] input', radiceEl).addEventListener('input', debounce(e => cerca(e.target.value), 150));
    nomeEl.addEventListener('change', () => {
        const v = nomeEl.value.trim();
        if (!v) { nomeEl.value = m.nome; return; }
        modifica(() => { m.nome = v; });
        document.title = v + ' · Flashcard';
    });
    document.addEventListener('keydown', suTasto);
    document.addEventListener('mappa-da-fuori', suMappaDaFuori);
    document.addEventListener('copy', suCopia);
    document.addEventListener('cut', suTaglia);
    document.addEventListener('paste', suIncolla);
    const suRidimensiona = () => posizionaSopra();
    window.addEventListener('resize', suRidimensiona);

    aggiornaStoria();
    aggiornaPannello(true);
    disegna();
    if (griglia().attiva) { mostraGriglia(); $$('[data-a="griglia"]', radiceEl).forEach(b => b.classList.add('attivo')); }
    // La vista si sistema quando l'area di disegno ha davvero una dimensione (all'apertura può non averla ancora)
    let vistaPronta = false;
    const vistaSalvata = !!st.vista;
    if (!st.vista) st.vista = { x: 0, y: 0, zoom: 1 };
    const avviaVista = () => {
        const r = tela.getBoundingClientRect();
        if (vistaPronta || r.width < 200 || r.height < 150) return;
        vistaPronta = true;
        if (vistaSalvata) applicaVista(); else adatta(1);
        // Aperta da una flashcard: il suo nodo selezionato e in vista
        if (opzioni.nodo && m.nodi[opzioni.nodo]) selezionaDaFuori([opzioni.nodo]); else seleziona(m.radice);
        tela.focus({ preventScroll: true });
    };
    const osservaTela = new ResizeObserver(() => { if (vistaPronta) posizionaSopra(); else avviaVista(); });
    osservaTela.observe(tela);
    avviaVista();

    function chiudi() {
        if (st.modifica) concludiModifica();
        document.removeEventListener('keydown', suTasto);
        document.removeEventListener('mappa-da-fuori', suMappaDaFuori);
        document.removeEventListener('copy', suCopia);
        document.removeEventListener('cut', suTaglia);
        document.removeEventListener('paste', suIncolla);
        document.removeEventListener('selectionchange', suSelezioneTesto);
        window.removeEventListener('pointermove', suPuntatoreMosso);
        window.removeEventListener('pointerup', suPuntatoreSu);
        window.removeEventListener('pointercancel', suPuntatoreSu);
        window.removeEventListener('resize', suRidimensiona);
        osservaTela.disconnect();
        if (st.eliminata) return;
        const tolte = pulisciImmagini();
        if (st.vista) m.vista = { ...st.vista };
        if (timerSalva || tolte) { st.focus = null; disegna(); salvaOra(); }
        else Archivio.salva('mappe', m);
    }

    return {
        id: m.id, chiudi, stato, seleziona: selezionaDaFuori, concentra, adatta: () => adatta(), esportaImmagine,
        fissaPosizioni, posizionaNuovi, posizioneLibera, offsetRaccordo, preparaAllineamento, preparaDistanza,
    };
}
