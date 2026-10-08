// Piano di studio: date degli esami con conto alla rovescia e avanzamento della materia collegata.

Viste.piano = {
    nav: 'piano',
    titolo: 'Piano di studio',

    mostra(el) {
        const ico = Ui.ico;
        const oggi = chiaveGiorno();
        const esami = Dati.esami();
        const futuri = esami.filter(e => e.data >= oggi);
        const passati = esami.filter(e => e.data < oggi).reverse();

        el.innerHTML = `
            <div class="pagina">
                <header class="pagina-testa">
                    <div>
                        <h1>Piano di studio</h1>
                        <p class="sottotitolo">Segna le date degli esami e tieni d'occhio quanto manca</p>
                    </div>
                    <div class="azioni-testa">
                        <button type="button" class="btn btn-primario" data-azione="nuovo">${ico('piu')}<span>Nuovo esame</span></button>
                    </div>
                </header>
                ${futuri.length ? `<div class="lista-esami">${futuri.map(e => this.tesseraEsame(e)).join('')}</div>`
                    : Ui.vuoto({
                        icona: 'calendario', titolo: 'Nessun esame in programma',
                        testo: 'Aggiungi la data di un esame e collegalo a una materia: vedrai il conto alla rovescia e quanto ti manca da imparare.',
                        azioni: `<button type="button" class="btn btn-primario" data-azione="nuovo">${ico('piu')}Aggiungi un esame</button>`,
                    })}
                ${passati.length ? `
                    <details class="sezione esami-passati">
                        <summary><h2>Esami passati <span class="conteggio">${passati.length}</span></h2></summary>
                        <div class="lista-esami">${passati.map(e => this.tesseraEsame(e)).join('')}</div>
                    </details>` : ''}
            </div>`;

        Ui.collegaAzioni(el, {
            nuovo: async () => { const d = await Ui.formEsame(); if (d) { Dati.creaEsame(d); App.ridisegna(); } },
            'menu-esame': b => this.menuEsame(b),
        });
    },

    tesseraEsame(e) {
        const ico = Ui.ico;
        const ts = daChiaveGiorno(e.data);
        const n = giorniTra(Date.now(), ts);
        const m = e.materiaId ? Dati.materia(e.materiaId) : null;
        const c = m ? Dati.conteggi(Dati.carteDiMateria(m.id)) : null;
        return `
            <div class="tessera tessera-esame${n < 0 ? ' passato' : ''}${n >= 0 && n <= 7 ? ' vicino' : ''}" style="--c:${m ? esc(m.colore) : 'var(--primario)'}">
                <div class="conto-rovescia">
                    <b>${n < 0 ? ico('spunta') : n}</b>
                    <small>${n < 0 ? 'fatto' : n === 0 ? 'oggi!' : n === 1 ? 'giorno' : 'giorni'}</small>
                </div>
                <div class="tessera-esame-corpo">
                    <h3>${esc(e.nome)}</h3>
                    <p class="tessera-meta">${esc(formattaData(ts))} · ${distanzaGiorni(ts)}${m ? ` · ${esc(m.emoji)} ${esc(m.nome)}` : ''}</p>
                    ${c && c.totale ? `${Ui.barraStato(c)}<p class="tessera-percentuale">${Ui.percentuale(c.imparate, c.totale)}% imparate${c.daRipassare ? ` · ${c.daRipassare} da ripassare` : ''}</p>` : ''}
                    ${e.note ? `<p class="nota">${esc(e.note)}</p>` : ''}
                </div>
                <div class="tessera-esame-azioni">
                    ${m && c.totale && n >= 0 ? `<a class="btn btn-secondario btn-piccolo" href="#/studio?materia=${m.id}">${ico('fulmine')}Studia</a>` : ''}
                    <button type="button" class="btn-icona" data-azione="menu-esame" data-id="${e.id}" aria-label="Altre azioni">${ico('altro')}</button>
                </div>
            </div>`;
    },

    menuEsame(ancora) {
        const e = Dati.esame(ancora.dataset.id);
        if (!e) return;
        Ui.menu(ancora, [
            { testo: 'Modifica', icona: 'matita', clic: async () => {
                const d = await Ui.formEsame(e);
                if (d) { Dati.aggiornaEsame(e.id, d); App.ridisegna(); }
            } },
            { testo: 'Elimina', icona: 'cestino', pericolo: true, clic: async () => {
                const ok = await Ui.conferma(`Elimini l'esame <b>${esc(e.nome)}</b>?`, { titolo: "Eliminare l'esame?", ok: 'Elimina', pericolo: true });
                if (ok) { Dati.eliminaEsame(e.id); App.ridisegna(); }
            } },
        ]);
    },
};
