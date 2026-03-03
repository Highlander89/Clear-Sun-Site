const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');

const TARGET_GROUP = process.env.TARGET_GROUP || '120363302362176212@g.us';
const SESSION_DIR = path.join(__dirname, 'auth_info_baileys');

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' }),
  });
  sock.ev.on('creds.update', saveCreds);

  await new Promise(r => setTimeout(r, 1500));

  const msg = `TEST CLEAR SUN BOT ${new Date().toISOString()}`;
  await sock.sendMessage(TARGET_GROUP, { text: msg });
  console.log('sent:', TARGET_GROUP, msg);

  // give it a moment to flush
  await new Promise(r => setTimeout(r, 1500));
  process.exit(0);
}

main().catch(e => {
  console.error('failed:', e.message);
  process.exit(1);
});
