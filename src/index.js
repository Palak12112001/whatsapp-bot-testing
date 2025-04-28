require('dotenv').config();
const path = require('path'); // Add this to work with absolute paths


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
const errorHandler = require('./middlewar/errorHandler');
const ApiError = require('./Utils/ApiError');
const asyncHandler = require('./middlewar/asyncHandler');
const ApiResponse = require('./Utils/ApiResponse');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
            const qrPath = path.join(__dirname, 'qr.png'); // Save the file inside the src folder
            await qrcode.toFile(qrPath, qr); // 👈 create qr.png file in the src folder
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



    app.post('/send', asyncHandler(async (req, res) => {
        const { number, message } = req.body;

        if (!number || !message) {
            throw new ApiError(401, "Number and message are required.");
        }

        try {
            const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: message });

            res.status(200).json(new ApiResponse(true, 200, "Message sent successfully", number));
        } catch (error) {
            throw new ApiError(error?.statusCode || 500, error.message || "Something went wrong", error.stack);
        }
    }));


    app.get('/qr', async (req, res) => {
        const qrPath = path.join(__dirname, '/qr.png'); // Correct path to access the qr.png file from the root folder
        if (!fs.existsSync(qrPath)) {
            return res.status(404).send('QR code not generated yet.');
        }
        console.log('QR file path:', qrPath); // Log the correct path for debugging
        res.sendFile(qrPath); // Serve the file from the root directory
    });

    app.use(errorHandler);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 API Server started on http://localhost:${PORT}`));
}

startBot();
