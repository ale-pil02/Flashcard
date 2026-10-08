// Navigazione tra le viste tramite l'indirizzo dopo il # (es. #/set/abc123).
// Funziona anche aprendo il file dal disco e lascia funzionare il tasto Indietro.

// Registro delle viste: ogni file in js/viste/ aggiunge la sua
const Viste = {};

const Router = (() => {
    const rotte = [];
    let guardia = null;          // funzione che può impedire di lasciare la vista (modifiche non salvate)
    let hashCorrente = '';
    let hashPrecedente = '';     // pagina da cui si è arrivati (per i pulsanti "indietro" delle viste)
    let ignoraProssimo = false;

    function aggiungi(schema, vista) {
        const chiavi = [];
        const re = new RegExp('^' + schema.replace(/:(\w+)/g, (_, chiave) => { chiavi.push(chiave); return '([^/]+)'; }) + '$');
        rotte.push({ re, chiavi, vista });
    }

    function analizza(hash) {
        const [percorso, query = ''] = hash.replace(/^#/, '').split('?');
        for (const r of rotte) {
            const m = (percorso || '/home').match(r.re);
            if (!m) continue;
            const params = {};
            r.chiavi.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
            return { vista: r.vista, params, query: Object.fromEntries(new URLSearchParams(query)), percorso };
        }
        return null;
    }

    function gestisci() {
        // Prima che l'app abbia finito di avviarsi non si disegna niente: ci pensa App.avvia()
        if (typeof App === 'undefined' || !App.pronta) return;
        if (ignoraProssimo) { ignoraProssimo = false; return; }
        if (guardia && location.hash !== hashCorrente && !guardia()) {
            // L'utente ha scelto di restare: rimetto l'indirizzo com'era
            ignoraProssimo = true;
            location.hash = hashCorrente;
            return;
        }
        guardia = null;
        if ((location.hash || '#/home') !== hashCorrente) hashPrecedente = hashCorrente;
        hashCorrente = location.hash || '#/home';
        const rotta = analizza(hashCorrente) || analizza('#/home');
        App.mostra(rotta);
    }

    function vai(percorso, { sostituisci = false } = {}) {
        const hash = '#' + percorso;
        if (location.hash === hash) { gestisci(); return; }
        if (sostituisci) {
            if (guardia && !guardia()) return;
            guardia = null;
            history.replaceState(null, '', hash);
            gestisci();
        } else {
            location.hash = hash;
        }
    }

    window.addEventListener('hashchange', gestisci);

    return {
        aggiungi, vai, gestisci, analizza,
        impostaGuardia(fn) { guardia = fn; },
        get corrente() { return hashCorrente; },
        get precedente() { return hashPrecedente; },
    };
})();
