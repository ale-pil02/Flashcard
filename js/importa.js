// Import ed export delle flashcard, backup completo in JSON.
//
// Formato di testo dell'app (export principale, si legge e si reimporta):
//   # Nome del set              ## Sotto-set  ### Sotto-sotto-set …
//   D: domanda                  R: risposta (le righe sotto, senza chiave, continuano il campo)
//   [x] risposta giusta         [ ] risposta sbagliata   (carte a scelta multipla)
//   Tag: a, b   Suggerimento: …   Spiegazione: …
//   Fonte: … / Mappa: … / Stato: …   (solo da leggere: all'import si ignorano)
//   una tabulazione in più prima di "D:" = domanda figlia della precedente (studio a cascata)
//   righe che iniziano con ">" = note, ignorate
// **grassetto**, *corsivo*, __sottolineato__, ~~barrato~~ ed elenchi passano; le immagini diventano [immagine].
// Excel: una riga per carta con Set, Livello, Domanda, Risposta, Tag, Suggerimento, Spiegazione, Fonte, Stato,
// Prossimo ripasso; si reimporta anche lui. CSV/TSV o testo incollato: domanda, risposta, tag, suggerimento,
// spiegazione (con o senza intestazione).
// All'import le carte con la stessa domanda di una che c'è già nel set si aggiornano e tengono i progressi.

const Importa = (() => {
    const URL_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    const SEP = ' › ';

    const cella = v => String(v ?? '').trim();
    const dividiTag = v => cella(v).split(/[,;]/).map(t => t.trim()).filter(Boolean);
    const normale = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const chiaveDomanda = html => normale(testoDaHtml(html));

    // ---- HTML delle carte ⇄ testo ----------------------------------------------------

    // HTML → testo con **grassetto**, *corsivo*, elenchi e a capo
    function htmlInTesto(html) {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        const giro = (nodo, rientro = '') => [...nodo.childNodes].map(x => {
            if (x.nodeType === 3) return x.textContent.replace(/\s+/g, ' ');
            if (x.nodeType !== 1) return '';
            const tag = x.tagName.toLowerCase();
            const dentro = () => giro(x, rientro);
            if (tag === 'br') return '\n';
            if (tag === 'img') return '[immagine]';
            if (tag === 'b' || tag === 'strong') return `**${dentro().trim()}**`;
            if (tag === 'i' || tag === 'em') return `*${dentro().trim()}*`;
            if (tag === 'u') return `__${dentro().trim()}__`;
            if (tag === 's' || tag === 'strike' || tag === 'del') return `~~${dentro().trim()}~~`;
            if (tag === 'ul' || tag === 'ol') {
                return '\n' + [...x.children].filter(li => li.tagName.toLowerCase() === 'li')
                    .map((li, i) => `${rientro}${tag === 'ol' ? `${i + 1}.` : '-'} ${giro(li, rientro + '  ').trim()}`).join('\n') + '\n';
            }
            if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'tr'].includes(tag)) return '\n' + dentro() + '\n';
            return dentro();
        }).join('');
        return giro(doc.body.firstChild).split('\n').map(r => r.replace(/[ \t]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    // Testo → HTML sicuro della carta
    function testoInHtmlCarta(t) {
        return esc(String(t || '').trim()).replace(/\r?\n/g, '<br>')
            .replace(/\*\*(?=\S)(.+?)\*\*/g, '<b>$1</b>')
            .replace(/__(?=\S)(.+?)__/g, '<u>$1</u>')
            .replace(/~~(?=\S)(.+?)~~/g, '<s>$1</s>')
            .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<i>$2</i>');
    }

    const haImmagini = html => /<img/i.test(html || '');

    // ---- Lettura ---------------------------------------------------------------
    // Ogni lettura dà { sezioni: [{ percorso: [nomi dei sotto-set], carte: [{ prof, domanda, risposte, tag, suggerimento,
    // spiegazione }] }], titolo, formato, saltate }; percorso [] = il set di destinazione

    const CHIAVI = [['d', 'domanda'], ['r', 'risposta'], ['tag', 'tag'], ['tags', 'tag'], ['suggerimento', 'suggerimento'],
        ['spiegazione', 'spiegazione'], ['fonte', null], ['mappa', null], ['stato', null]];

    function chiaveDi(t) {
        const m = t.match(/^([A-Za-zÀ-ÿ]+)\s*:\s?(.*)$/);
        if (!m) return null;
        const k = CHIAVI.find(c => c[0] === m[1].toLowerCase());
        return k ? { campo: k[1], resto: m[2] } : null;
    }

    function eFormatoApp(testo) { return /^[\t ]*D:\s*\S/m.test(testo); }

    function leggiTestoApp(testo) {
        const sezioni = [{ percorso: [], carte: [] }];
        const titoli = [];
        let sezione = sezioni[0], carta = null, campo = null, vuote = 0, titolo = '', saltate = 0;
        const aggiungiA = riga => {
            if (!campo) return;
            const pezzo = (vuote ? '\n\n' : '\n') + riga;
            if (campo.tipo === 'risposta') carta.risposte[campo.indice].testo += pezzo;
            else carta[campo.tipo] += pezzo;
            vuote = 0;
        };
        String(testo || '').replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').forEach(grezza => {
            const riga = grezza.replace(/\s+$/, '');
            if (!riga.trim()) { vuote++; return; }
            const h = riga.match(/^(#{1,6})\s+(.+)$/);
            if (h) {
                const livello = h[1].length;
                if (livello === 1) { titolo = titolo || h[2].trim(); sezione = sezioni[0]; titoli.length = 0; }
                else {
                    titoli.length = Math.min(titoli.length, livello - 2);
                    titoli[livello - 2] = h[2].trim();
                    sezione = { percorso: titoli.filter(Boolean).slice(), carte: [] };
                    sezioni.push(sezione);
                }
                carta = null; campo = null; vuote = 0;
                return;
            }
            if (/^\s*>/.test(riga)) return;
            const rientro = riga.match(/^[\t ]*/)[0];
            const t = riga.slice(rientro.length);
            const opzione = t.match(/^\[( |x|X)\]\s?(.*)$/);
            const k = !opzione && chiaveDi(t);
            if (k && k.campo === 'domanda') {
                carta = { prof: (rientro.match(/\t/g) || []).length + Math.floor(rientro.replace(/\t/g, '').length / 4), domanda: k.resto, risposte: [], tag: '', suggerimento: '', spiegazione: '' };
                sezione.carte.push(carta);
                campo = { tipo: 'domanda' };
            } else if (!carta) {
                return;   // testo fuori da una carta
            } else if (opzione) {
                carta.risposte.push({ testo: opzione[2], corretta: opzione[1] !== ' ', opzione: true });
                campo = { tipo: 'risposta', indice: carta.risposte.length - 1 };
            } else if (k && k.campo === 'risposta') {
                carta.risposte.push({ testo: k.resto, corretta: true });
                campo = { tipo: 'risposta', indice: carta.risposte.length - 1 };
            } else if (k && k.campo) {
                carta[k.campo] = k.resto;
                campo = { tipo: k.campo };
            } else if (k) {
                campo = null;   // Fonte, Mappa, Stato: solo da leggere
            } else {
                aggiungiA(t);
                return;
            }
            vuote = 0;
        });
        sezioni.forEach(s => {
            s.carte = s.carte.filter(c => {
                c.risposte = c.risposte.filter(r => r.testo.trim());
                if (!c.domanda.trim() || !c.risposte.length) { saltate++; return false; }
                return true;
            }).map(c => perArchivio(c));
        });
        return { sezioni: sezioni.filter(s => s.carte.length || s.percorso.length), titolo, formato: 'testo dell\'app', saltate };
    }

    // Carta letta → dati per Dati (HTML); le risposte multiple con [x] / [ ]
    function perArchivio(c) {
        const multipla = c.risposte.length > 1;
        const risposte = c.risposte.map(r => ({ testo: testoInHtmlCarta(r.testo), corretta: multipla ? !!r.corretta : true }));
        if (multipla && !risposte.some(r => r.corretta)) risposte[0].corretta = true;
        return {
            prof: c.prof || 0, domanda: testoInHtmlCarta(c.domanda), risposte,
            tag: Array.isArray(c.tag) ? c.tag : dividiTag(c.tag), suggerimento: cella(c.suggerimento),
            spiegazione: cella(c.spiegazione) ? testoInHtmlCarta(c.spiegazione) : '',
        };
    }

    // Una cella "Risposta" con righe [x] / [ ] è una carta a scelta multipla
    function risposteDaCella(v) {
        const t = cella(v);
        const righe = t.split(/\r?\n/);
        if (righe.length > 1 && righe.every(r => !r.trim() || /^\[( |x|X)\]/.test(r.trim()))) {
            return righe.filter(r => r.trim()).map(r => { const m = r.trim().match(/^\[( |x|X)\]\s?(.*)$/); return { testo: m[2], corretta: m[1] !== ' ' }; });
        }
        return t ? [{ testo: t, corretta: true }] : [];
    }

    // Tabella (Excel, CSV, testo incollato). Con l'intestazione dell'export dell'app ritrova set, livello e campi;
    // senza: domanda, risposta, tag, suggerimento, spiegazione
    function tabellaInSezioni(righe) {
        righe = righe.filter(r => r && r.some(c => cella(c)));
        if (!righe.length) return { sezioni: [], formato: '', saltate: 0 };
        const prima = righe[0].map(c => normale(c));
        const trova = (...nomi) => prima.findIndex(x => nomi.includes(x));
        const conIntestazione = trova('domanda', 'fronte') >= 0;
        const col = conIntestazione
            ? { domanda: trova('domanda', 'fronte'), risposta: trova('risposta', 'retro'), tag: trova('tag', 'tags'), suggerimento: trova('suggerimento'), spiegazione: trova('spiegazione'), livello: trova('livello'), set: trova('set') }
            : { domanda: 0, risposta: 1, tag: 2, suggerimento: 3, spiegazione: 4, livello: -1, set: -1 };
        const sezioni = new Map();
        let saltate = 0, titolo = '';
        (conIntestazione ? righe.slice(1) : righe).forEach(r => {
            const v = i => (i >= 0 ? r[i] : '');
            const risposte = risposteDaCella(v(col.risposta));
            if (!cella(v(col.domanda)) || !risposte.length) { saltate++; return; }
            const strada = cella(v(col.set)) ? cella(v(col.set)).split(/\s*›\s*/) : [];
            if (strada.length && !titolo) titolo = strada[0];
            const percorso = strada.slice(1);
            const chiave = percorso.join(SEP);
            if (!sezioni.has(chiave)) sezioni.set(chiave, { percorso, carte: [] });
            sezioni.get(chiave).carte.push(perArchivio({
                prof: Math.max(0, parseInt(cella(v(col.livello)), 10) || 0), domanda: cella(v(col.domanda)), risposte,
                tag: v(col.tag), suggerimento: v(col.suggerimento), spiegazione: v(col.spiegazione),
            }));
        });
        return { sezioni: [...sezioni.values()], titolo, formato: conIntestazione && col.livello >= 0 ? 'Excel dell\'app' : 'tabella', saltate };
    }

    // CSV con virgolette, a capo dentro le celle e separatore a scelta
    function analizzaCsv(testo, separatore) {
        testo = testo.replace(/^\uFEFF/, '');
        const righe = [];
        let riga = [], campo = '', tra = false;
        for (let i = 0; i < testo.length; i++) {
            const c = testo[i];
            if (tra) {
                if (c === '"') {
                    if (testo[i + 1] === '"') { campo += '"'; i++; } else tra = false;
                } else campo += c;
            } else if (c === '"' && campo === '') tra = true;
            else if (c === separatore) { riga.push(campo); campo = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && testo[i + 1] === '\n') i++;
                riga.push(campo); righe.push(riga); riga = []; campo = '';
            } else campo += c;
        }
        if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
        return righe;
    }

    function indovinaSeparatore(testo) {
        const primaRiga = testo.split(/\r?\n/).find(r => r.trim()) || '';
        const conteggi = ['\t', ';', ','].map(s => [s, primaRiga.split(s).length - 1]);
        conteggi.sort((a, b) => b[1] - a[1]);
        return conteggi[0][1] > 0 ? conteggi[0][0] : '\t';
    }

    async function leggiXlsx(file) {
        await caricaScript(URL_XLSX);
        const wb = XLSX.read(await leggiFile(file, 'buffer'), { type: 'array' });
        const foglio = wb.Sheets[wb.SheetNames[0]];
        return XLSX.utils.sheet_to_json(foglio, { header: 1, raw: false, defval: '' });
    }

    function leggiTesto(testo, separatore = null) {
        if (eFormatoApp(testo)) return leggiTestoApp(testo);
        return tabellaInSezioni(analizzaCsv(testo, separatore || indovinaSeparatore(testo)));
    }

    async function leggiFileCarte(file) {
        if (/\.(xlsx|xls|ods)$/i.test(file.name)) return tabellaInSezioni(await leggiXlsx(file));
        return leggiTesto(await leggiFile(file));
    }

    const contaCarte = letti => letti.sezioni.reduce((n, s) => n + s.carte.length, 0);

    // ---- Scrittura nell'archivio --------------------------------------------------------

    // Carte lette → set di destinazione (i sotto-set si ritrovano per nome o si creano). Con "aggiorna" una carta con la
    // stessa domanda di una già presente nello stesso set la aggiorna (progressi, fonte e mappa restano)
    function applica(letti, destId, { aggiorna = true } = {}) {
        const esito = { nuove: 0, aggiornate: 0, sottoSet: 0, immaginiTenute: 0 };
        const dest = Dati.set(destId);
        letti.sezioni.forEach(sez => {
            if (!sez.carte.length) return;
            let setId = destId;
            sez.percorso.forEach(nome => {
                const c = Dati.sottoSet(setId).find(x => normale(x.nome) === normale(nome));
                if (c) setId = c.id;
                else { setId = Dati.creaSet({ materiaId: dest.materiaId, genitoreId: setId, nome }).id; esito.sottoSet++; }
            });
            const esistenti = new Map(aggiorna ? Dati.carteDiSet(setId, { tutte: true }).map(c => [chiaveDomanda(c.domanda), c]) : []);
            const pila = [];   // { prof, id } delle domande aperte, per la cascata
            sez.carte.forEach(x => {
                while (pila.length && pila[pila.length - 1].prof >= x.prof) pila.pop();
                const madre = pila.length ? pila[pila.length - 1].id : null;
                const { prof, ...dati } = x;
                const c = esistenti.get(chiaveDomanda(dati.domanda));
                let id;
                if (c) {
                    // Le immagini non passano nel testo: i campi che ne hanno restano come sono
                    if (haImmagini(c.domanda)) { delete dati.domanda; esito.immaginiTenute++; }
                    if (c.risposte.some(r => haImmagini(r.testo))) { delete dati.risposte; esito.immaginiTenute++; }
                    if (haImmagini(c.spiegazione)) { delete dati.spiegazione; esito.immaginiTenute++; }
                    Dati.aggiornaCarta(c.id, dati);
                    if ((c.genitoreId || null) !== madre) Dati.impostaMadre(c.id, madre);
                    id = c.id;
                    esito.aggiornate++;
                } else {
                    const nuova = Dati.creaCarta(setId, dati, { genitoreId: madre });
                    esistenti.set(chiaveDomanda(nuova.domanda), nuova);
                    id = nuova.id;
                    esito.nuove++;
                }
                pila.push({ prof, id });
            });
        });
        return esito;
    }

    // ---- Finestra di import ------------------------------------------------------------

    function apriDialogo({ setId = null } = {}) {
        const setFisso = setId ? Dati.set(setId) : null;
        const nessunSet = !Dati.tuttiSet().length;
        let letti = { sezioni: [], formato: '', saltate: 0 };
        let nomeSuggerito = '';

        const destinazione = setFisso
            ? `<p class="nota">Le carte vanno nel set <b>${esc(setFisso.nome)}</b> (i sotto-set del file nei suoi sotto-set).</p>`
            : `
                <label class="campo"><span>Aggiungi a</span>
                    <select name="dest">${nessunSet ? '' : Ui.opzioniSet((Dati.setRecenti(1)[0] || {}).id)}<option value="__nuovo" ${nessunSet ? 'selected' : ''}>＋ Nuovo set…</option></select></label>
                <div class="riga-campi" data-nuovo-set ${nessunSet ? '' : 'hidden'}>
                    <label class="campo"><span>Nome del nuovo set</span><input type="text" name="nomeSet" maxlength="120" placeholder="es. Capitolo 3"></label>
                    <label class="campo"><span>Materia</span><select name="materia">${Ui.opzioniMaterie((Dati.materie()[0] || {}).id)}</select></label>
                </div>
                <label class="campo" data-nuova-materia ${Dati.materie().length ? 'hidden' : ''}><span>Nome della nuova materia</span>
                    <input type="text" name="nuovaMateria" maxlength="80" value="${Dati.materie().length ? '' : 'Generale'}"></label>`;

        Ui.modale({
            titolo: 'Importa flashcard', classe: 'modale-larga',
            corpo: `
                <div class="segmentato" role="tablist">
                    <button type="button" class="attivo" data-pannello-scelta="file">${Ui.ico('documento')}File</button>
                    <button type="button" data-pannello-scelta="testo">${Ui.ico('copia')}Incolla testo</button>
                </div>
                <div data-pannello="file">
                    <button type="button" class="zona-file" data-scegli-file>
                        ${Ui.ico('carica')}
                        <b>Trascina qui il file o scegli dal computer</b>
                        <small>Il file di testo o l'Excel esportati dall'app (anche modificati), oppure CSV / Excel con domanda, risposta e tag</small>
                    </button>
                </div>
                <div data-pannello="testo" hidden>
                    <label class="campo"><span>Il testo esportato dall'app, oppure una carta per riga: domanda, separatore, risposta (e i tag)</span>
                        <textarea name="testo" rows="8" placeholder="D: Capitale della Francia?&#10;R: Parigi&#10;Tag: geografia&#10;&#9;D: Fiume che la attraversa?&#10;&#9;R: La Senna"></textarea></label>
                    <label class="campo campo-inline" data-separatore><span>Separatore (per le righe a colonne)</span>
                        <select name="separatore">
                            <option value="auto">Automatico</option>
                            <option value="tab">Tabulazione (copiato da Excel)</option>
                            <option value=";">Punto e virgola</option>
                            <option value=",">Virgola</option>
                        </select></label>
                </div>
                <div class="anteprima-import" data-anteprima></div>
                <div class="destinazione-import">${destinazione}</div>
                <label class="spunta-riga">
                    <input type="checkbox" name="aggiorna" checked>
                    <span><b>Aggiorna le carte che ci sono già</b>
                        <small>Una carta con la stessa domanda di una già presente nel set viene aggiornata e tiene i suoi progressi; altrimenti si aggiunge come nuova</small></span>
                </label>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Importa', classe: 'btn-primario', principale: true, clic: m => conferma(m) },
            ],
            alApri: (el) => {
                const pulsanteImporta = $('.modale-piede .btn-primario', el);
                pulsanteImporta.disabled = true;

                const mostraAnteprima = () => {
                    const box = $('[data-anteprima]', el);
                    const n = contaCarte(letti);
                    pulsanteImporta.disabled = !n;
                    pulsanteImporta.textContent = n ? `Importa ${plurale(n, 'carta', 'carte')}` : 'Importa';
                    if (!n && !letti.formato) { box.innerHTML = ''; return; }
                    if (!n) { box.innerHTML = `<p class="nota errore-testo">${Ui.ico('avviso')} Nessuna carta valida trovata: servono almeno domanda e risposta.</p>`; return; }
                    const tutte = letti.sezioni.flatMap(s => s.carte);
                    const multiple = tutte.filter(c => c.risposte.length > 1).length;
                    const figlie = tutte.filter(c => c.prof > 0).length;
                    const sotto = letti.sezioni.filter(s => s.percorso.length).map(s => s.percorso.join(SEP));
                    box.innerHTML = `
                        <p class="nota">${Ui.ico('ok-cerchio')} <b>${plurale(n, 'carta trovata', 'carte trovate')}</b> · ${esc(letti.formato)}
                            ${figlie ? ` · ${plurale(figlie, 'domanda figlia', 'domande figlie')} (a cascata)` : ''}${multiple ? ` · ${multiple} a scelta multipla` : ''}
                            ${sotto.length ? ` · sotto-set: ${esc(sotto.join(', '))}` : ''}${letti.saltate ? ` · ${plurale(letti.saltate, 'carta saltata', 'carte saltate')} perché incomplete` : ''}</p>
                        <div class="tabella-scorrevole"><table class="tabella">
                            <thead><tr><th>Domanda</th><th>Risposta</th><th>Tag</th></tr></thead>
                            <tbody>${tutte.slice(0, 5).map(c => `<tr>
                                <td>${'↳ '.repeat(c.prof)}${esc(testoDaHtml(c.domanda))}</td>
                                <td>${esc(c.risposte.map(r => (c.risposte.length > 1 ? (r.corretta ? '✓ ' : '✗ ') : '') + testoDaHtml(r.testo)).join(' / '))}</td>
                                <td>${esc(c.tag.join(', '))}</td></tr>`).join('')}</tbody>
                        </table></div>
                        ${n > 5 ? `<p class="nota">…e altre ${n - 5}</p>` : ''}`;
                    const nomeSet = $('[name=nomeSet]', el);
                    if (nomeSet && !nomeSet.value && (letti.titolo || nomeSuggerito)) nomeSet.value = letti.titolo || nomeSuggerito;
                };

                const caricaFile = async file => {
                    if (!file) return;
                    const zona = $('[data-scegli-file]', el);
                    zona.classList.add('in-corso');
                    try {
                        letti = await leggiFileCarte(file);
                        nomeSuggerito = file.name.replace(/\.[^.]+$/, '');
                        $('b', zona).textContent = file.name;
                    } catch (e) {
                        console.error(e);
                        letti = { sezioni: [], formato: 'errore', saltate: 0 };
                        Ui.toast('Non riesco a leggere il file: ' + e.message, 'errore', 5000);
                    }
                    zona.classList.remove('in-corso');
                    mostraAnteprima();
                };

                const leggiIncollato = () => {
                    const testo = $('[name=testo]', el).value;
                    const scelta = $('[name=separatore]', el).value;
                    const separatore = scelta === 'auto' ? null : scelta === 'tab' ? '\t' : scelta;
                    $('[data-separatore]', el).hidden = eFormatoApp(testo);
                    letti = testo.trim() ? leggiTesto(testo, separatore) : { sezioni: [], formato: '', saltate: 0 };
                    mostraAnteprima();
                };

                el.addEventListener('click', async e => {
                    const scheda = e.target.closest('[data-pannello-scelta]');
                    if (scheda) {
                        $$('[data-pannello-scelta]', el).forEach(b => b.classList.toggle('attivo', b === scheda));
                        $$('[data-pannello]', el).forEach(p => { p.hidden = p.dataset.pannello !== scheda.dataset.pannelloScelta; });
                        letti = { sezioni: [], formato: '', saltate: 0 };
                        if (scheda.dataset.pannelloScelta === 'testo') leggiIncollato(); else mostraAnteprima();
                    }
                    if (e.target.closest('[data-scegli-file]')) caricaFile(await scegliFile('.md,.txt,.markdown,.xlsx,.xls,.ods,.csv,.tsv'));
                });
                const zona = $('[data-scegli-file]', el);
                zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('sopra'); });
                zona.addEventListener('dragleave', () => zona.classList.remove('sopra'));
                zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('sopra'); caricaFile(e.dataTransfer.files[0]); });
                $('[name=testo]', el).addEventListener('input', debounce(leggiIncollato, 250));
                $('[name=separatore]', el).addEventListener('change', leggiIncollato);

                const dest = $('[name=dest]', el);
                if (dest) dest.addEventListener('change', () => {
                    $('[data-nuovo-set]', el).hidden = dest.value !== '__nuovo';
                    aggiornaNuovaMateria();
                });
                const materia = $('[name=materia]', el);
                const aggiornaNuovaMateria = () => {
                    const box = $('[data-nuova-materia]', el);
                    if (box) box.hidden = !(dest && dest.value === '__nuovo' && (!Dati.materie().length || materia.value === '__nuova'));
                };
                if (materia) materia.addEventListener('change', aggiornaNuovaMateria);
            },
        });

        async function conferma(m) {
            if (!contaCarte(letti)) return;
            let idSet = setId;
            if (!idSet) {
                const dest = $('[name=dest]', m.el).value;
                if (dest === '__nuovo') {
                    const nome = $('[name=nomeSet]', m.el);
                    if (!nome.value.trim()) { Ui.segnalaErrore(nome, 'Dai un nome al nuovo set'); return; }
                    let materiaId = $('[name=materia]', m.el).value;
                    if (!Dati.materie().length || materiaId === '__nuova') {
                        const nm = $('[name=nuovaMateria]', m.el);
                        if (!nm.value.trim()) { Ui.segnalaErrore(nm, 'Dai un nome alla materia'); return; }
                        materiaId = Dati.creaMateria({ nome: nm.value.trim() }).id;
                    }
                    idSet = Dati.creaSet({ materiaId, nome: nome.value }).id;
                } else idSet = dest;
            }
            const aggiorna = $('[name=aggiorna]', m.el).checked;
            m.chiudi();
            let esito;
            const n = contaCarte(letti);
            await Storia.esegui(`Importate ${plurale(n, 'carta', 'carte')}`, () => { esito = applica(letti, idSet, { aggiorna }); });
            if (esito.aggiornate || esito.sottoSet || esito.immaginiTenute) {
                Ui.toast([esito.nuove && `${plurale(esito.nuove, 'carta nuova', 'carte nuove')}`, esito.aggiornate && `${plurale(esito.aggiornate, 'aggiornata', 'aggiornate')} (progressi tenuti)`,
                    esito.sottoSet && `${plurale(esito.sottoSet, 'sotto-set creato', 'sotto-set creati')}`,
                    esito.immaginiTenute && `${plurale(esito.immaginiTenute, 'campo con immagini lasciato', 'campi con immagini lasciati')} com'era`].filter(Boolean).join(' · '), 'info', 7000);
            }
            Router.vai('/set/' + idSet);
        }
    }

    // ---- Export ---------------------------------------------------------------------

    // Set da esportare: il set e, se richiesto, i suoi sotto-set (in ordine d'albero) con il percorso relativo
    function setDaEsportare(setId, conSottoSet) {
        const out = [{ s: Dati.set(setId), percorso: [] }];
        if (!conSottoSet) return out;
        const giro = (id, percorso) => Dati.sottoSet(id).forEach(x => { out.push({ s: x, percorso: [...percorso, x.nome] }); giro(x.id, [...percorso, x.nome]); });
        giro(setId, []);
        return out;
    }

    function statoTesto(c) { return Srs.descrivi(c); }

    function fonteTesto(c) {
        const f = Materiali.fonteDi(c);
        return f ? `${f.m.nome}${f.pagina ? ', ' + Materiali.dovePagina(f.m, f.pagina) : ''}${f.citazione ? ` — «${f.citazione}»` : ''}` : '';
    }

    function mappaTesto(c) { return c.mappa && VistaMappa.risolvi(c) ? VistaMappa.descrivi(c) : ''; }

    function testoDiSet(setId, { conSottoSet = true, conStato = false } = {}) {
        const radice = Dati.set(setId);
        const blocchi = [];
        let n = 0;
        const campo = (rientro, chiave, testo) => {
            const righe = String(testo).split('\n');
            const spazi = ' '.repeat(chiave.length + 1);
            return rientro + chiave + ' ' + righe[0] + righe.slice(1).map(r => '\n' + (r ? rientro + spazi + r : '')).join('');
        };
        setDaEsportare(setId, conSottoSet).forEach(({ s, percorso }) => {
            const albero = Dati.alberoDiSet(s.id, { tutte: true });
            const righe = [percorso.length ? `${'#'.repeat(percorso.length + 1)} ${s.nome}` : `# ${s.nome}`];
            albero.forEach(({ carta: c, livello }) => {
                const r = '\t'.repeat(livello);
                const parti = [campo(r, 'D:', htmlInTesto(c.domanda))];
                if (c.risposte.length > 1) c.risposte.forEach(x => parti.push(campo(r, x.corretta ? '[x]' : '[ ]', htmlInTesto(x.testo))));
                else if (c.risposte.length) parti.push(campo(r, 'R:', htmlInTesto(c.risposte[0].testo)));
                if (c.tag.length) parti.push(`${r}Tag: ${c.tag.join(', ')}`);
                if (c.suggerimento) parti.push(campo(r, 'Suggerimento:', c.suggerimento));
                if (c.spiegazione) parti.push(campo(r, 'Spiegazione:', htmlInTesto(c.spiegazione)));
                if (fonteTesto(c)) parti.push(`${r}Fonte: ${fonteTesto(c)}`);
                if (mappaTesto(c)) parti.push(`${r}Mappa: ${mappaTesto(c)}`);
                if (conStato) parti.push(`${r}Stato: ${statoTesto(c)}`);
                righe.push(parti.join('\n'));
                n++;
            });
            blocchi.push(righe.join('\n\n'));
        });
        const testa = `> Flashcard esportate il ${formattaData(Date.now())} da «${radice.nome}»: ${plurale(n, 'carta', 'carte')}.\n`
            + '> D: domanda · R: risposta · [x] / [ ] risposte a scelta · una tabulazione in più = domanda figlia (cascata) · ## = sotto-set.\n'
            + "> Si può modificare e reimportare: le carte con la stessa domanda si aggiornano e tengono i progressi; Fonte, Mappa e Stato sono solo da leggere.";
        return { testo: testa + '\n\n' + blocchi.join('\n\n'), carte: n };
    }

    async function esportaXlsx(setId, { conSottoSet = true } = {}) {
        await caricaScript(URL_XLSX);
        const radice = Dati.set(setId);
        const righe = [['Set', 'Livello', 'Domanda', 'Risposta', 'Tag', 'Suggerimento', 'Spiegazione', 'Fonte', 'Mappa', 'Stato', 'Prossimo ripasso']];
        setDaEsportare(setId, conSottoSet).forEach(({ s, percorso }) => {
            Dati.alberoDiSet(s.id, { tutte: true }).forEach(({ carta: c, livello }) => {
                righe.push([
                    [radice.nome, ...percorso].join(SEP), livello, htmlInTesto(c.domanda),
                    c.risposte.length > 1 ? c.risposte.map(x => `${x.corretta ? '[x]' : '[ ]'} ${htmlInTesto(x.testo)}`).join('\n') : htmlInTesto((c.risposte[0] || {}).testo),
                    c.tag.join(', '), c.suggerimento || '', htmlInTesto(c.spiegazione), fonteTesto(c), mappaTesto(c), statoTesto(c),
                    Srs.prossima(c) ? chiaveGiorno(Srs.prossima(c)) : '',
                ]);
            });
        });
        const foglio = XLSX.utils.aoa_to_sheet(righe);
        foglio['!cols'] = [{ wch: 28 }, { wch: 7 }, { wch: 60 }, { wch: 60 }, { wch: 18 }, { wch: 24 }, { wch: 40 }, { wch: 30 }, { wch: 30 }, { wch: 24 }, { wch: 14 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, foglio, 'Flashcard');
        XLSX.writeFile(wb, nomeFileSicuro(radice.nome) + '.xlsx');
        return righe.length - 1;
    }

    function conImmagini(setId, conSottoSet) {
        return setDaEsportare(setId, conSottoSet).some(({ s }) => Dati.carteDiSet(s.id, { tutte: true })
            .some(c => haImmagini(c.domanda + c.spiegazione + c.risposte.map(r => r.testo).join(''))));
    }

    // Finestra di export: testo (consigliato, si reimporta) o Excel; scarica o copia
    function apriEsporta(setId) {
        const s = Dati.set(setId);
        if (!s) return;
        const sotto = Dati.sottoSet(setId).length;
        Ui.modale({
            titolo: 'Esporta le flashcard', classe: 'modale-piccola',
            corpo: `
                <div class="segmentato" data-formato>
                    <button type="button" class="attivo" data-valore="testo">${Ui.ico('documento')}Testo</button>
                    <button type="button" data-valore="excel">${Ui.ico('database')}Excel</button>
                </div>
                <p class="nota" data-spiega-formato></p>
                ${sotto ? `<label class="spunta-semplice"><input type="checkbox" name="sotto" checked> Con i sotto-set (${sotto})</label>` : ''}
                <label class="spunta-semplice" data-solo-testo><input type="checkbox" name="stato"> Con lo stato di studio di ogni carta</label>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: `${Ui.ico('copia')}Copia testo`, classe: 'btn-secondario', clic: async md => {
                    const { testo, carte } = testoDiSet(setId, opzioni(md.el));
                    try { await navigator.clipboard.writeText(testo); Ui.toast(`${plurale(carte, 'carta copiata', 'carte copiate')} come testo`, 'successo'); md.chiudi(); }
                    catch (e) { Ui.toast('Copia non riuscita: usa Scarica', 'errore'); }
                } },
                { testo: `${Ui.ico('scarica')}Scarica`, classe: 'btn-primario', principale: true, clic: async md => {
                    const o = opzioni(md.el);
                    md.chiudi();
                    try {
                        if (o.formato === 'excel') await esportaXlsx(setId, o);
                        else scaricaFile(nomeFileSicuro(s.nome).slice(0, 120) + '.md', testoDiSet(setId, o).testo, 'text/markdown');
                    } catch (e) { Ui.toast('Export non riuscito: ' + e.message, 'errore', 6000); return; }
                    if (conImmagini(setId, o.conSottoSet)) Ui.toast('Le immagini delle carte non passano nel file: al loro posto c\'è [immagine]', 'info', 6000);
                } },
            ],
            alApri: el => {
                const spiega = () => {
                    const f = $('[data-formato] .attivo', el).dataset.valore;
                    $('[data-spiega-formato]', el).textContent = f === 'testo'
                        ? "Un file di testo (.md) che si legge bene: domande ad albero, sotto-set, risposte, tag, suggerimenti, spiegazioni, fonti e mappe. Puoi modificarlo e reimportarlo: le carte con la stessa domanda si aggiornano e tengono i progressi."
                        : 'Una tabella con set, livello nell\'albero, domanda, risposta, tag, suggerimento, spiegazione, fonte, mappa, stato e prossimo ripasso. Si reimporta anche lei.';
                    $('[data-solo-testo]', el).hidden = f !== 'testo';
                    $$('.modale-piede button', el)[1].hidden = f !== 'testo';
                };
                $('[data-formato]', el).addEventListener('click', e => {
                    const b = e.target.closest('[data-valore]');
                    if (!b) return;
                    $$('[data-formato] button', el).forEach(x => x.classList.toggle('attivo', x === b));
                    spiega();
                });
                spiega();
            },
        });
        function opzioni(el) {
            return {
                formato: $('[data-formato] .attivo', el).dataset.valore,
                conSottoSet: !$('[name=sotto]', el) || $('[name=sotto]', el).checked,
                conStato: $('[name=stato]', el).checked,
            };
        }
    }


    async function esportaBackup() {
        Ui.toast('Preparo il backup…', 'info', 1500);
        const backup = await Archivio.esporta();
        scaricaFile(`flashcard-backup-${chiaveGiorno()}.json`, JSON.stringify(backup), 'application/json');
        Dati.salvaImpostazioni({ ultimoBackup: Date.now() });
        Ui.toast(`Backup scaricato${backup.file.length ? `, con ${plurale(backup.file.length, 'file', 'file')} dei materiali` : ''}`, 'successo');
    }

    async function ripristinaBackup() {
        const file = await scegliFile('.json,application/json');
        if (!file) return;
        let contenuto;
        try { contenuto = JSON.parse(await leggiFile(file)); } catch (e) { contenuto = null; }
        if (!contenuto || contenuto.app !== 'flashcard' || !contenuto.dati) {
            Ui.toast('Questo file non è un backup di Flashcard', 'errore');
            return;
        }
        const d = contenuto.dati;
        const n = nome => (Array.isArray(d[nome]) ? d[nome].length : 0);
        const ok = await Ui.conferma(
            `Il backup del ${esc(formattaData(contenuto.esportato || Date.now()))} contiene ${plurale(n('materie'), 'materia', 'materie')}, `
            + `${plurale(n('set'), 'set', 'set')} e ${plurale(n('carte'), 'carta', 'carte')}.<br><br><b>Tutti i dati attuali verranno sostituiti.</b>`,
            { titolo: 'Ripristinare il backup?', ok: 'Ripristina', pericolo: true });
        if (!ok) return;

        // Il file viene dall'esterno: ripulisco l'HTML e i colori prima di fidarmi
        (d.carte || []).forEach(c => {
            c.domanda = Ricco.pulisci(c.domanda);
            c.risposte = (c.risposte || []).map(r => ({ testo: Ricco.pulisci(r.testo), corretta: !!r.corretta }));
            c.spiegazione = Ricco.pulisci(c.spiegazione);
            c.suggerimento = String(c.suggerimento || '');
            c.tag = Array.isArray(c.tag) ? c.tag.map(String) : [];
            // Un backup di una versione precedente viene portato al modello attuale da Dati.migra() qui sotto
            c.srs = c.srs && typeof c.srs === 'object' ? c.srs : Srs.statoIniziale();
        });
        (d.materie || []).forEach(m => { if (!/^#[0-9a-f]{3,8}$/i.test(m.colore || '')) m.colore = COLORI_MATERIA[0]; });
        (d.materiali || []).forEach(m => { if (m.anteprima && !/^data:image\/(png|jpe?g|webp|gif);/i.test(m.anteprima)) m.anteprima = null; });

        await Archivio.sostituisciTutto(d, contenuto.file || []);
        Dati.migra();
        App.applicaTema(Dati.impostazioni().tema);
        Ui.toast('Backup ripristinato', 'successo');
        Router.vai('/home');
    }

    return { apriDialogo, apriEsporta, leggiTesto, applica, testoDiSet, esportaXlsx, htmlInTesto, esportaBackup, ripristinaBackup };
})();
