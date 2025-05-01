require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode');
const { Boom } = require('@hapi/boom');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const errorHandler = require('./middlewar/errorHandler');
const asyncHandler = require('./middlewar/asyncHandler');
const ApiError = require('./Utils/ApiError');
const ApiResponse = require('./Utils/ApiResponse');
const upload = require('./middlewar/uploadMiddleware');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'utils/uploads')));

let currentQR = '';

if (typeof global.crypto !== 'object') {
    const { webcrypto } = require('crypto');
    global.crypto = webcrypto;
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['MyBot', 'Chrome', '10.0'],
    });

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
            const error = lastDisconnect?.error;
            const shouldReconnect = error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (!shouldReconnect) {
                fs.rmSync('./auth', { recursive: true, force: true });
                console.log('Session expired. Scan again.');
                process.exit(0);
            }

            console.log('🔄 Reconnecting...');
            await new Promise(res => setTimeout(res, 5000));
            startBot();
        }

        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp');
        }
    });

    // POST /send route
    app.post('/send', upload.single('image'), asyncHandler(async (req, res) => {
        const { number, message, image } = req.body;
        const imageFile = req.file;

        if (!number || !message) {
            throw new ApiError(400, "Number and message are required");
        }

        const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

        try {
            if (imageFile) {
                const buffer = fs.readFileSync(imageFile.path);
                await sock.sendMessage(jid, {
                    image: buffer,
                    caption: message
                });
            } else if (image) {
                // Download image from URL
                const response = await axios.get(image, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data, 'binary');

                await sock.sendMessage(jid, {
                    image: buffer,
                    caption: message
                });
            } else {
                await sock.sendMessage(jid, { text: message });
            }

            res.status(200).json(new ApiResponse(true, 200, "Message sent successfully", number));
        } catch (error) {
            console.error("Error:", error);
            throw new ApiError(500, "Failed to send message", error.stack);
        }
    }));

    app.get('/qr', (req, res) => {
        const qrPath = path.join(__dirname, 'qr.png');
        if (!fs.existsSync(qrPath)) return res.status(404).send('QR not available yet.');
        res.sendFile(qrPath);
    });

    app.use(errorHandler);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
}

startBot();
