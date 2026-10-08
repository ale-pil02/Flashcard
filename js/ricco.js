// Editor di testo formattato per domande, risposte e spiegazioni: grassetto, corsivo,
// elenchi, apici/pedici e immagini (incollate, trascinate o scelte dal disco).
// Tutto l'HTML che entra nell'archivio passa da Ricco.pulisci().

const Ricco = (() => {
    const TAG_AMMESSI = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI',
        'IMG', 'SPAN', 'CODE', 'PRE', 'BLOCKQUOTE', 'MARK', 'H3', 'H4', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'A']);
    const TAG_DA_BUTTARE = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'SVG', 'MATH',
        'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'TEMPLATE', 'NOSCRIPT', 'VIDEO', 'AUDIO', 'CANVAS', 'HEAD']);
    const LATO_MAX_IMMAGINE = 1400;

    // Tiene solo la struttura del testo: niente stili, script o attributi estranei
    function pulisci(html) {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
        (function percorri(nodo) {
            [...nodo.childNodes].forEach(figlio => {
                if (figlio.nodeType === Node.TEXT_NODE) return;
                if (figlio.nodeType !== Node.ELEMENT_NODE || TAG_DA_BUTTARE.has(figlio.tagName)) { figlio.remove(); return; }
                percorri(figlio);
                const tag = figlio.tagName;
                if (!TAG_AMMESSI.has(tag)) { figlio.replaceWith(...figlio.childNodes); return; }
                [...figlio.attributes].forEach(a => {
                    const tieni = (tag === 'IMG' && a.name === 'src' && /^(data:image\/(png|jpe?g|gif|webp);|https:)/i.test(a.value))
                        || (tag === 'IMG' && a.name === 'alt')
                        || (tag === 'A' && a.name === 'href' && /^https?:/i.test(a.value))
                        || ((tag === 'TD' || tag === 'TH') && (a.name === 'colspan' || a.name === 'rowspan'));
                    if (!tieni) figlio.removeAttribute(a.name);
                });
                if (tag === 'IMG' && !figlio.getAttribute('src')) figlio.remove();
                if (tag === 'A') { figlio.setAttribute('target', '_blank'); figlio.setAttribute('rel', 'noopener noreferrer'); }
            });
        })(doc.body);
        let pulito = doc.body.innerHTML.trim();
        // Righe vuote in coda lasciate dall'editor
        pulito = pulito.replace(/(<br>|<div><br><\/div>|<p><br><\/p>|\s|&nbsp;)+$/gi, '');
        return pulito;
    }

    function vuoto(html) {
        return !testoDaHtml(html) && !/<img/i.test(html || '');
    }

    function caricaImmagine(src) {
        return new Promise((ok, ko) => {
            const img = new Image();
            img.onload = () => ok(img);
            img.onerror = () => ko(new Error('Immagine non leggibile'));
            img.src = src;
        });
    }

    // Ridimensiona e comprime le immagini: una foto da 5 MB diventa poche centinaia di KB
    async function comprimiImmagine(file) {
        const dataUrl = await leggiFile(file, 'dataurl');
        if (file.type === 'image/gif') return dataUrl;
        const img = await caricaImmagine(dataUrl);
        const scala = Math.min(1, LATO_MAX_IMMAGINE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scala);
        canvas.height = Math.round(img.naturalHeight * scala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        let risultato = canvas.toDataURL('image/webp', 0.85);
        if (!risultato.startsWith('data:image/webp')) risultato = canvas.toDataURL('image/jpeg', 0.85);
        return risultato.length < dataUrl.length ? risultato : dataUrl;
    }

    // Crea un editor dentro "contenitore". Restituisce { valore(), imposta(html), focus(), area }
    function crea(contenitore, { html = '', segnaposto = '', compatto = false, alCambio = null } = {}) {
        contenitore.innerHTML = `
            <div class="ricco${compatto ? ' compatto' : ''}">
                <div class="ricco-barra" role="toolbar">
                    <button type="button" data-cmd="bold" title="Grassetto (Ctrl+B)"><b>G</b></button>
                    <button type="button" data-cmd="italic" title="Corsivo (Ctrl+I)"><i>C</i></button>
                    <button type="button" data-cmd="underline" title="Sottolineato (Ctrl+U)"><u>S</u></button>
                    ${compatto ? '' : `
                    <span class="ricco-sep"></span>
                    <button type="button" data-cmd="insertUnorderedList" title="Elenco puntato">${Ui.ico('elenco')}</button>
                    <button type="button" data-cmd="insertOrderedList" title="Elenco numerato">${Ui.ico('elenco-num')}</button>
                    <button type="button" data-cmd="superscript" title="Apice">x²</button>
                    <button type="button" data-cmd="subscript" title="Pedice">x₂</button>`}
                    <span class="ricco-sep"></span>
                    <button type="button" data-cmd="immagine" title="Inserisci immagine (anche incollando o trascinando)">${Ui.ico('immagine')}</button>
                    <button type="button" data-cmd="removeFormat" title="Rimuovi formattazione">T<sub>x</sub></button>
                </div>
                <div class="ricco-area" contenteditable="true" spellcheck="true" data-segnaposto="${esc(segnaposto)}"></div>
            </div>`;
        const area = $('.ricco-area', contenitore);
        area.innerHTML = html || '';
        let selezione = null;

        const salvaSelezione = () => {
            const s = window.getSelection();
            if (s.rangeCount && area.contains(s.getRangeAt(0).commonAncestorContainer)) selezione = s.getRangeAt(0).cloneRange();
        };
        const ripristinaSelezione = () => {
            area.focus();
            if (!selezione) return;
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(selezione);
        };
        const cambiato = () => {
            if (area.innerHTML === '<br>') area.innerHTML = '';
            if (alCambio) alCambio();
        };

        async function inserisciImmagini(files) {
            const immagini = [...files].filter(f => f.type.startsWith('image/'));
            for (const file of immagini) {
                try {
                    const src = await comprimiImmagine(file);
                    ripristinaSelezione();
                    document.execCommand('insertHTML', false, `<img src="${src}" alt="">`);
                    salvaSelezione();
                } catch (e) {
                    Ui.toast(e.message, 'errore');
                }
            }
            cambiato();
            return immagini.length > 0;
        }

        // I pulsanti non rubano il cursore all'area di testo
        $('.ricco-barra', contenitore).addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
        $('.ricco-barra', contenitore).addEventListener('click', async e => {
            const b = e.target.closest('[data-cmd]');
            if (!b) return;
            if (b.dataset.cmd === 'immagine') {
                salvaSelezione();
                const file = await scegliFile('image/*');
                if (file) inserisciImmagini([file]);
                return;
            }
            ripristinaSelezione();
            document.execCommand(b.dataset.cmd, false, null);
            salvaSelezione();
            cambiato();
        });

        ['keyup', 'mouseup', 'blur'].forEach(ev => area.addEventListener(ev, salvaSelezione));
        area.addEventListener('input', cambiato);

        area.addEventListener('paste', e => {
            const dati = e.clipboardData;
            if (!dati) return;
            if ([...dati.files].some(f => f.type.startsWith('image/'))) {
                e.preventDefault();
                salvaSelezione();
                inserisciImmagini(dati.files);
                return;
            }
            const html = dati.getData('text/html');
            const testo = dati.getData('text/plain');
            e.preventDefault();
            document.execCommand('insertHTML', false, html ? pulisci(html) : testoInHtml(testo));
            cambiato();
        });

        area.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
        area.addEventListener('drop', e => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            // Posiziona il cursore dove è stato lasciato il file
            const punto = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
            if (punto) selezione = punto;
            inserisciImmagini(e.dataTransfer.files);
        });

        return {
            area,
            valore: () => pulisci(area.innerHTML),
            imposta: nuovo => { area.innerHTML = nuovo || ''; },
            focus: () => area.focus(),
            vuoto: () => vuoto(area.innerHTML),
        };
    }

    // Ingrandimento delle immagini durante lo studio
    function ingrandisci(src) {
        const el = document.createElement('div');
        el.className = 'ingrandimento';
        el.innerHTML = `<img src="${esc(src)}" alt="">`;
        const chiudi = () => { el.remove(); document.removeEventListener('keydown', tasto, true); };
        const tasto = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); chiudi(); } };
        el.addEventListener('click', chiudi);
        document.addEventListener('keydown', tasto, true);
        document.body.appendChild(el);
    }

    return { pulisci, vuoto, crea, comprimiImmagine, ingrandisci };
})();
