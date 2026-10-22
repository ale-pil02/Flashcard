// Lettura del codice dell'app per i test, senza librerie: trova i moduli (const Nome = (() => { … return { … }; })()
// e Viste.nome = { … }), le loro funzioni con il corpo, quelle che esportano, e quali funzioni cambiano i dati salvati.
// Commenti, stringhe ed espressioni regolari vengono "spenti" (sostituiti da spazi, a capo compresi) per non scambiarli
// per codice; le posizioni restano quelle del file, così il testo originale si ritrova sempre.

const fs = require('fs');
const path = require('path');
const { RADICE } = require('./app');

// ---- Codice senza commenti, stringhe e regex -------------------------------------------------------------------------

// Dopo questi caratteri o parole una "/" apre una regex, non è una divisione
const PRIMA_DI_REGEX = /(^|[(,=:[!&|?{};+\-*%<>~^]|\b(return|typeof|case|in|of|new|delete|void|throw|else|do|yield|await))\s*$/;

function spegni(sorgente) {
    const out = sorgente.split('');
    const n = sorgente.length;
    const vuota = (da, a) => { for (let k = da; k < a; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
    const template = [];   // profondità delle graffe a cui chiude ogni ${ aperto
    let graffe = 0;
    let i = 0;

    // Dentro un template dalla posizione i: si ferma alla ` di chiusura o all'inizio di ${
    function inTemplate(i0) {
        let j = i0;
        while (j < n && sorgente[j] !== '`' && !(sorgente[j] === '$' && sorgente[j + 1] === '{')) j += sorgente[j] === '\\' ? 2 : 1;
        vuota(i0, j);
        if (sorgente[j] === '$') { template.push(graffe); return j + 2; }
        return j + 1;
    }

    while (i < n) {
        const c = sorgente[i], d = sorgente[i + 1];
        if (c === '/' && d === '/') { const f = sorgente.indexOf('\n', i); const fine = f < 0 ? n : f; vuota(i, fine); i = fine; continue; }
        if (c === '/' && d === '*') { const f = sorgente.indexOf('*/', i + 2); const fine = f < 0 ? n : f + 2; vuota(i, fine); i = fine; continue; }
        if (c === '\'' || c === '"') {
            let j = i + 1;
            while (j < n && sorgente[j] !== c && sorgente[j] !== '\n') j += sorgente[j] === '\\' ? 2 : 1;
            vuota(i + 1, j);
            i = j + 1;
            continue;
        }
        if (c === '`') { i = inTemplate(i + 1); continue; }
        if (c === '}' && template.length && template[template.length - 1] === graffe) { template.pop(); i = inTemplate(i + 1); continue; }
        if (c === '/' && PRIMA_DI_REGEX.test(out.slice(Math.max(0, i - 12), i).join(''))) {
            let j = i + 1, classe = false;
            while (j < n && sorgente[j] !== '\n') {
                if (sorgente[j] === '\\') { j += 2; continue; }
                if (sorgente[j] === '[') classe = true;
                else if (sorgente[j] === ']') classe = false;
                else if (sorgente[j] === '/' && !classe) break;
                j++;
            }
            vuota(i + 1, j);
            i = j + 1;
            continue;
        }
        if (c === '{') graffe++;
        else if (c === '}') graffe--;
        i++;
    }
    return out.join('');
}

// Indice della parentesi che chiude quella in posizione i (nel testo spento)
function chiusura(testo, i) {
    const apre = testo[i], chiude = { '{': '}', '(': ')', '[': ']' }[apre];
    let p = 0;
    for (let k = i; k < testo.length; k++) {
        if (testo[k] === apre) p++;
        else if (testo[k] === chiude && --p === 0) return k;
    }
    return testo.length - 1;
}

// Riga (da 1) della posizione i
function riga(testo, i) { return testo.slice(0, i).split('\n').length; }

// Pezzi di [da, a) separati da "sep" al primo livello di parentesi: [{ da, a }]
function pezzi(spento, da, a, sep) {
    const out = [];
    let inizio = da, k = da;
    while (k < a) {
        const c = spento[k];
        if (c === '{' || c === '(' || c === '[') { k = chiusura(spento, k) + 1; continue; }
        if (sep.includes(c)) { out.push({ da: inizio, a: k }); inizio = k + 1; }
        k++;
    }
    out.push({ da: inizio, a });
    return out.filter(p => spento.slice(p.da, p.a).trim());
}

// ---- Moduli e funzioni ------------------------------------------------------------------------------------------------

const ID = '[A-Za-z_$][\\w$]*';

// Dichiarazioni al primo livello del corpo di un modulo [da, a): function nome(…) {…} e const/let nome = …;
function dichiarazioni(spento, da, a) {
    const out = [];
    let k = da;
    const reFun = new RegExp(`^(async\\s+)?function\\s*\\*?\\s*(${ID})\\s*\\(`);
    const reVar = new RegExp(`^(const|let|var)\\s+(${ID})\\s*=`);
    while (k < a) {
        const c = spento[k];
        if (c === '{' || c === '(' || c === '[') { k = chiusura(spento, k) + 1; continue; }
        const inizio = /[\s;{}]/.test(spento[k - 1] || ' ');
        const resto = inizio ? spento.slice(k, Math.min(a, k + 200)) : '';
        let m;
        if ((m = reFun.exec(resto))) {
            const graffa = spento.indexOf('{', chiusura(spento, k + m[0].length - 1));
            const fine = chiusura(spento, graffa) + 1;
            out.push({ nome: m[2], da: k, a: fine });
            k = fine;
            continue;
        }
        if ((m = reVar.exec(resto))) {
            let j = k + m[0].length;
            while (j < a && spento[j] !== ';') j = '{(['.includes(spento[j]) ? chiusura(spento, j) + 1 : j + 1;
            out.push({ nome: m[2], da: k, a: j + 1 });
            k = j + 1;
            continue;
        }
        k++;
    }
    return out;
}

// Elementi di un oggetto letterale { … } (graffa in posizione g): [{ nome, alias, da, a }]
// alias = nome della funzione locale per "a" e "a: b"; null quando il valore è scritto lì
function elementiOggetto(spento, g) {
    const fine = chiusura(spento, g);
    return pezzi(spento, g + 1, fine, ',').map(p => {
        const t = spento.slice(p.da, p.a).trim();
        let m;
        if ((m = new RegExp(`^(${ID})$`).exec(t))) return { nome: m[1], alias: m[1], ...p };
        if ((m = new RegExp(`^(${ID})\\s*:\\s*(${ID})$`).exec(t))) return { nome: m[1], alias: m[2], ...p };
        if ((m = new RegExp(`^(?:async\\s+)?(?:get\\s+|set\\s+)?(${ID})\\s*\\(`).exec(t))) return { nome: m[1], alias: null, ...p };
        if ((m = new RegExp(`^(${ID})\\s*:`).exec(t))) return { nome: m[1], alias: null, ...p };
        return null;
    }).filter(Boolean);
}

// L'ultimo "return { … }" al primo livello del corpo [da, a): posizione della graffa, o -1
function graffaDelReturn(spento, da, a) {
    let k = da, trovata = -1;
    while (k < a) {
        const c = spento[k];
        if (c === '{' || c === '(' || c === '[') { k = chiusura(spento, k) + 1; continue; }
        const m = /^return\s*\{/.exec(spento.slice(k, k + 30));
        if (m && /[\s;{}]/.test(spento[k - 1] || ' ')) { trovata = k + m[0].length - 1; k = chiusura(spento, trovata) + 1; continue; }
        k++;
    }
    return trovata;
}

// Tutti i moduli dei file indicati: [{ nome, file, sorgente, spento, da, a, funzioni: Map(nome → {da, a}), esporta }]
// esporta = { nome visto da fuori → nome della funzione in "funzioni" }
function moduli(file) {
    const out = [];
    file.forEach(f => {
        const sorgente = fs.readFileSync(path.join(RADICE, f), 'utf8');
        const spento = spegni(sorgente);
        const re = new RegExp(`^(?:const\\s+([A-Z][\\w$]*)|(Viste\\.[a-z][\\w$]*))\\s*=\\s*(\\(\\(\\)\\s*=>\\s*\\{|\\{|function\\s*[\\w$]*\\s*\\([^)]*\\)\\s*\\{)`, 'gm');
        let m;
        while ((m = re.exec(spento))) {
            const nome = m[1] || m[2];
            const graffa = m.index + m[0].length - 1;
            const fine = chiusura(spento, graffa);
            const funzioni = new Map();
            const esporta = {};
            if (m[3] === '{') {
                // Oggetto letterale (le viste): ogni elemento è una funzione esportata
                elementiOggetto(spento, graffa).forEach(e => { funzioni.set(e.nome, e); esporta[e.nome] = e.nome; });
            } else {
                dichiarazioni(spento, graffa + 1, fine).forEach(d => funzioni.set(d.nome, d));
                const r = graffaDelReturn(spento, graffa + 1, fine);
                if (r >= 0) {
                    elementiOggetto(spento, r).forEach(e => {
                        if (e.alias && funzioni.has(e.alias)) esporta[e.nome] = e.alias;
                        else { funzioni.set('↦' + e.nome, e); esporta[e.nome] = '↦' + e.nome; }
                    });
                }
            }
            out.push({ nome, file: f, sorgente, spento, da: graffa, a: fine + 1, funzioni, esporta });
            re.lastIndex = fine;
        }
    });
    return out;
}

// ---- Chi cambia i dati ------------------------------------------------------------------------------------------------

// Scritture dell'Archivio sui dati dell'utente. Le righe di "storia" e "coda" (cronologia delle modifiche e coda del
// cloud) non sono dati dell'utente; quelle di "file" sì (il contenuto dei materiali)
const SCRITTURE_ARCHIVIO = ['salva', 'salvaMolti', 'elimina', 'eliminaMolti', 'salvaFile', 'eliminaFile', 'sostituisciTutto', 'svuotaInSilenzio', 'applicaRemoto', 'dimenticaFile'];
const RE_SCRITTURA = new RegExp(`\\bArchivio\\.(${SCRITTURE_ARCHIVIO.join('|')})\\s*\\(`, 'g');
const RE_RIGA_FILE = /\bArchivio\.(salvaRiga|salvaRighe|eliminaRighe)\s*\(\s*'file'/g;

// Scritture dirette nell'Archivio dentro [da, a) del modulo: [{ funzione, collezione, riga }]
function scrittureDirette(mod, da = mod.da, a = mod.a) {
    const out = [];
    const testo = mod.spento.slice(da, a);
    [RE_SCRITTURA, RE_RIGA_FILE].forEach(re => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(testo))) {
            const pos = da + m.index;
            const arg = /^\s*'([^']*)'/.exec(mod.sorgente.slice(pos + m[0].length, pos + m[0].length + 40));
            out.push({ funzione: m[1], collezione: re === RE_RIGA_FILE ? 'file' : (arg ? arg[1] : '(variabile)'), riga: riga(mod.sorgente, pos) });
        }
    });
    return out;
}

// Chiamate dentro [da, a): locali (nome(…), this.nome(…)) e di altri moduli (Modulo.nome(…), Viste.x.nome(…))
function chiamate(mod, da, a) {
    const testo = mod.spento.slice(da, a);
    const locali = new Set(), esterne = new Set();
    let m;
    const reLoc = new RegExp(`(^|[^.\\w$])(${ID})\\s*\\(`, 'g');
    while ((m = reLoc.exec(testo))) if (mod.funzioni.has(m[2])) locali.add(m[2]);
    const reThis = new RegExp(`\\bthis\\.(${ID})\\s*\\(`, 'g');
    while ((m = reThis.exec(testo))) if (mod.funzioni.has(m[1])) locali.add(m[1]);
    const reEst = new RegExp(`\\b(Viste\\.[a-z][\\w$]*|[A-Z][\\w$]*)\\.(${ID})\\s*\\(`, 'g');
    while ((m = reEst.exec(testo))) {
        if (m[1] !== mod.nome) esterne.add(`${m[1]}.${m[2]}`);
        else if (mod.esporta[m[2]]) locali.add(mod.esporta[m[2]]);
    }
    return { locali, esterne };
}

// Le funzioni esportate che cambiano i dati salvati, da sole o chiamando altre funzioni che lo fanno: Set di
// "Modulo.funzione"
function funzioniCheScrivono(tutti) {
    const info = new Map();
    tutti.forEach(mod => mod.funzioni.forEach((d, nome) => {
        info.set(`${mod.nome}.${nome}`, { mod, diretta: scrittureDirette(mod, d.da, d.a).length > 0, ...chiamate(mod, d.da, d.a) });
    }));
    const esportata = new Map();   // "Modulo.fuori" → "Modulo.dentro"
    tutti.forEach(mod => Object.entries(mod.esporta).forEach(([fuori, dentro]) => esportata.set(`${mod.nome}.${fuori}`, `${mod.nome}.${dentro}`)));
    const scrive = new Set(SCRITTURE_ARCHIVIO.map(f => `Archivio.${f}`));
    SCRITTURE_ARCHIVIO.forEach(f => esportata.set(`Archivio.${f}`, `Archivio.${f}`));
    let cambiato = true;
    while (cambiato) {
        cambiato = false;
        info.forEach((x, chiave) => {
            if (scrive.has(chiave)) return;
            if (x.diretta || [...x.locali].some(l => scrive.has(`${x.mod.nome}.${l}`)) || [...x.esterne].some(e => scrive.has(esportata.get(e)))) {
                scrive.add(chiave);
                cambiato = true;
            }
        });
    }
    const out = new Set();
    esportata.forEach((dentro, fuori) => { if (scrive.has(dentro) && !fuori.startsWith('Archivio.')) out.add(fuori); });
    return out;
}

// Scritture dirette nell'Archivio in tutto un file: [{ funzione, collezione, riga }]
function scrittureNelFile(file) {
    const sorgente = fs.readFileSync(path.join(RADICE, file), 'utf8');
    const finto = { sorgente, spento: spegni(sorgente), da: 0, a: sorgente.length };
    return scrittureDirette(finto, 0, sorgente.length);
}

// ---- Campi dei dati che il codice scrive ------------------------------------------------------------------------------

// Funzioni di Dati che ricevono un oggetto con i campi da scrivere: funzione → [collezione, posizione dell'argomento]
const SCRITTORI = {
    creaMateria: ['materie', 0], aggiornaMateria: ['materie', 1], creaSet: ['set', 0], aggiornaSet: ['set', 1],
    creaCarta: ['carte', 1], aggiornaCarta: ['carte', 1], creaMateriale: ['materiali', 0], aggiornaMateriale: ['materiali', 1],
    creaArgomento: ['argomenti', 0], aggiornaArgomento: ['argomenti', 1], creaEsame: ['esami', 0], aggiornaEsame: ['esami', 1],
    salvaImpostazioni: ['impostazioni', 0],
};

// Nelle viste delle mappe i nomi delle variabili dicono che cosa si sta cambiando
const VARIABILI_MAPPE = { n: 'mappe.nodi', m: 'mappe', r: 'mappe.relazioni', f: 'nodi.figure' };

// Campi scritti dal codice: [{ percorso (collezione o parte di un oggetto, es. "mappe.nodi"), campo, dove }]
// - le chiavi degli oggetti letterali passati alle funzioni di Dati qui sopra (in tutti i file);
// - nell'editor delle mappe, le assegnazioni n.campo = …, m.campo = …, r.campo = …, f.campo = …
function campiScritti(file, { editorMappe = [] } = {}) {
    const out = [];
    file.forEach(f => {
        const sorgente = fs.readFileSync(path.join(RADICE, f), 'utf8');
        const spento = spegni(sorgente);
        const re = new RegExp(`\\bDati\\.(${Object.keys(SCRITTORI).join('|')})\\s*\\(`, 'g');
        let m;
        while ((m = re.exec(spento))) {
            const [percorso, indice] = SCRITTORI[m[1]];
            const par = m.index + m[0].length - 1;
            const arg = pezzi(spento, par + 1, chiusura(spento, par), ',')[indice];
            if (!arg) continue;
            const inizio = spento.slice(arg.da, arg.a).search(/\S/) + arg.da;
            if (spento[inizio] !== '{') continue;
            elementiOggetto(spento, inizio).forEach(e => {
                if (!/^\.\.\./.test(spento.slice(e.da, e.a).trim())) out.push({ percorso, campo: e.nome, dove: `${f}:${riga(sorgente, e.da)}` });
            });
        }
        if (editorMappe.includes(f)) {
            const reVar = /(^|[^.\w$])(n|m|r|f)\.([a-zA-Z_$][\w$]*)\s*(=|\+=|-=)(?!=)/g;
            while ((m = reVar.exec(spento))) out.push({ percorso: VARIABILI_MAPPE[m[2]], campo: m[3], dove: `${f}:${riga(sorgente, m.index)}` });
        }
    });
    return out;
}

module.exports = {
    spegni, chiusura, riga, pezzi, moduli, elementiOggetto, scrittureDirette, scrittureNelFile, chiamate, funzioniCheScrivono, campiScritti,
    SCRITTURE_ARCHIVIO,
};
