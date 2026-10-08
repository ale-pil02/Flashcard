// Pezzi di interfaccia riutilizzati dalle viste: icone, finestre, menu, avvisi,
// barre di avanzamento e i moduli per materie, set ed esami.

const CATEGORIE = ['perfetto', 'buono', 'ok', 'scarso', 'nuova'];
const NOMI_CATEGORIE = { perfetto: 'Perfetto', buono: 'Buono', ok: 'Ok', scarso: 'Scarso', nuova: 'Mai studiate' };

const Ui = (() => {
    const pila = [];   // finestre aperte, l'ultima è quella in primo piano

    function ico(nome, classe = '') {
        return `<svg class="ico ${classe}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
    }

    // Un solo ascoltatore per vista: gli elementi con data-azione="nome" chiamano azioni.nome(el, evento)
    function collegaAzioni(radice, azioni) {
        radice.addEventListener('click', e => {
            const el = e.target.closest('[data-azione]');
            if (!el || !radice.contains(el)) return;
            const fn = azioni[el.dataset.azione];
            if (!fn) return;
            e.preventDefault();
            fn(el, e);
        });
    }

    // ---- Avvisi --------------------------------------------------------

    // azione facoltativa: { testo, clic } → pulsante nell'avviso (es. "Annulla")
    function toast(testo, tipo = 'info', durata = 2800, azione = null) {
        const el = document.createElement('div');
        el.className = `toast toast-${tipo}`;
        el.innerHTML = `${ico(tipo === 'errore' ? 'avviso' : 'ok-cerchio')}<span>${esc(testo)}</span>
            ${azione ? `<button type="button" class="toast-azione">${esc(azione.testo)}</button>` : ''}`;
        $('#livello-toast').appendChild(el);
        requestAnimationFrame(() => el.classList.add('visibile'));
        const togli = () => {
            el.classList.remove('visibile');
            setTimeout(() => el.remove(), 250);
        };
        if (azione) el.querySelector('.toast-azione').addEventListener('click', () => { togli(); azione.clic(); }, { once: true });
        setTimeout(togli, durata);
    }

    function segnalaErrore(campo, messaggio) {
        if (!campo) return;
        campo.classList.add('errore');
        campo.focus();
        campo.addEventListener('input', () => campo.classList.remove('errore'), { once: true });
        if (messaggio) toast(messaggio, 'errore');
    }

    // ---- Finestre ------------------------------------------------------

    // azioni: [{ testo, classe, principale, clic(m) }]; senza "clic" il pulsante chiude e basta
    function modale({ titolo = '', corpo = '', azioni = [], classe = '', alApri, alChiudere, chiudibile = true }) {
        const sfondo = document.createElement('div');
        sfondo.className = 'modale-sfondo';
        sfondo.innerHTML = `
            <div class="modale ${classe}" role="dialog" aria-modal="true" aria-label="${esc(titolo)}" tabindex="-1">
                <div class="modale-testa">
                    <h2>${esc(titolo)}</h2>
                    ${chiudibile ? `<button type="button" class="btn-icona" data-chiudi aria-label="Chiudi">${ico('chiudi')}</button>` : ''}
                </div>
                <div class="modale-corpo">${corpo}</div>
                ${azioni.length ? `<div class="modale-piede">${azioni.map((a, i) =>
                    `<button type="button" class="btn ${a.classe || 'btn-secondario'}" data-indice="${i}">${a.testo}</button>`).join('')}</div>` : ''}
            </div>`;
        $('#livello-modali').appendChild(sfondo);
        const el = sfondo.querySelector('.modale');
        const precedente = document.activeElement;
        let chiusa = false;

        const m = {
            el, chiudibile,
            chiudi(valore) {
                if (chiusa) return;
                chiusa = true;
                sfondo.classList.remove('visibile');
                setTimeout(() => sfondo.remove(), 180);
                pila.splice(pila.indexOf(m), 1);
                if (precedente && precedente.focus && document.contains(precedente)) precedente.focus({ preventScroll: true });
                if (alChiudere) alChiudere(valore);
            },
        };
        pila.push(m);

        sfondo.addEventListener('mousedown', e => { if (e.target === sfondo && chiudibile) m.chiudi(); });
        el.addEventListener('click', e => {
            if (e.target.closest('[data-chiudi]')) { m.chiudi(); return; }
            const b = e.target.closest('.modale-piede [data-indice]');
            if (!b) return;
            const a = azioni[+b.dataset.indice];
            if (a.clic) a.clic(m); else m.chiudi();
        });
        // Invio in un campo di testo equivale al pulsante principale
        el.addEventListener('keydown', e => {
            if (e.key !== 'Enter' || e.shiftKey || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return;
            const i = azioni.findIndex(a => a.principale);
            if (i < 0) return;
            e.preventDefault();
            el.querySelector(`.modale-piede [data-indice="${i}"]`).click();
        });

        requestAnimationFrame(() => sfondo.classList.add('visibile'));
        if (alApri) alApri(el, m);
        const daFocalizzare = el.querySelector('[autofocus]') || el.querySelector('.modale-piede .btn-primario, .modale-piede .btn-pericolo') || el;
        daFocalizzare.focus({ preventScroll: true });
        return m;
    }

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !pila.length) return;
        const m = pila[pila.length - 1];
        if (!m.chiudibile) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        m.chiudi();
    }, true);

    function finestraAperta() { return pila.length > 0; }

    // "testo" è HTML: chi chiama deve passare i dati dell'utente da esc()
    function conferma(testo, { titolo = 'Confermi?', ok = 'Conferma', pericolo = false } = {}) {
        return new Promise(risolvi => {
            let esito = false;
            modale({
                titolo, classe: 'modale-piccola',
                corpo: `<p class="testo-conferma">${testo}</p>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: ok, classe: pericolo ? 'btn-pericolo' : 'btn-primario', principale: true, clic: m => { esito = true; m.chiudi(); } },
                ],
                alChiudere: () => risolvi(esito),
            });
        });
    }

    // ---- Menu a tendina ------------------------------------------------

    let menuAperto = null;

    function chiudiMenu() {
        if (!menuAperto) return;
        menuAperto.remove();
        menuAperto = null;
        document.removeEventListener('mousedown', clicFuoriMenu, true);
        window.removeEventListener('resize', chiudiMenu);
        window.removeEventListener('scroll', chiudiMenu, true);
    }

    function clicFuoriMenu(e) { if (menuAperto && !menuAperto.contains(e.target)) chiudiMenu(); }

    // voci: [{ testo, icona, clic, pericolo }] oppure '-' per un separatore
    function menu(ancora, voci) {
        chiudiMenu();
        const lista = voci.filter(Boolean);
        const el = document.createElement('div');
        el.className = 'menu';
        el.setAttribute('role', 'menu');
        el.innerHTML = lista.map((v, i) => v === '-' ? '<hr>' :
            `<button type="button" role="menuitem" data-i="${i}" class="${v.pericolo ? 'pericolo' : ''}">${v.icona ? ico(v.icona) : ''}<span>${esc(v.testo)}</span></button>`).join('');
        document.body.appendChild(el);

        const r = ancora.getBoundingClientRect();
        const larghezza = el.offsetWidth, altezza = el.offsetHeight;
        let sinistra = limita(r.right - larghezza, 8, window.innerWidth - larghezza - 8);
        let alto = r.bottom + 6;
        if (alto + altezza > window.innerHeight - 8) alto = Math.max(8, r.top - altezza - 6);
        el.style.left = sinistra + 'px';
        el.style.top = alto + 'px';

        el.addEventListener('click', e => {
            const b = e.target.closest('[data-i]');
            if (!b) return;
            chiudiMenu();
            lista[+b.dataset.i].clic();
        });
        menuAperto = el;
        document.addEventListener('mousedown', clicFuoriMenu, true);
        window.addEventListener('resize', chiudiMenu);
        window.addEventListener('scroll', chiudiMenu, true);
        const primo = el.querySelector('button');
        if (primo) primo.focus({ preventScroll: true });
    }

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuAperto) { e.stopImmediatePropagation(); chiudiMenu(); } }, true);

    // ---- Sezioni che si aprono e chiudono ---------------------------------
    // Nella pagina del set (sotto-set, revisioni, materiali). Lo stato vale per tutti i set ed è ricordato
    // in questo browser. Uso: <section class="sezione${Ui.classeApribile('nome')}"> con Ui.titoloApribile('nome', html)
    // nell'intestazione e il contenuto dentro <div class="sezione-corpo">.

    const CHIAVE_SEZIONI = 'flashcard-sezioni-chiuse';

    function sezioniChiuse() {
        try { return JSON.parse(localStorage.getItem(CHIAVE_SEZIONI) || '{}') || {}; } catch (e) { return {}; }
    }

    function ricordaSezione(nome, chiusa) {
        const stato = sezioniChiuse();
        if (chiusa) stato[nome] = true; else delete stato[nome];
        try { localStorage.setItem(CHIAVE_SEZIONI, JSON.stringify(stato)); } catch (e) { /* resta per questa pagina */ }
    }

    function sezioneChiusa(nome) { return sezioniChiuse()[nome] === true; }

    function classeApribile(nome) { return ` sezione-apribile${sezioneChiusa(nome) ? ' chiusa' : ''}`; }

    function titoloApribile(nome, html) {
        const chiusa = sezioneChiusa(nome);
        return `<h2 class="titolo-apribile"><button type="button" class="sezione-interruttore" data-interruttore="${nome}" aria-expanded="${!chiusa}"
            title="${chiusa ? 'Apri' : 'Chiudi'} la sezione">${ico('destra', 'freccia-sezione')}<span>${html}</span></button></h2>`;
    }

    function impostaSezione(sezione, nome, chiusa) {
        sezione.classList.toggle('chiusa', chiusa);
        const b = sezione.querySelector(`[data-interruttore="${nome}"]`);
        if (b) { b.setAttribute('aria-expanded', String(!chiusa)); b.title = `${chiusa ? 'Apri' : 'Chiudi'} la sezione`; }
        ricordaSezione(nome, chiusa);
    }

    // Apre la sezione (es. quando si aggiunge qualcosa che altrimenti resterebbe nascosto)
    function apriSezione(nome) {
        ricordaSezione(nome, false);
        $$(`.sezione-apribile [data-interruttore="${nome}"]`).forEach(b => impostaSezione(b.closest('.sezione-apribile'), nome, false));
    }

    document.addEventListener('click', e => {
        const b = e.target.closest('[data-interruttore]');
        if (!b) return;
        const sezione = b.closest('.sezione-apribile');
        if (sezione) impostaSezione(sezione, b.dataset.interruttore, !sezione.classList.contains('chiusa'));
    });

    // ---- Avanzamento ---------------------------------------------------

    function barraStato(c, { alta = false } = {}) {
        const classe = `barra-stato${alta ? ' alta' : ''}`;
        if (!c.totale) return `<div class="${classe} vuota"></div>`;
        const titolo = CATEGORIE.filter(k => c[k]).map(k => `${NOMI_CATEGORIE[k]}: ${c[k]}`).join(' · ');
        return `<div class="${classe}" title="${esc(titolo)}">${CATEGORIE.map(k =>
            c[k] ? `<span class="seg seg-${k}" style="flex:${c[k]}"></span>` : '').join('')}</div>`;
    }

    function legendaStato(c) {
        return `<div class="legenda">${CATEGORIE.map(k =>
            `<span class="voce-legenda"><i class="pallino pallino-${k}"></i>${NOMI_CATEGORIE[k]}<b>${c[k]}</b></span>`).join('')}</div>`;
    }

    function percentuale(parte, totale) { return totale ? Math.round(parte / totale * 100) : 0; }

    function anello(frazione, { dimensione = 120, spessore = 11, colore = 'var(--primario)', centro = '' } = {}) {
        const r = (dimensione - spessore) / 2;
        const circ = 2 * Math.PI * r;
        const f = limita(frazione || 0, 0, 1);
        return `
            <div class="anello" style="width:${dimensione}px;height:${dimensione}px">
                <svg viewBox="0 0 ${dimensione} ${dimensione}" width="${dimensione}" height="${dimensione}">
                    <circle cx="${dimensione / 2}" cy="${dimensione / 2}" r="${r}" fill="none" stroke="var(--traccia)" stroke-width="${spessore}"/>
                    <circle cx="${dimensione / 2}" cy="${dimensione / 2}" r="${r}" fill="none" stroke="${colore}" stroke-width="${spessore}"
                        stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - f)}"
                        transform="rotate(-90 ${dimensione / 2} ${dimensione / 2})"/>
                </svg>
                <div class="anello-centro">${centro}</div>
            </div>`;
    }

    function vuoto({ icona = 'carte', titolo, testo = '', azioni = '' }) {
        return `
            <div class="vuoto">
                <div class="vuoto-icona">${ico(icona)}</div>
                <h3>${titolo}</h3>
                ${testo ? `<p>${testo}</p>` : ''}
                ${azioni ? `<div class="vuoto-azioni">${azioni}</div>` : ''}
            </div>`;
    }

    // Etichetta colorata con emoji della materia
    function emblema(materia, grande = false) {
        if (!materia) return '';
        return `<span class="emblema${grande ? ' grande' : ''}" style="--c:${esc(materia.colore)}">${esc(materia.emoji)}</span>`;
    }

    // Tessera di un set con avanzamento (Home, Libreria, Materia). I conteggi comprendono i sotto-set.
    function tesseraSet(s, { conMateria = true, conPercorso = true } = {}) {
        const c = Dati.conteggi(Dati.carteConSottoSet(s.id));
        const m = Dati.materia(s.materiaId);
        const sotto = Dati.sottoSet(s.id).length;
        const materiali = Dati.materialiDiSet(s.id).length;
        const percorso = conPercorso ? Dati.percorsoSet(s.id).map(p => p.nome) : [];
        const sopra = [conMateria && m ? `${m.emoji} ${m.nome}` : '', ...percorso].filter(Boolean).join(' › ');
        return `
            <a class="tessera tessera-set" href="#/set/${s.id}" style="--c:${m ? esc(m.colore) : 'var(--primario)'}">
                ${sopra ? `<span class="sopratitolo">${esc(sopra)}</span>` : ''}
                <h3>${esc(s.nome)}</h3>
                <p class="tessera-meta">${plurale(c.totale, 'flashcard', 'flashcard')}${sotto ? ` · ${plurale(sotto, 'sotto-set', 'sotto-set')}` : ''}${materiali ? ` · ${plurale(materiali, 'materiale', 'materiali')}` : ''}${c.daRipassare ? ` · <span class="da-ripassare">${c.daRipassare} da ripassare</span>` : ''}</p>
                ${barraStato(c)}
                <p class="tessera-percentuale">${percentuale(c.imparate, c.totale)}% imparate</p>
            </a>`;
    }

    // Riquadro per studiare un set o una materia: cosa c'è da fare e "Personalizza" (lo studio normale parte dalle revisioni)
    function pannelloStudio(carte) {
        const c = Dati.conteggi(carte);
        const imp = Dati.impostazioni();
        const limiti = Dati.limitiSessione(imp);
        const nuove = Math.min(c.nuova - c.nuoveDovute, limiti.nuove);
        const pronte = Math.min(c.daRipassare + nuove, limiti.max);
        const prossima = carte.filter(x => !Srs.daRipassare(x)).map(Srs.prossima).filter(Boolean).sort((a, b) => a - b)[0];
        const dettaglio = pronte
            ? [c.daRipassare && `${c.daRipassare} da ripassare`, nuove && `${plurale(nuove, 'nuova', 'nuove')}`].filter(Boolean).join(' · ')
            : `Tutto ripassato${prossima ? ` · prossimo ripasso ${distanzaGiorni(prossima)}` : ''}`;
        return `
            <section class="pannello-studio">
                <span class="pannello-icona">${ico('fulmine')}</span>
                <div class="pannello-testo">
                    <b>${pronte ? `${plurale(pronte, 'carta', 'carte')} per oggi` : 'Niente in programma oggi'}</b>
                    <small>${dettaglio}</small>
                </div>
                <div class="pannello-azioni">
                    <button type="button" class="btn btn-secondario btn-piccolo" data-azione="personalizza">${ico('cursori')}<span>Personalizza</span></button>
                </div>
            </section>`;
    }

    // Valutazione a mano di una o più carte (menu): cambia lo stato del set nelle revisioni, non le date.
    // "Mai valutata" la riporta tra le carte nuove (per correggere una valutazione data per sbaglio)
    function menuValutazione(ancora, carte, dopo = () => {}) {
        carte = carte.filter(Boolean);
        if (!carte.length) return;
        const attuale = carte.length === 1 ? Srs.valutazione(carte[0]) : undefined;
        const voce = (valore, nome) => ({
            testo: (attuale === valore ? '✓ ' : '') + nome, icona: 'obiettivo',
            clic: async () => {
                await Storia.esegui(`Valutazione «${nome}» su ${plurale(carte.length, 'flashcard', 'flashcard')}`, () => Dati.impostaValutazione(carte, valore));
                dopo();
            },
        });
        Ui.menu(ancora, [...Srs.VALUTAZIONI.map(v => voce(v.valore, v.nome)), '-', voce(null, 'Mai valutata')]);
    }

    function anteprimaRisposta(carta) {
        if (carta.risposte.length > 1) {
            return carta.risposte.filter(r => r.corretta).map(r => '✓ ' + testoDaHtml(r.testo)).join('   ');
        }
        return testoDaHtml((carta.risposte[0] || {}).testo) || (carta.mappa ? '(parte della mappa)' : '');
    }

    function tronca(testo, max) { return testo.length > max ? testo.slice(0, max - 1) + '…' : testo; }

    // Riga di una carta negli elenchi (set, ricerca)
    function rigaCarta(carta, { conSet = false } = {}) {
        const s = conSet ? Dati.set(carta.setId) : null;
        return `
            <a class="riga-carta" href="#/carta/${carta.id}">
                <i class="pallino pallino-${Srs.categoria(carta)}" title="${esc(Srs.descrivi(carta))}"></i>
                <div class="riga-carta-testo">
                    <p class="riga-domanda">${esc(tronca(testoDaHtml(carta.domanda), 240))}</p>
                    <p class="riga-risposta">${esc(tronca(anteprimaRisposta(carta), 200))}</p>
                    ${carta.risposte.length > 1 || carta.tag.length || s ? `<div class="riga-meta">
                        ${s ? `<span class="chip chip-tenue">${ico('cartella')}${esc(s.nome)}</span>` : ''}
                        ${carta.risposte.length > 1 ? `<span class="chip chip-primario">Scelta multipla</span>` : ''}
                        ${carta.tag.map(t => `<span class="chip">${esc(t)}</span>`).join('')}
                    </div>` : ''}
                </div>
                ${ico('destra', 'riga-freccia')}
            </a>`;
    }

    // ---- Moduli --------------------------------------------------------

    function formMateria(materia = null) {
        return new Promise(risolvi => {
            let risultato = null;
            let emoji = materia ? materia.emoji : EMOJI_MATERIA[0];
            let colore = materia ? materia.colore : COLORI_MATERIA[Dati.materie().length % COLORI_MATERIA.length];
            modale({
                titolo: materia ? 'Modifica materia' : 'Nuova materia',
                corpo: `
                    <label class="campo"><span>Nome</span>
                        <input type="text" name="nome" maxlength="80" value="${esc(materia ? materia.nome : '')}" placeholder="es. Psicologia dello sviluppo" autofocus></label>
                    <div class="campo"><span>Icona</span>
                        <div class="scelta-emoji">${EMOJI_MATERIA.map(e => `<button type="button" data-emoji="${e}" class="${e === emoji ? 'attivo' : ''}">${e}</button>`).join('')}</div></div>
                    <div class="campo"><span>Colore</span>
                        <div class="scelta-colore">${COLORI_MATERIA.map(c => `<button type="button" data-colore="${c}" style="--c:${c}" class="${c === colore ? 'attivo' : ''}" aria-label="Colore"></button>`).join('')}</div></div>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    {
                        testo: materia ? 'Salva' : 'Crea materia', classe: 'btn-primario', principale: true, clic: m => {
                            const input = $('[name=nome]', m.el);
                            if (!input.value.trim()) { segnalaErrore(input, 'Dai un nome alla materia'); return; }
                            risultato = { nome: input.value.trim(), emoji, colore };
                            m.chiudi();
                        },
                    },
                ],
                alApri: el => el.addEventListener('click', e => {
                    const be = e.target.closest('[data-emoji]');
                    const bc = e.target.closest('[data-colore]');
                    if (be) { emoji = be.dataset.emoji; $$('[data-emoji]', el).forEach(b => b.classList.toggle('attivo', b === be)); }
                    if (bc) { colore = bc.dataset.colore; $$('[data-colore]', el).forEach(b => b.classList.toggle('attivo', b === bc)); }
                }),
                alChiudere: () => risolvi(risultato),
            });
        });
    }

    async function nuovaMateria() {
        const dati = await formMateria();
        if (!dati) return null;
        const m = Dati.creaMateria(dati);
        toast('Materia creata', 'successo');
        return m;
    }

    function opzioniMaterie(selezionata, { conNessuna = false, conNuova = true } = {}) {
        return (conNessuna ? `<option value="">— Nessuna —</option>` : '')
            + Dati.materie().map(m => `<option value="${m.id}" ${m.id === selezionata ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.nome)}</option>`).join('')
            + (conNuova ? `<option value="__nuova">＋ Nuova materia…</option>` : '');
    }

    // Voci "Dentro a…" per scegliere il set contenitore, escluso il set stesso e i suoi sotto-set
    function opzioniContenitore(materiaId, selezionato, escludi = new Set()) {
        return `<option value="">— Nessuno: set principale della materia —</option>`
            + (materiaId ? Dati.alberoSet(materiaId) : []).filter(n => !escludi.has(n.set.id)).map(n =>
                `<option value="${n.set.id}" ${n.set.id === selezionato ? 'selected' : ''}>${rientroOpzione(n.livello)}${esc(n.set.nome)}</option>`).join('');
    }

    function rientroOpzione(livello) { return livello ? '    '.repeat(livello) + '↳ ' : ''; }

    // Restituisce { nome, descrizione, materiaId, genitoreId }; se serve crea anche la materia
    function formSet(setEsistente = null, { materiaId = null, genitoreId = null } = {}) {
        return new Promise(risolvi => {
            let risultato = null;
            const nessunaMateria = !Dati.materie().length;
            const materiaIniziale = setEsistente ? setEsistente.materiaId : (materiaId || (Dati.materie()[0] || {}).id);
            const contenitore = setEsistente ? setEsistente.genitoreId : genitoreId;
            const escludi = setEsistente ? new Set([setEsistente.id, ...Dati.discendentiSet(setEsistente.id)]) : new Set();
            const titolo = setEsistente ? 'Modifica set' : genitoreId ? 'Nuovo sotto-set' : 'Nuovo set di flashcard';
            modale({
                titolo,
                corpo: `
                    <label class="campo"><span>Nome del set</span>
                        <input type="text" name="nome" maxlength="120" value="${esc(setEsistente ? setEsistente.nome : '')}" placeholder="es. Capitolo 3 — Attaccamento" autofocus></label>
                    <label class="campo"><span>Descrizione <em>facoltativa</em></span>
                        <textarea name="descrizione" rows="2" maxlength="400" placeholder="Di cosa parla questo set">${esc(setEsistente ? setEsistente.descrizione : '')}</textarea></label>
                    <label class="campo" ${nessunaMateria ? 'hidden' : ''}><span>Materia</span>
                        <select name="materia">${opzioniMaterie(materiaIniziale)}</select></label>
                    <label class="campo" data-nuova-materia ${nessunaMateria ? '' : 'hidden'}><span>Nome della nuova materia</span>
                        <input type="text" name="nuovaMateria" maxlength="80" value="${nessunaMateria ? 'Generale' : ''}" placeholder="es. Pedagogia"></label>
                    <label class="campo" data-campo-contenitore ${nessunaMateria ? 'hidden' : ''}><span>Dentro a <em>per farne un sotto-set</em></span>
                        <select name="contenitore">${opzioniContenitore(materiaIniziale, contenitore, escludi)}</select></label>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    {
                        testo: setEsistente ? 'Salva' : 'Crea set', classe: 'btn-primario', principale: true, clic: m => {
                            const nome = $('[name=nome]', m.el);
                            if (!nome.value.trim()) { segnalaErrore(nome, 'Dai un nome al set'); return; }
                            let scelta = $('[name=materia]', m.el).value;
                            if (nessunaMateria || scelta === '__nuova') {
                                const nm = $('[name=nuovaMateria]', m.el);
                                if (!nm.value.trim()) { segnalaErrore(nm, 'Dai un nome alla materia'); return; }
                                scelta = Dati.creaMateria({ nome: nm.value.trim() }).id;
                            }
                            risultato = {
                                nome: nome.value.trim(), descrizione: $('[name=descrizione]', m.el).value,
                                materiaId: scelta, genitoreId: $('[name=contenitore]', m.el).value || null,
                            };
                            m.chiudi();
                        },
                    },
                ],
                alApri: el => $('[name=materia]', el).addEventListener('change', e => {
                    const nuova = e.target.value === '__nuova';
                    $('[data-nuova-materia]', el).hidden = !nuova;
                    $('[data-campo-contenitore]', el).hidden = nuova;
                    $('[name=contenitore]', el).innerHTML = opzioniContenitore(nuova ? null : e.target.value, null, escludi);
                    if (nuova) $('[name=nuovaMateria]', el).focus();
                }),
                alChiudere: () => risolvi(risultato),
            });
        });
    }

    async function nuovoSet(materiaId = null, genitoreId = null) {
        const dati = await formSet(null, { materiaId, genitoreId });
        if (!dati) return null;
        const s = Dati.creaSet(dati);
        toast(s.genitoreId ? 'Sotto-set creato' : 'Set creato', 'successo');
        return s;
    }

    function formEsame(esame = null) {
        return new Promise(risolvi => {
            let risultato = null;
            modale({
                titolo: esame && esame.id ? 'Modifica esame' : 'Nuovo esame',
                corpo: `
                    <label class="campo"><span>Nome dell'esame</span>
                        <input type="text" name="nome" maxlength="120" value="${esc(esame ? esame.nome : '')}" placeholder="es. Psicologia dello sviluppo — scritto" autofocus></label>
                    <label class="campo"><span>Data</span>
                        <input type="date" name="data" value="${esc(esame ? esame.data : chiaveGiorno(aggiungiGiorni(Date.now(), 30)))}"></label>
                    <label class="campo"><span>Materia collegata <em>facoltativa</em></span>
                        <select name="materia">${opzioniMaterie(esame ? esame.materiaId : null, { conNessuna: true, conNuova: false })}</select></label>
                    <label class="campo"><span>Note <em>facoltative</em></span>
                        <textarea name="note" rows="2" maxlength="400" placeholder="Aula, programma, modalità…">${esc(esame ? esame.note : '')}</textarea></label>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    {
                        testo: esame && esame.id ? 'Salva' : 'Aggiungi esame', classe: 'btn-primario', principale: true, clic: m => {
                            const nome = $('[name=nome]', m.el), data = $('[name=data]', m.el);
                            if (!nome.value.trim()) { segnalaErrore(nome, "Dai un nome all'esame"); return; }
                            if (!data.value) { segnalaErrore(data, 'Scegli la data'); return; }
                            risultato = { nome: nome.value, data: data.value, materiaId: $('[name=materia]', m.el).value || null, note: $('[name=note]', m.el).value };
                            m.chiudi();
                        },
                    },
                ],
                alChiudere: () => risolvi(risultato),
            });
        });
    }

    function opzioniSet(selezionato) {
        return Dati.materie().map(m => {
            const albero = Dati.alberoSet(m.id);
            if (!albero.length) return '';
            return `<optgroup label="${esc(m.emoji + ' ' + m.nome)}">${albero.map(n =>
                `<option value="${n.set.id}" ${n.set.id === selezionato ? 'selected' : ''}>${rientroOpzione(n.livello)}${esc(n.set.nome)}</option>`).join('')}</optgroup>`;
        }).join('');
    }

    // Chiede in quale set lavorare; se non ce n'è nessuno propone di crearlo
    async function scegliSet({ titolo = 'Scegli il set', testoOk = 'Continua' } = {}) {
        if (!Dati.tuttiSet().length) {
            const s = await nuovoSet();
            return s ? s.id : null;
        }
        const scelta = await new Promise(risolvi => {
            let risultato = null;
            const recente = (Dati.setRecenti(1)[0] || {}).id;
            modale({
                titolo, classe: 'modale-piccola',
                corpo: `
                    <label class="campo"><span>Set di flashcard</span>
                        <select name="set">${opzioniSet(recente)}<option value="__nuovo">＋ Nuovo set…</option></select></label>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    { testo: testoOk, classe: 'btn-primario', principale: true, clic: m => { risultato = $('[name=set]', m.el).value; m.chiudi(); } },
                ],
                alChiudere: () => risolvi(risultato),
            });
        });
        if (scelta === '__nuovo') {
            const s = await nuovoSet();
            return s ? s.id : null;
        }
        return scelta;
    }

    // ---- Pulsante "Crea" -----------------------------------------------

    async function nuovaFlashcard() {
        const contesto = App.contesto || {};
        const setId = contesto.setId || await scegliSet({ titolo: 'Dove vuoi aggiungere la flashcard?' });
        if (setId) Router.vai(`/carta/nuova?set=${setId}`);
    }

    function crea() {
        const voci = [
            { chiave: 'carta', icona: 'carte', titolo: 'Flashcard', testo: 'Scrivi una nuova carta' },
            { chiave: 'set', icona: 'cartella', titolo: 'Set di flashcard', testo: 'Raggruppa le carte di un argomento' },
            { chiave: 'materia', icona: 'libro', titolo: 'Materia', testo: 'Contiene i set di un esame o corso' },
            { chiave: 'mappa', icona: 'mappa', titolo: 'Mappa mentale', testo: 'Rami, colori e immagini, come SimpleMind' },
            { chiave: 'importa', icona: 'carica', titolo: 'Importa flashcard', testo: 'Da Excel o CSV' },
        ];
        modale({
            titolo: 'Crea', classe: 'modale-piccola',
            corpo: `<div class="griglia-crea">${voci.map(v => `
                <button type="button" class="tessera-crea" data-crea-voce="${v.chiave}">
                    <span class="tessera-icona">${ico(v.icona)}</span>
                    <b>${v.titolo}</b><small>${v.testo}</small>
                </button>`).join('')}</div>`,
            alApri: (el, m) => el.addEventListener('click', async e => {
                const b = e.target.closest('[data-crea-voce]');
                if (!b) return;
                m.chiudi();
                const contesto = App.contesto || {};
                switch (b.dataset.creaVoce) {
                    case 'carta': nuovaFlashcard(); break;
                    case 'set': { const s = await nuovoSet(contesto.materiaId); if (s) Router.vai('/set/' + s.id); break; }
                    case 'materia': { const mat = await nuovaMateria(); if (mat) Router.vai('/materia/' + mat.id); break; }
                    case 'mappa': Viste.mappe.nuova(); break;
                    case 'importa': Importa.apriDialogo({ setId: contesto.setId }); break;
                }
            }),
        });
    }

    return {
        ico, collegaAzioni, toast, segnalaErrore, modale, conferma, finestraAperta, menu, chiudiMenu,
        classeApribile, titoloApribile, apriSezione,
        barraStato, legendaStato, percentuale, anello, vuoto, emblema, tesseraSet, pannelloStudio, rigaCarta, anteprimaRisposta, tronca, menuValutazione,
        formMateria, nuovaMateria, formSet, nuovoSet, formEsame, opzioniMaterie, opzioniSet, rientroOpzione, scegliSet,
        nuovaFlashcard, crea,
    };
})();
