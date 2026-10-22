// Parità tra l'utente e l'assistente IA (regola dell'utente, vedi CLAUDE.md): tutto quello che l'utente può vedere o
// modificare nell'app, l'assistente deve poterlo leggere e modificare con i suoi strumenti (js/ia/strumenti.js e
// js/ia/strumenti-mappe.js).
//
// Il test fallisce quando nel codice compare qualcosa di nuovo che qui non è registrato:
//   1. OPERAZIONI   ogni funzione dei moduli dei dati che cambia i dati salvati (la trova da sé leggendo il codice) ha
//                   gli strumenti dell'assistente che fanno la stessa cosa, oppure un'esclusione con il motivo;
//   2. SCRITTURE    il codice dell'interfaccia (viste, editor…) non scrive nell'archivio da solo, salvo i casi qui
//                   sotto, ognuno con il motivo;
//   3. CAMPI        ogni campo dei dati (quelli dei dati di prova, degli oggetti appena creati e quelli che il codice
//                   scrive) ha come lo legge l'assistente e quale parametro di quale strumento lo scrive (oppure perché
//                   lo mette l'app da sola, o perché è escluso). Le letture si provano davvero sui dati di prova;
//   4. CAMPI NUOVI  a ogni lettura dell'assistente arriva anche un campo mai visto (altri_dati): un campo aggiunto domani
//                   ai dati l'assistente lo legge subito.
// Esclusioni ammesse: accesso e cloud, la chiave e il modello dell'assistente, i file del computer, la navigazione e
// lo stato dell'interfaccia (zoom, pannelli aperti…), il tour, i dati interni dell'app.
//
// Si lancia con "npm test" (anche prima di "firebase deploy").

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { caricaApp, strumento, scriptDellApp } = require('./aiuti/app');
const Codice = require('./aiuti/codice');

// ---- 1. Operazioni ------------------------------------------------------------------------------------------------------

// I moduli dei dati: le loro funzioni che cambiano i dati sono le operazioni dell'app
const MODULI_DATI = ['Dati', 'Mappe', 'Materiali', 'Revisioni', 'Importa', 'DatiProva', 'Storia', 'Localizzazione', 'Panoramica', 'Cloud'];

const FILE_DEL_COMPUTER = "usa un file scelto dal computer: l'assistente non vede i file del computer (lo fa l'utente)";

// Operazione → strumenti dell'assistente che fanno la stessa cosa, oppure
//   { escluso: motivo }       l'assistente non lo fa, per il motivo scritto;
//   { interfaccia: motivo }   è un pezzo di interfaccia (finestra, pannello, avvio dello studio): i suoi comandi passano
//                             dalle altre operazioni di questo elenco
const OPERAZIONI = {
    'Dati.salvaImpostazioni': ['modifica_impostazioni'],
    'Dati.creaMateria': ['crea_materia'],
    'Dati.aggiornaMateria': ['modifica_materia'],
    'Dati.eliminaMateria': ['elimina_materia'],
    'Dati.creaSet': ['crea_set'],
    'Dati.aggiornaSet': ['modifica_set'],
    'Dati.eliminaSet': ['elimina_set'],
    'Dati.creaCarta': ['crea_carte', 'importa_testo'],
    'Dati.creaCarte': ['crea_carte'],
    'Dati.aggiornaCarta': ['modifica_carte', 'collega_carte_fonte', 'collega_carte_mappa'],
    'Dati.impostaMadre': ['modifica_carte'],
    'Dati.aumentaRientro': ['riordina_carta'],
    'Dati.riduciRientro': ['riordina_carta'],
    'Dati.spostaTraSorelle': ['riordina_carta'],
    'Dati.eliminaCarta': ['elimina_carte'],
    'Dati.spostaCarta': ['sposta_carte'],
    'Dati.reimpostaProgressi': ['reimposta_progressi'],
    'Dati.impostaValutazione': ['modifica_carte'],
    'Dati.aggiornaSrs': ['modifica_carte'],
    'Dati.allineaAlSet': ['modifica_carte'],
    'Dati.ricalcolaIntervalli': ['modifica_impostazioni'],
    'Dati.creaMateriale': ['crea_nota'],
    'Dati.aggiornaMateriale': ['modifica_materiale'],
    'Dati.eliminaMateriale': ['elimina_materiale'],
    'Dati.creaArgomento': ['crea_argomento_revisione'],
    'Dati.aggiornaArgomento': ['modifica_argomento_revisione'],
    'Dati.eliminaArgomento': ['elimina_argomento_revisione'],
    'Dati.segnaRipasso': ['segna_ripasso_argomento', 'registra_ripasso'],
    'Dati.annullaUltimoRipasso': ['segna_ripasso_argomento'],
    'Dati.registraRisposta': ['registra_ripasso'],
    'Dati.creaEsame': ['crea_esame'],
    'Dati.aggiornaEsame': ['modifica_esame'],
    'Dati.eliminaEsame': ['elimina_esame'],
    'Dati.eliminaTutto': ['dati_app'],
    'Dati.salvaChat': { escluso: "salva la conversazione con l'assistente stesso: non è un dato dello studio" },
    'Dati.eliminaChat': { escluso: "«Nuova conversazione» della chat: riguarda la conversazione con l'assistente, non lo studio" },
    'Dati.migra': { escluso: "all'avvio porta al formato attuale i dati fatti con versioni vecchie dell'app: non è un comando" },
    'Dati.correggiTagConcetti': { escluso: "correzione automatica dei tag fatta una volta sola all'avvio: non è un comando" },

    'Mappe.crea': ['crea_mappa'],
    'Mappe.aggiungi': ['crea_mappa', 'duplica_mappa', 'importa_mappa_da_materiale'],
    'Mappe.duplica': ['duplica_mappa'],
    'Mappe.salva': ['modifica_mappa', 'aggiungi_nodi', 'modifica_nodi', 'sposta_nodi', 'elimina_nodi', 'figlio_comune', 'collegamenti_mappa', 'immagini_nodi', 'allinea_nodi', 'distanza_tra_nodi'],
    'Mappe.elimina': ['elimina_mappa'],
    'Mappe.togliDalSet': ['elimina_materiale', 'modifica_mappa'],
    'Mappe.scollegaSet': ['elimina_set'],
    'Mappe.scollegaMateria': ['elimina_materia'],
    'Mappe.salvaStilePredefinito': ['stili_predefiniti'],
    'Mappe.eliminaStilePredefinito': ['stili_predefiniti'],
    'Mappe.salvaTema': ['tema_mappe'],
    'Mappe.eliminaTema': ['tema_mappe'],
    'Mappe.riordina': ['ordina_mappe'],
    'Mappe.impostaOrdineMappe': ['ordina_mappe'],

    'Materiali.creaNota': ['crea_nota'],
    'Materiali.aggiornaTestoNota': ['modifica_materiale'],
    'Materiali.aggiungiFile': { escluso: FILE_DEL_COMPUTER },
    'Materiali.caricaMolti': { escluso: FILE_DEL_COMPUTER },
    'Materiali.aggiornaDaFile': { escluso: `«Carica una nuova versione» ${FILE_DEL_COMPUTER}` },
    'Materiali.allineaMappe': { escluso: 'tiene allineati da sola i materiali che rappresentano le mappe dei set: non è un comando' },
    'Materiali.partiPerIA': { escluso: "prepara i file dei materiali per la chat (ricorda il file già mandato a Gemini): è il funzionamento dell'assistente" },
    'Materiali.monta': { interfaccia: 'pannello dei materiali del set: i suoi comandi usano crea_nota, modifica_materiale, elimina_materiale…' },
    'Materiali.apri': { interfaccia: "apre il materiale (e toglie l'avviso «aggiornato»: modifica_materiale.segna_visto); il contenuto lo legge leggi_materiale" },
    'Materiali.apriPredefinito': { interfaccia: 'apre il materiale con il suo visualizzatore, come Materiali.apri' },
    'Materiali.vaiAllaFonte': { interfaccia: 'dallo studio apre il materiale al punto della fonte, come Materiali.apri' },
    'Materiali.aggiornaFlashcard': { interfaccia: "chiede all'assistente di portare le novità del materiale nelle flashcard (leggi_materiale gliele dà)" },
    'Materiali.localizzazione': { interfaccia: "chiede all'assistente la creazione flashcard per profondità (prepara_piano_localizzazione…)" },

    'Revisioni.registraSessione': ['registra_ripasso'],
    'Revisioni.segnaComunque': ['registra_ripasso'],
    'Revisioni.unoPerOgniSet': ['crea_argomento_revisione'],
    'Revisioni.monta': { interfaccia: 'tabella delle revisioni: le sue celle e i suoi menu usano le operazioni dei mazzi qui sopra' },
    'Revisioni.montaCarte': { interfaccia: 'pannello «Per flashcard»: usa impostaValutazione, aggiornaSrs, allineaAlSet (modifica_carte)' },
    'Revisioni.formNuovo': { interfaccia: 'modulo «Nuovo mazzo»: crea_argomento_revisione' },
    'Revisioni.modaleCarte': { interfaccia: 'finestra «Flashcard del mazzo»: modifica_argomento_revisione.carte_ids' },
    'Revisioni.avviaRipasso': { interfaccia: 'avvia lo studio di un mazzo; i ripassi si registrano con registra_ripasso' },
    'Revisioni.avviaRipassoCarte': { interfaccia: 'avvia lo studio delle carte sfasate; i ripassi si registrano con registra_ripasso' },
    'Revisioni.ripassaPiuSet': { interfaccia: 'avvia lo studio di più set insieme; i ripassi si registrano con registra_ripasso' },

    'Importa.applica': ['importa_testo'],
    'Importa.apriDialogo': { interfaccia: `finestra «Importa»: con il testo incollato è importa_testo; con un file ${FILE_DEL_COMPUTER}` },
    'Importa.esportaBackup': ['dati_app'],
    'Importa.ripristinaBackup': { escluso: `ripristino del backup: ${FILE_DEL_COMPUTER}` },

    'DatiProva.carica': ['dati_app'],
    'DatiProva.rimuovi': ['dati_app'],

    'Storia.annulla': ['modifiche_recenti'],
    'Storia.ripristina': ['modifiche_recenti'],
    'Storia.annullaConAvviso': ['modifiche_recenti'],
    'Storia.ripristinaConAvviso': ['modifiche_recenti'],
    'Storia.annullaNelTurno': ['modifiche_recenti'],
    'Storia.ripristinaNelTurno': ['modifiche_recenti'],
    'Storia.elenco': { interfaccia: 'finestra «Modifiche recenti»: modifiche_recenti' },
    'Storia.esegui': { interfaccia: 'raccoglie in una voce annullabile le modifiche fatte dentro: sono le operazioni di questo elenco' },

    'Localizzazione.creaCarte': ['crea_carte_localizzazione'],

    'Panoramica.crea': ['crea_mappa'],
    'Panoramica.allinea': { escluso: "tiene allineata da sola la mappa «link argomenti» alle mappe della materia: non è un comando" },
    'Panoramica.inizializza': { escluso: "all'avvio crea le mappe «link argomenti» che mancano: non è un comando" },

    'Cloud.avvia': { escluso: 'accesso con Google e sincronizzazione con il cloud' },
    'Cloud.sincronizzaOra': { escluso: 'sincronizzazione con il cloud' },
};

// ---- 2. Scritture dirette nell'archivio fuori dai moduli dei dati -----------------------------------------------------

// File → collezioni che scrive direttamente, con il motivo per cui va bene
const SCRITTURE_DIRETTE = {
    'js/archivio.js': { tutte: "è l'archivio stesso" },
    'js/viste/studio.js': {
        carte: "correzione di una valutazione durante lo studio (frecce ‹ ›): l'assistente registra i ripassi con registra_ripasso e corregge una valutazione con modifica_carte",
        ripassi: 'come sopra: la valutazione corretta nel registro dei ripassi della sessione',
    },
    'js/mappe/editor.js': {
        mappe: "salvataggi dell'editor: le modifiche alle mappe passano per i campi di CAMPI (mappe, nodi…); in più zoom e posizione della vista, che sono interfaccia",
    },
};

// ---- 3. Campi dei dati ----------------------------------------------------------------------------------------------------
//
// Ogni campo: { legge, scrive } oppure { legge, auto } oppure { escluso }.
//   legge   'strumento' (il campo arriva con il suo nome, anche in altri_dati) o 'strumento>chiave' (con un altro nome;
//           più nomi possibili separati da |). Lo strumento è quello che legge quella parte dei dati (LETTORI qui sotto)
//           o uno di LETTURE_INTERE
//   scrive  'strumento.parametro' che lo cambia
//   auto    perché non lo cambia nessuno a mano (lo mette l'app: date di creazione, conteggi…)
//   escluso perché l'assistente non lo legge e non lo scrive

const ID = { auto: "l'identificativo lo mette l'app" };
const PROVA = { escluso: "segna gli oggetti dei dati di prova (Impostazioni → Dati di prova): non è un dato per l'utente" };
const CREAZIONE = { auto: "data di creazione: la mette l'app" };
const MODIFICA = { auto: "data dell'ultima modifica: la aggiorna l'app" };
const CHAT = { escluso: "la chat con l'assistente: lui ha già la conversazione in corso, e le conversazioni non sono dati dello studio" };

const CAMPI = {
    materie: {
        id: { legge: 'panoramica', ...ID }, prova: PROVA,
        nome: { legge: 'panoramica', scrive: 'modifica_materia.nome' },
        emoji: { legge: 'panoramica', scrive: 'modifica_materia.emoji' },
        colore: { legge: 'panoramica', scrive: 'modifica_materia.colore' },
        ordine: { legge: 'panoramica', auto: "posizione nella libreria, data dall'ordine di creazione: non si cambia a mano" },
        creata: { legge: 'panoramica', ...CREAZIONE },
    },
    set: {
        id: { legge: 'leggi_set', ...ID }, prova: PROVA,
        nome: { legge: 'leggi_set', scrive: 'modifica_set.nome' },
        descrizione: { legge: 'leggi_set', scrive: 'modifica_set.descrizione' },
        materiaId: { legge: 'leggi_set>materia_id', scrive: 'modifica_set.materia_id' },
        genitoreId: { legge: 'leggi_set>contenitore_id', scrive: 'modifica_set.contenitore_id' },
        creato: { legge: 'leggi_set', ...CREAZIONE },
        modificato: { legge: 'leggi_set', ...MODIFICA },
        ultimoStudio: { legge: 'leggi_set', auto: 'lo aggiorna lo studio (registra_ripasso)' },
    },
    carte: {
        id: { legge: 'leggi_set', ...ID }, prova: PROVA,
        setId: { legge: 'leggi_set>id', scrive: 'sposta_carte.set_id' },
        genitoreId: { legge: 'leggi_set>madre_id', scrive: 'modifica_carte.madre_id' },
        ordine: { legge: 'leggi_set', scrive: 'riordina_carta.azione' },
        domanda: { legge: 'leggi_set', scrive: 'modifica_carte.domanda' },
        risposte: { legge: 'leggi_set>risposta|risposte', scrive: 'modifica_carte.risposte' },
        tag: { legge: 'leggi_set', scrive: 'modifica_carte.tag' },
        suggerimento: { legge: 'leggi_set', scrive: 'modifica_carte.suggerimento' },
        spiegazione: { legge: 'leggi_set', scrive: 'modifica_carte.spiegazione' },
        fonte: { legge: 'leggi_set', scrive: 'collega_carte_fonte.materiale_id' },
        mappa: { legge: 'leggi_set>parte_della_mappa', scrive: 'collega_carte_mappa.nodo_id' },
        srs: { legge: 'leggi_set>stato', scrive: 'modifica_carte.valutazione' },
        creata: { legge: 'leggi_set', ...CREAZIONE },
        modificata: { legge: 'leggi_set', ...MODIFICA },
    },
    'carte.risposte': {
        testo: { legge: 'leggi_set>risposta|testo', scrive: 'modifica_carte.risposte' },
        corretta: { legge: 'leggi_set>risposta|corretta', scrive: 'modifica_carte.corretta' },
    },
    'carte.fonte': {
        materiale: { legge: 'leggi_set>materiale_id', scrive: 'collega_carte_fonte.materiale_id' },
        pagina: { legge: 'leggi_set>pagina', scrive: 'collega_carte_fonte.pagina' },
        citazione: { legge: 'leggi_set>citazione', scrive: 'collega_carte_fonte.citazione' },
    },
    'carte.mappa': {
        id: { legge: 'leggi_set>mappa_id', scrive: 'collega_carte_mappa.mappa_id' },
        nodo: { legge: 'leggi_set>nodo_id', scrive: 'collega_carte_mappa.nodo_id' },
    },
    'carte.srs': {
        stato: { legge: 'leggi_set>stato', auto: 'imparata o da imparare: deriva dalle valutazioni' },
        ultimaValutazione: { legge: 'leggi_set>valutazione', scrive: 'modifica_carte.valutazione' },
        rep: { legge: 'leggi_set>n_rep', scrive: 'modifica_carte.n_rep' },
        giorno: { legge: 'leggi_set>ultimo_ripasso', scrive: 'modifica_carte.ultimo_ripasso' },
        intervallo: { legge: 'leggi_set>intervallo_giorni', scrive: 'modifica_carte.intervallo_giorni' },
        daRifareDal: { legge: 'leggi_set', scrive: 'modifica_carte.prossima_revisione' },
        allineata: { legge: 'leggi_set', scrive: 'modifica_carte.riadegua_al_set' },
        segue: { legge: 'leggi_set', scrive: 'modifica_carte.riadegua_al_mazzo_id' },
        ripetizioni: { legge: 'leggi_set', auto: 'risposte date: le conta lo studio (registra_ripasso)' },
        errori: { legge: 'leggi_set', auto: 'risposte Scarso: le conta lo studio (registra_ripasso)' },
        ultimoRipasso: { legge: 'leggi_set', auto: "ora dell'ultima risposta: la mette lo studio (registra_ripasso)" },
    },
    ripassi: {
        id: { escluso: 'identificativo interno del registro dei ripassi' }, prova: PROVA,
        cartaId: { legge: 'statistiche>carta', scrive: 'registra_ripasso.carta_id' },
        setId: { legge: 'statistiche>carta', auto: 'il set della carta' },
        ts: { legge: 'statistiche>quando', auto: "l'ora della risposta" },
        giorno: { legge: 'statistiche>quando', auto: "il giorno della risposta" },
        valutazione: { legge: 'statistiche>valutazione', scrive: 'registra_ripasso.valutazione' },
        modo: { escluso: "sempre «impara»: c'è una sola modalità di studio" },
        durata: { legge: 'statistiche>secondi', scrive: 'registra_ripasso.secondi' },
        ripassoDiProva: { legge: 'statistiche>di_prova', scrive: 'registra_ripasso.di_prova' },
    },
    esami: {
        id: { legge: 'panoramica', ...ID }, prova: PROVA,
        nome: { legge: 'panoramica', scrive: 'modifica_esame.nome' },
        data: { legge: 'panoramica', scrive: 'modifica_esame.data' },
        materiaId: { legge: 'panoramica>materia_id', scrive: 'modifica_esame.materia_id' },
        note: { legge: 'panoramica', scrive: 'modifica_esame.note' },
    },
    impostazioni: {
        id: { escluso: "sempre «generali»: c'è un solo oggetto delle impostazioni" },
        nome: { legge: 'panoramica>nome_utente', scrive: 'modifica_impostazioni.nome' },
        nuovePerSessione: { legge: 'panoramica>nuove_per_sessione', scrive: 'modifica_impostazioni.nuove_per_sessione' },
        maxPerSessione: { legge: 'panoramica>max_per_sessione', scrive: 'modifica_impostazioni.max_per_sessione' },
        ordineCasuale: { legge: 'panoramica>ordine_casuale', scrive: 'modifica_impostazioni.ordine_casuale' },
        mescolaSorelle: { legge: 'panoramica>sorelle_mescolate', scrive: 'modifica_impostazioni.sorelle_mescolate' },
        cascata: { legge: 'panoramica>studio_a_cascata', scrive: 'modifica_impostazioni.studio_a_cascata' },
        nascondiDettagli: { legge: 'panoramica>dettagli_nascosti', scrive: 'modifica_impostazioni.nascondi_dettagli' },
        sequenzaRevisioni: { legge: 'panoramica>sequenza_revisioni', scrive: 'modifica_impostazioni.sequenza_revisioni' },
        tema: { legge: 'panoramica', scrive: 'modifica_impostazioni.tema' },
        ultimoBackup: { legge: 'panoramica>ultimo_backup', scrive: 'dati_app.azione' },
        temiMappe: { legge: 'tema_mappe>temi', scrive: 'tema_mappe.azione' },
        stiliMappe: { legge: 'stili_predefiniti>stili', scrive: 'stili_predefiniti.azione' },
        ordineMappe: { legge: 'elenca_mappe>ordine_mappe', scrive: 'ordina_mappe.ordine' },
        ordineMappeMano: { legge: 'elenca_mappe>mappe', scrive: 'ordina_mappe.mappe_ids' },
        migrazioni: { escluso: "segna gli aggiornamenti dei dati già fatti all'avvio: l'utente non lo vede" },
        panoramicheCreate: { escluso: "ricorda per quali materie l'app ha già creato da sola la mappa «link argomenti»; le mappe si vedono con elenca_mappe" },
    },
    'impostazioni.temiMappe': {
        id: { legge: 'tema_mappe', ...ID },
        nome: { legge: 'tema_mappe', scrive: 'tema_mappe.nome' },
        sfondo: { legge: 'tema_mappe', scrive: 'tema_mappe.sfondo' },
        testo: { legge: 'tema_mappe', scrive: 'tema_mappe.testo' },
        radice: { legge: 'tema_mappe', scrive: 'tema_mappe.radice' },
        paletta: { legge: 'tema_mappe>colori_rami', scrive: 'tema_mappe.colori_rami' },
        livelli: { legge: 'tema_mappe', scrive: 'tema_mappe.livelli' },
        linee: { legge: 'tema_mappe', scrive: 'tema_mappe.linee' },
        scuro: { legge: 'tema_mappe', auto: 'sfondo scuro o chiaro: lo deduce l\'app dallo sfondo' },
        personale: { legge: 'tema_mappe', auto: "i temi creati dall'utente" },
    },
    'impostazioni.stiliMappe': {
        id: { legge: 'stili_predefiniti', ...ID },
        nome: { legge: 'stili_predefiniti', scrive: 'stili_predefiniti.nome' },
        stile: { legge: 'stili_predefiniti', scrive: 'stili_predefiniti.stile' },
    },
    materiali: {
        id: { legge: 'elenca_materiali', ...ID }, prova: PROVA,
        setId: { legge: 'elenca_materiali>id', scrive: 'modifica_materiale.set_id' },
        nome: { legge: 'elenca_materiali', scrive: 'modifica_materiale.nome' },
        tipo: { legge: 'elenca_materiali', auto: 'il tipo del file (PDF, slide, nota…)' },
        estensione: { legge: 'elenca_materiali', auto: "l'estensione del file caricato" },
        mime: { legge: 'elenca_materiali', auto: 'il formato del file caricato' },
        dimensione: { legge: 'elenca_materiali', auto: 'la grandezza del file' },
        pagine: { legge: 'elenca_materiali', auto: 'le pagine del file' },
        creato: { legge: 'elenca_materiali', ...CREAZIONE },
        testo: { legge: 'leggi_materiale>testo', scrive: 'modifica_materiale.testo' },
        albero: { legge: 'leggi_materiale>schema', auto: 'lo schema che l\'app ricava dal file o dal testo della nota' },
        usaInChat: { legge: 'elenca_materiali>usa_in_chat', scrive: 'modifica_materiale.usa_in_chat' },
        novita: { legge: 'elenca_materiali>novita_da_vedere', scrive: 'modifica_materiale.segna_visto' },
        aggiornato: { legge: 'elenca_materiali', auto: "quando è arrivata l'ultima versione del file" },
        precedente: { legge: 'leggi_materiale>novita_rispetto_alla_versione_precedente', auto: `la versione di prima, dopo «Carica una nuova versione», che ${FILE_DEL_COMPUTER}` },
        mappaId: { legge: 'elenca_materiali>mappa_id', auto: 'il materiale che rappresenta una mappa la segue (modifica_mappa)' },
        anteprima: { escluso: 'miniatura in immagine (dati binari): il contenuto si legge con leggi_materiale' },
        remoto: { escluso: 'riferimento interno al file mandato a Gemini per la chat' },
    },
    'materiali.precedente': {
        testo: { legge: 'leggi_materiale>novita_rispetto_alla_versione_precedente', auto: 'versione di prima del file' },
        albero: { legge: 'leggi_materiale>novita_rispetto_alla_versione_precedente', auto: 'versione di prima del file' },
        modificato: { legge: 'leggi_materiale>novita_rispetto_alla_versione_precedente', auto: 'versione di prima del file' },
    },
    argomenti: {
        id: { legge: 'elenca_revisioni', ...ID }, prova: PROVA,
        setId: { legge: 'elenca_revisioni>set_id', scrive: 'modifica_argomento_revisione.set_id' },
        nome: { legge: 'elenca_revisioni', scrive: 'modifica_argomento_revisione.nome' },
        fonte: { legge: 'elenca_revisioni', scrive: 'modifica_argomento_revisione.fonte' },
        materialeIds: { legge: 'elenca_revisioni>materiali', scrive: 'modifica_argomento_revisione.materiali_ids' },
        fontiTolte: { legge: 'elenca_revisioni', scrive: 'modifica_argomento_revisione.materiali_ids' },
        ripetizioni: { legge: 'elenca_revisioni', scrive: 'modifica_argomento_revisione.ripetizioni' },
        ultimoRipasso: { legge: 'elenca_revisioni>ultimo_ripasso', scrive: 'modifica_argomento_revisione.ultimo_ripasso' },
        intervallo: { legge: 'elenca_revisioni>intervallo_giorni', scrive: 'modifica_argomento_revisione.intervallo_giorni' },
        prossima: { legge: 'elenca_revisioni>prossima_revisione', scrive: 'modifica_argomento_revisione.prossima_revisione' },
        stato: { legge: 'elenca_revisioni', scrive: 'modifica_argomento_revisione.stato' },
        delSet: { legge: 'elenca_revisioni>riga_del_set', scrive: 'modifica_argomento_revisione.tutte_le_flashcard' },
        carte: { legge: 'elenca_revisioni>flashcard', scrive: 'modifica_argomento_revisione.carte_ids' },
        storico: { legge: 'elenca_revisioni', scrive: 'segna_ripasso_argomento.annulla_ultimo' },
        ordine: { legge: 'elenca_revisioni', auto: "posizione nella tabella, data dall'ordine di creazione: non si cambia a mano" },
        creato: { legge: 'elenca_revisioni', ...CREAZIONE },
    },
    'argomenti.storico': {
        giorno: { legge: 'elenca_revisioni', scrive: 'segna_ripasso_argomento.giorno' },
        stato: { legge: 'elenca_revisioni', scrive: 'segna_ripasso_argomento.stato' },
        prima: { legge: 'elenca_revisioni>n_rep_prima', auto: "com'era il mazzo prima di quel ripasso: serve ad annullarlo (annulla_ultimo)" },
    },
    'argomenti.storico.prima': {
        ripetizioni: { legge: 'elenca_revisioni>n_rep_prima', auto: 'serve ad annullare il ripasso' },
        ultimoRipasso: { legge: 'elenca_revisioni>ultimo_ripasso_prima', auto: 'serve ad annullare il ripasso' },
        intervallo: { legge: 'elenca_revisioni', auto: 'serve ad annullare il ripasso' },
        stato: { legge: 'elenca_revisioni', auto: 'serve ad annullare il ripasso' },
    },
    chat: { id: CHAT, storico: CHAT, vista: CHAT, aggiornata: CHAT },
    mappe: {
        id: { legge: 'leggi_mappa', ...ID }, prova: PROVA,
        nome: { legge: 'leggi_mappa', scrive: 'modifica_mappa.nome' },
        materiaId: { legge: 'leggi_mappa>materia_id', scrive: 'modifica_mappa.materia_id' },
        setId: { legge: 'leggi_mappa>set_id', scrive: 'modifica_mappa.set_id' },
        creata: { legge: 'leggi_mappa', ...CREAZIONE },
        modificata: { legge: 'leggi_mappa', ...MODIFICA },
        tema: { legge: 'leggi_mappa', scrive: 'modifica_mappa.tema' },
        disposizione: { legge: 'leggi_mappa', scrive: 'modifica_mappa.disposizione' },
        direzione: { legge: 'leggi_mappa>direzione_rami', scrive: 'modifica_mappa.direzione_rami' },
        spaziatura: { legge: 'leggi_mappa', scrive: 'modifica_mappa.spaziatura' },
        spaziaturaFratelli: { legge: 'leggi_mappa>distanza_fratelli', scrive: 'modifica_mappa.distanza_fratelli' },
        griglia: { legge: 'leggi_mappa', scrive: 'modifica_mappa.griglia' },
        paletta: { legge: 'leggi_mappa>colori_rami', scrive: 'modifica_mappa.colori_rami' },
        coloreRadice: { legge: 'leggi_mappa>colore_radice', scrive: 'modifica_mappa.colore_radice' },
        livelli: { legge: 'leggi_mappa>stili_per_livello_propri', scrive: 'modifica_mappa.ripristina_tema' },
        linee: { legge: 'leggi_mappa>linee_proprie_della_mappa', scrive: 'modifica_mappa.linee' },
        radice: { legge: 'leggi_mappa', auto: 'il nodo centrale: c\'è sempre' },
        nodi: { legge: 'leggi_mappa>radice', scrive: 'aggiungi_nodi.nodi' },
        relazioni: { legge: 'leggi_mappa>collegamenti', scrive: 'collegamenti_mappa.aggiungi' },
        panoramica: { legge: 'leggi_mappa>mappa_d_insieme', scrive: 'crea_mappa.link_argomenti' },
        immagini: { escluso: 'il contenuto delle immagini (dati binari): i nodi dicono quali immagini hanno (immagini_nodi le aggiunge)' },
        anteprima: { escluso: "miniatura disegnata dall'app per l'elenco delle mappe" },
        vista: { escluso: "zoom e posizione dello schermo nell'editor: interfaccia" },
    },
    'mappe.griglia': {
        attiva: { legge: 'leggi_mappa', scrive: 'modifica_mappa.attiva' },
        passo: { legge: 'leggi_mappa', scrive: 'modifica_mappa.passo' },
    },
    'mappe.linee': {
        forma: { legge: 'leggi_mappa', scrive: 'modifica_mappa.forma' },
        affusolamento: { legge: 'leggi_mappa', scrive: 'modifica_mappa.affusolamento' },
        inizio: { legge: 'leggi_mappa', scrive: 'modifica_mappa.spessore_radice' },
        minimo: { legge: 'leggi_mappa', scrive: 'modifica_mappa.spessore_minimo' },
        fattore: { legge: 'leggi_mappa', scrive: 'modifica_mappa.riduzione' },
        spessore: { legge: 'leggi_mappa', scrive: 'modifica_mappa.spessore' },
    },
    'mappe.relazioni': {
        id: { legge: 'leggi_mappa', ...ID },
        da: { legge: 'leggi_mappa', scrive: 'collegamenti_mappa.da' },
        a: { legge: 'leggi_mappa', scrive: 'collegamenti_mappa.a' },
        testo: { legge: 'leggi_mappa', scrive: 'collegamenti_mappa.testo' },
        colore: { legge: 'leggi_mappa', scrive: 'collegamenti_mappa.colore' },
        tratto: { legge: 'leggi_mappa', scrive: 'collegamenti_mappa.tratto' },
        frecciaInizio: { legge: 'leggi_mappa>freccia_inizio', scrive: 'collegamenti_mappa.freccia_inizio' },
        frecciaFine: { legge: 'leggi_mappa>freccia_fine', scrive: 'collegamenti_mappa.freccia_fine' },
        curva: { legge: 'leggi_mappa>curva_spostata_a_mano', scrive: 'collegamenti_mappa.raddrizza' },
        percorso: { legge: 'leggi_mappa>curvatura', scrive: 'collegamenti_mappa.curvatura' },
    },
    'mappe.nodi': {
        id: { legge: 'leggi_mappa', ...ID },
        genitore: { legge: 'leggi_mappa>id', scrive: 'sposta_nodi.genitore_id' },   // il nodo sta tra i figli del genitore
        figli: { legge: 'leggi_mappa>figli', scrive: 'sposta_nodi.indice' },
        testo: { legge: 'leggi_mappa', scrive: 'modifica_nodi.testo' },
        nota: { legge: 'leggi_mappa', scrive: 'modifica_nodi.nota' },
        etichette: { legge: 'leggi_mappa', scrive: 'modifica_nodi.etichette' },
        icona: { legge: 'leggi_mappa', scrive: 'modifica_nodi.icona' },
        immagine: { legge: 'leggi_mappa', scrive: 'immagini_nodi.aggiungi' },
        figure: { legge: 'leggi_mappa>immagini_accanto', scrive: 'immagini_nodi.aggiungi' },
        link: { legge: 'leggi_mappa', scrive: 'modifica_nodi.link' },
        data: { legge: 'leggi_mappa', scrive: 'modifica_nodi.data' },
        spunta: { legge: 'leggi_mappa', scrive: 'modifica_nodi.spunta' },
        chiuso: { legge: 'leggi_mappa>ramo_chiuso', scrive: 'modifica_nodi.ramo_chiuso' },
        disposizione: { legge: 'leggi_mappa>disposizione_figli', scrive: 'modifica_nodi.disposizione_figli' },
        larghezza: { legge: 'leggi_mappa', scrive: 'modifica_nodi.larghezza' },
        distanzaPrima: { legge: 'leggi_mappa>distanza_dal_fratello_prima', scrive: 'modifica_nodi.distanza_dal_fratello_prima' },
        distanzaFigli: { legge: 'leggi_mappa', scrive: 'modifica_nodi.distanza_figli' },
        stilePredefinito: { legge: 'leggi_mappa>stile_predefinito', scrive: 'modifica_nodi.stile_predefinito' },
        stile: { legge: 'leggi_mappa', scrive: 'modifica_nodi.stile' },
        raccordo: { legge: 'leggi_mappa', scrive: 'figlio_comune.graffa' },
        legami: { legge: 'leggi_mappa>altri_genitori', scrive: 'figlio_comune.nodi_ids' },
        rif: { legge: 'leggi_mappa>origine', auto: "nella mappa «link argomenti» indica da dove viene il nodo: lo mette l'app" },
        inPanoramica: { legge: 'leggi_mappa>in_link_argomenti', scrive: 'modifica_nodi.in_link_argomenti' },
        lato: { legge: 'leggi_mappa', scrive: 'modifica_nodi.lato' },
        off: { legge: 'leggi_mappa>posizione', scrive: 'modifica_nodi.posizione' },
        x: { legge: 'leggi_mappa>posizione', scrive: 'modifica_nodi.posizione' },
        y: { legge: 'leggi_mappa>posizione', scrive: 'modifica_nodi.posizione' },
        piega: { legge: 'leggi_mappa>linea_piegata', scrive: 'modifica_nodi.raddrizza_linea' },
        percorso: { legge: 'leggi_mappa>curvatura_linea', scrive: 'modifica_nodi.curvatura_linea' },
        paletta: { escluso: "colori temporanei durante l'import di un file SimpleMind: dopo non c'è più" },
    },
    'nodi.etichette': {
        id: { legge: 'leggi_mappa', ...ID },
        testo: { legge: 'leggi_mappa', scrive: 'modifica_nodi.etichette' },
        dx: { legge: 'leggi_mappa', scrive: 'modifica_nodi.dx' },
        dy: { legge: 'leggi_mappa', scrive: 'modifica_nodi.dy' },
        stile: { legge: 'leggi_mappa>colore|pt|grassetto', scrive: 'modifica_nodi.etichette' },
    },
    'etichette.stile': {
        riempimento: { legge: 'leggi_mappa>colore', scrive: 'modifica_nodi.colore' },
        scala: { legge: 'leggi_mappa>pt', scrive: 'modifica_nodi.pt' },
        grassetto: { legge: 'leggi_mappa', scrive: 'modifica_nodi.grassetto' },
        corsivo: { legge: 'leggi_mappa', scrive: 'modifica_nodi.corsivo' },
        sottolineato: { legge: 'leggi_mappa', scrive: 'modifica_nodi.sottolineato' },
        coloreTesto: { legge: 'leggi_mappa>colore_testo', scrive: 'modifica_nodi.colore_testo' },
    },
    'nodi.figure': {
        id: { legge: 'leggi_mappa', ...ID },
        img: { legge: 'leggi_mappa>immagine_id', scrive: 'immagini_nodi.immagine_id' },
        larghezza: { legge: 'leggi_mappa', scrive: 'immagini_nodi.larghezza' },
        rapporto: { legge: 'leggi_mappa', auto: "le proporzioni dell'immagine" },
        dx: { legge: 'leggi_mappa', scrive: 'immagini_nodi.dx' },
        dy: { legge: 'leggi_mappa', scrive: 'immagini_nodi.dy' },
        fluttuante: { legge: 'leggi_mappa>libera', scrive: 'immagini_nodi.libera' },
    },
    'nodi.immagine': {
        id: { legge: 'leggi_mappa>immagine_id', scrive: 'immagini_nodi.immagine_id' },
        larghezza: { legge: 'leggi_mappa', scrive: 'immagini_nodi.larghezza_dentro' },
    },
    'nodi.raccordo': {
        nodi: { legge: 'leggi_mappa', scrive: 'figlio_comune.nodi_ids' },
        graffa: { legge: 'leggi_mappa', scrive: 'modifica_nodi.raccordo_graffa' },
    },
    'nodi.rif': {
        mappa: { legge: 'leggi_mappa>mappa_id', auto: "lo mette l'app nella mappa «link argomenti»" },
        nodo: { legge: 'leggi_mappa>nodo_id', auto: "lo mette l'app nella mappa «link argomenti»" },
        materia: { legge: 'leggi_mappa>materia_id', auto: "lo mette l'app nella mappa «link argomenti»" },
    },
    // Le chiavi dello stile dei nodi sono quelle di Mappe.CHIAVI_STILE: vedi stileDeiNodi() qui sotto
};

// Stile dei nodi: ogni chiave di Mappe.CHIAVI_STILE arriva così com'è (leggi_mappa con dettagli) e si scrive con
// modifica_nodi.stile; qui solo quelle con un parametro dal nome diverso o senza parametro
const STILE_NODI = {
    freccia: { legge: 'leggi_mappa', scrive: 'modifica_nodi.frecciaFine' },   // vecchia freccia sì/no, oggi frecciaFine
};
function stileDeiNodi(chiavi) {
    return Object.fromEntries(chiavi.map(k => [k, STILE_NODI[k] || { legge: 'leggi_mappa', scrive: `modifica_nodi.${k}` }]));
}

// ---- Come l'assistente legge ogni parte dei dati ------------------------------------------------------------------------
//
// Per ogni percorso: dove stanno i suoi oggetti (radice = collezione dell'archivio, oppure padre + sotto) e che cosa
// dice di ognuno lo strumento che lo legge (trova). Per le parti di un oggetto la lettura è quella del padre.

const LETTORI = {
    materie: { radice: 'materie', strumento: 'panoramica', trova: (r, o) => r.materie.find(x => x.id === o.id) },
    set: { radice: 'set', strumento: 'leggi_set', args: o => ({ set_id: o.id }) },
    carte: { radice: 'carte', strumento: 'leggi_set', args: o => ({ set_id: o.setId }), trova: (r, o) => r.flashcard.find(x => x.id === o.id) },
    'carte.risposte': { padre: 'carte', sotto: c => c.risposte || [] },
    'carte.fonte': { padre: 'carte', sotto: c => (c.fonte ? [c.fonte] : []) },
    'carte.mappa': { padre: 'carte', sotto: c => (c.mappa ? [c.mappa] : []) },
    'carte.srs': { padre: 'carte', sotto: c => (c.srs ? [c.srs] : []) },
    ripassi: { radice: 'ripassi', strumento: 'statistiche', args: o => ({ carta_id: o.cartaId }) },
    esami: { radice: 'esami', strumento: 'panoramica', trova: (r, o) => r.esami.find(x => x.id === o.id) },
    impostazioni: { radice: 'impostazioni', strumento: 'panoramica' },
    'impostazioni.temiMappe': {
        padre: 'impostazioni', sotto: i => i.temiMappe || [], strumento: 'tema_mappe', args: () => ({ azione: 'elenca' }), trova: (r, o) => r.temi.find(x => x.id === o.id),
        soloCampiNoti: 'i temi passano da Mappe.normalizzaTema, che tiene solo i campi che conosce: un campo nuovo si aggiunge lì e allora compare qui tra i campi da registrare',
    },
    'impostazioni.stiliMappe': {
        padre: 'impostazioni', sotto: i => i.stiliMappe || [], strumento: 'stili_predefiniti', args: () => ({ azione: 'elenca' }), trova: (r, o) => r.stili.find(x => x.id === o.id),
        soloCampiNoti: 'Mappe.salvaStilePredefinito tiene solo id, nome e stile: un campo nuovo si aggiunge lì e allora compare qui tra i campi da registrare',
    },
    materiali: { radice: 'materiali', strumento: 'elenca_materiali', args: o => ({ set_id: o.setId }), trova: (r, o) => r.materiali.find(x => x.id === o.id) },
    'materiali.precedente': { padre: 'materiali', sotto: m => (m.precedente ? [m.precedente] : []), chiuso: 'la versione di prima di un file arriva come differenze (leggi_materiale)' },
    argomenti: { radice: 'argomenti', strumento: 'elenca_revisioni', args: () => ({}), trova: (r, o) => r.argomenti.find(x => x.id === o.id) },
    'argomenti.storico': { padre: 'argomenti', sotto: a => a.storico || [] },
    'argomenti.storico.prima': { padre: 'argomenti.storico', sotto: s => (s.prima ? [s.prima] : []) },
    chat: { radice: 'chat', chiuso: CHAT.escluso },
    mappe: { radice: 'mappe', strumento: 'leggi_mappa', args: o => ({ mappa_id: o.id, dettagli: true }) },
    'mappe.griglia': { padre: 'mappe', sotto: m => (m.griglia ? [m.griglia] : []) },
    'mappe.linee': { padre: 'mappe', sotto: m => (m.linee ? [m.linee] : []) },
    'mappe.relazioni': { padre: 'mappe', sotto: m => m.relazioni || [], trova: (r, o) => r.collegamenti.find(x => x.id === o.id) },
    'mappe.nodi': { padre: 'mappe', sotto: m => Object.values(m.nodi || {}), trova: (r, o) => trovaNodo(r, o.id) },
    'nodi.stile': { padre: 'mappe.nodi', sotto: n => (n.stile && Object.keys(n.stile).length ? [n.stile] : []) },
    'nodi.etichette': { padre: 'mappe.nodi', sotto: n => n.etichette || [], trova: (r, o) => (r.etichette || []).find(x => x.id === o.id) },
    'etichette.stile': { padre: 'nodi.etichette', sotto: e => (e.stile ? [e.stile] : []) },
    'nodi.figure': { padre: 'mappe.nodi', sotto: n => n.figure || [], trova: (r, o) => (r.immagini_accanto || []).find(x => x.id === o.id) },
    'nodi.immagine': { padre: 'mappe.nodi', sotto: n => (n.immagine ? [n.immagine] : []) },
    'nodi.raccordo': { padre: 'mappe.nodi', sotto: n => (n.raccordo ? [n.raccordo] : []) },
    'nodi.rif': { padre: 'mappe.nodi', sotto: n => (n.rif ? [n.rif] : []) },
};

// Strumenti che leggono altre cose (indicati in "legge"): come chiamarli per l'oggetto
const LETTURE_INTERE = {
    leggi_materiale: o => ({ materiale_id: o.id }),
    elenca_mappe: () => ({}),
    tema_mappe: () => ({ azione: 'elenca' }),
    stili_predefiniti: () => ({ azione: 'elenca' }),
};

function trovaNodo(r, id) {
    const giro = n => (n && n.id === id ? n : n && (n.figli || []).map(giro).find(Boolean));
    return giro(r.radice) || (r.nodi_liberi || []).map(giro).find(Boolean);
}

// La chiave c'è nel pezzo di lettura? (cercando anche dentro i suoi oggetti, ma non nei rami e negli elenchi di altri dati)
const NON_ENTRARE = new Set(['figli', 'radice', 'nodi_liberi', 'collegamenti', 'flashcard', 'sotto_set', 'materie', 'set', 'esami', 'argomenti', 'materiali']);
function haChiave(x, chiave, prof = 0) {
    if (x == null || typeof x !== 'object' || prof > 4) return false;
    if (Array.isArray(x)) return x.some(y => haChiave(y, chiave, prof + 1));
    if (x[chiave] !== undefined) return true;
    return Object.entries(x).some(([k, v]) => !NON_ENTRARE.has(k) && haChiave(v, chiave, prof + 1));
}

// ---- Aiuti --------------------------------------------------------------------------------------------------------------

const pieno = v => v != null && v !== '' && v !== false && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

// Gli oggetti di un percorso, con la funzione che dà la loro lettura: [{ o, leggi }]
function istanze(g, percorso, usa) {
    const L = LETTORI[percorso];
    if (L.radice) {
        return g('Archivio').tutti(L.radice).map(o => ({
            o, leggi: async () => { const r = await usa(L.strumento, L.args ? L.args(o) : {}); return L.trova ? L.trova(r, o) : r; },
        }));
    }
    return istanze(g, L.padre, usa).flatMap(p => L.sotto(p.o).map(o => ({
        o,
        leggi: async () => {
            if (L.strumento) { const r = await usa(L.strumento, L.args ? L.args(o) : {}); return L.trova(r, o); }
            const r = await p.leggi();
            return L.trova ? L.trova(r, o) : r;
        },
    })));
}

// Dove l'assistente legge un campo: { strumento, chiavi }
function letturaDi(voce) {
    const [strumento, chiavi] = voce.legge.split('>');
    return { strumento, chiavi: chiavi ? chiavi.split('|') : null };
}

// Esegue gli strumenti tenendo i risultati (molti campi si leggono dalla stessa chiamata)
function lettore(g) {
    const fatte = new Map();
    return async (nome, args = {}) => {
        const chiave = nome + JSON.stringify(args);
        if (!fatte.has(chiave)) {
            const r = await strumento(g, nome, args);
            assert.ok(!r.errore, `${nome}(${JSON.stringify(args)}) ha dato errore: ${r.errore}`);
            fatte.set(chiave, r);
        }
        return fatte.get(chiave);
    };
}

// Il registro dei campi completo (stile dei nodi compreso)
function registro(g) {
    return { ...CAMPI, 'nodi.stile': stileDeiNodi(g('Mappe').CHIAVI_STILE) };
}

// Parametri dichiarati da uno strumento, a qualsiasi profondità
function parametri(dichiarazione) {
    const out = new Set();
    const giro = s => {
        if (!s || typeof s !== 'object') return;
        Object.entries(s.properties || {}).forEach(([k, v]) => { out.add(k); giro(v); });
        if (s.items) giro(s.items);
    };
    giro(dichiarazione.parameters);
    return out;
}

// I dati di prova, più un po' di lavoro fatto con gli strumenti: così ci sono ripassi, storico dei mazzi, collegamenti,
// etichette, stili e temi da leggere
async function appConDati() {
    const app = await caricaApp();
    const { g } = app;
    const A = g('Archivio'), D = g('Dati');
    const fai = async (nome, args) => { const r = await strumento(g, nome, args); assert.ok(!r.errore, `${nome}: ${r.errore}`); return r; };
    const s = A.tutti('set').find(x => D.carteDiSet(x.id).length > 1);
    const carte = D.carteDiSet(s.id);
    await fai('registra_ripasso', { valutazioni: carte.map(c => ({ carta_id: c.id, valutazione: 'buono', secondi: 12 })) });
    const mp = A.tutti('mappe').find(x => !x.panoramica);
    const nodi = Object.keys(mp.nodi).filter(id => id !== mp.radice);
    await fai('collegamenti_mappa', { mappa_id: mp.id, aggiungi: [{ da: nodi[0], a: nodi[1], testo: 'collegamento di prova' }] });
    await fai('modifica_nodi', { mappa_id: mp.id, modifiche: [{ nodo_id: nodi[2], etichette: [{ testo: 'etichetta', grassetto: true, pt: 9 }], link: 'https://example.org', data: '2026-01-01', larghezza: 200 }] });
    await fai('stili_predefiniti', { azione: 'crea', nome: 'Dettaglio', stile: { pt: 8, coloreTesto: '#777777' } });
    await fai('tema_mappe', { azione: 'crea', nome: 'Il mio tema', parti_da_tema_id: 'naturale' });
    await fai('modifica_mappa', { mappa_id: mp.id, griglia: { attiva: true, passo: 30 }, linee: { forma: 'dritta' }, colori_rami: ['#123456'] });
    const nota = await fai('crea_nota', { set_id: s.id, titolo: 'Nota di prova', testo: '# Schema\n- uno\n- due' });
    await fai('collega_carte_fonte', { collegamenti: [{ carta_id: carte[0].id, materiale_id: nota.materiale_id, citazione: 'uno' }] });
    const fratelli = mp.nodi[mp.radice].figli.slice(0, 2);
    await fai('figlio_comune', { mappa_id: mp.id, nodi_ids: fratelli, testo: 'riepilogo', graffa: true });
    await fai('crea_mappa', { link_argomenti: true, materia_id: mp.materiaId });
    // Un'immagine nella mappa (nei test non si leggono file), poi una accanto a un nodo e una dentro un altro
    mp.immagini.provaimg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    await fai('immagini_nodi', { mappa_id: mp.id, aggiungi: [{ nodo_id: nodi[3], immagine_id: 'provaimg' }, { nodo_id: nodi[4], immagine_id: 'provaimg', dove: 'dentro' }] });
    return app;
}

// ---- I test -------------------------------------------------------------------------------------------------------------

test('ogni operazione che cambia i dati ha il suo strumento dell\'assistente o un\'esclusione scritta', async () => {
    const { g } = await caricaApp({ datiProva: false });
    const strumenti = new Set(g('Strumenti').dichiarazioni().map(d => d.name));
    const tutti = Codice.moduli(scriptDellApp());
    const nomi = new Set(tutti.map(m => m.nome));
    MODULI_DATI.forEach(m => assert.ok(nomi.has(m), `Il modulo ${m} non c'è più: aggiorna MODULI_DATI in test/parita-ia.test.js`));
    const operazioni = [...Codice.funzioniCheScrivono(tutti)].filter(f => MODULI_DATI.includes(f.split('.')[0])).sort();

    const mancanti = operazioni.filter(f => !(f in OPERAZIONI));
    assert.deepEqual(mancanti, [], `Operazioni nuove che cambiano i dati, senza strumento dell'assistente:\n  ${mancanti.join('\n  ')}\n`
        + "Regola dell'utente: quello che l'utente può fare, l'assistente deve poterlo fare. Aggiungi lo strumento in js/ia/ "
        + "(e le istruzioni in js/ia/istruzioni.js), poi la voce in OPERAZIONI di test/parita-ia.test.js; oppure un'esclusione con il motivo.");

    const vecchie = Object.keys(OPERAZIONI).filter(f => !operazioni.includes(f));
    assert.deepEqual(vecchie, [], `Voci di OPERAZIONI che non sono (più) operazioni che cambiano i dati: toglile da test/parita-ia.test.js\n  ${vecchie.join('\n  ')}`);

    Object.entries(OPERAZIONI).forEach(([f, v]) => {
        if (Array.isArray(v)) {
            assert.ok(v.length, `${f}: elenca almeno uno strumento`);
            v.forEach(s => assert.ok(strumenti.has(s), `${f}: lo strumento «${s}» non esiste (strumenti: js/ia/strumenti.js, js/ia/strumenti-mappe.js)`));
        } else {
            const motivo = v.escluso || v.interfaccia;
            assert.ok(typeof motivo === 'string' && motivo.length > 15, `${f}: scrivi il motivo dell'esclusione`);
        }
    });
});

test("l'interfaccia non scrive nell'archivio da sola (salvo i casi con il motivo)", () => {
    const fileDati = new Set(Codice.moduli(scriptDellApp()).filter(m => MODULI_DATI.includes(m.nome)).map(m => m.file));
    const trovate = [];
    scriptDellApp().filter(f => !fileDati.has(f)).forEach(f => {
        Codice.scrittureNelFile(f).forEach(s => {
            const ok = SCRITTURE_DIRETTE[f] && (SCRITTURE_DIRETTE[f].tutte || SCRITTURE_DIRETTE[f][s.collezione]);
            if (!ok) trovate.push(`${f}:${s.riga} Archivio.${s.funzione}('${s.collezione}')`);
        });
    });
    assert.deepEqual(trovate, [], `Scritture dirette nell'archivio dall'interfaccia:\n  ${trovate.join('\n  ')}\n`
        + "Passa da una funzione dei moduli dei dati (js/dati.js…) e dai all'assistente lo strumento corrispondente; "
        + "oppure registra il caso in SCRITTURE_DIRETTE di test/parita-ia.test.js con il motivo.");
});

test("ogni campo dei dati è registrato: come lo legge l'assistente e come lo scrive (o perché no)", async () => {
    const { g } = await appConDati();
    const A = g('Archivio'), M = g('Mappe'), D = g('Dati');
    const REG = registro(g);
    const strumenti = new Map(g('Strumenti').dichiarazioni().map(d => [d.name, d]));
    const visti = new Map();   // "percorso.campo" → dove l'abbiamo visto
    const vedi = (percorso, campo, dove) => { const k = `${percorso}.${campo}`; if (!visti.has(k)) visti.set(k, dove); };

    // a) Nei dati: quelli di prova e quelli appena fatti con gli strumenti
    const usa = lettore(g);
    Object.keys(LETTORI).forEach(p => istanze(g, p, usa).forEach(({ o }) => Object.keys(o).forEach(k => vedi(p, k, 'nei dati'))));
    // b) Negli oggetti nuovi fatti dall'app
    const nuovi = {
        materie: D.creaMateria({ nome: 'x' }), esami: D.creaEsame({ nome: 'x', data: '2030-01-01' }),
        mappe: M.nuova({ nome: 'x' }), 'mappe.nodi': M.nodoVuoto(), 'impostazioni': { ...g('IMPOSTAZIONI_PREDEFINITE') },
    };
    const s = D.creaSet({ materiaId: nuovi.materie.id, nome: 'x' });
    Object.assign(nuovi, { set: s, carte: D.creaCarta(s.id, { domanda: 'x', risposte: [{ testo: 'y' }] }), argomenti: D.creaArgomento({ setId: s.id, nome: 'x' }),
        materiali: D.creaMateriale({ setId: s.id, nome: 'x' }) });
    nuovi['carte.srs'] = nuovi.carte.srs;
    Object.entries(nuovi).forEach(([p, o]) => Object.keys(o).forEach(k => vedi(p, k, 'oggetto nuovo')));
    // c) Nel codice: i campi passati alle funzioni di Dati e quelli che l'editor delle mappe assegna
    const file = scriptDellApp().filter(f => !f.startsWith('js/ia/'));
    Codice.campiScritti(file, { editorMappe: ['js/mappe/editor.js'] }).forEach(x => vedi(x.percorso, x.campo, x.dove));

    const senza = [...visti].filter(([k]) => { const i = k.lastIndexOf('.'); return !(REG[k.slice(0, i)] || {})[k.slice(i + 1)]; });
    assert.deepEqual(senza.map(([k, dove]) => `${k}  (${dove})`), [],
        "Campi dei dati non registrati in CAMPI di test/parita-ia.test.js. Regola dell'utente: quello che vede l'assistente lo "
        + "legge (di solito arriva già in altri_dati), quello che cambia lo deve poter cambiare: aggiungi il parametro allo "
        + "strumento giusto e la voce { legge, scrive } (o { legge, auto } / { escluso } con il motivo).");

    // Le voci sono complete e gli strumenti e i parametri esistono
    Object.entries(REG).forEach(([p, campi]) => Object.entries(campi).forEach(([c, v]) => {
        const nome = `${p}.${c}`;
        if (v.escluso) { assert.ok(v.escluso.length > 15, `${nome}: scrivi il motivo dell'esclusione`); return; }
        assert.ok(v.legge, `${nome}: manca come lo legge l'assistente (legge)`);
        const { strumento: s1 } = letturaDi(v);
        assert.ok(strumenti.has(s1), `${nome}: lo strumento di lettura «${s1}» non esiste`);
        assert.ok(v.scrive || v.auto, `${nome}: manca come lo scrive l'assistente (scrive) o perché lo mette l'app (auto)`);
        if (v.scrive) {
            const [s2, par] = v.scrive.split('.');
            assert.ok(strumenti.has(s2), `${nome}: lo strumento «${s2}» non esiste`);
            assert.ok(parametri(strumenti.get(s2)).has(par), `${nome}: lo strumento ${s2} non ha il parametro «${par}»`);
        } else assert.ok(v.auto.length > 10, `${nome}: scrivi perché lo mette l'app`);
    }));
});

test("l'assistente legge davvero i campi registrati (sui dati di prova)", async () => {
    const { g } = await appConDati();
    const REG = registro(g);
    const usa = lettore(g);
    const non = [];
    for (const [p, campi] of Object.entries(REG)) {
        if (LETTORI[p].chiuso) continue;
        const tutte = istanze(g, p, usa);
        for (const [c, v] of Object.entries(campi)) {
            if (v.escluso) continue;
            const x = tutte.find(i => pieno(i.o[c])) || (c === 'prossima' && tutte.find(i => i.o.ultimoRipasso));
            if (!x) continue;   // nei dati di prova nessuno ce l'ha: lo copre il test dei campi nuovi
            const { strumento: s, chiavi } = letturaDi(v);
            const trovato = LETTURE_INTERE[s] && s !== (LETTORI[p].strumento || '') ? await usa(s, LETTURE_INTERE[s](x.o)) : await x.leggi();
            if (!(chiavi || [c]).some(k => haChiave(trovato, k))) non.push(`${p}.${c} → ${v.legge} (letto: ${JSON.stringify(trovato).slice(0, 160)})`);
        }
    }
    assert.deepEqual(non, [], "Campi che l'assistente non legge come dice CAMPI in test/parita-ia.test.js:\n  " + non.join('\n  '));
});

test("un campo nuovo dei dati arriva subito all'assistente (altri_dati)", async () => {
    const { g } = await appConDati();
    const non = [];
    for (const p of Object.keys(LETTORI)) {
        if (LETTORI[p].chiuso || LETTORI[p].soloCampiNoti) continue;
        const usa = lettore(g);   // nessun risultato tenuto: il dato cambia
        const x = istanze(g, p, usa)[0];
        if (!x) { non.push(`${p}: nei dati di prova non c'è nessun oggetto da provare (aggiungine uno a js/prova.js o in appConDati)`); continue; }
        const sentinella = `SENTINELLA-${p}`;
        x.o.campoNuovoDiProva = sentinella;
        const trovato = await x.leggi();
        delete x.o.campoNuovoDiProva;
        if (!JSON.stringify(trovato || null).includes(sentinella)) non.push(`${p}: la lettura dell'assistente non porta i campi che non conosce (usa altriDati in js/ia/)`);
    }
    assert.deepEqual(non, [], non.join('\n'));
});

test('le istruzioni dell\'assistente nominano gli strumenti che esistono', async () => {
    const { g } = await caricaApp({ datiProva: false });
    const strumenti = new Set(g('Strumenti').dichiarazioni().map(d => d.name));
    const testo = g('Istruzioni').sistema();
    const nominati = [...new Set(testo.match(/\b[a-z]+(?:_[a-z]+)+\b/g) || [])].filter(n => !strumenti.has(n));
    // Nomi con il trattino basso che non sono strumenti: parametri e campi citati nelle istruzioni
    const parametriCitati = new Set(g('Strumenti').dichiarazioni().flatMap(d => [...parametri(d)]));
    const altriNomi = ['riga_del_set', 'parte_della_mappa', 'cambiato_di_recente', 'altri_dati', 'collegate_alla_mappa', 'foglie_assorbite', 'catene_collassate', 'domanda_html', 'risposta_html', 'spiegazione_html', 'link_argomenti', 'elimina_tutto'];
    const ignoti = nominati.filter(n => !parametriCitati.has(n) && !altriNomi.includes(n));
    assert.deepEqual(ignoti, [], `Le istruzioni (js/ia/istruzioni.js) nominano strumenti che non esistono: ${ignoti.join(', ')}`);
});
