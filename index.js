require('dotenv').config();

// Important: Attach crypto globally
global.crypto = require('crypto');

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const app = express();

app.use(express.json());

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['MyBot', 'Chrome', '10.0'],
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Connection status update handling
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

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
                process.exit(0); // stop the bot
            }

            if (shouldReconnect) {
                console.log('Reconnecting after 5 seconds...');
                await new Promise(res => setTimeout(res, 5000)); // wait 5 seconds
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp');
        }
    });

    // API endpoint to send a WhatsApp message
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

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 API Server started on http://localhost:${PORT}`));
}

startBot();
