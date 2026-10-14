# Server locale per Flashcard: serve i file dell'app (come "py -m http.server", ma chiede al browser di
# ricontrollarli sempre, così dopo ogni modifica all'app basta ricaricare la pagina) e apre una copia dei
# materiali con il loro programma del computer (PDF, Word, PowerPoint…). Online (Firebase) non c'è: lì l'app
# è un sito e quella voce sparisce.
#
# API, usabili solo dalla pagina dell'app (indirizzo locale e intestazione X-Flashcard obbligatori):
#   GET  /api/stato                                → { versione }
#   POST /api/file/apri-copia?nome=…  (corpo: file) → salva una copia temporanea e la apre con il suo programma
import ctypes
import http.server
import json
import os
import re
import sys
import tempfile
import threading
import time
import urllib.parse

VERSIONE_API = 4
HOST_LOCALI = ('localhost', '127.0.0.1')
# Solo i formati dei materiali si possono aprire con il loro programma (mai eseguibili o script)
APRIBILI = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.docx', '.pptx', '.opml', '.mm', '.xmind', '.smmx',
            '.md', '.markdown', '.txt', '.json'}
MAX_COPIA = 200 * 1024 * 1024


class Errore(Exception):
    def __init__(self, messaggio, stato=400, codice=''):
        super().__init__(messaggio)
        self.stato = stato
        self.codice = codice


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


class Gestore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, formato, *argomenti):
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

    # Copia temporanea di un materiale dell'app, aperta con il suo programma
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
            elif url.path == '/api/file/apri-copia' and metodo == 'POST':
                self.rispondi(self.apri_copia(parametri))
            else:
                self.rispondi({'errore': 'Richiesta sconosciuta'}, 404)
        except Errore as e:
            self.rispondi({'errore': str(e), 'codice': e.codice}, e.stato)
        except OSError as e:
            self.rispondi({'errore': f'Non riesco ad aprirlo: {e.strerror or e}', 'codice': 'apertura'}, 500)


porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f'Flashcard su http://localhost:{porta}  (chiudi questa finestra per fermarlo)')
http.server.ThreadingHTTPServer(('127.0.0.1', porta), Gestore).serve_forever()
