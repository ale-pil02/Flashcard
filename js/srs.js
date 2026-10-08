// Ripetizione spaziata delle carte: la stessa delle revisioni dei set (js/revisioni.js), come nel database di Notion.
//   Prossima revisione = ultimo ripasso + 2^(N° Rep − 1) giorni   (N° Rep 0 vale 1: 1, 2, 4, 8, 16… giorni)
//
// Quattro valutazioni: Scarso, Ok, Buono, Perfetto.
// - Ok, Buono o Perfetto: N° Rep +1 (al massimo una volta al giorno), ultimo ripasso = oggi. Buono e Perfetto
//   rendono la carta imparata; Ok no (nella sessione torna in fondo, per il set resta "da sistemare").
// - Scarso: N° Rep e ultimo ripasso restano com'erano e la carta è da ripassare subito (da oggi, daRifareDal),
//   finché non le dai almeno Ok.
//   Nella sessione Ok e Scarso tornano in fondo alla coda finché non dai Buono o Perfetto (js/viste/studio.js).
// Nella stessa sessione solo la prima valutazione di una carta muove N° Rep e date; quelle dopo (i ritorni in fondo)
// cambiano solo la valutazione. Eccezione: se la prima era Scarso (che non muove niente), la prima volta che arriva
// almeno a Ok prende N° Rep +1 e ultimo ripasso = oggi. La valutazione della carta è l'ultima data, o quella scelta a mano
// (editor, pagina del set): con quelle si calcola lo stato del set nelle revisioni. Cambiarla a mano non tocca le date
// (Scarso a mano rende la carta da ripassare da oggi; "mai valutata" la riporta tra le carte nuove).
// Riadeguata al set (allineata, dal pannello delle revisioni): N° Rep e ultimo ripasso sono quelli del suo set e la carta
// li segue anche se è Scarso o mai valutata, finché non la valuti di nuovo nello studio.

const Srs = (() => {
    const SCARSO = 0, OK = 1, BUONO = 2, PERFETTO = 3;

    const VALUTAZIONI = [
        { valore: SCARSO, chiave: 'scarso', nome: 'Scarso' },
        { valore: OK, chiave: 'ok', nome: 'Ok' },
        { valore: BUONO, chiave: 'buono', nome: 'Buono' },
        { valore: PERFETTO, chiave: 'perfetto', nome: 'Perfetto' },
    ];

    const MAX_ESPONENTE = 16;   // oltre ~90 anni l'intervallo non cambia più niente

    function statoIniziale() {
        return {
            stato: 'nuova',            // nuova | apprendimento | imparata (l'ultima valutazione è Buono o Perfetto)
            ultimaValutazione: null,   // 0-3: la valutazione della carta, guida i colori e lo stato del set
            rep: 0,                    // N° Rep
            giorno: null,              // ultimo ripasso "AAAA-MM-GG" (da qui si conta la prossima revisione)
            giornoRep: null,           // giorno dell'ultima N° Rep in più: al massimo una al giorno
            daRifareDal: null,         // valutata Scarso: da ripassare da questo giorno, finché non arriva almeno a Ok
            allineata: false,          // riadeguata al set: segue N° Rep e data del set fino alla prossima valutazione
            ripetizioni: 0,            // risposte date in tutto
            errori: 0,
            ultimoRipasso: null,       // timestamp dell'ultima risposta
        };
    }

    // Stato dalla valutazione: chi non è mai stato valutato resta nuovo
    function statoDa(valutazione) { return valutazione == null ? 'nuova' : valutazione >= BUONO ? 'imparata' : 'apprendimento'; }

    // Porta al formato attuale uno stato del vecchio sistema (intervalli in stile Vaia): l'intervallo che aveva
    // diventa il N° Rep più vicino, così la prossima revisione cade più o meno quando cadeva prima
    function normalizza(srs) {
        const s = { ...statoIniziale(), ...(srs || {}) };
        if (!('rep' in (srs || {})) && s.ultimaValutazione != null) {
            s.giorno = s.ultimoRipasso ? chiaveGiorno(s.ultimoRipasso) : chiaveGiorno();
            s.rep = s.stato === 'imparata' ? 1 + Math.max(0, Math.round(Math.log2(Math.max(1, +s.intervallo || 1)))) : 0;
        }
        s.stato = statoDa(s.ultimaValutazione);
        ['passi', 'intervallo', 'facilita', 'scadenza'].forEach(k => delete s[k]);
        return s;
    }

    function intervallo(rep) { return Math.pow(2, Math.min(MAX_ESPONENTE, Math.max(1, rep || 0) - 1)); }

    // Applica una valutazione e restituisce il nuovo stato, senza toccare quello di partenza.
    // date = false: ritorno della carta nella stessa sessione, cambia solo la valutazione;
    // rep = false: l'ultimo ripasso diventa oggi ma N° Rep non sale (dopo uno Scarso nella stessa sessione)
    function valuta(srs, valutazione, { date = true, rep = true, ora = Date.now() } = {}) {
        const s = normalizza(srs);
        const oggi = chiaveGiorno(ora);
        s.ripetizioni += 1;
        s.ultimaValutazione = valutazione;
        s.ultimoRipasso = ora;
        s.stato = statoDa(valutazione);
        s.allineata = false;
        if (valutazione === SCARSO) {
            // Scarso: N° Rep e date restano, la carta resta da ripassare (da oggi) finché non arriva almeno a Ok
            s.errori += 1;
            s.daRifareDal = oggi;
            return s;
        }
        s.daRifareDal = null;
        if (date) {
            if (rep && valutazione >= OK && s.giornoRep !== oggi) { s.rep += 1; s.giornoRep = oggi; }
            s.giorno = oggi;
        }
        return s;
    }

    // Valutazione scelta a mano: cambia lo stato della carta (e del set), non N° Rep né date
    function conValutazione(srs, valutazione) {
        const s = normalizza(srs);
        const prima = s.ultimaValutazione;
        s.ultimaValutazione = valutazione == null ? null : limita(Math.round(valutazione), SCARSO, PERFETTO);
        s.stato = statoDa(s.ultimaValutazione);
        if (s.ultimaValutazione === SCARSO) { if (prima !== SCARSO || !s.daRifareDal) s.daRifareDal = chiaveGiorno(); }
        else s.daRifareDal = null;
        // Scarso o "mai valutata" a mano: la carta smette di seguire il set
        if (s.ultimaValutazione == null || s.ultimaValutazione === SCARSO) s.allineata = false;
        return s;
    }

    // Prossima revisione (timestamp di inizio giorno), null se la carta non è mai stata valutata.
    // Scarso: il giorno da cui è da rifare; valutata ma senza ripasso (a mano): oggi
    function prossima(carta) {
        const s = carta.srs;
        if (s && s.allineata && s.giorno) return aggiungiGiorni(daChiaveGiorno(s.giorno), intervallo(s.rep));
        if (!s || s.ultimaValutazione == null) return null;
        if (s.ultimaValutazione === SCARSO) return daChiaveGiorno(s.daRifareDal || chiaveGiorno(s.ultimoRipasso || Date.now()));
        return s.giorno ? aggiungiGiorni(daChiaveGiorno(s.giorno), intervallo(s.rep)) : inizioGiorno();
    }

    // Testo breve sotto i pulsanti di valutazione: quando tornerà la carta
    function anteprima(srs, valutazione, { date = true } = {}) {
        if (valutazione < BUONO) return 'in fondo';
        if (!date) return 'fatta';
        const s = valuta(srs, valutazione);
        const g = intervallo(s.rep);
        if (g < 30) return `${g} g`;
        if (g < 365) return `${Math.round(g / 30)} mes${Math.round(g / 30) === 1 ? 'e' : 'i'}`;
        return `${Math.round(g / 365)} ann${Math.round(g / 365) === 1 ? 'o' : 'i'}`;
    }

    function stato(carta) { return (carta.srs && carta.srs.stato) || 'nuova'; }
    function valutazione(carta) { const v = carta.srs ? carta.srs.ultimaValutazione : null; return v == null ? null : v; }

    // Categoria per i colori della barra di avanzamento: nuova o l'ultima valutazione data
    function categoria(carta) {
        const v = valutazione(carta);
        return v == null ? 'nuova' : VALUTAZIONI[v].chiave;
    }

    // Da ripassare: la prossima revisione è oggi o già passata (una carta valutata senza date, a mano, lo è subito)
    function daRipassare(carta, ora = Date.now()) {
        if (stato(carta) === 'nuova' && !(carta.srs && carta.srs.allineata)) return false;
        const p = prossima(carta);
        return p == null || chiaveGiorno(p) <= chiaveGiorno(ora);
    }

    function descrivi(carta) {
        // Mai studiata ma il suo set è già stato ripassato: è da ripassare (js/revisioni.js, dovutaDal)
        const s = carta.srs;
        if (stato(carta) === 'nuova' && !(s && s.allineata)) return typeof Revisioni !== 'undefined' && Revisioni.dovutaDal(carta) ? 'Mai studiata · da ripassare (il set è già stato ripassato)' : 'Mai studiata';
        const v = `${s.ultimaValutazione == null ? 'Mai valutata' : `Valutata ${VALUTAZIONI[s.ultimaValutazione].nome}`} · N° Rep ${s.rep || 0}${s.allineata ? ' (come il set)' : ''}`;
        if (daRipassare(carta)) return v + ' · da ripassare';
        return v + ' · prossima revisione ' + distanzaGiorni(prossima(carta));
    }

    return {
        SCARSO, OK, BUONO, PERFETTO, VALUTAZIONI,
        statoIniziale, normalizza, intervallo, valuta, conValutazione, prossima, anteprima,
        stato, valutazione, categoria, daRipassare, descrivi,
    };
})();
