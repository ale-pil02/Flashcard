// Set di flashcard: avanzamento, riquadro Studia, sotto-set, revisioni degli argomenti, materiali ed elenco
// delle carte ad albero.
//
// L'elenco funziona come uno schema: ogni carta può avere una domanda madre.
// Con una riga selezionata: Tab = rientra (diventa figlia della carta sopra),
// Maiusc+Tab = esce di un livello, Alt+↑/↓ = sposta tra le sorelle, ↑/↓ = scorre le righe.

Viste.set = {
    nav: 'libreria',
    titolo: 'Set',
    filtri: { setId: null, testo: '', tag: '', stato: '' },
    pannelloRevisioni: 'set',   // sezione Revisioni del set: 'set' (gli argomenti) o 'carte' (le flashcard)
    soloSfasate: false,         // pannello "Per flashcard": solo le carte sfasate rispetto al set
    chiuse: new Set(),   // carte con i rami chiusi

    mostra(el, params) {
        const ico = Ui.ico;
        const s = Dati.set(params.id);
        if (!s) {
            el.innerHTML = `<div class="pagina">${Ui.vuoto({ icona: 'avviso', titolo: 'Set non trovato', azioni: `<a class="btn btn-secondario" href="#/libreria">Torna alla libreria</a>` })}</div>`;
            return;
        }
        const m = Dati.materia(s.materiaId);
        App.contesto = { setId: s.id, materiaId: s.materiaId };
        document.title = s.nome + ' · Flashcard';
        // I filtri restano quando torni allo stesso set dall'editor
        if (this.filtri.setId !== s.id) this.filtri = { setId: s.id, testo: '', tag: '', stato: '' };
        Selezione.prepara('set:' + s.id);

        const percorso = Dati.percorsoSet(s.id);
        const sotto = Dati.sottoSet(s.id);
        const tutte = Dati.carteConSottoSet(s.id);
        const c = Dati.conteggi(tutte);
        let albero = Dati.alberoDiSet(s.id);
        const proprie = albero.length;
        // Carte di dettaglio: il tasto compare solo se ce ne sono, e dice quante ne sta nascondendo
        const comprese = Dati.carteConSottoSet(s.id, { tutte: true });
        const nascosti = Dati.dettagliNascosti();
        const conDettagli = comprese.some(Dati.eDettaglio);
        const nascoste = comprese.length - tutte.length;
        const proprieNascoste = Dati.carteDiSet(s.id, { tutte: true }).length - proprie;
        const tag = Dati.tagDi(albero.map(n => n.carta));

        el.innerHTML = `
            <div class="pagina">
                <nav class="briciole">
                    <a href="#/libreria">Libreria</a>${ico('destra')}
                    ${m ? `<a href="#/materia/${m.id}">${esc(m.nome)}</a>${ico('destra')}` : ''}
                    ${percorso.map(p => `<a href="#/set/${p.id}">${esc(p.nome)}</a>${ico('destra')}`).join('')}
                    <span>${esc(s.nome)}</span>
                </nav>
                <header class="pagina-testa">
                    <div>
                        <h1>${esc(s.nome)}</h1>
                        <p class="sottotitolo">${plurale(c.totale, 'flashcard', 'flashcard')}${nascoste ? ` · ${plurale(nascoste, 'dettaglio nascosto', 'dettagli nascosti')}` : ''}${sotto.length ? ` · ${plurale(sotto.length, 'sotto-set', 'sotto-set')}` : ''}${s.ultimoStudio ? ` · studiato ${distanzaGiorni(s.ultimoStudio)}` : ''}</p>
                        ${s.descrizione ? `<p class="descrizione">${esc(s.descrizione)}</p>` : ''}
                    </div>
                    <div class="azioni-testa">
                        <button type="button" class="btn-icona btn-bordo" data-azione="menu" aria-label="Altre azioni">${ico('altro')}</button>
                    </div>
                </header>

                ${c.totale ? `
                <section class="riquadro riquadro-avanzamento">
                    <div class="avanzamento-testa">
                        <span><b>${Ui.percentuale(c.imparate, c.totale)}%</b> imparate${sotto.length ? ' <small>(compresi i sotto-set)</small>' : ''}</span>
                    </div>
                    ${Ui.barraStato(c, { alta: true })}
                    ${Ui.legendaStato(c)}
                </section>
                ${Ui.pannelloStudio(tutte)}` : ''}

                ${sotto.length ? `
                <section class="sezione${Ui.classeApribile('sotto-set')}">
                    <div class="sezione-testa">
                        ${Ui.titoloApribile('sotto-set', `Sotto-set <span class="conteggio">${sotto.length}</span>`)}
                        <button type="button" class="btn btn-secondario btn-piccolo" data-azione="nuovo-sottoset">${ico('piu')}Nuovo sotto-set</button>
                    </div>
                    <div class="sezione-corpo">
                        <div class="griglia-set">${sotto.map(x => Ui.tesseraSet(x, { conMateria: false, conPercorso: false })).join('')}</div>
                    </div>
                </section>` : ''}

                <div data-revisioni-set></div>

                <div data-materiali-set></div>

                <section class="sezione sezione-flashcard${Ui.classeApribile('flashcard')}">
                    <div class="sezione-testa">
                        ${Ui.titoloApribile('flashcard', `${sotto.length ? 'Flashcard di questo set' : 'Flashcard'} <span class="conteggio">${proprie}</span>`)}
                        <div class="azioni-riga">
                            ${conDettagli ? `<button type="button" class="btn ${nascosti ? 'btn-secondario' : 'btn-fantasma'} btn-piccolo" data-azione="dettagli"
                                title="${nascosti ? 'Fa ricomparire le carte con il tag «dettaglio» in tutta l\'app' : 'Nasconde le carte con il tag «dettaglio» in tutta l\'app: niente righe, conteggi né studio'}">
                                ${ico(nascosti ? 'occhio' : 'occhio-chiuso')}${nascosti ? `Mostra dettagli${nascoste ? ` (${nascoste})` : ''}` : 'Nascondi dettagli'}</button>` : ''}
                            ${proprie ? Selezione.pulsante() : ''}
                            ${sotto.length ? '' : `<button type="button" class="btn btn-fantasma btn-piccolo" data-azione="nuovo-sottoset">${ico('cartella')}Sotto-set</button>`}
                            <button type="button" class="btn btn-primario btn-piccolo" data-azione="nuova-carta">${ico('piu')}Nuova flashcard</button>
                        </div>
                    </div>
                    <div class="sezione-corpo">
                    ${proprie ? `
                    <div class="filtri">
                        <label class="ricerca ricerca-piccola">${ico('cerca')}<input type="search" placeholder="Cerca nel set…" value="${esc(this.filtri.testo)}" data-filtro="testo" aria-label="Cerca nel set"></label>
                        <select data-filtro="stato" aria-label="Filtra per stato">
                            <option value="">Tutte le carte</option>
                            <option value="daRipassare">Da ripassare</option>
                            ${CATEGORIE.map(k => `<option value="${k}">${NOMI_CATEGORIE[k]}</option>`).join('')}
                        </select>
                        ${tag.length ? `<select data-filtro="tag" aria-label="Filtra per tag">
                            <option value="">Tutti i tag</option>
                            ${tag.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                        </select>` : ''}
                    </div>
                    <div class="albero-carte riquadro" data-lista></div>
                    <p class="nota nota-albero">${ico('tastiera')}Seleziona una riga: <kbd>Tab</kbd> la rientra sotto la carta sopra, <kbd>Maiusc</kbd>+<kbd>Tab</kbd> la riporta indietro, <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> la sposta.</p>`
                    : proprieNascoste ? Ui.vuoto({
                        icona: 'occhio-chiuso', titolo: 'Ci sono solo dettagli nascosti',
                        testo: `${plurale(proprieNascoste, 'flashcard con il tag «dettaglio» è nascosta', 'flashcard con il tag «dettaglio» sono nascoste')}.`,
                        azioni: `<button type="button" class="btn btn-secondario" data-azione="dettagli">${ico('occhio')}Mostra dettagli</button>`,
                    })
                    : Ui.vuoto({
                        icona: 'carte', titolo: sotto.length ? 'Nessuna flashcard direttamente in questo set' : 'Questo set è vuoto',
                        testo: sotto.length ? 'Le carte stanno nei sotto-set; puoi aggiungerne anche qui.' : 'Scrivi la prima flashcard o importale da un file (il testo o l\'Excel esportati dall\'app, oppure un CSV).',
                        azioni: `<button type="button" class="btn btn-primario" data-azione="nuova-carta">${ico('piu')}Nuova flashcard</button>
                                 <button type="button" class="btn btn-secondario" data-azione="importa">${ico('carica')}Importa</button>`,
                    })}
                    </div>
                </section>
            </div>`;

        Materiali.monta($('[data-materiali-set]', el), s.id);

        // ---- Revisioni: solo gli argomenti di questo set e dei suoi sotto-set, "Per set" o "Per flashcard" ----
        const boxRevisioni = $('[data-revisioni-set]', el);
        const argomentiDelSet = () => Dati.argomentiDiSet(s.id, { conSottoSet: true });
        const setIds = [s.id, ...Dati.discendentiSet(s.id)];
        const vociCarte = () => { const tutte = Revisioni.tutteLeVoci({ setIds }); return this.soloSfasate ? tutte.filter(Revisioni.sfasata) : tutte; };
        const contoRevisioni = () => {
            const c = Revisioni.conteggi(argomentiDelSet());
            const n = c.scaduto + c.oggi;
            return n ? `<span class="avviso-rev avviso-${c.scaduto ? 'scaduto' : 'oggi'}"><i></i>${n} da ripassare</span>` : '';
        };
        const disegnaRevisioni = (fuoco = null) => {
            const lista = argomentiDelSet();
            const sfasate = Revisioni.carteDevianti({ setIds });
            const daFareCarte = sfasate.filter(Revisioni.cartaDaRipassare).length;
            const perCarte = this.pannelloRevisioni === 'carte' && lista.length > 0;
            boxRevisioni.innerHTML = `
                <section class="sezione sezione-revisioni${Ui.classeApribile('revisioni')}">
                    <div class="sezione-testa">
                        ${Ui.titoloApribile('revisioni', `Revisioni ${lista.length ? `<span class="conteggio">${lista.length}</span>` : ''}<span data-conto-revisioni>${contoRevisioni()}</span>`)}
                        <div class="azioni-riga">
                            <a class="btn btn-fantasma btn-piccolo" href="#/revisioni">${ico('calendario-spunta')}Tutte le revisioni</a>
                            ${perCarte && daFareCarte ? `<button type="button" class="btn btn-primario btn-piccolo" data-azione="ripassa-carte-set" title="Le flashcard sfasate da ripassare oggi o in ritardo: le altre si ripassano con il set">${ico('fulmine')}Ripassa le sfasate da fare (${daFareCarte})</button>` : ''}
                            ${lista.length && !perCarte ? `<button type="button" class="btn btn-secondario btn-piccolo" data-azione="nuovo-argomento">${ico('piu')}Nuovo argomento</button>` : ''}
                        </div>
                    </div>
                    <div class="sezione-corpo">
                        ${lista.length ? `
                        <div class="pannelli-rev pannelli-rev-set" role="tablist" aria-label="Pannello delle revisioni">
                            <button type="button" role="tab" class="pannello-rev${perCarte ? '' : ' attivo'}" data-pannello-rev="set" aria-selected="${!perCarte}">${ico('cartella')}Per set</button>
                            <button type="button" role="tab" class="pannello-rev${perCarte ? ' attivo' : ''}" data-pannello-rev="carte" aria-selected="${perCarte}">
                                ${ico('carte')}Per flashcard${sfasate.length ? `<span class="conteggio${daFareCarte ? ' rosso' : ''}" title="Flashcard sfasate${daFareCarte ? ' da ripassare' : ''}">${daFareCarte || sfasate.length}</span>` : ''}</button>
                        </div>` : ''}
                        ${perCarte ? `<div class="segmentato piccolo filtro-carte-set" role="group" aria-label="Quali flashcard">
                            <button type="button" class="${this.soloSfasate ? '' : 'attivo'}" data-filtro-carte="tutte">${ico('carte')}Tutte</button>
                            <button type="button" class="${this.soloSfasate ? 'attivo' : ''}" data-filtro-carte="sfasate">${ico('sincronizza')}Solo sfasate${sfasate.length ? ` (${sfasate.length})` : ''}</button>
                        </div>` : ''}
                        <div data-tabella-revisioni></div>
                    </div>
                </section>`;
            const pannelli = $('.pannelli-rev-set', boxRevisioni);
            if (pannelli) pannelli.addEventListener('click', e => {
                const b = e.target.closest('[data-pannello-rev]');
                if (!b || b.dataset.pannelloRev === (perCarte ? 'carte' : 'set')) return;
                this.pannelloRevisioni = b.dataset.pannelloRev;
                disegnaRevisioni();
            });
            const ripassaCarte = $('[data-azione="ripassa-carte-set"]', boxRevisioni);
            if (ripassaCarte) ripassaCarte.addEventListener('click', () => Revisioni.avviaRipassoCarte(Revisioni.carteDevianti({ setIds }).filter(Revisioni.cartaDaRipassare)));
            const filtro = $('.filtro-carte-set', boxRevisioni);
            if (filtro) filtro.addEventListener('click', e => {
                const b = e.target.closest('[data-filtro-carte]');
                if (!b || (b.dataset.filtroCarte === 'sfasate') === this.soloSfasate) return;
                this.soloSfasate = b.dataset.filtroCarte === 'sfasate';
                disegnaRevisioni();
            });
            if (perCarte) {
                Revisioni.montaCarte($('[data-tabella-revisioni]', boxRevisioni), {
                    voci: vociCarte,
                    perUrgenza: this.soloSfasate,
                    dopo: () => disegnaRevisioni(),
                    vuoto: this.soloSfasate
                        ? `<p class="nota nota-centrata">Tutte le flashcard di questo set vanno al passo con il set. Qui compaiono quelle valutate Ok o Scarso, quelle aggiunte dopo l'ultimo ripasso e mai valutate e quelle ripassate o cambiate per conto loro.</p>`
                        : `<p class="nota nota-centrata">Il set non ha ancora flashcard.</p>`,
                });
                return;
            }
            const tabella = Revisioni.monta($('[data-tabella-revisioni]', boxRevisioni), {
                chiave: 'set:' + s.id,
                argomenti: argomentiDelSet,
                colonnaSet: sotto.length > 0,
                nuovo: () => Revisioni.formNuovo({ setId: s.id }),
                vuoto: `<button type="button" class="riquadro riquadro-tratteggiato" data-azione="nuovo-argomento">${ico('calendario-spunta')}
                    <span>Aggiungi «${esc(s.nome)}» alle revisioni: segni quando lo ripassi e l'app ti dice quando rifarlo (dopo ${Srs.anteprimaSequenza(4).join(', ')}… giorni)</span></button>`,
                dopo: () => { const box = $('[data-conto-revisioni]', boxRevisioni); if (box) box.innerHTML = contoRevisioni(); },
            });
            if (fuoco) tabella.disegna(fuoco);
        };
        disegnaRevisioni();

        // ---- Elenco ad albero ----
        const lista = $('[data-lista]', el);
        const filtrando = () => !!(this.filtri.testo || this.filtri.stato || this.filtri.tag);

        // Quante carte stanno sotto a questa nell'elenco (senza contare i dettagli nascosti)
        const quanteSotto = id => {
            const i = albero.findIndex(x => x.carta.id === id);
            let k = i + 1;
            while (k < albero.length && albero[k].livello > albero[i].livello) k++;
            return k - i - 1;
        };

        const nodoHtml = (n, piatto) => {
            const chiusa = this.chiuse.has(n.carta.id);
            return `
                <div class="nodo-carta${Selezione.classe(n.carta.id)}" data-id="${n.carta.id}" data-sel-riga="${n.carta.id}" style="--livello:${piatto ? 0 : n.livello}">
                    ${Selezione.casella(n.carta.id)}
                    <span class="nodo-rientro" aria-hidden="true"></span>
                    ${n.figlie && !piatto
                        ? `<button type="button" class="nodo-espandi${chiusa ? '' : ' aperto'}" data-azione="espandi" data-id="${n.carta.id}" title="${chiusa ? 'Apri' : 'Chiudi'} il ramo (${plurale(quanteSotto(n.carta.id), 'domanda', 'domande')})">${ico('destra')}</button>`
                        : '<span class="nodo-espandi vuoto"></span>'}
                    ${Ui.rigaCarta(n.carta)}
                    <button type="button" class="btn-icona nodo-menu" data-azione="menu-carta" data-id="${n.carta.id}" aria-label="Azioni sulla carta">${ico('altro')}</button>
                </div>`;
        };

        const filtrate = () => {
            const f = this.filtri;
            const q = f.testo.toLowerCase();
            return albero.filter(({ carta }) =>
                (!f.stato || (f.stato === 'daRipassare' ? Srs.daRipassare(carta) || Revisioni.nuovaDaRipassare(carta) : Srs.categoria(carta) === f.stato))
                && (!f.tag || carta.tag.includes(f.tag))
                && (!q || testoDaHtml(carta.domanda).toLowerCase().includes(q)
                    || carta.risposte.some(r => testoDaHtml(r.testo).toLowerCase().includes(q))));
        };

        const disegnaLista = (focusId = null) => {
            if (!lista) return;
            let righe;
            if (filtrando()) {
                righe = filtrate();
            } else {
                // Nasconde le discendenti dei rami chiusi
                righe = [];
                let sottoLivello = null;
                albero.forEach(n => {
                    if (sottoLivello !== null) { if (n.livello > sottoLivello) return; sottoLivello = null; }
                    righe.push(n);
                    if (n.figlie && this.chiuse.has(n.carta.id)) sottoLivello = n.livello;
                });
            }
            lista.classList.toggle('piatto', filtrando());
            lista.innerHTML = righe.length ? righe.map(n => nodoHtml(n, filtrando())).join('')
                : `<p class="nota nota-centrata">Nessuna flashcard corrisponde ai filtri.</p>`;
            if (focusId) { const a = $(`.nodo-carta[data-id="${focusId}"] .riga-carta`, lista); if (a) a.focus(); }
        };

        // Dopo un rientro o uno spostamento ridisegna solo l'elenco e tiene il fuoco sulla carta
        const struttura = (operazione, id, avviso) => {
            if (filtrando()) { Ui.toast('Togli i filtri per cambiare la struttura', 'errore'); return; }
            if (!operazione(id)) { if (avviso) Ui.toast(avviso, 'errore'); return; }
            const c = Dati.carta(id);
            if (c && c.genitoreId) this.chiuse.delete(c.genitoreId);
            albero = Dati.alberoDiSet(s.id);
            disegnaLista(id);
        };
        const rientra = id => struttura(Dati.aumentaRientro, id, 'Serve una carta sopra, allo stesso livello, sotto cui rientrare');
        const esce = id => struttura(Dati.riduciRientro, id, 'È già una domanda principale');
        const sposta = (id, verso) => struttura(x => Dati.spostaTraSorelle(x, verso), id);

        $$('[data-filtro]', el).forEach(campo => {
            if (campo.tagName === 'SELECT') campo.value = this.filtri[campo.dataset.filtro];
            campo.addEventListener('input', debounce(() => { this.filtri[campo.dataset.filtro] = campo.value.trim(); disegnaLista(); }, 120));
        });
        disegnaLista();

        // "Tutte" = le carte che passano i filtri, comprese quelle dentro i rami chiusi
        Selezione.monta(el, {
            tutte: () => (filtrando() ? filtrate() : albero).map(n => n.carta.id),
            ridisegna: () => disegnaLista(),
            setId: s.id,
        });

        if (lista) lista.addEventListener('keydown', e => {
            const riga = e.target.closest('.riga-carta');
            const nodo = riga && riga.closest('.nodo-carta');
            if (!nodo) return;
            const id = nodo.dataset.id;
            if (e.key === 'Tab') { e.preventDefault(); if (e.shiftKey) esce(id); else rientra(id); }
            else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); sposta(id, e.key === 'ArrowUp' ? -1 : 1); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const vicino = e.key === 'ArrowUp' ? nodo.previousElementSibling : nodo.nextElementSibling;
                if (vicino) $('.riga-carta', vicino).focus();
            }
        });

        Ui.collegaAzioni(el, {
            dettagli: () => {
                const nascondi = !Dati.dettagliNascosti();
                Dati.salvaImpostazioni({ nascondiDettagli: nascondi });
                App.ridisegna();
                App.aggiornaPiede();
                Ui.toast(nascondi ? 'Dettagli nascosti in tutta l\'app: non contano e non si studiano' : 'Dettagli di nuovo visibili', 'successo');
            },
            personalizza: () => Viste.studio.personalizza({ setId: s.id }),
            'nuova-carta': () => Router.vai('/carta/nuova?set=' + s.id),
            // Stesso modulo della sezione Revisioni, con il set già scelto
            'nuovo-argomento': async () => {
                const a = await Revisioni.formNuovo({ setId: s.id });
                if (!a) return;
                Ui.apriSezione('revisioni');
                disegnaRevisioni(a.id);
                App.aggiornaPiede();
            },
            'nuovo-sottoset': async () => { const x = await Ui.nuovoSet(s.materiaId, s.id); if (x) Router.vai('/set/' + x.id); },
            importa: () => Importa.apriDialogo({ setId: s.id }),
            espandi: b => {
                const id = b.dataset.id;
                if (this.chiuse.has(id)) this.chiuse.delete(id); else this.chiuse.add(id);
                disegnaLista();
            },
            'menu-carta': b => {
                const id = b.dataset.id;
                Ui.menu(b, [
                    { testo: 'Aggiungi domanda figlia', icona: 'ramo', clic: () => Router.vai(`/carta/nuova?set=${s.id}&genitore=${id}`) },
                    { testo: 'Rientra (Tab)', icona: 'rientra', clic: () => rientra(id) },
                    { testo: 'Riporta indietro (Maiusc+Tab)', icona: 'esci-rientro', clic: () => esce(id) },
                    { testo: 'Sposta su', icona: 'su', clic: () => sposta(id, -1) },
                    { testo: 'Sposta giù', icona: 'giu', clic: () => sposta(id, 1) },
                    { testo: 'Cambia la valutazione…', icona: 'obiettivo', clic: () => Ui.menuValutazione(b, [Dati.carta(id)], () => App.ridisegna()) },
                    '-',
                    { testo: 'Elimina', icona: 'cestino', pericolo: true, clic: async () => {
                        const figlie = Dati.figlie(Dati.carta(id)).length;
                        const ok = await Ui.conferma(`La flashcard verrà eliminata definitivamente.${figlie ? ` Le sue ${plurale(figlie, 'domanda figlia sale', 'domande figlie salgono')} di un livello.` : ''}`,
                            { titolo: 'Eliminare la flashcard?', ok: 'Elimina', pericolo: true });
                        if (!ok) return;
                        Dati.eliminaCarta(id);
                        App.ridisegna();
                    } },
                ]);
            },
            menu: b => Ui.menu(b, [
                { testo: 'Modifica set', icona: 'matita', clic: async () => {
                    const dati = await Ui.formSet(s);
                    if (dati) { Dati.aggiornaSet(s.id, dati); App.ridisegna(); }
                } },
                { testo: 'Nuovo sotto-set', icona: 'cartella', clic: async () => { const x = await Ui.nuovoSet(s.materiaId, s.id); if (x) Router.vai('/set/' + x.id); } },
                { testo: 'Importa flashcard nel set', icona: 'carica', clic: () => Importa.apriDialogo({ setId: s.id }) },
                c.totale && { testo: 'Esporta le flashcard…', icona: 'scarica', clic: () => Importa.apriEsporta(s.id) },
                proprie && { testo: 'Apri tutti i rami', icona: 'occhio', clic: () => { this.chiuse.clear(); disegnaLista(); } },
                { testo: 'Modifiche recenti (annulla)', icona: 'annulla', clic: () => Storia.elenco() },
                c.totale && { testo: 'Reimposta i progressi', icona: 'ruota', clic: async () => {
                    const ok = await Ui.conferma(`Tutte le carte del set${sotto.length ? ' e dei sotto-set' : ''} torneranno <b>mai studiate</b>. Lo storico delle statistiche resta.`,
                        { titolo: 'Reimpostare i progressi?', ok: 'Reimposta', pericolo: true });
                    if (ok) { Dati.reimpostaProgressi(tutte); Ui.toast('Progressi reimpostati'); App.ridisegna(); }
                } },
                '-',
                { testo: 'Elimina set', icona: 'cestino', pericolo: true, clic: async () => {
                    const ok = await Ui.conferma(`Elimini <b>${esc(s.nome)}</b>${sotto.length ? ' con i suoi sotto-set' : ''} e ${plurale(c.totale, 'flashcard', 'flashcard')}? Non si può annullare.`,
                        { titolo: 'Eliminare il set?', ok: 'Elimina', pericolo: true });
                    if (!ok) return;
                    Dati.eliminaSet(s.id);
                    Ui.toast('Set eliminato');
                    const padre = percorso[percorso.length - 1];
                    Router.vai(padre ? '/set/' + padre.id : m ? '/materia/' + m.id : '/libreria');
                } },
            ]),
        });
    },
};
