// Materiali di studio di un set, stile NotebookLM: PDF e slide, immagini, Word, PowerPoint,
// mappe mentali (SimpleMind, OPML, XMind, FreeMind, Markdown), testi e note.
//
// Al caricamento il file viene conservato così com'è (Archivio "file") e se ne estrae il testo;
// dalle mappe si ricava anche l'albero { titolo, corpo, figli }, che serve alle flashcard di
// creazione flashcard per profondità. Nella chat del set i materiali diventano le fonti dell'assistente.
// I materiali possono arrivare anche da una cartella o da file collegati al set (js/cartelle.js): restano
// allineati al file e, quando cambia, il visualizzatore mostra le novità rispetto alla versione prima.
// Le mappe mentali create nell'app (sezione Mappe) che stanno in un set compaiono tra i suoi materiali: un
// materiale "mappa" con mappaId e senza file, che segue la mappa a ogni salvataggio; il clic apre l'editor.

const Materiali = (() => {
    const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
    const URL_PDF = CDN + 'pdf.js/3.11.174/pdf.min.js';
    const URL_PDF_WORKER = CDN + 'pdf.js/3.11.174/pdf.worker.min.js';
    const URL_MAMMOTH = CDN + 'mammoth/1.6.0/mammoth.browser.min.js';
    const URL_JSZIP = CDN + 'jszip/3.10.1/jszip.min.js';

    const MB = 1024 * 1024;
    const MAX_FILE = 60 * MB;
    const ACCETTATI = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.smmx,.opml,.mm,.xmind,.md,.markdown,.txt,.json';

    const TIPI = {
        pdf: { nome: 'PDF', icona: 'documento' },
        immagine: { nome: 'Immagine', icona: 'immagine' },
        word: { nome: 'Word', icona: 'documento' },
        presentazione: { nome: 'Presentazione', icona: 'presentazione' },
        mappa: { nome: 'Mappa mentale', icona: 'mappa' },
        testo: { nome: 'Testo', icona: 'documento' },
        nota: { nome: 'Nota', icona: 'matita' },
    };

    function tipoDi(file) {
        const est = (file.name.split('.').pop() || '').toLowerCase();
        if (est === 'pdf' || file.type === 'application/pdf') return 'pdf';
        if ((file.type || '').startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(est)) return 'immagine';
        if (est === 'docx') return 'word';
        if (est === 'pptx') return 'presentazione';
        if (['smmx', 'opml', 'mm', 'xmind'].includes(est)) return 'mappa';
        if (['md', 'markdown', 'txt', 'json'].includes(est)) return 'testo';
        return null;
    }

    function descrivi(m) {
        const pezzi = [TIPI[m.tipo] ? TIPI[m.tipo].nome : m.tipo];
        if (m.pagine) pezzi.push(plurale(m.pagine, m.tipo === 'presentazione' ? 'diapositiva' : 'pagina', m.tipo === 'presentazione' ? 'diapositive' : 'pagine'));
        if (m.albero) pezzi.push(plurale(contaNodi(m.albero), 'nodo', 'nodi'));
        if (m.dimensione) pezzi.push(formattaDimensione(m.dimensione));
        return pezzi.join(' · ');
    }

    // ---- Alberi delle mappe ----------------------------------------------------

    const nodo = (titolo, corpo = '') => {
        const [t, c] = Localizzazione.separaTitoloCorpo(titolo, corpo);
        return { titolo: t, corpo: c, figli: [] };
    };

    function contaNodi(a) { return 1 + (a.figli || []).reduce((n, f) => n + contaNodi(f), 0); }

    // Albero → elenco puntato rientrato (per l'assistente e per l'anteprima)
    function alberoInTesto(a, livello = 0) {
        const riga = `${livello ? '  '.repeat(livello - 1) + '- ' : '# '}${a.titolo}${a.corpo ? ': ' + a.corpo : ''}`;
        return [riga, ...(a.figli || []).map(f => alberoInTesto(f, livello + 1))].join('\n');
    }

    function testoXml(xml) {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (doc.querySelector('parsererror')) throw new Error('File non leggibile: XML non valido');
        return doc;
    }

    // OPML (SimpleMind, XMind, Freeplane…): come scripts/albero.py
    function alberoDaOpml(xml) {
        const doc = testoXml(xml);
        const titoloTesta = (doc.querySelector('head > title') || {}).textContent || '';
        const body = doc.querySelector('body');
        const outline = body ? [...body.children].filter(e => e.tagName === 'outline') : [];
        if (!outline.length) throw new Error("L'OPML non contiene nodi");
        const costruisci = el => {
            let corpo = el.getAttribute('_note') || el.getAttribute('note') || '';
            const nota = [...el.children].find(e => e.tagName === 'note');
            if (!corpo && nota) corpo = nota.textContent;
            const n = nodo(el.getAttribute('text') || el.getAttribute('title') || '', corpo);
            [...el.children].filter(e => e.tagName === 'outline').forEach(f => n.figli.push(costruisci(f)));
            return n;
        };
        if (outline.length === 1) return costruisci(outline[0]);
        const radice = nodo(titoloTesta.trim() || 'Fonte senza titolo');
        outline.forEach(el => radice.figli.push(costruisci(el)));
        return radice;
    }

    // FreeMind / Freeplane (.mm)
    function alberoDaMm(xml) {
        const doc = testoXml(xml);
        const primo = doc.querySelector('map > node');
        if (!primo) throw new Error('La mappa non contiene nodi');
        const costruisci = el => {
            const ricco = [...el.children].find(e => e.tagName === 'richcontent' && (e.getAttribute('TYPE') || 'NODE') === 'NODE');
            const nota = [...el.children].find(e => e.tagName === 'richcontent' && e.getAttribute('TYPE') === 'NOTE');
            const n = nodo(el.getAttribute('TEXT') || (ricco ? ricco.textContent.trim() : ''), nota ? nota.textContent.replace(/\s+/g, ' ').trim() : '');
            [...el.children].filter(e => e.tagName === 'node').forEach(f => n.figli.push(costruisci(f)));
            return n;
        };
        return costruisci(primo);
    }

    // XMind: content.json (versioni recenti) oppure content.xml (XMind 8)
    async function alberoDaXmind(buffer) {
        await caricaScript(URL_JSZIP);
        const zip = await JSZip.loadAsync(buffer);
        if (zip.file('content.json')) {
            const fogli = JSON.parse(await zip.file('content.json').async('string'));
            const costruisci = t => {
                const corpo = t.notes && t.notes.plain ? t.notes.plain.content : '';
                const n = nodo(t.title || '', corpo);
                ((t.children && t.children.attached) || []).forEach(f => n.figli.push(costruisci(f)));
                return n;
            };
            return costruisci(fogli[0].rootTopic);
        }
        if (zip.file('content.xml')) {
            const doc = testoXml(await zip.file('content.xml').async('string'));
            const costruisci = el => {
                const figliDiretti = nome => [...el.children].filter(e => e.localName === nome);
                const titolo = (figliDiretti('title')[0] || {}).textContent || '';
                const note = figliDiretti('notes')[0];
                const n = nodo(titolo, note ? note.textContent.trim() : '');
                const contenitore = figliDiretti('children')[0];
                if (contenitore) [...contenitore.children].filter(e => e.localName === 'topics' && e.getAttribute('type') === 'attached')
                    .forEach(gruppo => [...gruppo.children].filter(e => e.localName === 'topic').forEach(f => n.figli.push(costruisci(f))));
                return n;
            };
            const radice = [...doc.getElementsByTagName('*')].find(e => e.localName === 'topic');
            if (!radice) throw new Error('La mappa XMind non contiene nodi');
            return costruisci(radice);
        }
        throw new Error('File XMind non riconosciuto');
    }

    // SimpleMind (.smmx): uno zip con document/mindmap.xml. I nodi sono <topic id parent text> in un elenco
    // piatto (parent = -1 per le radici), nell'ordine in cui stanno tra fratelli; nel testo "\N" è un a capo
    // (spesso solo per andare a capo nel riquadro: diventa uno spazio). Le note sono in topic > children > text > note.
    // L'albero parte dal tema centrale; i nodi liberi (altre radici) diventano rami in fondo al tema centrale.
    async function alberoDaSmmx(buffer) {
        await caricaScript(URL_JSZIP);
        const zip = await JSZip.loadAsync(buffer);
        const voce = zip.file('document/mindmap.xml') || zip.file(/^document\/.*\.xml$/i)[0];
        if (!voce) throw new Error('File SimpleMind non riconosciuto');
        const doc = testoXml(await voce.async('string'));
        const pulisci = t => String(t || '').replace(/\\N/g, '\n').split('\n').map(r => r.trim()).filter(Boolean);
        const topics = [...doc.querySelectorAll('mindmap > topics > topic')];
        if (!topics.length) throw new Error('La mappa SimpleMind non contiene nodi');

        const nodi = new Map();
        topics.forEach(t => {
            const note = [...t.querySelectorAll(':scope > children > text > note')].map(n => pulisci(n.textContent).join(' ')).filter(Boolean);
            nodi.set(t.getAttribute('id'), { el: t, nodo: nodo(pulisci(t.getAttribute('text')).join(' '), note.join(' ')) });
        });
        const radici = [];
        topics.forEach(t => {
            const padre = nodi.get(t.getAttribute('parent'));
            const n = nodi.get(t.getAttribute('id')).nodo;
            if (padre && padre.nodo !== n) padre.nodo.figli.push(n); else radici.push(n);
        });
        const idCentrale = (doc.querySelector('mindmap > meta > main-centraltheme') || { getAttribute: () => null }).getAttribute('id');
        const centrale = (nodi.get(idCentrale) || {}).nodo || radici[0];
        radici.filter(r => r !== centrale).forEach(r => centrale.figli.push(r));
        if (!centrale.titolo) centrale.titolo = ((doc.querySelector('mindmap > meta > title') || { getAttribute: () => '' }).getAttribute('text') || 'Mappa senza titolo').trim();
        sfoltisci(centrale);
        return centrale;
    }

    // Nodi senza testo (riquadri vuoti, immagini incollate): via se non hanno niente da leggere
    function sfoltisci(n) {
        n.figli = n.figli.filter(f => {
            sfoltisci(f);
            if (f.titolo) return true;
            if (f.figli.length || f.corpo) { f.titolo = f.figli.length ? '(senza titolo)' : 'Nota'; return true; }
            return false;
        });
    }

    // Mappa dell'app → albero, come per SimpleMind: le etichette (e qui anche la nota) sono il corpo del nodo,
    // i nodi liberi diventano rami in fondo al tema centrale
    function alberoDaMappa(x) {
        const voce = id => {
            const n = x.nodi[id];
            const corpo = [...(n.etichette || []).map(e => Mappe.testoSemplice(e.testo)), Mappe.testoSemplice(n.nota)].filter(Boolean).join(' ');
            const v = nodo(Mappe.testoSemplice(n.testo), corpo);
            v.mappaNodo = id;
            v.figli = n.figli.filter(f => x.nodi[f]).map(voce);
            return v;
        };
        const radice = voce(x.radice);
        Mappe.radiciLibere(x).forEach(l => radice.figli.push(voce(l.id)));
        if (!radice.titolo) radice.titolo = x.nome;
        sfoltisci(radice);
        return radice;
    }

    // Markdown a titoli ed elenchi rientrati: come scripts/albero.py
    function alberoDaMarkdown(testo) {
        const RE_TITOLO = /^(#{1,6})\s+(.*\S)\s*$/;
        const RE_PUNTO = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/;
        const righe = String(testo).split(/\r?\n/);
        const indenti = [...new Set(righe.map(r => r.match(RE_PUNTO)).filter(Boolean).map(m => m[1].replace(/\t/g, '    ').length))].sort((a, b) => a - b);
        const passo = indenti.find(i => i > 0) || 2;
        let radice = null, ultimo = null, profonditaTitolo = 0;
        const pila = [];
        const aggancia = (profondita, n) => {
            while (pila.length && pila[pila.length - 1][0] >= profondita) pila.pop();
            if (!pila.length) {
                if (!radice) { radice = n; pila.push([profondita, n]); return n; }
                pila.push([0, radice]);
            }
            pila[pila.length - 1][1].figli.push(n);
            pila.push([profondita, n]);
            return n;
        };
        for (const riga of righe) {
            if (!riga.trim()) continue;
            let m = riga.match(RE_TITOLO);
            if (m) { ultimo = aggancia(m[1].length, nodo(m[2])); profonditaTitolo = m[1].length; continue; }
            m = riga.match(RE_PUNTO);
            if (m) {
                const rientro = m[1].replace(/\t/g, '    ').length;
                ultimo = aggancia(profonditaTitolo + 1 + Math.floor(rientro / passo), nodo(m[2]));
                continue;
            }
            if (ultimo) ultimo.corpo = (ultimo.corpo + ' ' + riga.trim()).trim();
            else if (!radice) { radice = nodo(riga.trim()); pila.push([0, radice]); ultimo = radice; }
        }
        return radice;
    }

    // Un testo è "a schema" se ha almeno un titolo o un elenco con qualche ramo
    function sembraSchema(testo) {
        return /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s)/m.test(testo) && String(testo).split(/\r?\n/).filter(r => /^\s*([-*+]|\d+[.)]|#{1,6})\s/.test(r)).length >= 3;
    }

    function alberoDaJson(testo) {
        const d = JSON.parse(testo);
        const costruisci = x => {
            const n = nodo(x.titolo || x.text || x.nome || '', x.corpo || x.nota || x.note || '');
            (x.figli || x.children || []).forEach(f => n.figli.push(costruisci(f)));
            return n;
        };
        const radice = Array.isArray(d) ? d[0] : d;
        if (!radice || typeof radice !== 'object') throw new Error('JSON senza nodo radice');
        return costruisci(radice);
    }

    // ---- Estrazione del testo --------------------------------------------------

    async function pdfjs() {
        await caricaScript(URL_PDF);
        pdfjsLib.GlobalWorkerOptions.workerSrc = URL_PDF_WORKER;
        return pdfjsLib;
    }

    async function leggiPdf(buffer) {
        const lib = await pdfjs();
        const doc = await lib.getDocument({ data: buffer }).promise;
        const pagine = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const pagina = await doc.getPage(i);
            const contenuto = await pagina.getTextContent();
            let testo = '';
            contenuto.items.forEach(it => { testo += it.str + (it.hasEOL ? '\n' : ' '); });
            pagine.push(`[Pagina ${i}]\n${testo.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()}`);
        }
        // Anteprima della prima pagina: facoltativa, e con un limite di tempo perché con la
        // scheda in secondo piano il browser può sospendere il disegno
        let anteprima = null;
        try {
            const prima = await doc.getPage(1);
            const base = prima.getViewport({ scale: 1 });
            const vista = prima.getViewport({ scale: 320 / base.width });
            const canvas = document.createElement('canvas');
            canvas.width = vista.width; canvas.height = vista.height;
            const disegno = prima.render({ canvasContext: canvas.getContext('2d'), viewport: vista });
            const scaduto = await Promise.race([disegno.promise.then(() => false), new Promise(ok => setTimeout(() => ok(true), 5000))]);
            if (scaduto) disegno.cancel(); else anteprima = canvas.toDataURL('image/jpeg', 0.72);
        } catch (e) { /* anteprima facoltativa */ }
        return { testo: pagine.join('\n\n'), pagine: doc.numPages, anteprima };
    }

    async function leggiPptx(buffer) {
        await caricaScript(URL_JSZIP);
        const zip = await JSZip.loadAsync(buffer);
        const diapositive = Object.keys(zip.files)
            .map(nome => nome.match(/^ppt\/slides\/slide(\d+)\.xml$/)).filter(Boolean)
            .sort((a, b) => a[1] - b[1]);
        const testi = [];
        for (const [nome, numero] of diapositive) {
            const doc = testoXml(await zip.file(nome).async('string'));
            const paragrafi = [...doc.getElementsByTagName('*')].filter(e => e.localName === 'p' && e.namespaceURI && e.namespaceURI.includes('drawingml'))
                .map(p => [...p.getElementsByTagName('*')].filter(e => e.localName === 't').map(t => t.textContent).join(''))
                .filter(t => t.trim());
            testi.push(`[Diapositiva ${numero}]\n${paragrafi.join('\n')}`);
        }
        return { testo: testi.join('\n\n'), pagine: diapositive.length };
    }

    async function leggiDocx(buffer) {
        await caricaScript(URL_MAMMOTH);
        const r = await mammoth.extractRawText({ arrayBuffer: buffer });
        return { testo: r.value.replace(/\n{3,}/g, '\n\n').trim() };
    }

    function ridimensionaImmagine(blob, lato, qualita = 0.85) {
        return new Promise((ok, ko) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const scala = Math.min(1, lato / Math.max(img.naturalWidth, img.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.naturalWidth * scala);
                canvas.height = Math.round(img.naturalHeight * scala);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                canvas.toBlob(b => (b ? ok(b) : ko(new Error('Immagine non convertibile'))), 'image/jpeg', qualita);
            };
            img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Immagine non leggibile')); };
            img.src = url;
        });
    }

    async function estrai(file, tipo) {
        const est = (file.name.split('.').pop() || '').toLowerCase();
        if (tipo === 'pdf') return leggiPdf(await leggiFile(file, 'buffer'));
        if (tipo === 'word') return leggiDocx(await leggiFile(file, 'buffer'));
        if (tipo === 'presentazione') return leggiPptx(await leggiFile(file, 'buffer'));
        if (tipo === 'immagine') {
            const piccola = await ridimensionaImmagine(file, 320, 0.75);
            return { anteprima: await leggiFile(piccola, 'dataurl') };
        }
        if (tipo === 'mappa') {
            const albero = est === 'smmx' ? await alberoDaSmmx(await leggiFile(file, 'buffer'))
                : est === 'xmind' ? await alberoDaXmind(await leggiFile(file, 'buffer'))
                : est === 'mm' ? alberoDaMm(await leggiFile(file)) : alberoDaOpml(await leggiFile(file));
            return { albero, testo: alberoInTesto(albero) };
        }
        // Testo e Markdown: se è uno schema diventa anche un albero
        const testo = (await leggiFile(file)).replace(/^﻿/, '');
        if (est === 'json') {
            try { const albero = alberoDaJson(testo); return { albero, testo: alberoInTesto(albero), tipo: 'mappa' }; } catch (e) { /* JSON qualunque: resta testo */ }
        }
        return sembraSchema(testo) ? { testo, albero: alberoDaMarkdown(testo) } : { testo };
    }

    // ---- Creazione ---------------------------------------------------------------

    function contenutoDa(file, tipo, estratto) {
        return {
            nome: file.name, estensione: ((file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase(),
            tipo: estratto.tipo || tipo, mime: file.type || '', dimensione: file.size,
            testo: estratto.testo || '', pagine: estratto.pagine || null, albero: estratto.albero || null, anteprima: estratto.anteprima || null,
        };
    }

    // extra: campi in più del materiale (es. cartella = { percorso, modificato, dimensione })
    async function aggiungiFile(setId, file, extra = {}) {
        const tipo = tipoDi(file);
        if (!tipo) throw new Error(`«${file.name}»: formato non supportato`);
        if (file.size > MAX_FILE) throw new Error(`«${file.name}» supera ${formattaDimensione(MAX_FILE)}`);
        const estratto = await estrai(file, tipo);
        const m = Dati.creaMateriale({ setId, ...contenutoDa(file, tipo, estratto), ...extra });
        await Archivio.salvaFile(m.id, file);
        return m;
    }

    // Nuova versione del file di un materiale (cartella collegata). Se il contenuto letto è cambiato,
    // la versione di prima resta in "precedente" per mostrare le novità. Restituisce { materiale, cambiato }
    async function aggiornaDaFile(id, file, extra = {}) {
        const m = Dati.materiale(id);
        if (!m) throw new Error('Materiale non trovato');
        const tipo = tipoDi(file);
        if (!tipo) throw new Error(`«${file.name}»: formato non supportato`);
        const nuovo = contenutoDa(file, tipo, await estrai(file, tipo));
        const uguale = nuovo.testo === (m.testo || '') && JSON.stringify(nuovo.albero) === JSON.stringify(m.albero || null)
            && (nuovo.tipo !== 'immagine' || nuovo.anteprima === m.anteprima);
        Dati.aggiornaMateriale(id, {
            ...nuovo, remoto: null, ...extra,
            ...(uguale ? {} : {
                precedente: { testo: m.testo || '', albero: m.albero || null, modificato: (m.cartella || m.collegato || {}).modificato || m.creato },
                novita: true, aggiornato: Date.now(),
            }),
        });
        await Archivio.salvaFile(id, file);
        return { materiale: Dati.materiale(id), cambiato: !uguale };
    }

    // ---- Novità rispetto alla versione precedente ----------------------------------------

    // Nodi della mappa per percorso (senza la radice): "Ramo › Concetto" → corpo
    function nodiPerPercorso(a, prefisso = [], out = new Map()) {
        (a.figli || []).forEach(f => {
            const percorso = [...prefisso, f.titolo];
            let chiave = percorso.join(' › ');
            while (out.has(chiave)) chiave += ' ';   // titoli ripetuti sotto lo stesso ramo
            out.set(chiave, f.corpo || '');
            nodiPerPercorso(f, percorso, out);
        });
        return out;
    }

    function differenze(m) {
        const p = m.precedente;
        if (!p) return null;
        if (m.albero && p.albero) {
            const prima = nodiPerPercorso(p.albero), ora = nodiPerPercorso(m.albero);
            const aggiunti = [...ora.keys()].filter(k => !prima.has(k));
            const insieme = new Set(aggiunti);
            const padre = k => k.split(' › ').slice(0, -1).join(' › ');
            return {
                tipo: 'albero',
                titolo: p.albero.titolo !== m.albero.titolo ? { prima: p.albero.titolo, ora: m.albero.titolo } : null,
                aggiunti: aggiunti.map(k => ({ percorso: k.trim(), corpo: ora.get(k), cima: !padre(k) || !insieme.has(padre(k)) })),
                tolti: [...prima.keys()].filter(k => !ora.has(k)).map(k => ({ percorso: k.trim(), corpo: prima.get(k) })),
                cambiati: [...ora.keys()].filter(k => prima.has(k) && prima.get(k) !== ora.get(k)).map(k => ({ percorso: k.trim(), prima: prima.get(k), ora: ora.get(k) })),
            };
        }
        const righe = t => new Set((t || '').split('\n').map(r => r.replace(/\s+/g, ' ').trim()).filter(r => r && !/^-{2,} ?(pagina|diapositiva)/i.test(r)));
        const prima = righe(p.testo), ora = righe(m.testo);
        return { tipo: 'testo', aggiunte: [...ora].filter(r => !prima.has(r)), tolte: [...prima].filter(r => !ora.has(r)) };
    }

    function differenzeVuote(d) {
        return !d || (d.tipo === 'albero' ? !d.titolo && !d.aggiunti.length && !d.tolti.length && !d.cambiati.length : !d.aggiunte.length && !d.tolte.length);
    }

    // Le novità come testo, per l'assistente
    function differenzeInTesto(d) {
        if (differenzeVuote(d)) return 'Nessuna differenza nel testo letto (forse è cambiata solo la grafica).';
        const elenco = (titolo, voci) => (voci.length ? `${titolo} (${voci.length}):\n${voci.join('\n')}` : '');
        if (d.tipo === 'albero') {
            return [
                d.titolo ? `Titolo della mappa: «${d.titolo.prima}» → «${d.titolo.ora}»` : '',
                elenco('Nodi aggiunti', d.aggiunti.map(n => `- ${n.percorso}${n.corpo ? ': ' + n.corpo : ''}`)),
                elenco('Nodi tolti', d.tolti.map(n => `- ${n.percorso}${n.corpo ? ': ' + n.corpo : ''}`)),
                elenco('Nodi con il testo cambiato', d.cambiati.map(n => `- ${n.percorso}: prima «${n.prima}» → ora «${n.ora}»`)),
            ].filter(Boolean).join('\n\n');
        }
        const taglia = lista => (lista.length > 300 ? [...lista.slice(0, 300), `… e altre ${lista.length - 300} righe`] : lista);
        return [elenco('Righe nuove', taglia(d.aggiunte).map(r => '+ ' + r)), elenco('Righe tolte', taglia(d.tolte).map(r => '- ' + r))].filter(Boolean).join('\n\n');
    }

    function differenzeHtml(m) {
        const d = differenze(m);
        const ico = Ui.ico;
        const voci = (lista, segno, classe, testo) => {
            const max = 12;
            return lista.slice(0, max).map(x => `<li class="${classe}"><span>${segno}</span><div>${testo(x)}</div></li>`).join('')
                + (lista.length > max ? `<li class="altre">…e altre ${lista.length - max}</li>` : '');
        };
        let corpo;
        if (differenzeVuote(d)) corpo = '<p class="nota">Il testo letto è uguale a prima: forse è cambiata solo la grafica.</p>';
        else if (d.tipo === 'albero') {
            // Dei rami nuovi si mostra solo la cima, con quanti nodi ha sotto
            const cime = d.aggiunti.filter(n => n.cima).map(n => ({ ...n, figli: d.aggiunti.filter(x => x.percorso.startsWith(n.percorso + ' › ')).length }));
            corpo = `<ul class="elenco-novita">
                ${d.titolo ? `<li class="cambiato"><span>✎</span><div>Titolo: <s>${esc(d.titolo.prima)}</s> → <b>${esc(d.titolo.ora)}</b></div></li>` : ''}
                ${voci(cime, '+', 'aggiunto', n => `<b>${esc(n.percorso)}</b>${n.corpo ? `: ${esc(Ui.tronca(n.corpo, 140))}` : ''}${n.figli ? ` <small>(+${n.figli} sotto)</small>` : ''}`)}
                ${voci(d.cambiati, '✎', 'cambiato', n => `<b>${esc(n.percorso)}</b>: <s>${esc(Ui.tronca(n.prima, 90))}</s> → ${esc(Ui.tronca(n.ora, 140))}`)}
                ${voci(d.tolti, '−', 'tolto', n => `<b>${esc(n.percorso)}</b>`)}
            </ul>`;
        } else {
            corpo = `<ul class="elenco-novita">
                ${voci(d.aggiunte, '+', 'aggiunto', r => esc(Ui.tronca(r, 220)))}
                ${voci(d.tolte, '−', 'tolto', r => esc(Ui.tronca(r, 220)))}
            </ul>`;
        }
        return `
            <details class="novita-materiale"${haNovita(m) ? ' open' : ''}>
                <summary>${ico('sincronizza')}<b>Il file è cambiato</b><small>${m.aggiornato ? esc(quandoFa(m.aggiornato)) : ''} · novità rispetto alla versione prima</small></summary>
                ${corpo}
            </details>`;
    }

    // Etichetta "aggiornato": resta finché non apri il materiale (nell'app o nel suo programma),
    // non aggiorni le flashcard con le novità o non lo segni come visto; comunque sparisce dopo 3 giorni.
    // Le novità restano consultabili (⋯ → Vedi le novità) fino al cambiamento successivo.
    const DURATA_NOVITA = 3 * GIORNO_MS;

    function haNovita(m) { return !!m.novita && Date.now() - (m.aggiornato || 0) < DURATA_NOVITA; }

    function segnaVisto(id) {
        const m = Dati.materiale(id);
        if (!m || !m.novita) return;
        Dati.aggiornaMateriale(id, { novita: false });
        aggiorna();
    }

    // Chiede all'assistente di portare le novità nelle flashcard del set
    function aggiornaFlashcard(m) {
        segnaVisto(m.id);
        const d = differenze(m);
        const localizzazione = Dati.carteDiSet(m.setId, { tutte: true }).some(c => c.tag.some(t => /^(generale|sottoramo|concetto \d+|dettaglio)$/i.test(t)));
        Assistente.apri({ setId: m.setId });
        Assistente.invia(
            `Il materiale «${m.nome}» è cambiato: aggiorna le flashcard di questo set con le novità. Crea le carte che mancano agganciandole alla domanda madre giusta, `
            + `correggi quelle superate e, per quello che è stato tolto, dimmi quali carte eliminare prima di farlo.`
            + (localizzazione ? ' Per i rami nuovi usa la stessa procedura della creazione flashcard per profondità (skill creatore-flashcard-mappe-mentali) con cui sono fatte le altre.' : ''),
            { dettagli: `[Novità del materiale «${m.nome}» (id ${m.id}) rispetto alla versione precedente]\n${differenzeInTesto(d)}`, etichetta: `Novità di «${m.nome}»` });
    }

    async function caricaMolti(setId, files, dopo) {
        const lista = [...files];
        if (!lista.length) return [];
        const creati = [];
        for (const file of lista) {
            Ui.toast(`Elaboro «${file.name}»…`, 'info', 1500);
            try { creati.push(await aggiungiFile(setId, file)); }
            catch (e) { console.error(e); Ui.toast(e.message || `Non riesco a leggere «${file.name}»`, 'errore', 5000); }
            if (dopo) dopo();
        }
        if (creati.length) Ui.toast(`${plurale(creati.length, 'materiale aggiunto', 'materiali aggiunti')}`, 'successo');
        return creati;
    }

    function creaNota(setId, titolo, testo) {
        return Dati.creaMateriale({
            setId, nome: titolo || 'Nota', tipo: 'nota', testo, dimensione: new Blob([testo]).size,
            albero: sembraSchema(testo) ? alberoDaMarkdown(testo) : null,
        });
    }

    function aggiornaTestoNota(id, titolo, testo) {
        return Dati.aggiornaMateriale(id, {
            nome: titolo, testo, dimensione: new Blob([testo]).size, albero: sembraSchema(testo) ? alberoDaMarkdown(testo) : null,
        });
    }

    function formNota(setId, nota = null) {
        return new Promise(risolvi => {
            let fatto = null;
            Ui.modale({
                titolo: nota ? 'Modifica nota' : 'Nuova nota', classe: 'modale-larga',
                corpo: `
                    <label class="campo"><span>Titolo</span><input type="text" name="titolo" maxlength="140" value="${esc(nota ? nota.nome : '')}" placeholder="es. Appunti della lezione 3" autofocus></label>
                    <label class="campo"><span>Testo <em>incolla appunti, uno schema a elenchi (diventa una mappa) o quello che vuoi dare all'assistente</em></span>
                        <textarea name="testo" rows="14" placeholder="# Titolo&#10;- Ramo 1&#10;  - Concetto: spiegazione">${esc(nota ? nota.testo : '')}</textarea></label>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: nota ? 'Salva' : 'Aggiungi nota', classe: 'btn-primario', clic: m => {
                        const testo = $('[name=testo]', m.el).value.trim();
                        if (!testo) { Ui.segnalaErrore($('[name=testo]', m.el), 'La nota è vuota'); return; }
                        const titolo = $('[name=titolo]', m.el).value.trim() || testo.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80);
                        fatto = nota ? aggiornaTestoNota(nota.id, titolo, testo) : creaNota(setId, titolo, testo);
                        m.chiudi();
                    } },
                ],
                alChiudere: () => risolvi(fatto),
            });
        });
    }

    // ---- Per l'assistente ----------------------------------------------------------

    // Parti Gemini di un materiale: PDF e immagini come file (inline o caricati), il resto come testo.
    // budget = { inline: byte ancora disponibili nella richiesta }
    async function partiPerIA(m, budget) {
        const intestazione = { text: `=== MATERIALE «${m.nome}» (id ${m.id}, ${descrivi(m)}) ===` };
        if (m.tipo === 'pdf' || m.tipo === 'immagine') {
            let blob = await Archivio.leggiFile(m.id);
            if (blob) {
                if (m.tipo === 'immagine' && blob.size > 2.5 * MB) blob = await ridimensionaImmagine(blob, 2000, 0.85);
                const mime = m.tipo === 'pdf' ? 'application/pdf' : (blob.type || 'image/jpeg');
                if (blob.size <= budget.inline) {
                    budget.inline -= blob.size;
                    return [intestazione, { inlineData: { mimeType: mime, data: await bloInBase64(blob) } }];
                }
                try {
                    const uri = await fileRemoto(m, blob, mime);
                    return [intestazione, { fileData: { mimeType: mime, fileUri: uri } }];
                } catch (e) { console.warn('Caricamento su Gemini non riuscito, uso il testo estratto', e); }
            }
        }
        if (m.albero && (m.tipo === 'mappa' || !m.testo)) return [intestazione, { text: alberoInTesto(m.albero) }];
        if (m.testo) return [intestazione, { text: m.testo.length > 300000 ? m.testo.slice(0, 300000) + '\n[…testo troncato]' : m.testo }];
        return [intestazione, { text: '(nessun contenuto leggibile)' }];
    }

    // File grandi: caricati una volta sui server di Gemini (restano 48 ore)
    async function fileRemoto(m, blob, mime) {
        if (m.remoto && m.remoto.scade > Date.now() + 3600e3) return m.remoto.uri;
        const caricato = await Gemini.caricaFile(blob, mime, m.nome);
        Dati.aggiornaMateriale(m.id, { remoto: { uri: caricato.uri, scade: Date.now() + 47 * 3600e3 } });
        return caricato.uri;
    }

    // ---- Visualizzatore ----------------------------------------------------------

    // ---- Fonte della risposta di una carta ---------------------------------------------
    // carta.fonte = { materiale, pagina, citazione }: un clic apre il materiale lì (il PDF alla pagina, i testi con la
    // frase evidenziata). La citazione si cerca nel testo estratto anche con spazi e a capo diversi; se non si trova
    // intera si prova con le prime parole, poi si ripiega sull'intestazione della pagina ([Pagina N], [Diapositiva N]).

    function trovaCitazione(testo, citazione) {
        const t = String(testo || '');
        const parole = String(citazione || '').trim().split(/\s+/).filter(Boolean).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        for (const n of [parole.length, 8, 5]) {
            if (n > parole.length || n < Math.min(4, parole.length)) continue;
            const r = new RegExp(parole.slice(0, n).join('\\s+'), 'i').exec(t);
            if (r) return { da: r.index, a: r.index + r[0].length };
        }
        return null;
    }

    function testoConSegno(testo, punto) {
        const t = String(testo || '');
        let pezzo = punto && punto.citazione ? trovaCitazione(t, punto.citazione) : null;
        if (!pezzo && punto && punto.pagina) {
            const r = new RegExp(`\\[(Pagina|Diapositiva) ${punto.pagina}\\]`).exec(t);
            if (r) pezzo = { da: r.index, a: r.index + r[0].length };
        }
        if (!pezzo) return esc(t);
        return esc(t.slice(0, pezzo.da)) + '<mark class="segno-fonte" data-segno>' + esc(t.slice(pezzo.da, pezzo.a)) + '</mark>' + esc(t.slice(pezzo.a));
    }

    // La fonte di una carta se il materiale c'è ancora: { m, pagina, citazione }
    function fonteDi(c) {
        const f = c && c.fonte;
        const m = f && Dati.materiale(f.materiale);
        return m ? { m, pagina: f.pagina || null, citazione: f.citazione || '' } : null;
    }

    function dovePagina(m, pagina) { return pagina ? `${m.tipo === 'presentazione' ? 'diapositiva' : 'p.'} ${pagina}` : ''; }

    // Riga "fonte" sotto la risposta (studio, anteprima dell'editor)
    function fonteHtml(c) {
        if (!c || !c.fonte) return '';
        const f = fonteDi(c);
        if (!f) return `<p class="risposta-fonte persa">${Ui.ico('avviso')}<span>Il materiale collegato come fonte non c'è più</span></p>`;
        return `<button type="button" class="risposta-fonte" data-vai-fonte title="Apri la fonte nel punto della risposta">
            ${Ui.ico(TIPI[f.m.tipo] ? TIPI[f.m.tipo].icona : 'documento')}
            <span><b>${esc(f.m.nome)}</b>${f.pagina ? ` · ${dovePagina(f.m, f.pagina)}` : ''}${f.citazione ? `<em>«${esc(Ui.tronca(f.citazione, 160))}»</em>` : ''}</span>
            ${Ui.ico('destra')}</button>`;
    }

    // Dalla risposta alla fonte: il materiale nel punto giusto; senza fonte, la parte di mappa ingrandita
    function vaiAllaFonte(c) {
        const f = fonteDi(c);
        if (f) apri(f.m.id, { pagina: f.pagina, citazione: f.citazione });
        else if (c && c.mappa) VistaMappa.ingrandisci(c);
    }

    function alberoHtml(a) {
        return `<li><b>${esc(a.titolo)}</b>${a.corpo ? `<span class="corpo-nodo">${esc(a.corpo)}</span>` : ''}${a.figli && a.figli.length ? `<ul>${a.figli.map(alberoHtml).join('')}</ul>` : ''}</li>`;
    }

    // punto = { pagina, citazione }: si apre lì (dalla risposta di una carta)
    async function apri(id, punto = null) {
        const m = Dati.materiale(id);
        if (!m) return;
        const novita = m.precedente && !punto ? differenzeHtml(m) : '';
        segnaVisto(id);
        const blob = m.tipo === 'nota' ? null : await Archivio.leggiFile(m.id);
        const url = blob ? URL.createObjectURL(blob) : null;
        const pagina = punto && punto.pagina ? `#page=${punto.pagina}` : '';
        let contenuto;
        if (m.tipo === 'pdf' && url) contenuto = `<iframe class="vista-pdf" src="${url}${pagina}" title="${esc(m.nome)}"></iframe>`;
        else if (m.tipo === 'immagine' && url) contenuto = `<img class="vista-immagine" src="${url}" alt="${esc(m.nome)}">`;
        else if (m.albero) contenuto = `<ul class="vista-albero">${alberoHtml(m.albero)}</ul>`;
        else contenuto = `<div class="vista-testo">${m.testo ? testoConSegno(m.testo, punto) : '(nessun testo estratto)'}</div>`;
        const qui = punto && (punto.pagina || punto.citazione) ? `
                <p class="nota nota-fonte">${Ui.ico('obiettivo')}<span>La risposta è qui${punto.pagina ? `, a ${m.tipo === 'presentazione' ? 'diapositiva' : 'pagina'} ${punto.pagina}` : ''}${punto.citazione ? `: «${esc(punto.citazione)}»` : ''}</span></p>` : '';
        const segnoNelTesto = !!punto && (m.tipo === 'pdf' && url) && m.testo && /data-segno/.test(testoConSegno(m.testo, punto));
        const puòLocalizzare = m.albero || m.tipo === 'pdf' || m.tipo === 'immagine';
        Ui.modale({
            titolo: m.nome, classe: 'modale-materiale',
            corpo: `
                <p class="nota">${Ui.ico(TIPI[m.tipo] ? TIPI[m.tipo].icona : 'documento')}${esc(descrivi(m))}${m.cartella ? ` · ${Ui.ico('collega')}dalla cartella collegata: ${esc(m.cartella.percorso)}` : ''}${m.collegato ? ` · ${Ui.ico('collega')}file collegato: ${esc(m.collegato.percorso)}` : ''}</p>
                ${m.collegato && Cartelle.fileMancante(m.id) ? `<p class="nota nota-cartella">${Ui.ico('avviso')}<span>Il file non si trova più (spostato, rinominato o Drive non avviato): qui vedi l'ultima versione letta. Dal menu ⋯ puoi ricollegarlo.</span></p>` : ''}
                ${novita}${qui}
                <div class="vista-materiale">${contenuto}</div>
                ${m.albero && m.tipo !== 'mappa' ? `<details class="altri-campi"><summary>${Ui.ico('documento')}Testo originale</summary><div class="vista-testo">${esc(m.testo)}</div></details>` : ''}
                ${m.tipo === 'pdf' && url && m.testo ? `<details class="altri-campi"${segnoNelTesto ? ' data-con-segno' : ''}><summary>${Ui.ico('documento')}Testo estratto${segnoNelTesto ? ', con la frase della risposta evidenziata' : " (quello che legge l'assistente se il file è troppo grande)"}</summary><div class="vista-testo">${testoConSegno(m.testo, punto)}</div></details>` : ''}`,
            azioni: [
                blob ? { testo: `${Ui.ico('scarica')}Scarica`, classe: 'btn-fantasma', clic: () => scaricaFile(m.nome, blob) } : null,
                m.mappaId ? { testo: `${Ui.ico('mappa')}Apri la mappa`, classe: 'btn-secondario', clic: md => { md.chiudi(); Router.vai('/mappa/' + m.mappaId); } } : null,
                m.tipo === 'nota' ? { testo: `${Ui.ico('matita')}Modifica`, classe: 'btn-fantasma', clic: async md => { md.chiudi(); if (await formNota(m.setId, m)) aggiorna(); } } : null,
                puòLocalizzare ? { testo: `${Ui.ico('ramo')}Creazione flashcard per profondità`, classe: 'btn-secondario', clic: md => { md.chiudi(); localizzazione(m); } } : null,
                m.precedente
                    ? { testo: `${Ui.ico('sincronizza')}Aggiorna le flashcard`, classe: 'btn-primario', clic: md => { md.chiudi(); aggiornaFlashcard(Dati.materiale(m.id)); } }
                    : { testo: `${Ui.ico('scintille')}Chiedi all'assistente`, classe: 'btn-primario', clic: md => { md.chiudi(); Assistente.apri({ setId: m.setId }); } },
            ].filter(Boolean),
            alApri: el => {
                // Il punto della risposta in vista (nei testi è evidenziato)
                const segno = $('.vista-materiale [data-segno]', el);
                if (segno) setTimeout(() => segno.scrollIntoView({ block: 'center' }), 60);
            },
            alChiudere: () => { if (url) URL.revokeObjectURL(url); },
        });
    }

    // ---- Aprire con il programma del computer -------------------------------------------
    // Per PDF, Word, PowerPoint, immagini… Le mappe di SimpleMind no: SimpleMind non si usa più, si leggono nell'app

    function eSimpleMind(m) { return m.estensione === 'smmx' || /\.smmx$/i.test(m.nome); }

    // Il clic su un materiale: le mappe dell'app si aprono nel loro editor, il resto nel visualizzatore
    function apriPredefinito(id) {
        const m = Dati.materiale(id);
        if (!m) return;
        if (m.mappaId && Mappe.mappa(m.mappaId)) Router.vai('/mappa/' + m.mappaId);
        else apri(id);
    }

    // ---- Mappe dell'app tra i materiali -------------------------------------------------

    function materialeDiMappa(mappaId) {
        return mappaId ? Archivio.tutti('materiali').find(x => x.mappaId === mappaId) || null : null;
    }

    // Il materiale segue la mappa: c'è finché la mappa sta in un set (nello stesso set), con nome, albero e anteprima
    function allineaMappa(mappaId) {
        if (!mappaId) return;
        const x = Mappe.mappa(mappaId);
        const mat = materialeDiMappa(mappaId);
        const setId = x && x.setId && Dati.set(x.setId) ? x.setId : null;
        if (!setId) {
            if (mat) Dati.eliminaMateriale(mat.id);
            return;
        }
        const albero = alberoDaMappa(x);
        const dati = {
            setId, nome: x.nome, tipo: 'mappa', mappaId: x.id, albero, testo: alberoInTesto(albero),
            anteprima: x.anteprima && /^<svg[\s>]/.test(x.anteprima) ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(x.anteprima) : null,
        };
        if (!mat) Dati.creaMateriale(dati);
        else if (Object.keys(dati).some(k => JSON.stringify(mat[k]) !== JSON.stringify(dati[k]))) Dati.aggiornaMateriale(mat.id, dati);
    }

    // All'avvio: un materiale per ogni mappa che sta in un set, niente materiali di mappe che non ci sono più
    function allineaMappe() {
        const visti = new Set();
        Archivio.tutti('materiali').filter(x => x.mappaId).forEach(x => {
            if (!Mappe.mappa(x.mappaId) || visti.has(x.mappaId)) Archivio.elimina('materiali', x.id);
            visti.add(x.mappaId);
        });
        Mappe.tutte().forEach(x => allineaMappa(x.id));
    }

    // Ogni salvataggio o eliminazione di una mappa (editor, assistente, annulla, import) riallinea il suo materiale.
    // Il ripristino da backup ('sostituisci') porta già materiali e mappe d'accordo: si riallinea al prossimo avvio.
    Archivio.alCambio((nome, operazioni) => {
        if (nome !== 'mappe') return;
        operazioni.forEach(op => {
            if (op.tipo === 'salva') allineaMappa(op.valore.id);
            else if (op.tipo === 'elimina') allineaMappa(op.id);
        });
    });

    // Azioni sul materiale di una mappa: agiscono sulla mappa (e il materiale la segue)
    function cambiaMappa(mappaId, fn) {
        const x = Mappe.mappa(mappaId);
        if (!x) return;
        fn(x);
        Mappe.salva(x);
    }

    async function apriSulComputer(m) {
        const programma = 'il suo programma';
        try {
            const { copia } = await Cartelle.apriSulComputer(m);
            segnaVisto(m.id);
            if (copia) Ui.toast(`Aperta una copia con ${programma}: le modifiche fatte lì non tornano qui. Per lavorare sul file vero, collegalo (Collega → Uno o più file)`, 'info', 9000);
            else Ui.toast(`Aperto con ${programma}: quando salvi, qui si aggiorna da solo`, 'successo', 4500);
        } catch (e) {
            Ui.toast(e.message || `Non riesco ad aprirlo con ${programma}`, 'errore', 6000);
        }
    }

    // Avvia la skill: la chiede l'utente esplicitamente, premendo il pulsante
    function localizzazione(m) {
        Assistente.apri({ setId: m.setId });
        Assistente.invia(`/profondita Crea le flashcard per profondità dal materiale «${m.nome}» (id ${m.id}) e mettile in questo set.`);
    }

    // ---- Sezione nella pagina del set -------------------------------------------------

    let aggiorna = () => {};
    let montato = null;   // { contenitore, setId } della sezione visibile

    // La cartella collegata ha cambiato qualcosa (o il suo stato): si ridisegna la sezione
    document.addEventListener('cartella-cambiata', e => {
        if (montato && document.contains(montato.contenitore) && e.detail.setId === montato.setId) aggiorna();
    });

    function strisciaCartella(s) {
        const ico = Ui.ico;
        const st = Cartelle.stato(s.id);
        const pulsante = (azione, testo, icona = 'sincronizza') => `<button type="button" class="btn btn-secondario btn-piccolo" data-mat="${azione}">${ico(icona)}${testo}</button>`;
        let testo, azione = '', avviso = false;
        if (st.errore) { testo = st.errore; azione = pulsante('sincronizza', 'Riprova'); avviso = true; }
        else if (!st.controllata) testo = 'Controllo la cartella…';
        else testo = 'Collegata: file nuovi, modificati o tolti si aggiornano da soli';
        const nonLeggibili = st.nonLeggibili || [], troppoGrandi = st.troppoGrandi || [];
        return `
            <div class="striscia-cartella${avviso ? ' avviso' : ''}">
                <span class="striscia-icona">${ico('cartella')}</span>
                <div class="striscia-testo" title="${esc(s.cartella.percorso || '')}"><b>${esc(s.cartella.nome)}</b><small>${esc(testo)}</small></div>
                ${azione}
                <button type="button" class="btn-icona" data-mat="menu-cartella" aria-label="Opzioni della cartella">${ico('altro')}</button>
            </div>
            ${nonLeggibili.length ? `<p class="nota nota-cartella">${ico('avviso')}<span>${plurale(nonLeggibili.length, 'file di Google (Documenti, Presentazioni…) non si legge', 'file di Google (Documenti, Presentazioni…) non si leggono')} da qui
                (${esc(nonLeggibili.slice(0, 3).join(', '))}${nonLeggibili.length > 3 ? '…' : ''}): in Drive scaricali come PDF o PowerPoint nella stessa cartella.</span></p>` : ''}
            ${troppoGrandi.length ? `<p class="nota nota-cartella">${ico('avviso')}<span>Oltre ${formattaDimensione(MAX_FILE)}, non letti: ${esc(troppoGrandi.join(', '))}</span></p>` : ''}`;
    }

    function monta(contenitore, setId) {
        aggiorna = () => monta(contenitore, setId);
        montato = { contenitore, setId };
        const s = Dati.set(setId);
        const lista = Dati.materialiDiSet(setId);
        const ico = Ui.ico;
        contenitore.innerHTML = `
            <section class="sezione sezione-materiali${Ui.classeApribile('materiali')}">
                <div class="sezione-testa">
                    ${Ui.titoloApribile('materiali', `Materiali ${lista.length ? `<span class="conteggio">${lista.length}</span>` : ''}`)}
                    <div class="azioni-riga">
                        ${lista.length ? `<button type="button" class="btn btn-fantasma btn-piccolo" data-mat="chiedi">${ico('scintille')}Chiedi</button>` : ''}
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-mat="menu-collega" title="Collega una cartella o dei file del computer o di Google Drive: restano allineati da soli">${ico('collega')}Collega</button>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-mat="nota">${ico('matita')}Nota</button>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-mat="mappa" title="Una mappa mentale nuova, in questo set">${ico('mappa')}Mappa</button>
                        <button type="button" class="btn btn-secondario btn-piccolo" data-mat="carica">${ico('carica')}Carica</button>
                    </div>
                </div>
                <div class="sezione-corpo">
                ${s.cartella ? strisciaCartella(s) : ''}
                ${lista.length ? `
                <div class="griglia-materiali">
                    ${lista.map(m => `
                        <div class="tessera-materiale${m.usaInChat === false ? ' esclusa' : ''}${haNovita(m) ? ' con-novita' : ''}" data-id="${m.id}" ${m.cartella || m.collegato ? `title="${esc((m.cartella || m.collegato).percorso)}"` : ''}>
                            <button type="button" class="materiale-anteprima tipo-${m.tipo}" data-mat="apri" title="Apri">
                                ${m.anteprima ? `<img src="${esc(m.anteprima)}" alt="">` : ico(TIPI[m.tipo] ? TIPI[m.tipo].icona : 'documento')}
                            </button>
                            <div class="materiale-info">
                                <b title="${esc(m.nome)}">${esc(m.nome)}</b>
                                <small>${haNovita(m) ? '<span class="etichetta-novita" title="Il file è cambiato: aprilo per vedere le novità">aggiornato</span>' : ''}${m.collegato && Cartelle.fileMancante(m.id) ? '<span class="etichetta-mancante">file non trovato</span>' : ''}${m.cartella || m.collegato ? ico('collega', 'ico-cartella') : ''}${esc(descrivi(m))}${m.usaInChat === false ? ' · escluso dalla chat' : ''}</small>
                            </div>
                            <button type="button" class="btn-icona" data-mat="menu" aria-label="Azioni sul materiale">${ico('altro')}</button>
                        </div>`).join('')}
                </div>
                <p class="nota nota-trascina">Trascina qui altri file per aggiungerli.</p>`
                : s.cartella ? '<p class="nota">Nella cartella non ci sono ancora file leggibili.</p>' : `
                <button type="button" class="zona-file zona-materiali" data-mat="carica">
                    ${ico('carica')}
                    <b>Carica i materiali di questo set</b>
                    <small>Slide e PDF, mappe mentali (SimpleMind, OPML, XMind, FreeMind, Markdown), Word, PowerPoint, immagini e testi.
                        L'assistente li usa come fonti, come in NotebookLM. Anche le mappe che crei nell'app per questo set compaiono qui.</small>
                </button>
                <p class="nota nota-collega">Oppure collega <button type="button" class="link" data-mat="collega">una cartella</button> o
                    <button type="button" class="link" data-mat="collega-file">dei file</button> del computer o di Google Drive: quando li modifichi, qui si aggiornano da soli.</p>`}
                </div>
            </section>`;

        const sezione = $('.sezione-materiali', contenitore);
        sezione.addEventListener('click', async e => {
            const b = e.target.closest('[data-mat]');
            if (!b) return;
            const tessera = b.closest('[data-id]');
            const id = tessera ? tessera.dataset.id : null;
            if (['carica', 'nota', 'mappa', 'menu-collega', 'collega', 'collega-file'].includes(b.dataset.mat)) Ui.apriSezione('materiali');
            switch (b.dataset.mat) {
                case 'carica': {
                    const input = document.createElement('input');
                    input.type = 'file'; input.multiple = true; input.accept = ACCETTATI;
                    input.addEventListener('change', () => caricaMolti(setId, input.files, aggiorna));
                    input.click();
                    break;
                }
                case 'nota': if (await formNota(setId)) aggiorna(); break;
                case 'mappa': Viste.mappe.nuova(); break;
                case 'chiedi': Assistente.apri({ setId }); break;
                case 'collega': collegaCartella(setId); break;
                case 'collega-file': collegaFile(setId); break;
                case 'menu-collega': Ui.menu(b, [
                    !s.cartella && { testo: 'Una cartella intera', icona: 'cartella', clic: () => collegaCartella(setId) },
                    { testo: 'Uno o più file', icona: 'documento', clic: () => collegaFile(setId) },
                ]); break;
                case 'sincronizza': Cartelle.sincronizza(setId).then(aggiorna, e => Ui.toast(e.message, 'errore', 6000)); break;
                case 'menu-cartella': menuCartella(b, setId); break;
                case 'apri': apriPredefinito(id); break;
                case 'menu': menu(b, id); break;
            }
        });
        sezione.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); sezione.classList.add('sopra'); } });
        sezione.addEventListener('dragleave', e => { if (!sezione.contains(e.relatedTarget)) sezione.classList.remove('sopra'); });
        sezione.addEventListener('drop', e => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            sezione.classList.remove('sopra');
            Ui.apriSezione('materiali');
            caricaMolti(setId, e.dataTransfer.files, aggiorna);
        });
    }

    function menu(ancora, id) {
        const m = Dati.materiale(id);
        if (!m) return;
        // I file di una cartella collegata si rinominano, spostano ed eliminano dalla cartella;
        // un file collegato prende il nome dal file, ma si può spostare o togliere dal set
        const libero = !m.cartella;
        const collegato = !!m.collegato;
        if (m.mappaId) { menuMappa(ancora, m); return; }
        Ui.menu(ancora, [
            { testo: 'Apri', icona: 'occhio', clic: () => apri(id) },
            !eSimpleMind(m) && m.tipo !== 'nota' && { testo: 'Apri con il programma del computer', icona: 'presentazione', clic: () => apriSulComputer(m) },
            m.precedente && { testo: 'Aggiorna le flashcard con le novità', icona: 'sincronizza', clic: () => aggiornaFlashcard(m) },
            haNovita(m) && { testo: 'Segna come visto', icona: 'spunta', clic: () => segnaVisto(id) },
            (m.albero || m.tipo === 'pdf' || m.tipo === 'immagine') && { testo: 'Creazione flashcard per profondità', icona: 'ramo', clic: () => localizzazione(m) },
            { testo: m.usaInChat === false ? 'Includi nella chat del set' : 'Escludi dalla chat del set', icona: 'scintille', clic: () => { Dati.aggiornaMateriale(id, { usaInChat: m.usaInChat === false }); aggiorna(); } },
            collegato && { testo: 'Collega a un altro file', icona: 'collega', clic: async () => {
                try { if (await Cartelle.ricollegaFile(id)) { Ui.toast('File ricollegato', 'successo'); aggiorna(); } } catch (e) { Ui.toast(e.message, 'errore', 6000); }
            } },
            collegato && { testo: 'Scollega (tieni la copia)', icona: 'scollega', clic: () => { Cartelle.scollegaFile(id); Ui.toast('Ora è una copia: non segue più il file'); aggiorna(); } },
            libero && !collegato && { testo: 'Rinomina', icona: 'matita', clic: async () => {
                const nome = await chiediNome(m.nome);
                if (nome) { Dati.aggiornaMateriale(id, { nome }); aggiorna(); }
            } },
            libero && { testo: 'Sposta in un altro set', icona: 'cartella', clic: async () => {
                const dest = await Ui.scegliSet({ titolo: 'Sposta il materiale in…', testoOk: 'Sposta' });
                if (dest && dest !== m.setId) { Dati.aggiornaMateriale(id, { setId: dest }); Ui.toast('Materiale spostato', 'successo'); aggiorna(); }
            } },
            libero && '-',
            libero && { testo: collegato ? 'Togli dal set' : 'Elimina', icona: 'cestino', pericolo: true, clic: async () => {
                const ok = await Ui.conferma(collegato ? `Togli <b>${esc(m.nome)}</b> dai materiali del set? Il file sul computer non viene toccato.`
                    : `Elimini <b>${esc(m.nome)}</b> dai materiali del set?`, { titolo: collegato ? 'Togliere il file collegato?' : 'Eliminare il materiale?', ok: collegato ? 'Togli' : 'Elimina', pericolo: true });
                if (ok) { Dati.eliminaMateriale(id); aggiorna(); }
            } },
        ]);
    }

    // Il materiale di una mappa dell'app: rinominarlo, spostarlo o toglierlo vale per la mappa
    function menuMappa(ancora, m) {
        const x = Mappe.mappa(m.mappaId);
        if (!x) return;
        Ui.menu(ancora, [
            { testo: 'Apri la mappa', icona: 'mappa', clic: () => Router.vai('/mappa/' + x.id) },
            { testo: 'Vedi come elenco', icona: 'occhio', clic: () => apri(m.id) },
            { testo: 'Creazione flashcard per profondità', icona: 'ramo', clic: () => localizzazione(m) },
            { testo: m.usaInChat === false ? 'Includi nella chat del set' : 'Escludi dalla chat del set', icona: 'scintille', clic: () => { Dati.aggiornaMateriale(m.id, { usaInChat: m.usaInChat === false }); aggiorna(); } },
            { testo: 'Rinomina la mappa', icona: 'matita', clic: async () => {
                const nome = await chiediNome(x.nome);
                if (nome) { cambiaMappa(x.id, y => { y.nome = nome; }); aggiorna(); }
            } },
            { testo: 'Sposta in un altro set', icona: 'cartella', clic: async () => {
                const dest = await Ui.scegliSet({ titolo: 'Sposta la mappa in…', testoOk: 'Sposta' });
                if (dest && dest !== x.setId && Dati.set(dest)) { cambiaMappa(x.id, y => { y.setId = dest; y.materiaId = Dati.set(dest).materiaId; }); Ui.toast('Mappa spostata', 'successo'); aggiorna(); }
            } },
            '-',
            { testo: 'Togli dal set', icona: 'scollega', clic: () => {
                cambiaMappa(x.id, y => { y.setId = null; });
                Ui.toast('Mappa tolta dal set: la trovi sempre nella sezione Mappe');
                aggiorna();
            } },
            { testo: 'Elimina la mappa', icona: 'cestino', pericolo: true, clic: async () => {
                const ok = await Ui.conferma(`Elimini la mappa <b>${esc(x.nome)}</b> con i suoi ${plurale(Mappe.contaNodi(x), 'nodo', 'nodi')}? Sparisce anche dalla sezione Mappe.`,
                    { titolo: 'Eliminare la mappa?', ok: 'Elimina', pericolo: true });
                if (ok) { Mappe.elimina(x.id); aggiorna(); }
            } },
        ]);
    }

    // ---- Cartella collegata ---------------------------------------------------------------

    async function collegaCartella(setId) {
        try {
            if (await Cartelle.collega(setId)) aggiorna();
        } catch (e) {
            console.error(e);
            Ui.toast(e.message || 'Non riesco a collegare la cartella', 'errore', 6000);
        }
    }

    async function collegaFile(setId) {
        try {
            if (await Cartelle.collegaFile(setId)) aggiorna();
        } catch (e) {
            console.error(e);
            Ui.toast(e.message || 'Non riesco a collegare i file', 'errore', 6000);
        }
    }

    function menuCartella(ancora, setId) {
        Ui.menu(ancora, [
            { testo: 'Aggiorna adesso', icona: 'sincronizza', clic: () => Cartelle.sincronizza(setId).then(aggiorna) },
            { testo: 'Collega un\'altra cartella', icona: 'collega', clic: () => collegaCartella(setId) },
            '-',
            { testo: 'Scollega la cartella', icona: 'scollega', pericolo: true, clic: () => scollegaCartella(setId) },
        ]);
    }

    function scollegaCartella(setId) {
        const n = Dati.materialiDiSet(setId).filter(m => m.cartella).length;
        Ui.modale({
            titolo: 'Scollegare la cartella?', classe: 'modale-piccola',
            corpo: `<p class="testo-conferma">L'app smette di seguire la cartella. I file nella cartella non vengono toccati.
                ${n ? `Che cosa faccio dei ${plurale(n, 'materiale che ne viene', 'materiali che ne vengono')}?` : ''}</p>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                n ? { testo: 'Toglili dall\'app', classe: 'btn-pericolo-tenue', clic: md => { md.chiudi(); Cartelle.scollega(setId, { tieniFile: false }); aggiorna(); } } : null,
                { testo: n ? 'Tienili come copie' : 'Scollega', classe: 'btn-primario', principale: true, clic: md => { md.chiudi(); Cartelle.scollega(setId, { tieniFile: true }); aggiorna(); } },
            ].filter(Boolean),
        });
    }

    function chiediNome(attuale) {
        return new Promise(risolvi => {
            let nome = null;
            Ui.modale({
                titolo: 'Rinomina', classe: 'modale-piccola',
                corpo: `<label class="campo"><span>Nome</span><input type="text" name="nome" maxlength="160" value="${esc(attuale)}" autofocus></label>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: 'Salva', classe: 'btn-primario', principale: true, clic: md => { nome = $('[name=nome]', md.el).value.trim(); md.chiudi(); } },
                ],
                alChiudere: () => risolvi(nome),
            });
        });
    }

    return {
        TIPI, ACCETTATI, MAX_FILE, tipoDi, descrivi, alberoInTesto, alberoDaMarkdown, sembraSchema, contaNodi,
        aggiungiFile, aggiornaDaFile, differenze, differenzeInTesto, caricaMolti, creaNota, aggiornaTestoNota,
        partiPerIA, apri, apriPredefinito, monta, localizzazione, aggiornaFlashcard, alberoDaMappa, allineaMappe,
        trovaCitazione, fonteDi, fonteHtml, vaiAllaFonte, dovePagina, materialeDiMappa,
    };
})();
