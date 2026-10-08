// Mappe: la sezione con tutte le mappe mentali (anteprime filtrabili per materia). Da qui se ne crea una nuova
// o se ne importa una da SimpleMind (.smmx), OPML o testo rientrato; l'editor è in js/mappe/editor.js.

Viste.mappe = {
    nav: 'mappe',
    titolo: 'Mappe',
    filtro: 'tutte',   // 'tutte' | 'nessuna' | id di una materia

    mostra(el) {
        const ico = Ui.ico;
        const mappe = Mappe.tutte();
        const materie = Dati.materie().filter(mat => mappe.some(x => x.materiaId === mat.id));
        const senza = mappe.filter(x => !x.materiaId || !Dati.materia(x.materiaId));
        if (this.filtro !== 'tutte' && this.filtro !== 'nessuna' && !materie.some(mat => mat.id === this.filtro)) this.filtro = 'tutte';
        const visibili = this.filtro === 'tutte' ? mappe
            : this.filtro === 'nessuna' ? senza : mappe.filter(x => x.materiaId === this.filtro);
        // Le materie che hanno mappe ma non più la loro "link argomenti" (eliminata): un riquadro per ricrearla
        const daRicreare = Panoramica.mancanti().filter(mat => this.filtro === 'tutte' || this.filtro === mat.id);
        const schede = [
            { id: 'tutte', testo: 'Tutte', conto: mappe.length },
            ...materie.map(mat => ({ id: mat.id, testo: `${mat.emoji} ${mat.nome}`, conto: mappe.filter(x => x.materiaId === mat.id).length })),
            senza.length && materie.length ? { id: 'nessuna', testo: 'Senza materia', conto: senza.length } : null,
        ].filter(Boolean);

        el.innerHTML = `
            <div class="pagina pagina-larga">
                <header class="pagina-testa">
                    <div>
                        <h1>Mappe mentali</h1>
                        <p class="sottotitolo">Crea, modifica e ripassa le tue mappe; importa quelle di SimpleMind con stili, icone e immagini</p>
                    </div>
                    <div class="azioni-testa">
                        <button type="button" class="btn btn-secondario" data-azione="importa">${ico('carica')}<span>Importa</span></button>
                        <button type="button" class="btn btn-primario" data-azione="nuova">${ico('piu')}<span>Nuova mappa</span></button>
                    </div>
                </header>
                ${mappe.length && schede.length > 1 ? `<nav class="schede-rev" role="tablist">${schede.map(s => `
                    <button type="button" role="tab" class="scheda-rev${this.filtro === s.id ? ' attiva' : ''}" data-filtro="${esc(s.id)}" aria-selected="${this.filtro === s.id}">${esc(s.testo)} <span class="conteggio">${s.conto}</span></button>`).join('')}</nav>` : ''}
                ${visibili.length ? `<div class="griglia-mappe">${visibili.map(x => this.tessera(x)).join('')}${daRicreare.map(mat => `
                    <button type="button" class="tessera-mappa tessera-ricrea" data-ricrea-panoramica="${mat.id}" title="La mappa d'insieme della materia, tenuta dall'app: titolo, sottorami e concetti principali di tutte le sue mappe">
                        <span class="tessera-ricrea-icona">${ico('piu')}</span>
                        <b>Crea «${esc(Panoramica.NOME)}»</b>
                        <small>${esc(mat.emoji)} ${esc(mat.nome)} · mappa d'insieme della materia, tenuta dall'app</small>
                    </button>`).join('')}</div>`
                    : Ui.vuoto({
                        icona: 'mappa', titolo: 'Nessuna mappa',
                        testo: 'Una mappa mentale raccoglie un argomento in rami: parti dal tema centrale e aggiungi i nodi con Tab e Invio. Puoi anche importare le mappe di SimpleMind (.smmx), un file OPML o un elenco rientrato.',
                        azioni: `<button type="button" class="btn btn-primario" data-azione="nuova">${ico('piu')}Crea una mappa</button>
                                 <button type="button" class="btn btn-secondario" data-azione="importa">${ico('carica')}Importa</button>`,
                    })}
            </div>`;

        Ui.collegaAzioni(el, {
            nuova: () => this.nuova(),
            importa: () => this.importa(),
        });
        el.addEventListener('click', e => {
            const f = e.target.closest('[data-filtro]');
            if (f) { this.filtro = f.dataset.filtro; App.ridisegna(); return; }
            const r = e.target.closest('[data-ricrea-panoramica]');
            if (r) {
                const nuova = Panoramica.crea(r.dataset.ricreaPanoramica);
                if (nuova) { Ui.toast(`Mappa «${Panoramica.NOME}» creata`, 'successo'); Router.vai('/mappa/' + nuova.id); }
                return;
            }
            const b = e.target.closest('[data-menu-mappa]');
            if (b) { e.preventDefault(); this.menu(b, Mappe.mappa(b.dataset.menuMappa)); }
        });
    },

    tessera(x) {
        const mat = x.materiaId && Dati.materia(x.materiaId);
        const s = x.setId && Dati.set(x.setId);
        const dove = [mat ? `${mat.emoji} ${mat.nome}` : '', s ? s.nome : ''].filter(Boolean).join(' › ');
        const anteprima = x.anteprima && /^<svg[\s>]/.test(x.anteprima)
            ? `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(x.anteprima)}" alt="" loading="lazy">`
            : `<span class="anteprima-vuota">${Ui.ico('mappa')}</span>`;
        return `
            <article class="tessera-mappa">
                <a class="anteprima-mappa" href="#/mappa/${x.id}" aria-label="Apri ${esc(x.nome)}">${anteprima}</a>
                <div class="tessera-mappa-piede">
                    <div class="tessera-mappa-testo">
                        <a class="tessera-mappa-nome" href="#/mappa/${x.id}">${esc(x.nome)}</a>
                        ${x.panoramica ? `<span class="chip chip-panoramica" title="Mappa d'insieme della materia: la tiene l'app">${Ui.ico('mappa')}d'insieme</span>` : ''}
                        <small>${dove ? esc(dove) + ' · ' : ''}${plurale(Mappe.contaNodi(x), 'nodo', 'nodi')} · modificata ${esc(distanzaGiorni(x.modificata || x.creata))}</small>
                    </div>
                    <button type="button" class="btn-icona" data-menu-mappa="${x.id}" aria-label="Altre azioni">${Ui.ico('altro')}</button>
                </div>
            </article>`;
    },

    menu(ancora, x) {
        if (!x) return;
        Ui.menu(ancora, [
            { testo: 'Apri', icona: 'mappa', clic: () => Router.vai('/mappa/' + x.id) },
            { testo: 'Nome, materia e set', icona: 'matita', clic: () => this.proprieta(x, () => App.ridisegna()) },
            { testo: 'Duplica', icona: 'copia', clic: () => { Mappe.duplica(x.id); Ui.toast('Mappa duplicata', 'successo'); App.ridisegna(); } },
            { testo: 'Esporta in OPML', icona: 'scarica', clic: () => scaricaFile(nomeFileSicuro(x.nome) + '.opml', FileMappe.inOpml(x), 'text/x-opml') },
            '-',
            { testo: 'Elimina', icona: 'cestino', pericolo: true, clic: async () => {
                const ok = await Ui.conferma(`Elimini <b>${esc(x.nome)}</b> con i suoi ${plurale(Mappe.contaNodi(x), 'nodo', 'nodi')}? Non si può annullare.${x.panoramica
                    ? ` Potrai ricrearla dalla sezione Mappe (riquadro «Crea ${esc(Panoramica.NOME)}»): i nodi tornano dalle mappe della materia, ma aspetto, posizioni e nodi aggiunti qui si perdono.` : ''}`,
                    { titolo: 'Eliminare la mappa?', ok: 'Elimina', pericolo: true });
                if (!ok) return;
                Mappe.elimina(x.id);
                Ui.toast('Mappa eliminata');
                App.ridisegna();
            } },
        ]);
    },

    // Campi "Materia" e "Set" (il set dipende dalla materia scelta)
    campiPosto(materiaId, setId) {
        return `
            <div class="riga-campi">
                <label class="campo"><span>Materia</span>
                    <select name="materia">${Ui.opzioniMaterie(materiaId, { conNessuna: true, conNuova: false })}</select></label>
                <label class="campo"><span>Set <em>facoltativo</em></span>
                    <select name="set">${this.opzioniSet(materiaId, setId)}</select></label>
            </div>`;
    },

    opzioniSet(materiaId, setId) {
        return `<option value="">— Nessuno —</option>` + (materiaId ? Dati.alberoSet(materiaId) : []).map(n =>
            `<option value="${n.set.id}" ${n.set.id === setId ? 'selected' : ''}>${Ui.rientroOpzione(n.livello)}${esc(n.set.nome)}</option>`).join('');
    },

    collegaPosto(el) {
        const mat = $('[name=materia]', el), set = $('[name=set]', el);
        mat.addEventListener('change', () => { set.innerHTML = this.opzioniSet(mat.value, null); });
    },

    leggiPosto(el) {
        const materiaId = $('[name=materia]', el).value || null;
        const setId = $('[name=set]', el).value || null;
        return { materiaId, setId: materiaId ? setId : null };
    },

    // Materia e set di partenza: quelli della pagina da cui si arriva o del filtro attivo
    postoIniziale() {
        const c = App.contesto || {};
        const materiaId = c.materiaId || (Dati.materia(this.filtro) ? this.filtro : null);
        return { materiaId, setId: c.setId || null };
    },

    nuova() {
        const posto = this.postoIniziale();
        Ui.modale({
            titolo: 'Nuova mappa mentale', classe: 'modale-piccola',
            corpo: `
                <label class="campo"><span>Tema centrale</span>
                    <input type="text" name="nome" maxlength="120" placeholder="es. Sviluppo delle emozioni" autofocus></label>
                ${this.campiPosto(posto.materiaId, posto.setId)}`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Crea', classe: 'btn-primario', principale: true, clic: md => {
                    const nome = $('[name=nome]', md.el);
                    if (!nome.value.trim()) { Ui.segnalaErrore(nome, 'Scrivi il tema centrale'); return; }
                    const x = Mappe.crea({ nome: nome.value, ...this.leggiPosto(md.el) });
                    md.chiudi();
                    Router.vai('/mappa/' + x.id);
                } },
            ],
            alApri: el => this.collegaPosto(el),
        });
    },

    proprieta(x, dopo) {
        Ui.modale({
            titolo: 'Nome, materia e set', classe: 'modale-piccola',
            corpo: `
                <label class="campo"><span>Nome della mappa</span>
                    <input type="text" name="nome" maxlength="120" value="${esc(x.nome)}" autofocus></label>
                ${this.campiPosto(x.materiaId, x.setId)}`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Salva', classe: 'btn-primario', principale: true, clic: md => {
                    const nome = $('[name=nome]', md.el);
                    if (!nome.value.trim()) { Ui.segnalaErrore(nome, 'Dai un nome alla mappa'); return; }
                    Object.assign(x, { nome: nome.value.trim(), ...this.leggiPosto(md.el) });
                    Mappe.salva(x);
                    md.chiudi();
                    if (dopo) dopo();
                } },
            ],
            alApri: el => this.collegaPosto(el),
        });
    },

    async importa() {
        const file = await scegliFile('.smmx,.opml,.xml,.txt,.md,.markdown');
        if (!file) return;
        const smmx = /\.smmx$/i.test(file.name);
        const posto = this.postoIniziale();
        Ui.modale({
            titolo: 'Importa la mappa', classe: 'modale-piccola',
            corpo: `
                <p class="nota">${Ui.ico('documento')} <b>${esc(file.name)}</b></p>
                <label class="campo"><span>Nome della mappa <em>vuoto = quello del file</em></span>
                    <input type="text" name="nome" maxlength="120" placeholder="${esc(file.name.replace(/\.[^.]+$/, ''))}"></label>
                ${this.campiPosto(posto.materiaId, posto.setId)}
                ${smmx ? `
                <label class="spunta-riga">
                    <input type="checkbox" name="posizioni">
                    <span><b>Tieni le posizioni di SimpleMind</b>
                        <small>I nodi restano esattamente dove li avevi messi (disposizione libera). Senza spunta l'app li ordina da sola, con lo stesso lato e lo stesso ordine dei rami.</small></span>
                </label>` : ''}`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Importa', classe: 'btn-primario', principale: true, clic: async md => {
                    const pulsante = $('.modale-piede .btn-primario', md.el);
                    pulsante.disabled = true;
                    pulsante.textContent = 'Importo…';
                    try {
                        const nome = $('[name=nome]', md.el).value.trim();
                        const posizioni = $('[name=posizioni]', md.el);
                        const x = await FileMappe.daFile(file, { nome, posizioniOriginali: !!(posizioni && posizioni.checked) });
                        if (nome) x.nome = nome;
                        Object.assign(x, this.leggiPosto(md.el));
                        Mappe.aggiungi(x);
                        md.chiudi();
                        Ui.toast(`Mappa importata: ${plurale(Mappe.contaNodi(x), 'nodo', 'nodi')}`, 'successo');
                        Router.vai('/mappa/' + x.id);
                    } catch (e) {
                        console.error(e);
                        Ui.toast('Non riesco a importare il file: ' + e.message, 'errore', 6000);
                        pulsante.disabled = false;
                        pulsante.textContent = 'Importa';
                    }
                } },
            ],
            alApri: el => this.collegaPosto(el),
        });
    },
};
