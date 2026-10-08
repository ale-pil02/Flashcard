// Filtri della sezione Revisioni, per i pannelli "Per set" e "Per flashcard": quali set, quali stati (revisione, stato o
// valutazione, rispetto al set), ordine crescente o decrescente (date di revisione, N° Rep, nome…) e colonne da
// nascondere. I filtri valgono finché l'app resta aperta; ordine e colonne nascoste restano in questo browser.
// Dentro un gruppo di stati basta una scelta, tra gruppi diversi servono tutte (es. Set A, In ritardo, Ok o Scarso).

const FiltriRevisioni = (() => {
    const ico = (...a) => Ui.ico(...a);
    const CHIAVE = 'flashcard-viste-revisioni';

    const setDi = { set: a => a.setId, carte: v => v.carta.setId };

    function gruppi(tipo) {
        const revisione = { id: 'revisione', testo: 'Revisione', di: x => Revisioni.avviso(x).tipo, voci: [
            ['scaduto', 'In ritardo'], ['oggi', 'Da fare oggi'], ['attesa', 'In attesa'], ['mai', tipo === 'carte' ? 'Mai ripassate' : 'Mai ripassati']] };
        if (tipo === 'set') return [revisione, {
            id: 'stato', testo: 'Stato', di: a => (Revisioni.STATI[Revisioni.statoDi(a)] ? Revisioni.statoDi(a) : 'nessuno'),
            voci: [...Object.entries(Revisioni.STATI).map(([k, v]) => [k, v.nome]), ['nessuno', 'Senza stato']],
        }];
        return [revisione, {
            id: 'valutazione', testo: 'Valutazione', di: v => { const x = Srs.valutazione(v.carta); return x == null ? 'nuova' : (Srs.VALUTAZIONI.find(y => y.valore === x) || {}).chiave; },
            voci: [['nuova', 'Mai valutata'], ...Srs.VALUTAZIONI.map(x => [x.chiave, x.nome])],
        }, {
            id: 'rispetto', testo: 'Rispetto al set', di: v => v.sfasatura.tipo,
            voci: [['passo', 'Al passo con il set'], ['prima', 'Prima del set'], ['dopo', 'Dopo il set'], ['scarso', 'Scarso: da rifare'], ['mai', 'Mai valutata'], ['senza-set', 'Set mai ripassato']],
        }];
    }

    const ORDINI = {
        set: [['prossima', 'Prossima revisione'], ['ultimo', 'Ultimo ripasso'], ['intervallo', 'Intervallo'], ['ripetizioni', 'N° Rep'], ['nome', 'Mazzo'], ['set', 'Set'], ['stato', 'Stato']],
        carte: [['prossima', 'Prossima revisione'], ['ultimo', 'Ultimo ripasso'], ['intervallo', 'Intervallo'], ['ripetizioni', 'N° Rep'], ['carta', 'Flashcard'], ['set', 'Set'], ['valutazione', 'Valutazione'], ['sfasatura', 'Rispetto al set']],
    };
    const nomeOrdine = (tipo, col) => ((ORDINI[tipo].find(o => o[0] === col) || [])[1]) || (col === 'avviso' ? 'Alert' : col);

    // ---- Stato dei filtri ---------------------------------------------------------------------

    const memoria = {};

    function salvate() {
        try { return JSON.parse(localStorage.getItem(CHIAVE) || '{}') || {}; } catch (e) { return {}; }
    }

    // { set: [id], scelte: { gruppo: [chiave] }, ordine: { colonna, verso }, nascoste: Set }
    function stato(tipo) {
        if (!memoria[tipo]) {
            const s = salvate()[tipo] || {};
            const o = s.ordine || {};
            memoria[tipo] = { set: [], scelte: {}, ordine: { colonna: o.colonna || null, verso: o.verso === -1 ? -1 : 1 }, nascoste: new Set(s.nascoste || []) };
        }
        return memoria[tipo];
    }

    function ricorda(tipo) {
        const f = stato(tipo);
        const tutte = salvate();
        tutte[tipo] = { ordine: f.ordine, nascoste: [...f.nascoste] };
        try { localStorage.setItem(CHIAVE, JSON.stringify(tutte)); } catch (e) { /* vale per questa pagina */ }
    }

    // I set scelti che ci sono nella lista (cambiando scheda restano scelti, ma contano solo se ci sono)
    function setAttivi(tipo, lista) {
        const presenti = new Set(lista.map(setDi[tipo]));
        return stato(tipo).set.filter(id => presenti.has(id));
    }

    function quantiStati(tipo) { return Object.values(stato(tipo).scelte).reduce((n, l) => n + l.length, 0); }

    function attivi(tipo, lista) { return setAttivi(tipo, lista).length + quantiStati(tipo); }

    function applica(tipo, lista) {
        const f = stato(tipo);
        const sets = new Set(setAttivi(tipo, lista));
        const gs = gruppi(tipo).filter(g => (f.scelte[g.id] || []).length);
        return lista.filter(x => (!sets.size || sets.has(setDi[tipo](x))) && gs.every(g => f.scelte[g.id].includes(g.di(x))));
    }

    function azzera(tipo) { const f = stato(tipo); f.set = []; f.scelte = {}; }

    // ---- Barra --------------------------------------------------------------------------------

    // contenitore: dove va la barra; base: () => la lista prima dei filtri; alCambio: () => void (ridisegna la vista)
    function barra(contenitore, { tipo, base, alCambio }) {
        const f = stato(tipo);

        const disegna = () => {
            const lista = base();
            const nSet = setAttivi(tipo, lista).length, nStati = quantiStati(tipo);
            const mostrati = applica(tipo, lista).length;
            const ord = f.ordine;
            contenitore.innerHTML = `
                <div class="barra-filtri-rev" role="toolbar" aria-label="Filtri e vista">
                    <button type="button" class="filtro-chip${nSet ? ' attivo' : ''}" data-filtro-apri="set">${ico('cartella')}Set${nSet ? `<b>${nSet}</b>` : ''}${ico('giu', 'filtro-freccia')}</button>
                    <button type="button" class="filtro-chip${nStati ? ' attivo' : ''}" data-filtro-apri="stato">${ico('cursori')}Stato${nStati ? `<b>${nStati}</b>` : ''}${ico('giu', 'filtro-freccia')}</button>
                    <span class="filtro-separatore"></span>
                    <button type="button" class="filtro-chip${ord.colonna ? ' attivo' : ''}" data-filtro-apri="ordine" title="Ordina le righe">${ico('elenco-num')}${ord.colonna ? esc(nomeOrdine(tipo, ord.colonna)) : 'Ordina'}${ico('giu', 'filtro-freccia')}</button>
                    ${ord.colonna ? `<button type="button" class="filtro-chip" data-filtro-verso title="Inverti l'ordine">${ico(ord.verso > 0 ? 'su' : 'giu')}${ord.verso > 0 ? 'Crescente' : 'Decrescente'}</button>` : ''}
                    <button type="button" class="filtro-chip${f.nascoste.size ? ' attivo' : ''}" data-filtro-apri="colonne" title="Mostra o nascondi le colonne">${ico(f.nascoste.size ? 'occhio-chiuso' : 'occhio')}Colonne${f.nascoste.size ? `<b>${f.nascoste.size} nascost${f.nascoste.size === 1 ? 'a' : 'e'}</b>` : ''}${ico('giu', 'filtro-freccia')}</button>
                    ${nSet || nStati ? `<span class="filtro-conto">${mostrati} di ${lista.length}</span>
                        <button type="button" class="btn btn-fantasma btn-piccolo" data-filtro-azzera>${ico('chiudi')}Azzera filtri</button>` : ''}
                </div>`;
        };

        const cambiato = () => { Ui.chiudiMenu(); alCambio(); };
        // Le scelte nelle tendine si applicano subito: si ridisegna la vista e la tendina si riapre uguale
        const riapri = qualeTendina => { alCambio(); const b = document.querySelector(`[data-filtro-apri="${qualeTendina}"]`); if (b) apri(b, qualeTendina); };

        const voceSpunta = (attr, valore, testo, spuntata, conto = null) => `
            <label class="tendina-voce"><input type="checkbox" ${attr}="${esc(valore)}" ${spuntata ? 'checked' : ''}><span>${testo}</span>${conto != null ? `<small>${conto}</small>` : ''}</label>`;

        function apri(ancora, quale) {
            const lista = base();
            if (quale === 'set') {
                const conti = new Map();
                lista.forEach(x => { const id = setDi[tipo](x); conti.set(id, (conti.get(id) || 0) + 1); });
                const ids = [...conti.keys()].sort((a, b) => Revisioni.nomeSet(a, true).localeCompare(Revisioni.nomeSet(b, true), 'it', { numeric: true }));
                const scelti = new Set(f.set);
                Ui.tendina(ancora, {
                    classe: 'tendina-filtri',
                    html: `<div class="tendina-testa"><b>Set</b>
                            <span><button type="button" class="tendina-link" data-tutti-set>Tutti</button>${scelti.size ? `<button type="button" class="tendina-link" data-nessun-set>Nessun filtro</button>` : ''}</span></div>
                        <div class="tendina-elenco">${ids.length ? ids.map(id => voceSpunta('data-filtro-set', id, esc(Revisioni.nomeSet(id, true)), scelti.has(id), conti.get(id))).join('')
                            : '<p class="tendina-vuota">Nessun set in questa scheda</p>'}</div>`,
                    alApri: el => {
                        el.addEventListener('change', e => {
                            const c = e.target.closest('[data-filtro-set]');
                            if (!c) return;
                            const id = c.dataset.filtroSet;
                            f.set = c.checked ? [...new Set([...f.set, id])] : f.set.filter(x => x !== id);
                            riapri('set');
                        });
                        el.addEventListener('click', e => {
                            if (e.target.closest('[data-tutti-set]')) { f.set = [...new Set([...f.set, ...ids])]; riapri('set'); }
                            else if (e.target.closest('[data-nessun-set]')) { f.set = []; riapri('set'); }
                        });
                    },
                });
            } else if (quale === 'stato') {
                const gs = gruppi(tipo);
                Ui.tendina(ancora, {
                    classe: 'tendina-filtri',
                    html: `${gs.map(g => {
                        const conti = new Map();
                        lista.forEach(x => { const k = g.di(x); conti.set(k, (conti.get(k) || 0) + 1); });
                        const sc = new Set(f.scelte[g.id] || []);
                        return `<div class="tendina-gruppo"><div class="tendina-testa"><b>${g.testo}</b></div>
                            ${g.voci.map(([k, testo]) => voceSpunta(`data-filtro-stato="${g.id}" data-valore`, k, testo, sc.has(k), conti.get(k) || 0)).join('')}</div>`;
                    }).join('')}
                    ${quantiStati(tipo) ? '<button type="button" class="tendina-link tendina-piede" data-nessuno-stato>Nessun filtro di stato</button>' : ''}`,
                    alApri: el => {
                        el.addEventListener('change', e => {
                            const c = e.target.closest('[data-filtro-stato]');
                            if (!c) return;
                            const g = c.dataset.filtroStato, v = c.dataset.valore;
                            const ora = f.scelte[g] || [];
                            f.scelte[g] = c.checked ? [...new Set([...ora, v])] : ora.filter(x => x !== v);
                            riapri('stato');
                        });
                        el.addEventListener('click', e => { if (e.target.closest('[data-nessuno-stato]')) { f.scelte = {}; riapri('stato'); } });
                    },
                });
            } else if (quale === 'ordine') {
                const ord = f.ordine;
                Ui.tendina(ancora, {
                    classe: 'tendina-filtri',
                    html: `<div class="tendina-testa"><b>Ordina per</b></div>
                        <div class="tendina-elenco">
                            <label class="tendina-voce"><input type="radio" name="ordine-rev" data-ordine="" ${ord.colonna ? '' : 'checked'}><span>${tipo === 'carte' ? 'Ordine dei set e delle carte' : 'Ordine di partenza'}</span></label>
                            ${ORDINI[tipo].map(([k, testo]) => `<label class="tendina-voce"><input type="radio" name="ordine-rev" data-ordine="${k}" ${ord.colonna === k ? 'checked' : ''}><span>${testo}</span></label>`).join('')}
                        </div>
                        <div class="tendina-testa"><b>Verso</b></div>
                        <div class="segmentato piccolo tendina-verso">
                            <button type="button" class="${ord.verso > 0 ? 'attivo' : ''}" data-verso="1">${ico('su')}Crescente</button>
                            <button type="button" class="${ord.verso < 0 ? 'attivo' : ''}" data-verso="-1">${ico('giu')}Decrescente</button>
                        </div>
                        <p class="tendina-nota">Date: crescente = prima le più vicine nel tempo (o le più vecchie). Le righe senza quel dato vanno in fondo.</p>`,
                    alApri: el => {
                        el.addEventListener('change', e => {
                            const r = e.target.closest('[data-ordine]');
                            if (!r) return;
                            ord.colonna = r.dataset.ordine || null;
                            ricorda(tipo);
                            riapri('ordine');
                        });
                        el.addEventListener('click', e => {
                            const b = e.target.closest('[data-verso]');
                            if (!b) return;
                            ord.verso = +b.dataset.verso;
                            if (!ord.colonna) ord.colonna = 'prossima';
                            ricorda(tipo);
                            riapri('ordine');
                        });
                    },
                });
            } else if (quale === 'colonne') {
                const colonne = Revisioni.colonneDi(tipo);
                Ui.tendina(ancora, {
                    classe: 'tendina-filtri',
                    html: `<div class="tendina-testa"><b>Colonne</b>${f.nascoste.size ? '<button type="button" class="tendina-link" data-mostra-tutte>Mostra tutte</button>' : ''}</div>
                        <div class="tendina-elenco">${colonne.map(c => voceSpunta('data-colonna', c.col, esc(c.testo), !f.nascoste.has(c.col))).join('')}</div>
                        <p class="tendina-nota">La prima colonna resta sempre.</p>`,
                    alApri: el => {
                        el.addEventListener('change', e => {
                            const c = e.target.closest('[data-colonna]');
                            if (!c) return;
                            if (c.checked) f.nascoste.delete(c.dataset.colonna); else f.nascoste.add(c.dataset.colonna);
                            ricorda(tipo);
                            riapri('colonne');
                        });
                        el.addEventListener('click', e => { if (e.target.closest('[data-mostra-tutte]')) { f.nascoste.clear(); ricorda(tipo); riapri('colonne'); } });
                    },
                });
            }
        }

        contenitore.addEventListener('click', e => {
            const b = e.target.closest('[data-filtro-apri]');
            if (b) { apri(b, b.dataset.filtroApri); return; }
            if (e.target.closest('[data-filtro-verso]')) { f.ordine.verso = -f.ordine.verso; ricorda(tipo); cambiato(); return; }
            if (e.target.closest('[data-filtro-azzera]')) { azzera(tipo); cambiato(); }
        });

        disegna();
        return { disegna };
    }

    return { stato, ricorda, applica, attivi, azzera, barra };
})();
