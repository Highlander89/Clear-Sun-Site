// Clearsun daily service + fuel alert — runs at 15:00 UTC (17:00 SAST)
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const ENV_PATH = path.join(__dirname, 'clearsun.env');
const envVars = {};
fs.readFileSync(ENV_PATH, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) envVars[m[1].trim()] = m[2].trim();
});

const SHEET_ID = envVars.SHEET_ID || '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4';
const WA_GROUP_JID = envVars.WA_GROUP_JID;
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
const CLEARSUN_TOKENS = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/token.json';
const CLEARSUN_SECRET = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/client_secret.json';

async function getSheetData() {
  const tokens = JSON.parse(fs.readFileSync(CLEARSUN_TOKENS, 'utf8'));
  const secret = JSON.parse(fs.readFileSync(CLEARSUN_SECRET, 'utf8'));
  const creds = secret.installed || secret.web;
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
  auth.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth });

  const svc = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Services!A4:F30' });
  const fuel = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!F47' });
  const fuelVal = parseFloat((fuel.data.values?.[0]?.[0] || '0').replace(/[^0-9.-]/g, ''));
  return { serviceRows: svc.data.values || [], fuelLitres: fuelVal };
}

async function buildAlert() {
  const { serviceRows, fuelLitres } = await getSheetData();
  const alerts = [];

  serviceRows.forEach(row => {
    const name = (row[0] || '').trim();
    const hoursLeft = parseFloat((row[5] || '').toString().replace(/[^0-9.-]/g, ''));
    if (!name || isNaN(hoursLeft)) return;
    if (hoursLeft < 0) {
      alerts.push('🔴 *' + name + '* — OVERDUE by ' + Math.abs(Math.round(hoursLeft)) + 'h');
    } else if (hoursLeft <= 50) {
      alerts.push('🟡 *' + name + '* — ' + Math.round(hoursLeft) + 'h to next service');
    }
  });

  if (!isNaN(fuelLitres) && fuelLitres > 0 && fuelLitres < 20000) {
    alerts.push('⛽ *Fuel stock LOW* — ' + fuelLitres.toLocaleString('en-ZA') + 'L remaining (threshold: 20,000L)');
  }

  if (alerts.length === 0) return null;

  const dateStr = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
  return '*🔔 Clearsun Daily Alert — ' + dateStr + '*\n\n' + alerts.join('\n');
}

async function sendWhatsApp(message) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    connectTimeoutMs: 30000,
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 25000);
    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        clearTimeout(timeout);
        try {
          await sock.sendMessage(WA_GROUP_JID, { text: message });
          console.log('Alert sent successfully');
        } catch(e) { console.error('Send failed:', e.message); }
        await sock.end();
        resolve();
      } else if (connection === 'close') {
        clearTimeout(timeout);
        reject(new Error('WA connection closed'));
      }
    });
    sock.ev.on('creds.update', saveCreds);
  });
}

(async () => {
  try {
    const msg = await buildAlert();
    if (!msg) { console.log('No alerts today.'); process.exit(0); }
    console.log('Message:\n' + msg);
    if (WA_GROUP_JID) {
      await sendWhatsApp(msg);
    } else {
      console.warn('WA_GROUP_JID not set — logged only');
    }
    process.exit(0);
  } catch(e) {
    console.error('Alert error:', e.message);
    process.exit(1);
  }
})();
