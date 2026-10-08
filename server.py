# Server locale per Flashcard: serve i file dell'app (come "py -m http.server", ma chiede al browser di
# ricontrollarli sempre, così dopo ogni modifica all'app basta ricaricare la pagina) e dà all'app l'accesso
# in SOLA LETTURA alle cartelle e ai file collegati ai set, per esempio quelli di Google Drive per desktop (G:\).
# Così i collegamenti funzionano con qualsiasi browser.
#
# API, usabili solo dalla pagina dell'app (indirizzo locale e intestazione X-Flashcard obbligatori):
#   GET  /api/stato                                → { versione }
#   POST /api/cartella/scegli                      → apre la finestra di Windows per scegliere una cartella
#   GET  /api/cartella/elenco?percorso=…           → file della cartella e delle sottocartelle
#   GET  /api/cartella/file?percorso=…&file=…      → contenuto di un file della cartella
#   POST /api/file/scegli                          → apre la finestra di Windows per scegliere uno o più file
#   GET  /api/file/info?percorso=…&percorso=…      → dimensione e data di modifica di ogni file (null se manca)
#   GET  /api/file/contenuto?percorso=…            → contenuto di un file
#   POST /api/file/apri?percorso=…                 → apre il file con il suo programma (es. SimpleMind per .smmx)
#   POST /api/file/apri-copia?nome=…  (corpo: file) → salva una copia temporanea e la apre con il suo programma
import ctypes
import http.server
import json
import mimetypes
import os
import string
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

VERSIONE_API = 3
PROFONDITA = 4          # sottocartelle lette
HOST_LOCALI = ('localhost', '127.0.0.1')
# Solo i formati dei materiali si possono aprire con il loro programma (mai eseguibili o script)
APRIBILI = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.docx', '.pptx', '.opml', '.mm', '.xmind', '.smmx',
            '.md', '.markdown', '.txt', '.json'}
MAX_COPIA = 200 * 1024 * 1024

# La finestra per scegliere cartella o file gira in un processo a parte (tkinter vuole il suo thread).
# Windows non lascia andare in primo piano un programma che non è quello attivo (il browser): un thread
# aspetta che la finestra compaia e la porta davanti agganciandosi per un attimo all'input del browser.
FINESTRA = r'''
import ctypes, os, sys, threading, time, tkinter
from ctypes import wintypes
from tkinter import filedialog

MODO, INIZIALE = sys.argv[1], sys.argv[2]
TITOLO = 'Scegli la cartella da collegare al set' if MODO == 'cartella' else 'Scegli i file da collegare al set'
TIPI = [('Materiali di studio', '*.pdf *.png *.jpg *.jpeg *.webp *.gif *.docx *.pptx *.opml *.mm *.xmind *.smmx *.md *.markdown *.txt *.json'),
        ('Tutti i file', '*.*')]

def porta_davanti():
    user32 = ctypes.windll.user32
    user32.FindWindowW.restype = wintypes.HWND
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.c_void_p]
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.BringWindowToTop.argtypes = [wintypes.HWND]
    user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
    # La finestra resta sopra a tutte finché è aperta; il primo piano (tastiera) si riprova per un paio di secondi
    h = None
    for _ in range(100):
        time.sleep(0.1)
        h = user32.FindWindowW('#32770', TITOLO)
        if h:
            break
    if not h:
        return
    user32.SetWindowPos(h, wintypes.HWND(-1), 0, 0, 0, 0, 3)   # sempre in cima
    for _ in range(20):
        attiva = user32.GetForegroundWindow()
        if attiva == h:
            return
        filo_attivo = user32.GetWindowThreadProcessId(attiva, None)
        filo_finestra = user32.GetWindowThreadProcessId(h, None)
        user32.AttachThreadInput(filo_attivo, filo_finestra, True)
        user32.BringWindowToTop(h)
        user32.SetForegroundWindow(h)
        user32.AttachThreadInput(filo_attivo, filo_finestra, False)
        time.sleep(0.1)

radice = tkinter.Tk()
radice.withdraw()
threading.Thread(target=porta_davanti, daemon=True).start()
if MODO == 'cartella':
    print(filedialog.askdirectory(parent=radice, title=TITOLO, initialdir=INIZIALE or None, mustexist=True) or '')
else:
    print('\n'.join(filedialog.askopenfilenames(parent=radice, title=TITOLO, initialdir=INIZIALE or None, filetypes=TIPI) or ()))
'''


class Errore(Exception):
    def __init__(self, messaggio, stato=400, codice=''):
        super().__init__(messaggio)
        self.stato = stato
        self.codice = codice


def cartella_drive():
    """Dove si apre la finestra: "Il mio Drive" di Google Drive per desktop, se c'è."""
    for lettera in string.ascii_uppercase[3:]:
        for nome in ('Il mio Drive', 'My Drive'):
            percorso = f'{lettera}:\\{nome}'
            if os.path.isdir(percorso):
                return percorso
    return os.path.expanduser('~')


def finestra(modo):
    """Percorsi scelti nella finestra di Windows ('cartella' o 'file'); lista vuota se annullata."""
    ambiente = dict(os.environ, PYTHONIOENCODING='utf-8')
    try:
        r = subprocess.run([sys.executable, '-c', FINESTRA, modo, cartella_drive()], capture_output=True, env=ambiente, timeout=900)
    except subprocess.TimeoutExpired:
        return []
    if r.returncode != 0:
        raise Errore('Non riesco ad aprire la finestra di Windows', 500, 'senza-finestra')
    return [os.path.normpath(riga) for riga in r.stdout.decode('utf-8', 'replace').splitlines() if riga.strip()]


def scegli_cartella():
    scelte = finestra('cartella')
    if not scelte:
        return {'annullato': True}
    return {'percorso': scelte[0], 'nome': os.path.basename(scelte[0]) or scelte[0]}


def scegli_file():
    scelte = finestra('file')
    if not scelte:
        return {'annullato': True}
    return {'file': [{'percorso': p, 'nome': os.path.basename(p)} for p in scelte]}


def info_file(parametri):
    risultato = {}
    for percorso in parametri.get('percorso') or []:
        completo = os.path.normpath(percorso) if os.path.isabs(percorso) else ''
        try:
            info = os.stat(completo) if completo and os.path.isfile(completo) else None
        except OSError:
            info = None
        risultato[percorso] = {'dimensione': info.st_size, 'modificato': int(info.st_mtime * 1000)} if info else None
    return {'file': risultato}


def controlla_apribile(percorso):
    if os.path.splitext(percorso)[1].lower() not in APRIBILI:
        raise Errore('Questo tipo di file non si apre da qui', 400, 'tipo')


def porta_davanti(nome_file, secondi=10):
    """Aspetta la finestra del programma appena aperto (il titolo contiene il nome del file) e la porta
    in primo piano: aperto dal server, Windows lo lascerebbe dietro al browser."""
    if os.name != 'nt':
        return
    cerca = os.path.splitext(nome_file)[0].lower()
    user32 = ctypes.windll.user32
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows.argtypes = [WNDENUMPROC, ctypes.c_void_p]
    for nome in ('IsWindowVisible', 'IsIconic', 'SetForegroundWindow', 'BringWindowToTop'):
        getattr(user32, nome).argtypes = [ctypes.c_void_p]
    user32.GetWindowTextW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int]
    user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
    user32.GetForegroundWindow.restype = ctypes.c_void_p

    esclusa = user32.GetForegroundWindow()   # il browser: anche il suo titolo potrebbe contenere il nome

    def trova():
        trovate = []

        def visita(h, _):
            if h != esclusa and user32.IsWindowVisible(h):
                testo = ctypes.create_unicode_buffer(512)
                user32.GetWindowTextW(h, testo, 512)
                if cerca and cerca in testo.value.lower():
                    trovate.append(h)
            return True
        user32.EnumWindows(WNDENUMPROC(visita), None)
        return trovate[0] if trovate else None

    def lavoro():
        fine = time.time() + secondi
        while time.time() < fine:
            h = trova()
            if h:
                attiva = user32.GetForegroundWindow()
                filo_attivo = user32.GetWindowThreadProcessId(attiva, None)
                filo_finestra = user32.GetWindowThreadProcessId(h, None)
                user32.AttachThreadInput(filo_attivo, filo_finestra, True)
                if user32.IsIconic(h):
                    user32.ShowWindow(h, 9)   # SW_RESTORE
                user32.BringWindowToTop(h)
                user32.SetForegroundWindow(h)
                user32.AttachThreadInput(filo_attivo, filo_finestra, False)
                if user32.GetForegroundWindow() == h:
                    return
            time.sleep(0.25)

    threading.Thread(target=lavoro, daemon=True).start()


def apri_file(parametri):
    completo = file_da(parametri)
    controlla_apribile(completo)
    os.startfile(completo)
    porta_davanti(os.path.basename(completo))
    return {'aperto': completo}


def file_da(parametri):
    percorso = (parametri.get('percorso') or [''])[0]
    completo = os.path.normpath(percorso) if os.path.isabs(percorso) else ''
    if not completo or not os.path.isfile(completo):
        raise Errore('Il file non si trova: è stato spostato o rinominato, oppure Google Drive non è avviato', 404, 'mancante')
    return completo


def cartella_da(parametri):
    percorso = (parametri.get('percorso') or [''])[0].strip().strip('"')
    if not percorso or not os.path.isabs(percorso):
        raise Errore('Serve il percorso completo della cartella (es. G:\\Il mio Drive\\Psicologia)', 400, 'percorso')
    percorso = os.path.normpath(percorso)
    if not os.path.isdir(percorso):
        raise Errore('La cartella non si trova: è stata spostata o rinominata, oppure Google Drive non è avviato', 404, 'mancante')
    return percorso


def elenco(radice):
    trovati = []

    def visita(cartella, relativo, livello):
        with os.scandir(cartella) as voci:
            for v in voci:
                if v.name.startswith(('.', '~$')) or v.name.lower() == 'desktop.ini':
                    continue
                rel = f'{relativo}/{v.name}' if relativo else v.name
                try:
                    if v.is_dir(follow_symlinks=False):
                        if livello < PROFONDITA:
                            visita(v.path, rel, livello + 1)
                    elif v.is_file():
                        info = v.stat()
                        trovati.append({'percorso': rel, 'dimensione': info.st_size, 'modificato': int(info.st_mtime * 1000)})
                except OSError:
                    pass   # file non accessibile in questo momento: al prossimo controllo

    visita(radice, '', 0)
    return {'nome': os.path.basename(radice) or radice, 'file': trovati}


class Gestore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, formato, *argomenti):
        # I controlli delle cartelle arrivano ogni pochi secondi: non riempiono la finestra
        if not self.path.startswith('/api/'):
            super().log_message(formato, *argomenti)

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.api('GET')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.api('POST')
        else:
            self.send_error(405)

    # Solo la pagina dell'app: niente altri siti (Origin) né indirizzi che puntano qui per inganno (Host)
    def permessa(self):
        host = urllib.parse.urlsplit('//' + (self.headers.get('Host') or '')).hostname
        origine = self.headers.get('Origin')
        if host not in HOST_LOCALI:
            return False
        if origine and urllib.parse.urlsplit(origine).hostname not in HOST_LOCALI:
            return False
        return self.headers.get('X-Flashcard') == '1'

    def rispondi(self, dati, stato=200):
        corpo = json.dumps(dati, ensure_ascii=False).encode('utf-8')
        self.send_response(stato)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def file_della_cartella(self, radice, parametri):
        relativo = (parametri.get('file') or [''])[0]
        completo = os.path.normpath(os.path.join(radice, relativo))
        if os.path.commonpath([radice, completo]) != radice or not os.path.isfile(completo):
            raise Errore('File non trovato nella cartella', 404, 'file')
        self.invia_file(completo)

    def invia_file(self, completo):
        with open(completo, 'rb') as f:
            dati = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(completo)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(dati)))
        self.end_headers()
        self.wfile.write(dati)

    # Copia temporanea di un materiale caricato nell'app (non collegato), aperta con il suo programma
    def apri_copia(self, parametri):
        nome = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', os.path.basename((parametri.get('nome') or [''])[0])).strip(' .')
        if not nome:
            raise Errore('Nome del file mancante', 400, 'nome')
        controlla_apribile(nome)
        lunghezza = int(self.headers.get('Content-Length') or 0)
        if not 0 < lunghezza <= MAX_COPIA:
            raise Errore('File vuoto o troppo grande', 400, 'dimensione')
        dati = self.rfile.read(lunghezza)
        cartella = os.path.join(tempfile.gettempdir(), 'Flashcard')
        os.makedirs(cartella, exist_ok=True)
        base, estensione = os.path.splitext(nome)
        percorso = os.path.join(cartella, nome)
        for n in range(2, 100):   # se la copia di prima è ancora aperta nel programma, se ne fa un'altra
            try:
                with open(percorso, 'wb') as f:
                    f.write(dati)
                break
            except PermissionError:
                percorso = os.path.join(cartella, f'{base} ({n}){estensione}')
        os.startfile(percorso)
        porta_davanti(os.path.basename(percorso))
        return {'aperto': percorso}

    def api(self, metodo):
        if not self.permessa():
            self.rispondi({'errore': 'Richiesta non permessa'}, 403)
            return
        url = urllib.parse.urlsplit(self.path)
        parametri = urllib.parse.parse_qs(url.query)
        try:
            if url.path == '/api/stato':
                self.rispondi({'versione': VERSIONE_API})
            elif url.path == '/api/cartella/scegli' and metodo == 'POST':
                self.rispondi(scegli_cartella())
            elif url.path == '/api/cartella/elenco':
                self.rispondi(elenco(cartella_da(parametri)))
            elif url.path == '/api/cartella/file':
                self.file_della_cartella(cartella_da(parametri), parametri)
            elif url.path == '/api/file/scegli' and metodo == 'POST':
                self.rispondi(scegli_file())
            elif url.path == '/api/file/info':
                self.rispondi(info_file(parametri))
            elif url.path == '/api/file/contenuto':
                self.invia_file(file_da(parametri))
            elif url.path == '/api/file/apri' and metodo == 'POST':
                self.rispondi(apri_file(parametri))
            elif url.path == '/api/file/apri-copia' and metodo == 'POST':
                self.rispondi(self.apri_copia(parametri))
            else:
                self.rispondi({'errore': 'Richiesta sconosciuta'}, 404)
        except Errore as e:
            self.rispondi({'errore': str(e), 'codice': e.codice}, e.stato)
        except OSError as e:
            self.rispondi({'errore': f'Non riesco a leggere: {e.strerror or e}', 'codice': 'lettura'}, 500)


porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f'Flashcard su http://localhost:{porta}  (chiudi questa finestra per fermarlo)')
http.server.ThreadingHTTPServer(('127.0.0.1', porta), Gestore).serve_forever()
