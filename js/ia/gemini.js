// Collegamento a Gemini (Google) tramite l'API generateContent, come in Allenamento.
// La chiave resta solo in questo browser (localStorage): non finisce nei backup.

const Gemini = (() => {
    const BASE = 'https://generativelanguage.googleapis.com';
    const CHIAVE = 'flashcard-gemini-chiave';
    const MODELLO = 'flashcard-gemini-modello';
    const MODELLI = 'flashcard-gemini-modelli';
    const RAGIONAMENTO = 'flashcard-gemini-ragionamento';
    // Livello di ragionamento, come "Thinking level" in Google AI Studio. '' = quello predefinito del modello.
    // Si manda solo thinkingLevel (Gemini 3 e successivi). Niente thinkingBudget, temperature, topP o topK: Google li
    // considera superati e i prossimi modelli li rifiuteranno; i Gemini 2.5 usano il loro ragionamento predefinito.
    const LIVELLI = [['', 'Predefinito del modello'], ['minimal', 'Minimo'], ['low', 'Basso'], ['medium', 'Medio'], ['high', 'Alto']];
    const MODELLI_DEFAULT = ['gemini-3.6-flash', 'gemini-3.8-flash'];
    // Google risponde 429/503 quando il modello è congestionato: si ritenta con attesa crescente
    const RITENTABILI = new Set([429, 500, 502, 503, 504]);
    const TENTATIVI = 3;

    const leggi = (k, ripiego) => { try { const v = localStorage.getItem(k); return v == null ? ripiego : v; } catch (e) { return ripiego; } };
    const scrivi = (k, v) => { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage non disponibile */ } };

    function chiave() { return String(leggi(CHIAVE, '') || '').trim(); }
    function impostaChiave(k) { scrivi(CHIAVE, String(k || '').trim()); }

    function modelli() {
        try { const l = JSON.parse(leggi(MODELLI, 'null')); if (Array.isArray(l) && l.length) return l; } catch (e) { /* elenco rovinato */ }
        return MODELLI_DEFAULT.slice();
    }
    function modello() { return leggi(MODELLO, '') || modelli()[0]; }
    function impostaModello(m) { scrivi(MODELLO, String(m || '').trim().replace(/^models\//, '')); }

    function ragionamento() { const v = leggi(RAGIONAMENTO, ''); return LIVELLI.some(l => l[0] === v) ? v : ''; }
    function impostaRagionamento(v) { scrivi(RAGIONAMENTO, LIVELLI.some(l => l[0] === v) ? v : ''); }
    function nomeRagionamento(v = ragionamento()) { return (LIVELLI.find(l => l[0] === v) || LIVELLI[0])[1]; }

    // thinkingConfig per il modello attivo (null = non mandare niente): thinkingLevel per i Gemini 3 e successivi e per i
    // nomi senza versione (gemini-flash-latest, gemini-pro-latest…), che puntano ai modelli attuali
    function configRagionamento(livello, id = modello()) {
        if (!livello) return null;
        const v = String(id).match(/gemini-(\d+)/i);
        return !v || +v[1] >= 3 ? { thinkingLevel: livello } : null;
    }

    function livelloApplicabile(id = modello()) { return !!configRagionamento('low', id); }

    function attendi(ms, segnale) {
        return new Promise((ok, ko) => {
            const t = setTimeout(ok, ms);
            if (segnale) segnale.addEventListener('abort', () => { clearTimeout(t); ko(new DOMException('Interrotto', 'AbortError')); }, { once: true });
        });
    }

    function erroreLeggibile(stato, messaggio) {
        const m = messaggio || 'errore sconosciuto';
        if (/api key not valid|API_KEY_INVALID/i.test(m)) return 'La chiave API di Gemini non è valida: controllala nelle impostazioni dell\'assistente.';
        if (stato === 403) return `Accesso negato da Google (${m}). Controlla che la chiave sia abilitata all'API Gemini.`;
        if (stato === 404) return `Il modello «${modello()}» non esiste o non è disponibile per la tua chiave: in Impostazioni → Assistente IA premi "Aggiorna elenco" e scegline un altro.`;
        if (stato === 429) return `Hai superato il limite di richieste di Gemini (${m}). Aspetta un minuto o scegli un modello "flash".`;
        if (RITENTABILI.has(stato)) return `«${modello()}» è congestionato sui server di Google e ho già riprovato ${TENTATIVI} volte. Riprova tra poco o scegli un modello "flash".`;
        return m;
    }

    let ultimo = null;   // ultima risposta: modello, ragionamento richiesto e usato, token di ragionamento

    // corpo: { systemInstruction, contents, tools, toolConfig, generationConfig }
    async function genera(corpo, { segnale, suAttesa } = {}) {
        const k = chiave();
        if (!k) throw new Error('Manca la chiave API di Gemini: inseriscila in Impostazioni → Assistente IA.');
        const url = `${BASE}/v1beta/models/${encodeURIComponent(modello())}:generateContent`;
        // Il livello di ragionamento scelto va in generationConfig, se chi chiama non ne ha già messo uno.
        // Se il modello non lo accetta: "minimo" ripiega su "basso" (resta il più vicino), poi sul predefinito del modello
        const pensiero = !(corpo.generationConfig && corpo.generationConfig.thinkingConfig) && configRagionamento(ragionamento());
        const conPensiero = config => {
            const { generationConfig, ...base } = corpo;
            const { thinkingConfig, ...resto } = generationConfig || {};
            const finale = config ? { ...resto, thinkingConfig: config } : resto;
            return JSON.stringify(Object.keys(finale).length ? { ...base, generationConfig: finale } : base);
        };
        const ripieghi = pensiero ? (pensiero.thinkingLevel === 'minimal' ? [{ thinkingLevel: 'low' }, null] : [null]) : [];
        let usato = pensiero || null;
        let payload = conPensiero(usato);
        for (let tentativo = 1; ; tentativo++) {
            const risposta = await fetch(url, {
                method: 'POST', signal: segnale,
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
                body: payload,
            });
            const dati = await risposta.json().catch(() => ({}));
            if (risposta.ok && !dati.error) {
                // Quanto ha ragionato davvero (token di ragionamento) e con quale impostazione: per la prova nelle impostazioni
                ultimo = { modello: modello(), richiesto: pensiero || null, usato, pensiero: (dati.usageMetadata || {}).thoughtsTokenCount || 0 };
                return dati;
            }
            // Livello non accettato da questo modello: si riprova con il ripiego successivo
            if (ripieghi.length && risposta.status === 400 && /think/i.test((dati.error && dati.error.message) || '')) {
                usato = ripieghi.shift();
                payload = conPensiero(usato);
                if (window.Ui) Ui.toast(`«${modello()}» non accetta il ragionamento «${nomeRagionamento()}»: uso ${usato ? `«${nomeRagionamento(usato.thinkingLevel)}»` : 'quello predefinito del modello'}`, 'info', 6000);
                tentativo--;
                continue;
            }
            if (RITENTABILI.has(risposta.status) && tentativo < TENTATIVI) {
                const suggerita = parseFloat(((dati.error && dati.error.details) || []).map(d => d.retryDelay).find(Boolean)) * 1000;
                const pausa = Math.min(Math.max(suggerita || 1500 * 2 ** (tentativo - 1), 1000), 20000);
                if (suAttesa) suAttesa(Math.round(pausa / 1000), tentativo + 1);
                await attendi(pausa, segnale);
                continue;
            }
            const errore = new Error(erroreLeggibile(risposta.status, dati.error && dati.error.message));
            errore.stato = risposta.status;
            throw errore;
        }
    }

    // Elenco dei modelli attivi per la chiave
    async function aggiornaModelli() {
        const k = chiave();
        if (!k) throw new Error('Serve la chiave API per leggere l\'elenco dei modelli.');
        const trovati = [];
        let pagina = '';
        do {
            const r = await fetch(`${BASE}/v1beta/models?pageSize=200${pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''}`, { headers: { 'x-goog-api-key': k } });
            const dati = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(erroreLeggibile(r.status, dati.error && dati.error.message));
            (dati.models || []).forEach(m => {
                const id = String(m.name || '').replace(/^models\//, '');
                if ((m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(id)) trovati.push(id);
            });
            pagina = dati.nextPageToken || '';
        } while (pagina);
        if (!trovati.length) throw new Error('Nessun modello Gemini compatibile per questa chiave.');
        const lista = [...new Set(trovati)].sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
        scrivi(MODELLI, JSON.stringify(lista));
        if (!lista.includes(modello())) impostaModello(lista.find(m => /flash/.test(m) && !/lite|image|tts|audio|live/.test(m)) || lista[0]);
        return lista;
    }

    // File API (per PDF grandi): caricamento in due passi, il file resta su Google 48 ore
    async function caricaFile(blob, mime, nome) {
        const k = chiave();
        if (!k) throw new Error('Manca la chiave API di Gemini.');
        const avvio = await fetch(`${BASE}/upload/v1beta/files`, {
            method: 'POST',
            headers: {
                'x-goog-api-key': k,
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': String(blob.size),
                'X-Goog-Upload-Header-Content-Type': mime,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ file: { display_name: String(nome || 'materiale').slice(0, 120) } }),
        });
        const indirizzo = avvio.headers.get('x-goog-upload-url');
        if (!avvio.ok || !indirizzo) throw new Error('Caricamento del file su Gemini non riuscito');
        const fine = await fetch(indirizzo, {
            method: 'POST',
            headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
            body: blob,
        });
        const dati = await fine.json().catch(() => ({}));
        if (!fine.ok || !dati.file) throw new Error('Caricamento del file su Gemini non riuscito');
        let file = dati.file;
        // Il file è utilizzabile solo quando Google ha finito di elaborarlo
        for (let i = 0; i < 30 && file.state === 'PROCESSING'; i++) {
            await attendi(2000);
            const r = await fetch(`${BASE}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': k } });
            file = await r.json();
        }
        if (file.state && file.state !== 'ACTIVE') throw new Error('Google non è riuscito a elaborare il file');
        return file;
    }

    return {
        chiave, impostaChiave, modelli, modello, impostaModello, aggiornaModelli, genera, caricaFile, MODELLI_DEFAULT,
        LIVELLI, ragionamento, impostaRagionamento, nomeRagionamento, configRagionamento, livelloApplicabile,
        get ultimo() { return ultimo; },
    };
})();
