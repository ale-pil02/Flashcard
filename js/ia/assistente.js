// Assistente IA: pannello laterale con la chat e ciclo agente.
//
// Ogni messaggio dell'utente va a Gemini insieme agli strumenti (js/ia/strumenti.js); finché il
// modello chiede di usarne, l'app li esegue e gli rimanda i risultati, poi mostra la risposta.
// Due tipi di conversazione: quella generale e una per ogni set (stile NotebookLM), che porta
// con sé i materiali del set come fonti. Lo storico si salva nell'archivio ("chat") nel formato
// di Gemini, così com'è arrivato: le parti del modello vanno rimandate intatte (firme del ragionamento).
// Ogni messaggio è un blocco della storia (js/storia.js): se l'assistente ha cambiato qualcosa, sotto
// la risposta compare il riepilogo con il pulsante Annulla (e poi Ripristina).

const Assistente = (() => {
    const URL_MARKED = 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js';
    const MAX_PASSI = 40;              // chiamate al modello per un solo messaggio (la skill ne usa parecchie)
    const TURNI_TENUTI = 14;           // messaggi dell'utente ricordati nella conversazione
    const BUDGET_INLINE = 14 * 1024 * 1024;   // PDF e immagini inviati direttamente in una richiesta
    const ico = (...a) => Ui.ico(...a);

    let el = null;
    let aperto = false;
    let setId = null;            // null = conversazione generale
    let conv = null;             // { id, storico, vista }
    let controllo = null;        // AbortController della richiesta in corso
    let attesa = '';             // testo dello stato mentre lavora
    let allegate = [];           // id delle flashcard selezionate da mandare col prossimo messaggio

    // ---- Conversazioni ----------------------------------------------------------

    function idConv(id) { return id ? 'set:' + id : 'globale'; }

    function carica(id) {
        setId = id && Dati.set(id) ? id : null;
        const chiave = idConv(setId);
        conv = Dati.chat(chiave) || { id: chiave, storico: [], vista: [] };
        allineaModifiche();
    }

    function salva() { if (conv.storico.length || conv.vista.length) Dati.salvaChat(conv); }

    // ---- Pannello -------------------------------------------------------------------

    function costruisci() {
        if (el) return;
        el = document.createElement('aside');
        el.className = 'pannello-ia';
        el.setAttribute('aria-label', 'Assistente IA');
        el.innerHTML = `
            <header class="ia-testa">
                <span class="ia-logo">${ico('scintille')}</span>
                <div class="ia-titolo"><b>Assistente</b><span data-ia-ambito></span></div>
                <button type="button" class="btn-icona" data-ia="menu" aria-label="Opzioni">${ico('altro')}</button>
                <button type="button" class="btn-icona" data-ia="chiudi" aria-label="Chiudi l'assistente">${ico('chiudi')}</button>
            </header>
            <div class="ia-fonti" data-ia-fonti></div>
            <div class="ia-messaggi" data-ia-messaggi aria-live="polite"></div>
            <div class="ia-allegati" data-ia-allegati hidden></div>
            <form class="ia-scrivi" data-ia-modulo>
                <textarea rows="1" data-ia-testo placeholder="Chiedi o dai un'istruzione…" title="Invio per mandare, Maiusc+Invio per andare a capo. /profondita avvia la creazione flashcard per profondità"></textarea>
                <button type="submit" class="ia-invia" data-ia-invia aria-label="Invia">${ico('invia')}</button>
            </form>`;
        document.body.appendChild(el);

        const area = $('[data-ia-testo]', el);
        const ridimensiona = () => {
            area.style.height = 'auto';
            area.style.height = Math.min(area.scrollHeight, 180) + 'px';
            area.style.overflowY = area.scrollHeight > 180 ? 'auto' : 'hidden';
        };
        area.addEventListener('input', ridimensiona);
        area.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('[data-ia-modulo]', el).requestSubmit(); }
            if (e.key === 'Escape') chiudi();
        });
        $('[data-ia-modulo]', el).addEventListener('submit', e => {
            e.preventDefault();
            if (controllo) { controllo.abort(); return; }
            const testo = area.value.trim();
            if (!testo) return;
            area.value = '';
            ridimensiona();
            invia(testo);
        });

        el.addEventListener('click', e => {
            const b = e.target.closest('[data-ia]');
            if (!b) return;
            const azione = b.dataset.ia;
            if (azione === 'chiudi') chiudi();
            else if (azione === 'menu') menu(b);
            else if (azione === 'suggerimento') {
                const testo = b.dataset.testo;
                if (testo.endsWith('…')) { area.value = testo.slice(0, -1); area.focus(); ridimensiona(); } else invia(testo);
            } else if (azione === 'fonte') {
                const m = Dati.materiale(b.dataset.id);
                if (m) { Dati.aggiornaMateriale(m.id, { usaInChat: m.usaInChat === false }); disegnaFonti(); }
            } else if (azione === 'salva-chiave') salvaChiave();
            else if (azione === 'apri-materiale') Materiali.apri(b.dataset.id);
            else if (azione === 'annulla' || azione === 'ripristina') {
                if (controllo) { Ui.toast("Aspetta che l'assistente finisca", 'errore'); return; }
                b.disabled = true;
                if (azione === 'annulla') Storia.annullaConAvviso(b.dataset.voce); else Storia.ripristinaConAvviso(b.dataset.voce);
            } else if (azione === 'togli-allegati') { allegate = []; disegnaAllegati(); }
        });
    }

    // ---- Modifiche annullabili --------------------------------------------------------

    // Annullare o ripristinare (dalla chat, da un avviso o da "Modifiche recenti") aggiorna i riquadri
    // della conversazione e lo fa sapere all'assistente, che altrimenti crederebbe i dati ancora come li ha lasciati
    async function allineaModifiche() {
        const c = conv;
        let cambiato = false;
        for (const v of c.vista.filter(x => x.tipo === 'modifiche')) {
            const riga = await Archivio.leggiRiga('storia', v.voce);
            if (!riga || (riga.stato === 'annullata') === !!v.annullata) continue;
            v.annullata = riga.stato === 'annullata';
            cambiato = true;
            notaPerIA(v.annullata
                ? `L'utente ha annullato le modifiche che avevi fatto (${v.riepilogo}): quei dati sono tornati com'erano prima.`
                : `L'utente ha ripristinato le modifiche che aveva annullato (${v.riepilogo}).`, c);
        }
        if (cambiato && c === conv) { salva(); disegnaMessaggi(); }
        else if (cambiato) Dati.salvaChat(c);
    }

    document.addEventListener('storia-cambiata', () => { if (conv) allineaModifiche(); });
    document.addEventListener('cartella-cambiata', e => { if (aperto && e.detail.setId === setId) disegnaFonti(); });

    // Nota dell'app per il modello: va col prossimo messaggio dell'utente
    function notaPerIA(testo, c = conv) {
        const parte = { text: `[Nota dell'app] ${testo}` };
        const ultimo = c.storico[c.storico.length - 1];
        if (ultimo && eTestoUtente(ultimo)) ultimo.parts.push(parte);
        else if (c.storico.length) c.storico.push({ role: 'user', parts: [parte] });
    }

    // ---- Flashcard selezionate --------------------------------------------------------

    function allega(ids, { setId: id = null } = {}) {
        if (controllo) { Ui.toast("Aspetta che l'assistente finisca", 'errore'); return; }
        apri({ setId: id });
        allegate = ids.slice();
        disegnaAllegati();
        $('[data-ia-testo]', el).focus();
    }

    function disegnaAllegati() {
        if (!el) return;
        const box = $('[data-ia-allegati]', el);
        box.hidden = !allegate.length;
        box.innerHTML = allegate.length ? `
            <span class="chip chip-primario">${ico('carte')}${plurale(allegate.length, 'flashcard selezionata', 'flashcard selezionate')}
                <button type="button" data-ia="togli-allegati" aria-label="Togli le flashcard selezionate">${ico('chiudi')}</button></span>` : '';
        $('[data-ia-testo]', el).placeholder = allegate.length ? 'Cosa devo fare con queste flashcard?' : "Chiedi o dai un'istruzione…";
    }

    function testoAllegate(ids) {
        const carte = ids.map(id => Dati.carta(id)).filter(Boolean);
        const righe = carte.slice(0, 150).map(c => {
            const s = Dati.set(c.setId), madre = Dati.madre(c);
            return `- id ${c.id} · set «${s ? s.nome : '?'}» (${c.setId})${madre ? ` · madre ${madre.id}` : ''}${c.tag.length ? ` · tag: ${c.tag.join(', ')}` : ''}
  D: ${Ui.tronca(testoMultiriga(c.domanda), 400)}
  R: ${Ui.tronca(Ui.anteprimaRisposta(c), 400)}`;
        });
        const altre = carte.slice(150).map(c => c.id);
        return `[Flashcard selezionate dall'utente: la richiesta riguarda queste ${carte.length} carte]\n${righe.join('\n')}`
            + (altre.length ? `\nAltre ${altre.length} selezionate (solo id, leggile con cerca_carte o leggi_set se servono): ${altre.join(', ')}` : '');
    }

    function menu(ancora) {
        const s = setId ? Dati.set(setId) : null;
        const contestoSet = (App.contesto || {}).setId;
        Ui.menu(ancora, [
            { testo: 'Nuova conversazione', icona: 'piu', clic: nuovaConversazione },
            setId ? { testo: 'Passa alla chat generale', icona: 'scintille', clic: () => { carica(null); disegna(); } } : null,
            !setId && contestoSet && Dati.set(contestoSet) ? { testo: `Passa alla chat del set «${Dati.set(contestoSet).nome}»`, icona: 'cartella', clic: () => { carica(contestoSet); disegna(); } } : null,
            s ? { testo: 'Apri il set', icona: 'cartella', clic: () => Router.vai('/set/' + s.id) } : null,
            { testo: 'Modifiche recenti (annulla)', icona: 'annulla', clic: () => Storia.elenco() },
            { testo: `Ragionamento: ${Gemini.nomeRagionamento().toLowerCase()}`, icona: 'scintille', clic: sceltaRagionamento },
            '-',
            { testo: 'Impostazioni dell\'assistente', icona: 'ingranaggio', clic: () => Router.vai('/impostazioni') },
        ]);
    }

    function sceltaRagionamento() {
        Ui.modale({
            titolo: 'Livello di ragionamento', classe: 'modale-piccola',
            corpo: `
                <p class="nota">Come il "Thinking level" di Google AI Studio: più alto = risposte più pensate ma più lente (e più consumo).
                    ${Gemini.livelloApplicabile() ? `Vale per «${esc(Gemini.modello())}» e per gli altri Gemini 3 e successivi; se un modello non accetta un livello, «minimo» diventa «basso», poi si usa il predefinito.`
                        : `Il modello attivo «${esc(Gemini.modello())}» è un Gemini 2.5: lì il livello non si sceglie (usa il suo predefinito). Vale per i Gemini 3 e successivi.`}</p>
                <div class="lista-scelte-ragionamento">${Gemini.LIVELLI.map(([v, t]) => `
                    <label class="scelta-radio"><input type="radio" name="ragionamento" value="${v}" ${v === Gemini.ragionamento() ? 'checked' : ''}><span>${t}</span></label>`).join('')}
                </div>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Usa questo', classe: 'btn-primario', principale: true, clic: md => {
                    const scelto = $('[name=ragionamento]:checked', md.el);
                    Gemini.impostaRagionamento(scelto ? scelto.value : '');
                    md.chiudi();
                    disegna();
                    Ui.toast('Ragionamento: ' + Gemini.nomeRagionamento(), 'successo', 1500);
                } },
            ],
        });
    }

    async function nuovaConversazione() {
        if (controllo) return;
        if (conv.vista.length && !await Ui.conferma('La conversazione attuale verrà cancellata.', { titolo: 'Nuova conversazione?', ok: 'Ricomincia' })) return;
        Dati.eliminaChat(conv.id);
        conv = { id: conv.id, storico: [], vista: [] };
        disegna();
    }

    function apri({ setId: id } = {}) {
        costruisci();
        const scelto = id !== undefined ? id : (App.contesto || {}).setId || null;
        if (!controllo && (!conv || idConv(scelto) !== conv.id)) carica(scelto);
        aperto = true;
        el.classList.add('aperto');
        document.body.classList.add('ia-aperta');
        disegna();
        setTimeout(() => { const a = $('[data-ia-testo]', el); if (a && !Ui.finestraAperta()) a.focus(); }, 50);
    }

    function chiudi() {
        aperto = false;
        if (el) el.classList.remove('aperto');
        document.body.classList.remove('ia-aperta');
    }

    function alterna() { if (aperto) chiudi(); else apri(); }

    // Cambio pagina: la chat segue il set che stai guardando (se non sta lavorando)
    function contestoCambiato() {
        if (!aperto || controllo) return;
        const nuovo = (App.contesto || {}).setId || null;
        if (nuovo && idConv(nuovo) !== conv.id) { carica(nuovo); disegna(); }
        else if (!nuovo) disegnaFonti();
    }

    // ---- Disegno ------------------------------------------------------------------

    function markdown(testo) {
        if (window.marked) {
            try { return Ricco.pulisci(marked.parse(String(testo || ''), { breaks: true })); } catch (e) { /* ripiego sotto */ }
        }
        return testoInHtml(testo);
    }

    function disegna() {
        if (!el) return;
        const s = setId ? Dati.set(setId) : null;
        $('[data-ia-ambito]', el).textContent = (s ? `Chat del set «${s.nome}»` : 'Chat generale') + (Gemini.ragionamento() ? ` · ragionamento ${Gemini.nomeRagionamento().toLowerCase()}` : '');
        disegnaFonti();
        disegnaMessaggi();
        disegnaAllegati();
        const invio = $('[data-ia-invia]', el);
        invio.innerHTML = ico(controllo ? 'stop' : 'invia');
        invio.classList.toggle('ferma', !!controllo);
        invio.setAttribute('aria-label', controllo ? 'Interrompi' : 'Invia');
        if (!window.marked) caricaScript(URL_MARKED).then(() => disegnaMessaggi()).catch(() => {});
    }

    function disegnaFonti() {
        if (!el) return;
        const box = $('[data-ia-fonti]', el);
        const materiali = setId ? Dati.materialiDiSet(setId) : [];
        box.hidden = !materiali.length;
        if (!materiali.length) { box.innerHTML = ''; return; }
        const attivi = materiali.filter(m => m.usaInChat !== false).length;
        box.innerHTML = `
            <details>
                <summary>${ico('documento')}<span>${attivi} di ${plurale(materiali.length, 'materiale', 'materiali')} come fonti</span>${ico('giu')}</summary>
                <div class="ia-fonti-lista">${materiali.map(m => `
                    <button type="button" class="chip-scelta${m.usaInChat === false ? '' : ' attivo'}" data-ia="fonte" data-id="${m.id}" title="Clic per includere o escludere">
                        ${ico(Materiali.TIPI[m.tipo] ? Materiali.TIPI[m.tipo].icona : 'documento')}${esc(Ui.tronca(m.nome, 34))}</button>`).join('')}
                </div>
            </details>`;
    }

    function suggerimenti() {
        const vista = App.rottaAttiva && App.rottaAttiva.vista;
        if (vista === 'mappa') return ['Aggiungi a questa mappa i sottorami su…', 'Completa i rami di questa mappa con quello che manca', 'Dai un colore diverso a ogni ramo principale', 'Crea le flashcard a cascata da questa mappa'];
        if (vista === 'mappe') return ['Crea una mappa mentale su…', 'Trasforma in mappa il materiale…', 'Quali mappe non sono in nessun set?', 'Crea un tema per le mappe con sfondo scuro e colori pastello'];
        if (setId) {
            const haMateriali = Dati.materialiDiSet(setId).length > 0;
            return haMateriali
                ? ['Riassumi i materiali di questo set', 'Crea flashcard a cascata dai materiali di questo set', '/profondita dalla mappa di questo set', 'Interrogami sui materiali, una domanda alla volta']
                : ['Crea 10 flashcard a cascata su…', 'Riorganizza le carte di questo set in un albero dal generale al particolare', 'Quali carte di questo set sbaglio più spesso?'];
        }
        return ["Com'è messo il mio studio questa settimana?", 'Cosa dovrei ripassare oggi?', 'Crea un set con 8 domande a cascata su…', 'Aggiungi al piano di studio un esame il…'];
    }

    function disegnaMessaggi() {
        if (!el) return;
        const box = $('[data-ia-messaggi]', el);
        if (!Gemini.chiave()) {
            box.innerHTML = `
                <div class="ia-benvenuto">
                    <span class="ia-logo grande">${ico('chiave')}</span>
                    <h3>Collega Gemini</h3>
                    <p>Incolla la chiave API di Gemini (la stessa che usi in Allenamento va bene). Resta solo in questo browser.
                       Se non ce l'hai: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>.</p>
                    <input type="password" data-ia-chiave placeholder="Chiave API Gemini" autocomplete="off">
                    <button type="button" class="btn btn-primario" data-ia="salva-chiave">${ico('chiave')}Salva e inizia</button>
                </div>`;
            return;
        }
        const s = setId ? Dati.set(setId) : null;
        const voci = conv.vista.map(v => {
            if (v.tipo === 'utente') return `<div class="ia-msg ia-utente">${v.allegate ? `<span class="ia-allegato">${ico('carte')}${plurale(v.allegate, 'flashcard selezionata', 'flashcard selezionate')}</span>` : ''}${v.etichetta ? `<span class="ia-allegato">${ico('sincronizza')}${esc(v.etichetta)}</span>` : ''}${testoInHtml(v.testo)}</div>`;
            if (v.tipo === 'modifiche') return `
                <div class="ia-modifiche${v.annullata ? ' annullate' : ''}">
                    ${ico(v.annullata ? 'annulla' : 'ok-cerchio')}
                    <div><b>${v.annullata ? 'Modifiche annullate' : 'Modifiche fatte'}</b><small>${esc(v.riepilogo)}</small></div>
                    <button type="button" class="btn ${v.annullata ? 'btn-fantasma' : 'btn-secondario'} btn-piccolo" data-ia="${v.annullata ? 'ripristina' : 'annulla'}" data-voce="${v.voce}" ${controllo ? 'disabled' : ''}
                        title="${v.annullata ? 'Rifai le modifiche annullate' : "Rimette com'era tutto quello che l'assistente ha cambiato con questo messaggio"}">${ico(v.annullata ? 'ripeti' : 'annulla')}${v.annullata ? 'Ripristina' : 'Annulla'}</button>
                </div>`;
            if (v.tipo === 'ia') return `<div class="ia-msg ia-risposta contenuto-ricco">${markdown(v.testo)}</div>`;
            if (v.tipo === 'azione') {
                const icona = { ok: 'spunta', errore: 'avviso', annullato: 'chiudi', 'in-corso': 'orologio' }[v.esito] || 'spunta';
                return `<div class="ia-azione esito-${v.esito}" title="${esc(v.dettaglio || '')}">${ico(icona)}<span>${esc(v.etichetta)}${v.esito === 'errore' && v.dettaglio ? ` — ${esc(Ui.tronca(v.dettaglio, 140))}` : ''}</span></div>`;
            }
            return `<div class="ia-errore">${ico('avviso')}<span>${esc(v.testo)}</span></div>`;
        }).join('');
        const benvenuto = !conv.vista.length ? `
            <div class="ia-benvenuto">
                <span class="ia-logo grande">${ico('scintille')}</span>
                <h3>${s ? `Studiamo «${esc(s.nome)}»` : 'Come posso aiutarti?'}</h3>
                <p>${s ? 'Rispondo usando i materiali di questo set e posso creare, modificare e organizzare le sue flashcard.'
                    : "Posso fare tutto quello che fai tu nell'app: creare set e flashcard, riorganizzarle, costruire e modificare mappe mentali, gestire il piano di studio e leggere le statistiche."}</p>
                <div class="ia-suggerimenti">${suggerimenti().map(t => `<button type="button" class="chip-scelta" data-ia="suggerimento" data-testo="${esc(t)}">${esc(t)}</button>`).join('')}</div>
            </div>` : '';
        const lavoro = controllo ? `<div class="ia-lavoro"><span class="puntini"><i></i><i></i><i></i></span>${esc(attesa || 'Ci penso…')}</div>` : '';
        box.innerHTML = benvenuto + voci + lavoro;
        box.scrollTop = box.scrollHeight;
    }

    function salvaChiave() {
        const input = $('[data-ia-chiave]', el);
        const k = input ? input.value.trim() : '';
        if (!k) { Ui.segnalaErrore(input, 'Incolla la chiave'); return; }
        Gemini.impostaChiave(k);
        Ui.toast('Chiave salvata', 'successo');
        disegna();
        Gemini.aggiornaModelli().catch(e => Ui.toast(e.message, 'errore', 6000));
    }

    // ---- Ciclo agente -------------------------------------------------------------

    const eTestoUtente = c => c.role === 'user' && c.parts.some(p => typeof p.text === 'string') && !c.parts.some(p => p.functionResponse);

    // Tiene gli ultimi TURNI_TENUTI messaggi dell'utente (con tutto ciò che è venuto dopo)
    function taglia(storico) {
        const inizi = storico.map((c, i) => (eTestoUtente(c) ? i : -1)).filter(i => i >= 0);
        return inizi.length > TURNI_TENUTI ? storico.slice(inizi[inizi.length - TURNI_TENUTI]) : storico;
    }

    // I risultati lunghi degli strumenti nei turni passati vengono accorciati
    function compatta(storico) {
        const ultimo = storico.map((c, i) => (eTestoUtente(c) ? i : -1)).filter(i => i >= 0).pop() || 0;
        return storico.map((c, i) => {
            if (i >= ultimo || c.role !== 'user' || !c.parts.some(p => p.functionResponse)) return c;
            return {
                role: c.role, parts: c.parts.map(p => (p.functionResponse && JSON.stringify(p.functionResponse.response).length > 3000
                    ? { functionResponse: { ...p.functionResponse, response: { nota: 'Risultato non più mostrato per brevità: se ti serve, richiama lo strumento.' } } }
                    : p)),
            };
        });
    }

    async function contenuti() {
        const storico = compatta(taglia(conv.storico)).map(c => ({ role: c.role, parts: c.parts }));
        if (!setId) return storico;
        // Chat del set: i materiali scelti vanno in testa come fonti
        const fonti = Dati.materialiDiSet(setId).filter(m => m.usaInChat !== false);
        if (!fonti.length || !storico.length) return storico;
        attesa = `Preparo ${plurale(fonti.length, 'materiale', 'materiali')}…`;
        disegnaMessaggi();
        const budget = { inline: BUDGET_INLINE };
        const parti = [{ text: `Materiali del set «${Dati.set(setId).nome}», caricati dall'utente: sono le fonti di questa conversazione.` }];
        for (const m of fonti) parti.push(...await Materiali.partiPerIA(m, budget));
        storico[0] = { role: storico[0].role, parts: [...parti, ...storico[0].parts] };
        return storico;
    }

    function conferma(testoHtml) {
        return Ui.conferma(testoHtml, { titolo: "L'assistente chiede conferma", ok: 'Sì, procedi', pericolo: true });
    }

    // dettagli: testo in più per il modello che nella chat compare solo come etichetta (es. le novità di un file)
    async function invia(testo, { dettagli = '', etichetta = '' } = {}) {
        costruisci();
        if (!aperto) apri();
        if (controllo) return;
        if (!Gemini.chiave()) { disegna(); Ui.toast('Prima collega Gemini con la tua chiave', 'errore'); return; }

        const parti = [{ text: `[Contesto dell'app] ${Istruzioni.contesto()}` }];
        if (allegate.length) parti.push({ text: testoAllegate(allegate) });
        parti.push({ text: testo });
        if (dettagli) parti.push({ text: dettagli });
        conv.vista.push({ tipo: 'utente', testo, ...(allegate.length ? { allegate: allegate.length } : {}), ...(etichetta ? { etichetta } : {}) });
        allegate = [];
        disegnaAllegati();
        const ultimo = conv.storico[conv.storico.length - 1];
        // Mai due turni dell'utente di fila: se l'ultimo è rimasto senza risposta, si aggiunge a quello
        if (ultimo && eTestoUtente(ultimo)) ultimo.parts.push(...parti);
        else conv.storico.push({ role: 'user', parts: parti });
        salva();

        controllo = new AbortController();
        attesa = '';
        disegna();
        // Una cartella collegata al set va riletta prima: l'assistente deve vedere l'ultima versione dei file
        if (setId && Cartelle.collegata(setId)) {
            attesa = 'Rileggo la cartella collegata…';
            disegnaMessaggi();
            await Cartelle.sincronizza(setId).catch(e => console.warn(e));
        }
        let modifiche = false;
        const registrazione = Storia.inizia({ origine: 'assistente', descrizione: testo, escludi: [['chat', conv.id]] });
        try {
            for (let passo = 0; passo < MAX_PASSI; passo++) {
                const richiesta = {
                    systemInstruction: { parts: [{ text: Istruzioni.sistema({ setId }) }] },
                    contents: await contenuti(),
                    tools: [{ functionDeclarations: Strumenti.dichiarazioni() }],
                    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
                };
                attesa = passo ? 'Continuo…' : 'Ci penso…';
                disegnaMessaggi();
                const dati = await Gemini.genera(richiesta, {
                    segnale: controllo.signal,
                    suAttesa: (secondi, tentativo) => { attesa = `Gemini è occupato, riprovo tra ${secondi} s (tentativo ${tentativo})…`; disegnaMessaggi(); },
                });
                const candidato = dati.candidates && dati.candidates[0];
                if (!candidato || !candidato.content || !candidato.content.parts) {
                    const motivo = (dati.promptFeedback && dati.promptFeedback.blockReason) || (candidato && candidato.finishReason) || 'risposta vuota';
                    throw new Error(`Gemini non ha risposto (${motivo}). Riprova o riformula.`);
                }
                const parts = candidato.content.parts;
                conv.storico.push({ role: 'model', parts });
                const testoRisposta = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim();
                if (testoRisposta) conv.vista.push({ tipo: 'ia', testo: testoRisposta });
                const chiamate = parts.filter(p => p.functionCall);
                salva();
                disegnaMessaggi();
                if (!chiamate.length) break;

                const risultati = [];
                for (const p of chiamate) {
                    const { name, args, id } = p.functionCall;
                    const voce = { tipo: 'azione', nome: name, etichetta: Strumenti.etichetta(name, args), esito: 'in-corso' };
                    conv.vista.push(voce);
                    attesa = voce.etichetta + '…';
                    disegnaMessaggi();
                    const risultato = await Strumenti.esegui(name, args, { conferma });
                    voce.esito = risultato.errore ? 'errore' : risultato.annullato ? 'annullato' : 'ok';
                    if (risultato.errore) voce.dettaglio = risultato.errore;
                    if (voce.esito === 'ok' && Strumenti.modifica(name)) modifiche = true;
                    risultati.push({ functionResponse: { name, response: risultato, ...(id ? { id } : {}) } });
                }
                conv.storico.push({ role: 'user', parts: risultati });
                salva();
                if (passo === MAX_PASSI - 1) conv.vista.push({ tipo: 'errore', testo: 'Mi fermo qui: ho fatto molti passaggi. Scrivimi "continua" per proseguire.' });
            }
        } catch (e) {
            const interrotto = e.name === 'AbortError';
            conv.vista.push({ tipo: 'errore', testo: interrotto ? 'Interrotto.' : e.message || String(e) });
            // Lo storico deve restare alternato: chiude il turno rimasto aperto
            if (conv.storico.length && conv.storico[conv.storico.length - 1].role === 'user') {
                conv.storico.push({ role: 'model', parts: [{ text: interrotto ? '(Risposta interrotta dall\'utente.)' : '(Risposta non completata per un errore.)' }] });
            }
        } finally {
            const voce = await Storia.termina(registrazione);
            if (voce) { conv.vista.push({ tipo: 'modifiche', voce: voce.id, riepilogo: voce.riepilogo }); modifiche = true; }
            controllo = null;
            attesa = '';
            conv.vista.filter(v => v.esito === 'in-corso').forEach(v => { v.esito = 'annullato'; });
            salva();
            disegna();
            if (modifiche) App.aggiornaDopoAssistente();
        }
    }

    return { apri, chiudi, alterna, invia, allega, contestoCambiato, get aperto() { return aperto; } };
})();
