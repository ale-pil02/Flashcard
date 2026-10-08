// Mappe da e verso file: SimpleMind (.smmx), OPML, testo rientrato.
//
// .smmx è uno zip con document/mindmap.xml (elenco piatto di <topic id parent x y text>, "\N" = a capo)
// e le immagini in images/. Dal file si recuperano: testi, stile di ogni nodo (forma, bordo, colori, carattere,
// dimensione minima), stili per livello e tavolozza dei rami del foglio di stile, etichette attaccate ai nodi
// (topic > children > text, testo nella <note>), icone (di serie ic8_48_* → emoji, personali → immagini del file),
// immagini dentro i nodi, link, rami chiusi, nodi liberi e relazioni tra rami con le loro etichette.

const FileMappe = (() => {
    const URL_JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

    const FORME_SMMX = {
        sbsRectangle: 'rettangolo', sbsRoundRect: 'arrotondata', sbsHalfRound: 'pillola', sbsEllipse: 'ellisse',
        sbsCircle: 'ellisse', sbsParallelogram: 'parallelogramma', sbsUnderline: 'sottolineata',
    };

    // Icone di serie di SimpleMind → emoji (per parola chiave nel nome)
    const ICONE_SMMX = [
        [/circled_(\d+)/, m => 'n:' + m[1]], [/information|info/, 'ℹ️'], [/light|idea|bulb/, '💡'], [/note|memo/, '📝'],
        [/tools|wrench|hammer/, '🛠️'], [/tree/, '🌳'], [/chart_up|chart|graph|statistic/, '📈'], [/boy/, '👦'], [/girl/, '👧'],
        [/woman/, '👩'], [/man|person|user/, '👨'], [/baby/, '👶'], [/people|group|team/, '👥'], [/book/, '📖'],
        [/check|ok|done|tick/, '✅'], [/cancel|cross|close|delete/, '❌'], [/question|help/, '❓'], [/warning|attention|caution/, '⚠️'],
        [/star/, '⭐'], [/flag/, '🚩'], [/calendar|date/, '📅'], [/clock|time/, '🕐'], [/hourglass/, '⏳'], [/gear|settings|cog/, '⚙️'],
        [/heart|love/, '❤️'], [/key/, '🔑'], [/unlock/, '🔓'], [/lock/, '🔒'], [/home|house/, '🏠'], [/phone|mobile/, '📱'],
        [/mail|envelope/, '✉️'], [/gift|present/, '🎁'], [/music/, '🎵'], [/camera|photo/, '📷'], [/target/, '🎯'],
        [/trophy|cup/, '🏆'], [/money|cash|coin/, '💰'], [/puzzle/, '🧩'], [/brain/, '🧠'], [/thumb.*down/, '👎'], [/thumb/, '👍'],
        [/smile|happy/, '😊'], [/sad/, '😟'], [/angry/, '😠'], [/fire/, '🔥'], [/water|drop/, '💧'], [/sun/, '🌞'],
        [/cloud/, '☁️'], [/globe|world|earth/, '🌍'], [/arrow.*up/, '⬆️'], [/arrow.*down/, '⬇️'], [/arrow.*left/, '⬅️'],
        [/arrow/, '➡️'], [/pencil|edit/, '✏️'], [/bell|alarm/, '🔔'], [/pin/, '📌'], [/clip|attach/, '📎'], [/folder/, '📁'],
        [/doc|file|page/, '📄'], [/computer|laptop/, '💻'], [/school|graduat/, '🧑‍🎓'], [/doctor|medic|health/, '🩺'],
        [/pill|drug/, '💊'], [/scale|law|justice/, '⚖️'], [/lightning|flash|bolt/, '⚡'],
    ];

    function iconaDiSerie(nome) {
        const x = String(nome).toLowerCase().replace(/^ic\d+_\d+_/, '');
        for (const [re, v] of ICONE_SMMX) {
            const m = x.match(re);
            if (m) return typeof v === 'function' ? v(m) : v;
        }
        return '🔹';
    }

    const hex = el => (el && el.getAttribute('none') !== 'True' && el.hasAttribute('r')
        ? '#' + ['r', 'g', 'b'].map(k => (+el.getAttribute(k) || 0).toString(16).padStart(2, '0')).join('') : null);

    // Testo RTF (alcuni nodi di SimpleMind) → testo semplice
    function daRtf(rtf) {
        let out = '', i = 0;
        const salta = [];   // profondità dei gruppi da ignorare (font, colori, \*…)
        let prof = 0;
        while (i < rtf.length) {
            const c = rtf[i];
            if (c === '{') { prof++; i++; continue; }
            if (c === '}') { if (salta.length && salta[salta.length - 1] === prof) salta.pop(); prof--; i++; continue; }
            if (c === '\\') {
                const m = rtf.slice(i).match(/^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\(.)/i);
                if (!m) { i++; continue; }
                i += m[0].length;
                if (m[1]) {
                    if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'generator'].includes(m[1])) salta.push(prof);
                    else if (!salta.length && (m[1] === 'par' || m[1] === 'line')) out += '\n';
                    else if (!salta.length && m[1] === 'tab') out += '\t';
                    else if (!salta.length && m[1] === 'u' && m[2]) { const n = +m[2]; out += String.fromCharCode(n < 0 ? n + 65536 : n); if (rtf[i] === '?') i++; }
                } else if (m[3] && !salta.length) out += new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(m[3], 16)]));
                else if (m[4] && !salta.length && m[4] !== '*') out += m[4];
                else if (m[4] === '*') salta.push(prof);
                continue;
            }
            if (!salta.length && c !== '\r' && c !== '\n') out += c;
            i++;
        }
        return out.replace(/\n{3,}/g, '\n\n').trim();
    }

    function testoTopic(el) {
        const t = el.getAttribute('text') || '';
        return (el.getAttribute('textfmt') === 'rtf1' || /^\{\\rtf/.test(t) ? daRtf(t) : t).replace(/\\N/g, '\n').trim();
    }

    // <style> di SimpleMind → stile della mappa; baseline = le linee corrono sotto il testo
    function stileDa(el, baseline) {
        const s = {};
        if (!el) return s;
        const bs = el.getAttribute('borderstyle');
        if (bs) s.forma = bs === 'sbsNone' ? (baseline ? 'sottolineata' : 'nessuna') : FORME_SMMX[bs] || 'arrotondata';
        const bw = parseFloat(el.getAttribute('borderwidth'));
        if (!isNaN(bw)) s.spessore = bw;
        const ss = el.getAttribute('strokestyle');
        if (ss && ss !== 'solid') s.tratto = /dot/.test(ss) ? 'punti' : 'trattini';
        const al = el.getAttribute('align');
        if (al) s.allinea = al === 'left' ? 'sinistra' : al === 'right' ? 'destra' : 'centro';
        const mw = parseFloat(el.getAttribute('min-width')), mh = parseFloat(el.getAttribute('min-height'));
        if (mw) s.larghezzaMin = mw;
        if (mh) s.altezzaMin = mh;
        const font = el.querySelector(':scope > font');
        if (font) {
            if (font.getAttribute('bold') === 'True') s.grassetto = true;
            if (font.getAttribute('italic') === 'True') s.corsivo = true;
            if (font.getAttribute('underline') === 'True') s.sottolineato = true;
            if (font.getAttribute('strikeout') === 'True') s.barrato = true;
            const sc = parseFloat(font.getAttribute('scale'));
            if (sc) s.scala = sc;
        }
        const riempimento = el.querySelector(':scope > fillcolor');
        if (riempimento) s.riempimento = hex(riempimento) || 'nessuno';
        const testo = hex(el.querySelector(':scope > textcolor'));
        if (testo) s.coloreTesto = testo;
        const bordo = hex(el.querySelector(':scope > strokecolor'));
        if (bordo) s.coloreBordo = bordo;
        const colore = hex(el.querySelector(':scope > color'));
        if (colore) s.colore = colore;
        return s;
    }

    // <parent-relation><style>: la linea che collega il nodo al genitore (tratto, spessore, forma, frecce, colore)
    function collegamentoDa(el) {
        const s = {};
        if (!el) return s;
        const ls = el.getAttribute('line-style') || '';
        if (/autotapered/i.test(ls)) s.linea = 'auto';
        else if (/tapered/i.test(ls)) s.linea = 'affusolata';
        else if (/dash/i.test(ls)) s.linea = 'trattini';
        else if (/dot/i.test(ls)) s.linea = 'punti';
        else if (ls) s.linea = 'pieno';
        const lw = parseFloat(el.getAttribute('line-width'));
        if (lw) s.lineaSpessore = lw;
        const ps = el.getAttribute('path-style') || '';
        if (ps) s.lineaForma = /ortho/i.test(ps) ? 'ortogonale' : /straight|line/i.test(ps) ? 'dritta' : 'curva';
        const freccia = v => (!v ? null : v === 'none' ? 'nessuna' : /fill/i.test(v) ? 'piena' : 'semplice');
        if (freccia(el.getAttribute('target-arrow'))) s.frecciaFine = freccia(el.getAttribute('target-arrow'));
        if (freccia(el.getAttribute('source-arrow'))) s.frecciaInizio = freccia(el.getAttribute('source-arrow'));
        const colore = hex(el.querySelector(':scope > color'));
        if (colore) s.coloreLinea = colore;
        return s;
    }

    async function daSmmx(buffer, { nome = '', posizioniOriginali = false } = {}) {
        await caricaScript(URL_JSZIP);
        const zip = await JSZip.loadAsync(buffer);
        const voce = zip.file('document/mindmap.xml') || zip.file(/^document\/.*\.xml$/i)[0];
        if (!voce) throw new Error('File SimpleMind non riconosciuto');
        const doc = new DOMParser().parseFromString(await voce.async('string'), 'text/xml');
        if (doc.querySelector('parsererror')) throw new Error('File SimpleMind non leggibile');
        const topics = [...doc.querySelectorAll('mindmap > topics > topic')];
        if (!topics.length) throw new Error('La mappa SimpleMind non contiene nodi');

        const titolo = (doc.querySelector('mindmap > meta > title') || { getAttribute: () => '' }).getAttribute('text') || '';
        const m = Mappe.nuova({ nome: nome || titolo.replace(/\\N/g, ' ').trim() || 'Mappa importata' });
        m.nodi = {};
        m.immagini = {};

        // Foglio di stile: sfondo, tavolozza dei rami, stili per livello, linee sotto il testo
        const foglio = doc.querySelector('mindmap > stylesheet');
        const sfondo = hex(foglio && foglio.querySelector('general > bkgnd-color'));
        const conn = doc.querySelector('mindmap > meta > style > mindmap, mindmap > stylesheet > style > mindmap');
        const baseline = !conn || conn.getAttribute('connection-style') !== 'center';
        if (sfondo && Mappe.luminanza(sfondo) < 0.3) m.tema = 'naturale-nero';
        const tavolozza = foglio ? [...foglio.querySelectorAll(':scope > palette > item')]
            .map(it => hex(it.querySelector('stroke-color')) || hex(it.querySelector('fill-color'))).filter(Boolean) : [];
        if (tavolozza.length > 1) { m.coloreRadice = tavolozza[0]; m.paletta = tavolozza.slice(1); }
        const livelli = foglio ? [...foglio.querySelectorAll(':scope > style > topics > levels > level')].map(l => stileDa(l, baseline)) : [];
        if (livelli.length) m.livelli = livelli;
        // Linee del foglio di stile: affusolate in automatico o no, forma, spessori
        const gerarchia = foglio && foglio.querySelector(':scope > style > relations > hierarchical-relations');
        if (gerarchia) {
            const ls = gerarchia.getAttribute('line-style') || '', ps = gerarchia.getAttribute('path-style') || '';
            m.linee = { affusolamento: /tapered/i.test(ls) };
            if (/ortho/i.test(ps)) m.linee.forma = 'ortogonale';
            else if (/straight|line/i.test(ps)) m.linee.forma = 'dritta';
            const larghezze = [...gerarchia.querySelectorAll('levels > level')].map(l => parseFloat(l.getAttribute('line-width'))).filter(v => v > 0);
            if (larghezze.length) {
                if (m.linee.affusolamento) m.linee.inizio = limita(Math.max(...larghezze) * 3, 3, 18);
                else m.linee.spessore = Math.max(...larghezze);
            }
        }

        // Immagini dentro il file (icone personali e immagini dei nodi), lette una volta sola
        const cacheImg = {};
        const immagine = async nome => {
            if (!nome) return null;
            if (nome in cacheImg) return cacheImg[nome];
            const pulito = String(nome).replace(/^#/, '');
            const f = zip.file('images/' + pulito) || zip.file('images/' + pulito + '.png')
                || zip.file(new RegExp('^images/' + pulito.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.'))[0];
            if (!f) return (cacheImg[nome] = null);
            const tipo = /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : /\.gif$/i.test(f.name) ? 'image/gif' : 'image/png';
            const id = uid();
            m.immagini[id] = `data:${tipo};base64,${await f.async('base64')}`;
            return (cacheImg[nome] = id);
        };
        const larghezzaDi = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i.naturalWidth); i.onerror = () => ok(120); i.src = src; });

        const ids = new Map(topics.map(t => [t.getAttribute('id'), uid()]));
        const pos = new Map(topics.map(t => [t.getAttribute('id'), { x: parseFloat(t.getAttribute('x')) || 0, y: parseFloat(t.getAttribute('y')) || 0 }]));
        const etichetta = async el => {
            const nota = el.querySelector(':scope > note');
            const testo = nota ? (nota.getAttribute('textfmt') === 'rtf1' ? daRtf(nota.textContent) : nota.textContent).replace(/\\N/g, '\n').trim() : '';
            if (!testo) return null;
            const st = stileDa(el.querySelector(':scope > style'), false);
            delete st.forma;
            return { id: uid(), testo, dx: parseFloat(el.getAttribute('x')) || 0, dy: parseFloat(el.getAttribute('y')) || 0, stile: st };
        };

        for (const t of topics) {
            const n = Mappe.nodoVuoto({ id: ids.get(t.getAttribute('id')), testo: testoTopic(t) });
            n.stile = stileDa(t.querySelector(':scope > style'), baseline);
            const riempimento = t.querySelector(':scope > fillcolor');
            if (riempimento && !('riempimento' in n.stile)) n.stile.riempimento = hex(riempimento) || 'nessuno';
            const bordo = hex(t.querySelector(':scope > strokecolor'));
            if (bordo) n.stile.coloreBordo = bordo;
            const rel = t.querySelector(':scope > parent-relation > style');
            if (rel) Object.assign(n.stile, collegamentoDa(rel));
            const pal = parseInt(t.getAttribute('palette'), 10);
            if (pal > 0 && tavolozza[pal - 1] && !n.stile.colore) n.paletta = tavolozza[pal - 1];
            if (t.getAttribute('collapsed') === 'True') n.chiuso = true;
            const link = t.querySelector(':scope > link');
            if (link && /^https?:/i.test(link.getAttribute('urllink') || '')) n.link = link.getAttribute('urllink');
            const notaTopic = t.querySelector(':scope > note');
            if (notaTopic) n.nota = notaTopic.textContent.trim();
            for (const el of t.querySelectorAll(':scope > children > text')) {
                const e = await etichetta(el);
                if (e) n.etichette.push(e);
            }
            const icona = t.getAttribute('icon');
            if (icona) {
                if (icona.startsWith('#')) { const id = await immagine(icona); n.icona = id ? 'img:' + id : '🔹'; }
                else n.icona = iconaDiSerie(icona);
            }
            const img = [...t.querySelectorAll('embedded-image')].find(e => !e.closest('text') && e.closest('topic') === t);
            if (img) {
                const id = await immagine(img.getAttribute('name'));
                if (id) n.immagine = { id, larghezza: Math.round((await larghezzaDi(m.immagini[id])) * (parseFloat(img.getAttribute('scale')) || 1)) };
            }
            m.nodi[n.id] = n;
        }

        // Albero: figli in ordine di posizione (dall'alto in basso), lato dei rami principali dalla x
        const idCentrale = (doc.querySelector('mindmap > meta > main-centraltheme') || { getAttribute: () => null }).getAttribute('id');
        const centrale = ids.has(idCentrale) ? idCentrale : topics.find(t => t.getAttribute('parent') === '-1').getAttribute('id');
        m.radice = ids.get(centrale);
        const pc = pos.get(centrale);
        const perPadre = new Map();
        topics.forEach(t => {
            const id = t.getAttribute('id'), padre = t.getAttribute('parent');
            if (id === centrale || !ids.has(padre) || padre === id) return;
            if (!perPadre.has(padre)) perPadre.set(padre, []);
            perPadre.get(padre).push(id);
        });
        perPadre.forEach((figli, padre) => {
            figli.sort((a, b) => pos.get(a).y - pos.get(b).y || pos.get(a).x - pos.get(b).x);
            m.nodi[ids.get(padre)].figli = figli.map(f => ids.get(f));
            figli.forEach(f => {
                const n = m.nodi[ids.get(f)];
                n.genitore = ids.get(padre);
                if (padre === centrale) n.lato = pos.get(f).x < pc.x ? 's' : 'd';
            });
        });
        // Nodi liberi (posizione rispetto al tema centrale) e, se richiesto, posizioni esatte di SimpleMind:
        // ogni nodo ricorda la distanza dal suo genitore
        topics.forEach(t => {
            const id = t.getAttribute('id');
            const n = m.nodi[ids.get(id)];
            if (id !== centrale && !n.genitore) { n.x = pos.get(id).x - pc.x; n.y = pos.get(id).y - pc.y; }
            else if (posizioniOriginali && id !== centrale) {
                const pp = pos.get(t.getAttribute('parent'));
                if (pp) n.off = { dx: pos.get(id).x - pp.x, dy: pos.get(id).y - pp.y };
            }
        });
        if (posizioniOriginali) m.disposizione = 'libera';

        // Colori della tavolozza: si tengono solo dove non coincidono con quello che il nodo prenderebbe da solo
        const visita = (id, livello, indice, ereditato) => {
            const n = m.nodi[id];
            const auto = Mappe.coloreRamo(m, { stile: {} }, livello, indice, ereditato);
            if (n.paletta && n.paletta !== auto && !n.stile.colore) n.stile.colore = n.paletta;
            delete n.paletta;
            const colore = Mappe.coloreRamo(m, n, livello, indice, ereditato);
            n.figli.forEach((f, i) => visita(f, livello + 1, i, colore));
        };
        visita(m.radice, 0, 0, null);
        Mappe.radiciLibere(m).forEach((l, i) => visita(l.id, 1, m.nodi[m.radice].figli.length + i, null));

        // Relazioni tra rami
        const xl = doc.querySelector('mindmap > stylesheet > style > relations > cross-links');
        const frecciaFine = !xl || xl.getAttribute('target-arrow') !== 'none';
        for (const r of doc.querySelectorAll('mindmap > relations > relation')) {
            const da = ids.get(r.getAttribute('source')), a = ids.get(r.getAttribute('target'));
            if (!da || !a || da === a) continue;
            const st = r.querySelector(':scope > style');
            const testi = [];
            for (const el of r.querySelectorAll(':scope > children > text')) { const e = await etichetta(el); if (e) testi.push(e.testo); }
            const sa = st && st.getAttribute('source-arrow'), ta = st && st.getAttribute('target-arrow');
            m.relazioni.push({
                id: uid(), da, a, testo: testi.join(' '), colore: hex(st && st.querySelector('color')) || null,
                tratto: r.getAttribute('asHierarchy') === 'True' ? 'pieno' : 'punti',
                frecciaInizio: !!sa && sa !== 'none', frecciaFine: ta ? ta !== 'none' : frecciaFine, curva: null,
            });
        }
        return m;
    }

    // ---- OPML e testo --------------------------------------------------------------------------

    function mappaDaVoci(nome, voci) {
        const unica = voci.length === 1;
        const m = Mappe.nuova({ nome: unica ? Mappe.testoSemplice(voci[0].testo) || nome : nome });
        const r = m.nodi[m.radice];
        if (unica) { r.testo = voci[0].testo; r.nota = voci[0].nota || ''; }
        Mappe.aggiungiAlbero(m, unica ? voci[0].figli : voci, r.id);
        return m;
    }

    function daOpml(testo, nome = 'Mappa importata') {
        const doc = new DOMParser().parseFromString(testo, 'text/xml');
        if (doc.querySelector('parsererror')) throw new Error('File OPML non leggibile');
        const voce = o => ({
            testo: (o.getAttribute('text') || o.getAttribute('title') || '').trim(),
            nota: (o.getAttribute('_note') || '').trim(),
            figli: [...o.children].filter(c => c.tagName === 'outline').map(voce),
        });
        const voci = [...doc.querySelectorAll('body > outline')].map(voce);
        if (!voci.length) throw new Error('Il file OPML non contiene voci');
        const titolo = (doc.querySelector('head > title') || {}).textContent;
        return mappaDaVoci((titolo || nome).trim(), voci);
    }

    function daTesto(testo, nome = 'Mappa importata') {
        const voci = Mappe.alberoDaTesto(testo);
        if (!voci.length) throw new Error('Nessuna riga da trasformare in nodi');
        return mappaDaVoci(nome, voci);
    }

    async function daFile(file, opzioni = {}) {
        const nome = file.name.replace(/\.[^.]+$/, '');
        const est = (file.name.match(/\.([^.]+)$/) || [])[1] || '';
        if (/^smmx$/i.test(est)) return daSmmx(await leggiFile(file, 'buffer'), { ...opzioni, nome: opzioni.nome || '' });
        const testo = (await leggiFile(file)).replace(/^﻿/, '');
        if (/^(opml|xml)$/i.test(est) || /^\s*<\?xml|<opml/i.test(testo)) return daOpml(testo, nome);
        return daTesto(testo, nome);
    }

    // ---- Esportazione --------------------------------------------------------------------------

    function inOpml(m, id = m.radice) {
        const attr = v => esc(String(v || '').replace(/\n/g, ' '));
        const outline = (x, rientro) => {
            const n = m.nodi[x];
            const nota = n.nota ? ` _note="${attr(n.nota)}"` : '';
            const figli = n.figli.map(f => outline(f, rientro + '  ')).join('\n');
            return figli
                ? `${rientro}<outline text="${attr(Mappe.testoSemplice(n.testo))}"${nota}>\n${figli}\n${rientro}</outline>`
                : `${rientro}<outline text="${attr(Mappe.testoSemplice(n.testo))}"${nota}/>`;
        };
        const liberi = id === m.radice ? Mappe.radiciLibere(m).map(l => outline(l.id, '    ')) : [];
        return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${esc(m.nome)}</title></head>\n  <body>\n`
            + [outline(id, '    '), ...liberi].join('\n') + '\n  </body>\n</opml>\n';
    }

    return { daFile, daSmmx, daOpml, daTesto, mappaDaVoci, inOpml, daRtf };
})();
