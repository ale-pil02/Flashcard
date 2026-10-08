// Statistiche: carte di oggi, tempo di studio, attività giornaliera, calendario,
// stato delle carte e avanzamento per materia.

Viste.statistiche = {
    nav: 'statistiche',
    titolo: 'Statistiche',
    periodo: 7,

    mostra(el) {
        const ico = Ui.ico;
        const attivita = Dati.attivitaPerGiorno();
        const oggi = Dati.oggi(attivita);
        const c = Dati.conteggi(Dati.tutteLeCarte());
        let durata7 = 0, carte7 = 0;
        for (let i = 0; i < 7; i++) {
            const g = attivita.get(chiaveGiorno(aggiungiGiorni(Date.now(), -i)));
            if (g) { durata7 += g.durata; carte7 += g.carte; }
        }

        const numero = (icona, valore, testo, classe = '') => `
            <div class="riquadro numero ${classe}">
                <span class="icona-tonda">${ico(icona)}</span>
                <b>${valore}</b><small>${testo}</small>
            </div>`;

        el.innerHTML = `
            <div class="pagina">
                <header class="pagina-testa"><h1>Statistiche</h1></header>

                <section class="griglia-numeri">
                    ${numero('carte', oggi.carte, oggi.carte === 1 ? 'carta oggi' : 'carte oggi')}
                    ${numero('orologio', formattaDurata(durata7), `di studio in 7 giorni · ${carte7} carte`)}
                    ${numero('spunta', c.imparate, `imparate su ${c.totale}`)}
                </section>

                <section class="riquadro">
                    <div class="riquadro-testa">
                        <h3>Attività</h3>
                        <div class="segmentato piccolo" data-periodo>
                            <button type="button" data-valore="7" class="${this.periodo === 7 ? 'attivo' : ''}">7 giorni</button>
                            <button type="button" data-valore="30" class="${this.periodo === 30 ? 'attivo' : ''}">30 giorni</button>
                        </div>
                    </div>
                    <div data-grafico>${this.grafico(attivita, this.periodo)}</div>
                    <div class="legenda">${Srs.VALUTAZIONI.slice().reverse().map(v =>
                        `<span class="voce-legenda"><i class="pallino pallino-${v.chiave}"></i>${v.nome}</span>`).join('')}</div>
                </section>

                <section class="riquadro">
                    <div class="riquadro-testa"><h3>Calendario</h3><span class="nota">ultime 20 settimane</span></div>
                    ${this.calendario(attivita)}
                </section>

                <section class="riquadro">
                    <div class="riquadro-testa"><h3>Stato delle carte</h3><span class="nota">${plurale(c.totale, 'flashcard', 'flashcard')}</span></div>
                    ${Ui.barraStato(c, { alta: true })}
                    ${Ui.legendaStato(c)}
                </section>

                <section class="riquadro">
                    <div class="riquadro-testa"><h3>Per materia</h3></div>
                    ${this.perMateria()}
                </section>
            </div>`;

        $('[data-periodo]', el).addEventListener('click', e => {
            const b = e.target.closest('[data-valore]');
            if (!b) return;
            this.periodo = +b.dataset.valore;
            $$('[data-periodo] button', el).forEach(x => x.classList.toggle('attivo', x === b));
            $('[data-grafico]', el).innerHTML = this.grafico(attivita, this.periodo);
        });
    },

    grafico(attivita, giorni) {
        const vuoto = { carte: 0, durata: 0, valutazioni: [0, 0, 0, 0] };
        const dati = [];
        for (let i = giorni - 1; i >= 0; i--) {
            const ts = aggiungiGiorni(Date.now(), -i);
            dati.push({ ts, ...(attivita.get(chiaveGiorno(ts)) || vuoto) });
        }
        // Margine sopra la colonna più alta per il numero che la sovrasta
        const massimo = Math.max(...dati.map(d => d.carte), 1) * 1.15;
        const etichetta = (d, i) => giorni <= 7 ? FMT_SETTIMANA.format(d.ts)
            : (i % 5 === 0 || i === dati.length - 1 ? new Date(d.ts).getDate() : '');
        return `
            <div class="grafico">
                <div class="grafico-aree">
                    ${dati.map(d => `
                        <div class="grafico-area" title="${esc(formattaData(d.ts, true))}: ${plurale(d.carte, 'carta', 'carte')} · ${formattaDurata(d.durata)}">
                            ${d.carte ? `<span class="grafico-valore">${d.carte}</span>` : ''}
                            <div class="grafico-pila" style="height:${d.carte / massimo * 100}%">
                                ${[3, 2, 1, 0].map(v => d.valutazioni[v] ? `<span class="seg-${Srs.VALUTAZIONI[v].chiave}" style="flex:${d.valutazioni[v]}"></span>` : '').join('')}
                            </div>
                        </div>`).join('')}
                </div>
                <div class="grafico-etichette">${dati.map((d, i) => `<span>${etichetta(d, i)}</span>`).join('')}</div>
            </div>`;
    },

    // Griglia stile GitHub: una colonna per settimana, colore in base al giorno con più carte del periodo
    calendario(attivita) {
        const SETTIMANE = 20;
        const oggi = inizioGiorno();
        const giornoSettimana = (new Date(oggi).getDay() + 6) % 7;   // 0 = lunedì
        const inizio = aggiungiGiorni(oggi, -giornoSettimana - (SETTIMANE - 1) * 7);
        let piu = 1;
        for (let i = 0; i < SETTIMANE * 7; i++) { const g = attivita.get(chiaveGiorno(aggiungiGiorni(inizio, i))); if (g) piu = Math.max(piu, g.carte); }
        const celle = [];
        for (let i = 0; i < SETTIMANE * 7; i++) {
            const ts = aggiungiGiorni(inizio, i);
            if (ts > oggi) { celle.push('<span class="cella futuro"></span>'); continue; }
            const g = attivita.get(chiaveGiorno(ts));
            const n = g ? g.carte : 0;
            const livello = !n ? 0 : Math.min(4, Math.ceil(n / piu * 4));
            celle.push(`<span class="cella l${livello}" title="${esc(formattaData(ts, true))}: ${plurale(n, 'carta', 'carte')}"></span>`);
        }
        return `
            <div class="calendario">
                <div class="calendario-giorni"><span>Lun</span><span></span><span>Mer</span><span></span><span>Ven</span><span></span><span></span></div>
                <div class="calendario-griglia">${celle.join('')}</div>
            </div>
            <div class="calendario-legenda">Meno <span class="cella l0"></span><span class="cella l1"></span><span class="cella l2"></span><span class="cella l3"></span><span class="cella l4"></span> Più</div>`;
    },

    perMateria() {
        const materie = Dati.materie();
        if (!materie.length) return '<p class="nota">Nessuna materia ancora.</p>';
        return `
            <div class="tabella-scorrevole"><table class="tabella">
                <thead><tr><th>Materia</th><th class="num">Carte</th><th class="num">Imparate</th><th class="num">Da ripassare</th><th class="col-barra">Avanzamento</th></tr></thead>
                <tbody>${materie.map(m => {
                    const c = Dati.conteggi(Dati.carteDiMateria(m.id));
                    return `<tr>
                        <td><a href="#/materia/${m.id}">${esc(m.emoji)} ${esc(m.nome)}</a></td>
                        <td class="num">${c.totale}</td>
                        <td class="num">${Ui.percentuale(c.imparate, c.totale)}%</td>
                        <td class="num">${c.daRipassare}</td>
                        <td class="col-barra">${Ui.barraStato(c)}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>`;
    },
};
