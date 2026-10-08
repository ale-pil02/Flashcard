// Archivio: unico punto in cui i dati vengono letti e scritti.
//
// All'avvio carica tutte le collezioni da IndexedDB in memoria; da lì in poi le letture
// sono sincrone (dalla memoria) e ogni scrittura aggiorna la memoria subito e il disco
// in background. Il resto dell'app non tocca mai IndexedDB direttamente: per aggiungere
// in futuro la sincronizzazione col cloud basta agganciarsi a Archivio.alCambio().
//
// Due archivi stanno a parte e non vengono caricati in memoria, si leggono solo quando servono:
//   file      il contenuto dei materiali (PDF, immagini, slide…), con lo stesso id del materiale
//   storia    le modifiche che si possono annullare (js/storia.js)

const Archivio = (() => {
    const NOME_DB = 'flashcard';
    const VERSIONE_DB = 5;
    const COLLEZIONI = ['materie', 'set', 'carte', 'ripassi', 'esami', 'impostazioni', 'materiali', 'chat', 'argomenti', 'mappe'];
    const SEPARATI = ['file', 'storia'];

    const cache = {};
    const ascoltatori = [];
    const osservatoriFile = [];
    const separatiInMemoria = Object.fromEntries(SEPARATI.map(n => [n, new Map()]));   // ripiego senza IndexedDB
    let db = null;
    let soloMemoria = false;

    function richiesta(req) {
        return new Promise((ok, ko) => {
            req.onsuccess = () => ok(req.result);
            req.onerror = () => ko(req.error);
        });
    }

    function apriDb() {
        return new Promise((ok, ko) => {
            const req = indexedDB.open(NOME_DB, VERSIONE_DB);
            req.onupgradeneeded = () => {
                const d = req.result;
                [...COLLEZIONI, ...SEPARATI].forEach(nome => {
                    if (!d.objectStoreNames.contains(nome)) d.createObjectStore(nome, { keyPath: 'id' });
                });
            };
            req.onsuccess = () => ok(req.result);
            req.onerror = () => ko(req.error);
            // Un'altra scheda tiene aperta la versione vecchia: si aspetta che la chiuda
            req.onblocked = () => { if (window.Ui) Ui.toast("Chiudi le altre schede dell'app per finire l'aggiornamento", 'errore', 10000); };
        });
    }

    async function apri() {
        COLLEZIONI.forEach(nome => { cache[nome] = new Map(); });
        try {
            db = await apriDb();
            // Un'altra scheda con una versione più nuova dell'app: questa si chiude da sola
            db.onversionchange = () => { db.close(); if (window.Ui) Ui.toast("L'app è stata aggiornata in un'altra scheda: ricarica la pagina", 'errore', 10000); };
            for (const nome of COLLEZIONI) {
                const tutti = await richiesta(db.transaction(nome).objectStore(nome).getAll());
                tutti.forEach(oggetto => cache[nome].set(oggetto.id, oggetto));
            }
            // Chiede al browser di non cancellare i dati quando lo spazio scarseggia
            if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        } catch (e) {
            console.error('IndexedDB non disponibile, i dati resteranno solo in memoria', e);
            soloMemoria = true;
        }
        return !soloMemoria;
    }

    function transazione(nome, operazione) {
        return new Promise((ok, ko) => {
            const tx = db.transaction(nome, 'readwrite');
            operazione(tx.objectStore(nome));
            tx.oncomplete = () => ok();
            tx.onerror = tx.onabort = () => ko(tx.error);
        });
    }

    function segnalaErrore(errore) {
        console.error('Salvataggio non riuscito', errore);
        if (window.Ui) Ui.toast('Salvataggio non riuscito: ' + (errore && errore.message || errore), 'errore', 6000);
    }

    function scrivi(nome, operazioni) {
        notifica(nome, operazioni);
        if (soloMemoria || !db) return Promise.resolve();
        return transazione(nome, store => operazioni.forEach(op => (op.tipo === 'salva' ? store.put(op.valore) : store.delete(op.id))))
            .catch(segnalaErrore);
    }

    function notifica(nome, operazioni) {
        ascoltatori.forEach(fn => { try { fn(nome, operazioni); } catch (e) { console.error(e); } });
    }

    function tutti(nome) { return [...cache[nome].values()]; }
    function prendi(nome, id) { return cache[nome].get(id) || null; }

    function salva(nome, oggetto) {
        cache[nome].set(oggetto.id, oggetto);
        return scrivi(nome, [{ tipo: 'salva', valore: oggetto }]);
    }

    function salvaMolti(nome, lista) {
        if (!lista.length) return Promise.resolve();
        lista.forEach(o => cache[nome].set(o.id, o));
        return scrivi(nome, lista.map(o => ({ tipo: 'salva', valore: o })));
    }

    function elimina(nome, id) {
        cache[nome].delete(id);
        return scrivi(nome, [{ tipo: 'elimina', id }]);
    }

    function eliminaMolti(nome, ids) {
        if (!ids.length) return Promise.resolve();
        ids.forEach(id => cache[nome].delete(id));
        return scrivi(nome, ids.map(id => ({ tipo: 'elimina', id })));
    }

    // Copia profonda delle collezioni, per poter tornare indietro (js/storia.js)
    function fotografia(escluse = []) {
        const foto = {};
        COLLEZIONI.filter(nome => !escluse.includes(nome)).forEach(nome => {
            foto[nome] = new Map(structuredClone(tutti(nome)).map(o => [o.id, o]));
        });
        return foto;
    }

    // ---- Archivi a parte (non in memoria) -------------------------------------

    async function leggiRiga(nome, id) {
        if (soloMemoria || !db) return separatiInMemoria[nome].get(id) || null;
        return (await richiesta(db.transaction(nome).objectStore(nome).get(id))) || null;
    }

    function salvaRiga(nome, riga) {
        if (soloMemoria || !db) { separatiInMemoria[nome].set(riga.id, riga); return Promise.resolve(); }
        return transazione(nome, store => store.put(riga)).catch(segnalaErrore);
    }

    function eliminaRighe(nome, ids) {
        ids = [].concat(ids).filter(Boolean);
        if (!ids.length) return Promise.resolve();
        if (soloMemoria || !db) { ids.forEach(id => separatiInMemoria[nome].delete(id)); return Promise.resolve(); }
        return transazione(nome, store => ids.forEach(id => store.delete(id))).catch(segnalaErrore);
    }

    async function tutteLeRighe(nome) {
        if (soloMemoria || !db) return [...separatiInMemoria[nome].values()];
        return richiesta(db.transaction(nome).objectStore(nome).getAll());
    }

    // File dei materiali. Chi osserva (la storia delle modifiche) li legge prima che cambino.
    async function primaDeiFile(ids) {
        for (const fn of osservatoriFile) { try { await fn(ids); } catch (e) { console.error(e); } }
    }

    async function salvaFile(id, blob) {
        await primaDeiFile([id]);
        return salvaRiga('file', { id, blob });
    }

    async function leggiFile(id) {
        const riga = await leggiRiga('file', id);
        return riga ? riga.blob : null;
    }

    async function eliminaFile(ids) {
        ids = [].concat(ids).filter(Boolean);
        if (!ids.length) return;
        await primaDeiFile(ids);
        return eliminaRighe('file', ids);
    }

    // ---- Backup ------------------------------------------------------------

    // Fotografia completa dei dati, file dei materiali compresi (in base64)
    async function esporta() {
        const dati = {};
        COLLEZIONI.forEach(nome => { dati[nome] = tutti(nome); });
        const file = [];
        for (const { id, blob } of await tutteLeRighe('file')) {
            if (blob) file.push({ id, tipo: blob.type, dati: await bloInBase64(blob) });
        }
        return { app: 'flashcard', versione: 2, esportato: new Date().toISOString(), dati, file };
    }

    // Sostituisce tutto il contenuto (ripristino da backup o cancellazione totale).
    // La storia delle modifiche riguarda i dati di prima: si svuota.
    async function sostituisciTutto(dati, file = []) {
        for (const nome of COLLEZIONI) {
            const lista = Array.isArray(dati[nome]) ? dati[nome].filter(o => o && o.id) : [];
            cache[nome] = new Map(lista.map(o => [o.id, o]));
            if (!soloMemoria && db) await transazione(nome, store => { store.clear(); lista.forEach(o => store.put(o)); });
            notifica(nome, [{ tipo: 'sostituisci' }]);
        }
        const righe = (file || []).filter(f => f && f.id && f.dati).map(f => ({ id: f.id, blob: base64InBlob(f.dati, f.tipo) }));
        if (soloMemoria || !db) {
            separatiInMemoria.file = new Map(righe.map(r => [r.id, r]));
            separatiInMemoria.storia.clear();
        } else {
            await transazione('file', store => { store.clear(); righe.forEach(r => store.put(r)); });
            await transazione('storia', store => store.clear());
        }
    }

    async function spazioUsato() {
        if (!navigator.storage || !navigator.storage.estimate) return null;
        try { return await navigator.storage.estimate(); } catch (e) { return null; }
    }

    return {
        COLLEZIONI, apri, tutti, prendi, salva, salvaMolti, elimina, eliminaMolti, fotografia,
        leggiRiga, salvaRiga, eliminaRighe, tutteLeRighe,
        salvaFile, leggiFile, eliminaFile,
        esporta, sostituisciTutto, spazioUsato,
        alCambio: fn => ascoltatori.push(fn),
        osservaFile: fn => osservatoriFile.push(fn),
        get soloMemoria() { return soloMemoria; },
    };
})();
