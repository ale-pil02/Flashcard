// Avvio dell'app: apre l'archivio, registra le rotte e disegna la vista richiesta.

const App = {
    vistaAttiva: null,
    rottaAttiva: null,
    contesto: null,   // { setId, materiaId } della vista corrente, usato dal pulsante "Crea"
    pronta: false,    // diventa vera quando l'archivio è aperto e le rotte sono registrate

    async avvia() {
        const persistente = await Archivio.apri();
        Dati.migra();
        Materiali.allineaMappe();
        Panoramica.inizializza();
        this.applicaTema(Dati.impostazioni().tema);
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applicaTema(Dati.impostazioni().tema));

        Router.aggiungi('/home', 'home');
        Router.aggiungi('/libreria', 'libreria');
        Router.aggiungi('/revisioni', 'revisioni');
        Router.aggiungi('/mappe', 'mappe');
        Router.aggiungi('/mappa/:id', 'mappa');
        Router.aggiungi('/materia/:id', 'materia');
        Router.aggiungi('/set/:id', 'set');
        Router.aggiungi('/carta/nuova', 'editor');
        Router.aggiungi('/carta/:id', 'editor');
        Router.aggiungi('/studio', 'studio');
        Router.aggiungi('/statistiche', 'statistiche');
        Router.aggiungi('/piano', 'piano');
        Router.aggiungi('/impostazioni', 'impostazioni');

        $$('[data-crea]').forEach(b => b.addEventListener('click', () => Ui.crea()));
        $$('[data-apri-ia]').forEach(b => b.addEventListener('click', () => Assistente.alterna()));

        if (!persistente) Ui.toast('Questo browser non permette di salvare i dati: alla chiusura andranno persi', 'errore', 8000);
        this.pronta = true;
        Router.gestisci();
        Dati.correggiTagConcetti().catch(e => console.error(e));

        // Cloud (js/cloud.js): accesso e sincronizzazione; le modifiche degli altri dispositivi ridisegnano la pagina
        document.addEventListener('dati-remoti', e => {
            if (e.detail.nome === 'impostazioni') this.applicaTema(Dati.impostazioni().tema);
            this.aggiornaDaRemoto();
        });
        document.addEventListener('cloud-stato', () => {
            const errore = Cloud.livello() === 'errore' && navigator.onLine;
            $$('.nav-cloud').forEach(p => { p.hidden = !errore; });
        });
        Cloud.avvia().catch(e => console.error('Cloud non avviato', e));
    },

    mostra(rotta, mantieniScorrimento = false) {
        Ui.chiudiMenu();
        const vista = Viste[rotta.vista];
        if (this.vistaAttiva && this.vistaAttiva.esci) this.vistaAttiva.esci();
        // Uno studio lasciato per aprire una mappa riprende tornando indietro dalla mappa; altrove si conclude
        if (rotta.vista !== 'studio' && rotta.vista !== 'mappa') Viste.studio.concludiSospesa();
        VistaMappa.chiudiTutte();
        this.vistaAttiva = vista;
        this.rottaAttiva = rotta;
        this.contesto = null;

        document.body.classList.toggle('schermo-intero', !!vista.schermoIntero);
        document.body.dataset.vista = rotta.vista;
        $$('[data-nav]').forEach(a => a.classList.toggle('attivo', a.dataset.nav === (vista.nav || rotta.vista)));
        document.title = vista.titolo + ' · Flashcard';

        // Ogni vista disegna in un contenitore nuovo: gli ascoltatori della precedente spariscono con lei
        const radice = document.createElement('div');
        radice.className = 'vista vista-' + rotta.vista;
        const scorrimento = window.scrollY;
        $('#vista').replaceChildren(radice);
        try {
            vista.mostra(radice, rotta.params, rotta.query);
        } catch (e) {
            console.error(e);
            radice.innerHTML = `<div class="pagina">${Ui.vuoto({ icona: 'avviso', titolo: 'Qualcosa è andato storto', testo: esc(e.message),
                azioni: '<a class="btn btn-secondario" href="#/home">Torna alla home</a>' })}</div>`;
        }
        window.scrollTo(0, mantieniScorrimento ? scorrimento : 0);
        this.aggiornaPiede();
        Assistente.contestoCambiato();
    },

    ridisegna() {
        if (this.rottaAttiva) this.mostra(this.rottaAttiva, true);
    },

    // Dopo che l'assistente ha cambiato i dati la pagina si aggiorna, tranne gli editor e lo studio
    // (ridisegnarli farebbe perdere il lavoro in corso); l'editor delle mappe ridisegna solo la mappa
    aggiornaDopoAssistente() {
        const vista = this.rottaAttiva && this.rottaAttiva.vista;
        if (vista === 'mappa' && Viste.mappa.editor) { Mappe.primaDiCambiare(Viste.mappa.editor.id); Mappe.cambiataDaFuori(Viste.mappa.editor.id); }
        if (vista === 'editor' || vista === 'studio' || vista === 'mappa') return;
        this.ridisegna();
    },

    // Dati arrivati da un altro dispositivo: la pagina si ridisegna appena non disturba. Studio ed editor no (si
    // perderebbe il lavoro in corso): si aggiornano quando li lasci. Con una finestra o un menu aperti, o mentre scrivi
    // in un campo, si aspetta che tu abbia finito
    aggiornaDaRemoto() {
        clearTimeout(this.timerRemoto);
        this.timerRemoto = setTimeout(() => {
            this.aggiornaPiede();
            const vista = this.rottaAttiva && this.rottaAttiva.vista;
            if (vista === 'editor' || vista === 'studio' || vista === 'mappa') return;
            const attivo = document.activeElement;
            const occupato = $('#livello-modali .modale-sfondo') || $('body > .menu')
                || (attivo && attivo !== document.body && (attivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(attivo.tagName)));
            if (occupato) { this.timerRemoto = setTimeout(() => this.aggiornaDaRemoto(), 1500); return; }
            this.ridisegna();
        }, 500);
    },

    // Numero delle revisioni da fare accanto alla voce del menu
    aggiornaPiede() {
        const daRivedere = Revisioni.quanteDaRipassare();
        $$('[data-nav="revisioni"] .nav-conto').forEach(b => { b.textContent = daRivedere; b.hidden = !daRivedere; });
    },

    applicaTema(scelta) {
        try { localStorage.setItem('flashcard-tema', scelta); } catch (e) { /* solo per evitare il lampo all'avvio */ }
        const scuro = scelta === 'scuro' || (scelta === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.tema = scuro ? 'scuro' : 'chiaro';
        $('meta[name=theme-color]').setAttribute('content', scuro ? '#16172b' : '#5b4ff5');
    },
};

App.avvia();
