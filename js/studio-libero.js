// Studio libero: dal pannello "Per flashcard" (sezione Revisioni e pagina del set) scegli tu cosa studiare adesso.
// Quanto tempo hai (o quante carte), quali carte (da ripassare, sfasate, mai valutate, per valutazione), di quali set e
// in che ordine; l'elenco si può ritoccare a mano. Il tempo si stima dalle tue ultime risposte. All'avvio, come sempre,
// si sceglie se è un ripasso effettivo (aggiorna le flashcard, non il N° Rep dei set) o di prova.

const StudioLibero = (() => {
    const ico = (...a) => Ui.ico(...a);

    const CATEGORIE = [
        { id: 'da-fare', testo: 'Da ripassare', titolo: 'In ritardo o da fare oggi', vale: v => Revisioni.cartaDaRipassare(v) },
        { id: 'sfasate', testo: 'Sfasate', titolo: 'Non vanno al passo con il loro mazzo', vale: v => Revisioni.sfasata(v) },
        { id: 'nuove', testo: 'Mai valutate', vale: v => Srs.valutazione(v.carta) == null },
        ...Srs.VALUTAZIONI.map(x => ({ id: x.chiave, testo: x.nome, vale: v => Srs.valutazione(v.carta) === x.valore })),
    ];

    const ORDINI = [
        { id: 'urgenti', testo: 'Prima le più urgenti', titolo: 'In ritardo da più tempo, poi oggi, poi le più vicine' },
        { id: 'deboli', testo: 'Prima le più deboli', titolo: 'Scarso, Ok, mai valutate, Buono, Perfetto' },
        { id: 'set', testo: 'Come nei set', titolo: "Nell'ordine dei set e dell'albero delle domande" },
        { id: 'mescolate', testo: 'Mescolate' },
    ];

    const TEMPI = [10, 20, 30, 45];

    // Secondi a carta: la mediana delle ultime risposte (con un po' di margine per le carte che tornano), se no 25
    function secondiACarta() {
        const durate = Dati.ripassi().map(r => r.durata).filter(d => d > 0).slice(-200).sort((a, b) => a - b);
        if (durate.length < 5) return 25;
        return Math.round(limita(durate[Math.floor(durate.length / 2)] / 1000 * 1.2, 6, 120));
    }

    // Peso per "le più deboli": Scarso, Ok, mai valutate, Buono, Perfetto
    function debolezza(v) {
        const x = Srs.valutazione(v.carta);
        if (x == null) return 2.5;
        return { [Srs.SCARSO]: 1, [Srs.OK]: 2, [Srs.BUONO]: 3, [Srs.PERFETTO]: 4 }[x] ?? 3;
    }

    // voci: le flashcard tra cui scegliere (voci di Revisioni.tutteLeVoci, nell'ordine dei set);
    // setIniziali: i set già scelti (es. il filtro della sezione); ritorno: dove tornare dopo lo studio
    function apri({ voci, setIniziali = [], ritorno = '' } = {}) {
        if (!voci.length) { Ui.toast('Non ci sono flashcard da studiare qui', 'info'); return; }
        const sec = secondiACarta();
        const setPresenti = [...new Set(voci.map(v => v.carta.setId))];
        const scelta = {
            set: new Set(setIniziali.filter(id => setPresenti.includes(id))),
            categorie: new Set(voci.some(Revisioni.cartaDaRipassare) ? ['da-fare'] : []),
            ordine: 'urgenti',
            quanto: { modo: 'tempo', minuti: 20, numero: 20 },
        };
        let mescolate = null;              // l'ordine casuale resta lo stesso finché non cambi ordine
        let aMano = new Map();             // id → true/false: le carte spuntate o tolte a mano

        const candidate = () => {
            let lista = voci.filter(v => (!scelta.set.size || scelta.set.has(v.carta.setId))
                && (!scelta.categorie.size || CATEGORIE.some(k => scelta.categorie.has(k.id) && k.vale(v))));
            if (scelta.ordine === 'urgenti') lista = [...lista].sort(Revisioni.perUrgenzaCarte);
            else if (scelta.ordine === 'deboli') lista = [...lista].sort((a, b) => debolezza(a) - debolezza(b) || Revisioni.perUrgenzaCarte(a, b));
            else if (scelta.ordine === 'mescolate') {
                if (!mescolate) mescolate = new Map(mescola(voci.map(v => v.carta.id)).map((id, i) => [id, i]));
                lista = [...lista].sort((a, b) => mescolate.get(a.carta.id) - mescolate.get(b.carta.id));
            }
            return lista;
        };
        const quante = n => {
            const q = scelta.quanto;
            if (q.modo === 'tutte') return n;
            if (q.modo === 'numero') return Math.min(n, Math.max(1, q.numero || 1));
            return Math.min(n, Math.max(1, Math.floor(q.minuti * 60 / sec)));
        };
        const scelte = () => {
            const lista = candidate();
            const k = quante(lista.length);
            return lista.map((v, i) => ({ v, dentro: aMano.has(v.carta.id) ? aMano.get(v.carta.id) : i < k }));
        };
        const minuti = n => Math.max(1, Math.round(n * sec / 60));

        const htmlCategorie = () => CATEGORIE.map(k => {
            const n = voci.filter(v => (!scelta.set.size || scelta.set.has(v.carta.setId)) && k.vale(v)).length;
            return `<button type="button" class="chip chip-grande${scelta.categorie.has(k.id) ? ' attivo' : ''}" data-sl-categoria="${k.id}" ${k.titolo ? `title="${k.titolo}"` : ''} ${n ? '' : 'disabled'}>${k.testo} <small>${n}</small></button>`;
        }).join('');

        const htmlElenco = righe => righe.map(({ v, dentro }) => `
            <label class="sl-carta"><input type="checkbox" data-sl-carta="${v.carta.id}" ${dentro ? 'checked' : ''}>
                <span><span class="sl-domanda">${esc(Ui.tronca(testoDaHtml(v.carta.domanda), 120)) || '(senza domanda)'}</span>
                <small>${esc(Revisioni.nomeSet(v.carta.setId))} · ${esc(Srs.valutazione(v.carta) == null ? 'Mai valutata' : Srs.VALUTAZIONI.find(x => x.valore === Srs.valutazione(v.carta)).nome)} · ${esc(v.carta && Revisioni.prossima(v) ? Revisioni.avviso(v).testo : 'Mai ripassata')}</small></span>
            </label>`).join('');

        const disegna = el => {
            const righe = scelte();
            const dentro = righe.filter(r => r.dentro).length;
            const q = scelta.quanto;
            $('[data-sl-quanto]', el).innerHTML = `
                ${TEMPI.map(t => `<button type="button" class="${q.modo === 'tempo' && q.minuti === t ? 'attivo' : ''}" data-sl-tempo="${t}">${t} min</button>`).join('')}
                <button type="button" class="${q.modo === 'tutte' ? 'attivo' : ''}" data-sl-tutte>Tutte</button>`;
            $('[name=sl-numero]', el).value = q.modo === 'numero' ? q.numero : '';
            $('[data-sl-stima]', el).textContent = `Circa ${sec} secondi a carta${Dati.ripassi().some(r => r.durata > 0) ? ' (dalle tue ultime risposte)' : ''}: ${q.modo === 'tempo' ? `in ${q.minuti} minuti ne fai circa ${Math.max(1, Math.floor(q.minuti * 60 / sec))}` : `${plurale(dentro, 'carta', 'carte')} ≈ ${plurale(minuti(dentro), 'minuto', 'minuti')}`}.`;
            $('[data-sl-categorie]', el).innerHTML = htmlCategorie();
            $('[data-sl-conto]', el).textContent = righe.length ? `${dentro} di ${righe.length}` : '';
            $('[data-sl-elenco]', el).innerHTML = righe.length ? htmlElenco(righe) : '<p class="nota">Nessuna flashcard con queste scelte.</p>';
            const avvia = $('[data-sl-avvia]', el);
            avvia.disabled = !dentro;
            avvia.innerHTML = `${ico('fulmine')}${dentro ? `Studia ${plurale(dentro, 'flashcard', 'flashcard')} (≈ ${plurale(minuti(dentro), 'minuto', 'minuti')})` : 'Scegli qualche flashcard'}`;
        };
        const cambiato = el => { aMano = new Map(); disegna(el); };

        const setOrdinati = [...setPresenti].sort((a, b) => Revisioni.nomeSet(a, true).localeCompare(Revisioni.nomeSet(b, true), 'it', { numeric: true }));
        Ui.modale({
            titolo: 'Studio libero', classe: 'modale-studio-libero',
            corpo: `
                <p class="nota">Hai un po' di tempo? Scegli quanto e cosa ripassare. All'avvio scegli se è un ripasso effettivo
                    (aggiorna le flashcard, non il N° Rep dei set) o di prova.</p>
                <div class="sl-blocco">
                    <span class="etichetta">Quanto tempo hai?</span>
                    <div class="sl-riga">
                        <div class="segmentato piccolo" data-sl-quanto></div>
                        <label class="sl-numero">oppure <input type="number" name="sl-numero" min="1" max="999" placeholder="N" aria-label="Numero di flashcard"> flashcard</label>
                    </div>
                    <small class="sl-stima" data-sl-stima></small>
                </div>
                <div class="sl-blocco">
                    <span class="etichetta">Quali flashcard <small>(nessuna scelta = tutte)</small></span>
                    <div class="sl-chip" data-sl-categorie></div>
                </div>
                ${setPresenti.length > 1 ? `
                <details class="sl-blocco sl-set"${scelta.set.size ? ' open' : ''}>
                    <summary class="etichetta">Set <small data-sl-conto-set>${scelta.set.size ? `${scelta.set.size} scelti` : 'tutti'}</small></summary>
                    <div class="sl-elenco-set">${setOrdinati.map(id => `
                        <label class="tendina-voce"><input type="checkbox" data-sl-set="${id}" ${scelta.set.has(id) ? 'checked' : ''}><span>${esc(Revisioni.nomeSet(id, true))}</span>
                            <small>${voci.filter(v => v.carta.setId === id).length}</small></label>`).join('')}</div>
                </details>` : ''}
                <div class="sl-blocco">
                    <span class="etichetta">Ordine</span>
                    <div class="sl-chip">${ORDINI.map(o => `<label class="chip chip-grande sl-ordine" ${o.titolo ? `title="${o.titolo}"` : ''}><input type="radio" name="sl-ordine" value="${o.id}" ${scelta.ordine === o.id ? 'checked' : ''}>${o.testo}</label>`).join('')}</div>
                </div>
                <details class="sl-blocco sl-scelta">
                    <summary class="etichetta">Le flashcard della sessione <small data-sl-conto></small></summary>
                    <div class="sl-azioni-elenco">
                        <button type="button" class="tendina-link" data-sl-tutte-carte>Spunta tutte</button>
                        <button type="button" class="tendina-link" data-sl-nessuna>Togli tutte</button>
                    </div>
                    <div class="sl-elenco" data-sl-elenco></div>
                </details>
                <button type="button" class="btn btn-primario sl-avvia" data-sl-avvia></button>`,
            azioni: [{ testo: 'Annulla', classe: 'btn-fantasma' }],
            alApri: (el, m) => {
                disegna(el);
                el.addEventListener('click', e => {
                    let b;
                    if ((b = e.target.closest('[data-sl-tempo]'))) { scelta.quanto = { ...scelta.quanto, modo: 'tempo', minuti: +b.dataset.slTempo }; cambiato(el); }
                    else if (e.target.closest('[data-sl-tutte]')) { scelta.quanto = { ...scelta.quanto, modo: 'tutte' }; cambiato(el); }
                    else if ((b = e.target.closest('[data-sl-categoria]'))) {
                        const id = b.dataset.slCategoria;
                        if (scelta.categorie.has(id)) scelta.categorie.delete(id); else scelta.categorie.add(id);
                        cambiato(el);
                    } else if (e.target.closest('[data-sl-tutte-carte]') || e.target.closest('[data-sl-nessuna]')) {
                        const si = !!e.target.closest('[data-sl-tutte-carte]');
                        candidate().forEach(v => aMano.set(v.carta.id, si));
                        disegna(el);
                    } else if (e.target.closest('[data-sl-avvia]')) {
                        const ids = scelte().filter(r => r.dentro).map(r => r.v.carta.id);
                        if (!ids.length) return;
                        m.chiudi();
                        const carte = ids.map(Dati.carta).filter(Boolean);
                        Viste.studio.avvia({
                            setIds: [...new Set(carte.map(c => c.setId))], ids, titolo: 'Studio libero', perCarta: true,
                            ritorno: ritorno || Router.corrente.replace(/^#/, ''),
                            ordineIds: scelta.ordine !== 'set', ordineCasuale: false,
                        });
                    }
                });
                el.addEventListener('change', e => {
                    const t = e.target;
                    if (t.name === 'sl-numero') {
                        const n = Math.round(+t.value);
                        scelta.quanto = n > 0 ? { ...scelta.quanto, modo: 'numero', numero: n } : { ...scelta.quanto, modo: 'tempo' };
                        cambiato(el);
                    } else if (t.name === 'sl-ordine') { scelta.ordine = t.value; mescolate = null; cambiato(el); }
                    else if (t.dataset.slSet) {
                        if (t.checked) scelta.set.add(t.dataset.slSet); else scelta.set.delete(t.dataset.slSet);
                        const conto = $('[data-sl-conto-set]', el);
                        if (conto) conto.textContent = scelta.set.size ? `${scelta.set.size} scelti` : 'tutti';
                        cambiato(el);
                    } else if (t.dataset.slCarta) { aMano.set(t.dataset.slCarta, t.checked); disegna(el); }
                });
            },
        });
    }

    return { apri, secondiACarta };
})();
