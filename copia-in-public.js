// Copia l'app nella cartella pubblicata. Viene eseguito da "firebase deploy" (hook predeploy in firebase.json),
// così online finisce sempre l'ultima versione. Si pubblicano solo index.html, manifest.json, css/, js/ e icone/:
// server.py, Flashcard.bat e i file di Firebase restano sul computer.
const fs = require('fs');
const path = require('path');

const radice = __dirname;
const pubblica = path.join(radice, 'public');
const DA_COPIARE = ['index.html', 'manifest.json', 'css', 'js', 'icone'];

for (const voce of DA_COPIARE) {
    if (!fs.existsSync(path.join(radice, voce))) {
        console.error(`ERRORE: ${voce} non trovato in ${radice}`);
        process.exit(1);
    }
}

// Si riparte da una cartella vuota: niente file vecchi rimasti online
fs.rmSync(pubblica, { recursive: true, force: true });
fs.mkdirSync(pubblica, { recursive: true });
let byte = 0, quanti = 0;
function copia(da, a) {
    const info = fs.statSync(da);
    if (info.isDirectory()) {
        fs.mkdirSync(a, { recursive: true });
        for (const nome of fs.readdirSync(da)) {
            if (!nome.startsWith('.')) copia(path.join(da, nome), path.join(a, nome));
        }
    } else {
        fs.copyFileSync(da, a);
        byte += info.size;
        quanti++;
    }
}
DA_COPIARE.forEach(voce => copia(path.join(radice, voce), path.join(pubblica, voce)));
console.log(`app copiata in public/ (${quanti} file, ${(byte / 1024).toFixed(0)} KB)`);

// Controlla la configurazione in js/cloud.js e che .firebaserc punti allo stesso progetto
const cloud = fs.readFileSync(path.join(radice, 'js', 'cloud.js'), 'utf8');
const blocco = (cloud.match(/const CONFIG_FIREBASE = \{([\s\S]*?)\};/) || [])[1] || '';
const progetto = (blocco.match(/projectId:\s*"([^"]+)"/) || [])[1];
let progettoRc = null;
try { progettoRc = JSON.parse(fs.readFileSync(path.join(radice, '.firebaserc'), 'utf8')).projects.default; } catch (e) { /* manca */ }

if (!progetto || progetto === 'DA_COMPILARE') {
    console.log('ATTENZIONE: configurazione Firebase mancante in js/cloud.js — online il cloud resterà spento');
} else {
    console.log(`Firebase configurato sul progetto "${progetto}"`);
    if (progettoRc && progettoRc !== progetto) {
        console.error(`ERRORE: .firebaserc punta a "${progettoRc}", ma la configurazione in js/cloud.js è di "${progetto}". Correggi .firebaserc.`);
        process.exit(1);
    }
}
