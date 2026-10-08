// Selezione di più flashcard negli elenchi (pagina del set e ricerca della libreria) e azioni di
// gruppo: tag, domanda madre, spostamento, progressi, modifica con l'assistente, eliminazione.
// Ogni azione è un blocco della storia (js/storia.js): l'avviso che compare dopo permette di annullarla.
//
// Come la usa una vista: Selezione.prepara(chiave) prima di disegnare; Selezione.pulsante() dove va
// il tasto "Seleziona"; nelle righe data-sel-riga="id" sul contenitore e Selezione.casella(id) dentro;
// infine Selezione.monta(radice, { tutte, ridisegna, setId }).
// Clic su una riga = seleziona, Maiusc+clic = intervallo, Spazio = seleziona la riga col fuoco,
// Ctrl+A = tutte, Esc = esci dalla selezione.

const Selezione = (() => {
    const stato = { chiave: null, attiva: false, ids: new Set(), ultimo: null };
    let radice = null;
    let opzioni = { tutte: () => [], ridisegna: () => {}, setId: null };
    const ico = (...a) => Ui.ico(...a);

    function azzera() {
        stato.attiva = false;
        stato.ids.clear();
        stato.ultimo = null;
    }

    // Cambiando pagina la selezione si chiude; ridisegnando la stessa pagina resta
    window.addEventListener('hashchange', azzera);

    function prepara(chiave) {
        if (stato.chiave !== chiave) { stato.chiave = chiave; azzera(); }
        stato.ids.forEach(id => { if (!Dati.carta(id)) stato.ids.delete(id); });
    }

    function pulsante() {
        return `<button type="button" class="btn ${stato.attiva ? 'btn-secondario' : 'btn-fantasma'} btn-piccolo" data-sel-azione="alterna" title="Seleziona più flashcard per modificarle o eliminarle insieme">
            ${ico(stato.attiva ? 'spunta' : 'seleziona')}${stato.attiva ? 'Fine' : 'Seleziona'}</button>`;
    }

    function casella(id) {
        if (!stato.attiva) return '';
        return `<label class="casella-sel"><input type="checkbox" data-sel="${id}" ${stato.ids.has(id) ? 'checked' : ''} aria-label="Seleziona la flashcard"></label>`;
    }

    function classe(id) { return stato.attiva ? ` selezionabile${stato.ids.has(id) ? ' selezionata' : ''}` : ''; }

    // ---- Montaggio nella vista ---------------------------------------------------------

    function monta(el, opz) {
        radice = el;
        opzioni = { tutte: () => [], ridisegna: () => {}, setId: null, ...opz };

        el.addEventListener('click', e => {
            const b = e.target.closest('[data-sel-azione]');
            if (b && el.contains(b)) { e.preventDefault(); azione(b.dataset.selAzione, b); return; }
            if (!stato.attiva) return;
            const riga = e.target.closest('[data-sel-riga]');
            if (!riga || e.target.closest('.nodo-menu, .nodo-espandi')) return;
            const id = riga.dataset.selRiga;
            const input = e.target.closest('input[data-sel]');
            e.stopPropagation();
            if (input) { imposta(id, input.checked, e.shiftKey); return; }
            e.preventDefault();
            imposta(id, !stato.ids.has(id), e.shiftKey);
        }, true);

        el.addEventListener('keydown', e => {
            if (!stato.attiva || e.key !== ' ') return;
            const riga = e.target.closest('[data-sel-riga]');
            if (!riga || e.target.matches('input:not([data-sel]), textarea, select')) return;
            e.preventDefault();
            imposta(riga.dataset.selRiga, !stato.ids.has(riga.dataset.selRiga), e.shiftKey);
        });

        disegnaBarra();
    }

    function montata() { return radice && document.contains(radice); }

    document.addEventListener('keydown', e => {
        if (!stato.attiva || !montata() || Ui.finestraAperta() || $('.menu')) return;
        if (e.target.matches('input:not([type=checkbox]), textarea, select, [contenteditable]')) return;
        if (e.key === 'Escape') { e.preventDefault(); alterna(false); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); tutte(true); }
    });

    function alterna(attiva = !stato.attiva) {
        stato.attiva = attiva;
        if (!attiva) { stato.ids.clear(); stato.ultimo = null; }
        const b = radice && $('[data-sel-azione="alterna"]', radice);
        if (b) b.outerHTML = pulsante();
        opzioni.ridisegna();
        disegnaBarra();
    }

    function imposta(id, valore, intervallo) {
        let ids = [id];
        if (intervallo && stato.ultimo && stato.ultimo !== id) {
            const ordine = $$('[data-sel-riga]', radice).map(r => r.dataset.selRiga);
            const a = ordine.indexOf(stato.ultimo), b = ordine.indexOf(id);
            if (a >= 0 && b >= 0) ids = ordine.slice(Math.min(a, b), Math.max(a, b) + 1);
        }
        ids.forEach(x => (valore ? stato.ids.add(x) : stato.ids.delete(x)));
        stato.ultimo = id;
        aggiornaRighe();
        disegnaBarra();
    }

    function tutte(seleziona) {
        const ids = opzioni.tutte();
        if (seleziona) ids.forEach(id => stato.ids.add(id)); else stato.ids.clear();
        aggiornaRighe();
        disegnaBarra();
    }

    function aggiornaRighe() {
        if (!montata()) return;
        $$('[data-sel-riga]', radice).forEach(r => {
            const sì = stato.ids.has(r.dataset.selRiga);
            r.classList.toggle('selezionata', sì);
            const input = $('input[data-sel]', r);
            if (input) input.checked = sì;
        });
    }

    function disegnaBarra() {
        if (!montata()) return;
        let barra = $('.barra-selezione', radice);
        if (!stato.attiva) { if (barra) barra.remove(); return; }
        if (!barra) {
            barra = document.createElement('div');
            barra.className = 'barra-selezione';
            barra.setAttribute('role', 'toolbar');
            barra.setAttribute('aria-label', 'Azioni sulle flashcard selezionate');
            radice.appendChild(barra);
        }
        const n = stato.ids.size;
        const totale = opzioni.tutte().length;
        const tutteScelte = totale > 0 && opzioni.tutte().every(id => stato.ids.has(id));
        const off = n ? '' : 'disabled';
        barra.innerHTML = `
            <button type="button" class="btn-icona" data-sel-azione="esci" aria-label="Esci dalla selezione" title="Esci (Esc)">${ico('chiudi')}</button>
            <span class="sel-conto"><b>${n}</b> ${n === 1 ? 'selezionata' : 'selezionate'}</span>
            <button type="button" class="btn btn-fantasma btn-piccolo" data-sel-azione="${tutteScelte ? 'nessuna' : 'tutte'}">${tutteScelte ? 'Deseleziona' : `Tutte <small>(${totale})</small>`}</button>
            <span class="sel-spazio"></span>
            <button type="button" class="btn btn-fantasma btn-piccolo" data-sel-azione="tag" ${off} title="Aggiungi o togli tag">${ico('etichetta')}<span>Tag</span></button>
            <button type="button" class="btn btn-fantasma btn-piccolo" data-sel-azione="madre" ${off} title="Metti sotto una domanda madre">${ico('ramo')}<span>Madre</span></button>
            <button type="button" class="btn btn-fantasma btn-piccolo" data-sel-azione="sposta" ${off} title="Sposta in un altro set">${ico('cartella')}<span>Sposta</span></button>
            <button type="button" class="btn btn-fantasma btn-piccolo" data-sel-azione="ia" ${off} title="Chiedi all'assistente di modificarle">${ico('scintille')}<span>Assistente</span></button>
            <button type="button" class="btn-icona" data-sel-azione="altro" ${off} aria-label="Altre azioni">${ico('altro')}</button>
            <button type="button" class="btn btn-pericolo-tenue btn-piccolo" data-sel-azione="elimina" ${off} title="Elimina">${ico('cestino')}<span>Elimina</span></button>`;
    }

    // ---- Azioni ------------------------------------------------------------------------

    function azione(nome, b) {
        switch (nome) {
            case 'alterna': alterna(); break;
            case 'esci': alterna(false); break;
            case 'tutte': tutte(true); break;
            case 'nessuna': tutte(false); break;
            case 'tag': modificaTag(); break;
            case 'madre': scegliMadre(); break;
            case 'sposta': sposta(); break;
            case 'ia': conAssistente(); break;
            case 'elimina': elimina(); break;
            case 'altro': Ui.menu(b, [
                { testo: 'Porta al primo livello', icona: 'esci-rientro', clic: () => applicaMadre(null) },
                { testo: 'Cambia la valutazione…', icona: 'obiettivo', clic: () => Ui.menuValutazione(b, selezionate(), () => finito(false)) },
                { testo: 'Reimposta i progressi', icona: 'ruota', clic: reimposta },
            ]); break;
        }
    }

    // Selezionate in ordine di set e d'albero
    function selezionate() {
        const carte = [...stato.ids].map(Dati.carta).filter(Boolean);
        const posizione = new Map();
        [...new Set(carte.map(c => c.setId))].forEach(setId => Dati.carteDiSet(setId).forEach((c, i) => posizione.set(c.id, i)));
        return carte.sort((a, b) => (a.setId === b.setId ? posizione.get(a.id) - posizione.get(b.id) : a.setId.localeCompare(b.setId)));
    }

    // Le selezionate senza una antenata selezionata: i loro rami si muovono con loro
    function cime(carte) {
        const scelte = new Set(carte.map(c => c.id));
        return carte.filter(c => {
            for (let m = Dati.madre(c); m; m = Dati.madre(m)) if (scelte.has(m.id)) return false;
            return true;
        });
    }

    const nCarte = n => plurale(n, 'flashcard', 'flashcard');

    function finito(esci) {
        if (esci) azzera();
        App.ridisegna();
    }

    async function elimina() {
        const carte = selezionate();
        if (!carte.length) return;
        const scelte = new Set(carte.map(c => c.id));
        const altreFiglie = [...new Set(carte.flatMap(c => Dati.discendentiCarta(c.id)))].filter(id => !scelte.has(id));
        const conFiglie = await new Promise(risolvi => {
            let esito = null;
            Ui.modale({
                titolo: `Eliminare ${nCarte(carte.length)}?`, classe: 'modale-piccola',
                corpo: `<p class="testo-conferma">Le ${nCarte(carte.length)} selezionate verranno eliminate. Potrai annullare dall'avviso che compare subito dopo o da <b>Modifiche recenti</b>.</p>
                    ${altreFiglie.length ? `<label class="spunta-riga"><input type="checkbox" name="figlie"><span><b>Elimina anche le loro domande figlie</b>
                        <small>${plurale(altreFiglie.length, 'domanda figlia non selezionata', 'domande figlie non selezionate')}: se non le elimini salgono di un livello</small></span></label>` : ''}`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: 'Elimina', classe: 'btn-pericolo', principale: true, clic: m => { const c = $('[name=figlie]', m.el); esito = !!(c && c.checked); m.chiudi(); } },
                ],
                alChiudere: () => risolvi(esito),
            });
        });
        if (conFiglie === null) return;
        const ids = conFiglie ? [...scelte, ...altreFiglie] : [...scelte];
        await Storia.esegui(`${nCarte(ids.length)} ${ids.length === 1 ? 'eliminata' : 'eliminate'}`, () => ids.forEach(id => Dati.eliminaCarta(id)));
        finito(true);
    }

    async function sposta() {
        const carte = selezionate();
        const dest = await Ui.scegliSet({ titolo: `Sposta ${nCarte(carte.length)} in…`, testoOk: 'Sposta' });
        if (!dest) return;
        const daSpostare = cime(carte).filter(c => c.setId !== dest);
        if (!daSpostare.length) { Ui.toast('Sono già in quel set'); return; }
        const conRami = daSpostare.reduce((n, c) => n + 1 + Dati.discendentiCarta(c.id).length, 0);
        await Storia.esegui(`${nCarte(conRami)} ${conRami === 1 ? 'spostata' : 'spostate'} in «${Dati.set(dest).nome}»`,
            () => daSpostare.forEach(c => Dati.spostaCarta(c.id, dest)));
        finito(true);
    }

    function scegliMadre() {
        const carte = selezionate();
        const setIds = [...new Set(carte.map(c => c.setId))];
        if (setIds.length > 1) { Ui.toast('Le carte selezionate sono in set diversi: la domanda madre deve stare nello stesso set', 'errore', 5000); return; }
        const vietate = new Set(carte.flatMap(c => [c.id, ...Dati.discendentiCarta(c.id)]));
        const albero = Dati.alberoDiSet(setIds[0]).filter(n => !vietate.has(n.carta.id));
        let scelta;
        Ui.modale({
            titolo: 'Domanda madre', classe: 'modale-piccola',
            corpo: `<p class="nota">Le ${nCarte(carte.length)} selezionate diventano figlie della domanda che scegli, nell'ordine in cui sono (con i loro rami).</p>
                <label class="campo"><span>Metti sotto a</span>
                    <select name="madre"><option value="">— Nessuna: diventano domande principali —</option>
                    ${albero.map(n => `<option value="${n.carta.id}">${Ui.rientroOpzione(n.livello)}${esc(Ui.tronca(testoDaHtml(n.carta.domanda), 90))}</option>`).join('')}</select></label>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Applica', classe: 'btn-primario', principale: true, clic: m => { scelta = $('[name=madre]', m.el).value || null; m.chiudi(); } },
            ],
            alChiudere: () => { if (scelta !== undefined) applicaMadre(scelta); },
        });
    }

    async function applicaMadre(madreId) {
        const carte = cime(selezionate());
        if (madreId && carte.some(c => c.setId !== Dati.carta(madreId).setId)) return;
        await Storia.esegui(madreId ? `${nCarte(carte.length)} sotto la nuova domanda madre` : `${nCarte(carte.length)} portate al primo livello`,
            () => carte.forEach(c => Dati.impostaMadre(c.id, madreId)));
        finito(false);
    }

    function modificaTag() {
        const carte = selezionate();
        const presenti = Dati.tagDi(carte);
        const conta = t => carte.filter(c => c.tag.includes(t)).length;
        const tuttiITag = Dati.tagDi(Dati.tutteLeCarte());
        Ui.modale({
            titolo: `Tag di ${nCarte(carte.length)}`, classe: 'modale-piccola',
            corpo: `
                <label class="campo"><span>Aggiungi <em>separati da virgola</em></span>
                    <input type="text" name="aggiungi" list="tag-esistenti" placeholder="es. capitolo 2, da rivedere" autofocus>
                    <datalist id="tag-esistenti">${tuttiITag.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
                ${presenti.length ? `<div class="campo"><span>Togli <em>clic sui tag da togliere</em></span>
                    <div class="lista-chip">${presenti.map(t => `<button type="button" class="chip-scelta" data-togli="${esc(t)}">${esc(t)} <small>${conta(t)}/${carte.length}</small></button>`).join('')}</div></div>` : ''}`,
            alApri: el => el.addEventListener('click', e => { const b = e.target.closest('[data-togli]'); if (b) b.classList.toggle('attivo'); }),
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Applica', classe: 'btn-primario', principale: true, clic: async m => {
                    const aggiungi = $('[name=aggiungi]', m.el).value.split(',').map(t => t.trim()).filter(Boolean);
                    const togli = new Set($$('[data-togli].attivo', m.el).map(b => b.dataset.togli));
                    m.chiudi();
                    if (!aggiungi.length && !togli.size) return;
                    const cambiate = carte.filter(c => aggiungi.some(t => !c.tag.includes(t)) || c.tag.some(t => togli.has(t)));
                    await Storia.esegui(`Tag aggiornati su ${nCarte(cambiate.length)}`,
                        () => cambiate.forEach(c => Dati.aggiornaCarta(c.id, { tag: [...c.tag.filter(t => !togli.has(t)), ...aggiungi] })));
                    finito(false);
                } },
            ],
        });
    }

    async function reimposta() {
        const carte = selezionate();
        const ok = await Ui.conferma(`Le ${nCarte(carte.length)} selezionate torneranno <b>mai studiate</b>. Lo storico delle statistiche resta.`,
            { titolo: 'Reimpostare i progressi?', ok: 'Reimposta', pericolo: true });
        if (!ok) return;
        await Storia.esegui(`Progressi reimpostati su ${nCarte(carte.length)}`, () => Dati.reimpostaProgressi(carte));
        finito(false);
    }

    function conAssistente() {
        const carte = selezionate();
        const setIds = [...new Set(carte.map(c => c.setId))];
        Assistente.allega(carte.map(c => c.id), { setId: setIds.length === 1 ? setIds[0] : null });
    }

    return { prepara, pulsante, casella, classe, monta, get attiva() { return stato.attiva; } };
})();
