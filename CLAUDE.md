# Flashcard: regole per chi cambia il codice

L'app è descritta in [LEGGIMI.md](LEGGIMI.md). Script classici (niente moduli né build) caricati da `index.html`;
dati in `js/dati.js`, `js/mappe/modello.js` e negli altri moduli dei dati; l'assistente Gemini in `js/ia/`.

## Regola dell'utente: l'assistente può tutto quello che può l'utente

Stabilita dall'utente il 21/10/2026, vale per sempre e per ogni modifica, fatta da Claude o dall'utente stesso:

**ogni cosa che l'utente può vedere o modificare nell'app, l'assistente IA deve poterla leggere e modificare.**
Esempio suo: se si aggiungono delle note, l'assistente deve poterle leggere e scriverci.

Quindi, nella stessa modifica che aggiunge un comando o un dato:

- uno strumento dell'assistente che fa la stessa cosa (`js/ia/strumenti.js`, `js/ia/strumenti-mappe.js`), con le
  stesse regole e controlli dell'interfaccia;
- la lettura: le funzioni `…PerIA` passano da `altriDati()`, così i campi nuovi arrivano già all'assistente in
  `altri_dati`; se il campo merita un nome suo, mettilo nella lettura e tra i campi "gestiti";
- le istruzioni dell'assistente (`js/ia/istruzioni.js`), se cambia cosa sa fare;
- la voce nel registro di `test/parita-ia.test.js` (OPERAZIONI, SCRITTURE_DIRETTE, CAMPI).

Esclusioni ammesse, sempre con il motivo scritto nel registro: accesso con Google e cloud, chiave e modello
dell'assistente, file del computer (caricare materiali, importare un file, ripristinare un backup), navigazione e
stato dell'interfaccia (zoom, pannelli aperti, filtri), tour, dati interni dell'app. Se un caso è dubbio, chiedere
all'utente.

## Controllo automatico

```
npm test
```

Lancia i test in `test/` con Node (nessuna dipendenza da installare). `test/parita-ia.test.js` carica l'app in Node
senza browser né login (`test/aiuti/app.js`, dati di prova solo in memoria) e fallisce quando:

1. una funzione dei moduli dei dati che cambia i dati non ha uno strumento dell'assistente né un'esclusione;
2. il codice dell'interfaccia scrive nell'archivio da solo;
3. un campo dei dati (nei dati di prova, negli oggetti nuovi o scritto dal codice) non è registrato con come lo legge
   e come lo scrive l'assistente, o un parametro registrato non esiste più;
4. l'assistente non legge davvero un campo registrato, o non riceve i campi che non conosce;
5. le istruzioni nominano strumenti che non esistono.

Gira da solo:
- dopo ogni modifica di Claude a `Flashcard/js`, `Flashcard/test` o `Flashcard/index.html` (hook in
  `App mie/.claude/hooks/flashcard-controlli.mjs`);
- prima di ogni `firebase deploy` (predeploy in `firebase.json`): se fallisce, la pubblicazione si ferma. Così vale
  anche per le modifiche che l'utente fa da solo.

Se il test fallisce, si sistema il codice (lo strumento o la lettura che mancano), non il test. Il test si cambia solo
se la regola è cambiata davvero, o per registrare un'esclusione con il motivo.

## Prima di pubblicare

Il repository è pubblico su GitHub (ale-pil02/Flashcard): prima di un push serve l'ok dell'utente e un controllo che
non ci siano dati personali o chiavi. Niente merge, `firebase deploy` o `git push` senza l'ok esplicito dell'utente.
