// Home: argomenti da rivedere, set recenti, prossimi esami.

Viste.home = {
    nav: 'home',
    titolo: 'Home',

    mostra(el) {
        const ico = Ui.ico;
        const imp = Dati.impostazioni();
        const carte = Dati.tutteLeCarte();
        const recenti = Dati.setRecenti(4);
        const esami = Dati.prossimiEsami().slice(0, 3);
        const argomenti = Dati.tuttiGliArgomenti();
        const daRivedere = argomenti.filter(Revisioni.daRipassare).sort(Revisioni.perUrgenza);
        const carteDaFare = Revisioni.carteDevianti().filter(Revisioni.cartaDaRipassare).length;
        const ora = new Date().getHours();
        const saluto = ora < 5 ? 'Buonanotte' : ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';

        const testa = `
            <header class="pagina-testa">
                <div>
                    <p class="sopratitolo">${esc(FMT_OGGI.format(new Date()))}</p>
                    <h1>${saluto}${imp.nome ? ', ' + esc(imp.nome) : ''}! 👋</h1>
                </div>
            </header>`;

        if (!carte.length) {
            el.innerHTML = `
                <div class="pagina">
                    ${testa}
                    <section class="riquadro benvenuto">
                        <div class="benvenuto-testo">
                            <h2>Iniziamo a studiare</h2>
                            <p>Crea una materia, aggiungi un set di flashcard e studiale con la ripetizione spaziata:
                               l'app ti ripropone ogni carta proprio quando stai per dimenticarla.</p>
                            <div class="azioni-riga">
                                <button type="button" class="btn btn-primario" data-azione="nuovo-set">${ico('piu')}Crea il primo set</button>
                                <button type="button" class="btn btn-secondario" data-azione="importa">${ico('carica')}Importa da Excel</button>
                            </div>
                            <button type="button" class="link link-pulsante" data-azione="prova">${ico('stella')}Oppure prova l'app con dei dati di esempio</button>
                        </div>
                        <div class="benvenuto-carte" aria-hidden="true">
                            <span class="carta-deco c1"></span><span class="carta-deco c2"></span><span class="carta-deco c3">?</span>
                        </div>
                    </section>
                </div>`;
            Ui.collegaAzioni(el, {
                'nuovo-set': async () => { const s = await Ui.nuovoSet(); if (s) Router.vai('/carta/nuova?set=' + s.id); },
                importa: () => Importa.apriDialogo(),
                prova: () => { if (DatiProva.carica()) App.ridisegna(); },
            });
            return;
        }

        el.innerHTML = `
            <div class="pagina">
                ${testa}
                ${argomenti.length ? `
                <section class="sezione">
                    <div class="sezione-testa"><h2>Revisioni di oggi ${daRivedere.length ? `<span class="conteggio">${daRivedere.length}</span>` : ''}</h2><a href="#/revisioni" class="link">Revisioni${ico('destra')}</a></div>
                    ${daRivedere.length ? `<div class="riquadro lista-revisioni-home">${daRivedere.slice(0, 6).map(a => `
                        <a class="riga-revisione-home" href="#/set/${a.setId}">
                            <b>${esc(a.nome || 'Argomento')}</b><small>${esc(Revisioni.nomeSet(a.setId, true))}</small>${Revisioni.etichettaAvviso(a)}
                        </a>`).join('')}
                        ${daRivedere.length > 6 ? `<a class="riga-revisione-home" href="#/revisioni"><small>…e altri ${daRivedere.length - 6}</small></a>` : ''}</div>`
                        : `<p class="nota">Nessun argomento da rivedere oggi: il prossimo è ${(() => { const p = argomenti.filter(a => a.ultimoRipasso).sort(Revisioni.perUrgenza)[0]; return p ? `«${esc(p.nome || 'Argomento')}», ${esc(Revisioni.avviso(p).testo.toLowerCase())}` : 'ancora da segnare'; })()}.</p>`}
                    ${carteDaFare ? `<button type="button" class="link link-pulsante" data-azione="carte-devianti">${ico('carte')}${plurale(carteDaFare, 'flashcard da ripassare', 'flashcard da ripassare')} per conto loro, prima del loro set${ico('destra')}</button>` : ''}
                </section>` : ''}

                <section class="sezione">
                    <div class="sezione-testa"><h2>Continua a studiare</h2><a href="#/libreria" class="link">Libreria${ico('destra')}</a></div>
                    <div class="griglia-set">${recenti.map(s => Ui.tesseraSet(s)).join('')}</div>
                </section>

                <section class="sezione">
                    <div class="sezione-testa"><h2>Prossimi esami</h2><a href="#/piano" class="link">Piano di studio${ico('destra')}</a></div>
                    ${esami.length ? `<div class="lista-esami">${esami.map(e => Viste.piano.tesseraEsame(e)).join('')}</div>`
                        : `<button type="button" class="riquadro riquadro-tratteggiato" data-azione="nuovo-esame">${ico('calendario')}<span>Aggiungi la data di un esame per tenere il conto alla rovescia</span></button>`}
                </section>
            </div>`;

        Ui.collegaAzioni(el, {
            'nuovo-esame': async () => { const d = await Ui.formEsame(); if (d) { Dati.creaEsame(d); App.ridisegna(); } },
            'menu-esame': b => Viste.piano.menuEsame(b),
            'carte-devianti': () => { Viste.revisioni.pannello = 'carte'; Router.vai('/revisioni'); },
        });
    },
};
