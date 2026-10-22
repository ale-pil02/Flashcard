// Nella mappa «link argomenti» i nodi presi dalle mappe della materia (n.rif) non si eliminano e non si spostano: si
// cambiano nella mappa d'origine. L'assistente segue le stesse regole dell'editor (js/ia/strumenti-mappe.js: elimina_nodi
// e sposta_nodi; js/mappe/editor.js: eliminaSelezionati, lasciaNodi e Taglia)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { caricaApp, strumento } = require('./aiuti/app');

// La «link argomenti» della materia dei dati di prova, con un nodo generato e uno aggiunto a mano
async function preparaMappe() {
    const { g } = await caricaApp();
    const Mappe = g('Mappe'), Panoramica = g('Panoramica');
    const origine = Mappe.tutte().find(m => m.materiaId && !m.panoramica);
    const p = Panoramica.di(origine.materiaId) || Panoramica.crea(origine.materiaId);
    const generato = Object.values(p.nodi).find(n => n.rif && n.rif.mappa && n.genitore && n.genitore !== p.radice);
    assert.ok(generato, 'la «link argomenti» ha nodi presi dalla mappa della materia');
    const aMano = Mappe.aggiungiNodo(p, { genitore: p.radice, testo: 'aggiunto a mano' });
    Mappe.salva(p);
    return { g, Mappe, origine, p, generato, aMano };
}

test('elimina_nodi non elimina i nodi presi dalle mappe della materia, solo quelli aggiunti a mano', async () => {
    const { g, Mappe, p, generato, aMano } = await preparaMappe();

    const solo = await strumento(g, 'elimina_nodi', { mappa_id: p.id, nodi_ids: [generato.id] });
    assert.match(solo.errore, /mappa d'origine/);
    assert.ok(Mappe.mappa(p.id).nodi[generato.id]);

    const insieme = await strumento(g, 'elimina_nodi', { mappa_id: p.id, nodi_ids: [generato.id, aMano.id] });
    assert.ok(!insieme.errore, insieme.errore);
    assert.deepEqual([...insieme.non_eliminati], [generato.id]);
    assert.ok(Mappe.mappa(p.id).nodi[generato.id], 'il nodo generato resta');
    assert.ok(!Mappe.mappa(p.id).nodi[aMano.id], 'quello aggiunto a mano se ne va');
});

test('sposta_nodi non sposta i nodi generati nella «link argomenti»; in un\'altra mappa ne porta una copia', async () => {
    const { g, Mappe, origine, p, generato, aMano } = await preparaMappe();
    const genitorePrima = generato.genitore;

    const qui = await strumento(g, 'sposta_nodi', { mappa_id: p.id, nodi_ids: [generato.id, aMano.id], genitore_id: genitorePrima, indice: 0 });
    assert.ok(!qui.errore, qui.errore);
    assert.match(qui.esiti.find(x => x.nodo_id === generato.id).errore, /mappa d'origine/);
    assert.equal(Mappe.mappa(p.id).nodi[generato.id].genitore, genitorePrima, 'il nodo generato resta dove lo mette la mappa d\'origine');
    assert.ok(qui.esiti.find(x => x.nodo_id === aMano.id).ok, 'quello aggiunto a mano si sposta');
    assert.equal(Mappe.mappa(p.id).nodi[aMano.id].genitore, genitorePrima);

    // Come Taglia e Incolla nell'editor: nell'altra mappa arriva una copia normale, nella «link argomenti» resta
    const fuori = await strumento(g, 'sposta_nodi', { mappa_id: p.id, nodi_ids: [generato.id], mappa_destinazione_id: origine.id, genitore_id: origine.radice });
    assert.ok(!fuori.errore, fuori.errore);
    assert.deepEqual([...fuori.rimasti_anche_nella_partenza], [generato.id]);
    assert.ok(Mappe.mappa(p.id).nodi[generato.id]);
    const copia = Mappe.mappa(origine.id).nodi[fuori.spostati[0].nuovo_id];
    assert.ok(copia && !copia.rif, "la copia è un nodo normale dell'altra mappa");
});
