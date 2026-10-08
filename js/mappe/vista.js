// La parte di mappa nella risposta di una flashcard.
//
// Una carta può essere collegata a un nodo di una mappa dell'app (carta.mappa = { id, nodo }): il nodo dove sta la
// risposta. Nella risposta compare tutto il sottoramo che lo contiene (il ramo principale, figlio del tema centrale),
// disegnato dalla mappa com'è in quel momento, quindi si aggiorna da solo quando la mappa cambia; il nodo della
// risposta è evidenziato. Il disegno è quello dell'editor (js/mappe/editor.js) in sola lettura.
// Le carte che non vengono da una mappa (per esempio da materiali in prosa) restano senza collegamento.

const VistaMappa = (() => {
    const ico = (...a) => Ui.ico(...a);
    const aperte = new Set();   // viste disegnate: si chiudono quando la pagina cambia

    // Sottoramo di un nodo: il ramo principale che lo contiene; per il tema centrale tutta la mappa,
    // per un nodo libero il suo alberello
    function ramoDi(m, nodo) {
        const catena = [...Mappe.antenati(m, nodo), nodo];
        if (catena[0] !== m.radice) return catena[0];
        return catena[1] || m.radice;
    }

    // Collegamento della carta: { m, n, ramo } se la mappa e il nodo ci sono ancora
    function risolvi(c) {
        const l = c && c.mappa;
        const m = l && Mappe.mappa(l.id);
        const n = m && m.nodi[l.nodo];
        return n ? { m, n, ramo: ramoDi(m, n.id) } : null;
    }

    function percorso(m, id) {
        return [...Mappe.antenati(m, id), id].map(x => Ui.tronca(Mappe.testoSemplice(m.nodi[x].testo) || '(vuoto)', 40));
    }

    function descrivi(c) {
        const x = risolvi(c);
        return x ? `${x.m.nome} › ${percorso(x.m, x.n.id).slice(1).join(' › ') || 'tema centrale'}` : '';
    }

    // Disegno in sola lettura: su una copia, così niente di quello che fa la vista arriva alla mappa vera
    function disegno(contenitore, m, opzioni) {
        const copia = structuredClone(m);
        Mappe.aggiorna(copia);
        const vista = EditorMappa(contenitore, copia, { solaLettura: true, ...opzioni });
        aperte.add(vista);
        return vista;
    }

    function chiudi(vista) {
        if (!vista || !aperte.has(vista)) return;
        aperte.delete(vista);
        vista.chiudi();
    }

    function chiudiTutte() { [...aperte].forEach(chiudi); }

    // Nella risposta: intestazione con il percorso e la parte di mappa, alta quanto serve (fino a altezzaMax).
    // Restituisce la vista (o null se il collegamento non vale più)
    function monta(box, c, { altezzaMax = 440 } = {}) {
        const x = risolvi(c);
        if (!x) {
            box.innerHTML = c && c.mappa ? `<p class="nota risposta-mappa-persa">${ico('avviso')}<span>Il nodo collegato a questa carta non c'è più nella mappa: collegala di nuovo dall'editor della carta.</span></p>` : '';
            return null;
        }
        const strada = percorso(x.m, x.n.id);
        box.innerHTML = `
            <div class="risposta-mappa">
                <div class="risposta-mappa-testa">
                    ${ico('mappa')}
                    <span class="risposta-mappa-percorso" title="${esc(strada.join(' › '))}"><b>${esc(x.m.nome)}</b>${strada.length > 1 ? ' › ' + esc(strada.slice(1).join(' › ')) : ''}</span>
                    <button type="button" class="btn-icona" data-vm="ingrandisci" title="Ingrandisci" aria-label="Ingrandisci la mappa">${ico('adatta')}</button>
                </div>
                <div class="risposta-mappa-tela" style="height:${altezzaMax}px"></div>
            </div>`;
        const tela = $('.risposta-mappa-tela', box);
        const vista = disegno(tela, x.m, { ramo: x.ramo, evidenzia: x.n.id });
        // Altezza: quella del ramo alla scala con cui ci sta in larghezza
        const b = vista.misure();
        const z = limita(Math.min(1, (tela.clientWidth - 32) / Math.max(b.w, 1)), 0.55, 1);
        tela.style.height = limita(Math.round(b.h * z + 40), 140, altezzaMax) + 'px';
        vista.inquadra();
        $('[data-vm="ingrandisci"]', box).addEventListener('click', () => ingrandisci(c));
        return vista;
    }

    // Vista grande in una finestra: zoom con la rotellina, sottoramo o mappa intera, e il pulsante per aprirla
    function ingrandisci(c) {
        const x = risolvi(c);
        if (!x) return;
        let vista = null, intera = false;
        const disegna = el => {
            chiudi(vista);
            vista = disegno($('.risposta-mappa-tela', el), x.m, { ramo: intera ? x.m.radice : x.ramo, evidenzia: x.n.id, zoomLibero: true });
            $('[data-vm="intera"]', el).textContent = intera ? 'Solo il sottoramo' : 'Tutta la mappa';
        };
        Ui.modale({
            titolo: x.m.nome, classe: 'modale-mappa-risposta',
            corpo: `
                <div class="risposta-mappa-azioni">
                    <span class="nota">${esc(percorso(x.m, x.n.id).join(' › '))}</span>
                    <button type="button" class="btn btn-secondario btn-piccolo" data-vm="intera">Tutta la mappa</button>
                </div>
                <div class="risposta-mappa-tela grande"></div>
                <p class="nota">Rotellina per ingrandire, trascina per spostarti.</p>`,
            azioni: [
                { testo: `${ico('mappa')}Apri nell'editor`, classe: 'btn-secondario', clic: md => { md.chiudi(); Router.vai(`/mappa/${x.m.id}?nodo=${x.n.id}`); } },
                { testo: 'Chiudi', classe: 'btn-primario', principale: true },
            ],
            alApri: el => {
                disegna(el);
                $('[data-vm="intera"]', el).addEventListener('click', () => { intera = !intera; disegna(el); });
            },
            alChiudere: () => chiudi(vista),
        });
    }

    // Scelta del nodo a cui collegare una carta: prima le mappe del set della carta, poi quelle della materia, poi le altre.
    // Restituisce { id, nodo }, null se si toglie il collegamento, undefined se si annulla
    function scegliNodo({ setId = null, attuale = null } = {}) {
        const s = setId && Dati.set(setId);
        const tutte = Mappe.tutte();
        const peso = x => (s && x.setId === s.id ? 0 : s && x.materiaId === s.materiaId ? 1 : 2);
        const mappe = tutte.slice().sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome));
        if (!mappe.length) { Ui.toast('Non hai ancora mappe: creane una nella sezione Mappe', 'errore'); return Promise.resolve(undefined); }
        const iniziale = attuale && Mappe.mappa(attuale.id) ? attuale.id : mappe[0].id;
        const gruppi = [['Di questo set', 0], ['Della stessa materia', 1], ['Altre mappe', 2]];
        return new Promise(risolviScelta => {
            let esito;
            let mappaId = iniziale;
            const righe = (filtro = '') => {
                const m = Mappe.mappa(mappaId);
                const q = filtro.trim().toLowerCase();
                const out = [];
                const visita = (id, livello) => {
                    const n = m.nodi[id];
                    if (!n) return;
                    const testo = Mappe.testoSemplice(n.testo) || '(vuoto)';
                    const trovato = !q || testo.toLowerCase().includes(q) || Mappe.testoSemplice(n.nota).toLowerCase().includes(q);
                    const et = (n.etichette || []).map(e => Mappe.testoSemplice(e.testo)).filter(Boolean).join(' · ');
                    if (trovato) out.push(`<button type="button" class="riga-struttura${attuale && attuale.id === m.id && attuale.nodo === id ? ' attiva' : ''}" data-nodo="${id}" style="--rientro:${q ? 0 : livello}">
                        <span class="testo-struttura">${esc(testo)}${et ? `<em class="et-struttura">${esc(et)}</em>` : ''}</span>${q ? `<small>${esc(percorso(m, id).slice(0, -1).join(' › '))}</small>` : ''}</button>`);
                    n.figli.forEach(f => visita(f, livello + 1));
                };
                visita(m.radice, 0);
                Mappe.radiciLibere(m).forEach(l => visita(l.id, 0));
                return out.join('') || '<p class="nota">Nessun nodo trovato.</p>';
            };
            Ui.modale({
                titolo: 'Collega la carta a un nodo', classe: 'modale-scegli-nodo',
                corpo: `
                    <p class="nota">Scegli il nodo dove sta la risposta: nella risposta comparirà tutto il suo sottoramo, sempre aggiornato con la mappa.</p>
                    <div class="riga-campi">
                        <label class="campo"><span>Mappa</span>
                            <select name="mappa">${gruppi.map(([nome, p]) => {
                                const lista = mappe.filter(x => peso(x) === p);
                                return lista.length ? `<optgroup label="${nome}">${lista.map(x => `<option value="${x.id}" ${x.id === iniziale ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</optgroup>` : '';
                            }).join('')}</select></label>
                        <label class="campo"><span>Cerca</span><input type="search" name="cerca" placeholder="Testo del nodo" autofocus></label>
                    </div>
                    <div class="struttura scelta-nodi" data-nodi>${righe()}</div>`,
                azioni: [
                    { testo: 'Annulla', classe: 'btn-fantasma' },
                    ...(attuale ? [{ testo: 'Togli il collegamento', classe: 'btn-secondario', clic: md => { esito = null; md.chiudi(); } }] : []),
                ],
                alApri: (el, md) => {
                    const cerca = $('[name=cerca]', el), lista = $('[data-nodi]', el);
                    $('[name=mappa]', el).addEventListener('change', e => { mappaId = e.target.value; lista.innerHTML = righe(cerca.value); });
                    cerca.addEventListener('input', () => { lista.innerHTML = righe(cerca.value); });
                    lista.addEventListener('click', e => {
                        const b = e.target.closest('[data-nodo]');
                        if (!b) return;
                        esito = { id: mappaId, nodo: b.dataset.nodo };
                        md.chiudi();
                    });
                },
                alChiudere: () => risolviScelta(esito),
            });
        });
    }

    return { ramoDi, risolvi, descrivi, monta, ingrandisci, scegliNodo, chiudi, chiudiTutte };
})();
