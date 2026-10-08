// Mappa "link argomenti" di una materia: una mappa che l'app tiene da sola, con gli argomenti principali di tutte le
// mappe della materia, per vederla tutta d'insieme e capire come gli argomenti stanno nel quadro generale.
//
// Si crea da sola quando una materia ha la sua prima mappa (se non c'è già una mappa con quel nome fatta a mano).
// Radice = la materia; sotto, per ogni mappa: il titolo, i sottorami e i concetti di primo livello; più in fondo solo i
// nodi segnati "Mostra in link argomenti" (n.inPanoramica), con i nodi che li collegano. Ogni nodo generato ricorda da
// dove viene (n.rif = { mappa, nodo }) e si riallinea a ogni modifica delle mappe d'origine: testi e struttura vengono da
// lì, mentre aspetto, disposizione, posizioni, i nodi aggiunti a mano e i collegamenti tra rami restano quelli scelti qui.
// mappa.panoramica = true la distingue dalle altre.

const Panoramica = (() => {
    const NOME = 'link argomenti';
    const materiaDi = new Map();   // mappa → materia, per accorgersi di mappe nuove o spostate
    const attese = new Map();      // materia → timer del riallineamento
    let pronta = false;

    const normale = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const chiave = r => (r.materia ? 'materia:' + r.materia : r.mappa + ':' + r.nodo);

    function di(materiaId) { return Mappe.tutte().find(m => m.panoramica && m.materiaId === materiaId) || null; }

    // Le mappe della materia da cui prende gli argomenti
    function fonti(materiaId) {
        return Mappe.tutte().filter(m => m.materiaId === materiaId && !m.panoramica && normale(m.nome) !== NOME)
            .sort((a, b) => (a.creata || 0) - (b.creata || 0));
    }

    // Nodi di una mappa da riportare: tema centrale, sottorami, concetti di primo livello e quelli segnati più in fondo
    function scelti(m) {
        const tieni = new Set([m.radice]);
        (m.nodi[m.radice].figli || []).forEach(a => {
            if (!m.nodi[a]) return;
            tieni.add(a);
            m.nodi[a].figli.forEach(b => { if (m.nodi[b]) tieni.add(b); });
        });
        Object.values(m.nodi).forEach(n => {
            if (!n.inPanoramica) return;
            const catena = [...Mappe.antenati(m, n.id), n.id];
            if (catena[0] === m.radice) catena.forEach(x => tieni.add(x));
        });
        return tieni;
    }

    // Profondità del nodo nella sua mappa (0 = tema centrale): dal 3 in giù si sceglie se mostrarlo
    function profondita(m, id) { return Mappe.antenati(m, id).length; }
    function sceglibile(m, id) { return !!m && !m.panoramica && !!m.materiaId && !!m.nodi[id] && profondita(m, id) >= 3 && Mappe.antenati(m, id)[0] === m.radice; }

    function struttura(p) {
        return JSON.stringify(Object.values(p.nodi).map(n => [n.id, n.genitore, n.figli, n.testo, n.rif || null]).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    }

    // Riallinea la "link argomenti" di una materia con le sue mappe
    function allinea(materiaId) {
        const p = di(materiaId);
        const mat = Dati.materia(materiaId);
        if (!p || !mat || !p.nodi[p.radice]) return;
        const vecchi = new Map();
        Object.values(p.nodi).forEach(n => { if (n.rif && n.id !== p.radice) vecchi.set(chiave(n.rif), n); });
        const nodi = {};
        const generati = new Set();
        const nodo = (rif, testo, genitore) => {
            const v = vecchi.get(chiave(rif));
            const n = v ? { ...v } : Mappe.nodoVuoto({ rif });
            Object.assign(n, { testo, genitore, rif, figli: [] });
            vecchi.delete(chiave(rif));
            nodi[n.id] = n;
            generati.add(n.id);
            return n;
        };
        const radice = { ...p.nodi[p.radice], testo: mat.nome, rif: { materia: materiaId }, genitore: null, figli: [] };
        nodi[radice.id] = radice;
        generati.add(radice.id);
        fonti(materiaId).forEach(m => {
            const tieni = scelti(m);
            const giro = (id, genitore) => {
                const sn = m.nodi[id];
                const testo = id === m.radice && !Mappe.testoSemplice(sn.testo) ? m.nome : sn.testo;
                const n = nodo({ mappa: m.id, nodo: id }, testo, genitore);
                n.figli = sn.figli.filter(f => tieni.has(f) && m.nodi[f]).map(f => giro(f, n.id));
                return n.id;
            };
            radice.figli.push(giro(m.radice, radice.id));
        });
        // Nodi aggiunti a mano qui: restano sotto il loro genitore (o sotto la radice, se il genitore non c'è più),
        // dopo quelli generati; i nodi generati che non ci sono più nelle mappe d'origine spariscono
        const aMano = Object.values(p.nodi).filter(n => !n.rif);
        aMano.forEach(n => { nodi[n.id] = { ...n }; });
        aMano.forEach(n => {
            const x = nodi[n.id];
            if (!x.genitore) return;   // nodo libero
            if (!nodi[x.genitore]) { x.genitore = radice.id; x.off = null; }
            if (generati.has(x.genitore)) nodi[x.genitore].figli.push(x.id);
            else x.figli = (x.figli || []).filter(f => nodi[f] && !nodi[f].rif);
        });
        aMano.forEach(n => { const x = nodi[n.id]; if (!generati.has(x.id)) x.figli = x.figli.filter(f => nodi[f] && nodi[f].genitore === x.id); });

        const prima = struttura(p);
        const dopo = struttura({ nodi });
        if (prima === dopo) return;
        Mappe.primaDiCambiare(p.id);
        p.nodi = nodi;
        p.relazioni = (p.relazioni || []).filter(r => nodi[r.da] && nodi[r.a]);
        Mappe.pulisciLegami(p);
        Mappe.salva(p);
        Mappe.cambiataDaFuori(p.id);
    }

    function programma(materiaId) {
        if (!materiaId) return;
        clearTimeout(attese.get(materiaId));
        attese.set(materiaId, setTimeout(() => { attese.delete(materiaId); allinea(materiaId); }, 600));
    }

    // Crea la mappa della materia, se non c'è (né una fatta a mano con lo stesso nome)
    function crea(materiaId) {
        const mat = Dati.materia(materiaId);
        if (!mat || Mappe.tutte().some(m => m.materiaId === materiaId && (m.panoramica || normale(m.nome) === NOME))) return null;
        const m = Mappe.nuova({ nome: NOME, materiaId });
        m.panoramica = true;
        if (mat.prova) m.prova = true;
        m.nodi[m.radice].testo = mat.nome;
        m.nodi[m.radice].rif = { materia: materiaId };
        Mappe.primaDiCambiare(m.id);
        Mappe.aggiungi(m);
        allinea(materiaId);
        return m;
    }

    // Ogni salvataggio di una mappa: se è nuova (o appena entrata in una materia) e la materia non ha ancora la sua
    // "link argomenti", la si crea; poi la si riallinea. Anche rinominare la materia la riallinea.
    Archivio.alCambio((nome, operazioni) => {
        if (!pronta) return;
        if (nome === 'materie') {
            operazioni.forEach(op => { if (op.tipo === 'salva') programma(op.valore.id); });
            return;
        }
        if (nome !== 'mappe') return;
        operazioni.forEach(op => {
            if (op.tipo === 'sostituisci') return;
            const id = op.tipo === 'salva' ? op.valore.id : op.id;
            const m = op.tipo === 'salva' ? op.valore : null;
            if (m && m.panoramica) return;
            const prima = materiaDi.has(id) ? materiaDi.get(id) : undefined;
            const ora = m ? m.materiaId || null : null;
            if (m) materiaDi.set(id, ora); else materiaDi.delete(id);
            if (prima && prima !== ora) programma(prima);
            if (!ora) return;
            if (prima !== ora && !di(ora)) crea(ora);
            programma(ora);
        });
    });

    // All'avvio: si ricorda dove sta ogni mappa; la prima volta crea la mappa delle materie che hanno già mappe,
    // poi riallinea quelle che ci sono
    function inizializza() {
        Mappe.tutte().forEach(m => { if (!m.panoramica) materiaDi.set(m.id, m.materiaId || null); });
        pronta = true;
        if (!Dati.impostazioni().panoramicheCreate) {
            [...new Set(Mappe.tutte().filter(m => !m.panoramica && m.materiaId).map(m => m.materiaId))].forEach(crea);
            Dati.salvaImpostazioni({ panoramicheCreate: true });
        }
        Mappe.tutte().filter(m => m.panoramica && m.materiaId).forEach(m => allinea(m.materiaId));
    }

    // Da un nodo della "link argomenti" alla sua mappa d'origine
    function origine(p, id) {
        const n = p && p.nodi[id];
        const r = n && n.rif;
        if (!r || !r.mappa) return null;
        const m = Mappe.mappa(r.mappa);
        return m && m.nodi[r.nodo] ? { m, nodo: r.nodo } : null;
    }

    return { NOME, di, crea, allinea, inizializza, origine, sceglibile, profondita };
})();
