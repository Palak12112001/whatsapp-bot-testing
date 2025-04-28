require('dotenv').config();

// 👇 SUPER IMPORTANT: Full crypto polyfill for Node.js 20+ / 22+
if (typeof global.crypto !== 'object') {
  const { webcrypto } = require('crypto');
  global.crypto = webcrypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const qrcode = require('qrcode'); // 👈 add qrcode package

const app = express();
app.use(express.json());

let currentQR = ''; // 👈 store latest QR globally

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
            currentQR = qr; // 👈 store latest QR
            await qrcode.toFile('./qr.png', qr); // 👈 create qr.png file
            console.log('📸 QR Code saved as qr.png');
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('Connection closed due to', error?.message || error, ', reconnecting:', shouldReconnect);

            if (statusCode === DisconnectReason.loggedOut) {
                console.log('Session expired. Deleting auth folder...');
                if (fs.existsSync('./auth')) {
                    fs.rmSync('./auth', { recursive: true, force: true });
                }
                console.log('Please restart the bot and scan QR again.');
                process.exit(0);
            }

            if (shouldReconnect) {
                console.log('Reconnecting after 5 seconds...');
                await new Promise(res => setTimeout(res, 5000));
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp');
        }
    });

    app.post('/send', async (req, res) => {
        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({ status: 'error', message: 'Number and message are required.' });
        }

        try {
            const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: message });
            res.json({ status: 'success', number });
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ status: 'error', message: error.toString() });
        }
    });

    // 👇 Add QR endpoint
    app.get('/qr', async (req, res) => {
        if (!fs.existsSync('./qr.png')) {
            return res.status(404).send('QR code not generated yet.');
        }
        res.sendFile(__dirname + '/qr.png');
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 API Server started on http://localhost:${PORT}`));
}

startBot();
