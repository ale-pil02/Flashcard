// Funzioni di servizio usate da tutta l'app: identificativi, date, testo, file.

const GIORNO_MS = 24 * 60 * 60 * 1000;

const $ = (selettore, radice = document) => radice.querySelector(selettore);
const $$ = (selettore, radice = document) => [...radice.querySelectorAll(selettore)];

function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function esc(testo) {
    return String(testo ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Testo semplice (da Excel, CSV, incolla) → HTML sicuro, con gli a capo conservati
function testoInHtml(testo) {
    return esc(String(testo ?? '').trim()).replace(/\r?\n/g, '<br>');
}

// HTML → testo su una riga, per anteprime e ricerca
const decodificatore = document.createElement('textarea');
function testoDaHtml(html) {
    if (!html) return '';
    const senzaTag = String(html)
        .replace(/<img[^>]*>/gi, ' [immagine] ')
        .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, ' ')
        .replace(/<[^>]+>/g, '');
    decodificatore.innerHTML = senzaTag;
    return decodificatore.value.replace(/\s+/g, ' ').trim();
}

// HTML → testo che conserva gli a capo, per l'esportazione in Excel
function testoMultiriga(html) {
    if (!html) return '';
    const senzaTag = String(html)
        .replace(/<img[^>]*>/gi, '[immagine]')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, '');
    decodificatore.innerHTML = senzaTag;
    return decodificatore.value.replace(/\n{3,}/g, '\n\n').trim();
}

// ---- Date ----------------------------------------------------------------

function due(n) { return String(n).padStart(2, '0'); }

// Chiave del giorno locale, es. "2026-10-05": raggruppa i ripassi per giorno
function chiaveGiorno(ts = Date.now()) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

function daChiaveGiorno(chiave) {
    const [a, m, g] = chiave.split('-').map(Number);
    return new Date(a, m - 1, g).getTime();
}

function inizioGiorno(ts = Date.now()) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function fineGiorno(ts = Date.now()) { const d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime(); }

// Somma giorni di calendario (corretto anche al cambio dell'ora legale)
function aggiungiGiorni(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }

function giorniTra(da, a) { return Math.round((inizioGiorno(a) - inizioGiorno(da)) / GIORNO_MS); }

const FMT_DATA = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const FMT_DATA_BREVE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const FMT_OGGI = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const FMT_SETTIMANA = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });

function formattaData(ts, breve = false) { return (breve ? FMT_DATA_BREVE : FMT_DATA).format(new Date(ts)); }

// "oggi", "domani", "tra 5 giorni", "ieri", "3 giorni fa"
function distanzaGiorni(ts) {
    const n = giorniTra(Date.now(), ts);
    if (n === 0) return 'oggi';
    if (n === 1) return 'domani';
    if (n === -1) return 'ieri';
    return n > 0 ? `tra ${n} giorni` : `${-n} giorni fa`;
}

// "adesso", "5 min fa", "oggi alle 14:20", "ieri alle 9:05", "3 ottobre alle 18:00"
function quandoFa(ts) {
    const ms = Date.now() - ts;
    if (ms < 60000) return 'adesso';
    if (ms < 3600000) return `${Math.round(ms / 60000)} min fa`;
    const d = new Date(ts);
    const ora = `${d.getHours()}:${due(d.getMinutes())}`;
    const giorni = giorniTra(ts, Date.now());
    if (giorni === 0) return `oggi alle ${ora}`;
    if (giorni === 1) return `ieri alle ${ora}`;
    return `${formattaData(ts, true)} alle ${ora}`;
}

function formattaDurata(ms) {
    if (ms < 60000) return `${Math.max(0, Math.round(ms / 1000))} s`;
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), resto = min % 60;
    return resto ? `${h} h ${resto} min` : `${h} h`;
}

function plurale(n, singolare, plurale) { return `${n} ${n === 1 ? singolare : plurale}`; }

// ---- Varie ---------------------------------------------------------------

function mescola(lista) {
    const a = [...lista];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function debounce(fn, ms = 200) {
    let timer;
    return (...argomenti) => { clearTimeout(timer); timer = setTimeout(() => fn(...argomenti), ms); };
}

function limita(n, min, max) { return Math.min(max, Math.max(min, n)); }

// Carica una libreria esterna solo quando serve (es. SheetJS per i file Excel)
const scriptCaricati = {};
function caricaScript(url) {
    if (!scriptCaricati[url]) {
        scriptCaricati[url] = new Promise((ok, ko) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = ok;
            s.onerror = () => { delete scriptCaricati[url]; ko(new Error('Impossibile caricare ' + url + ' (serve la connessione)')); };
            document.head.appendChild(s);
        });
    }
    return scriptCaricati[url];
}

// ---- File ----------------------------------------------------------------

function scaricaFile(nome, contenuto, tipo = 'application/octet-stream') {
    const blob = contenuto instanceof Blob ? contenuto : new Blob([contenuto], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function leggiFile(file, come = 'testo') {
    return new Promise((ok, ko) => {
        const lettore = new FileReader();
        lettore.onload = () => ok(lettore.result);
        lettore.onerror = () => ko(lettore.error);
        if (come === 'buffer') lettore.readAsArrayBuffer(file);
        else if (come === 'dataurl') lettore.readAsDataURL(file);
        else lettore.readAsText(file);
    });
}

// Apre la finestra di scelta file e restituisce il file scelto (o null)
function scegliFile(accetta = '') {
    return new Promise(ok => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accetta;
        input.style.display = 'none';
        input.addEventListener('change', () => { ok(input.files[0] || null); input.remove(); });
        document.body.appendChild(input);
        input.click();
    });
}

function formattaDimensione(byte) {
    if (!byte) return '0 KB';
    if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`;
    return `${(byte / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
}

// Blob → base64 senza intestazione "data:…;base64,", per le API e per il backup
async function bloInBase64(blob) {
    const url = await leggiFile(blob, 'dataurl');
    return String(url).slice(String(url).indexOf(',') + 1);
}

function base64InBlob(base64, tipo = 'application/octet-stream') {
    const binario = atob(base64);
    const byte = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i);
    return new Blob([byte], { type: tipo });
}

function nomeFileSicuro(nome) {
    return String(nome || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'flashcard';
}
