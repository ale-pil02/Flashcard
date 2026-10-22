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
    // PDF e immagini inviati direttamente in una richiesta: pochi MB in tutto. I file più grandi si caricano una volta sui
    // server di Gemini (restano 48 ore) e la richiesta li cita soltanto: altrimenti a ogni passo dell'assistente partirebbero
    // di nuovo decine di MB, e una connessione appena instabile cade ("Failed to fetch")
    const BUDGET_INLINE = 4 * 1024 * 1024;
    const ico = (...a) => Ui.ico(...a);

    let el = null;
    let aperto = false;
    let setId = null;            // null = conversazione generale
    let conv = null;             // { id, storico, vista }
    let controllo = null;        // AbortController della richiesta in corso
    let attesa = '';             // testo dello stato mentre lavora
    let allegate = [];           // id delle flashcard selezionate da mandare col prossimo messaggio
    // Fonti aggiunte a mano per una conversazione (file o testo): non diventano materiali e restano solo finché
    // l'app è aperta. id conversazione → [fonte] (vedi Materiali.fonteTemporanea)
    const fontiTemp = new Map();
    const fontiDellaChat = () => (conv && fontiTemp.get(conv.id)) || [];
    // Larghezza del pannello (trascinando il bordo sinistro), ricordata in questo browser
    const CHIAVE_LARGHEZZA = 'flashcard-ia-larghezza';
    const LARGHEZZA_BASE = 440;

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
            <div class="ia-maniglia" data-ia-maniglia title="Trascina per allargare o stringere il pannello (doppio clic: larghezza normale)"></div>
            <header class="ia-testa">
                <span class="ia-logo">${ico('scintille')}</span>
                <div class="ia-titolo"><b>Assistente</b><span data-ia-ambito></span></div>
                <button type="button" class="btn-icona" data-ia="allarga" data-ia-allarga aria-label="Allarga il pannello" title="Allarga il pannello">${ico('allarga')}</button>
                <button type="button" class="btn-icona" data-ia="menu" aria-label="Opzioni">${ico('altro')}</button>
                <button type="button" class="btn-icona" data-ia="chiudi" aria-label="Chiudi l'assistente">${ico('chiudi')}</button>
            </header>
            <div class="ia-fonti" data-ia-fonti></div>
            <div class="ia-messaggi" data-ia-messaggi aria-live="polite"></div>
            <div class="ia-allegati" data-ia-allegati hidden></div>
            <div class="ia-fonti-temp" data-ia-fonti-temp hidden></div>
            <form class="ia-scrivi" data-ia-modulo>
                <button type="button" class="ia-graffetta" data-ia="aggiungi-fonte" aria-label="Aggiungi una fonte per questa conversazione"
                    title="Aggiungi una fonte solo per questa conversazione (file o testo): la uso finché non la togli, senza salvarla nei materiali">${ico('graffetta')}</button>
                <textarea rows="1" data-ia-testo placeholder="Chiedi o dai un'istruzione…" title="Invio per mandare, Maiusc+Invio per andare a capo. /profondita avvia la creazione flashcard per profondità"></textarea>
                <button type="submit" class="ia-invia" data-ia-invia aria-label="Invia">${ico('invia')}</button>
            </form>`;
        document.body.appendChild(el);
        impostaLarghezza(larghezzaSalvata());
        $('[data-ia-maniglia]', el).addEventListener('pointerdown', trascinaBordo);
        $('[data-ia-maniglia]', el).addEventListener('dblclick', () => { impostaLarghezza(LARGHEZZA_BASE, true); });
        window.addEventListener('resize', () => impostaLarghezza(larghezzaSalvata()));

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
            else if (azione === 'allarga') allarga();
            else if (azione === 'aggiungi-fonte') menuFonte(b);
            else if (azione === 'togli-fonte') {
                fontiTemp.set(conv.id, fontiDellaChat().filter(f => f.id !== b.dataset.id));
                disegnaFontiTemp();
            } else if (azione === 'vedi-fonte') vediFonte(b.dataset.id);
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
            // Durante un turno l'ha fatto l'assistente stesso (modifiche_recenti) e lo sa dal risultato: una nota adesso
            // finirebbe tra la sua chiamata e la risposta dello strumento
            if (controllo && c === conv) continue;
            notaPerIA(v.annullata
                ? `L'utente ha annullato le modifiche che avevi fatto (${v.riepilogo}): quei dati sono tornati com'erano prima.`
                : `L'utente ha ripristinato le modifiche che aveva annullato (${v.riepilogo}).`, c);
        }
        if (cambiato && c === conv) { salva(); disegnaMessaggi(); }
        else if (cambiato) Dati.salvaChat(c);
    }

    document.addEventListener('storia-cambiata', () => { if (conv) allineaModifiche(); });

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

    // ---- Larghezza del pannello ----------------------------------------------------------

    function larghezzaSalvata() {
        try { return +localStorage.getItem(CHIAVE_LARGHEZZA) || LARGHEZZA_BASE; } catch (e) { return LARGHEZZA_BASE; }
    }

    function impostaLarghezza(w, ricorda = false) {
        const max = Math.max(340, window.innerWidth - 80);
        const l = Math.round(limita(w, 340, max));
        document.documentElement.style.setProperty('--larghezza-ia', l + 'px');
        if (el) {
            const grande = l > Math.min(760, window.innerWidth * 0.6);
            const b = $('[data-ia-allarga]', el);
            b.innerHTML = ico(grande ? 'restringi' : 'allarga');
            b.title = grande ? 'Larghezza normale' : 'Allarga il pannello';
            b.setAttribute('aria-label', b.title);
        }
        if (ricorda) { try { localStorage.setItem(CHIAVE_LARGHEZZA, String(l)); } catch (e) { /* niente */ } }
        return l;
    }

    // Grande (quasi tutta la finestra) ↔ normale
    function allarga() {
        const ora = larghezzaSalvata();
        const grande = ora > Math.min(760, window.innerWidth * 0.6);
        impostaLarghezza(grande ? LARGHEZZA_BASE : Math.max(760, Math.round(window.innerWidth * 0.7)), true);
    }

    function trascinaBordo(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        el.classList.add('ridimensionando');
        const muovi = ev => impostaLarghezza(window.innerWidth - ev.clientX);
        const fine = ev => {
            window.removeEventListener('pointermove', muovi);
            window.removeEventListener('pointerup', fine);
            el.classList.remove('ridimensionando');
            impostaLarghezza(window.innerWidth - ev.clientX, true);
        };
        window.addEventListener('pointermove', muovi);
        window.addEventListener('pointerup', fine);
    }

    // ---- Fonti temporanee ----------------------------------------------------------------

    function menuFonte(ancora) {
        Ui.menu(ancora, [
            { testo: 'Carica un file (PDF, Word, immagine…)', icona: 'carica', clic: sceltaFileFonte },
            { testo: 'Incolla un testo', icona: 'testo-t', clic: testoFonte },
            fontiDellaChat().length ? '-' : null,
            fontiDellaChat().length ? { testo: 'Togli tutte le fonti aggiunte', icona: 'chiudi', clic: () => { fontiTemp.delete(conv.id); disegnaFontiTemp(); } } : null,
        ].filter(Boolean));
    }

    function sceltaFileFonte() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = Materiali.ACCETTATI;
        input.addEventListener('change', async () => {
            const files = [...input.files];
            if (!files.length) return;
            const lista = fontiDellaChat().slice();
            for (const f of files) {
                try {
                    Ui.toast(`Leggo «${f.name}»…`, 'info', 1500);
                    lista.push(await Materiali.fonteTemporanea(f));
                } catch (err) { Ui.toast(err.message || `«${f.name}» non si legge`, 'errore'); }
            }
            fontiTemp.set(conv.id, lista);
            disegnaFontiTemp();
            $('[data-ia-testo]', el).focus();
        });
        input.click();
    }

    function testoFonte() {
        Ui.modale({
            titolo: 'Testo come fonte',
            corpo: `
                <label class="campo"><span>Nome</span><input type="text" name="nome" placeholder="Es. Appunti della lezione" maxlength="80"></label>
                <label class="campo"><span>Testo</span><textarea name="testo" rows="12" placeholder="Incolla qui il testo"></textarea></label>
                <p class="nota">Lo uso in questa conversazione finché non lo togli; non va nei materiali.</p>`,
            azioni: [
                { testo: 'Annulla', classe: 'btn-fantasma' },
                { testo: 'Aggiungi', classe: 'btn-primario', principale: true, clic: m => {
                    const testo = $('[name="testo"]', m.el).value.trim();
                    if (!testo) { Ui.toast('Incolla prima un testo', 'errore'); return; }
                    const nome = $('[name="nome"]', m.el).value.trim() || Ui.tronca(testo.replace(/\s+/g, ' '), 40);
                    fontiTemp.set(conv.id, [...fontiDellaChat(), Materiali.testoTemporaneo(nome, testo)]);
                    m.chiudi();
                    disegnaFontiTemp();
                } },
            ],
        });
    }

    function vediFonte(id) {
        const f = fontiDellaChat().find(x => x.id === id);
        if (!f) return;
        if (f.blob && ['pdf', 'immagine'].includes(f.tipo)) { window.open(URL.createObjectURL(f.blob), '_blank', 'noopener'); return; }
        Ui.modale({
            titolo: f.nome,
            corpo: `<p class="nota">${esc(Materiali.descrivi(f))} · fonte di questa conversazione</p><pre class="ia-anteprima-fonte">${esc((f.testo || '').slice(0, 20000))}${(f.testo || '').length > 20000 ? '\n[…]' : ''}</pre>`,
            azioni: [{ testo: 'Chiudi', classe: 'btn-primario', principale: true }],
        });
    }

    function disegnaFontiTemp() {
        if (!el) return;
        const box = $('[data-ia-fonti-temp]', el), lista = fontiDellaChat();
        box.hidden = !lista.length;
        box.innerHTML = lista.length ? `
            <span class="ia-fonti-temp-titolo" title="Le uso in questa conversazione finché non le togli; non vanno nei materiali">Fonti di questa chat</span>
            ${lista.map(f => `
            <span class="chip ia-chip-fonte">
                <button type="button" class="ia-chip-nome" data-ia="vedi-fonte" data-id="${f.id}" title="${esc(f.nome)} · ${esc(Materiali.descrivi(f))}">${ico(Materiali.TIPI[f.tipo] ? Materiali.TIPI[f.tipo].icona : 'documento')}${esc(Ui.tronca(f.nome, 28))}</button>
                <button type="button" data-ia="togli-fonte" data-id="${f.id}" aria-label="Togli ${esc(f.nome)}" title="Togli questa fonte">${ico('chiudi')}</button>
            </span>`).join('')}` : '';
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
            { testo: 'Contesto: quanto ne regge la chat', icona: 'database', clic: infoContesto },
            '-',
            { testo: 'Impostazioni dell\'assistente', icona: 'ingranaggio', clic: () => Router.vai('/impostazioni') },
        ]);
    }

    // Quanti token accetta il modello (lo dice Google nell'elenco dei modelli) e quanti ne ha occupati l'ultima richiesta
    function infoContesto() {
        const lim = Gemini.limiti(), u = Gemini.ultimo;
        const n = x => Number(x).toLocaleString('it-IT');
        Ui.modale({
            titolo: 'Contesto della chat', classe: 'modale-piccola',
            corpo: `
                <p>Modello: <b>${esc(Gemini.modello())}</b>.</p>
                <p>${lim ? `Google dichiara un contesto di <b>${n(lim.ingresso)} token</b> in entrata${lim.uscita ? ` e fino a ${n(lim.uscita)} token per risposta` : ''}.`
                    : 'Il limite del modello non è ancora noto: in Impostazioni → Assistente IA premi «Aggiorna elenco» e lo leggo da Google.'}</p>
                ${u && u.contesto && u.modello === Gemini.modello() ? `<p>L'ultima richiesta ne occupava <b>${n(u.contesto)}</b>${lim ? ` (${Math.max(1, Math.round(u.contesto / lim.ingresso * 100))}%)` : ''}, ${u.mb.toFixed(1).replace('.', ',')} MB.</p>` : ''}
                <p class="nota">Per restare veloce la chat manda al modello gli ultimi ${TURNI_TENUTI} messaggi tuoi (con le risposte e i risultati degli
                    strumenti), accorcia i risultati lunghi dei messaggi vecchi e, nella chat del set, i materiali scelti come fonti. I PDF e le immagini
                    grandi si caricano una volta sui server di Gemini (restano 48 ore) invece di ripartire a ogni passo.</p>`,
            azioni: [{ testo: 'Ho capito', classe: 'btn-primario', principale: true }],
        });
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
        fontiTemp.delete(conv.id);
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
        disegnaFontiTemp();
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

    // Le parti dei materiali si preparano una volta per messaggio, non a ogni passo dell'assistente
    let partiFonti = null;   // { chiave, parti }

    async function contenuti() {
        const storico = compatta(taglia(conv.storico)).map(c => ({ role: c.role, parts: c.parts }));
        // Chat del set: i materiali scelti vanno in testa come fonti; in ogni chat, anche le fonti aggiunte a mano
        const fonti = setId ? Dati.materialiDiSet(setId).filter(m => m.usaInChat !== false) : [];
        const temp = fontiDellaChat();
        if ((!fonti.length && !temp.length) || !storico.length) return storico;
        const chiave = (setId || '') + '|' + fonti.map(m => `${m.id}:${m.aggiornato || m.creato || ''}`).join(',') + '|' + temp.map(f => f.id).join(',');
        if (!partiFonti || partiFonti.chiave !== chiave) {
            attesa = `Preparo ${plurale(fonti.length + temp.length, 'fonte', 'fonti')}…`;
            disegnaMessaggi();
            const budget = { inline: BUDGET_INLINE };
            const parti = [];
            if (fonti.length) {
                parti.push({ text: `Materiali del set «${Dati.set(setId).nome}», caricati dall'utente: sono le fonti di questa conversazione.` });
                for (const m of fonti) parti.push(...await Materiali.partiPerIA(m, budget));
            }
            if (temp.length) {
                parti.push({ text: `Fonti che l'utente ha aggiunto a mano solo per questa conversazione (${temp.length}): tienine conto insieme alle altre. Non sono nei materiali: non provare a leggerle o citarle con gli strumenti dei materiali.` });
                for (const f of temp) parti.push(...await Materiali.partiPerIA(f, budget));
            }
            partiFonti = { chiave, parti };
        }
        storico[0] = { role: storico[0].role, parts: [...partiFonti.parti, ...storico[0].parts] };
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
        partiFonti = null;   // i materiali si rileggono a ogni messaggio (possono essere cambiati)
        disegna();
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
                    suAttesa: (secondi, tentativo, motivo) => {
                        attesa = motivo === 'rete' ? `La connessione è caduta, riprovo tra ${secondi} s (tentativo ${tentativo})…` : `Gemini è occupato, riprovo tra ${secondi} s (tentativo ${tentativo})…`;
                        disegnaMessaggi();
                    },
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
