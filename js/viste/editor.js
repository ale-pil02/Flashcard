// Editor di una flashcard: domanda, risposta, parte della mappa, domanda madre (albero), suggerimento, spiegazione, tag.
// Le carte a scelta multipla non si creano più a mano: quelle importate restano modificabili.
// Avvisa prima di uscire con modifiche non salvate.
//
// Indirizzi: #/carta/nuova?set=ID[&genitore=ID]  ·  #/carta/ID

Viste.editor = {
    nav: 'libreria',
    titolo: 'Flashcard',
    tagPrecedenti: [],   // "Salva e crea un'altra" ripropone i tag della carta appena salvata
    tasti: null,

    mostra(el, params, query) {
        const ico = Ui.ico;
        const nuova = !params.id;
        const carta = nuova ? null : Dati.carta(params.id);
        const setId = nuova ? query.set : carta && carta.setId;
        const s = setId && Dati.set(setId);
        if (!s || (!nuova && !carta)) {
            el.innerHTML = `<div class="pagina">${Ui.vuoto({ icona: 'avviso', titolo: 'Flashcard non trovata', azioni: `<a class="btn btn-secondario" href="#/libreria">Torna alla libreria</a>` })}</div>`;
            return;
        }
        const m = Dati.materia(s.materiaId);
        App.contesto = { setId: s.id, materiaId: s.materiaId };
        document.title = (nuova ? 'Nuova flashcard' : 'Modifica flashcard') + ' · Flashcard';

        const albero = Dati.alberoDiSet(s.id);
        const carteSet = albero.map(n => n.carta);
        const posizione = nuova ? -1 : carteSet.findIndex(x => x.id === carta.id);
        const precedente = carteSet[posizione - 1], successiva = carteSet[posizione + 1];
        const multipla = !!carta && carta.risposte.length > 1;
        const madreIniziale = nuova ? (Dati.carta(query.genitore) && Dati.carta(query.genitore).setId === s.id ? query.genitore : '') : (Dati.madre(carta) || {}).id || '';
        const escluse = new Set(nuova ? [] : [carta.id, ...Dati.discendentiCarta(carta.id)]);
        let tag = nuova ? [...this.tagPrecedenti] : [...carta.tag];
        this.tagPrecedenti = [];

        // Materiali che possono fare da fonte: quelli del set (le mappe dell'app hanno "Parte della mappa"), più quello
        // già collegato se sta altrove
        const materialiFonte = Dati.materialiDiSet(s.id).filter(x => !x.mappaId);
        const fonteAttuale = carta && carta.fonte && Dati.materiale(carta.fonte.materiale);
        if (fonteAttuale && !materialiFonte.includes(fonteAttuale)) materialiFonte.push(fonteAttuale);

        const opzioniMadre = albero.filter(n => !escluse.has(n.carta.id)).map(n =>
            `<option value="${n.carta.id}" ${n.carta.id === madreIniziale ? 'selected' : ''}>${Ui.rientroOpzione(n.livello)}${esc(Ui.tronca(testoDaHtml(n.carta.domanda), 90))}</option>`).join('');

        el.innerHTML = `
            <div class="pagina pagina-editor">
                <nav class="briciole">
                    <a href="#/libreria">Libreria</a>${ico('destra')}
                    ${m ? `<a href="#/materia/${m.id}">${esc(m.nome)}</a>${ico('destra')}` : ''}
                    <a href="#/set/${s.id}">${esc(s.nome)}</a>${ico('destra')}
                    <span>${nuova ? 'Nuova flashcard' : 'Modifica'}</span>
                </nav>
                <header class="pagina-testa">
                    <h1>${nuova ? (madreIniziale ? 'Nuova domanda figlia' : 'Nuova flashcard') : 'Modifica flashcard'}</h1>
                    ${nuova ? '' : `
                    <div class="naviga-carte">
                        <button type="button" class="btn-icona btn-bordo" data-azione="vai" data-id="${precedente ? precedente.id : ''}" ${precedente ? '' : 'disabled'} aria-label="Carta precedente">${ico('sinistra')}</button>
                        <span>${posizione + 1} di ${carteSet.length}</span>
                        <button type="button" class="btn-icona btn-bordo" data-azione="vai" data-id="${successiva ? successiva.id : ''}" ${successiva ? '' : 'disabled'} aria-label="Carta successiva">${ico('destra')}</button>
                    </div>`}
                </header>

                <div class="riquadro editor-carta">
                    <div class="contesto-madre" data-contesto-madre></div>

                    <div class="campo">
                        <span class="etichetta">Domanda</span>
                        <div data-ricco="domanda"></div>
                    </div>

                    ${multipla ? `
                    <div class="campo">
                        <span class="etichetta">Risposte <em>carta a scelta multipla importata: spunta quelle corrette</em></span>
                        <div class="lista-opzioni" data-opzioni></div>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-azione="aggiungi-opzione">${ico('piu')}Aggiungi risposta</button>
                    </div>` : `
                    <div class="campo">
                        <span class="etichetta">Risposta</span>
                        <div data-ricco="risposta"></div>
                    </div>`}

                    <div class="campo campo-fonte">
                        <span class="etichetta">Fonte della risposta <em>facoltativa: dove sta la risposta in un materiale (pagina e frase); nello studio un clic sulla risposta ti porta lì</em></span>
                        <div class="riga-fonte">
                            <select name="fonte-materiale" aria-label="Materiale"><option value="">— Nessuna —</option>${materialiFonte.map(x => `<option value="${x.id}" data-tipo="${x.tipo}" ${carta && carta.fonte && carta.fonte.materiale === x.id ? 'selected' : ''}>${esc(Ui.tronca(x.nome, 70))}</option>`).join('')}</select>
                            <input type="number" name="fonte-pagina" min="1" step="1" placeholder="Pagina" aria-label="Pagina o diapositiva" value="${carta && carta.fonte && carta.fonte.pagina ? carta.fonte.pagina : ''}">
                            <button type="button" class="btn btn-secondario btn-piccolo" data-azione="prova-fonte" title="Apri il materiale in quel punto">${ico('occhio')}Apri</button>
                        </div>
                        <input type="text" name="fonte-citazione" maxlength="500" placeholder="La frase della fonte dove sta la risposta (copiala dal materiale: verrà evidenziata)" value="${esc(carta && carta.fonte ? carta.fonte.citazione || '' : '')}">
                    </div>

                    <div class="campo campo-mappa">
                        <span class="etichetta">Parte della mappa <em>facoltativa: il nodo dove sta la risposta; nello studio compare tutto il suo sottoramo, sempre aggiornato</em></span>
                        <div data-mappa-carta></div>
                    </div>

                    <label class="campo">
                        <span class="etichetta">Domanda madre <em>per costruire le domande a cascata, dalla più generale alla più specifica</em></span>
                        <select name="madre">
                            <option value="">— Nessuna: domanda principale —</option>
                            ${opzioniMadre}
                        </select>
                    </label>

                    <details class="altri-campi" ${carta && (carta.suggerimento || !Ricco.vuoto(carta.spiegazione)) ? 'open' : ''}>
                        <summary>${ico('lampadina')}Suggerimento e spiegazione</summary>
                        <label class="campo">
                            <span class="etichetta">Suggerimento <em>facoltativo, si può chiedere prima di vedere la risposta</em></span>
                            <input type="text" name="suggerimento" maxlength="300" value="${esc(carta ? carta.suggerimento : '')}" placeholder="Un aiuto per ricordare">
                        </label>
                        <div class="campo">
                            <span class="etichetta">Spiegazione <em>facoltativa, compare dopo la risposta</em></span>
                            <div data-ricco="spiegazione"></div>
                        </div>
                    </details>

                    <div class="campo">
                        <span class="etichetta">Tag</span>
                        <div class="input-tag" data-tag>
                            <input type="text" list="tag-esistenti" placeholder="Aggiungi un tag e premi Invio" aria-label="Nuovo tag">
                        </div>
                        <datalist id="tag-esistenti">${Dati.tagDi(carteSet).map(t => `<option value="${esc(t)}">`).join('')}</datalist>
                    </div>

                    ${nuova ? '' : `
                    <div class="campo campo-valutazione">
                        <span class="etichetta">Valutazione <em>la cambi a mano: conta per lo stato del set nelle revisioni, le date restano</em></span>
                        <div class="scelta-valutazione" role="radiogroup" aria-label="Valutazione">
                            ${Srs.VALUTAZIONI.map(v => `<button type="button" role="radio" class="chip-scelta valuta-${v.chiave}${Srs.valutazione(carta) === v.valore ? ' attivo' : ''}"
                                data-valutazione="${v.valore}" aria-checked="${Srs.valutazione(carta) === v.valore}"><i class="pallino pallino-${v.chiave}"></i>${v.nome}</button>`).join('')}
                            <button type="button" role="radio" class="chip-scelta${Srs.valutazione(carta) == null ? ' attivo' : ''}" data-valutazione=""
                                aria-checked="${Srs.valutazione(carta) == null}" title="Come se non l'avessi mai valutata: conta come carta nuova"><i class="pallino pallino-nuova"></i>Mai valutata</button>
                        </div>
                        <p class="nota" data-stato-carta>${ico('orologio')}${esc(Srs.descrivi(carta))} · ${plurale(carta.srs.ripetizioni || 0, 'risposta data', 'risposte date')}</p>
                    </div>
                    <div class="campo campo-ripasso">
                        <span class="etichetta">Ripetizione spaziata <em>la cambi a mano: vale subito</em></span>
                        <div class="griglia-ripasso" data-ripasso></div>
                    </div>`}
                </div>

                <div class="barra-editor">
                    ${nuova ? '' : `
                        <button type="button" class="btn btn-fantasma testo-pericolo" data-azione="elimina">${ico('cestino')}<span>Elimina</span></button>
                        <button type="button" class="btn-icona" data-azione="altro" aria-label="Altre azioni">${ico('altro')}</button>`}
                    <span class="spinta"></span>
                    <button type="button" class="btn btn-fantasma solo-largo" data-azione="annulla">Annulla</button>
                    ${nuova ? `<button type="button" class="btn btn-secondario" data-azione="salva-sorella" title="Salva e crea un'altra domanda allo stesso livello (Ctrl+Invio)">${ico('piu')}<span class="solo-largo">Salva e crea un'altra</span><span class="solo-stretto">Altra</span></button>` : ''}
                    <button type="button" class="btn btn-secondario" data-azione="salva-figlia" title="Salva e crea una domanda figlia di questa (Ctrl+Maiusc+Invio)">${ico('ramo')}<span class="solo-largo">Salva e crea figlia</span><span class="solo-stretto">Figlia</span></button>
                    <button type="button" class="btn btn-primario" data-azione="salva" title="Ctrl+S">${ico('spunta')}Salva</button>
                </div>
            </div>`;

        // ---- Editor di testo ----
        const domanda = Ricco.crea($('[data-ricco=domanda]', el), { html: carta ? carta.domanda : '', segnaposto: 'Scrivi la domanda…' });
        const risposta = multipla ? null : Ricco.crea($('[data-ricco=risposta]', el), {
            html: carta ? (carta.risposte[0] || {}).testo || '' : '', segnaposto: 'Scrivi la risposta… (con la parte di mappa può anche restare vuota)',
        });
        const spiegazione = Ricco.crea($('[data-ricco=spiegazione]', el), { html: carta ? carta.spiegazione : '', segnaposto: 'Perché la risposta è questa, collegamenti, esempi…' });
        const suggerimento = $('[name=suggerimento]', el);
        const sceltaMadre = $('[name=madre]', el);

        // Mostra la domanda madre sopra, per scrivere la figlia sapendo da dove si parte
        const mostraMadre = () => {
            const madre = sceltaMadre.value ? Dati.carta(sceltaMadre.value) : null;
            const box = $('[data-contesto-madre]', el);
            box.hidden = !madre;
            if (madre) box.innerHTML = `${ico('ramo')}<span>Sotto-domanda di <a href="#/carta/${madre.id}">${esc(Ui.tronca(testoDaHtml(madre.domanda), 160))}</a></span>`;
        };
        sceltaMadre.addEventListener('change', mostraMadre);
        mostraMadre();

        // ---- Fonte della risposta ----
        const fonteMateriale = $('[name="fonte-materiale"]', el), fontePagina = $('[name="fonte-pagina"]', el), fonteCitazione = $('[name="fonte-citazione"]', el);
        const leggiFonte = () => (fonteMateriale.value ? { materiale: fonteMateriale.value, pagina: +fontePagina.value || null, citazione: fonteCitazione.value.trim() } : null);
        const aggiornaFonte = () => {
            const o = fonteMateriale.selectedOptions[0];
            const tipo = o ? o.dataset.tipo : '';
            fontePagina.hidden = !['pdf', 'presentazione'].includes(tipo);
            fontePagina.placeholder = tipo === 'presentazione' ? 'Diapositiva' : 'Pagina';
            fonteCitazione.hidden = !fonteMateriale.value || tipo === 'immagine';
            $('[data-azione="prova-fonte"]', el).hidden = !fonteMateriale.value;
        };
        fonteMateriale.addEventListener('change', aggiornaFonte);
        aggiornaFonte();

        // ---- Parte della mappa ----
        let legame = carta && carta.mappa ? { ...carta.mappa } : null;
        let vistaMappa = null;
        const disegnaLegame = () => {
            const box = $('[data-mappa-carta]', el);
            VistaMappa.chiudi(vistaMappa);
            vistaMappa = null;
            const valido = VistaMappa.risolvi({ mappa: legame });
            box.innerHTML = `
                <div class="riga-mappa-carta">
                    ${legame ? (valido ? `${ico('mappa')}<span>${esc(VistaMappa.descrivi({ mappa: legame }))}</span>` : `${ico('avviso')}<span>Il nodo collegato non c'è più nella mappa</span>`) : '<span class="nota">Nessun nodo collegato</span>'}
                    <button type="button" class="btn btn-secondario btn-piccolo" data-azione="scegli-nodo">${ico('mappa')}${legame ? 'Cambia' : 'Collega a un nodo della mappa'}</button>
                    ${legame ? `<button type="button" class="btn btn-fantasma btn-piccolo" data-azione="togli-nodo">Togli</button>` : ''}
                </div>
                ${valido ? '<div data-anteprima-mappa></div>' : ''}`;
            if (valido) vistaMappa = VistaMappa.monta($('[data-anteprima-mappa]', box), { mappa: legame }, { altezzaMax: 360 });
        };
        disegnaLegame();

        // ---- Scelta multipla (solo carte importate) ----
        const opzioni = [];
        if (multipla) {
            const contenitore = $('[data-opzioni]', el);
            const aggiorna = () => { $('[data-azione=aggiungi-opzione]', el).hidden = opzioni.length >= MAX_RISPOSTE; };
            const aggiungi = (testo = '', corretta = false) => {
                if (opzioni.length >= MAX_RISPOSTE) return null;
                const riga = document.createElement('div');
                riga.className = 'opzione';
                riga.innerHTML = `
                    <label class="spunta-corretta" title="Risposta corretta">
                        <input type="checkbox" ${corretta ? 'checked' : ''}><span>${ico('spunta')}</span>
                    </label>
                    <div class="opzione-editor"></div>
                    <button type="button" class="btn-icona" data-rimuovi aria-label="Rimuovi risposta">${ico('chiudi')}</button>`;
                contenitore.appendChild(riga);
                const o = { spunta: $('input', riga), editor: Ricco.crea($('.opzione-editor', riga), { html: testo, segnaposto: `Risposta ${'ABCDEF'[opzioni.length]}`, compatto: true }) };
                $('[data-rimuovi]', riga).addEventListener('click', () => {
                    if (opzioni.length <= 2) { Ui.toast('Servono almeno due risposte', 'errore'); return; }
                    opzioni.splice(opzioni.indexOf(o), 1);
                    riga.remove();
                    aggiorna();
                });
                opzioni.push(o);
                aggiorna();
                return o;
            };
            carta.risposte.forEach(r => aggiungi(r.testo, r.corretta));
            this.aggiungiOpzione = aggiungi;
        }

        // ---- Tag ----
        const boxTag = $('[data-tag]', el);
        const inputTag = $('input', boxTag);
        const disegnaTag = () => {
            $$('.chip', boxTag).forEach(x => x.remove());
            tag.forEach((t, i) => inputTag.insertAdjacentHTML('beforebegin',
                `<span class="chip">${esc(t)}<button type="button" data-togli-tag="${i}" aria-label="Togli tag">${ico('chiudi')}</button></span>`));
        };
        const aggiungiTag = () => {
            const nuovi = inputTag.value.split(',').map(t => t.trim()).filter(t => t && !tag.includes(t));
            tag.push(...nuovi);
            inputTag.value = '';
            disegnaTag();
        };
        inputTag.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); aggiungiTag(); }
            else if (e.key === 'Backspace' && !inputTag.value && tag.length) { tag.pop(); disegnaTag(); }
        });
        inputTag.addEventListener('change', aggiungiTag);   // scelta dalla lista dei suggerimenti
        inputTag.addEventListener('blur', aggiungiTag);
        boxTag.addEventListener('click', e => {
            const b = e.target.closest('[data-togli-tag]');
            if (b) { tag.splice(+b.dataset.togliTag, 1); disegnaTag(); } else inputTag.focus();
        });
        disegnaTag();

        // ---- Lettura, controllo, salvataggio ----
        const raccogli = () => ({
            domanda: domanda.valore(),
            risposte: multipla
                ? opzioni.map(o => ({ testo: o.editor.valore(), corretta: o.spunta.checked }))
                : [{ testo: risposta.valore(), corretta: true }],
            suggerimento: suggerimento.value.trim(),
            spiegazione: Ricco.vuoto(spiegazione.valore()) ? '' : spiegazione.valore(),
            tag: [...tag, ...inputTag.value.split(',').map(t => t.trim()).filter(t => t && !tag.includes(t))],
            madre: sceltaMadre.value || null,
            mappa: legame,
            fonte: leggiFonte(),
        });
        const impronta = () => JSON.stringify(raccogli());
        const iniziale = impronta();
        let salvata = false;
        const modificata = () => !salvata && impronta() !== iniziale;

        const valida = dati => {
            if (Ricco.vuoto(dati.domanda)) { Ui.toast('Scrivi la domanda', 'errore'); domanda.focus(); return false; }
            if (!multipla) {
                if (Ricco.vuoto(dati.risposte[0].testo) && !dati.mappa) { Ui.toast('Scrivi la risposta o collega la carta a un nodo della mappa', 'errore'); risposta.focus(); return false; }
                return true;
            }
            dati.risposte = dati.risposte.filter(r => !Ricco.vuoto(r.testo));
            if (dati.risposte.length < 2) { Ui.toast('Servono almeno due risposte compilate', 'errore'); return false; }
            if (!dati.risposte.some(r => r.corretta)) { Ui.toast('Spunta almeno una risposta corretta', 'errore'); return false; }
            return true;
        };

        // dopo: 'set' torna al set · 'sorella' nuova carta allo stesso livello · 'figlia' nuova carta sotto questa
        const salva = (dopo = 'set') => {
            const dati = raccogli();
            if (!valida(dati)) return;
            let salvataCarta;
            if (nuova) salvataCarta = Dati.creaCarta(s.id, dati, { genitoreId: dati.madre });
            else {
                salvataCarta = Dati.aggiornaCarta(carta.id, dati);
                Dati.impostaMadre(carta.id, dati.madre);
            }
            salvata = true;
            Ui.toast(nuova ? 'Flashcard creata' : 'Modifiche salvate', 'successo', 1600);
            if (dopo === 'sorella') {
                this.tagPrecedenti = dati.tag;
                Router.vai(`/carta/nuova?set=${s.id}${dati.madre ? '&genitore=' + dati.madre : ''}`);
            } else if (dopo === 'figlia') {
                Router.vai(`/carta/nuova?set=${s.id}&genitore=${salvataCarta.id}`);
            } else Router.vai('/set/' + s.id);
        };

        Router.impostaGuardia(() => !modificata() || confirm('Hai modifiche non salvate. Uscire senza salvare?'));
        window.onbeforeunload = e => { if (modificata()) { e.preventDefault(); e.returnValue = ''; } };

        this.tasti = e => {
            if (Ui.finestraAperta()) return;
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); salva('set'); }
            else if (ctrl && e.key === 'Enter') { e.preventDefault(); salva(e.shiftKey ? 'figlia' : nuova ? 'sorella' : 'set'); }
        };
        document.addEventListener('keydown', this.tasti);

        Ui.collegaAzioni(el, {
            salva: () => salva('set'),
            'salva-sorella': () => salva('sorella'),
            'salva-figlia': () => salva('figlia'),
            annulla: () => Router.vai('/set/' + s.id),
            vai: b => { if (b.dataset.id) Router.vai('/carta/' + b.dataset.id); },
            'aggiungi-opzione': () => { const o = this.aggiungiOpzione && this.aggiungiOpzione(); if (o) o.editor.focus(); },
            'scegli-nodo': async () => {
                const scelto = await VistaMappa.scegliNodo({ setId: s.id, attuale: legame });
                if (scelto === undefined) return;
                legame = scelto;
                disegnaLegame();
            },
            'togli-nodo': () => { legame = null; disegnaLegame(); },
            'prova-fonte': () => { const f = leggiFonte(); if (f) Materiali.apri(f.materiale, f); },
            elimina: async () => {
                const figlie = Dati.figlie(carta).length;
                const ok = await Ui.conferma(`La flashcard verrà eliminata definitivamente.${figlie ? ` Le sue ${plurale(figlie, 'domanda figlia sale', 'domande figlie salgono')} di un livello.` : ''}`,
                    { titolo: 'Eliminare la flashcard?', ok: 'Elimina', pericolo: true });
                if (!ok) return;
                Dati.eliminaCarta(carta.id);
                salvata = true;
                Ui.toast('Flashcard eliminata');
                Router.vai('/set/' + s.id);
            },
            altro: b => Ui.menu(b, [
                { testo: 'Duplica', icona: 'copia', clic: () => {
                    const dati = raccogli();
                    const copia = Dati.creaCarta(s.id, { ...carta, ...dati }, { genitoreId: dati.madre });
                    Ui.toast('Flashcard duplicata in fondo alle sue sorelle', 'successo');
                    salvata = true;
                    Router.vai('/carta/' + copia.id);
                } },
                { testo: 'Sposta in un altro set (con le figlie)', icona: 'cartella', clic: async () => {
                    const dest = await Ui.scegliSet({ titolo: 'Sposta in…', testoOk: 'Sposta' });
                    if (!dest || dest === s.id) return;
                    if (modificata()) Dati.aggiornaCarta(carta.id, raccogli());
                    Dati.spostaCarta(carta.id, dest);
                    salvata = true;
                    Ui.toast('Flashcard spostata', 'successo');
                    Router.vai('/set/' + dest);
                } },
                { testo: 'Reimposta il progresso', icona: 'ruota', clic: () => {
                    Dati.reimpostaProgressi([carta]);
                    Ui.toast('Ora la carta risulta mai studiata');
                    $('[data-stato-carta]', el).innerHTML = statoCarta();
                    disegnaRipasso();
                    $$('[data-valutazione]', el).forEach(b => { b.classList.remove('attivo'); b.setAttribute('aria-checked', 'false'); });
                } },
            ]),
        });

        // ---- Ripetizione spaziata a mano: N° Rep, ultimo ripasso, intervallo, prossima revisione (si salva subito) ----
        const statoCarta = () => `${ico('orologio')}${esc(Srs.descrivi(carta))} · ${plurale(carta.srs.ripetizioni || 0, 'risposta data', 'risposte date')}`;
        const disegnaRipasso = () => {
            const box = $('[data-ripasso]', el);
            if (!box) return;
            const sr = Srs.normalizza(carta.srs);
            const p = Srs.prossima(carta);
            // Una carta mai valutata non ha date sue: prima si sceglie la valutazione
            const senzaDate = Srs.valutazione(carta) == null && !sr.allineata;
            const scarso = sr.ultimaValutazione === Srs.SCARSO;
            const minimo = !scarso && sr.giorno ? chiaveGiorno(aggiungiGiorni(daChiaveGiorno(sr.giorno), 1)) : '';
            const blocco = senzaDate ? 'disabled title="Mai valutata: scegli una valutazione qui sopra per darle delle date"' : '';
            box.innerHTML = `
                <label class="campo-mini"><span>N° Rep</span><input type="number" min="0" step="1" data-srs="rep" value="${sr.rep || 0}" title="Quante volte l'hai ripassata: cambiandolo, l'intervallo torna quello della sequenza per quella rep"></label>
                <label class="campo-mini"><span>Ultimo ripasso</span><input type="date" data-srs="giorno" value="${sr.giorno || ''}" max="${chiaveGiorno()}" ${blocco}></label>
                <label class="campo-mini"><span>Intervallo (giorni)</span><input type="number" min="1" step="1" data-srs="intervallo" value="${sr.giorno ? sr.intervallo : ''}" ${blocco || (sr.giorno ? '' : 'disabled title="Prima serve l\'ultimo ripasso"')}></label>
                <label class="campo-mini"><span>${scarso ? 'Da rifare dal' : 'Prossima revisione'}</span><input type="date" data-srs="prossima" value="${p ? chiaveGiorno(p) : ''}" ${minimo ? `min="${minimo}"` : ''} ${blocco}></label>`;
        };
        const ripasso = $('[data-ripasso]', el);
        if (ripasso) {
            disegnaRipasso();
            ripasso.addEventListener('change', e => {
                const campo = e.target.closest('[data-srs]');
                if (!campo) return;
                const k = campo.dataset.srs, v = campo.value;
                const errore = k === 'giorno' && v > chiaveGiorno() ? "L'ultimo ripasso non può essere nel futuro"
                    : k === 'intervallo' && !Srs.giorni(v) ? "L'intervallo è di almeno 1 giorno"
                        : k === 'prossima' && (!v || (Srs.valutazione(carta) !== Srs.SCARSO && carta.srs.giorno && v <= carta.srs.giorno)) ? "La prossima revisione deve venire dopo l'ultimo ripasso"
                            : '';
                if (errore) { Ui.toast(errore, 'errore'); disegnaRipasso(); return; }
                Dati.aggiornaSrs(carta.id, { [k]: k === 'giorno' ? v || null : v });
                disegnaRipasso();
                $('[data-stato-carta]', el).innerHTML = statoCarta();
                App.aggiornaPiede();
                Ui.toast('Salvato', 'successo', 1200);
            });
        }

        // Valutazione scelta a mano: si salva subito
        el.addEventListener('click', e => {
            const b = e.target.closest('[data-valutazione]');
            if (!b || nuova) return;
            const v = b.dataset.valutazione === '' ? null : +b.dataset.valutazione;
            Dati.impostaValutazione([carta], v);
            $$('[data-valutazione]', el).forEach(x => { const si = x.dataset.valutazione === b.dataset.valutazione; x.classList.toggle('attivo', si); x.setAttribute('aria-checked', String(si)); });
            $('[data-stato-carta]', el).innerHTML = statoCarta();
            disegnaRipasso();
            Ui.toast(`Valutazione: ${v == null ? 'mai valutata' : Srs.VALUTAZIONI[v].nome}`, 'successo', 1800);
        });

        if (nuova) domanda.focus();
    },

    esci() {
        if (this.tasti) document.removeEventListener('keydown', this.tasti);
        this.tasti = null;
        this.aggiungiOpzione = null;
        window.onbeforeunload = null;
    },
};
