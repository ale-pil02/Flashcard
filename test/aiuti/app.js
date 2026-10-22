// Carica l'app dentro Node, senza browser: gli script di index.html (tranne js/app.js, che nel browser la avvia) girano in
// un contesto a parte con un DOM finto, i dati stanno solo in memoria (niente IndexedDB, niente cloud, niente login).
// Così i test possono usare davvero Dati, Mappe e gli strumenti dell'assistente sui dati di prova (js/prova.js).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RADICE = path.join(__dirname, '..', '..');

// Gli script nell'ordine di index.html
function scriptDellApp() {
    const html = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');
    return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(m => m[1]).filter(s => !/^(https?:)?\/\//.test(s));
}

// Oggetto che accetta tutto: ogni proprietà è un altro oggetto finto, ogni chiamata restituisce un oggetto finto
function finto() {
    const f = function () { return finto(); };
    return new Proxy(f, {
        get(t, k) {
            if (k === Symbol.toPrimitive) return () => '';
            if (k === Symbol.iterator) return function* () { /* vuoto */ };
            if (k === 'then') return undefined;
            if (k in t) return t[k];
            return finto();
        },
        set(t, k, v) { t[k] = v; return true; },
        apply() { return finto(); },
        construct() { return finto(); },
    });
}

function decodificaEntita(s) {
    return String(s).replace(/&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (t, e) => {
        const nome = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e.toLowerCase()];
        if (nome) return nome;
        return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    });
}

// Elemento finto che sa solo una cosa vera: con innerHTML impostato, value e textContent danno il testo decodificato
// (js/utili.js lo usa per passare da HTML a testo)
function elemento() {
    const e = finto();
    let html = '';
    const testo = () => decodificaEntita(html.replace(/<[^>]*>/g, ''));
    Object.defineProperty(e, 'innerHTML', { get: () => html, set: v => { html = String(v); }, configurable: true });
    Object.defineProperty(e, 'value', { get: testo, set: v => { html = String(v); }, configurable: true });
    Object.defineProperty(e, 'textContent', { get: testo, set: v => { html = String(v); }, configurable: true });
    return e;
}

function contesto() {
    const documento = finto();
    documento.createElement = elemento;
    documento.querySelector = () => elemento();
    documento.querySelectorAll = () => [];
    documento.addEventListener = () => {};
    documento.dispatchEvent = () => true;
    const memoria = new Map();
    const ctx = {
        console, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, queueMicrotask,
        URL, Blob, TextEncoder, TextDecoder, atob, btoa, crypto: globalThis.crypto,
        document: documento,
        navigator: { onLine: false, storage: null, userAgent: 'node' },
        localStorage: {
            getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)),
            removeItem: k => memoria.delete(k),
        },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        location: { hash: '', hostname: 'localhost', href: 'http://localhost/', origin: 'http://localhost' },
        history: { replaceState() {}, pushState() {} },
        indexedDB: undefined,
        CustomEvent: class { constructor(tipo, o) { this.type = tipo; this.detail = o && o.detail; } },
        Event: class {},
        HTMLElement: class {},
        requestAnimationFrame: fn => setTimeout(fn, 0),
        getComputedStyle: () => finto(),
        addEventListener() {}, removeEventListener() {}, scrollTo() {},
        fetch: () => Promise.reject(new Error('niente rete nei test')),
    };
    ctx.window = ctx;
    ctx.self = ctx;
    ctx.globalThis = ctx;
    return vm.createContext(ctx);
}

// App finta al posto di js/app.js: nessuna pagina aperta
const APP_FINTA = `
const App = {
    vistaAttiva: null, rottaAttiva: null, contesto: null, pronta: true,
    mostra() {}, ridisegna() {}, aggiornaDopoAssistente() {}, aggiornaDaRemoto() {}, aggiornaPiede() {}, applicaTema() {},
};`;

// Restituisce { ctx, g } dove g(nome) dà un oggetto globale dell'app (Dati, Strumenti, Mappe…).
// datiProva = carica i dati di prova di Impostazioni → Dati di prova
async function caricaApp({ datiProva = true } = {}) {
    const ctx = contesto();
    // Avvisi dell'app (archivio solo in memoria) e degli strumenti: nei test non servono
    const avvisi = console.warn, errori = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
        for (const s of scriptDellApp()) {
            const codice = s === 'js/app.js' ? APP_FINTA : fs.readFileSync(path.join(RADICE, s), 'utf8');
            vm.runInContext(codice, ctx, { filename: s });
        }
        const g = nome => vm.runInContext(nome, ctx);
        await g('Archivio').apri();
        g('Dati').migra();
        g('Materiali').allineaMappe();
        g('Panoramica').inizializza();
        if (datiProva) g('DatiProva').carica();
        return { ctx, g };
    } finally {
        console.warn = avvisi;
        console.error = errori;
    }
}

// Esegue uno strumento dell'assistente come fa la chat (le conferme dicono sempre sì)
async function strumento(g, nome, args = {}) {
    const avvisi = console.warn;
    console.warn = () => {};
    try {
        return await g('Strumenti').esegui(nome, args, { conferma: async () => true });
    } finally {
        console.warn = avvisi;
    }
}

module.exports = { RADICE, scriptDellApp, caricaApp, strumento };
