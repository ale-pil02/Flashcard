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
