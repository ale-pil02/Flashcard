# Flashcard

App web per creare flashcard e studiarle con la ripetizione spaziata.
Niente da installare né compilare: HTML, CSS e JavaScript semplici.

## Come aprirla

Doppio clic su **`Flashcard.bat`**: avvia un piccolo server (`server.py`) e apre
`http://localhost:8010`. Non chiudere la finestra nera finché usi l'app.
Dopo un aggiornamento dell'app basta ricaricare la pagina.

> I dati restano nel browser con cui apri l'app, legati all'indirizzo `localhost:8010`.
> Usa sempre lo stesso browser e lo stesso indirizzo, e ogni tanto fai
> **Impostazioni → Backup → Esporta**.

Per provarla senza toccare i tuoi dati: **Impostazioni → Dati di prova → Carica**
(si tolgono con **Rimuovi**, che lascia intatto il resto).

## Cosa c'è

| Area | Cosa fa |
|---|---|
| **Home** | Revisioni di oggi, set recenti, prossimi esami (niente obiettivo giornaliero né giorni di fila: tolti su richiesta) |
| **Libreria** | Materie → set → sotto-set → flashcard, con ricerca su tutto il testo |
| **Set** | Avanzamento (Perfetto / Buono / Ok / Scarso / Mai studiate), riquadro con le carte da fare e **Personalizza** (il pulsante Studia non c'è più: lo studio parte dalle revisioni), sotto-set, revisioni, materiali, elenco delle carte ad albero. Sotto-set, Revisioni, Materiali e Flashcard si aprono e chiudono con un clic sul titolo (lo stato resta per tutti i set) |
| **Selezione** | Nel set e nella ricerca: più flashcard insieme → tag, domanda madre, sposta, valutazione, progressi, assistente, elimina |
| **Studio** | Una sola modalità: domanda → mostra risposta → Scarso / Ok / Buono / Perfetto (Ok e Scarso tornano in fondo); sotto la risposta, la parte di mappa collegata; a fine sessione si aggiornano le revisioni |
| **Revisioni** | Ripasso dei set e degli argomenti come nel database "Spaced Repetition System" di Notion, a intervalli crescenti (Fibonacci, modificabile) che si adattano a ritardi e anticipi, più il pannello delle flashcard da ripassare per conto loro: sezione propria e, in ogni set, quelli del set. Guida «Come funziona» con simulatore |
| **Sessione personalizzata** | Scegli uno o più set, lo stato delle carte, i tag, quante carte e l'ordine |
| **Editor** | Domanda, risposta, fonte della risposta, parte della mappa, domanda madre, suggerimento, spiegazione, tag, immagini |
| **Statistiche** | Carte di oggi, tempo di studio, grafico giornaliero, calendario, avanzamento per materia |
| **Piano di studio** | Date degli esami con conto alla rovescia, collegate alle materie |
| **Impostazioni** | Nome, carte per sessione, ordine, studio a cascata, carte di dettaglio, assistente IA, tema, import, backup, dati di prova |
| **Materiali** | In ogni set: PDF, slide, mappe mentali, Word, PowerPoint, immagini, testi e note, anche da una cartella o da file collegati (Drive) |
| **Assistente IA** | Gemini: fa le operazioni dell'app, risponde sui materiali, crea flashcard di localizzazione |
| **Annulla** | Ogni messaggio dell'assistente e ogni azione su più carte si annulla (e si ripristina) |

## Risposte con la parte di mappa

Una flashcard si può collegare al nodo di una mappa mentale dell'app dove sta la sua risposta (`carta.mappa = { id, nodo }`,
campo **Parte della mappa** nell'editor della carta). Nello studio, sotto la risposta, compare **tutto il sottoramo** che
contiene quel nodo (il ramo principale, figlio del tema centrale; per il tema centrale tutta la mappa), con il nodo
evidenziato. È disegnato dalla mappa com'è in quel momento (lo stesso disegno dell'editor, in sola lettura:
`js/mappe/vista.js`), quindi ogni modifica alla mappa arriva da sola nella risposta; il collegamento usa l'id del nodo e
resta anche se lo rinomini o lo sposti. Se il nodo viene cancellato, la carta lo segnala.

- Con il collegamento la risposta scritta può mancare: la risposta è la mappa.
- **Ingrandisci** (in alto a destra della mappa) apre una vista grande con zoom, il pulsante *Tutta la mappa* e *Apri
  nell'editor* (la mappa si apre con quel nodo selezionato). Nella risposta la rotellina scorre la pagina; con Ctrl
  ingrandisce.
- Le carte fatte da materiali in prosa restano senza collegamento.
- L'assistente collega le carte esistenti ai nodi (`collega_carte_mappa`), collega quelle che crea da una mappa e le
  flashcard di localizzazione fatte da una mappa dell'app (`prepara_piano_localizzazione` con `mappa_id`, o dal
  materiale della mappa) nascono già collegate. Da un file di mappa tra i materiali o da una trascrizione no.

## Risposte collegate alla fonte

Per le carte che vengono da materiali in prosa (PDF, slide, Word, testi, note) c'è la **Fonte della risposta**
(`carta.fonte = { materiale, pagina, citazione }`, campo nell'editor della carta): il materiale, la pagina o diapositiva e
la frase dove sta la risposta. Nello studio compare sotto la risposta, e **un clic sulla risposta** (o sulla riga della
fonte) apre il materiale lì: il PDF alla pagina, i testi e le note con la frase evidenziata e già in vista (anche nel testo
estratto del PDF). La frase si ritrova anche con spazi e a capo diversi; se non si trova intera si cerca con le prime
parole, poi si ripiega sulla pagina. Una carta può avere sia la fonte sia la parte di mappa; con la sola mappa il clic
sulla risposta la ingrandisce. L'assistente mette la fonte alle carte che crea dai materiali e collega quelle esistenti
(`collega_carte_fonte`); se la frase citata non si trova alla lettera nel materiale, lo avvisa.

## Materiali di un set (stile NotebookLM)

Ogni set (e sotto-set) ha la sezione **Materiali**: trascini o carichi PDF e slide, immagini,
Word (.docx), PowerPoint (.pptx), mappe mentali (SimpleMind .smmx, OPML, XMind, FreeMind .mm, Markdown a
elenchi), testi, oppure scrivi una **Nota**. L'app conserva il file e ne estrae il testo; dalle mappe ricava
anche l'albero dei nodi. Ogni materiale si apre in un visualizzatore e si può escludere dalla chat.

- **Mappe dell'app**: ogni mappa della sezione Mappe che sta in un set compare tra i suoi materiali (anche
  creandola dal pulsante **Mappa** dei materiali). È un materiale senza file (`mappaId`) che segue la mappa a ogni
  salvataggio: nome, nodi (testo; etichette e nota come corpo del nodo), anteprima. Il clic apre l'editor; dal menu ⋯
  si rinomina o sposta la mappa, la si toglie dal set (resta nella sezione Mappe) o la si elimina. Serve come fonte
  per la chat del set, per le flashcard di localizzazione e come fonte delle revisioni. All'avvio l'app riallinea
  i materiali di tutte le mappe (`Materiali.allineaMappe`).

- **SimpleMind**: dalle mappe `.smmx` l'app legge nodi e note, parte dal tema centrale e aggiunge in fondo i
  nodi liberi; salta i nodi senza testo (riquadri vuoti, immagini). SimpleMind non si usa più: il clic apre la
  mappa nell'app (albero e novità), e per lavorarci la si importa nella sezione Mappe.
- PDF, Word, PowerPoint, immagini e testi si possono aprire anche con il loro programma del computer
  (⋯ → *Apri con il programma del computer*; non per le mappe SimpleMind). Lo fa `server.py`, solo per i formati
  dei materiali.

### Cartella o file collegati (anche Google Drive)

Invece di caricare una copia, nella sezione Materiali di un set: **Collega** → **Una cartella intera** oppure
**Uno o più file**. Si apre la finestra di Windows, che parte da `G:\Il mio Drive` (Drive per desktop).
Cartelle e file li legge `server.py`, in **sola lettura**: funziona con qualsiasi browser (anche Brave) e non
chiede permessi a ogni apertura. Per questo l'app va aperta con `Flashcard.bat`.

- Mentre l'app è aperta (e la sua scheda è quella in vista) li ricontrolla ogni 5 secondi.
- **Cartella**: i suoi file e quelli delle sottocartelle diventano materiali; un file nuovo compare, uno
  cancellato sparisce, uno modificato viene riletto.
- **File singoli**: ognuno è un materiale che viene riletto quando lo modifichi. Se lo sposti o lo rinomini il
  materiale resta con l'avviso "file non trovato": dal suo menu ⋯ **Collega a un altro file**, oppure
  **Scollega** per tenerlo come copia normale. **Togli dal set** non tocca il file sul computer.
- Di un file modificato l'app tiene la versione di prima: aprendolo vedi **cosa è cambiato** (nodi della mappa
  aggiunti, tolti o cambiati; righe nuove e tolte per PDF e testi) e con **Aggiorna le flashcard** l'assistente
  crea le carte nuove agganciandole all'albero, corregge quelle superate e ti chiede quali eliminare.
- Un file appena cambiato ha l'etichetta **aggiornato**: sparisce quando lo apri (nell'app o nel suo programma,
  per esempio SimpleMind), quando aggiorni le flashcard con le novità, con ⋯ → *Segna come visto*, o da sola
  dopo 3 giorni. Le novità restano consultabili aprendo il materiale fino al cambiamento successivo.
- I file nativi di Google (Documenti, Presentazioni: `.gdoc`, `.gslides`) non contengono il testo: salvali in
  Drive anche come PDF o PowerPoint nella stessa cartella.
- Se la cartella non si raggiunge (spostata, rinominata, Drive non avviato) la striscia lo dice e i materiali
  restano com'erano finché non torna disponibile.
- I file della cartella si rinominano ed eliminano dalla cartella, non dall'app. **Scollega** (menu ⋯ della
  striscia) li tiene come copie normali oppure li toglie.

## Selezione di più flashcard

Nell'elenco del set (e nei risultati della ricerca della Libreria) **Seleziona** mette una casella su ogni riga.
Clic su una riga per sceglierla, `Maiusc`+clic per un intervallo, `Spazio` sulla riga col fuoco, `Ctrl+A` per
tutte, `Esc` per uscire. Dalla barra in basso: **Tag** (aggiungi e togli), **Madre** (mettile sotto una domanda),
**Sposta** in un altro set (con i loro rami), **Assistente** (le allega al prossimo messaggio: "rendile più
brevi", "riscrivile senza indizi"…), **⋯** (primo livello, reimposta progressi), **Elimina** (con o senza le
domande figlie).

## Annullare le modifiche

Ogni messaggio dell'assistente che cambia qualcosa finisce con il riquadro **Modifiche fatte** e il pulsante
**Annulla** (poi **Ripristina**). Le azioni su più flashcard mostrano un avviso con **Annulla**. Tutto è anche in
**Modifiche recenti** (Impostazioni → Dati, menu ⋯ del set o dell'assistente), con le ultime 40 voci.
Annullare rimette com'erano solo le cose cambiate in quel blocco: se nel frattempo hai studiato quelle carte o
ne hai modificato altro, quei cambiamenti restano. Lo studio (i ripassi) non si annulla mai.
Le mappe entrano nella storia solo quando le cambia l'assistente (le tue modifiche nell'editor hanno il suo Annulla):
non stanno nella fotografia iniziale, si fotografano quando chi le cambia lo annuncia (`Mappe.primaDiCambiare`).
Se la mappa è aperta, il cambio dell'assistente o l'annullamento dalla chat si vede subito ed è anche un passo
del Ctrl+Z dell'editor.

## Assistente IA (Gemini)

Pulsante ✨ in basso a destra. Serve la chiave API di Gemini (Impostazioni → Assistente IA o
direttamente nel pannello): resta solo in questo browser e non finisce nei backup.

- **Fa tutto quello che fai tu**: crea e modifica materie, set, sotto-set, flashcard (anche ad
  albero), materiali, esami, impostazioni e mappe mentali, apre pagine, esporta (testo o Excel). Prima di
  cancellare qualcosa chiede conferma.
- **Mappe mentali**: anche nell'editor delle mappe (pulsante ✨ nella barra). Sa quale mappa hai aperta e quali
  nodi hai selezionato ("aggiungi tre figli a questo nodo"). Crea mappe (anche da uno schema o da un materiale
  del set, .smmx compresi), aggiunge, modifica, sposta, copia (anche in un'altra mappa) ed elimina nodi; cambia
  testo, note, etichette, icone, date, caselle, stile, linee, disposizioni, tema e colori; crea raccordi con linee
  o graffa e figli comuni, collegamenti tra rami e temi personali; seleziona nodi, si concentra su un ramo, esporta
  in PNG, OPML o testo. Non aggiunge immagini e non piega le linee a mano. Strumenti in `js/ia/strumenti-mappe.js`.
- **Livello di ragionamento** (Impostazioni → Assistente IA, o menu ⋯ dell'assistente): come il "Thinking level" di
  Google AI Studio (predefinito del modello, minimo, basso, medio, alto): `generationConfig.thinkingConfig.thinkingLevel`
  per i Gemini 3 e successivi (anche per i nomi senza versione come `gemini-flash-latest`); i Gemini 2.5 usano il loro
  predefinito. L'app non manda mai `thinkingBudget`, `temperature`, `topP` o `topK`, che Google considera superati (i
  prossimi modelli li rifiuteranno). Se il modello non accetta il livello, l'app riprova: «minimo» ripiega su «basso»,
  poi sul predefinito del modello.
  **Prova il collegamento** (Impostazioni) dice con che ragionamento ha risposto e quanti token ha usato per ragionare;
  il livello scelto si vede anche sotto il titolo dell'assistente.
- **Chat del set**: aperta da un set, usa i suoi materiali come fonti (PDF e immagini li legge
  direttamente) e li cita, come NotebookLM. Altrove c'è la chat generale.
- **Flashcard di localizzazione** (la skill *creatore-flashcard-mappe-mentali*): si avvia solo su
  richiesta, con `/localizzazione` nella chat o con il pulsante sul materiale. La parte meccanica
  (albero, tag, piano, foglie assorbite, catene, controlli sulle domande) è in `js/localizzazione.js`
  e dà gli stessi risultati degli script Python della skill; l'IA scrive solo le domande. Le carte
  nascono già ad albero e si studiano a cascata. Unica differenza voluta dalla skill: il numero di
  *concetto N* segue l'albero delle carte, non la profondità del nodo nella mappa. Quando un sottoramo ha un
  solo figlio i due diventano una carta sola, e sotto di lei ci sono comunque i *concetto 1* (prima diventavano
  *concetto 2*; le carte già fatte sono state corrette una volta all'avvio, annullabile da Modifiche recenti).

Le istruzioni dell'assistente (carattere, regole per le flashcard, procedura della skill) sono in
`js/ia/istruzioni.js`; gli strumenti che può usare in `js/ia/strumenti.js` (e per le mappe in `js/ia/strumenti-mappe.js`).

## Revisioni (dal database di Notion)

I set (e, a mano, anche altri argomenti: capitoli, schemi) si ripassano con lo stesso metodo del database
"Spaced Repetition System" di Notion. Ogni riga ha:

| Colonna | Cosa contiene |
|---|---|
| Argomento | Il nome (di solito il set, il capitolo o lo schema) |
| Schema / fonte | Testo libero e i materiali collegati, da aprire con un clic (🔗 per collegarne o toglierne) |
| N° Rep | Quante volte l'hai ripassato (solo un conteggio: cambiarlo a mano non sposta le date) |
| Ultimo ripasso | La data dell'ultimo ripasso |
| Intervallo | Giorni dall'ultimo ripasso alla prossima revisione, aggiornato a ogni ripasso (vedi *Ripetizione spaziata*) |
| Prossima revisione | Ultimo ripasso + intervallo; scegliendo la data a mano l'intervallo si adegua |
| Alert | 🔴 *Da ripassare (N giorni)* se è in ritardo, 🟡 *Ripassare oggi*, 🟢 *Attendi N giorni* |
| Stato | Ottimo, Buono, Ok, Scarso o Incompleto (non cambia gli intervalli) |

**Nuovo argomento**: scegli il set (dalla pagina del set è già scelto), il nome e le sue flashcard: **tutte quelle del
set** (anche quelle che aggiungerai; una sola riga così per set), **tutte quelle che ci sono adesso** (quelle aggiunte
dopo no) oppure **solo alcune**, da spuntare nell'elenco ad albero (una domanda porta con sé le sue figlie). Un argomento con le flashcard funziona come la riga del set qui sotto,
ma solo con le sue carte: stato, pulsante Ripasso, N° Rep a fine sessione e pannello «Per flashcard». Accanto al nome
c'è «N di M flashcard»: clic (o ⋯ → *Flashcard dell'argomento…*) per cambiarle. Un set studiato che ha già argomenti
con le flashcard non riceve una riga del set in più.

**Riga del set, aggiornata dallo studio.** Ogni set con flashcard ha la sua riga (la crea lo studio, oppure prende
quella che c'è già: con il nome del set o l'unica del set). Quando finisci una sessione, o la termini con ✕ / Esc:
- per ogni set studiato, separatamente (anche se ne studi più insieme, e i sotto-set per conto loro):
  se hai valutato **tutte** le carte del set è un ripasso: N° Rep +1, Ultimo ripasso = oggi e il nuovo intervallo
  (in anticipo o in ritardo si adatta; un altro ripasso lo stesso giorno fa solo N° Rep +1 e la data resta). Le carte
  valutate **Buono** o **Perfetto** prendono ultimo ripasso e intervallo del set e restano al suo passo; le **Ok** e
  **Scarso** seguono le loro regole e finiscono nel pannello «Per flashcard». Se ne hai valutate solo alcune, la fine
  della sessione lo dice e c'è il pulsante **Segna come ripasso**;
- lo **stato** viene dalle valutazioni delle carte del set (i dettagli nascosti non contano): basta una carta
  Scarso → Scarso; altrimenti una Ok → Ok; altrimenti più dell'80% Perfetto → Ottimo; altrimenti Buono. Se c'è
  anche una sola carta mai valutata (per esempio aggiunta dopo) → **Incompleto**. Cambiando la valutazione di una
  carta a mano cambia anche lo stato;
- i **materiali** collegati si aggiungono da soli: la mappa collegata alle risposte (il suo materiale) e la fonte
  delle risposte. Quelli che togli a mano non tornano.

**Pulsante Ripasso** (⚡ nella colonna Ripasso): fa partire lo studio del set. Se ci sono carte da sistemare (mai
valutate, Ok o Scarso) chiede se ripassare **solo quelle** (si aggiornano le flashcard e lo stato, non N° Rep né date
del set) o **tutto il set** (è un ripasso vero). Se sono da sistemare tutte (per esempio al primo ripasso, quando sono tutte mai
valutate) non chiede niente: è un ripasso vero. Le righe senza flashcard hanno la vecchia spunta: scegli com'è andata e l'app fa
N° Rep +1, Ultimo ripasso = oggi e il nuovo intervallo; per le righe dei set lo stesso è nel menu ⋯ (*Segna il
ripasso a mano…*).

**Conta o è una prova?** Quando avvii uno studio (⚡ del set o della carta, *Ripassa quelle da fare*, Personalizza,
*Studia* del piano…) e un set o delle carte non sono nel giorno previsto (in anticipo, in ritardo o già ripassati
oggi), l'app lo dice, con la data che avrebbe la prossima revisione, e chiede: **Conta come ripasso** oppure **Ripasso
di prova**. Il ripasso di prova non cambia niente, né per il set né per le carte (valutazioni, N° Rep, date, stato);
tempo e risposte vanno lo stesso nelle statistiche. Il giorno previsto non chiede niente. Le modifiche a mano valgono
sempre.
I ripassi si annullano dall'avviso, dal menu ⋯ della riga (*Annulla l'ultimo ripasso*) o da Modifiche recenti;
nel menu c'è anche la cronologia dei ripassi.

**Pannello «Per flashcard»** (nella sezione Revisioni e nella pagina di ogni set). Ogni carta ha la stessa ripetizione
del set (vedi *Ripetizione spaziata*), con il suo N° Rep. Nel pannello ci sono le carte dei set già ripassati che non
vanno al passo con il loro set (o argomento): mai ripassate (aggiunte dopo) o con la prossima revisione in un giorno
diverso da quella del set (valutate Ok o Scarso, ripassate per conto loro, cambiate a mano). Si modificano come le righe
(valutazione, N° Rep, ultimo ripasso, intervallo, prossima revisione), ⚡ ripassa una carta, **Ripassa quelle da fare**
le prende tutte. Il ripasso dal pannello non conta come ripasso del set, ma aggiorna le carte. Una carta torna al passo
quando la valuti Buono o Perfetto nel ripasso completo del set. **Riadegua al set** (nella riga) lo fa subito: la carta
prende ultimo ripasso e intervallo del set (la stessa prossima revisione) ed esce dall'elenco, anche se è Scarso o mai
valutata; valutazione e N° Rep restano i suoi (quindi lo stato del set non cambia). Si annulla dall'avviso.
- Tutte le celle si modificano sul posto, come in Notion; un clic sull'intestazione ordina la colonna.
- **Larghezza delle colonne**: si trascina il bordo destro dell'intestazione; doppio clic per tornare alla
  larghezza predefinita (tutte insieme: menu ⋯ della sezione Revisioni). Valgono in ogni tabella delle revisioni.
- **Sezione Revisioni** (nel menu, con il numero di quelli da fare, flashcard comprese): pannelli *Per set* e
  *Per flashcard*, schede *Tutte*, una per materia e *Da ripassare*. È l'unico posto dove si cambia il set di una
  riga; dal menu ⋯ *Un argomento per ogni set* crea in un colpo le righe dei set che non ne hanno.
- **Nella pagina di un set** ci sono solo gli argomenti di quel set e dei suoi sotto-set, con i pannelli *Per set* e
  *Per flashcard*: lì si modificano, ma non si vedono né si toccano quelli degli altri set.
- **Come funziona** (in alto nella sezione Revisioni, o Impostazioni → Revisioni) apre una guida a passi su
  flashcard, valutazioni e revisioni, con un simulatore della prossima data (`js/guida.js`).
- In **Home** compaiono gli argomenti da rivedere oggi e quante flashcard sono da ripassare per conto loro.
  L'assistente sa leggerli (anche il pannello delle flashcard), crearli, modificarli e segnare un ripasso
  ("ho ripassato il capitolo 2").

## Mappe mentali (come SimpleMind)

Sezione **Mappe** nel menu: elenco delle mappe con anteprima, filtrabile per materia; ogni mappa può stare
in una materia e in un set. Si crea con **Nuova mappa** (o dal pulsante Crea) e si importa con **Importa**:

- **SimpleMind (.smmx)**: testi, forma e colori di ogni nodo, stili per livello e colori dei rami del foglio
  di stile, etichette sopra i nodi, icone (quelle di serie diventano emoji, quelle personali restano
  immagini), immagini nei nodi, link, rami chiusi, nodi liberi e relazioni con il loro testo. Si può tenere
  la posizione esatta dei nodi (disposizione libera) o lasciarli ordinare all'app.
- **OPML** (anche quelli della skill delle mappe) e **testo rientrato** (tab, trattini o titoli #).

**«link argomenti»**: ogni materia con mappe ha la sua mappa d'insieme, creata da sola alla prima mappa (se non ce n'è
già una con quel nome fatta a mano). Radice = la materia; sotto, per ogni mappa, il titolo, i sottorami e i concetti di
primo livello; i nodi più profondi ci vanno se nella loro mappa scegli dal menu del nodo **Mostra in «link argomenti»**
(icona della mappa sul nodo). Si riallinea da sola a ogni modifica: testi e struttura vengono dalle mappe d'origine
(lì non si modificano: la freccia accanto a ogni nodo apre la sua mappa in quel punto), mentre aspetto, disposizione,
tema, posizioni, nodi aggiunti a mano e **collegamenti tra argomenti** di mappe diverse restano. Nell'elenco delle
mappe e nella barra dell'editor ha l'etichetta *d'insieme*.

La **freccia indietro** dell'editor torna alla pagina da cui si è aperta la mappa (per esempio i materiali del set o la
«link argomenti»), come il tasto Indietro; dallo studio o senza pagina precedente va all'elenco delle mappe.

L'editor (rotta `#/mappa/<id>`):

- **Tastiera**: Tab figlio, Invio fratello, F2 o doppio clic per scrivere (o si comincia a scrivere e basta),
  Maiusc+Invio per andare a capo, Canc elimina, frecce per spostarsi, Alt+↑/↓ riordina, Spazio apre/chiude
  il ramo, Ctrl+Z/Y, Ctrl+C/X/V (si incollano anche elenchi rientrati da altri programmi), Ctrl+B/I/U,
  Ctrl+Alt+C / Ctrl+Alt+V copia e incolla lo stile, Ctrl+F cerca, Ctrl+0 adatta. Nel testo: `**grassetto**`, `*corsivo*`, `__sottolineato__`, `~~barrato~~`.
- **Mouse e touch**: trascina lo sfondo per spostarti, rotellina (o due dita) per lo zoom, Maiusc+rotellina
  per scorrere, Maiusc+trascina per selezionare un'area, doppio clic sullo sfondo per un nodo libero.
  Trascinando un nodo su un altro lo si sposta sotto di lui, sopra o sotto un fratello per riordinarlo;
  i rami principali si spostano anche da un lato all'altro.
- **Maniglie** attorno al nodo scelto: ⋯ menu, T etichetta, + figlio, ↗ collegamento a un altro nodo,
  ▾ chiudi ramo, e sopra il nodo la **disposizione dei suoi figli**: ogni nodo può averne una sua (orizzontale,
  a destra, a sinistra, verticale, capovolta, lineare, radiale, libera) o seguire quella del padre; per la radice
  è quella di tutta la mappa. Nella disposizione libera ogni nodo ricorda la distanza dal genitore: spostando un
  nodo si sposta tutto il suo ramo, e portandolo dall'altra parte del genitore il ramo si ribalta.
- **Trascinamento**: mentre trascini si muovono in diretta il nodo, il suo ramo e tutte le linee. Con Ctrl+clic
  si scelgono più nodi (un altro Ctrl+clic ne toglie uno): trascinandone uno si spostano tutti insieme.
- **Figlio comune e graffa**: con più nodi scelti compare una barra (anche nel menu del nodo).
  **Figlio comune** crea un nodo collegato a tutti: se i nodi sono fratelli il nuovo nodo sta oltre di loro, a
  metà della loro altezza, con una linea da ognuno; se non lo sono sta sotto il primo scelto e gli altri hanno una
  linea in più verso di lui. **Graffa** (solo fratelli) li raccoglie con una parentesi graffa che porta al nuovo
  nodo, come il riepilogo di XMind. Cliccando quelle linee si passa da linee a graffa, si toglie un nodo dal
  raccordo o una linea in più. Nel modello: `raccordo { nodi, graffa }` e `legami [id]` sul nodo.
- **Linee**: clicca una linea per sceglierla; nel pannello Stile ne cambi forma (curva, ad angolo, angolo
  arrotondato, dritta), tratto (affusolata automatica, affusolata, piena, a trattini, a punti), spessore, frecce
  all'inizio e alla fine e colore, anche per tutto il ramo. L'affusolata automatica si assottiglia a ogni livello
  senza scendere sotto lo spessore minimo; forma e misure di base sono in Disposizione e tema → Linee.
  **Trascinando un punto qualsiasi di una linea la si piega** (resta attaccata ai due nodi e li segue quando si
  spostano; `piega` sul nodo); **Raddrizza la linea** la riporta normale, e cambiando disposizione le linee
  piegate del ramo tornano normali. Anche i collegamenti tra rami si piegano da qualsiasi punto; le etichette si trascinano.
- **Pannelli** (barra in alto): Disposizione e tema (orizzontale, verticale, capovolta, lineare, radiale,
  libera; rami a destra/sinistra/automatici; spaziatura; linee della mappa; 4 temi di serie e quelli tuoi, creati
  con **Nuovo tema** partendo dall'aspetto della mappa e salvati nelle impostazioni, quindi validi per tutte le mappe), Stile (carattere, forma, bordo, colori
  del ramo e del riempimento, freccia e linea del collegamento, dimensione minima, copia/incolla stile),
  Icone, Nota (con link, data, casella da spuntare, immagini), Struttura (elenco rientrato).
- **Immagini**: dal pulsante 🖼 della barra (o dal menu del nodo, o dal pannello Nota) un'immagine va **accanto al
  nodo** o **dentro il nodo**. Quella accanto è attaccata al nodo e si muove con lui; si trascina dove si vuole, si
  ridimensiona tirando il quadratino nell'angolo (o con + e −), e la disposizione le fa spazio come alle etichette.
  Con l'immagine scelta: Canc la elimina, doppio clic la ingrandisce; dalla sua barretta la rimetti sopra il
  nodo o la porti dentro (e quella dentro si porta fuori dal pannello Nota). Un file trascinato sopra un nodo
  va dentro il nodo; lasciato in un punto vuoto diventa un'immagine accanto al nodo selezionato, proprio lì.
  Nel modello: `figure [{ id, img, larghezza, rapporto, dx, dy }]` sul nodo.
- **Concentrati su questo ramo** (menu del nodo) mostra un solo sottoargomento; **Esporta il ramo come
  immagine** ne fa un PNG. Dal menu ⋯: PNG di tutta la mappa, OPML, copia come elenco rientrato.
- **Assistente** (✨ nella barra): fa sulla mappa tutto quello che fai tu, vedi *Assistente IA*.
- Annulla/Ripeti hanno una storia propria (le modifiche dell'assistente passano anche da `js/storia.js`); il salvataggio è
  automatico mezzo secondo dopo ogni modifica.

## Domande ad albero e studio a cascata

Ogni flashcard può avere una **domanda madre** nello stesso set: si costruiscono catene che vanno
dalla domanda generale su un ramo a quelle sui singoli concetti, fino ai dettagli.

- **Nell'elenco del set** le carte sono rientrate per livello e i rami si aprono e chiudono.
  Con una riga selezionata: `Tab` la rientra sotto la carta sopra, `Maiusc+Tab` la riporta
  indietro, `Alt+↑/↓` la sposta tra le sorelle. Le stesse azioni sono nel menu `⋯` della riga.
- **Nell'editor**: campo *Domanda madre*, pulsanti *Salva e crea un'altra* (stesso livello)
  e *Salva e crea figlia* (un livello sotto).
- **Nello studio**, in ordine del set si va sempre dalla madre alle figlie. Con lo *studio a
  cascata* attivo, una domanda figlia mai vista compare solo dopo che hai imparato la madre;
  appena succede, le figlie arrivano subito dopo nella stessa sessione.
- **All'import** l'albero viene dal file: nel testo dell'app dalle tabulazioni prima di `D:`, nell'Excel
  dell'app dalla colonna *Livello*.
- **Nascondi dettagli** (pagina del set, oppure Impostazioni → Studio → *Carte di dettaglio*): le carte
  con il tag `dettaglio`, e quelle appese sotto, spariscono in tutta l'app da elenchi, conteggi, barre
  di avanzamento, ricerca e studio. Restano salvate: **Mostra dettagli** le fa ricomparire. L'assistente
  le vede comunque (segnate come nascoste) e l'export le comprende.

## Import ed export

**Esporta le flashcard…** (menu ⋯ del set), con o senza i sotto-set:

- **Testo** (`.md`, consigliato): si legge bene e si reimporta. `# set`, `## sotto-set`, `D:` domanda, `R:` risposta
  (le righe sotto senza chiave continuano il campo), `[x]` / `[ ]` risposte a scelta, `Tag:`, `Suggerimento:`,
  `Spiegazione:`; una tabulazione in più prima di `D:` = domanda figlia. `Fonte:`, `Mappa:` e `Stato:` sono solo da
  leggere. Passano grassetto, corsivo ed elenchi; le immagini diventano `[immagine]`. C'è anche **Copia testo**.
- **Excel**: una riga per carta con Set, Livello, Domanda, Risposta, Tag, Suggerimento, Spiegazione, Fonte, Mappa,
  Stato e Prossimo ripasso.

**Importa** (Impostazioni, pagina del set, Crea): il testo o l'Excel esportati dall'app (anche modificati a mano o da
un'IA), oppure CSV / Excel / testo incollato con domanda, risposta, tag, suggerimento, spiegazione. I sotto-set del
file si ritrovano per nome o si creano. Con **Aggiorna le carte che ci sono già** una carta con la stessa domanda di
una del set viene aggiornata e tiene progressi, fonte e mappa (i campi con immagini restano come sono); le altre si
aggiungono. Tutto l'import si annulla con un clic. Le carte a scelta multipla non si creano a mano, ma quelle
importate si studiano e si modificano.

## Ripetizione spaziata

Un solo sistema, lo stesso per le flashcard e per le revisioni: **prossima revisione = ultimo ripasso + intervallo**.
N° Rep conta i ripassi e basta.

**Sequenza** (Impostazioni → Revisioni, predefinita Fibonacci **1, 2, 3, 5, 8, 13, 21**; c'è anche Raddoppio, o la
scrivi tu): ripassando sempre il giorno previsto, dopo la rep 1 aspetti il primo numero, dopo la rep 2 il secondo e
così via; dopo l'ultimo gli intervalli crescono con il rapporto degli ultimi due (Fibonacci: ×1,618 → 34, 55, 89…).
La prima volta che ripassi un set (o una carta) è la rep 1: la successiva è un giorno dopo. Cambiare la sequenza vale
dal prossimo ripasso; **Applica alle revisioni che hai già** ricalcola l'intervallo di ognuno dal suo N° Rep (si annulla
da Modifiche recenti).

**Ritardi e anticipi.** Sia I l'intervallo previsto, P i giorni passati dall'ultimo ripasso e r il ritmo della sequenza
in quel punto (per I = 8 con Fibonacci, 13/8):

| Quando ripassi | Nuovo intervallo (da oggi) | Esempio: I = 8 giorni, Fibonacci |
|---|---|---|
| Il giorno previsto (P = I) | I × r | 13 |
| In ritardo (P > I) | I × r × I / P: più hai aspettato, più la prossima si avvicina | 4 giorni di ritardo → 9 |
| In anticipo (P < I) | I + P × (r − 1): la data prevista più la parte di intervallo "guadagnata" | 4 giorni di anticipo → 11 |
| Lo stesso giorno di un altro ripasso | resta I, e la data non cambia (N° Rep +1) | — |

Arrotondato ai giorni, minimo 1. Se poi torni puntuale, l'intervallo riprende a crescere da dove si trova.

- Valutazioni: **Scarso**, **Ok**, **Buono**, **Perfetto**.
- **Buono** o **Perfetto**: N° Rep +1, ultimo ripasso = oggi, intervallo con la formula. La carta è imparata e nella
  sessione non torna più.
- **Ok**: come sopra ma con metà crescita (r → 1 + (r − 1) / 2: da 8 giorni a 11 invece di 13), così la carta torna un
  po' prima finché non le dai Buono o Perfetto. Nella sessione torna in fondo, per il set resta tra le carte «da
  sistemare» e porta lo stato del set a Ok.
- **Scarso**: N° Rep e ultimo ripasso restano com'erano, l'intervallo **torna indietro di un passo** nella sequenza (da
  8 a 5; con il Raddoppio si dimezza) e la carta è **da ripassare subito** (da oggi; i giorni dopo risulta in ritardo)
  finché non le dai almeno Ok. Quel ripasso la recupera: N° Rep +1, ultimo ripasso = oggi e l'intervallo riparte da
  quello ridotto.
- **Mai valutata, in un set già ripassato** (per esempio aggiunta dopo): come una Scarso, è da ripassare subito,
  dal giorno in cui è entrata nel set (o dall'ultimo ripasso del set, se c'era già e quel ripasso l'ha saltata), e
  in ritardo i giorni dopo, finché non la valuti. Entra in *Ripasso di oggi* e tra le «da ripassare» del set (la
  cascata vale sempre). Le carte dei set mai ripassati restano semplicemente nuove.
- Nella sessione Ok e Scarso tornano **in fondo**, dopo tutte le altre, finché non dai Buono o Perfetto. Puoi
  terminare quando vuoi (✕ o Esc): le carte restano con la valutazione che hai dato.
- Nella stessa sessione solo la prima valutazione di una carta muove N° Rep e date; quelle dopo cambiano solo la
  valutazione. Se la prima era Scarso, la prima volta che la carta arriva almeno a Ok la recupera.
- La **valutazione si cambia a mano** nell'editor della carta, dal menu ⋯ della carta nel set e con più carte
  selezionate (⋯ → *Cambia la valutazione…*): cambia lo stato del set nelle revisioni, non le date. C'è anche
  **Mai valutata**, per correggere una valutazione data per sbaglio: la carta torna tra le nuove.
- **N° Rep, ultimo ripasso, intervallo e prossima revisione si cambiano a mano** in fondo alla pagina della flashcard
  (e nel pannello «Per flashcard»): valgono subito. Per una carta Scarso la data è quella da cui è da rifare.
- Le carte del vecchio sistema (intervalli in stile Vaia) sono state convertite una volta all'avvio: quelle di un
  set con la sua riga nelle revisioni partono allineate a quella.
- Passando all'intervallo come dato a sé (prima era 2^(N° Rep − 1)), set e carte hanno tenuto l'intervallo che
  avevano, quindi nessuna data si è spostata; le carte che erano al passo con il set per N° Rep ne hanno preso data
  e intervallo.

Le formule sono in `js/srs.js` (carte) e `js/revisioni.js` (set, stato dalle carte, pannello delle flashcard).

## Struttura dei file

```
index.html              guscio: barra laterale, barra inferiore, icone, ordine degli script
server.py               server locale senza cache (avviato da Flashcard.bat) e lettura delle cartelle collegate
css/stile.css           colori (chiaro e scuro) e tutti gli stili, divisi per sezione
css/mappe.css           stili della sezione Mappe e del suo editor
js/utili.js             date, testo, file
js/archivio.js          unico accesso a IndexedDB (cache in memoria + scrittura su disco)
js/srs.js               ripetizione spaziata: sequenza degli intervalli, ritardi e anticipi, valutazioni (carte e revisioni)
js/dati.js              modello dei dati: materie, set e sotto-set, carte ad albero, ripassi, esami
js/router.js            navigazione con l'indirizzo dopo il #
js/componenti.js        finestre, menu, avvisi, barre di avanzamento, moduli, riquadro dello studio
js/storia.js            modifiche annullabili (turni dell'assistente, azioni su più carte)
js/revisioni.js         revisioni: tabella modificabile, riga del set aggiornata dallo studio, stato dalle carte,
                        pannello delle flashcard per conto loro, avviso «conta o è una prova» all'avvio dello studio
js/guida.js             guida a passi su flashcard e revisioni, con il simulatore della prossima data
js/selezione.js         selezione di più flashcard e azioni di gruppo
js/ricco.js             editor di testo formattato e pulizia dell'HTML
js/importa.js           import ed export (testo dell'app, Excel, CSV) e backup JSON (file dei materiali compresi)
js/prova.js             dati di prova
js/localizzazione.js    la skill delle flashcard di localizzazione (piano e controlli)
js/materiali.js         materiali dei set: lettura dei file, novità tra versioni, visualizzatore, sezione nel set
js/cartelle.js          cartelle e file collegati ai set (Drive per desktop), ricontrollati ogni 5 secondi
js/mappe/modello.js     mappe mentali: dati, temi, stile dei nodi, operazioni sui rami
js/mappe/disposizione.js disposizioni (fasce senza sovrapposizioni) e forma dei collegamenti
js/mappe/importa.js     import da SimpleMind (.smmx), OPML e testo; export OPML
js/mappe/panoramica.js  la mappa d'insieme «link argomenti» di ogni materia
js/mappe/editor.js      l'editor delle mappe (vista #/mappa/<id>), anche in sola lettura
js/mappe/vista.js       la parte di mappa nelle risposte delle flashcard e la scelta del nodo
js/ia/gemini.js         collegamento a Gemini (chiave, modelli, richieste, file grandi)
js/ia/strumenti.js      le operazioni che l'assistente può fare
js/ia/strumenti-mappe.js le operazioni dell'assistente sulle mappe mentali
js/ia/istruzioni.js     istruzioni di sistema dell'assistente
js/ia/assistente.js     pannello della chat e ciclo agente
js/viste/*.js           una vista per schermata
js/app.js               avvio
```

Per un futuro passaggio al cloud (come per Allenamento con Firebase) basta agganciarsi
a `Archivio.alCambio()`: il resto dell'app non tocca mai il database direttamente.
