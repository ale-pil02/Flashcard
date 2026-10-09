// Disposizione dei nodi di una mappa e forma dei collegamenti.
//
// L'editor passa un albero di riquadri già misurati:
//   b = { id, w, h, ext: { alto, basso, sx, dx }, livello, sotto, modo, figli: [b], lato, off, fx, fy, raccordo }
//   ext = ingombro con le etichette, rispetto all'angolo del nodo (alto ≤ 0, basso ≥ h, sx ≤ 0, dx ≥ w);
//   sotto = nodo sottolineato (la linea arriva sulla riga sotto il testo); modo = disposizione scelta su quel nodo
//   (null = come il padre); off = distanza del centro da quello del genitore, se il genitore è in disposizione libera;
//   fx, fy = centro dei nodi liberi (fuori dall'albero); raccordo = { nodi: [id dei fratelli raccolti], graffa }
// e riceve x, y (angolo in alto a sinistra), dir = come il nodo si attacca al padre
// ('centro' | 'd' | 's' | 'giu' | 'su' | 'lineare' | 'radiale' | 'libera'), verso = dove vanno i suoi figli
// e disp = la disposizione con cui li dispone.
//
// Ogni nodo può avere la sua disposizione (orizzontale, a destra, a sinistra, verticale, capovolta, lineare,
// radiale, libera); chi non la sceglie prende quella del padre (i figli di un nodo radiale crescono in orizzontale
// verso l'esterno). In quella libera i figli stanno dove li si è lasciati, alla loro distanza dal padre: spostando
// il padre si sposta tutto il ramo, e un figlio sta a destra o a sinistra secondo il lato dove lo si è messo.
// Si lavora a blocchi: ogni sottoalbero si dispone attorno al suo nodo e ne esce un rettangolo d'ingombro;
// il padre affianca i rettangoli dei figli secondo la propria disposizione, quindi i rami non si sovrappongono.
// Un raccordo (figlio che raccoglie alcuni fratelli, con linee o con una graffa) sta oltre l'ingombro dei fratelli
// raccolti, a metà della loro altezza: fratelli e raccordo si impilano come un blocco solo.

const Disposizione = (() => {

    // sp = spaziatura di tutta la mappa; fr = distanza tra fratelli (moltiplica solo lo spazio tra nodi con lo stesso padre).
    // Un nodo può avere la sua distanza tra i figli (n.fratelli, moltiplica quella della mappa)
    function distanze(sp, fr = 1) {
        return {
            oriz: { m: l => (l <= 1 ? 64 : 38) * sp, c: l => (l <= 1 ? 26 : 9) * sp * fr },
            vert: { m: l => (l <= 1 ? 64 : 44) * sp, c: l => (l <= 1 ? 34 : 16) * sp * fr },
            lin: { rientro: 30 * sp, sopra: 14 * sp, tra: 10 * sp * fr },
            rad: { minimo: 150 * sp },
            sp,
        };
    }
    const traFigli = n => (+n.fratelli > 0 ? limita(+n.fratelli, 0.1, 6) : 1);

    // Disposizione che un figlio eredita dal padre, con il lato (+1 destra, -1 sinistra) per chi va in orizzontale
    function perFiglio(f, modo, dir) {
        let m = f.modo || (['radiale', 'destra', 'sinistra'].includes(modo) ? 'orizzontale' : modo);
        let d = modo === 'libera' && f.off ? (f.off.dx < 0 ? -1 : 1) : dir;
        if (m === 'destra') { m = 'orizzontale'; d = 1; }
        else if (m === 'sinistra') { m = 'orizzontale'; d = -1; }
        return { m, d };
    }

    function unisci(b, fb, dx, dy) {
        b.x0 = Math.min(b.x0, fb.x0 + dx); b.y0 = Math.min(b.y0, fb.y0 + dy);
        b.x1 = Math.max(b.x1, fb.x1 + dx); b.y1 = Math.max(b.y1, fb.y1 + dy);
    }

    // Dispone il sottoalbero di n con n nell'origine: posizioni dei figli relative al padre (rx, ry) e blocco d'ingombro.
    // lati = 'auto' | 'orario' solo per la radice in orizzontale: rami principali divisi tra destra e sinistra
    function disponi(n, modo, dir, o, lati = null) {
        if (modo === 'destra') { modo = 'orizzontale'; dir = 1; lati = null; }
        if (modo === 'sinistra') { modo = 'orizzontale'; dir = -1; lati = null; }
        const orizz = modo === 'orizzontale' || modo === 'libera';
        const dueLati = orizz && (lati === 'auto' || lati === 'orario');
        n.disp = modo;
        n.verso = dueLati ? 'centro' : orizz ? (dir > 0 ? 'd' : 's') : modo === 'verticale' ? 'giu' : modo;
        n.blocco = { x0: n.ext.sx, y0: n.ext.alto, x1: n.ext.dx, y1: n.ext.basso };
        if (!n.figli.length) return;
        const liv = n.livello + 1;
        if (modo === 'verticale' || modo === 'su') riga(n, modo, o, liv);
        else if (modo === 'lineare') lista(n, o);
        else if (modo === 'radiale') cerchio(n, o);
        else if (modo === 'libera') libero(n, dir, o, liv, dueLati ? lati : null);
        else if (dueLati) divisi(n, o, lati, 'orizzontale');
        else {
            n.figli.forEach(f => { const x = perFiglio(f, modo, dir); disponi(f, x.m, x.d, o); });
            colonna(n, n.figli, dir, o, liv);
        }
        n.figli.forEach(f => unisci(n.blocco, f.blocco, f.rx, f.ry));
    }

    // Figli → unità da impilare: { membri: [fratelli in ordine], extra: [raccordi che li raccolgono] }.
    // Un raccordo prende i fratelli dal primo all'ultimo che raccoglie; raccordi con fratelli in comune stanno insieme.
    // Un raccordo senza nessuno dei suoi fratelli in questo elenco si dispone come un figlio normale.
    function unita(figli) {
        const raccoglie = f => !!f.raccordo && f.raccordo.nodi.some(id => figli.some(x => x.id === id && !x.raccordo));
        const normali = figli.filter(f => !raccoglie(f));
        const indice = new Map(normali.map((f, i) => [f.id, i]));
        const gruppi = figli.filter(raccoglie).map(f => {
            const ii = f.raccordo.nodi.map(id => indice.get(id)).filter(i => i != null);
            return { da: Math.min(...ii), a: Math.max(...ii), extra: [f] };
        }).sort((x, y) => x.da - y.da);
        const uniti = [];
        gruppi.forEach(g => {
            const u = uniti[uniti.length - 1];
            if (u && g.da <= u.a) { u.a = Math.max(u.a, g.a); u.extra.push(...g.extra); } else uniti.push(g);
        });
        const out = [];
        for (let i = 0, k = 0; i < normali.length;) {
            const g = uniti[k];
            if (g && g.da === i) { out.push({ membri: normali.slice(g.da, g.a + 1), extra: g.extra }); i = g.a + 1; k++; }
            else { out.push({ membri: [normali[i]], extra: [] }); i++; }
        }
        return out;
    }

    // Impila le unità lungo un asse ('y' in colonna, 'x' in riga) a partire da 0; i raccordi di un'unità stanno
    // in pila tra loro, centrati sui fratelli che raccolgono
    function impila(uu, asse, gap) {
        const k0 = asse + '0', k1 = asse + '1', r = 'r' + asse, lato = asse === 'y' ? 'h' : 'w';
        const lun = f => f.blocco[k1] - f.blocco[k0];
        const meta = (p, u) => (p[r] + p[lato] / 2 + u[r] + u[lato] / 2) / 2;
        let pos = 0;
        uu.forEach(u => {
            let t = 0;
            u.membri.forEach(f => { f[r] = t - f.blocco[k0]; t += lun(f) + gap; });
            let inizio = 0, fine = t - gap;
            if (u.extra.length) {
                let e = 0;
                u.extra.forEach(f => { f[r] = e - f.blocco[k0]; e += lun(f) + gap; });
                const sposta = meta(u.membri[0], u.membri[u.membri.length - 1]) - meta(u.extra[0], u.extra[u.extra.length - 1]);
                u.extra.forEach(f => {
                    f[r] += sposta;
                    inizio = Math.min(inizio, f[r] + f.blocco[k0]);
                    fine = Math.max(fine, f[r] + f.blocco[k1]);
                });
            }
            [...u.membri, ...u.extra].forEach(f => { f[r] += pos - inizio; });
            pos += fine - inizio + gap;
        });
    }

    // Sull'altro asse i raccordi vanno oltre l'ingombro dei fratelli raccolti (verso +1 dopo, -1 prima), con lo
    // spazio per la graffa
    function oltre(uu, asse, verso, o) {
        const k0 = asse + '0', k1 = asse + '1', r = 'r' + asse;
        uu.forEach(u => {
            if (!u.extra.length) return;
            const bordo = verso > 0 ? Math.max(...u.membri.map(f => f[r] + f.blocco[k1])) : Math.min(...u.membri.map(f => f[r] + f.blocco[k0]));
            const gap = (u.extra.some(f => f.raccordo.graffa) ? 64 : 56) * o.sp;
            u.extra.forEach(f => { f[r] = verso > 0 ? bordo + gap - f.blocco[k0] : bordo - gap - f.blocco[k1]; });
        });
    }

    const primoUltimo = uu => [uu[0].membri[0], uu[uu.length - 1].membri[uu[uu.length - 1].membri.length - 1]];

    // Figli in colonna a destra (dir +1) o a sinistra (-1); il padre sta a metà tra il primo e l'ultimo figlio
    function colonna(n, figli, dir, o, liv) {
        if (!figli.length) return;
        const g = o.oriz.c(liv) * traFigli(n), gm = o.oriz.m(liv);
        const uu = unita(figli);
        impila(uu, 'y', g);
        const [p, u] = primoUltimo(uu);
        const sposta = n.h / 2 - (p.ry + p.h / 2 + u.ry + u.h / 2) / 2;
        uu.forEach(x => x.membri.forEach(f => { f.rx = dir > 0 ? n.ext.dx + gm - f.blocco.x0 : n.ext.sx - gm - f.blocco.x1; }));
        oltre(uu, 'x', dir, o);
        figli.forEach(f => {
            f.ry += sposta;
            f.dir = dir > 0 ? 'd' : 's';
        });
    }

    // Radice in orizzontale: in ordine a destra finché non si arriva a metà dell'altezza, poi a sinistra
    // (in senso orario: a sinistra dal basso verso l'alto); chi ha un lato scelto a mano ci resta
    function divisi(n, o, lati, base, figli = n.figli) {
        figli.forEach(f => { const x = perFiglio(f, base, 1); disponi(f, x.m, x.d, o); });
        // Fratelli raccolti e raccordi restano dallo stesso lato (quello del primo fratello)
        const uu = unita(figli);
        const alt = u => u.membri.reduce((s, f) => s + f.blocco.y1 - f.blocco.y0, 0);
        const totale = uu.reduce((s, u) => s + alt(u), 0);
        const destra = [], sinistra = [];
        let somma = 0, aSinistra = false;
        uu.forEach(u => {
            let lato = u.membri[0].lato;
            if (!lato) {
                if (!aSinistra && somma + alt(u) / 2 > totale / 2 && destra.length) aSinistra = true;
                lato = aSinistra ? 's' : 'd';
            }
            if (lato === 'd') { destra.push(...u.membri, ...u.extra); somma += alt(u); } else sinistra.push(...u.membri, ...u.extra);
        });
        // A sinistra i rami si ridispongono verso sinistra (salvo chi ha scelto un lato fisso)
        sinistra.forEach(f => { const x = perFiglio(f, base, -1); if (x.d < 0) disponi(f, x.m, x.d, o); });
        if (lati === 'orario') sinistra.reverse();
        colonna(n, destra, 1, o, 1);
        colonna(n, sinistra, -1, o, 1);
    }

    // Verticale (giù) o capovolta (su): figli in riga, il padre a metà tra il primo e l'ultimo
    function riga(n, modo, o, liv) {
        n.figli.forEach(f => { const x = perFiglio(f, modo, 1); disponi(f, x.m, x.d, o); });
        const su = modo === 'su';
        const g = o.vert.c(liv) * traFigli(n), gm = o.vert.m(liv);
        const uu = unita(n.figli);
        impila(uu, 'x', g);
        const [p, u] = primoUltimo(uu);
        const sposta = n.w / 2 - (p.rx + p.w / 2 + u.rx + u.w / 2) / 2;
        uu.forEach(x => x.membri.forEach(f => { f.ry = su ? n.ext.alto - gm - f.blocco.y1 : n.ext.basso + gm - f.blocco.y0; }));
        oltre(uu, 'y', su ? -1 : 1, o);
        n.figli.forEach(f => {
            f.rx += sposta;
            f.dir = su ? 'su' : 'giu';
        });
    }

    // Lineare: elenco sotto il padre, rientrato
    function lista(n, o) {
        n.figli.forEach(f => { const x = perFiglio(f, 'lineare', 1); disponi(f, x.m, x.d, o); });
        const uu = unita(n.figli);
        impila(uu, 'y', o.lin.tra * traFigli(n));
        uu.forEach(x => x.membri.forEach(f => { f.rx = o.lin.rientro - f.blocco.x0; f.dir = 'lineare'; }));
        oltre(uu, 'x', 1, o);
        n.figli.forEach(f => { f.ry += n.ext.basso + o.lin.sopra; });
        uu.forEach(x => x.extra.forEach(f => { f.dir = 'd'; }));
    }

    // Radiale: figli in cerchio attorno al padre, ognuno con uno spicchio proporzionale al suo ramo;
    // i loro rami crescono in orizzontale verso l'esterno
    function cerchio(n, o) {
        const dim = f => Math.hypot(f.blocco.x1 - f.blocco.x0, f.blocco.y1 - f.blocco.y0) * 0.75 + 20 * o.sp;
        n.figli.forEach(f => { const x = perFiglio(f, 'radiale', 1); disponi(f, x.m, x.d, o); });
        const totale = n.figli.reduce((s, f) => s + dim(f), 0);
        const raggio = Math.max(o.rad.minimo + Math.max(n.w, n.h) / 2, totale / (2 * Math.PI));
        const c = { x: n.w / 2, y: n.h / 2 };
        let a = -Math.PI / 2;
        n.figli.forEach(f => {
            const spicchio = 2 * Math.PI * dim(f) / totale;
            const angolo = n.figli.length === 1 ? 0 : a + spicchio / 2;
            a += spicchio;
            const x = perFiglio(f, 'radiale', Math.cos(angolo) >= -0.05 ? 1 : -1);
            if (x.d < 0) disponi(f, x.m, x.d, o);
            f.rx = c.x + Math.cos(angolo) * raggio - f.w / 2;
            f.ry = c.y + Math.sin(angolo) * raggio - f.h / 2;
            f.dir = 'radiale';
        });
    }

    // Libera: i figli già spostati a mano stanno alla loro distanza dal padre; gli altri si mettono in colonna
    // (o ai due lati, per la radice) come nella disposizione orizzontale
    function libero(n, dir, o, liv, lati) {
        const fermi = n.figli.filter(f => f.off);
        const altri = n.figli.filter(f => !f.off);
        fermi.forEach(f => { const x = perFiglio(f, 'libera', dir); disponi(f, x.m, x.d, o); });
        if (lati) divisi(n, o, lati, 'libera', altri);
        else {
            altri.forEach(f => { const x = perFiglio(f, 'libera', dir); disponi(f, x.m, x.d, o); });
            colonna(n, altri, dir, o, liv);
        }
        fermi.forEach(f => {
            f.rx = n.w / 2 + f.off.dx - f.w / 2;
            f.ry = n.h / 2 + f.off.dy - f.h / 2;
            f.dir = 'libera';
        });
    }

    function assoluti(n) {
        n.figli.forEach(f => { f.x = n.x + f.rx; f.y = n.y + f.ry; assoluti(f); });
    }

    function calcola(r, liberi, { tipo = 'orizzontale', direzione = 'auto', spaziatura = 1, fratelli = 1 } = {}) {
        const o = distanze(limita(spaziatura || 1, 0.5, 2.5), limita(+fratelli || 1, 0.1, 6));
        const modo = r.modo || tipo;
        const orizz = modo === 'orizzontale' || modo === 'libera';
        disponi(r, modo === 'orizzontale' && ['destra', 'sinistra'].includes(direzione) ? direzione : modo, 1, o, orizz ? direzione : null);
        r.x = -r.w / 2;
        r.y = -r.h / 2;
        r.dir = 'centro';
        assoluti(r);

        // Nodi liberi: ognuno è la cima di un alberello (di solito verso destra) attorno al suo centro salvato;
        // senza posizione vanno sotto la mappa
        let sotto = limiti([r]).y1 + 60 * o.sp;
        liberi.forEach(l => {
            const ml = l.modo || (tipo === 'libera' ? 'libera' : 'destra');
            disponi(l, ml === 'orizzontale' ? 'destra' : ml, 1, o, null);
            const fx = l.fx != null ? l.fx : l.w / 2, fy = l.fy != null ? l.fy : sotto - l.blocco.y0 + l.h / 2;
            l.x = fx - l.w / 2;
            l.y = fy - l.h / 2;
            l.dir = 'centro';
            assoluti(l);
            sotto = Math.max(sotto, limiti([l]).y1 + 40 * o.sp);
        });
    }

    // Rettangolo che contiene i nodi (con etichette e immagini, anche quelle fluttuanti: extTutto) di tutti gli alberi dati
    function limiti(radici) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const visita = n => {
            const e = n.extTutto || n.ext;
            x0 = Math.min(x0, n.x + e.sx); y0 = Math.min(y0, n.y + e.alto);
            x1 = Math.max(x1, n.x + e.dx); y1 = Math.max(y1, n.y + e.basso);
            n.figli.forEach(visita);
        };
        radici.forEach(visita);
        if (x0 === Infinity) return { x0: 0, y0: 0, x1: 0, y1: 0 };
        return { x0, y0, x1, y1 };
    }

    // ---- Collegamenti -------------------------------------------------------------------------

    function centro(n) { return { x: n.x + n.w / 2, y: n.y + n.h / 2 }; }

    // Punto d'attacco sul lato del nodo; i nodi sottolineati si attaccano alla riga sotto il testo
    function attacco(n, lato) {
        const c = centro(n);
        if (lato === 'd') return { x: n.x + n.w, y: n.sotto ? n.y + n.h : c.y };
        if (lato === 's') return { x: n.x, y: n.sotto ? n.y + n.h : c.y };
        if (lato === 'giu') return { x: c.x, y: n.y + n.h };
        return { x: c.x, y: n.y };
    }

    const piegaValida = q => !!q && !!q.c1 && !!q.c2 && [q.c1.dx, q.c1.dy, q.c2.dx, q.c2.dy].every(Number.isFinite);

    // Curva con i punti di controllo scelti a mano (relativi ai due estremi): resta attaccata ai due nodi
    function piegato(a, b, q, orizz) {
        const c1 = { x: a.x + q.c1.dx, y: a.y + q.c1.dy }, c2 = { x: b.x + q.c2.dx, y: b.y + q.c2.dy };
        return { a, b, c1, c2, orizzontale: orizz, piegata: true, d: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}` };
    }

    // Collegamento genitore → figlio: { orizzontale, a, b, d } con forma 'curva' | 'ortogonale' | 'arrotondata' | 'dritta';
    // piega = punti di controllo scelti a mano (la linea diventa una curva libera); percorso = punti di passaggio scelti
    // a mano (vedi percorsoValido): la linea passa da tutti, lasciando e raggiungendo i nodi dal loro lato
    function arco(p, f, forma, piega = null, percorso = null) {
        if (!piegaValida(piega)) piega = null;
        if (!percorsoValido(percorso)) percorso = null;
        let a, b, orizz = true;
        const pc = centro(p), fc = centro(f);
        // Disposizione libera: la linea si attacca sempre di lato (a destra o a sinistra, da dove sta il figlio), anche
        // se il figlio sta sopra o sotto; sopra o sotto solo se il figlio dispone i suoi in verticale o capovolti
        const dir = f.dir === 'libera'
            ? (f.verso === 'giu' || f.verso === 'su' ? (fc.y >= pc.y ? 'giu' : 'su') : (fc.x >= pc.x ? 'd' : 's'))
            : f.dir === 'radiale' || !f.dir
                ? (Math.abs(fc.x - pc.x) >= Math.abs(fc.y - pc.y) * 0.6 ? (fc.x >= pc.x ? 'd' : 's') : (fc.y >= pc.y ? 'giu' : 'su'))
                : f.dir;
        if (dir === 'lineare') {
            a = { x: p.x + Math.min(16, p.w / 2), y: p.y + p.h };
            b = { x: f.x, y: f.sotto ? f.y + f.h : fc.y };
            if (percorso) return { ...curvaPer(a, b, daPercorso(a, b, percorso), { x: 0, y: 1 }, { x: 1, y: 0 }), orizzontale: true };
            if (piega) return piegato(a, b, piega, true);
            const r = Math.min(8, Math.abs(b.y - a.y) / 2, Math.abs(b.x - a.x));
            return { a, b, orizzontale: true, d: `M${a.x},${a.y} V${b.y - r} Q${a.x},${b.y} ${a.x + r},${b.y} H${b.x}`, angolare: true };
        }
        if (dir === 'd' || dir === 's') {
            a = attacco(p, dir);
            b = attacco(f, dir === 'd' ? 's' : 'd');
        } else {
            orizz = false;
            a = attacco(p, dir === 'giu' ? 'giu' : 'su');
            b = attacco(f, dir === 'giu' ? 'su' : 'giu');
        }
        if (percorso) {
            const via = orizz ? { x: dir === 's' ? -1 : 1, y: 0 } : { x: 0, y: dir === 'su' ? -1 : 1 };
            return { ...curvaPer(a, b, daPercorso(a, b, percorso), via, via), orizzontale: orizz };
        }
        if (piega) return piegato(a, b, piega, orizz);
        if (forma === 'dritta') return { a, b, orizzontale: orizz, d: `M${a.x},${a.y} L${b.x},${b.y}` };
        if (forma === 'arrotondata') {
            const r = Math.max(0, Math.min(12, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2));
            const sx = Math.sign(b.x - a.x) || 1, sy = Math.sign(b.y - a.y) || 1;
            const d = orizz
                ? `M${a.x},${a.y} H${(a.x + b.x) / 2 - sx * r} Q${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${a.y + sy * r} V${b.y - sy * r} Q${(a.x + b.x) / 2},${b.y} ${(a.x + b.x) / 2 + sx * r},${b.y} H${b.x}`
                : `M${a.x},${a.y} V${(a.y + b.y) / 2 - sy * r} Q${a.x},${(a.y + b.y) / 2} ${a.x + sx * r},${(a.y + b.y) / 2} H${b.x - sx * r} Q${b.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2 + sy * r} V${b.y}`;
            return { a, b, orizzontale: orizz, d, angolare: true };
        }
        if (forma === 'ortogonale') {
            const d = orizz
                ? `M${a.x},${a.y} H${(a.x + b.x) / 2} V${b.y} H${b.x}`
                : `M${a.x},${a.y} V${(a.y + b.y) / 2} H${b.x} V${b.y}`;
            return { a, b, orizzontale: orizz, d, angolare: true };
        }
        const k = 0.5;
        const c1 = orizz ? { x: a.x + (b.x - a.x) * k, y: a.y } : { x: a.x, y: a.y + (b.y - a.y) * k };
        const c2 = orizz ? { x: b.x - (b.x - a.x) * k, y: b.y } : { x: b.x, y: b.y - (b.y - a.y) * k };
        return { a, b, c1, c2, orizzontale: orizz, d: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}` };
    }

    function puntoBezier(a, c1, c2, b, t) {
        const u = 1 - t;
        return {
            x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
            y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
        };
    }

    // Linea che si assottiglia da w0 a w1: un nastro chiuso attorno alla curva (anche fatta di più tratti)
    function nastro(arc, w0, w1) {
        const tratti = arc.segmenti || [{ a: arc.a, c1: arc.c1, c2: arc.c2, b: arc.b }];
        const N = 18, tot = tratti.length * N, sx = [], dx = [];
        tratti.forEach((g, k) => {
            for (let i = k ? 1 : 0; i <= N; i++) {
                const t = i / N;
                const p = puntoBezier(g.a, g.c1, g.c2, g.b, t);
                const q = puntoBezier(g.a, g.c1, g.c2, g.b, Math.min(1, t + 0.01));
                const r = puntoBezier(g.a, g.c1, g.c2, g.b, Math.max(0, t - 0.01));
                let tx = q.x - r.x, ty = q.y - r.y;
                const l = Math.hypot(tx, ty) || 1;
                tx /= l; ty /= l;
                const w = (w0 + (w1 - w0) * (k * N + i) / tot) / 2;
                sx.push(`${(p.x - ty * w).toFixed(1)},${(p.y + tx * w).toFixed(1)}`);
                dx.push(`${(p.x + ty * w).toFixed(1)},${(p.y - tx * w).toFixed(1)}`);
            }
        });
        return `M${sx.join(' L')} L${dx.reverse().join(' L')} Z`;
    }

    // ---- Linee con i punti di passaggio scelti a mano ------------------------------------------
    // Un punto è { u, v } nel riferimento del segmento da A a B: P = A + u·(B − A) + v·(B − A) ruotato di 90°. Così,
    // quando i nodi si spostano, il percorso si sposta, gira e si allunga con loro mantenendo la sua forma.

    const percorsoValido = punti => Array.isArray(punti) && punti.length > 0 && punti.every(q => q && Number.isFinite(q.u) && Number.isFinite(q.v));

    function daPercorso(A, B, punti) {
        const dx = B.x - A.x, dy = B.y - A.y;
        return punti.map(q => ({ x: A.x + q.u * dx - q.v * dy, y: A.y + q.u * dy + q.v * dx }));
    }

    function inPercorso(A, B, P) {
        const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
        const rx = P.x - A.x, ry = P.y - A.y;
        const tondo = v => Math.round(v * 10000) / 10000;
        return { u: tondo((rx * dx + ry * dy) / l2), v: tondo((ry * dx - rx * dy) / l2) };
    }

    // Curva morbida che passa da a, dai punti e da b (Catmull-Rom in tratti di Bézier). viaA / viaB = direzione con cui
    // la linea lascia a e arriva in b (per i rami: dal lato del nodo); senza, verso il punto vicino
    function curvaPer(a, b, punti, viaA = null, viaB = null) {
        const P = [a, ...punti, b];
        const n = P.length;
        const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
        const T = P.map((p, i) => {
            if (i === 0) return viaA ? { x: viaA.x * dist(P[0], P[1]), y: viaA.y * dist(P[0], P[1]) } : { x: P[1].x - P[0].x, y: P[1].y - P[0].y };
            if (i === n - 1) return viaB ? { x: viaB.x * dist(P[n - 2], P[n - 1]), y: viaB.y * dist(P[n - 2], P[n - 1]) } : { x: P[n - 1].x - P[n - 2].x, y: P[n - 1].y - P[n - 2].y };
            return { x: (P[i + 1].x - P[i - 1].x) / 2, y: (P[i + 1].y - P[i - 1].y) / 2 };
        });
        const segmenti = [];
        for (let i = 0; i < n - 1; i++) {
            segmenti.push({ a: P[i], c1: { x: P[i].x + T[i].x / 3, y: P[i].y + T[i].y / 3 }, c2: { x: P[i + 1].x - T[i + 1].x / 3, y: P[i + 1].y - T[i + 1].y / 3 }, b: P[i + 1] });
        }
        const f = v => v.toFixed(1);
        const d = `M${f(a.x)},${f(a.y)} ` + segmenti.map(g => `C${f(g.c1.x)},${f(g.c1.y)} ${f(g.c2.x)},${f(g.c2.y)} ${f(g.b.x)},${f(g.b.y)}`).join(' ');
        return { a, b, c1: segmenti[0].c1, c2: segmenti[segmenti.length - 1].c2, segmenti, punti, d, conPercorso: true };
    }

    // Il punto della linea più vicino a q: { i (tratto), t, p, distanza }
    function vicinoSuCurva(arc, q) {
        const tratti = arc.segmenti || [{ a: arc.a, c1: arc.c1, c2: arc.c2, b: arc.b }];
        let migliore = { distanza: Infinity };
        tratti.forEach((g, i) => {
            for (let k = 0; k <= 40; k++) {
                const p = puntoBezier(g.a, g.c1, g.c2, g.b, k / 40), d = Math.hypot(p.x - q.x, p.y - q.y);
                if (d < migliore.distanza) migliore = { i, t: k / 40, p, distanza: d };
            }
        });
        return migliore;
    }

    // Graffa lungo un lato, da a a b (dall'alto in basso o da sinistra a destra), con la punta verso
    // 'd' | 's' | 'giu' | 'su' a distanza w; restituisce il percorso e la punta
    function graffa(a, b, verso, w = 14) {
        const vert = verso === 'd' || verso === 's';
        const s = verso === 'd' || verso === 'giu' ? 1 : -1;
        const L = Math.max(1, vert ? b.y - a.y : b.x - a.x);
        const h = w / 2, m = L / 2, r = Math.min(h, L / 4);
        // u lungo il lato, v verso la punta
        const P = (u, v) => (vert ? `${(a.x + s * v).toFixed(1)},${(a.y + u).toFixed(1)}` : `${(a.x + u).toFixed(1)},${(a.y + s * v).toFixed(1)}`);
        const d = `M${P(0, 0)} Q${P(0, h)} ${P(r, h)} L${P(m - r, h)} Q${P(m, h)} ${P(m, w)} Q${P(m, h)} ${P(m + r, h)} L${P(L - r, h)} Q${P(L, h)} ${P(L, 0)}`;
        return { d, punta: vert ? { x: a.x + s * w, y: a.y + m } : { x: a.x + m, y: a.y + s * w } };
    }

    // Punto sul bordo del riquadro n nella direzione del punto q (per relazioni e disposizioni libere)
    function bordoVerso(n, q) {
        const c = centro(n);
        const dx = q.x - c.x, dy = q.y - c.y;
        if (!dx && !dy) return c;
        const s = Math.min(dx ? (n.w / 2 + 3) / Math.abs(dx) : Infinity, dy ? (n.h / 2 + 3) / Math.abs(dy) : Infinity);
        return { x: c.x + dx * s, y: c.y + dy * s };
    }

    return {
        calcola, limiti, arco, nastro, graffa, centro, attacco, bordoVerso, puntoBezier, piegaValida,
        percorsoValido, daPercorso, inPercorso, curvaPer, vicinoSuCurva,
    };
})();
