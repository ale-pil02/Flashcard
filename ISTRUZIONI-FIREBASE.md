# Pubblicare Flashcard online con Firebase

Come per Allenamento: un indirizzo web da aprire su PC e telefono, l'accesso con il tuo account Google, i dati
uguali su tutti i dispositivi. In più qui ci sono i file dei materiali (PDF, slide, immagini), che vanno in
**Cloud Storage**: per questo il progetto deve stare sul piano **Blaze** (a consumo, con una carta collegata).
Con l'uso di una persona si resta nella fascia gratuita; l'avviso di spesa del passo 4 ti avverte comunque.

Fino a quando la configurazione non è nell'app (passo 6) Flashcard funziona esattamente come adesso.
Serve una sola volta, circa 20 minuti.

---

## Prima di tutto: una copia di sicurezza

Apri l'app come al solito (`Flashcard.bat`) → **Impostazioni → Backup → Esporta** e tieni da parte il file.
Non dovrebbe servire (al primo accesso i dati salgono da soli, passo 9), ma è la rete di sicurezza.

---

## 1. Crea il progetto Firebase

1. Vai su https://console.firebase.google.com e accedi col tuo account Google
2. **Crea un progetto** → nome `flashcard-ale` → puoi disattivare Google Analytics
3. Sotto il nome Firebase mostra l'**ID del progetto**: se `flashcard-ale` era già preso sarà un po' diverso
   (es. `flashcard-ale-1a2b3`). Segnatelo: serve al passo 6.

## 2. Attiva l'accesso con Google

1. Menu a sinistra → **Build** (Crea) → **Authentication** → **Inizia**
2. Scheda **Metodo di accesso** → **Google** → attiva l'interruttore
3. Scegli la tua email come email di assistenza → **Salva**

`localhost` è già tra i domini autorizzati: così funziona anche l'app aperta da `Flashcard.bat`.

## 3. Crea il database

1. Menu a sinistra → **Build** → **Firestore Database** → **Crea database**
2. Località: `eur3 (europe-west)`
3. Modalità **produzione** (le regole le carichiamo noi al passo 8)

## 4. Passa al piano Blaze e metti un avviso di spesa

1. In basso a sinistra, accanto a "Spark", **Esegui l'upgrade** → **Blaze** → collega una carta
2. Ti propone di impostare un **budget**: mettine uno basso, per esempio **1 €**. È solo un avviso via email
   (non blocca niente), ma ti dice subito se qualcosa consuma più del previsto.

## 5. Attiva Cloud Storage

1. Menu a sinistra → **Build** → **Storage** → **Inizia**
2. Località del bucket: **US-CENTRAL1** (oppure US-EAST1 o US-WEST1) se vuoi la fascia gratuita, che c'è solo
   in queste tre regioni. Una regione europea (per esempio EUROPE-WEST1, Belgio) va bene lo stesso, ma si paga
   da subito: circa 2 centesimi di dollaro al mese per GB di file, più i download. **La località non si può
   cambiare dopo.**
3. Modalità **produzione** → **Crea**

## 6. Registra l'app web e passami la configurazione

1. In alto a sinistra ⚙️ → **Impostazioni progetto** → scheda **Generale**
2. In fondo, **Le tue app** → icona **`</>`** (Web) → nickname `Flashcard` → **non** spuntare Firebase Hosting
   qui → **Registra app**
3. Compare un blocco `const firebaseConfig = { apiKey: …, authDomain: …, projectId: …, storageBucket: …,
   messagingSenderId: …, appId: … }`: **incollamelo in chat** e lo metto io nell'app (`js/cloud.js`), insieme
   all'ID del progetto in `.firebaserc` e `cors.json`.

> I valori della configurazione sono pubblici per definizione: vengono spediti al browser di chiunque apra la
> pagina, non sono una password. A proteggere i dati sono le regole del passo 8, che li legano al tuo account.

## 7. Permetti al sito di scaricare i file (CORS)

Il browser scarica i file da Cloud Storage solo se il bucket lo permette al sito. Si fa una volta, dal browser:

1. Apri https://console.cloud.google.com e in alto scegli il progetto `flashcard-ale`
2. In alto a destra l'icona **Attiva Cloud Shell** (un terminale nel browser) → **Continua**
3. Incolla questi due comandi (sostituisci `flashcard-ale` con il tuo ID, se è diverso), uno alla volta:

```bash
echo '[{"origin":["https://flashcard-ale.web.app","https://flashcard-ale.firebaseapp.com","http://localhost:8010"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
```

```bash
gcloud storage buckets update gs://flashcard-ale.firebasestorage.app --cors-file=cors.json
```

Il nome del bucket (`flashcard-ale.firebasestorage.app`) è quello che Firebase mostra in cima alla pagina
**Storage**, dopo `gs://`. Lo stesso contenuto è nel file `cors.json` della cartella.

## 8. Pubblica il sito e le regole

Apri il **Prompt dei comandi** nella cartella `Desktop\App mie\Flashcard` ed esegui, una riga alla volta
(`firebase-tools` l'hai già installato per Allenamento):

```bash
firebase login
```

```bash
firebase deploy
```

Pubblica il sito, le regole del database (`firestore.rules`) e quelle dei file (`storage.rules`). Al termine il
terminale mostra l'indirizzo, tipo `https://flashcard-ale.web.app`.

## 9. Primo accesso: dal PC, con Flashcard.bat

1. Chiudi la finestra nera di Flashcard (se è aperta) e riapri **`Flashcard.bat`**: così parte il server aggiornato
2. Compare la schermata **Accedi con Google**: accedi
3. Il cloud è vuoto, quindi ci salgono i dati di questo browser, file compresi: **Impostazioni → Cloud** mostra
   l'avanzamento, poi "Sincronizzato"

Poi apri l'indirizzo del sito **sul telefono**, accedi con lo stesso account e ritrovi tutto. Da Chrome,
menu **⋮ → Aggiungi a schermata Home** e si comporta come un'app. Anche sul PC puoi usare il sito al posto di
`Flashcard.bat`: l'unica differenza è che solo da `Flashcard.bat` c'è "Apri con il programma del computer".

> Fai il primo accesso dal browser che ha i tuoi dati (quello di `Flashcard.bat`). Se un dispositivo ha dei dati
> suoi e anche il cloud ne ha, l'app chiede se usare quelli del cloud o unirli.

La chiave di Gemini resta su ogni dispositivo: sul telefono reinseriscila in **Impostazioni → Assistente IA**.

---

## Dopo ogni modifica all'app

Le modifiche al codice arrivano online solo ripubblicando. Dalla cartella `Flashcard`, come per Allenamento:

```bash
firebase deploy
```

Ripubblica il sito e ricarica le regole (uguali a prima, non cambia niente). Con `firebase deploy --only hosting`
ripubblichi solo il sito: è un po' più veloce, ma il risultato è lo stesso.

`Flashcard.bat` invece usa sempre i file della cartella: lì basta ricaricare la pagina.

---

## Accesso privato

- `firestore.rules` e `storage.rules` accettano letture e scritture **solo** dall'account indicato nella funzione
  `proprietario` (oggi `alessandropillot01@gmail.com`). Per cambiarlo, modifica l'email in tutti e due i file e
  rilancia `firebase deploy`.
- All'apertura la pagina resta coperta dalla schermata di accesso finché il server non conferma l'account. Un
  altro account viene disconnesso subito.
- Un browser già verificato si apre direttamente, anche senza rete. **Impostazioni → Cloud → Esci** blocca di
  nuovo la pagina fino al prossimo accesso.

## Cosa cambia nell'uso

| | Prima | Ora |
|---|---|---|
| PC e telefono | solo il PC | tutti i dispositivi, allineati da soli |
| Senza rete | funziona | funziona, e sincronizza al ritorno del segnale |
| File dei materiali | nel browser | anche in Cloud Storage; su un nuovo dispositivo si scaricano quando li apri |
| Cartelle collegate (Drive) | c'erano | tolte: si carica una copia, e ⋯ → *Carica una nuova versione* quando cambia |
| Apri con il programma del computer | sì | solo da `Flashcard.bat` |
| Backup JSON | unica rete di sicurezza | resta disponibile, ora è un extra |

**Cosa NON viene sincronizzato**, di proposito: la chiave di Gemini (privata, su ogni dispositivo), le Modifiche
recenti (Annulla) e le preferenze della vista (colonne, sezioni aperte, filtri, larghezza del pannello).

## Se qualcosa non va

- **Impostazioni → Cloud** dice cosa sta succedendo; un pallino rosso accanto a Impostazioni nel menu segnala un
  errore. **Sincronizza ora** riprova subito.
- **I PDF non si aprono sul telefono** (ma sul PC sì): manca il passo 7 (CORS).
- **"Accesso non riuscito"** su `Flashcard.bat`: apri l'app da `http://localhost:8010` (non `127.0.0.1`).
- **`firebase deploy` dice che `.firebaserc` punta a un altro progetto**: l'ID in `.firebaserc` deve essere quello
  del passo 1 (lo sistemo io quando mi passi la configurazione).
