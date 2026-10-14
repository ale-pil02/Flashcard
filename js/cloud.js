// Cloud: accesso con Google e sincronizzazione tra dispositivi con Firebase, come per Allenamento.
// Istruzioni per creare il progetto e pubblicare il sito: ISTRUZIONI-FIREBASE.md
//
// Finché CONFIG_FIREBASE qui sotto non è compilata l'app funziona come prima, solo in questo browser.
// Compilata, l'app (online e anche da Flashcard.bat) si apre solo dopo l'accesso con l'account autorizzato dalle
// regole (firestore.rules, storage.rules) e i dati restano uguali su tutti i dispositivi.
//
// Come funziona
// - I dati restano anche qui (IndexedDB, js/archivio.js): l'app è veloce e funziona senza rete.
// - Ogni modifica locale (Archivio.alCambio / alCambioFile) entra nella coda (archivio "coda", sopravvive alla chiusura)
//   e parte dopo un attimo: un documento Firestore per oggetto, in utenti/{uid}/{collezione}/{id}, con il JSON
//   dell'oggetto, l'ora del server (agg) e la sessione che l'ha scritto. Un oggetto eliminato lascia { eliminato }.
//   Gli oggetti più grandi di 900 KB (mappe con molte immagini, chat lunghe) vanno in Cloud Storage e il documento
//   dice solo { grande }. I file dei materiali vanno in Cloud Storage (utenti/{uid}/file/{id}) e hanno un documento in
//   utenti/{uid}/file con dimensione e tipo, così gli altri dispositivi sanno che sono cambiati.
// - Per ogni collezione si ascoltano solo i documenti cambiati dopo l'ultimo visto (agg > ultimo): all'apertura arriva
//   solo quello che è cambiato altrove, non tutto. Le modifiche arrivate si applicano con Archivio.applicaRemoto, che
//   non le registra nella storia e non le rimanda indietro. Se qui c'è una modifica non ancora inviata dello stesso
//   oggetto, vince quella di qui (partirà subito dopo).
// - I file arrivano solo quando servono (Archivio.leggiFile): la prima apertura di un PDF su un dispositivo lo scarica.
// - Restano solo su questo dispositivo: la chiave di Gemini, la storia delle modifiche (Annulla), le preferenze di
//   visualizzazione in localStorage (larghezze, sezioni aperte, filtri).
// - Primo accesso da un dispositivo: se il cloud è vuoto ci salgono i dati di qui; se ha già dei dati e qui non c'è
//   niente si scaricano; se ci sono da entrambe le parti si chiede se prendere quelli del cloud o unirli.

const Cloud = (() => {
    // ⬇️ INCOLLA QUI LA CONFIGURAZIONE DEL PROGETTO FIREBASE (Impostazioni progetto → Le tue app → App web) ⬇️
    const CONFIG_FIREBASE = {
        apiKey: "AIzaSyDGz5-pRGZjbvkF9XJayataCVee3Ur5i50",
        authDomain: "flashcard-ale.firebaseapp.com",
        projectId: "flashcard-ale",
        storageBucket: "flashcard-ale.firebasestorage.app",
        messagingSenderId: "338154450694",
        appId: "1:338154450694:web:4fa01dd64e0c560644f887"
    };
    // ⬆️ FINE CONFIGURAZIONE ⬆️

    const VERSIONE_SDK = '12.17.0';
    const MAX_DOC = 900 * 1024;           // oltre, il JSON va in Cloud Storage (il limite di Firestore è 1 MiB)
    const MAX_OPERAZIONI = 400;           // per scrittura a blocchi (il limite è 500)
    const MAX_BYTE_BLOCCO = 8 * 1024 * 1024;
    const ATTESA_INVIO = 1200;
    const RIPROVA = 30000;
    const CHIAVE_ACCESSO = 'flashcard-accesso';            // uid già verificato su questo browser: si apre anche offline
    const CHIAVE_STATO = uid => 'flashcard-cloud-' + uid;  // { inizializzato, ultimo: { collezione: ms }, grandi: [] }
    const CON_DATI = ['materie', 'set', 'carte', 'mappe', 'argomenti', 'esami', 'materiali', 'ripassi'];
    const ELENCHI = [...Archivio.COLLEZIONI, 'file'];

    const configurato = !Object.values(CONFIG_FIREBASE).some(v => !v || v === 'DA_COMPILARE');
    const attivo = configurato && location.protocol !== 'file:';
    const sessione = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);   // questo caricamento della pagina

    let fb = null;               // { auth, db, st, A, F, S }: moduli e istanze di Firebase
    let utente = null;
    let pronto = false;          // primo allineamento fatto: si invia e si riceve
    let silenzio = false;        // le modifiche locali non vanno in coda (svuotamento prima di prendere il cloud)
    let statoLocale = null;
    let ascolti = [];            // funzioni per smettere di ascoltare
    let timerInvio = null;
    let inviando = null;         // promessa dell'invio in corso
    let fase = attivo ? 'avvio' : 'spento';   // spento | avvio | accesso | fuori | attivo
    let lavoro = '';             // cosa sta facendo adesso (primo caricamento, download…)
    let avanzamento = null;      // { titolo, totale } del primo caricamento
    let primoArrivo = null;      // collezioni non ancora arrivate dopo aver preso i dati dal cloud
    let erroreInvio = null;
    let erroreAscolto = null;
    let ultimaSincronizzazione = null;
    let contatore = 0;
    let motivoUscita = null;
    const coda = new Map();      // "collezione/id" → { id, nome, docId, quando }
    const arrivi = new Map(ELENCHI.map(n => [n, Promise.resolve()]));   // una catena per collezione: arrivi in ordine

    // ---- Stato visibile ------------------------------------------------------------

    function stato() {
        return {
            attivo, configurato, fase, lavoro, email: utente ? utente.email || '' : '',
            inAttesa: coda.size, erroreInvio, erroreAscolto, ultima: ultimaSincronizzazione,
        };
    }

    function avvisa() { document.dispatchEvent(new CustomEvent('cloud-stato', { detail: stato() })); }
    function cambiaFase(nuova) { fase = nuova; avvisa(); }
    function lavora(testo) { lavoro = testo || ''; avvisa(); }

    function descrizione() {
        if (!attivo) return configurato ? 'Spento: app aperta dal disco' : 'Non configurato: i dati restano solo in questo browser';
        if (fase === 'avvio' || fase === 'accesso') return 'Accesso in corso…';
        if (fase === 'fuori') return 'Non hai fatto l\'accesso';
        if (lavoro) return lavoro;
        if (!navigator.onLine) return coda.size ? `Senza rete: ${plurale(coda.size, 'modifica partirà', 'modifiche partiranno')} quando torna` : 'Senza rete: le modifiche partiranno quando torna';
        if (erroreAscolto) return 'Ricezione interrotta (' + erroreAscolto + '): riprovo da solo';
        if (erroreInvio) return 'Invio non riuscito (' + erroreInvio + '): riprovo da solo';
        if (coda.size) return `Invio di ${plurale(coda.size, 'modifica', 'modifiche')}…`;
        return ultimaSincronizzazione ? `Sincronizzato · ${new Date(ultimaSincronizzazione).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : 'Sincronizzato';
    }

    // Per il pallino: ok, lavoro, errore, spento
    function livello() {
        if (!attivo || fase === 'fuori') return 'spento';
        if (erroreInvio || erroreAscolto || !navigator.onLine) return 'errore';
        if (fase !== 'attivo' || lavoro || coda.size) return 'lavoro';
        return 'ok';
    }

    // ---- Schermata di accesso ------------------------------------------------------

    let gate = null;
    function mostraGate(testo, conPulsante) {
        if (!gate) {
            gate = document.createElement('div');
            gate.className = 'accesso-gate';
            gate.innerHTML = `
                <div class="accesso-scheda">
                    <span class="accesso-logo"><svg class="ico" aria-hidden="true"><use href="#i-carte"/></svg></span>
                    <h2>Flashcard</h2>
                    <p data-accesso-testo></p>
                    <button type="button" class="btn-google" data-accesso-login>
                        <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.9 6.2C12.3 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.2 6.8-17.4z"/><path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.4 0 20.1 0 24s.9 7.6 2.5 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.7-4-13.6-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/></svg>
                        Accedi con Google
                    </button>
                </div>`;
            gate.querySelector('[data-accesso-login]').addEventListener('click', accedi);
            document.body.appendChild(gate);
        }
        gate.querySelector('[data-accesso-testo]').textContent = testo;
        gate.querySelector('[data-accesso-login]').hidden = !conPulsante;
        document.body.classList.add('bloccata');
    }

    function sblocca() { document.body.classList.remove('bloccata'); }

    function accessoRicordato() { try { return localStorage.getItem(CHIAVE_ACCESSO); } catch (e) { return null; } }
    function ricordaAccesso(uid) { try { if (uid) localStorage.setItem(CHIAVE_ACCESSO, uid); else localStorage.removeItem(CHIAVE_ACCESSO); } catch (e) { /* niente */ } }

    // Subito, prima che l'app disegni: un browser mai verificato resta coperto
    if (attivo && !accessoRicordato()) mostraGate('Verifica dell\'accesso…', false);

    // ---- Coda delle modifiche locali ------------------------------------------------

    function chiave(nome, id) { return nome + '/' + id; }

    function accoda(nome, ids) {
        if (!attivo) return;
        const righe = [];
        ids.forEach(id => {
            if (!id) return;
            const r = { id: chiave(nome, id), nome, docId: id, quando: Date.now() * 1000 + (contatore++ % 1000) };
            coda.set(r.id, r);
            righe.push(r);
        });
        if (!righe.length) return;
        Archivio.salvaRighe('coda', righe);
        programmaInvio();
    }

    Archivio.alCambio((nome, operazioni) => {
        if (!attivo || silenzio) return;
        const ids = new Set();
        operazioni.forEach(op => {
            if (op.tipo === 'salva') ids.add(op.valore.id);
            else if (op.tipo === 'elimina') ids.add(op.id);
            else if (op.tipo === 'sostituisci') [...(op.prima || []), ...(op.dopo || [])].forEach(id => ids.add(id));
        });
        accoda(nome, [...ids]);
    });
    Archivio.alCambioFile(ids => { if (attivo && !silenzio) accoda('file', ids); });

    async function caricaCoda() {
        const righe = await Archivio.tutteLeRighe('coda');
        righe.forEach(r => { if (r && r.id && !coda.has(r.id)) coda.set(r.id, r); });
    }

    function programmaInvio(subito = false) {
        clearTimeout(timerInvio);
        avvisa();
        if (!pronto) return;
        timerInvio = setTimeout(invia, subito ? 0 : ATTESA_INVIO);
    }

    // ---- Firebase --------------------------------------------------------------------

    async function carica() {
        const base = `https://www.gstatic.com/firebasejs/${VERSIONE_SDK}/`;
        const [{ initializeApp }, A, F, S] = await Promise.all([
            import(base + 'firebase-app.js'),
            import(base + 'firebase-auth.js'),
            import(base + 'firebase-firestore.js'),
            import(base + 'firebase-storage.js'),
        ]);
        const app = initializeApp(CONFIG_FIREBASE);
        fb = { A, F, S, auth: A.getAuth(app), db: F.initializeFirestore(app, {}), st: S.getStorage(app) };
    }

    const rifUtente = () => fb.F.doc(fb.db, 'utenti', utente.uid);
    const rifDoc = (nome, id) => fb.F.doc(fb.db, 'utenti', utente.uid, nome, id);
    const rifFile = id => fb.S.ref(fb.st, `utenti/${utente.uid}/file/${id}`);
    const rifGrande = (nome, id) => fb.S.ref(fb.st, `utenti/${utente.uid}/grandi/${nome}/${id}.json`);
    const nonTrovato = e => e && (e.code === 'storage/object-not-found' || e.code === 'not-found');
    const dormi = ms => new Promise(r => setTimeout(r, ms));

    async function accedi() {
        if (!fb) return;
        try {
            await fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
        } catch (e) {
            if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
                await fb.A.signInWithRedirect(fb.auth, new fb.A.GoogleAuthProvider());
            } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
                mostraGate('Accesso non riuscito: ' + (e.message || e.code), true);
            }
        }
    }

    async function esci() {
        if (!fb) return;
        const ok = await Ui.conferma('La pagina si blocca finché non accedi di nuovo. I dati restano nel cloud e anche su questo dispositivo.'
            + (coda.size ? `<br><br><b>Attenzione:</b> ${plurale(coda.size, 'modifica non è ancora partita', 'modifiche non sono ancora partite')}: partiranno al prossimo accesso.` : ''),
            { titolo: 'Uscire dall\'account?', ok: 'Esci' });
        if (ok) await fb.A.signOut(fb.auth);
    }

    // Solo il server sa se l'account è quello autorizzato: le regole lasciano leggere solo al proprietario
    async function verifica(u) {
        try {
            const d = await fb.F.getDocFromServer(fb.F.doc(fb.db, 'utenti', u.uid));
            return { esito: 'ok', esiste: d.exists() };
        } catch (e) {
            return { esito: e.code === 'permission-denied' ? 'negato' : 'offline' };
        }
    }

    async function avvia() {
        if (!attivo) { cambiaFase('spento'); return; }
        await caricaCoda();
        try {
            await carica();
        } catch (e) {
            console.error('Firebase non avviato', e);
            if (!accessoRicordato()) mostraGate('Non riesco a contattare il servizio di accesso. Controlla la connessione e ricarica la pagina.', false);
            erroreAscolto = 'cloud non raggiungibile, ricarica la pagina quando torna la rete';
            cambiaFase('attivo');
            return;
        }
        window.addEventListener('online', () => { if (pronto) { riascolta(); programmaInvio(true); } avvisa(); });
        window.addEventListener('offline', avvisa);
        fb.A.onAuthStateChanged(fb.auth, u => quandoCambiaUtente(u).catch(e => {
            console.error(e);
            erroreAscolto = e.code || e.message || String(e);
            lavora('');
        }));
    }

    async function quandoCambiaUtente(u) {
        fermaAscolti();
        pronto = false;
        utente = u;
        Archivio.impostaFonteRemota(null);
        if (!u) {
            ricordaAccesso(null);
            mostraGate(motivoUscita || 'App privata: accedi con il tuo account Google.', true);
            motivoUscita = null;
            cambiaFase('fuori');
            return;
        }
        cambiaFase('accesso');
        const v = await verifica(u);
        if (v.esito === 'negato') {
            ricordaAccesso(null);
            motivoUscita = `L'account ${u.email || ''} non è autorizzato a usare quest'app.`;
            await fb.A.signOut(fb.auth);   // prosegue nel ramo "!u" qui sopra
            return;
        }
        const riprovaOnline = () => window.addEventListener('online', () => { if (fb.auth.currentUser) quandoCambiaUtente(fb.auth.currentUser); }, { once: true });
        if (v.esito === 'offline' && accessoRicordato() !== u.uid) {
            mostraGate('Serve la connessione per il primo accesso da questo browser. Riprova appena sei online.', false);
            riprovaOnline();
            return;
        }
        if (v.esito === 'ok') ricordaAccesso(u.uid);
        sblocca();

        statoLocale = leggiStato(u.uid);
        if (!statoLocale.inizializzato) {
            if (v.esito !== 'ok') {
                cambiaFase('attivo');
                lavora('In attesa della rete per il primo allineamento');
                riprovaOnline();
                return;
            }
            const fatto = await primoAllineamento(v.esiste);
            if (!fatto) return;
        }
        Archivio.impostaFonteRemota(scaricaFile);
        pronto = true;
        cambiaFase('attivo');
        ascolta();
        programmaInvio(true);
    }

    // ---- Stato locale della sincronizzazione ----------------------------------------------

    function leggiStato(uid) {
        const vuoto = { inizializzato: false, ultimo: {}, grandi: [] };
        try { return { ...vuoto, ...JSON.parse(localStorage.getItem(CHIAVE_STATO(uid)) || '{}') }; } catch (e) { return vuoto; }
    }
    function salvaStato() {
        try { localStorage.setItem(CHIAVE_STATO(utente.uid), JSON.stringify(statoLocale)); } catch (e) { console.warn('Stato del cloud non salvato', e); }
    }

    // ---- Primo accesso da questo dispositivo ------------------------------------------------

    function quantiLocali() {
        const n = nome => Archivio.tutti(nome).length;
        return { materie: n('materie'), set: n('set'), carte: n('carte'), totale: CON_DATI.reduce((t, x) => t + n(x), 0) };
    }

    async function primoAllineamento(esiste) {
        cambiaFase('attivo');
        const locali = quantiLocali();
        if (!esiste) {
            if (!locali.totale) {
                // Né qui né nel cloud: si parte da zero
                statoLocale.inizializzato = true;
                salvaStato();
                return true;
            }
            // Cloud vuoto: salgono i dati di questo dispositivo
            Archivio.COLLEZIONI.forEach(nome => accoda(nome, Archivio.tutti(nome).map(o => o.id)));
            accoda('file', (await Archivio.tutteLeRighe('file')).map(r => r.id));
            pronto = true;
            const fine = await inviaTutto('Carico i tuoi dati nel cloud');
            if (!fine) {
                // Riprova da solo: la coda resta (anche chiudendo la pagina) e al prossimo avvio si ricomincia da qui
                pronto = false;
                setTimeout(() => { if (utente) quandoCambiaUtente(utente); }, RIPROVA);
                return false;
            }
            await fb.F.setDoc(rifUtente(), { creato: fb.F.serverTimestamp(), primoDispositivo: navigator.userAgent.slice(0, 120) }, { merge: true });
            // Da qui si ascolta solo quello che cambierà dopo: quello che c'è nel cloud è già qui
            const d = await fb.F.getDocFromServer(rifUtente());
            const ora = d.exists() && d.data().creato ? d.data().creato.toMillis() : Date.now();
            statoLocale.ultimo = Object.fromEntries(ELENCHI.map(n => [n, ora]));
            statoLocale.inizializzato = true;
            salvaStato();
            Ui.toast('I tuoi dati sono nel cloud: ora puoi aprire l\'app anche dagli altri dispositivi', 'successo', 7000);
            return true;
        }
        const scelta = locali.totale ? await chiediScelta(locali) : 'cloud';
        if (scelta === 'cloud') {
            // Si prendono quelli del cloud: qui si svuota e gli ascolti partono da zero
            silenzio = true;
            try { await Archivio.svuotaInSilenzio(); } finally { silenzio = false; }
            coda.clear();
            statoLocale.ultimo = {};
            primoArrivo = new Set(Archivio.COLLEZIONI);
            lavora('Scarico i tuoi dati dal cloud…');
            Archivio.COLLEZIONI.forEach(nome => document.dispatchEvent(new CustomEvent('dati-remoti', { detail: { nome, ids: [] } })));
        } else {
            await unisci();
        }
        statoLocale.inizializzato = true;
        salvaStato();
        return true;
    }

    function chiediScelta(locali) {
        return new Promise(risolvi => {
            let scelta = 'cloud';
            Ui.modale({
                titolo: 'Dati nel cloud e su questo dispositivo', classe: 'modale-piccola', chiudibile: false,
                corpo: `<p class="testo-conferma">Nel cloud ci sono già i tuoi dati, e anche su questo dispositivo ce ne sono
                    (${plurale(locali.materie, 'materia', 'materie')}, ${plurale(locali.set, 'set', 'set')}, ${plurale(locali.carte, 'flashcard', 'flashcard')}).</p>
                    <p class="nota"><b>Usa quelli del cloud</b>: quelli di qui vengono sostituiti (va bene se qui c'è una copia vecchia o i dati di prova).<br>
                    <b>Unisci</b>: quello che c'è solo qui sale nel cloud; dove c'è lo stesso elemento in tutti e due vince il cloud.</p>
                    <p class="nota">Nel dubbio, prima <button type="button" class="link" data-scarica-backup>scarica un backup</button> di questo dispositivo.</p>`,
                azioni: [
                    { testo: 'Unisci', classe: 'btn-secondario', clic: md => { scelta = 'unisci'; md.chiudi(); } },
                    { testo: 'Usa quelli del cloud', classe: 'btn-primario', principale: true, clic: md => { scelta = 'cloud'; md.chiudi(); } },
                ],
                alApri: el => $('[data-scarica-backup]', el).addEventListener('click', () => Importa.esportaBackup()),
                alChiudere: () => risolvi(scelta),
            });
        });
    }

    // Prende tutto il cloud (vince sugli elementi uguali), poi manda quello che c'è solo qui
    async function unisci() {
        lavora('Unisco i dati di qui con quelli del cloud…');
        for (const nome of ELENCHI) {
            const snap = await fb.F.getDocsFromServer(fb.F.collection(fb.db, 'utenti', utente.uid, nome));
            let massimo = 0;
            const nelCloud = new Set();
            const salvati = [], eliminati = [];
            for (const d of snap.docs) {
                const x = d.data();
                nelCloud.add(d.id);
                if (x.agg) massimo = Math.max(massimo, x.agg.toMillis());
                if (nome === 'file') continue;
                const o = await contenuto(nome, d.id, x);
                if (o === null) eliminati.push(d.id); else if (o && o.id) salvati.push(o);
            }
            // Dove c'è lo stesso elemento vince il cloud: le modifiche di qui ancora in coda non partono
            const via = [...nelCloud].map(id => chiave(nome, id)).filter(k => coda.has(k));
            via.forEach(k => coda.delete(k));
            await Archivio.eliminaRighe('coda', via);
            if (nome === 'file') {
                // La copia di qui del file si riscarica quando serve
                await Archivio.dimenticaFile([...nelCloud]);
            } else {
                await Archivio.applicaRemoto(nome, salvati, eliminati);
            }
            const soloQui = nome === 'file' ? (await Archivio.tutteLeRighe('file')).map(r => r.id) : Archivio.tutti(nome).map(o => o.id);
            accoda(nome, soloQui.filter(id => !nelCloud.has(id)));
            statoLocale.ultimo[nome] = massimo;
        }
        await fb.F.setDoc(rifUtente(), { unito: fb.F.serverTimestamp() }, { merge: true });
        lavora('');
    }

    // ---- Ricezione ---------------------------------------------------------------------

    // Il contenuto di un documento: l'oggetto, null se è stato eliminato, undefined se illeggibile
    async function contenuto(nome, id, x) {
        if (x.eliminato) return null;
        try {
            if (x.grande) return JSON.parse(await (await fb.S.getBlob(rifGrande(nome, id))).text());
            return JSON.parse(x.json);
        } catch (e) {
            console.warn('Documento del cloud non letto', nome, id, e);
            return undefined;
        }
    }

    function fermaAscolti() { ascolti.forEach(f => f()); ascolti = []; }

    function ascolta() {
        fermaAscolti();
        erroreAscolto = null;
        ELENCHI.forEach(nome => {
            const da = fb.F.Timestamp.fromMillis(statoLocale.ultimo[nome] || 0);
            const q = fb.F.query(fb.F.collection(fb.db, 'utenti', utente.uid, nome), fb.F.where('agg', '>', da));
            ascolti.push(fb.F.onSnapshot(q,
                snap => { arrivi.set(nome, arrivi.get(nome).then(() => arrivo(nome, snap)).catch(e => console.error('Arrivo dal cloud non applicato', nome, e))); },
                e => {
                    console.error('Ascolto del cloud interrotto', nome, e);
                    erroreAscolto = e.code || e.message || String(e);
                    avvisa();
                    if (e.code !== 'permission-denied') setTimeout(riascolta, RIPROVA);
                }));
        });
    }

    // Riparte dagli ultimi visti (dopo un errore o al ritorno della rete)
    function riascolta() { if (utente && pronto) ascolta(); }

    async function arrivo(nome, snap) {
        const salvati = [], eliminati = [], fileCambiati = [];
        let massimo = statoLocale.ultimo[nome] || 0;
        for (const ch of snap.docChanges()) {
            if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) continue;
            const x = ch.doc.data();
            if (x.agg) massimo = Math.max(massimo, x.agg.toMillis());
            if (x.sessione === sessione) continue;                  // scritto da questa pagina
            if (coda.has(chiave(nome, ch.doc.id))) continue;        // qui c'è una modifica più nuova che sta per partire
            if (nome === 'file') { fileCambiati.push(ch.doc.id); continue; }
            const o = await contenuto(nome, ch.doc.id, x);
            if (o === null) eliminati.push(ch.doc.id);
            else if (o && o.id) salvati.push(o);
        }
        if (nome === 'file') {
            if (fileCambiati.length) await Archivio.dimenticaFile(fileCambiati);
        } else if (salvati.length || eliminati.length) {
            // La mappa aperta nell'editor: si avvisa prima e dopo, come per le modifiche dell'assistente
            const aperta = nome === 'mappe' && typeof Viste !== 'undefined' && Viste.mappa && Viste.mappa.editor ? Viste.mappa.editor.id : null;
            const toccaAperta = aperta && (salvati.some(o => o.id === aperta) || eliminati.includes(aperta));
            if (toccaAperta) Mappe.primaDiCambiare(aperta);
            await Archivio.applicaRemoto(nome, salvati, eliminati);
            if (toccaAperta) Mappe.cambiataDaFuori(aperta);
        }
        statoLocale.ultimo[nome] = massimo;
        salvaStato();
        erroreAscolto = null;
        ultimaSincronizzazione = Date.now();
        if (primoArrivo && primoArrivo.delete(nome) && !primoArrivo.size) {
            primoArrivo = null;
            Dati.migra();
            lavora('');
            Ui.toast('Dati scaricati dal cloud', 'successo', 3000);
        } else avvisa();
    }

    // File dei materiali: scaricato la prima volta che serve (Archivio.leggiFile)
    async function scaricaFile(id) {
        if (!utente || !fb || !navigator.onLine) return null;
        try {
            return await fb.S.getBlob(rifFile(id));
        } catch (e) {
            if (nonTrovato(e)) return null;
            throw e;
        }
    }

    // ---- Invio ---------------------------------------------------------------------

    function invia() {
        if (inviando) return inviando;
        if (!pronto || !utente || !coda.size) { avvisa(); return Promise.resolve(); }
        inviando = inviaCoda().finally(() => {
            inviando = null;
            if (coda.size && !erroreInvio) programmaInvio();
            else avvisa();
        });
        return inviando;
    }

    async function inviaCoda() {
        try {
            const righe = [...coda.values()];
            const file = righe.filter(r => r.nome === 'file');
            const documenti = righe.filter(r => r.nome !== 'file');
            // Prima i file: quando un altro dispositivo vede il materiale, il suo file è già lì
            for (let i = 0; i < file.length; i++) {
                if (!avanzamento && file.length > 1) lavora(`Invio dei file: ${i + 1} di ${file.length}`);
                await inviaFile(file[i]);
                await togliDallaCoda([file[i]]);
            }
            if (!avanzamento) lavora('');
            let blocco = [], byte = 0;
            const chiudi = async () => {
                if (!blocco.length) return;
                const b = fb.F.writeBatch(fb.db);
                blocco.forEach(({ rif, dati }) => b.set(rif, dati));
                await b.commit();
                await togliDallaCoda(blocco.map(x => x.riga));
                blocco = []; byte = 0;
            };
            for (const r of documenti) {
                const voce = await documentoDa(r);
                if (blocco.length >= MAX_OPERAZIONI || byte + voce.byte > MAX_BYTE_BLOCCO) await chiudi();
                blocco.push(voce);
                byte += voce.byte;
            }
            await chiudi();
            erroreInvio = null;
            ultimaSincronizzazione = Date.now();
        } catch (e) {
            console.error('Invio al cloud non riuscito', e);
            erroreInvio = e.code || e.message || String(e);
            if (!avanzamento) lavora('');
            setTimeout(() => { erroreInvio = null; programmaInvio(); }, RIPROVA);
        }
    }

    // Toglie le righe inviate, se nel frattempo non sono cambiate di nuovo
    async function togliDallaCoda(righe) {
        const via = righe.filter(r => { const ora = coda.get(r.id); return ora && ora.quando === r.quando; }).map(r => r.id);
        via.forEach(id => coda.delete(id));
        await Archivio.eliminaRighe('coda', via);
        if (avanzamento) lavora(`${avanzamento.titolo}: ${Math.max(0, avanzamento.totale - coda.size)} di ${avanzamento.totale}`);
        else avvisa();
    }

    function segnaGrande(chiaveGrande, grande) {
        const grandi = new Set(statoLocale.grandi || []);
        if (grandi.has(chiaveGrande) === grande) return;
        if (grande) grandi.add(chiaveGrande); else grandi.delete(chiaveGrande);
        statoLocale.grandi = [...grandi];
        salvaStato();
    }

    async function documentoDa(r) {
        const rif = rifDoc(r.nome, r.docId);
        const base = { agg: fb.F.serverTimestamp(), sessione };
        const o = Archivio.prendi(r.nome, r.docId);
        const chiaveGrande = chiave(r.nome, r.docId);
        const eraGrande = (statoLocale.grandi || []).includes(chiaveGrande);
        const togliGrande = async () => {
            if (!eraGrande) return;
            await fb.S.deleteObject(rifGrande(r.nome, r.docId)).catch(e => { if (!nonTrovato(e)) throw e; });
            segnaGrande(chiaveGrande, false);
        };
        if (!o) {
            await togliGrande();
            return { riga: r, rif, dati: { ...base, eliminato: true }, byte: 100 };
        }
        const json = JSON.stringify(o);
        const byte = new TextEncoder().encode(json).length;
        if (byte <= MAX_DOC) {
            await togliGrande();
            return { riga: r, rif, dati: { ...base, json }, byte: byte + 200 };
        }
        await fb.S.uploadString(rifGrande(r.nome, r.docId), json, 'raw', { contentType: 'application/json' });
        segnaGrande(chiaveGrande, true);
        return { riga: r, rif, dati: { ...base, grande: true, byte }, byte: 200 };
    }

    async function inviaFile(r) {
        const blob = await Archivio.fileLocale(r.docId);
        const rif = rifDoc('file', r.docId);
        if (blob) {
            await fb.S.uploadBytes(rifFile(r.docId), blob, { contentType: blob.type || 'application/octet-stream' });
            await fb.F.setDoc(rif, { agg: fb.F.serverTimestamp(), sessione, dimensione: blob.size, tipo: blob.type || '' });
        } else {
            await fb.S.deleteObject(rifFile(r.docId)).catch(e => { if (!nonTrovato(e)) throw e; });
            await fb.F.setDoc(rif, { agg: fb.F.serverTimestamp(), sessione, eliminato: true });
        }
    }

    // Invia tutto quello che c'è in coda mostrando l'avanzamento (primo caricamento). false se non è riuscito
    async function inviaTutto(titolo) {
        avanzamento = { titolo, totale: coda.size };
        lavora(`${titolo}…`);
        try {
            while (coda.size) {
                const prima = coda.size;
                await invia();
                if (erroreInvio) {
                    Ui.toast(`Caricamento nel cloud interrotto (${erroreInvio}). Riprovo da solo; intanto lavori normalmente su questo dispositivo.`, 'errore', 9000);
                    return false;
                }
                if (coda.size >= prima) await dormi(500);
            }
            return true;
        } finally {
            avanzamento = null;
            lavora('');
        }
    }

    // Pulsante "Sincronizza ora": riparte l'ascolto e invia subito
    function sincronizzaOra() {
        if (!pronto) return;
        erroreInvio = null;
        riascolta();
        programmaInvio(true);
    }

    return {
        avvia, accedi, esci, sincronizzaOra, stato, descrizione, livello,
        get attivo() { return attivo; },
        get configurato() { return configurato; },
        get pronto() { return pronto; },
    };
})();
