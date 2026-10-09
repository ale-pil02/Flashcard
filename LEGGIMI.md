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
(si tolgono con **Rimuovi**, che lascia intatto il resto). Ogni set di prova ha uno scenario delle revisioni (mai
ripassato, puntuale oggi, in ritardo, in anticipo, già ripassato oggi, in attesa) con lo storico coerente, e ci sono
flashcard Ok, Scarso, aggiunte dopo, ripassate per conto loro e collegate alla mappa. Dopo il caricamento l'app propone
un **tutorial interattivo** che gira nelle pagine vere usando proprio quegli scenari (`js/tour.js`; si riapre da
Impostazioni → Dati di prova → Tutorial).

## Cosa c'è

| Area | Cosa fa |
|---|---|
| **Home** | Revisioni di oggi, set recenti, prossimi esami (niente obiettivo giornaliero né giorni di fila: tolti su richiesta) |
| **Libreria** | Materie → set → sotto-set → flashcard, con ricerca su tutto il testo |
| **Set** | Avanzamento (Perfetto / Buono / Ok / Scarso / Mai studiate), riquadro con le carte da fare e **Personalizza** (il pulsante Studia non c'è più: lo studio parte dalle revisioni), sotto-set, revisioni, materiali, elenco delle carte ad albero. Sotto-set, Revisioni, Materiali e Flashcard si aprono e chiudono con un clic sul titolo (lo stato resta per tutti i set) |
| **Selezione** | Nel set e nella ricerca: più flashcard insieme → tag, domanda madre, sposta, valutazione, progressi, assistente, elimina |
| **Studio** | Una sola modalità: domanda → mostra risposta → Scarso / Ok / Buono / Perfetto (Ok e Scarso tornano in fondo); sotto la risposta, la parte di mappa collegata; a fine sessione si aggiornano le revisioni |
| **Revisioni** | Ripasso dei set e dei mazzi come nel database "Spaced Repetition System" di Notion, a intervalli crescenti (Fibonacci, modificabile) che si adattano a ritardi e anticipi, più il pannello delle flashcard da ripassare per conto loro: sezione propria e, in ogni set, quelli del set. Guida «Come funziona» con simulatore |
| **Sessione personalizzata** | Scegli uno o più set, lo stato delle carte, i tag, quante carte e l'ordine |
| **Editor** | Domanda, risposta, fonte della risposta, parte della mappa, domanda madre, suggerimento, spiegazione, tag, immagini |
| **Statistiche** | Carte di oggi, tempo di studio, grafico giornaliero, calendario, avanzamento per materia |
| **Piano di studio** | Date degli esami con conto alla rovescia, collegate alle materie |
| **Impostazioni** | Nome, carte per sessione (anche senza limite), ordine, studio a cascata, carte di dettaglio, sequenza delle revisioni, assistente IA, tema, import, backup, dati di prova e tutorial |
| **Materiali** | In ogni set: PDF, slide, mappe mentali, Word, PowerPoint, immagini, testi e note, anche da una cartella o da file collegati (Drive) |
| **Assistente IA** | Gemini: fa le operazioni dell'app, risponde sui materiali, crea flashcard per profondità |
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
  flashcard per profondità fatte da una mappa dell'app (`prepara_piano_localizzazione` con `mappa_id`, o dal
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
  per la chat del set, per la creazione flashcard per profondità e come fonte delle revisioni. All'avvio l'app riallinea
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
- **Creazione flashcard per profondità** (la skill *creatore-flashcard-mappe-mentali*, prima chiamata
  *localizzazione*): si avvia solo su richiesta, con `/profondita` nella chat (va ancora anche il vecchio
  `/localizzazione`) o con il pulsante **Creazione flashcard per profondità** sul materiale. La parte meccanica
  (albero, tag, piano, foglie assorbite, catene, controlli sulle domande) è in `js/localizzazione.js`
  e dà gli stessi risultati degli script Python della skill; l'IA scrive solo le domande. Le carte
  nascono già ad albero e si studiano a cascata. Unica differenza voluta dalla skill: il numero di
  *concetto N* segue l'albero delle carte, non la profondità del nodo nella mappa. Quando un sottoramo ha un
  solo figlio i due diventano una carta sola, e sotto di lei ci sono comunque i *concetto 1* (prima diventavano
  *concetto 2*; le carte già fatte sono state corrette una volta all'avvio, annullabile da Modifiche recenti).
- **Flashcard dai nodi di una mappa**: nell'editor della mappa scegli uno o più nodi e premi il pulsante delle carte
  nella barra (o *Flashcard* nella finestrella dei nodi scelti, o il menu ⋯ del nodo). Scegli il set, se tenere anche i
  rami sotto ai nodi e se saltare i nodi che nel set hanno già una carta: l'app prepara il piano della creazione per profondità
  su tutta la mappa (così tag, risposte e madri restano giusti) e tiene solo le carte di quei nodi; l'assistente scrive
  le domande e crea le carte, collegate ai loro nodi. Una carta la cui madre resta fuori va sotto la carta che il set
  ha già per quel nodo, quindi i rientri restano anche facendo la mappa a pezzi.

Le istruzioni dell'assistente (carattere, regole per le flashcard, procedura della skill) sono in
`js/ia/istruzioni.js`; gli strumenti che può usare in `js/ia/strumenti.js` (e per le mappe in `js/ia/strumenti-mappe.js`).

## Revisioni (dal database di Notion)

I set (e, a mano, anche altri **mazzi**: capitoli, schemi, gruppi di flashcard) si ripassano con lo stesso metodo del
database "Spaced Repetition System" di Notion. Ogni riga è un mazzo (nel codice e nel backup si chiamano ancora
*argomenti*) e ha:

| Colonna | Cosa contiene |
|---|---|
| Mazzo | Il nome (di solito il set, il capitolo o lo schema) |
| Schema / fonte | Testo libero e i materiali collegati, da aprire con un clic (🔗 per collegarne o toglierne) |
| N° Rep | Quante volte l'hai ripassato. Cambiandolo a mano l'intervallo torna quello della sequenza per quella rep (come in Notion) |
| Ultimo ripasso | La data dell'ultimo ripasso |
| Intervallo | Giorni dall'ultimo ripasso alla prossima revisione, aggiornato a ogni ripasso (vedi *Ripetizione spaziata*) |
| Prossima revisione | Ultimo ripasso + intervallo; scegliendo la data a mano l'intervallo si adegua |
| Alert | 🔴 *Da ripassare (N giorni)* se è in ritardo, 🟡 *Ripassare oggi*, 🟢 *Attendi N giorni* |
| Stato | Ottimo, Buono, Ok, Scarso o Incompleto (non cambia gli intervalli) |

**Nuovo mazzo**: scegli il set (dalla pagina del set è già scelto), il nome e le sue flashcard: **tutte quelle del
set** (anche quelle che aggiungerai; una sola riga così per set), **tutte quelle che ci sono adesso** (quelle aggiunte
dopo no) oppure **solo alcune**, da spuntare nell'elenco ad albero (una domanda porta con sé le sue figlie). Un mazzo con le flashcard funziona come la riga del set qui sotto,
ma solo con le sue carte: stato, pulsante Ripasso, N° Rep a fine sessione e pannello «Per flashcard». Accanto al nome
c'è «N di M flashcard»: clic (o ⋯ → *Flashcard del mazzo…*) per cambiarle. Un set studiato che ha già mazzi
con le flashcard non riceve una riga del set in più.

**Riga del set, aggiornata dallo studio.** Ogni set con flashcard ha la sua riga (la crea lo studio, oppure prende
quella che c'è già: con il nome del set o l'unica del set). Quando finisci una sessione, o la termini con ✕ / Esc:
- per ogni set studiato, separatamente (anche se ne studi più insieme, e i sotto-set per conto loro):
  se hai valutato **tutte** le carte del set è un ripasso: N° Rep +1, Ultimo ripasso = oggi e il nuovo intervallo
  (in anticipo o in ritardo si adatta, in ritardo secondo lo stato con cui esce il set; un altro ripasso lo stesso
  giorno fa solo N° Rep +1 e la data resta). Le carte valutate **Buono** o **Perfetto** prendono ultimo ripasso e
  intervallo del set e restano al suo passo, tranne quelle che all'inizio della sessione erano **nuove** o **Scarso**
  (dopo un primo incontro o un errore l'intervallo lungo del set sarebbe troppo); quelle, come le **Ok** e **Scarso**,
  seguono le loro regole e finiscono nel pannello «Per flashcard». Se ne hai valutate solo alcune, la fine
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

**Ripassa più set** (sezione Revisioni, pannello *Per set*, e Home): scegli quali set ripassare (quelli da ripassare
oggi sono già spuntati) e se le carte vanno **in ordine**, un set dopo l'altro, o **mescolate**: le carte dei set si
alternano lungo tutta la sessione (in proporzione, anche se i set hanno grandezze diverse), mentre dentro ogni set
l'ordine e la cascata restano. Alternare argomenti simili aiuta a distinguerli. Ogni set di cui valuti tutte le carte
conta come ripasso del set.

**Ripasso effettivo o di prova?** Ogni volta che avvii uno studio l'app chiede: **Ripasso effettivo** oppure **Ripasso
di prova**, e dice com'è messo rispetto al giorno previsto. Se la sessione è il ripasso completo di uno o più set parla
dei set: per quelli fuori giorno (in anticipo, in ritardo o già ripassati oggi) mostra la linea del tempo (ultimo
ripasso, data prevista, oggi) e, se sono in ritardo, la prossima revisione per ogni esito (Ottimo, Buono, oppure Ok,
Scarso o incompleto); per quelli puntuali o alla prima volta, in breve, il N° Rep e la prossima revisione che avranno.
Le loro carte seguono le loro regole. Nelle sessioni per singole carte (⚡ della carta, *Ripassa le sfasate da fare*,
*Solo quelle*, *Studio libero*) parla delle carte: quante sono fuori giorno e quante nel giorno previsto o nuove. Il
ripasso effettivo aggiorna valutazioni, N° Rep e date; quello di prova non cambia niente, né per il set né per le
carte (valutazioni, N° Rep, date, stato); tempo e risposte vanno lo stesso nelle statistiche. Le modifiche a mano
valgono sempre.

**Dopo l'esame.** Se la prossima revisione di un set o di una carta cade dopo il prossimo esame della sua materia
(Piano di studio), accanto alla data compare «dopo l'esame», e lo stesso nella pagina della carta, a fine sessione e
nella finestra qui sopra. L'app non sposta la data: decidi tu se anticiparla.
I ripassi si annullano dall'avviso, dal menu ⋯ della riga (*Annulla l'ultimo ripasso*) o da Modifiche recenti;
nel menu c'è anche la cronologia dei ripassi.

**Pannello «Per flashcard»** (nella sezione Revisioni e nella pagina di ogni set). Ogni carta ha la stessa ripetizione
del set (vedi *Ripetizione spaziata*), con il suo N° Rep. Il pannello mostra **tutte** le flashcard, nell'ordine dei set,
con la colonna **Rispetto al set**: *Al passo con il set*, *Set mai ripassato*, *Mai valutata*, *Scarso: da rifare*,
oppure *N giorni prima / dopo il set* (con *(Ok)* se è stata valutata Ok). **Solo sfasate** lascia le carte dei set già
ripassati che non vanno al passo con il loro set (o mazzo), le più urgenti prima: mai ripassate (aggiunte dopo) o
con la prossima revisione in un giorno diverso da quella del set (valutate Ok o Scarso, ripassate per conto loro,
cambiate a mano). Si modificano come le righe (valutazione, N° Rep, ultimo ripasso, intervallo, prossima revisione),
⚡ ripassa una carta, **Ripassa le sfasate da fare** le prende tutte, **Studio libero** ti fa scegliere cosa studiare. Il ripasso dal pannello non conta come ripasso del set, ma aggiorna le carte. Una carta torna al passo
quando la valuti Buono o Perfetto nel ripasso completo del set. **Riadegua al set** (nella riga) lo fa subito: la carta
prende ultimo ripasso e intervallo del set (la stessa prossima revisione) ed esce dall'elenco, anche se è Scarso o mai
valutata; valutazione e N° Rep restano i suoi (quindi lo stato del set non cambia). Si annulla dall'avviso.
**Carte in più mazzi.** Una flashcard sta sempre in un solo set, ma può stare in più mazzi dello stesso
set: la riga di tutto il set e quelli con alcune flashcard. Ha una sola data, quindi **segue un mazzo solo**: quello
scelto con *Riadegua…*, se no il primo mazzo con alcune flashcard che la contiene (già ripassato), se no la riga del set.
Si allinea solo al mazzo che segue, e *Solo sfasate* guarda lui. La colonna *Rispetto al set* lo nomina («2 giorni
prima di «Mazzo A»») e sotto, più piccolo, dice come sta rispetto agli altri mazzi (*anche in «Bowlby» (tutto il set):
al passo*). In questi casi il pulsante diventa **Riadegua…** e fa scegliere il mazzo: la carta prende la sua data e da
lì in poi segue lui (`srs.segue`). Quando scegli le flashcard di un mazzo, l'app avvisa se alcune sono già in un altro
mazzo con alcune carte.
- Tutte le celle si modificano sul posto, come in Notion; un clic sull'intestazione ordina la colonna (crescente →
  decrescente → ordine di partenza), anche nel pannello *Per flashcard*.
- **Studio libero** (pannello *Per flashcard*, nella sezione Revisioni e nella pagina di ogni set): per quando hai un
  po' di tempo. Scegli **quanto** (10, 20, 30, 45 minuti, tutte, oppure un numero di carte: il tempo si stima dalla
  mediana delle tue ultime risposte, circa 25 secondi a carta se non ce ne sono), **quali** (da ripassare, sfasate,
  mai valutate, Scarso, Ok, Buono, Perfetto; nessuna scelta = tutte), di **quali set** (nella sezione Revisioni sono già
  scelti quelli del filtro) e l'**ordine** (prima le più urgenti, prima le più deboli, come nei set, mescolate).
  L'elenco della sessione si ritocca a mano. All'avvio si sceglie ripasso effettivo (aggiorna le flashcard, non il N°
  Rep dei set) o di prova.
- **Filtri** (sezione Revisioni, sopra la tabella, in *Per set* e in *Per flashcard*): **Set** (uno o più),
  **Stato** (Revisione: in ritardo, da fare oggi, in attesa, mai ripassati; nei set lo Stato, nelle flashcard la
  Valutazione e *Rispetto al set*; dentro un gruppo basta una scelta, tra gruppi servono tutte), **Ordina** per
  prossima revisione, ultimo ripasso, intervallo, N° Rep, nome, set, stato, in ordine **crescente o decrescente** (le
  righe senza quel dato vanno in fondo), **Colonne** da nascondere (la prima resta). Accanto compare *N di M* e
  **Azzera filtri**. I filtri valgono finché l'app è aperta; ordine e colonne nascoste restano in questo browser.
  *Ripassa le sfasate da fare* prende solo le carte filtrate.
- **Larghezza delle colonne**: si trascina il bordo destro dell'intestazione; doppio clic per tornare alla
  larghezza predefinita (tutte insieme: menu ⋯ della sezione Revisioni). Valgono in ogni tabella delle revisioni.
- **Sezione Revisioni** (nel menu, con il numero di quelli da fare, flashcard comprese): pannelli *Per set* e
  *Per flashcard*, schede *Tutte*, una per materia e *Da ripassare*. È l'unico posto dove si cambia il set di una
  riga; dal menu ⋯ *Un mazzo per ogni set* crea in un colpo le righe dei set che non ne hanno.
- **Nella pagina di un set** ci sono solo i mazzi di quel set e dei suoi sotto-set, con i pannelli *Per mazzo* e
  *Per flashcard*: lì si modificano, ma non si vedono né si toccano quelli degli altri set.
- **Come funziona** (in alto nella sezione Revisioni, o Impostazioni → Revisioni) apre una guida a passi su
  flashcard, valutazioni e revisioni, con un simulatore della prossima data (`js/guida.js`).
- In **Home** compaiono i mazzi da rivedere oggi e quante flashcard sono da ripassare per conto loro.
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
mappe e nella barra dell'editor ha l'etichetta *d'insieme*. Se la elimini, nell'elenco delle mappe compare il riquadro
**Crea «link argomenti»** per ricrearla (i nodi tornano dalle mappe della materia; aspetto e aggiunte fatte lì no).

La **freccia indietro** dell'editor torna alla pagina da cui si è aperta la mappa (per esempio i materiali del set o la
«link argomenti»), come il tasto Indietro; dallo studio o senza pagina precedente va all'elenco delle mappe.

L'editor (rotta `#/mappa/<id>`):

- **Tastiera**: Tab figlio, Invio fratello, F2 o doppio clic per scrivere (o si comincia a scrivere e basta),
  Maiusc+Invio per andare a capo, Canc elimina, frecce per spostarsi, Alt+↑/↓ riordina, Spazio apre/chiude
  il ramo, Ctrl+Z/Y, Ctrl+C/X/V (si incollano anche elenchi rientrati da altri programmi), Ctrl+B/I/U,
  Ctrl+Alt+C / Ctrl+Alt+V copia e incolla lo stile, Ctrl+F cerca, Ctrl+0 adatta. Nel testo: `**grassetto**`, `*corsivo*`, `__sottolineato__`, `~~barrato~~`.
- **Mouse e touch**: trascina lo sfondo per spostarti, rotellina (o due dita) per lo zoom, Maiusc+rotellina
  per scorrere, doppio clic sullo sfondo per un nodo libero. **Finestra di selezione**: tieni premuto Ctrl (o
  Maiusc) e trascina dallo sfondo: compare un riquadro, come sul desktop di Windows, e si aggiungono alla selezione
  i nodi che tocca (mentre trascini sono già evidenziati).
  Trascinando un nodo su un altro lo si sposta sotto di lui, sopra o sotto un fratello per riordinarlo;
  i rami principali si spostano anche da un lato all'altro.
- **Maniglie** attorno al nodo scelto: ⋯ menu, T etichetta, + figlio, ↗ collegamento a un altro nodo,
  ▾ chiudi ramo, e sopra il nodo la **disposizione dei suoi figli**: ogni nodo può averne una sua (orizzontale,
  a destra, a sinistra, verticale, capovolta, lineare, radiale, libera) o seguire quella del padre; per la radice
  è quella di tutta la mappa. Nella disposizione libera ogni nodo ricorda la distanza dal genitore: spostando un
  nodo si sposta tutto il suo ramo, e portandolo dall'altra parte del genitore il ramo si ribalta. La linea verso
  un figlio si attacca sempre di lato (a destra o a sinistra), anche se il figlio sta sopra o sotto il genitore;
  sopra o sotto solo se quel figlio dispone i suoi in verticale o capovolti.
- **Trascinamento**: mentre trascini si muovono in diretta il nodo, il suo ramo e tutte le linee. Con Ctrl+clic
  si scelgono più nodi (un altro Ctrl+clic ne toglie uno): trascinandone uno si spostano tutti insieme.
- **Più nodi scelti**: compare una barra con **Disposizione** (la disposizione dei figli di tutti i nodi scelti,
  in un colpo solo e con un solo Ctrl+Z; se c'è la radice cambia quella della mappa), Flashcard, Figlio comune e Graffa.
- **Figlio comune e graffa**: dalla barra dei nodi scelti (anche nel menu del nodo).
  **Figlio comune** crea un nodo collegato a tutti: se i nodi sono fratelli il nuovo nodo sta oltre di loro, a
  metà della loro altezza, con una linea da ognuno; se non lo sono sta sotto il primo scelto e gli altri hanno una
  linea in più verso di lui. **Graffa** (solo fratelli) li raccoglie con una parentesi graffa che porta al nuovo
  nodo, come il riepilogo di XMind. Cliccando quelle linee si passa da linee a graffa, si toglie un nodo dal
  raccordo o una linea in più. Nel modello: `raccordo { nodi, graffa }` e `legami [id]` sul nodo.
- **Linee**: clicca una linea per sceglierla; nel pannello Stile ne cambi forma (curva, ad angolo, angolo
  arrotondato, dritta), tratto (affusolata automatica, affusolata, piena, a trattini, a punti), spessore, frecce
  all'inizio e alla fine e colore, anche per tutto il ramo. L'affusolata automatica si assottiglia a ogni livello
  senza scendere sotto lo spessore minimo; forma e misure di base sono in Disposizione e tema → Linee.
  **Il percorso della linea lo decidi tu**: trascinando un punto qualsiasi della linea scelta aggiungi lì un **punto
  di passaggio**; i pallini pieni sono i punti (si spostano), quelli vuoti a metà di ogni tratto ne aggiungono un
  altro. **Togliere un punto** senza rifare la linea: cliccalo (diventa rosso, con una × accanto) e premi Canc o la
  ×, oppure doppio clic sul punto, oppure clic destro → *Togli questo punto* (o *Togli tutti i punti*); gli altri
  punti restano dove sono, e Ctrl+Z lo rimette. La linea passa da tutti con una curva morbida, resta attaccata ai due nodi e,
  quando si spostano, si sposta, gira e si allunga con loro mantenendo la forma (`percorso [{ u, v }]` sul nodo:
  posizione lungo il segmento tra i due attacchi e di lato). **Raddrizza la linea** la riporta normale, e cambiando
  disposizione o forma le linee del ramo tornano normali. Lo stesso per i **collegamenti tra rami** (`percorso` sul
  collegamento, rispetto ai centri dei due nodi): il loro testo sta a metà e trascinandolo si sposta il punto di
  mezzo. Le linee piegate col vecchio sistema (un solo punto, `piega` / `curva`) diventano una linea con un punto
  appena le tocchi.
- **Pannelli** (barra in alto): Disposizione e tema (orizzontale, verticale, capovolta, lineare, radiale,
  libera; rami a destra/sinistra/automatici; spaziatura; linee della mappa; 4 temi di serie e quelli tuoi, creati
  con **Nuovo tema** partendo dall'aspetto della mappa e salvati nelle impostazioni, quindi validi per tutte le mappe), Stile (carattere, forma, bordo, colori
  del ramo e del riempimento, freccia e linea del collegamento, dimensione minima, copia/incolla stile),
  Icone, Nota (con link, data, casella da spuntare, immagini), Struttura (elenco rientrato).
- **Immagini**: dal pulsante 🖼 della barra (o dal menu del nodo, o dal pannello Nota) un'immagine va **libera,
  agganciata al nodo**, o **dentro il nodo**. Quella libera segue il suo nodo quando il nodo si sposta, ma non occupa
  spazio nella disposizione: spostandola non sposti i nodi. Si trascina dove si vuole e si ridimensiona tirando il
  quadratino nell'angolo (o con + e −). Con l'immagine scelta: Canc la elimina, doppio clic la ingrandisce; dalla sua
  barretta la porti dentro il nodo (e quella dentro si porta fuori dal pannello Nota). Un file trascinato sopra un
  nodo va dentro il nodo; lasciato in un punto vuoto diventa un'immagine libera del nodo selezionato, proprio lì. Le
  immagini delle mappe vecchie che occupano spazio restano come sono; con 🔗 nella loro barretta diventano libere.
  Per eliminarle: Canc o 🗑 sull'immagine scelta, la × sulla sua miniatura nel pannello Nota, oppure **Elimina le
  immagini del nodo** (menu del nodo, anche su più nodi scelti) o **Elimina tutte** nel pannello Nota: toglie le
  immagini libere e quella dentro il nodo (Ctrl+Z annulla).
  Nel modello: `figure [{ id, img, larghezza, rapporto, dx, dy, fluttuante }]` sul nodo.
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
- **Sorelle mescolate** (Impostazioni → Studio → *Ordine delle carte*: *Ordine del set, sorelle mescolate*): la madre
  resta prima delle sue figlie e di tutto il suo ramo, ma le domande con la stessa madre (es. i sottorami) escono in
  ordine casuale: 4, poi il suo ramo, poi 1, poi 3… I set restano uno dopo l'altro (o alternati, con *Ripassa più set*
  mescolati). Vale anche per la singola sessione: nella finestra di avvio c'è la casella **Mescola le domande
  sorelle**, spuntata se l'impostazione è quella; c'è quando la sessione va nell'ordine del set, quindi anche nei
  ripassi delle Revisioni e nello Studio libero *Come nei set*.
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
Nei ripassi l'intervallo dipende anche da quando ripassi (ritardi e anticipi), non solo dal N° Rep; cambiando il N° Rep
a mano l'intervallo torna quello della sequenza per quella rep (rep 4 → 5 giorni, rep 5 → 8…).

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
| In ritardo, Perfetto (set Ottimo) | P × r: conta tutto il tempo passato, perché ricordare dopo più tempo dice che la memoria è solida | 4 giorni di ritardo → 20 |
| In ritardo, Buono (set Buono) | (I + ritardo / 2) × r: conta metà del ritardo | 4 giorni di ritardo → 16 |
| In ritardo, Ok (set Ok, Scarso o Incompleto) | I × r × I / P: più hai aspettato, più la prossima si avvicina | 4 giorni di ritardo → 7 per una carta Ok (metà crescita, per difetto), 9 per un set Ok |
| In anticipo (P < I) | I + P × (r − 1): la data prevista più la parte di intervallo "guadagnata" | 4 giorni di anticipo → 11 |
| Lo stesso giorno di un altro ripasso | resta I, e la data non cambia (N° Rep +1) | — |

Arrotondato ai giorni, minimo 1. Se poi torni puntuale, l'intervallo riprende a crescere da dove si trova. Per il
ritardo vale l'esempio di Anki: un richiamo riuscito dopo più tempo rafforza di più, mentre se è andata così così nel
frattempo hai dimenticato qualcosa. Una carta mai valutata (anche riadeguata al set) parte sempre dal primo intervallo.

- Valutazioni: **Scarso**, **Ok**, **Buono**, **Perfetto**.
- **Buono** o **Perfetto**: N° Rep +1, ultimo ripasso = oggi, intervallo con la formula. La carta è imparata e nella
  sessione non torna più.
- **Ok**: come sopra ma con metà crescita (r → 1 + (r − 1) / 2, arrotondato per difetto: da 8 giorni a 10 invece di 13;
  da 2 a 2 invece di 3), così la carta torna sempre un po' prima finché non le dai Buono o Perfetto. Nella sessione torna in fondo, per il set resta tra le carte «da
  sistemare» e porta lo stato del set a Ok.
- **Scarso**: N° Rep e ultimo ripasso restano com'erano, l'intervallo **scende a un terzo** (da 34 giorni a 11, da 8
  a 3: dopo un errore servono intervalli corti per un po') e la carta è **da ripassare subito** (da oggi; i giorni dopo risulta in ritardo)
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
js/filtri-revisioni.js  filtri della sezione Revisioni: set, stato, ordine, colonne nascoste
js/studio-libero.js     studio libero: scegli quanto tempo e quali flashcard studiare
js/revisioni.js         revisioni: tabella modificabile, riga del set aggiornata dallo studio, stato dalle carte,
                        pannello delle flashcard per conto loro, domanda «effettivo o di prova» all'avvio dello studio
js/guida.js             guida a passi su flashcard e revisioni, con il simulatore della prossima data
js/tour.js              tutorial interattivo nelle pagine vere, sui dati di prova
js/selezione.js         selezione di più flashcard e azioni di gruppo
js/ricco.js             editor di testo formattato e pulizia dell'HTML
js/importa.js           import ed export (testo dell'app, Excel, CSV) e backup JSON (file dei materiali compresi)
js/prova.js             dati di prova: un set per ogni scenario delle revisioni, con storico coerente
js/localizzazione.js    la creazione flashcard per profondità (piano e controlli)
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
