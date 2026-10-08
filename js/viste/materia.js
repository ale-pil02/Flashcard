// Materia: avanzamento complessivo, riquadro Studia e i suoi set principali
// (i sotto-set si aprono dentro ciascun set).

Viste.materia = {
    nav: 'libreria',
    titolo: 'Materia',

    mostra(el, params) {
        const ico = Ui.ico;
        const m = Dati.materia(params.id);
        if (!m) {
            el.innerHTML = `<div class="pagina">${Ui.vuoto({ icona: 'avviso', titolo: 'Materia non trovata', azioni: `<a class="btn btn-secondario" href="#/libreria">Torna alla libreria</a>` })}</div>`;
            return;
        }
        App.contesto = { materiaId: m.id };
        document.title = m.nome + ' · Flashcard';

        const sets = Dati.setRadice(m.id);
        const tuttiSet = Dati.setDiMateria(m.id).length;
        const carte = Dati.carteDiMateria(m.id);
        const c = Dati.conteggi(carte);

        el.innerHTML = `
            <div class="pagina">
                <nav class="briciole"><a href="#/libreria">Libreria</a>${ico('destra')}<span>${esc(m.nome)}</span></nav>
                <header class="pagina-testa">
                    <div class="testa-titolo">
                        ${Ui.emblema(m, true)}
                        <div>
                            <h1>${esc(m.nome)}</h1>
                            <p class="sottotitolo">${plurale(tuttiSet, 'set', 'set')} · ${plurale(c.totale, 'flashcard', 'flashcard')}${c.daRipassare ? ` · <span class="da-ripassare">${c.daRipassare} da ripassare</span>` : ''}</p>
                        </div>
                    </div>
                    <div class="azioni-testa">
                        <button type="button" class="btn-icona btn-bordo" data-azione="menu" aria-label="Altre azioni">${ico('altro')}</button>
                    </div>
                </header>

                ${c.totale ? `
                <section class="riquadro riquadro-avanzamento">
                    <div class="avanzamento-testa"><span><b>${Ui.percentuale(c.imparate, c.totale)}%</b> delle carte imparate</span></div>
                    ${Ui.barraStato(c, { alta: true })}
                    ${Ui.legendaStato(c)}
                </section>
                ${Ui.pannelloStudio(carte)}` : ''}

                <section class="sezione">
                    <div class="sezione-testa">
                        <h2>Set di flashcard</h2>
                        <button type="button" class="btn btn-secondario btn-piccolo" data-azione="nuovo-set">${ico('piu')}Nuovo set</button>
                    </div>
                    ${sets.length ? `<div class="griglia-set">${sets.map(s => Ui.tesseraSet(s, { conMateria: false })).join('')}</div>`
                        : Ui.vuoto({
                            icona: 'cartella', titolo: 'Nessun set in questa materia',
                            testo: 'Un set raccoglie le flashcard di un argomento, un capitolo o una lezione, e può contenere sotto-set.',
                            azioni: `<button type="button" class="btn btn-primario" data-azione="nuovo-set">${ico('piu')}Crea un set</button>
                                     <button type="button" class="btn btn-secondario" data-azione="importa">${ico('carica')}Importa</button>`,
                        })}
                </section>
            </div>`;

        Ui.collegaAzioni(el, {
            personalizza: () => Viste.studio.personalizza({ materiaId: m.id }),
            menu: b => this.menu(b, m, () => App.ridisegna()),
            'nuovo-set': async () => { const s = await Ui.nuovoSet(m.id); if (s) Router.vai('/set/' + s.id); },
            importa: () => Importa.apriDialogo(),
        });
    },

    // Menu della materia, usato anche dalla Libreria
    menu(ancora, m, dopo) {
        if (!m) return;
        Ui.menu(ancora, [
            { testo: 'Modifica materia', icona: 'matita', clic: async () => {
                const dati = await Ui.formMateria(m);
                if (dati) { Dati.aggiornaMateria(m.id, dati); dopo(); }
            } },
            { testo: 'Nuovo esame per questa materia', icona: 'calendario', clic: async () => {
                const dati = await Ui.formEsame({ nome: m.nome, data: chiaveGiorno(aggiungiGiorni(Date.now(), 30)), materiaId: m.id, note: '' });
                if (dati) { Dati.creaEsame(dati); Ui.toast('Esame aggiunto al piano di studio', 'successo'); }
            } },
            '-',
            { testo: 'Elimina materia', icona: 'cestino', pericolo: true, clic: async () => {
                const sets = Dati.setDiMateria(m.id);
                const carte = Dati.carteDiMateria(m.id);
                const ok = await Ui.conferma(
                    `Elimini <b>${esc(m.nome)}</b> con ${plurale(sets.length, 'set', 'set')} e ${plurale(carte.length, 'flashcard', 'flashcard')}? Non si può annullare.`,
                    { titolo: 'Eliminare la materia?', ok: 'Elimina', pericolo: true });
                if (!ok) return;
                Dati.eliminaMateria(m.id);
                Ui.toast('Materia eliminata');
                if (App.rottaAttiva && App.rottaAttiva.vista === 'materia') Router.vai('/libreria'); else dopo();
            } },
        ]);
    },
};
