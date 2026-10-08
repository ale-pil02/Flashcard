// Impostazioni e profilo: nome, ritmo di studio, tema, backup e gestione dei dati.
// Ogni modifica si salva da sola.

Viste.impostazioni = {
    nav: 'impostazioni',
    titolo: 'Impostazioni',

    mostra(el) {
        const ico = Ui.ico;
        const imp = Dati.impostazioni();
        const numeroCampo = (nome, etichetta, aiuto, min, max) => `
            <label class="impostazione">
                <span><b>${etichetta}</b><small>${aiuto}</small></span>
                <input type="number" name="${nome}" min="${min}" max="${max}" step="1" value="${imp[nome]}">
            </label>`;

        el.innerHTML = `
            <div class="pagina pagina-stretta">
                <header class="pagina-testa"><h1>Impostazioni</h1></header>

                <section class="riquadro gruppo-impostazioni">
                    <h3>${ico('stella')}Profilo</h3>
                    <label class="impostazione">
                        <span><b>Il tuo nome</b><small>Per il saluto nella home</small></span>
                        <input type="text" name="nome" maxlength="40" value="${esc(imp.nome)}" placeholder="Come ti chiami?">
                    </label>
                </section>

                <section class="riquadro gruppo-impostazioni">
                    <h3>${ico('fulmine')}Studio</h3>
                    ${numeroCampo('nuovePerSessione', 'Carte nuove per sessione', 'Quante carte mai viste entrano in una sessione di studio', 0, 500)}
                    ${numeroCampo('maxPerSessione', 'Carte massime per sessione', 'Limite complessivo di una sessione', 1, 1000)}
                    <label class="impostazione">
                        <span><b>Ordine delle carte</b><small>Nell'ordine del set le domande seguono l'albero: prima la madre, poi le figlie</small></span>
                        <select name="ordineCasuale">
                            <option value="false" ${imp.ordineCasuale ? '' : 'selected'}>Ordine del set</option>
                            <option value="true" ${imp.ordineCasuale ? 'selected' : ''}>Casuale</option>
                        </select>
                    </label>
                    <label class="impostazione">
                        <span><b>Studio a cascata</b><small>Una domanda figlia mai vista compare solo dopo che hai imparato la sua domanda madre: si va dalla più generale alla più specifica</small></span>
                        <select name="cascata">
                            <option value="true" ${imp.cascata ? 'selected' : ''}>Attivo</option>
                            <option value="false" ${imp.cascata ? '' : 'selected'}>Disattivo</option>
                        </select>
                    </label>
                    <label class="impostazione">
                        <span><b>Carte di dettaglio</b><small>Le carte con il tag «dettaglio» (e quelle appese sotto) si possono nascondere: spariscono da elenchi, conteggi e studio, ma restano salvate</small></span>
                        <select name="nascondiDettagli">
                            <option value="false" ${imp.nascondiDettagli ? '' : 'selected'}>Visibili</option>
                            <option value="true" ${imp.nascondiDettagli ? 'selected' : ''}>Nascoste</option>
                        </select>
                    </label>
                </section>

                <section class="riquadro gruppo-impostazioni" id="impostazioni-ia">
                    <h3>${ico('scintille')}Assistente IA</h3>
                    <div class="impostazione">
                        <span><b>Chiave API di Gemini</b><small>Resta solo in questo browser e non finisce nei backup.
                            La crei su <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>; va bene anche quella di Allenamento.</small></span>
                        <div class="azioni-riga campo-chiave">
                            <input type="password" data-ia-chiave value="${esc(Gemini.chiave())}" placeholder="Incolla la chiave" autocomplete="off" aria-label="Chiave API di Gemini">
                            <button type="button" class="btn-icona btn-bordo" data-azione="mostra-chiave" title="Mostra o nascondi">${ico('occhio')}</button>
                        </div>
                    </div>
                    <div class="impostazione">
                        <span><b>Modello</b><small data-stato-modello>Le varianti "flash" sono veloci ed economiche; le "pro" ragionano di più ma sono più lente.</small></span>
                        <div class="azioni-riga">
                            <select data-ia-modello aria-label="Modello Gemini">${[...new Set([Gemini.modello(), ...Gemini.modelli()])].map(m => `<option value="${esc(m)}" ${m === Gemini.modello() ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
                            <button type="button" class="btn btn-fantasma" data-azione="aggiorna-modelli">${ico('ruota')}Aggiorna elenco</button>
                        </div>
                    </div>
                    <div class="impostazione">
                        <span><b>Livello di ragionamento</b><small>Come il "Thinking level" di Google AI Studio: più alto = risposte più pensate ma più lente.
                            Vale per i Gemini 3 e successivi (i 2.5 usano il loro predefinito); se il modello non accetta un livello, «minimo» diventa «basso», poi si usa il predefinito.</small></span>
                        <select data-ia-ragionamento aria-label="Livello di ragionamento">${Gemini.LIVELLI.map(([v, t]) => `<option value="${v}" ${v === Gemini.ragionamento() ? 'selected' : ''}>${t}</option>`).join('')}</select>
                    </div>
                    <div class="impostazione">
                        <span><b>Prova il collegamento</b><small>Manda una richiesta di prova a Gemini</small></span>
                        <button type="button" class="btn btn-secondario" data-azione="prova-ia">${ico('scintille')}Prova</button>
                    </div>
                </section>

                <section class="riquadro gruppo-impostazioni">
                    <h3>${ico('sole')}Aspetto</h3>
                    <div class="impostazione">
                        <span><b>Tema</b><small>Automatico segue le impostazioni del sistema</small></span>
                        <div class="segmentato" data-tema>
                            <button type="button" data-valore="sistema">Automatico</button>
                            <button type="button" data-valore="chiaro">${ico('sole')}Chiaro</button>
                            <button type="button" data-valore="scuro">${ico('luna')}Scuro</button>
                        </div>
                    </div>
                </section>

                <section class="riquadro gruppo-impostazioni">
                    <h3>${ico('database')}Dati</h3>
                    <div class="impostazione">
                        <span><b>Importa flashcard</b><small>Il testo o l'Excel esportati dall'app (anche modificati), CSV o testo incollato</small></span>
                        <button type="button" class="btn btn-secondario" data-azione="importa">${ico('carica')}Importa</button>
                    </div>
                    <div class="impostazione">
                        <span><b>Backup</b><small>${imp.ultimoBackup ? `Ultimo backup ${distanzaGiorni(imp.ultimoBackup)}` : 'Nessun backup ancora'} · un file .json con tutto, immagini comprese</small></span>
                        <div class="azioni-riga">
                            <button type="button" class="btn btn-secondario" data-azione="backup">${ico('scarica')}Esporta</button>
                            <button type="button" class="btn btn-fantasma" data-azione="ripristina">${ico('carica')}Ripristina</button>
                        </div>
                    </div>
                    <div class="impostazione">
                        <span><b>Modifiche recenti</b><small>Annulla quello che ha cambiato l'assistente o un'azione su più flashcard insieme</small></span>
                        <button type="button" class="btn btn-secondario" data-azione="storia">${ico('annulla')}Apri</button>
                    </div>
                    <div class="impostazione">
                        <span><b>Spazio usato</b><small data-spazio>Calcolo…</small></span>
                    </div>
                    <div class="impostazione">
                        <span><b>Dati di prova</b><small>${DatiProva.presenti()
                            ? 'Caricati: materie, set e carte con “(prova)” nel nome. Rimuovendoli i tuoi dati restano intatti'
                            : 'Due materie con set, sotto-set, domande ad albero e un mese di storico, per provare l\'app'}</small></span>
                        ${DatiProva.presenti()
                            ? `<button type="button" class="btn btn-fantasma" data-azione="rimuovi-prova">${ico('cestino')}Rimuovi</button>`
                            : `<button type="button" class="btn btn-secondario" data-azione="carica-prova">${ico('stella')}Carica</button>`}
                    </div>
                    <div class="impostazione">
                        <span><b>Elimina tutti i dati</b><small>Materie, set, flashcard, statistiche ed esami</small></span>
                        <button type="button" class="btn btn-pericolo-tenue" data-azione="elimina-tutto">${ico('cestino')}Elimina tutto</button>
                    </div>
                </section>

                <section class="riquadro gruppo-impostazioni">
                    <h3>${ico('tastiera')}Scorciatoie da tastiera</h3>
                    <table class="tabella tabella-tasti">
                        <tr><td><kbd>Spazio</kbd></td><td>Studio: mostra la risposta</td></tr>
                        <tr><td><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></td><td>Studio: Scarso, Ok, Buono, Perfetto</td></tr>
                        <tr><td><kbd>H</kbd></td><td>Studio: mostra il suggerimento</td></tr>
                        <tr><td><kbd>Esc</kbd></td><td>Esci dalla sessione</td></tr>
                        <tr><td><kbd>Tab</kbd> / <kbd>Maiusc</kbd>+<kbd>Tab</kbd></td><td>Elenco del set: rientra la carta sotto quella sopra / riportala indietro</td></tr>
                        <tr><td><kbd>Alt</kbd>+<kbd>↑</kbd> <kbd>↓</kbd></td><td>Elenco del set: sposta la carta tra le sorelle</td></tr>
                        <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Editor: salva la flashcard</td></tr>
                        <tr><td><kbd>Ctrl</kbd>+<kbd>Invio</kbd></td><td>Editor: salva e crea un'altra domanda allo stesso livello</td></tr>
                        <tr><td><kbd>Ctrl</kbd>+<kbd>Maiusc</kbd>+<kbd>Invio</kbd></td><td>Editor: salva e crea una domanda figlia</td></tr>
                    </table>
                </section>

                <p class="nota nota-centrata">I dati sono salvati in questo browser${Archivio.soloMemoria ? ' — <b class="testo-pericolo">ATTENZIONE: il salvataggio non funziona, i dati andranno persi alla chiusura</b>' : ''}.
                    Fai un backup ogni tanto: è l'unica copia di sicurezza.</p>
            </div>`;

        // Assistente IA: chiave e modello stanno in localStorage, non nell'archivio
        const campoChiave = $('[data-ia-chiave]', el);
        campoChiave.addEventListener('change', () => { Gemini.impostaChiave(campoChiave.value); Ui.toast(campoChiave.value.trim() ? 'Chiave salvata' : 'Chiave rimossa', 'successo', 1500); });
        $('[data-ia-modello]', el).addEventListener('change', e => { Gemini.impostaModello(e.target.value); Ui.toast('Modello: ' + e.target.value, 'successo', 1500); });
        $('[data-ia-ragionamento]', el).addEventListener('change', e => { Gemini.impostaRagionamento(e.target.value); Ui.toast('Ragionamento: ' + Gemini.nomeRagionamento(), 'successo', 1500); });

        // Salvataggio automatico dei campi
        $$('input[name], select[name]', el).forEach(campo => {
            campo.addEventListener('change', () => {
                let valore = campo.value;
                if (campo.type === 'number') {
                    valore = limita(parseInt(valore, 10) || 0, +campo.min, +campo.max);
                    campo.value = valore;
                } else if (campo.name === 'ordineCasuale' || campo.name === 'cascata' || campo.name === 'nascondiDettagli') valore = valore === 'true';
                else valore = valore.trim();
                Dati.salvaImpostazioni({ [campo.name]: valore });
                Ui.toast('Salvato', 'successo', 1200);
                App.aggiornaPiede();
            });
        });

        const pulsantiTema = $$('[data-tema] button', el);
        const segnaTema = t => pulsantiTema.forEach(b => b.classList.toggle('attivo', b.dataset.valore === t));
        segnaTema(imp.tema);
        $('[data-tema]', el).addEventListener('click', e => {
            const b = e.target.closest('[data-valore]');
            if (!b) return;
            Dati.salvaImpostazioni({ tema: b.dataset.valore });
            App.applicaTema(b.dataset.valore);
            segnaTema(b.dataset.valore);
        });

        Archivio.spazioUsato().then(stima => {
            const box = $('[data-spazio]', el);
            if (!box) return;
            const mb = n => (n / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
            const carte = Dati.tutteLeCarte({ tutte: true }).length;
            box.textContent = stima ? `${mb(stima.usage)} per ${plurale(carte, 'flashcard', 'flashcard')} · disponibili circa ${mb(stima.quota)}` : `${plurale(carte, 'flashcard', 'flashcard')}`;
        });

        Ui.collegaAzioni(el, {
            importa: () => Importa.apriDialogo(),
            backup: async () => { await Importa.esportaBackup(); App.ridisegna(); },
            storia: () => Storia.elenco(),
            'mostra-chiave': () => { campoChiave.type = campoChiave.type === 'password' ? 'text' : 'password'; },
            'aggiorna-modelli': async b => {
                Gemini.impostaChiave(campoChiave.value);
                b.disabled = true;
                try {
                    const lista = await Gemini.aggiornaModelli();
                    $('[data-ia-modello]', el).innerHTML = lista.map(m => `<option value="${esc(m)}" ${m === Gemini.modello() ? 'selected' : ''}>${esc(m)}</option>`).join('');
                    $('[data-stato-modello]', el).textContent = `${plurale(lista.length, 'modello disponibile', 'modelli disponibili')} per la tua chiave. Attivo: ${Gemini.modello()}`;
                } catch (e) { Ui.toast(e.message, 'errore', 6000); }
                b.disabled = false;
            },
            'prova-ia': async b => {
                Gemini.impostaChiave(campoChiave.value);
                b.disabled = true;
                try {
                    const dati = await Gemini.genera({ contents: [{ role: 'user', parts: [{ text: 'Quanto fa 17 × 23? Rispondi solo con il numero.' }] }] });
                    const testo = ((dati.candidates || [])[0] || {}).content;
                    const u = Gemini.ultimo || {};
                    const impostazione = u.usato ? `livello «${Gemini.nomeRagionamento(u.usato.thinkingLevel).toLowerCase()}»`
                        : Gemini.ragionamento() && !Gemini.livelloApplicabile() ? 'predefinito (con i Gemini 2.5 il livello non si sceglie)' : 'predefinito del modello';
                    Ui.toast(`${Gemini.modello()} ha risposto «${testo ? testo.parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim() : '—'}» · ragionamento: ${impostazione} · token usati per ragionare: ${u.pensiero || 0}`, 'successo', 9000);
                } catch (e) { Ui.toast(e.message, 'errore', 7000); }
                b.disabled = false;
            },
            ripristina: () => Importa.ripristinaBackup(),
            'carica-prova': () => { if (DatiProva.carica()) App.ridisegna(); },
            'rimuovi-prova': async () => {
                const ok = await Ui.conferma('Tolgo materie, set, carte, storico ed esami di prova, compreso quello che hai aggiunto dentro le materie di prova. I tuoi dati restano.',
                    { titolo: 'Rimuovere i dati di prova?', ok: 'Rimuovi', pericolo: true });
                if (ok) { DatiProva.rimuovi(); App.ridisegna(); }
            },
            'elimina-tutto': async () => {
                const ok = await Ui.conferma('Cancelli <b>tutto</b>: materie, set, flashcard, statistiche ed esami. Se non hai un backup non potrai recuperarli.',
                    { titolo: 'Eliminare tutti i dati?', ok: 'Elimina tutto', pericolo: true });
                if (!ok) return;
                const tema = Dati.impostazioni().tema;
                await Archivio.sostituisciTutto({ impostazioni: [{ ...IMPOSTAZIONI_PREDEFINITE, tema, id: 'generali' }] });
                Ui.toast('Tutti i dati sono stati eliminati');
                Router.vai('/home');
            },
        });
    },
};
