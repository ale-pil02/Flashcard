// Ripetizione spaziata delle carte: la stessa delle revisioni dei set (js/revisioni.js). Ogni carta (e ogni riga delle
// revisioni) ha N° Rep, ultimo ripasso e intervallo; prossima revisione = ultimo ripasso + intervallo.
// Nei ripassi l'intervallo dipende da quando ripassi, non solo dal N° Rep. Cambiando il N° Rep a mano invece
// l'intervallo torna quello della sequenza per quella rep (come la formula di Notion).
//
// Sequenza degli intervalli (Impostazioni, predefinita Fibonacci 1, 2, 3, 5, 8, 13, 21): ripassando sempre il giorno
// previsto e bene, dopo la rep 1 si aspetta il primo numero, dopo la rep 2 il secondo, e così via; dopo l'ultimo gli
// intervalli crescono con il rapporto degli ultimi due. Il "ritmo" r di un intervallo I è il rapporto del tratto della
// sequenza in cui cade (I = 8 → 13/8): il passo successivo è I × r, e su un numero della sequenza dà il numero dopo.
//
// Ripasso che conta, P = giorni passati dall'ultimo ripasso, I = intervallo previsto (dopoRipasso):
// - il giorno previsto (P = I): I × r;
// - in anticipo (P < I): la data prevista più la parte di intervallo "guadagnata", P / I di I × r: I + P × (r − 1) da
//   oggi; la data va avanti, ma meno che con un ripasso puntuale;
// - in ritardo (P > I) dipende da com'è andata (esito). Ricordare bene dopo più tempo del previsto dice che la memoria
//   è più solida (come in Anki): Perfetto (o set Ottimo) P × r, cioè conta tutto il tempo passato; Buono (o set Buono)
//   (I + ritardo / 2) × r, conta metà del ritardo. Se è andata così così (Ok, o set Ok, Scarso, Incompleto) nel
//   frattempo hai dimenticato qualcosa: I × r × I / P, più hai aspettato più la prossima si avvicina;
// - lo stesso giorno dell'ultimo ripasso (P = 0): N° Rep +1, intervallo e date restano.
// Arrotondato ai giorni, minimo 1. La prima volta: il primo numero della sequenza (1 giorno).
//
// Quattro valutazioni: Scarso, Ok, Buono, Perfetto.
// - Buono o Perfetto: la formula qui sopra (differiscono solo in ritardo); la carta è imparata.
// - Ok: la stessa formula con metà crescita (r → 1 + (r − 1) / 2), arrotondata per difetto così torna sempre un po'
//   prima che con Buono (anche con gli intervalli piccoli), finché non le dai Buono o Perfetto.
// - Scarso: N° Rep e ultimo ripasso restano, l'intervallo scende a un terzo (dopo un errore servono intervalli corti
//   per un po') e la carta è da ripassare subito (daRifareDal) finché non le dai almeno Ok. Quel ripasso la
//   "recupera": N° Rep +1, ultimo ripasso = oggi e l'intervallo riparte da quello ridotto.
// Nella sessione Ok e Scarso tornano in fondo alla coda finché non dai Buono o Perfetto (js/viste/studio.js); solo la
// prima valutazione di una carta nella sessione muove N° Rep e date, quelle dopo (i ritorni in fondo) cambiano solo la
// valutazione. Eccezione: se la prima era Scarso, la prima volta che arriva almeno a Ok la recupera.
// Il ripasso di prova (scelto all'avvio dello studio) non cambia niente: né valutazione, né N° Rep, né date.
// La valutazione della carta è l'ultima data, o quella scelta a mano (editor, pagina del set): con quelle si calcola lo
// stato del set nelle revisioni. Cambiarla a mano non tocca le date (Scarso a mano rende la carta da ripassare da oggi;
// "mai valutata" la riporta tra le carte nuove). N° Rep, ultimo ripasso, intervallo e prossima revisione si cambiano
// anche a mano (Dati.aggiornaSrs).
// Allineata (riadeguata al set o ripassata Buono/Perfetto nel ripasso completo del set): ultimo ripasso e intervallo
// sono quelli del suo set; vale anche se è mai valutata, finché non la valuti di nuovo nello studio.

const Srs = (() => {
    const SCARSO = 0, OK = 1, BUONO = 2, PERFETTO = 3;

    const VALUTAZIONI = [
        { valore: SCARSO, chiave: 'scarso', nome: 'Scarso' },
        { valore: OK, chiave: 'ok', nome: 'Ok' },
        { valore: BUONO, chiave: 'buono', nome: 'Buono' },
        { valore: PERFETTO, chiave: 'perfetto', nome: 'Perfetto' },
    ];

    const SEQUENZE = {
        fibonacci: { nome: 'Fibonacci', numeri: [1, 2, 3, 5, 8, 13, 21] },
        raddoppio: { nome: 'Raddoppio', numeri: [1, 2, 4, 8, 16, 32] },
    };
    const SEQUENZA_PREDEFINITA = SEQUENZE.fibonacci.numeri;
    const MAX_GIORNI = 36500;   // oltre i cent'anni l'intervallo non cambia più niente

    // ---- Sequenza degli intervalli -------------------------------------------------------

    // Almeno due numeri interi da 1 in su, in ordine crescente; se no null
    function sequenzaValida(lista) {
        if (!Array.isArray(lista) || lista.length < 2) return null;
        const numeri = lista.map(Number);
        if (numeri.some((n, i) => !Number.isInteger(n) || n < 1 || n > MAX_GIORNI || (i && n <= numeri[i - 1]))) return null;
        return numeri;
    }

    // "1, 2, 3, 5" (anche con spazi o punti e virgola) → [1, 2, 3, 5], oppure null
    function leggiSequenza(testo) {
        const pezzi = String(testo || '').split(/[\s,;]+/).filter(Boolean);
        return pezzi.every(p => /^\d+$/.test(p)) ? sequenzaValida(pezzi) : null;
    }

    function sequenza() {
        const scelta = typeof Dati !== 'undefined' ? sequenzaValida(Dati.impostazioni().sequenzaRevisioni) : null;
        return scelta || SEQUENZA_PREDEFINITA;
    }

    function giorni(x) {
        const n = Math.round(+x);
        return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_GIORNI) : null;
    }

    const arrotonda = x => limita(Math.round(x), 1, MAX_GIORNI);

    // Rapporto del tratto [seq[k], seq[k+1]) in cui cade I (sotto il primo numero il primo tratto, dopo l'ultimo l'ultimo)
    function ritmo(I, seq = sequenza()) {
        let k = 0;
        while (k < seq.length - 2 && I >= seq[k + 1]) k++;
        return seq[k + 1] / seq[k];
    }

    // Dopo uno Scarso l'intervallo scende a un terzo
    function dopoScarso(I) { return arrotonda(I / 3); }

    // L'intervallo dopo la rep n ripassando sempre puntuale: l'n-esimo numero della sequenza, poi a ritmo costante
    function intervalloPerRep(rep, seq = sequenza()) {
        const n = Math.max(1, rep || 0);
        if (n <= seq.length) return seq[n - 1];
        let I = seq[seq.length - 1];
        for (let i = seq.length; i < n && I < MAX_GIORNI; i++) I = arrotonda(I * ritmo(I, seq));
        return I;
    }

    // I primi n intervalli ripassando sempre puntuale (per mostrarli nelle impostazioni)
    function anteprimaSequenza(n = 10, seq = sequenza()) {
        return Array.from({ length: n }, (_, i) => intervalloPerRep(i + 1, seq));
    }

    // Intervallo di una carta o di un argomento. I dati di prima di questa versione non l'avevano: era 2^(N° Rep − 1)
    function intervalloRaddoppio(rep) { return Math.pow(2, Math.min(16, Math.max(1, rep || 0) - 1)); }
    function intervalloDi(intervallo, rep) { return giorni(intervallo) || intervalloRaddoppio(rep); }

    // ---- Ritardi e anticipi ------------------------------------------------------------

    // Rispetto al giorno previsto: { tipo: 'stesso-giorno' | 'anticipo' | 'puntuale' | 'ritardo', giorni, prevista }
    function situazione({ giorno, intervallo }, oggi = chiaveGiorno()) {
        const prevista = aggiungiGiorni(daChiaveGiorno(giorno), intervallo);
        const passati = giorniTra(daChiaveGiorno(giorno), daChiaveGiorno(oggi));
        if (passati <= 0) return { tipo: 'stesso-giorno', giorni: 0, prevista };
        const scarto = passati - intervallo;
        return { tipo: scarto < 0 ? 'anticipo' : scarto > 0 ? 'ritardo' : 'puntuale', giorni: Math.abs(scarto), prevista };
    }

    // Com'è andato un ripasso, per la formula: 'perfetto' | 'buono' | 'ok' (carta Ok: metà crescita) | 'male' (set Ok,
    // Scarso o Incompleto, o segnato senza giudizio: in ritardo accorcia)
    const ESITI = ['perfetto', 'buono', 'ok', 'male'];
    function esitoDaValutazione(v) { return v === PERFETTO ? 'perfetto' : v === OK ? 'ok' : 'buono'; }
    function esitoDaStato(stato) { return stato === 'ottimo' ? 'perfetto' : stato === 'buono' ? 'buono' : 'male'; }

    // Dopo un ripasso che conta: { intervallo, giorno } (giorno = l'ultimo ripasso, da cui si conta l'intervallo)
    function dopoRipasso({ intervallo, giorno }, oggi = chiaveGiorno(), { esito = 'buono', seq = sequenza() } = {}) {
        if (!giorno) return { intervallo: seq[0], giorno: oggi };
        const I = giorni(intervallo) || seq[0];
        const P = giorniTra(daChiaveGiorno(giorno), daChiaveGiorno(oggi));
        if (P <= 0) return { intervallo: I, giorno };
        const ok = esito === 'ok';
        let r = ritmo(I, seq);
        if (ok) r = 1 + (r - 1) / 2;
        let nuovo;
        if (P <= I) nuovo = I + P * (r - 1);
        else if (esito === 'perfetto') nuovo = P * r;
        else if (esito === 'buono') nuovo = (I + (P - I) / 2) * r;
        else nuovo = r * I * I / P;
        // Ok per difetto: con gli intervalli piccoli l'arrotondamento lo farebbe tornare insieme a Buono
        return { intervallo: ok ? limita(Math.floor(nuovo), 1, MAX_GIORNI) : arrotonda(nuovo), giorno: oggi };
    }

    // ---- Stato delle carte ---------------------------------------------------------------

    function statoIniziale() {
        return {
            stato: 'nuova',            // nuova | apprendimento | imparata (l'ultima valutazione è Buono o Perfetto)
            ultimaValutazione: null,   // 0-3: la valutazione della carta, guida i colori e lo stato del set
            rep: 0,                    // N° Rep
            giorno: null,              // ultimo ripasso "AAAA-MM-GG" (da qui si conta la prossima revisione)
            intervallo: null,          // giorni dall'ultimo ripasso alla prossima revisione
            daRifareDal: null,         // valutata Scarso: da ripassare da questo giorno, finché non arriva almeno a Ok
            allineata: false,          // ultimo ripasso e intervallo presi dal set (riadeguata o ripassata con il set)
            ripetizioni: 0,            // risposte date in tutto
            errori: 0,
            ultimoRipasso: null,       // timestamp dell'ultima risposta
        };
    }

    // Stato dalla valutazione: chi non è mai stato valutato resta nuovo
    function statoDa(valutazione) { return valutazione == null ? 'nuova' : valutazione >= BUONO ? 'imparata' : 'apprendimento'; }

    // Porta al formato attuale uno stato delle versioni precedenti. Il primo sistema (intervalli in stile Vaia, senza
    // N° Rep) aveva un altro "intervallo": diventa il N° Rep più vicino, così la prossima revisione cade più o meno
    // quando cadeva prima. L'intervallo mancante vale 2^(N° Rep − 1), come nella versione a raddoppio
    function normalizza(srs) {
        const s = { ...statoIniziale(), ...(srs || {}) };
        if (!('rep' in (srs || {}))) {
            if (s.ultimaValutazione != null) {
                s.giorno = s.ultimoRipasso ? chiaveGiorno(s.ultimoRipasso) : chiaveGiorno();
                s.rep = s.stato === 'imparata' ? 1 + Math.max(0, Math.round(Math.log2(Math.max(1, +s.intervallo || 1)))) : 0;
            }
            s.intervallo = null;
        }
        s.intervallo = giorni(s.intervallo) || (s.giorno ? intervalloRaddoppio(s.rep) : null);
        s.stato = statoDa(s.ultimaValutazione);
        ['passi', 'facilita', 'scadenza', 'giornoRep'].forEach(k => delete s[k]);
        return s;
    }

    // Applica una valutazione e restituisce il nuovo stato, senza toccare quello di partenza.
    // date = false: ritorno della carta nella stessa sessione, cambia solo la valutazione
    function valuta(srs, valutazione, { date = true, ora = Date.now() } = {}) {
        const s = normalizza(srs);
        const oggi = chiaveGiorno(ora);
        // Mai valutata (anche se riadeguata al set): è il primo incontro, si parte dal primo intervallo
        const primaVolta = s.ultimaValutazione == null;
        s.ripetizioni += 1;
        s.ultimaValutazione = valutazione;
        s.ultimoRipasso = ora;
        s.stato = statoDa(valutazione);
        s.allineata = false;
        if (valutazione === SCARSO) {
            // N° Rep e ultimo ripasso restano, l'intervallo scende a un terzo; da ripassare da oggi
            s.errori += 1;
            if (date && s.giorno) s.intervallo = primaVolta ? sequenza()[0] : dopoScarso(intervalloDi(s.intervallo, s.rep));
            s.daRifareDal = oggi;
            return s;
        }
        const recupero = !!s.daRifareDal && !!s.giorno;
        s.daRifareDal = null;
        if (!date) return s;
        if (primaVolta) { s.intervallo = sequenza()[0]; s.giorno = oggi; }
        // Recupero dopo uno Scarso: riparte dall'intervallo ridotto, contato da oggi
        else if (recupero) { s.intervallo = intervalloDi(s.intervallo, s.rep); s.giorno = oggi; }
        else Object.assign(s, dopoRipasso({ intervallo: intervalloDi(s.intervallo, s.rep), giorno: s.giorno }, oggi, { esito: esitoDaValutazione(valutazione) }));
        s.rep += 1;
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
        if (s && s.allineata && s.giorno) return aggiungiGiorni(daChiaveGiorno(s.giorno), intervalloDi(s.intervallo, s.rep));
        if (!s || s.ultimaValutazione == null) return null;
        if (s.ultimaValutazione === SCARSO) return daChiaveGiorno(s.daRifareDal || chiaveGiorno(s.ultimoRipasso || Date.now()));
        return s.giorno ? aggiungiGiorni(daChiaveGiorno(s.giorno), intervalloDi(s.intervallo, s.rep)) : inizioGiorno();
    }

    function durata(g) {
        if (g < 30) return `${g} g`;
        if (g < 365) return `${Math.round(g / 30)} mes${Math.round(g / 30) === 1 ? 'e' : 'i'}`;
        return `${Math.round(g / 365)} ann${Math.round(g / 365) === 1 ? 'o' : 'i'}`;
    }

    // Testo breve sotto i pulsanti di valutazione: quando tornerà la carta
    function anteprima(srs, valutazione, { date = true } = {}) {
        if (valutazione < BUONO) return 'in fondo';
        if (!date) return 'fatta';
        return durata(Math.max(0, giorniTra(Date.now(), prossima({ srs: valuta(srs, valutazione) }))));
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
        const v = `${s.ultimaValutazione == null ? 'Mai valutata' : `Valutata ${VALUTAZIONI[s.ultimaValutazione].nome}`} · N° Rep ${s.rep || 0}${s.allineata ? ' (al passo con il set)' : ''}`;
        if (daRipassare(carta)) return v + ' · da ripassare';
        return v + ' · prossima revisione ' + distanzaGiorni(prossima(carta));
    }

    return {
        SCARSO, OK, BUONO, PERFETTO, VALUTAZIONI, SEQUENZE, SEQUENZA_PREDEFINITA, MAX_GIORNI,
        sequenzaValida, leggiSequenza, sequenza, giorni, ritmo, dopoScarso, intervalloPerRep, anteprimaSequenza,
        intervalloRaddoppio, intervalloDi, situazione, dopoRipasso, ESITI, esitoDaValutazione, esitoDaStato,
        statoIniziale, normalizza, valuta, conValutazione, prossima, anteprima, durata,
        stato, valutazione, categoria, daRipassare, descrivi,
    };
})();
