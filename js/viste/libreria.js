// Libreria: tutte le materie, con ricerca su materie, set e testo delle flashcard.
// Le flashcard trovate si possono selezionare per modificarle o eliminarle insieme (js/selezione.js).

Viste.libreria = {
    nav: 'libreria',
    titolo: 'Libreria',
    ricerca: '',
    trovate: [],   // id delle flashcard dell'ultima ricerca

    mostra(el) {
        const ico = Ui.ico;
        Selezione.prepara('libreria');
        el.innerHTML = `
            <div class="pagina">
                <header class="pagina-testa">
                    <h1>Libreria</h1>
                    <div class="azioni-testa">
                        <button type="button" class="btn btn-secondario" data-azione="importa">${ico('carica')}<span>Importa</span></button>
                        <button type="button" class="btn btn-primario" data-azione="nuova-materia">${ico('piu')}<span>Nuova materia</span></button>
                    </div>
                </header>
                <label class="ricerca">${ico('cerca')}
                    <input type="search" placeholder="Cerca materie, set e flashcard…" value="${esc(this.ricerca)}" data-ricerca aria-label="Cerca">
                </label>
                <div data-contenuto></div>
            </div>`;

        const contenuto = $('[data-contenuto]', el);
        const disegna = () => {
            this.trovate = [];
            contenuto.innerHTML = this.ricerca ? this.risultati(this.ricerca) : this.griglia();
        };
        $('[data-ricerca]', el).addEventListener('input', debounce(e => { this.ricerca = e.target.value.trim(); disegna(); }, 150));
        disegna();
        Selezione.monta(el, { tutte: () => this.trovate, ridisegna: disegna });

        Ui.collegaAzioni(el, {
            importa: () => Importa.apriDialogo(),
            'nuova-materia': async () => { const m = await Ui.nuovaMateria(); if (m) Router.vai('/materia/' + m.id); },
            'menu-materia': b => Viste.materia.menu(b, Dati.materia(b.dataset.id), () => App.ridisegna()),
        });
    },

    griglia() {
        const materie = Dati.materie();
        if (!materie.length) {
            return Ui.vuoto({
                icona: 'libreria', titolo: 'La tua libreria è vuota',
                testo: 'Le materie raccolgono i set di flashcard di un esame o di un corso.',
                azioni: `<button type="button" class="btn btn-primario" data-azione="nuova-materia">${Ui.ico('piu')}Crea una materia</button>
                         <button type="button" class="btn btn-secondario" data-azione="importa">${Ui.ico('carica')}Importa flashcard</button>`,
            });
        }
        return `<div class="griglia-materie">${materie.map(m => {
            const sets = Dati.setDiMateria(m.id);
            const c = Dati.conteggi(Dati.carteDiMateria(m.id));
            return `
                <div class="tessera tessera-materia" style="--c:${esc(m.colore)}">
                    <a class="tessera-copertura" href="#/materia/${m.id}" aria-label="${esc(m.nome)}"></a>
                    <div class="tessera-materia-testa">
                        ${Ui.emblema(m, true)}
                        <button type="button" class="btn-icona" data-azione="menu-materia" data-id="${m.id}" aria-label="Altre azioni">${Ui.ico('altro')}</button>
                    </div>
                    <h3>${esc(m.nome)}</h3>
                    <p class="tessera-meta">${plurale(sets.length, 'set', 'set')} · ${plurale(c.totale, 'flashcard', 'flashcard')}${c.daRipassare ? ` · <span class="da-ripassare">${c.daRipassare} da ripassare</span>` : ''}</p>
                    ${Ui.barraStato(c)}
                </div>`;
        }).join('')}
            <button type="button" class="tessera tessera-aggiungi" data-azione="nuova-materia">${Ui.ico('piu')}<span>Nuova materia</span></button>
        </div>`;
    },

    risultati(query) {
        const q = query.toLowerCase();
        const contiene = testo => testo.toLowerCase().includes(q);
        const materie = Dati.materie().filter(m => contiene(m.nome));
        const sets = Dati.tuttiSet().filter(s => contiene(s.nome) || contiene(s.descrizione || ''));
        const carte = Dati.tutteLeCarte().filter(c => contiene(testoDaHtml(c.domanda))
            || c.risposte.some(r => contiene(testoDaHtml(r.testo)))
            || c.tag.some(contiene) || contiene(c.suggerimento || ''));

        this.trovate = carte.map(c => c.id);
        if (!materie.length && !sets.length && !carte.length) {
            return Ui.vuoto({ icona: 'cerca', titolo: 'Nessun risultato', testo: `Niente corrisponde a “${esc(query)}”.` });
        }
        return `
            ${materie.length ? `<section class="sezione"><h2 class="sezione-titolo">Materie</h2><div class="lista-chip">${materie.map(m =>
                `<a class="chip chip-grande" href="#/materia/${m.id}">${esc(m.emoji)} ${esc(m.nome)}</a>`).join('')}</div></section>` : ''}
            ${sets.length ? `<section class="sezione"><h2 class="sezione-titolo">Set</h2><div class="griglia-set">${sets.map(s => Ui.tesseraSet(s)).join('')}</div></section>` : ''}
            ${carte.length ? `<section class="sezione">
                <div class="sezione-testa"><h2>Flashcard <span class="conteggio">${carte.length}</span></h2>${Selezione.pulsante()}</div>
                <div class="lista-carte riquadro">${carte.slice(0, 100).map(c => `
                    <div class="riga-sel${Selezione.classe(c.id)}" data-sel-riga="${c.id}">${Selezione.casella(c.id)}${Ui.rigaCarta(c, { conSet: true })}</div>`).join('')}</div>
                ${carte.length > 100 ? `<p class="nota">Mostro le prime 100: affina la ricerca per vedere le altre (in selezione, «Tutte» le comprende).</p>` : ''}</section>` : ''}`;
    },
};
