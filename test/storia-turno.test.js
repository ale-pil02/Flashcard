// Annullare un turno dell'assistente (il pulsante Annulla sotto la sua risposta) rimette tutto com'era, anche quando nel
// turno l'assistente ha annullato una modifica recente o ha registrato un ripasso (js/storia.js, js/ia/strumenti.js)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { caricaApp, strumento } = require('./aiuti/app');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('annullare il turno che ha usato modifiche_recenti non toglie le immagini della mappa', async () => {
    const { g } = await caricaApp();
    const Storia = g('Storia'), Mappe = g('Mappe');
    const mp = Mappe.tutte().find(m => !m.panoramica);
    mp.immagini.foto = PNG;
    Mappe.salva(mp);
    const nodo = Object.keys(mp.nodi).find(id => id !== mp.radice);

    // Una modifica dell'assistente alla mappa, che poi l'utente fa annullare in un altro messaggio
    let r = Storia.inizia({ origine: 'assistente', descrizione: 'rinomina il nodo' });
    assert.ok(!(await strumento(g, 'modifica_nodi', { mappa_id: mp.id, modifiche: [{ nodo_id: nodo, testo: 'nodo rinominato' }] })).errore);
    const voce = await Storia.termina(r);
    r = Storia.inizia({ origine: 'assistente', descrizione: 'annulla la modifica alla mappa' });
    const esito = await strumento(g, 'modifiche_recenti', { azione: 'annulla', voce_id: voce.id });
    assert.equal(esito.fatto, 'annullata');
    const turno = await Storia.termina(r);
    assert.notEqual(Mappe.mappa(mp.id).nodi[nodo].testo, 'nodo rinominato');

    await Storia.annulla(turno.id);
    const dopo = Mappe.mappa(mp.id);
    assert.equal(dopo.nodi[nodo].testo, 'nodo rinominato', 'annullando il turno torna la modifica che aveva annullato');
    assert.equal(dopo.immagini && dopo.immagini.foto, PNG, 'le immagini della mappa restano');

    // Il turno è già annullato: annullarlo di nuovo non fa niente, e lo strumento lo dice
    const di_nuovo = await strumento(g, 'modifiche_recenti', { azione: 'annulla', voce_id: turno.id });
    assert.match(di_nuovo.fatto, /niente/);
});

// Un turno dell'assistente che cambia la domanda di una carta: la sua voce nelle Modifiche recenti
async function voceCheCambia(g, carta, domanda) {
    const Storia = g('Storia');
    const r = Storia.inizia({ origine: 'assistente', descrizione: 'cambia la domanda' });
    assert.ok(!(await strumento(g, 'modifica_carte', { modifiche: [{ carta_id: carta.id, domanda }] })).errore);
    return Storia.termina(r);
}

// Un turno in cui l'assistente annulla o ripristina quella voce con modifiche_recenti
async function turnoCon(g, azione, voceId) {
    const Storia = g('Storia');
    const r = Storia.inizia({ origine: 'assistente', descrizione: `${azione} la modifica di prima` });
    const esito = await strumento(g, 'modifiche_recenti', { azione, voce_id: voceId });
    assert.equal(esito.fatto, azione === 'annulla' ? 'annullata' : 'ripristinata');
    return Storia.termina(r);
}

const statoDi = async (g, id) => {
    const v = await g('Archivio').leggiRiga('storia', id);
    return { stato: v.stato, annullataDa: v.annullataDa };
};

test('annullando il turno che ha annullato una voce, la voce torna «attiva» e si può annullare di nuovo', async () => {
    const { g } = await caricaApp();
    const Storia = g('Storia'), Dati = g('Dati');
    const carta = Dati.tutteLeCarte()[0];
    const domandaPrima = Dati.carta(carta.id).domanda;
    const voce = await voceCheCambia(g, carta, 'domanda nuova');

    const turno = await turnoCon(g, 'annulla', voce.id);
    assert.equal(Dati.carta(carta.id).domanda, domandaPrima);
    assert.equal((await statoDi(g, voce.id)).stato, 'annullata');

    // Annullando il turno la modifica torna, e la voce con lei: di nuovo «attiva», con il pulsante Annulla
    await Storia.annulla(turno.id);
    assert.equal(Dati.carta(carta.id).domanda, 'domanda nuova');
    assert.deepEqual(await statoDi(g, voce.id), { stato: 'attiva', annullataDa: null });
    assert.equal((await Storia.voci()).find(v => v.id === voce.id).stato, 'attiva', 'nelle Modifiche recenti (e nel riquadro della chat) è attiva');

    // Ripristinando il turno la voce torna annullata, e il suo Ripristina rimette la modifica senza lasciare niente indietro
    await Storia.ripristina(turno.id);
    assert.equal(Dati.carta(carta.id).domanda, domandaPrima);
    assert.equal((await statoDi(g, voce.id)).stato, 'annullata');
    assert.equal((await Storia.ripristina(voce.id)).saltati, 0);
    assert.equal(Dati.carta(carta.id).domanda, 'domanda nuova');
    assert.equal((await statoDi(g, voce.id)).stato, 'attiva');

    // E la si può annullare come una voce qualsiasi
    await Storia.annulla(voce.id);
    assert.equal(Dati.carta(carta.id).domanda, domandaPrima);
});

test('annullando il turno che ha ripristinato una voce, la voce torna «annullata» e si può ripristinare di nuovo', async () => {
    const { g } = await caricaApp();
    const Storia = g('Storia'), Dati = g('Dati');
    const carta = Dati.tutteLeCarte()[0];
    const domandaPrima = Dati.carta(carta.id).domanda;
    const voce = await voceCheCambia(g, carta, 'domanda nuova');
    await Storia.annulla(voce.id);
    const annullata = await statoDi(g, voce.id);
    assert.equal(annullata.stato, 'annullata');

    const turno = await turnoCon(g, 'ripristina', voce.id);
    assert.equal(Dati.carta(carta.id).domanda, 'domanda nuova');
    assert.equal((await statoDi(g, voce.id)).stato, 'attiva');

    await Storia.annulla(turno.id);
    assert.equal(Dati.carta(carta.id).domanda, domandaPrima);
    assert.deepEqual(await statoDi(g, voce.id), annullata, 'di nuovo annullata, dallo stesso annullamento di prima');
    assert.equal((await Storia.ripristina(voce.id)).saltati, 0);
    assert.equal(Dati.carta(carta.id).domanda, 'domanda nuova');
});

test("se dopo il turno la voce è stata cambiata di nuovo a mano, annullare il turno la lascia com'è", async () => {
    const { g } = await caricaApp();
    const Storia = g('Storia'), Dati = g('Dati');
    const carta = Dati.tutteLeCarte()[0];
    const voce = await voceCheCambia(g, carta, 'domanda nuova');
    const turno = await turnoCon(g, 'annulla', voce.id);
    await Storia.ripristina(voce.id);   // l'utente la ripristina dalle Modifiche recenti
    assert.equal((await statoDi(g, voce.id)).stato, 'attiva');

    await Storia.annulla(turno.id);
    assert.deepEqual(await statoDi(g, voce.id), { stato: 'attiva', annullataDa: null });
    assert.equal(Dati.carta(carta.id).domanda, 'domanda nuova');
});

test('annullare il turno che ha registrato un ripasso toglie anche i ripassi dalle statistiche', async () => {
    const { g } = await caricaApp();
    const Storia = g('Storia'), Dati = g('Dati');
    const s = Dati.tuttiSet().find(x => Dati.carteDiSet(x.id).length > 1);
    const carte = Dati.carteDiSet(s.id);
    const prima = Dati.ripassi().length;
    const srsPrima = JSON.stringify(carte.map(c => c.srs));

    const r = Storia.inizia({ origine: 'assistente', descrizione: 'interrogami' });
    const esito = await strumento(g, 'registra_ripasso', { valutazioni: carte.map(c => ({ carta_id: c.id, valutazione: 'perfetto' })) });
    assert.ok(!esito.errore, esito.errore);
    const turno = await Storia.termina(r);
    assert.equal(Dati.ripassi().length, prima + carte.length);

    await Storia.annulla(turno.id);
    assert.equal(Dati.ripassi().length, prima, 'i ripassi registrati nel turno se ne vanno con lui');
    assert.equal(JSON.stringify(Dati.carteDiSet(s.id).map(c => c.srs)), srsPrima, 'le carte tornano com\'erano');
});

test('caricare i dati di prova in un turno e annullarlo toglie anche la mappa e i ripassi di prova', async () => {
    const { g } = await caricaApp({ datiProva: false });
    const Storia = g('Storia'), Dati = g('Dati'), Mappe = g('Mappe');
    const r = Storia.inizia({ origine: 'assistente', descrizione: 'carica i dati di prova' });
    assert.equal((await strumento(g, 'dati_app', { azione: 'carica_prova' })).caricati, true);
    const turno = await Storia.termina(r);
    assert.ok(Mappe.tutte().length && Dati.ripassi().length);
    await Storia.annulla(turno.id);
    assert.equal(Dati.materie().length, 0);
    assert.equal(Mappe.tutte().filter(m => m.prova).length, 0);
    assert.equal(Dati.ripassi().length, 0);
});
