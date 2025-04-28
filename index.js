require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const { Boom } = require('@hapi/boom');
const app = express();
app.use(express.json());

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['MyBot', 'Chrome', '10.0'], // <<< added browser
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if(connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('connection closed due to', lastDisconnect.error, ', reconnecting', shouldReconnect);
      if(shouldReconnect) {
        startBot();
      }
    } else if(connection === 'open') {
      console.log('opened connection');
    }
  });

  app.post('/send', async (req, res) => {
    const { number, message } = req.body;
    try {
      await sock.sendMessage(number + '@s.whatsapp.net', { text: message });
      res.json({ status: 'sent', number });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.toString() });
    }
  });

  app.listen(process.env.PORT || 3000, () => console.log('API Server started on http://localhost:3000'));
}

startBot();
