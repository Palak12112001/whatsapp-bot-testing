require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode');
const multer = require('multer');
const { Boom } = require('@hapi/boom');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
} = require('@whiskeysockets/baileys');

const app = express();

// Configure Multer to handle file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure global.crypto is available
if (typeof global.crypto !== 'object') {
    const { webcrypto } = require('crypto');
    global.crypto = webcrypto;
}

// Baileys Store setup
const store = makeInMemoryStore({});
store.readFromFile('./baileys_store.json');
setInterval(() => {
    store.writeToFile('./baileys_store.json');
}, 10000);

let sock;
let currentQR = '';

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        browser: ['MyBot', 'Chrome', '10.0'],
    });

    store.bind(sock.ev);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
            const qrPath = path.join(__dirname, 'qr.png');
            await qrcode.toFile(qrPath, qr);
            console.log('📸 QR Code saved as qr.png');
        }

        if (connection === 'close') {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (!shouldReconnect) {
                fs.rmSync('./auth', { recursive: true, force: true });
                console.log('❌ Session expired. Scan QR again.');
                process.exit(0);
            }

            console.log('🔄 Reconnecting...');
            setTimeout(startBot, 5000);
        }

        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp');
        }
    });
}

startBot();


// ✅ POST /send endpoint with file upload support
app.post('/send', upload.single('image'), async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ success: false, message: 'Number and message are required' });
    }

    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

    try {
        if (req.file) {
            // Sending uploaded image
            await sock.sendMessage(jid, {
                image: req.file.buffer,
                mimetype: req.file.mimetype,
                caption: message,
            });
        } else if (req.body.image) {
            // Fallback: image URL provided
            const response = await axios.get(req.body.image, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data, 'binary');

            await sock.sendMessage(jid, {
                image: buffer,
                caption: message,
            });
        } else {
            await sock.sendMessage(jid, { text: message });
        }

        res.status(200).json({ success: true, message: 'Message sent successfully', number });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message', error: error.stack });
    }
});

// ✅ QR Code endpoint
app.get('/qr', (req, res) => {
    const qrPath = path.join(__dirname, 'qr.png');
    if (!fs.existsSync(qrPath)) {
        return res.status(404).send('QR not available yet.');
    }
    res.sendFile(qrPath);
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
