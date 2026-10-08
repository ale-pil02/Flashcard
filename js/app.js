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
        Cartelle.inizializza();
        Dati.correggiTagConcetti().catch(e => console.error(e));
    },

    mostra(rotta, mantieniScorrimento = false) {
        Ui.chiudiMenu();
        const vista = Viste[rotta.vista];
        if (this.vistaAttiva && this.vistaAttiva.esci) this.vistaAttiva.esci();
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
