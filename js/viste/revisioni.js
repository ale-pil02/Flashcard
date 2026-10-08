// Revisioni: la sezione "master" della spaced repetition (js/revisioni.js), come il database di Notion.
// Due pannelli: "Per set" (gli argomenti, una riga per set aggiornata dallo studio) e "Per flashcard" (le carte che
// vanno ripassate per conto loro, prima del loro set). Schede: tutte, una per materia, "Da ripassare".
// Qui si modifica tutto, anche il set di una riga; nella pagina di un set si vedono e si modificano solo gli
// argomenti di quel set e dei suoi sotto-set.

Viste.revisioni = {
    nav: 'revisioni',
    titolo: 'Revisioni',
    scheda: 'tutte',     // 'tutte' | 'da-ripassare' | id di una materia
    pannello: 'set',     // 'set' | 'carte'

    mostra(el) {
        const ico = Ui.ico;
        const materie = Dati.materie();
        if (this.scheda !== 'tutte' && this.scheda !== 'da-ripassare' && !Dati.materia(this.scheda)) this.scheda = 'tutte';
        const materiaScheda = Dati.materia(this.scheda) ? this.scheda : null;
        const carte = this.pannello === 'carte';
        const tutti = Dati.tuttiGliArgomenti();
        const devianti = Revisioni.carteDevianti();
        const c = Revisioni.conteggi(carte ? devianti : tutti);
        const daFare = c.scaduto + c.oggi;
        const daFareSet = tutti.filter(Revisioni.daRipassare).length;
        const daFareCarte = devianti.filter(Revisioni.cartaDaRipassare).length;

        const conto = carte
            ? { tutte: devianti.length, materia: id => devianti.filter(v => (Dati.set(v.carta.setId) || {}).materiaId === id).length }
            : { tutte: tutti.length, materia: id => Dati.argomentiDiMateria(id).length };
        const schede = [
            { id: 'tutte', testo: 'Tutte', conto: conto.tutte },
            ...materie.map(m => ({ id: m.id, testo: `${m.emoji} ${m.nome}`, conto: conto.materia(m.id) })),
            { id: 'da-ripassare', testo: 'Da ripassare', conto: daFare, rossa: true },
        ];

        el.innerHTML = `
            <div class="pagina pagina-larga">
                <header class="pagina-testa">
                    <div>
                        <h1>Revisioni</h1>
                        <p class="sottotitolo">${carte ? 'Flashcard che non vanno al passo con il loro set: mai valutate o con la prossima revisione in un altro giorno'
                            : `Ripasso degli argomenti a intervalli crescenti: ${Srs.anteprimaSequenza(6).join(', ')}… giorni (la sequenza si cambia nelle Impostazioni)`}</p>
                    </div>
                    <div class="azioni-testa">
                        <button type="button" class="btn btn-fantasma" data-azione="guida" title="Flashcard, valutazioni e revisioni spiegate passo per passo">${ico('lampadina')}<span>Come funziona</span></button>
                        <button type="button" class="btn-icona btn-bordo" data-azione="menu" aria-label="Altre azioni">${ico('altro')}</button>
                        ${carte ? '' : `<button type="button" class="btn btn-primario" data-azione="nuovo">${ico('piu')}<span>Nuovo argomento</span></button>`}
                    </div>
                </header>

                <div class="pannelli-rev" role="tablist" aria-label="Pannello">
                    <button type="button" role="tab" class="pannello-rev${carte ? '' : ' attivo'}" data-pannello="set" aria-selected="${!carte}">
                        ${ico('cartella')}Per set${daFareSet ? `<span class="conteggio rosso">${daFareSet}</span>` : ''}</button>
                    <button type="button" role="tab" class="pannello-rev${carte ? ' attivo' : ''}" data-pannello="carte" aria-selected="${carte}">
                        ${ico('carte')}Per flashcard${devianti.length ? `<span class="conteggio${daFareCarte ? ' rosso' : ''}">${daFareCarte || devianti.length}</span>` : ''}</button>
                </div>

                ${(carte ? devianti.length : tutti.length) ? `
                <div class="riepilogo-rev">
                    <span class="avviso-rev avviso-scaduto"><i></i><b>${c.scaduto}</b> in ritardo</span>
                    <span class="avviso-rev avviso-oggi"><i></i><b>${c.oggi}</b> da fare oggi</span>
                    <span class="avviso-rev avviso-attesa"><i></i><b>${c.attesa}</b> in attesa</span>
                    ${c.mai ? `<span class="avviso-rev avviso-mai"><i></i><b>${c.mai}</b> mai ripassati</span>` : ''}
                    ${carte && daFare ? `<button type="button" class="btn btn-primario btn-piccolo" data-azione="ripassa-carte">${ico('fulmine')}Ripassa quelle da fare</button>` : ''}
                </div>` : ''}

                <nav class="schede-rev" role="tablist">
                    ${schede.map(s => `<button type="button" role="tab" class="scheda-rev${this.scheda === s.id ? ' attiva' : ''}${s.rossa ? ' rossa' : ''}" data-scheda="${s.id}" aria-selected="${this.scheda === s.id}">
                        ${s.rossa ? '<i class="pallino-rosso"></i>' : ''}${esc(s.testo)}${s.conto ? `<span class="conteggio">${s.conto}</span>` : ''}</button>`).join('')}
                </nav>

                <div data-tabella></div>
            </div>`;

        const ridisegna = () => App.ridisegna();

        // Le flashcard della scheda scelta
        const vociCarte = () => {
            const lista = Revisioni.carteDevianti({ materiaId: materiaScheda });
            return this.scheda === 'da-ripassare' ? lista.filter(Revisioni.cartaDaRipassare) : lista;
        };

        if (carte) {
            Revisioni.montaCarte($('[data-tabella]', el), {
                voci: vociCarte,
                dopo: ridisegna,
                vuoto: this.scheda === 'da-ripassare'
                    ? Ui.vuoto({ icona: 'ok-cerchio', titolo: 'Niente da ripassare', testo: 'Nessuna flashcard è rimasta indietro rispetto al suo set. 🎉' })
                    : Ui.vuoto({
                        icona: 'carte', titolo: 'Nessuna flashcard per conto suo',
                        testo: 'Qui compaiono le carte dei set già ripassati che non vanno al passo con il loro set: quelle valutate Ok o Scarso, quelle aggiunte dopo e mai valutate e quelle ripassate per conto loro.',
                    }),
            });
        } else {
            const argomenti = () => {
                if (this.scheda === 'da-ripassare') return Dati.tuttiGliArgomenti().filter(Revisioni.daRipassare).sort(Revisioni.perUrgenza);
                if (materiaScheda) return Dati.argomentiDiMateria(materiaScheda);
                return Dati.tuttiGliArgomenti();
            };
            const vuoto = this.scheda === 'da-ripassare'
                ? Ui.vuoto({ icona: 'ok-cerchio', titolo: 'Niente da ripassare', testo: 'Nessun argomento è in ritardo o da ripassare oggi. 🎉' })
                : Ui.vuoto({
                    icona: 'calendario', titolo: 'Ancora nessun argomento',
                    testo: 'Quando finisci di studiare un set, compare qui da solo con la data e il numero del ripasso. Puoi anche aggiungere a mano i capitoli o gli schemi che ripassi.',
                    azioni: `<button type="button" class="btn btn-primario" data-azione="nuovo">${ico('piu')}Nuovo argomento</button>
                             <button type="button" class="btn btn-secondario" data-azione="uno-per-set">${ico('cartella')}Un argomento per ogni set</button>`,
                });

            Revisioni.monta($('[data-tabella]', el), {
                chiave: 'master:' + this.scheda,
                argomenti,
                colonnaSet: true,
                setModificabile: true,
                nuovo: () => Revisioni.formNuovo({ materiaId: materiaScheda }),
                vuoto,
                dopo: () => this.aggiornaSchede(el),
            });
        }

        $('.schede-rev', el).addEventListener('click', e => {
            const b = e.target.closest('[data-scheda]');
            if (!b) return;
            this.scheda = b.dataset.scheda;
            ridisegna();
        });
        $('.pannelli-rev', el).addEventListener('click', e => {
            const b = e.target.closest('[data-pannello]');
            if (!b || b.dataset.pannello === this.pannello) return;
            this.pannello = b.dataset.pannello;
            ridisegna();
        });

        const setDellaScheda = () => (materiaScheda ? Dati.setDiMateria(materiaScheda) : Dati.tuttiSet());
        Ui.collegaAzioni(el, {
            nuovo: async () => { if (await Revisioni.formNuovo({ materiaId: materiaScheda })) ridisegna(); },
            'uno-per-set': async () => { if (await Revisioni.unoPerOgniSet(setDellaScheda())) ridisegna(); },
            'ripassa-carte': () => Revisioni.avviaRipassoCarte(vociCarte().filter(Revisioni.cartaDaRipassare)),
            guida: () => Guida.apri(),
            menu: b => Ui.menu(b, [
                !carte && { testo: materiaScheda ? `Un argomento per ogni set di ${Dati.materia(materiaScheda).nome}` : 'Un argomento per ogni set', icona: 'cartella',
                    clic: async () => { if (await Revisioni.unoPerOgniSet(setDellaScheda())) ridisegna(); } },
                !carte && { testo: 'Larghezze delle colonne predefinite', icona: 'ruota', clic: () => { Revisioni.ripristinaLarghezze(); ridisegna(); } },
                { testo: 'Modifiche recenti (annulla)', icona: 'annulla', clic: () => Storia.elenco() },
            ]),
        });
    },

    // I conteggi delle schede cambiano quando cambia una data: si aggiornano senza ridisegnare la tabella
    aggiornaSchede(el) {
        const tutti = Dati.tuttiGliArgomenti();
        const c = Revisioni.conteggi(tutti);
        const scheda = $('.scheda-rev[data-scheda="da-ripassare"] .conteggio', el);
        const daFare = c.scaduto + c.oggi;
        if (scheda) { scheda.textContent = daFare; scheda.hidden = !daFare; }
        const riepilogo = $('.riepilogo-rev', el);
        if (riepilogo) $$('b', riepilogo).forEach((b, i) => { b.textContent = [c.scaduto, c.oggi, c.attesa, c.mai][i]; });
    },
};
