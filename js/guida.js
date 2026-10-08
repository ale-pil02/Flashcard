// Guida: come funzionano flashcard, valutazioni e revisioni, a passi, con le prove da toccare (le valutazioni e il
// simulatore della prossima data). I numeri vengono dalla sequenza attuale (js/srs.js), quindi la guida resta giusta
// anche se la cambi nelle Impostazioni. Si apre dalla sezione Revisioni e dalle Impostazioni.

const Guida = (() => {
    const ico = (...a) => Ui.ico(...a);
    const giorniTesto = n => plurale(n, 'giorno', 'giorni');

    // Un ripasso fatto dopo "passati" giorni con l'intervallo previsto I: { intervallo, dopo } (dopo = giorni da quel ripasso)
    function prova(I, passati, ok = false) {
        const oggi = chiaveGiorno();
        const ultimo = chiaveGiorno(aggiungiGiorni(daChiaveGiorno(oggi), -passati));
        const x = Srs.dopoRipasso({ intervallo: I, giorno: ultimo }, oggi, { ok });
        return { intervallo: x.intervallo, dopo: giorniTra(daChiaveGiorno(oggi), aggiungiGiorni(daChiaveGiorno(x.giorno), x.intervallo)) };
    }

    const PASSI = [
        {
            titolo: 'Set e flashcard',
            html: () => `
                <p>Le flashcard stanno nei <b>set</b> (e nei sotto-set) di ogni materia. Una carta può avere una <b>domanda madre</b>:
                    nello studio a cascata le figlie arrivano dopo che hai imparato la madre.</p>
                <div class="guida-schema">
                    <span>${ico('libro')}Materia</span>${ico('destra')}<span>${ico('cartella')}Set</span>${ico('destra')}<span>${ico('carte')}Flashcard</span>
                </div>
                <p>Ogni set con flashcard ha la sua riga nelle <b>Revisioni</b>: lì vedi quando ripassarlo. Anche ogni flashcard ha
                    le sue date. Sono due conti separati, che di solito vanno di pari passo.</p>`,
        },
        {
            titolo: 'Le quattro valutazioni',
            html: () => `
                <p>Nello studio vedi la domanda, giri la risposta e dici quanto bene la sapevi. Tocca una valutazione per vedere cosa
                    succede a una carta che doveva tornare dopo <b>${giorniTesto(Srs.intervalloPerRep(5))}</b> e che ripassi il giorno giusto.</p>
                <div class="valutazioni guida-valutazioni">${Srs.VALUTAZIONI.map(v =>
                    `<button type="button" class="btn-valuta valuta-${v.chiave}" data-guida-valuta="${v.valore}"><b>${v.nome}</b></button>`).join('')}</div>
                <div class="guida-esito" data-guida-esito><p class="nota">Scegli una valutazione qui sopra.</p></div>`,
            monta: box => {
                const I = Srs.intervalloPerRep(5);
                const testi = {
                    [Srs.SCARSO]: () => `<b>Scarso</b>: torna in fondo alla sessione e resta da ripassare finché non le dai almeno Ok. Il N° Rep non sale
                        e l'intervallo torna indietro di un passo: da ${giorniTesto(I)} a <b>${giorniTesto(Srs.passoIndietro(I))}</b>. Quando la recuperi, riparte da lì.`,
                    [Srs.OK]: () => `<b>Ok</b>: la sapevi così così. Torna in fondo alla sessione, il N° Rep sale e l'intervallo cresce la metà:
                        <b>${giorniTesto(prova(I, I, true).intervallo)}</b> invece di ${giorniTesto(prova(I, I).intervallo)}. Così torna un po' prima, finché non le dai Buono o Perfetto.`,
                    [Srs.BUONO]: () => `<b>Buono</b>: fatta. Il N° Rep sale e l'intervallo segue la sequenza: da ${giorniTesto(I)} a <b>${giorniTesto(prova(I, I).intervallo)}</b>.`,
                    [Srs.PERFETTO]: () => `<b>Perfetto</b>: come Buono per le date (<b>${giorniTesto(prova(I, I).intervallo)}</b>). In più conta per lo stato del set:
                        con oltre l'80% di carte Perfetto il set è «Ottimo».`,
                };
                box.addEventListener('click', e => {
                    const b = e.target.closest('[data-guida-valuta]');
                    if (!b) return;
                    $$('[data-guida-valuta]', box).forEach(x => x.classList.toggle('suggerita', x === b));
                    $('[data-guida-esito]', box).innerHTML = `<p>${testi[b.dataset.guidaValuta]()}</p>`;
                });
            },
        },
        {
            titolo: 'La sequenza degli intervalli',
            html: () => {
                const seq = Srs.anteprimaSequenza(8);
                let giorno = 0;
                return `
                    <p>Se ripassi sempre il giorno previsto, dopo ogni rep aspetti il numero successivo della sequenza
                        (adesso: <b>${esc(Srs.sequenza().join(', '))}</b>). La prima volta che ripassi un set è la rep 1.</p>
                    <div class="guida-linea">${seq.map((g, i) => {
                        const riga = `<div class="guida-tappa"><span class="guida-giorno">giorno ${giorno}</span><b>Rep ${i + 1}</b><small>poi ${giorniTesto(g)}</small></div>`;
                        giorno += g;
                        return riga;
                    }).join('')}</div>
                    <p class="nota">La sequenza si cambia in Impostazioni → Revisioni (per esempio Fibonacci o Raddoppio).</p>`;
            },
        },
        {
            titolo: 'In anticipo o in ritardo: prova tu',
            html: () => `
                <p>Se non ripassi il giorno previsto, la prossima data si adatta. Prova a spostare il cursore.</p>
                <div class="guida-simulatore">
                    <label class="campo-mini"><span>Hai fatto la rep</span>
                        <select data-sim-rep>${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}" ${i === 3 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
                    <label class="campo-mini"><span>Valutazione</span>
                        <select data-sim-ok><option value="0">Buono o Perfetto</option><option value="1">Ok</option></select></label>
                    <label class="campo-mini guida-cursore"><span>Ripassi dopo <b data-sim-giorni></b></span>
                        <input type="range" min="0" step="1" data-sim-passati></label>
                </div>
                <div class="guida-barra" data-sim-barra></div>
                <div class="guida-esito" data-sim-esito></div>`,
            monta: box => {
                const rep = $('[data-sim-rep]', box), ok = $('[data-sim-ok]', box), passati = $('[data-sim-passati]', box);
                const aggiorna = (nuovoMax = false) => {
                    const I = Srs.intervalloPerRep(+rep.value);
                    if (nuovoMax) { passati.max = String(I * 3); passati.value = String(I); }
                    const P = +passati.value;
                    const x = prova(I, P, ok.value === '1');
                    const puntuale = prova(I, I, ok.value === '1');
                    const scarto = P - I;
                    $('[data-sim-giorni]', box).textContent = giorniTesto(P);
                    const situazione = P === 0 ? 'Lo stesso giorno della rep precedente'
                        : scarto === 0 ? 'Il giorno previsto' : scarto < 0 ? `In anticipo di ${giorniTesto(-scarto)}` : `In ritardo di ${giorniTesto(scarto)}`;
                    const spiegazione = P === 0 ? 'Il N° Rep sale (se scegli che conta), ma la data non si muove: un ripasso in più lo stesso giorno non allunga la memoria.'
                        : scarto === 0 ? 'L\'intervallo segue la sequenza.'
                            : scarto < 0 ? `La data va avanti, ma meno che ripassando puntuale: il ripasso conta solo per la parte di intervallo che hai aspettato (${P} su ${I}).`
                                : 'Più hai aspettato, più la prossima si avvicina: nel frattempo hai dimenticato qualcosa. Se poi torni puntuale, l\'intervallo ricomincia a crescere.';
                    $('[data-sim-esito]', box).innerHTML = `
                        <p><b>${situazione}</b> → prossima revisione tra <b>${giorniTesto(x.dopo)}</b>${scarto !== 0 && P ? ` (ripassando il giorno previsto avresti aspettato ${giorniTesto(puntuale.dopo)})` : ''}.</p>
                        <p class="nota">${spiegazione}</p>`;
                    // Linea del tempo: rep di partenza, giorno previsto, ripasso, prossima revisione
                    const fine = Math.max(P + x.dopo, I) || 1;
                    const pos = g => `${(g / fine * 100).toFixed(1)}%`;
                    $('[data-sim-barra]', box).innerHTML = `
                        <span class="guida-segno" style="left:0"><i></i><em>rep ${rep.value}</em></span>
                        <span class="guida-segno guida-previsto" style="left:${pos(I)}"><i></i><em>previsto</em></span>
                        <span class="guida-segno guida-fatto" style="left:${pos(P)}"><i></i><em>ripassi</em></span>
                        <span class="guida-segno guida-prossima" style="left:${pos(P + x.dopo)}"><i></i><em>prossima</em></span>`;
                };
                rep.addEventListener('change', () => aggiorna(true));
                ok.addEventListener('change', () => aggiorna());
                passati.addEventListener('input', () => aggiorna());
                aggiorna(true);
            },
        },
        {
            titolo: 'Il ripasso del set',
            html: () => `
                <p>Dalle Revisioni il pulsante ${ico('fulmine')} fa partire il ripasso del set. Se le valuti <b>tutte</b>, il set prende
                    N° Rep +1 e la sua prossima data.</p>
                <ul class="guida-elenco">
                    <li><i class="pallino pallino-buono"></i><span>Le carte <b>Buono</b> e <b>Perfetto</b> prendono la data del set e restano al suo passo.</span></li>
                    <li><i class="pallino pallino-ok"></i><span>Le carte <b>Ok</b> e <b>Scarso</b> seguono le loro regole e finiscono nel pannello <b>Per flashcard</b>, da ripassare per conto loro.</span></li>
                    <li><i class="pallino pallino-nuova"></i><span>Se ci sono carte da sistemare puoi ripassare <b>solo quelle</b>: si aggiornano le flashcard, non il N° Rep del set.</span></li>
                </ul>
                <p class="nota">Il pannello Per flashcard c'è nella sezione Revisioni e nella pagina di ogni set. «Riadegua al set» rimette una carta
                    al passo con il set senza ripassarla.</p>`,
        },
        {
            titolo: 'Conta o è una prova?',
            html: () => `
                <p>Quando avvii lo studio e qualcosa non è nel giorno previsto (in anticipo, in ritardo o già ripassato oggi), l'app ti chiede:</p>
                <div class="guida-pulsanti">
                    <span class="btn btn-primario btn-piccolo">${ico('spunta')}Conta come ripasso</span>
                    <span class="btn btn-secondario btn-piccolo">${ico('occhio')}Ripasso di prova</span>
                </div>
                <ul class="guida-elenco">
                    <li><span><b>Conta</b>: valutazioni, N° Rep e date si aggiornano, con le regole di anticipo e ritardo.</span></li>
                    <li><span><b>Prova</b>: studi come sempre, ma set e flashcard restano com'erano. Il tempo va lo stesso nelle statistiche.</span></li>
                </ul>
                <p class="nota">Il giorno previsto non ti chiede niente: conta e basta.</p>`,
        },
        {
            titolo: 'Cambiare a mano',
            html: () => `
                <p>Quello che decidi tu vale sempre, senza domande:</p>
                <ul class="guida-elenco">
                    <li><span><b>N° Rep</b>: quante volte hai ripassato. Cambiandolo, l'intervallo torna quello della sequenza per
                        quella rep (rep 5 → ${giorniTesto(Srs.intervalloPerRep(5))}) e la prossima revisione si sposta.</span></li>
                    <li><span><b>Ultimo ripasso</b> e <b>Intervallo</b>: la prossima revisione è l'ultimo ripasso più l'intervallo.</span></li>
                    <li><span><b>Prossima revisione</b>: scegli la data e l'intervallo si adegua.</span></li>
                    <li><span><b>Valutazione</b>: cambia lo stato del set, non le date.</span></li>
                </ul>
                <p>Li trovi nelle tabelle delle Revisioni (per set e per flashcard) e in fondo alla pagina di ogni flashcard.
                    Se sbagli, ${ico('annulla')} <b>Modifiche recenti</b> annulla.</p>`,
        },
        {
            titolo: 'Ogni giorno, in pratica',
            html: () => `
                <ol class="guida-passi">
                    <li>Apri <b>Revisioni</b> → scheda <b>Da ripassare</b>.</li>
                    <li>Per ogni set premi ${ico('fulmine')} e valuta le carte con sincerità.</li>
                    <li>Passa a <b>Per flashcard</b> e premi <b>Ripassa quelle da fare</b>.</li>
                    <li>Ogni tanto: Impostazioni → <b>Backup</b>.</li>
                </ol>
                <p class="nota">Puoi riaprire questa guida da Revisioni o da Impostazioni. Con i dati di prova (Impostazioni → Dati di prova) c'è anche
                    un tutorial che ti accompagna nelle pagine vere.</p>`,
        },
    ];

    function apri(inizio = 0) {
        let passo = limita(inizio, 0, PASSI.length - 1);
        Ui.modale({
            titolo: 'Come funzionano flashcard e revisioni', classe: 'modale-guida',
            corpo: '<div class="guida" data-guida></div>',
            alApri: (el, m) => {
                const box = $('[data-guida]', el);
                const disegna = () => {
                    const p = PASSI[passo];
                    box.innerHTML = `
                        <div class="guida-puntini" role="tablist">${PASSI.map((x, i) =>
                            `<button type="button" class="${i === passo ? 'attivo' : ''}" data-guida-vai="${i}" title="${esc(x.titolo)}" aria-label="Passo ${i + 1}: ${esc(x.titolo)}"></button>`).join('')}</div>
                        <h3>${passo + 1}. ${esc(p.titolo)}</h3>
                        <div class="guida-contenuto">${p.html()}</div>
                        <div class="guida-piede">
                            <button type="button" class="btn btn-fantasma" data-guida-vai="${passo - 1}" ${passo ? '' : 'hidden'}>${ico('sinistra')}Indietro</button>
                            <span class="spinta"></span>
                            ${passo < PASSI.length - 1
                                ? `<button type="button" class="btn btn-primario" data-guida-vai="${passo + 1}">Avanti${ico('destra')}</button>`
                                : '<button type="button" class="btn btn-primario" data-guida-fine>Ho capito</button>'}
                        </div>`;
                    if (p.monta) p.monta($('.guida-contenuto', box));
                };
                box.addEventListener('click', e => {
                    if (e.target.closest('[data-guida-fine]')) { m.chiudi(); return; }
                    const b = e.target.closest('[data-guida-vai]');
                    if (!b) return;
                    passo = limita(+b.dataset.guidaVai, 0, PASSI.length - 1);
                    disegna();
                });
                el.addEventListener('keydown', e => {
                    if (e.target.matches('input, select')) return;
                    if (e.key === 'ArrowRight' && passo < PASSI.length - 1) { passo++; disegna(); }
                    else if (e.key === 'ArrowLeft' && passo > 0) { passo--; disegna(); }
                });
                disegna();
            },
        });
    }

    return { apri };
})();
