const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFile } = require('child_process');
const crypto = require('crypto');

// ── M1: Message deduplication ──────────────────────────────────────────────
// Keyed on sha256(sender+text+timestamp_minute). Drops replays within 60s.
const _dedupCache = new Map(); // hash → timestamp (ms)
const DEDUP_TTL_MS = 60 * 1000;     // drop duplicate within 60s
const DEDUP_CLEAR_MS = 120 * 1000;  // evict entries older than 120s
const DEDUP_MAX = 5000;             // cap to prevent unbounded growth

function dedupeCheck(sender, text, tsMs) {
    // Bucket to the current minute so back-to-back seconds collide
    const minute = Math.floor(tsMs / 60000);
    const hash = crypto.createHash('sha256').update(`${sender}|${text}|${minute}`).digest('hex');
    const now = Date.now();
    // Evict stale entries
    for (const [k, v] of _dedupCache) {
        if (now - v > DEDUP_CLEAR_MS) _dedupCache.delete(k);
    }
    // Cap size: drop oldest entries if we ever balloon (Map preserves insertion order)
    while (_dedupCache.size > DEDUP_MAX) {
        const oldestKey = _dedupCache.keys().next().value;
        _dedupCache.delete(oldestKey);
    }
    if (_dedupCache.has(hash) && now - _dedupCache.get(hash) < DEDUP_TTL_MS) {
        return { duplicate: true, hash };
    }
    _dedupCache.set(hash, now);
    return { duplicate: false, hash };
}
// ── End M1 ─────────────────────────────────────────────────────────────────

const { enrich } = require('./enrichment');
const { enqueue, isSent, markSent, rateLimitedAppend } = require('./queue');
const { readJsonl, buildDailyDigest, shouldRunToday, markRanToday } = require('./digest');

const TARGET_GROUP = process.env.TARGET_GROUP || '120363302362176212@g.us';
const LOG_FILE = path.join(__dirname, 'group-messages.log');
const ENRICHED_FILE = path.join(__dirname, 'enriched-messages.jsonl');
const SESSION_DIR = path.join(__dirname, 'auth_info_baileys');
const PHONE_NUMBER = process.env.PHONE_NUMBER || '27828558841'; // bot number without +
const ALERT_TO = process.env.CLEARSUN_ALERT_TO || PHONE_NUMBER; // personal number to receive alerts/digest
const DIGEST_HOUR = parseInt(process.env.DIGEST_HOUR || '8', 10); // 17:00 SAST default
const ALERT_COOLDOWN_MIN = parseInt(process.env.ALERT_COOLDOWN_MIN || '30', 10);
const DISCONNECT_LOG = path.join(__dirname, 'disconnect-events.log');
const ALERT_STATE_FILE = path.join(__dirname, '.alert-state.json');


function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}


// --- Heap monitoring (enable with HEAP_LOG=1) ---
let _activeHeapTimer = null;
let _activeSock = null;
let _digestTimer = null; // M4: avoid leaking multiple digest intervals on reconnect
if (process.env.HEAP_LOG === '1') {
    _activeHeapTimer = setInterval(() => {
        const m = process.memoryUsage();
        log('[HEAP] heapUsed=' + (m.heapUsed/1048576).toFixed(2) + 'MB heapTotal=' + (m.heapTotal/1048576).toFixed(2) + 'MB rss=' + (m.rss/1048576).toFixed(2) + 'MB external=' + (m.external/1048576).toFixed(2) + 'MB arrayBuffers=' + (m.arrayBuffers/1048576).toFixed(2) + 'MB');
    }, 10 * 60 * 1000); // every 10 minutes
    _activeHeapTimer.unref(); // don't keep process alive
}
// --- End heap monitoring ---

function loadAlertState() {
  try { return JSON.parse(fs.readFileSync(ALERT_STATE_FILE, 'utf8')) } catch { return {} }
}

function saveAlertState(s) {
  fs.writeFileSync(ALERT_STATE_FILE, JSON.stringify(s, null, 2))
}

function logMessage(msg) {
    const entry = {
        ts: new Date().toISOString(),
        from: msg.key.remoteJid,
        sender: msg.key.participant || msg.key.remoteJid,
        text: msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              '[non-text]'
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

    // Enrichment
    try {
        const enriched = enrich(entry);
        fs.appendFileSync(ENRICHED_FILE, JSON.stringify(enriched) + '\n');
        return enriched;
    } catch (e) {
        log(`Enrichment error: ${e.message}`);
        return null;
    }
}


async function appendToSheets(enriched, msg) {
  return new Promise((resolve, reject) => {
    try {
      const script = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/clearsun_append_rawdata.sh';
      const direction = 'inbound';
      const fromName = enriched?.sender || '';
      const fromNumber = enriched?.sender || '';
      const text = enriched?.text || '';
      const messageId = enriched?.message_id || '';
      const conversationId = msg?.key?.remoteJid || '';

      execFile(script, [direction, fromName, fromNumber, text, messageId, conversationId], { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
          log(`Sheets append failed: ${err.message} ${stderr||''}`);
          return reject(err);
        }
        if (stdout) log(stdout.trim());
        return resolve(true);
      });
    } catch (e) {
      log(`Sheets append error: ${e.message}`);
      return reject(e);
    }
  });
}

async function connectToWhatsApp() {
    // Clean up previous socket and intervals to prevent listener/memory accumulation
    // NOTE: do NOT clear heap timer; it is process-wide and would otherwise stop monitoring after reconnects.
    if (_digestTimer) { try { clearInterval(_digestTimer); } catch(e) {} _digestTimer = null; }
    if (_activeSock) { try { _activeSock.ev.removeAllListeners(); } catch(e) {} }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // pairing code — no QR
        logger: require('pino')({ level: 'silent' }),
        syncFullHistory: false,  // disabled — caused replay storm
        markOnlineOnConnect: false,
    });

    // Pairing code flow — only on first run (no session yet)
    if (!sock.authState.creds.registered) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(resolve => setTimeout(resolve, 2000)); // let socket settle
        try {
            const code = await sock.requestPairingCode(PHONE_NUMBER);
            const formatted = code.match(/.{1,4}/g).join('-');
            console.log('\n========================================');
            console.log(`  PAIRING CODE: ${formatted}`);
            console.log('  Enter this in WhatsApp > Linked Devices');
            console.log('========================================\n');
        } catch (e) {
            console.error('Failed to get pairing code:', e.message);
        }
        rl.close();
    }

    _activeSock = sock;
    sock.ev.on('creds.update', saveCreds);

    // Optional one-shot test send (useful for proving WhatsApp → Sheets end-to-end)
    let testSent = false;

    // Connection churn dampening (backoff + jitter)
    let reconnectAttempt = 0;
    const disconnectWindow = []; // timestamps (ms) of recent disconnects
    const DISCONNECT_WINDOW_MS = 30 * 60 * 1000; // 30 min
    const DISCONNECT_ALERT_THRESHOLD = 10;
    const RECONNECT_BASE_MS = 5000;
    const RECONNECT_MAX_MS = 60000;
    const RECONNECT_JITTER_MS = 1500;
    let pendingChurnAlert = false;
    let lastDisconnectReason = null;

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const now = Date.now();
            disconnectWindow.push(now);
            while (disconnectWindow.length && (now - disconnectWindow[0] > DISCONNECT_WINDOW_MS)) disconnectWindow.shift();

            lastDisconnectReason = reason;
            log(`Connection closed. Reason: ${reason} (disconnects_30m=${disconnectWindow.length})`);

            try {
                const line = JSON.stringify({ ts: new Date().toISOString(), reason, disconnects30m: disconnectWindow.length }) + '\n';
                fs.appendFileSync(DISCONNECT_LOG, line);
            } catch (e) { /* ignore */ }

            if (reason === DisconnectReason.loggedOut) {
                log('Logged out — delete auth_info_baileys/ and restart to re-pair');
                process.exit(1);
            }

            // If churn is high, queue an alert to send once we reconnect (avoids sending during a down state)
            if (disconnectWindow.length >= DISCONNECT_ALERT_THRESHOLD) {
                pendingChurnAlert = true;
            }

            // Exponential backoff + jitter
            reconnectAttempt = Math.min(reconnectAttempt + 1, 10);
            const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt - 1));
            const jitter = Math.floor(Math.random() * RECONNECT_JITTER_MS);
            const delay = backoff + jitter;

            log(`Reconnecting in ${delay}ms (attempt=${reconnectAttempt})...`);
            setTimeout(connectToWhatsApp, delay);

        } else if (connection === 'open') {
            reconnectAttempt = 0;
            log('✅ Connected to WhatsApp');

            // Send churn alert now that we're connected again
            if (pendingChurnAlert) {
                pendingChurnAlert = false;
                try {
                    const state = loadAlertState();
                    const key = 'conn_churn';
                    const now = Date.now();
                    const last = state[key] || 0;
                    if (now - last >= ALERT_COOLDOWN_MIN * 60 * 1000) {
                        const jid = waJidFromNumber(ALERT_TO);
                        const msg = `⚠️ WhatsApp connection churn

Reconnects in last 30 min: ${disconnectWindow.length}
Last reason code: ${lastDisconnectReason || 'unknown'}

Bot is currently connected again.`;
                        await sock.sendMessage(jid, { text: msg });
                        state[key] = now;
                        saveAlertState(state);
                    }
                } catch (e) {
                    log(`Churn alert send failed: ${e.message}`);
                }
            }

            // Send a one-shot test message if requested via env
            if (!testSent && process.env.SEND_TEST_ON_OPEN === '1') {
                testSent = true;
                try {
                    const text = `TEST CLEAR SUN BOT ${new Date().toISOString()}`;
                    await sock.sendMessage(TARGET_GROUP, { text });
                    log(`✅ Sent test message to ${TARGET_GROUP}: ${text}`);
                } catch (e) {
                    log(`Test send failed: ${e.message}`);
                }
            }
        }
    });

    function waJidFromNumber(num) {
        const digits = (num || '').replace(/\D/g, '')
        return `${digits}@s.whatsapp.net`
    }

    async function maybeSendUrgentAlert(enriched) {
        if (!enriched) return
        if (enriched.priority !== 'urgent' && enriched.priority !== 'high') return

        // Cooldown to prevent alert spam on repeated messages
        const state = loadAlertState()
        const key = `${enriched.category}|${enriched.priority}`
        const now = Date.now()
        const last = state[key] || 0
        if (now - last < ALERT_COOLDOWN_MIN * 60 * 1000) return

        const jid = waJidFromNumber(ALERT_TO)
        const text = `🚨 Clearsun Alert\n\n[${enriched.category}] (${enriched.priority})\n${enriched.text}\n\nFrom: ${enriched.sender}`
        try {
            await sock.sendMessage(jid, { text })
            state[key] = now
            saveAlertState(state)
        } catch (e) {
            log(`Alert send failed: ${e.message}`)
        }
    }

    function startDailyDigestLoop() {
        if (_digestTimer) return; // already running
        _digestTimer = setInterval(async () => {
        const nowDt = new Date();

        // ── Weekly reminders ──────────────────────────────────────────────
        const day = nowDt.getUTCDay(); // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
        const hr  = nowDt.getUTCHours();
        const min = nowDt.getUTCMinutes();
        if (min === 0) {
            // Thursday 10:00 SAST (08:00 UTC) — PEP safety talk reminder
            if (day === 4 && hr === 8 && shouldRunToday('pepReminder')) {
                try {
                    await sock.sendMessage(TARGET_GROUP, { text: 'Friendly reminder to prepare PEP safety talk for tomorrow\'s safety meeting.' });
                    markRanToday('pepReminder');
                    log('✅ PEP safety talk reminder sent');
                } catch(e) { log('PEP reminder error: ' + e.message); }
            }
            // Friday 09:00 SAST (07:00 UTC) — Weekly Plant Safety Checklist
            if (day === 5 && hr === 7 && shouldRunToday('plantSafetyReminder')) {
                try {
                    await sock.sendMessage(TARGET_GROUP, { text: 'Friendly reminder to do the weekly Plant Safety Checklist.' });
                    markRanToday('plantSafetyReminder');
                    log('✅ Plant Safety Checklist reminder sent');
                } catch(e) { log('Plant safety reminder error: ' + e.message); }
            }

            // Bi-weekly Tuesday 09:00 SAST (07:00 UTC) — HF Screen Sieves stock take
            if (day === 2 && hr === 7 && shouldRunToday('sievesStockTake')) {
                // Check if 14+ days since last run
                const state = loadAlertState();
                const lastSieves = state['lastSievesStockTake'] || 0;
                const daysSinceLast = (Date.now() - lastSieves) / (1000 * 60 * 60 * 24);
                if (daysSinceLast >= 13.5) {
                    try {
                        await sock.sendMessage(TARGET_GROUP, { text: 'Friendly reminder to do stock taking on HF screen sieves.' });
                        state['lastSievesStockTake'] = Date.now();
                        fs.writeFileSync(ALERT_STATE_FILE, JSON.stringify(state));
                        markRanToday('sievesStockTake');
                        log('✅ HF screen sieves stock take reminder sent');
                    } catch(e) { log('Sieves reminder error: ' + e.message); }
                }
            }


            // Saturday 14:00 SAST (12:00 UTC) — Weekly production report
            if (day === 6 && hr === 12 && min === 0 && shouldRunToday('weeklyReport')) {
                try {
                    const { google } = require('googleapis');
                    const SHEET_ID = process.env.SHEET_ID || '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4';
                    const tokens = JSON.parse(fs.readFileSync('/home/ubuntu/.openclaw/workspace/scripts/clearsun/token.json', 'utf8'));
                    const secret = JSON.parse(fs.readFileSync('/home/ubuntu/.openclaw/workspace/scripts/clearsun/client_secret.json', 'utf8'));
                    const creds = secret.installed || secret.web;
                    const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
                    auth.setCredentials(tokens);
                    const gSheets = google.sheets({ version: 'v4', auth });

                    // Determine Mon-Sat row range (SAST)
                    const sastNow = new Date(nowDt.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
                    const satDay = sastNow.getDate(); // today = Saturday
                    const monDay = satDay - 5;        // Monday = Sat - 5
                    const monRow = monDay + 3;
                    const satRow = satDay + 3;

                    const ADT_TABS = {
                        'Bell B20 ADT 001': 20, 'RBullD CMT96 - ADT 002': 55,
                        'ADT003': 40, 'Bell B40 - ADT 004': 40,
                        'RB CMT96 - ADT 005': 55, 'Powerstar 4035 - ADT 006': 40,
                    };
                    const ALL_TABS = [
                        'Finlay Screen - Scrn002','DOZ 001','BULLD 12',
                        'RB Loader RB856 - FEL 001','RB Loader ZL60 - FEL 002','Bell Loader - FEL 003',
                        'RB Loader RB856 - FEL 004','RB Loader RB856 - FEL 005',
                        'Bell B20 ADT 001','RBullD CMT96 - ADT 002','ADT003','Bell B40 - ADT 004',
                        'RB CMT96 - ADT 005','Powerstar 4035 - ADT 006',
                        'Hyundai - EX 001','RB - EX 002','Volvo - EX 003','RB - EX 004','RB - EX 005',
                        'Gen - 001 SCREEN','Gen - 002','Gen - 003','RP Gen - 004','Gen - 005 PLANT',
                    ];

                    const parseVal = v => parseFloat((v||'').replace(/[^0-9.-]/g,'')) || 0;

                    // 1. Total diesel used (sum F col Mon-Sat across all machine tabs)
                    let totalDieselL = 0;
                    for (const tab of ALL_TABS) {
                        try {
                            const r = await gSheets.spreadsheets.values.get({
                                spreadsheetId: SHEET_ID,
                                range: `'${tab}'!F${monRow}:F${satRow}`,
                            });
                            (r.data.values||[]).forEach(row => { totalDieselL += parseVal(row[0]); });
                        } catch(e) { /* skip */ }
                    }

                    // 2. Get diesel price (K2)
                    const k2r = await gSheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!K2' });
                    const dieselPrice = parseVal(k2r.data.values?.[0]?.[0]) || 18.457;
                    const totalDieselCost = totalDieselL * dieselPrice;

                    // 3. Total replacement cost (sum K col Mon-Sat across all machine tabs)
                    let totalReplacementCost = 0;
                    for (const tab of ALL_TABS) {
                        try {
                            const r = await gSheets.spreadsheets.values.get({
                                spreadsheetId: SHEET_ID,
                                range: `'${tab}'!K${monRow}:K${satRow}`,
                            });
                            (r.data.values||[]).forEach(row => { totalReplacementCost += parseVal(row[0]); });
                        } catch(e) { /* skip */ }
                    }

                    // 4. ROM Tons = F32 delta (current F32 minus last Saturday's F32)
                    const romR = await gSheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!F32' });
                    const romF32Current = parseVal(romR.data.values?.[0]?.[0]);
                    const reportState = loadAlertState();
                    const romF32LastSat = reportState['lastSaturdayF32'] || 0;
                    const romTons = romF32Current - romF32LastSat;
                    // Store current F32 for next Saturday's delta
                    reportState['lastSaturdayF32'] = romF32Current;
                    fs.writeFileSync(path.join(__dirname, '.alert-state.json'), JSON.stringify(reportState));

                    // 5. ADT loads: H=Quarry, J=Screen, K=Tailings — sum Mon-Sat rows × payload
                    let tonsQuarryToScreen = 0, tonsScreenToPlant = 0, tonsTailings = 0;
                    for (const [tab, payload] of Object.entries(ADT_TABS)) {
                        try {
                            const r = await gSheets.spreadsheets.values.get({
                                spreadsheetId: SHEET_ID,
                                range: `'${tab}'!H${monRow}:K${satRow}`,
                            });
                            (r.data.values||[]).forEach(row => {
                                tonsQuarryToScreen += parseVal(row[0]) * payload; // H = Quarry
                                tonsScreenToPlant  += parseVal(row[2]) * payload; // J = Screen (col index 2: H,I,J)
                                tonsTailings       += parseVal(row[3]) * payload; // K = Tailings
                            });
                        } catch(e) { /* skip */ }
                    }

                    const fmtR = n => `R${n.toLocaleString('en-ZA', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
                    const fmtN = n => n.toLocaleString('en-ZA', {maximumFractionDigits:1});
                    const monDate = `${monDay} Mar`;
                    const satDate = `${satDay} Mar`;

                    let report = `*📊 Weekly Production Report*\n_${monDate} – ${satDate} ${sastNow.getFullYear()}_\n\n`;
                    report += `⛽ *Fuel Used:* ${fmtN(totalDieselL)}L\n`;
                    report += `💰 *Fuel Cost:* ${fmtR(totalDieselCost)}\n`;
                    report += `🔧 *Replacement Cost:* ${fmtR(totalReplacementCost)}\n`;
                    report += `⛏️ *ROM Tons:* ${fmtN(romTons)}t\n\n`;
                    report += `*Loads (Tons):*\n`;
                    report += `• Quarry → Screen: ${fmtN(tonsQuarryToScreen)}t\n`;
                    report += `• Screen → Plant: ${fmtN(tonsScreenToPlant)}t\n`;
                    report += `• Plant Tailings: ${fmtN(tonsTailings)}t`;

                    await sock.sendMessage(TARGET_GROUP, { text: report });
                    markRanToday('weeklyReport');
                    log('✅ Weekly production report sent');
                } catch(e) { log('Weekly report error: ' + e.message); }
            }

            // 1st of month 08:00 SAST (06:00 UTC) — Monthly summary for previous month
            if (nowDt.getUTCDate() === 1 && hr === 6 && min === 0 && shouldRunToday('monthlyReport')) {
                try {
                    const { google } = require('googleapis');
                    const SHEET_ID = process.env.SHEET_ID || '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4';
                    const tokens = JSON.parse(fs.readFileSync('/home/ubuntu/.openclaw/workspace/scripts/clearsun/token.json', 'utf8'));
                    const secret = JSON.parse(fs.readFileSync('/home/ubuntu/.openclaw/workspace/scripts/clearsun/client_secret.json', 'utf8'));
                    const creds = secret.installed || secret.web;
                    const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
                    auth.setCredentials(tokens);
                    const gSheets = google.sheets({ version: 'v4', auth });

                    const parseVal = v => parseFloat((v||'').replace(/[^0-9.-]/g,'')) || 0;

                    // All monthly totals come from row 35 (F35=diesel total, K35=replacement cost, L35=ADT load totals)
                    const ALL_TABS = [
                        'Finlay Screen - Scrn002','DOZ 001','BULLD 12',
                        'RB Loader RB856 - FEL 001','RB Loader ZL60 - FEL 002','Bell Loader - FEL 003',
                        'RB Loader RB856 - FEL 004','RB Loader RB856 - FEL 005',
                        'Bell B20 ADT 001','RBullD CMT96 - ADT 002','ADT003','Bell B40 - ADT 004',
                        'RB CMT96 - ADT 005','Powerstar 4035 - ADT 006',
                        'Hyundai - EX 001','RB - EX 002','Volvo - EX 003','RB - EX 004','RB - EX 005',
                        'Gen - 001 SCREEN','Gen - 002','Gen - 003','RP Gen - 004','Gen - 005 PLANT',
                    ];
                    const ADT_TABS = {
                        'Bell B20 ADT 001': 20, 'RBullD CMT96 - ADT 002': 55,
                        'ADT003': 40, 'Bell B40 - ADT 004': 40,
                        'RB CMT96 - ADT 005': 55, 'Powerstar 4035 - ADT 006': 40,
                    };

                    let totalDieselL = 0, totalReplacementCost = 0;
                    let tonsQ = 0, tonsS = 0, tonsT = 0;

                    for (const tab of ALL_TABS) {
                        try {
                            const r = await gSheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'!F35:K35` });
                            const row = r.data.values?.[0] || [];
                            totalDieselL += parseVal(row[0]);
                            totalReplacementCost += parseVal(row[5]);
                        } catch(e) {}
                    }
                    for (const [tab, payload] of Object.entries(ADT_TABS)) {
                        try {
                            const r = await gSheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'!H35:K35` });
                            const row = r.data.values?.[0] || [];
                            tonsQ += parseVal(row[0]) * payload;
                            tonsS += parseVal(row[2]) * payload;
                            tonsT += parseVal(row[3]) * payload;
                        } catch(e) {}
                    }

                    const k2r = await gSheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!K2' });
                    const dieselPrice = parseVal(k2r.data.values?.[0]?.[0]) || 18.457;
                    const romR = await gSheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!F32' });
                    const romTons = parseVal(romR.data.values?.[0]?.[0]);

                    const sastNow = new Date(nowDt.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
                    const prevMonth = new Date(sastNow.getFullYear(), sastNow.getMonth() - 1, 1);
                    const monthName = prevMonth.toLocaleString('en-ZA', { month: 'long', year: 'numeric' });

                    const fmtR = n => `R${n.toLocaleString('en-ZA', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
                    const fmtN = n => n.toLocaleString('en-ZA', {maximumFractionDigits:1});

                    let report = `*📊 Monthly Production Summary*\n_${monthName}_\n\n`;
                    report += `⛽ *Fuel Used:* ${fmtN(totalDieselL)}L\n`;
                    report += `💰 *Fuel Cost:* ${fmtR(totalDieselL * dieselPrice)}\n`;
                    report += `🔧 *Replacement Cost:* ${fmtR(totalReplacementCost)}\n`;
                    report += `⛏️ *ROM Tons:* ${fmtN(romTons)}t\n\n`;
                    report += `*Loads (Tons):*\n`;
                    report += `• Quarry → Screen: ${fmtN(tonsQ)}t\n`;
                    report += `• Screen → Plant: ${fmtN(tonsS)}t\n`;
                    report += `• Plant Tailings: ${fmtN(tonsT)}t`;

                    await sock.sendMessage(TARGET_GROUP, { text: report });
                    markRanToday('monthlyReport');
                    log('✅ Monthly production summary sent');
                } catch(e) { log('Monthly report error: ' + e.message); }
            }

            // 2nd of month 09:00 SAST (07:00 UTC) — Oil stock take + machines <150h to service
            if (nowDt.getUTCDate() === 2 && hr === 7 && shouldRunToday('oilStockTake')) {
                try {
                    const { google } = require('googleapis');
                    const SHEET_ID = process.env.SHEET_ID || '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4';
                    const tokens = JSON.parse(fs.readFileSync('/home/ubuntu/.openclaw/workspace/scripts/clearsun/token.json', 'utf8'));
                    const secret = JSON.parse(fs.readFileSync('/home/ubuntu/.openclaw/workspace/scripts/clearsun/client_secret.json', 'utf8'));
                    const creds = secret.installed || secret.web;
                    const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
                    auth.setCredentials(tokens);
                    const gSheets = google.sheets({ version: 'v4', auth });
                    const svc = await gSheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Services!A4:F30' });
                    const rows = svc.data.values || [];
                    const upcoming = rows.filter(r => {
                        const h = parseFloat((r[5]||'').toString().replace(/[^0-9.-]/g,''));
                        return !isNaN(h) && h <= 150;
                    }).map(r => {
                        const h = parseFloat((r[5]||'').toString().replace(/[^0-9.-]/g,''));
                        const icon = h < 0 ? '🔴' : h <= 50 ? '🟡' : '🟠';
                        return icon + ' ' + (r[0]||'').trim() + ': ' + Math.round(h) + 'h to service';
                    });
                    let msg = 'Friendly reminder to do stock taking on oil for services for the month.';
                    if (upcoming.length > 0) {
                        msg += '\n\n*Machines due within 150h:*\n' + upcoming.join('\n');
                    } else {
                        msg += '\n\nNo machines due within 150h this month.';
                    }
                    await sock.sendMessage(TARGET_GROUP, { text: msg });
                    markRanToday('oilStockTake');
                    log('✅ Oil stock take reminder sent with ' + upcoming.length + ' machines listed');
                } catch(e) { log('Oil stock take reminder error: ' + e.message); }
            }

            // Monday 09:00 SAST (07:00 UTC) — Weekly Screen Checklist
            if (day === 1 && hr === 7 && shouldRunToday('screenChecklistReminder')) {
                try {
                    await sock.sendMessage(TARGET_GROUP, { text: 'Friendly reminder to do weekly Screen Checklist.' });
                    markRanToday('screenChecklistReminder');
                    log('✅ Screen Checklist reminder sent');
                } catch(e) { log('Screen checklist reminder error: ' + e.message); }
            }
        }

        // File-based manual alert trigger
        const TRIGGER_FILE = path.join(__dirname, '.send-alert-now')
        if (fs.existsSync(TRIGGER_FILE)) {
            fs.unlinkSync(TRIGGER_FILE)
            try {
                const alertMsg = await buildServiceAlert()
                if (alertMsg) {
                    await sock.sendMessage(TARGET_GROUP, { text: alertMsg })
                    log('✅ Manual service alert sent to group')
                }
            } catch (e) {
                log('Manual alert error: ' + e.message)
            }
        }
            const sastNow = new Date(nowDt.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
            if (sastNow.getHours() !== DIGEST_HOUR) return
            if (sastNow.getMinutes() !== 0) return

            // Daily Service/Fuel Alert to group (independent of digest delivery)
            if (shouldRunToday('dailyServiceAlert')) {
                try {
                    const alertMsg = await buildServiceAlert()
                    await sock.sendMessage(TARGET_GROUP, { text: alertMsg })
                    markRanToday('dailyServiceAlert')
                    log('✅ Service/fuel alert sent to group')
                } catch (e) {
                    log('Service alert error: ' + e.message)
                }
            }

            // Daily digest to personal number (optional)
            if (!shouldRunToday('dailyDigest')) return
            const rows = readJsonl(ENRICHED_FILE)
            const digest = buildDailyDigest(rows, nowDt)
            const jid = waJidFromNumber(ALERT_TO)
            try {
                await sock.sendMessage(jid, { text: digest })
                markRanToday('dailyDigest')
                log('✅ Daily digest sent')
            } catch (e) {
                log(`Daily digest send failed: ${e.message}`)
            }
        }, 60 * 1000)
        if (_digestTimer && _digestTimer.unref) _digestTimer.unref();
    }

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return; // only process live messages
        for (const msg of messages) {
            try { // M3: graceful error boundary — log and continue, never crash the loop
            if (msg.key.remoteJid === TARGET_GROUP && (process.env.ALLOW_FROM_ME === '1' || !msg.key.fromMe)) {
                // M1: deduplication check
                const _msgSender = msg.key.participant || msg.key.remoteJid || '';
                const _msgText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[media]';
                const _msgTs = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
                const _dedup = dedupeCheck(_msgSender, _msgText, _msgTs);
                if (_dedup.duplicate) {
                    log(`[DEDUP] dropped duplicate hash=${_dedup.hash.substring(0,12)} from=${_msgSender}`);
                    continue;
                }
                const enriched = logMessage(msg);
                await maybeSendUrgentAlert(enriched)

                // Durable queue: capture locally first, then attempt Sheets append.
                try {
                    if (enriched?.message_id && !isSent(enriched.message_id)) {
                        enqueue({ enriched, direction: 'inbound', conversationId: msg?.key?.remoteJid || '' });
                    }
                } catch (e) {
                    log(`Queue error: ${e.message}`);
                }


                // Image message — OCR service sheet detection
                const imgMsg = msg.message?.imageMessage;
                if (imgMsg) {
                    try {
                        const mime = imgMsg.mimetype || '';
                        const MAX_OCR_BYTES = parseInt(process.env.MAX_OCR_BYTES || String(6 * 1024 * 1024), 10); // 6MB default
                        // Guard: only attempt OCR on real images
                        if (!mime.startsWith('image/')) {
                            // rate-limited noise log
                            global.__lastOcrSkipLog = global.__lastOcrSkipLog || 0;
                            if (Date.now() - global.__lastOcrSkipLog > 60 * 60 * 1000) {
                                global.__lastOcrSkipLog = Date.now();
                                log('[OCR] Skip: non-image mimetype=' + (mime || '[unknown]'));
                            }
                        } else {
                            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                            const { ocrServiceSheet, applyServiceRecords } = require('./ocr_service_sheet');
                            log('[OCR] Image received — downloading for service sheet check');
                            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: { info: ()=>{}, error: ()=>{}, warn: ()=>{} }, reuploadRequest: sock.updateMediaMessage });
                            if (!buffer || !buffer.length) throw new Error('downloadMediaMessage returned empty buffer');
                            if (buffer.length > MAX_OCR_BYTES) {
                                log('[OCR] Skip: image too large (' + buffer.length + ' bytes)');
                            } else {
                                const b64 = buffer.toString('base64');
                                const sastNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
                                const dateStr = sastNow.getDate() + '/' + (sastNow.getMonth()+1) + '/' + sastNow.getFullYear();
                                const records = await ocrServiceSheet(b64, mime || 'image/jpeg', dateStr);
                        log('[OCR] Extracted ' + records.length + ' service records: ' + JSON.stringify(records));
                        if (records.length > 0) {
                            const results = await applyServiceRecords(records, dateStr);
                            const summary = results.map(r => r.machine + ': ' + r.status).join('\n');
                            await sock.sendMessage(TARGET_GROUP, { text: '🔧 Service sheet processed:\n' + summary });
                        } else {
                            log('[OCR] No service records found in image');
                        }
                        // M4: explicit GC hint after OCR to release heap
                        if (global.gc) { global.gc(); log('[HEAP] gc() triggered post-OCR'); }
                            }
                        }
                    } catch(e) {
                        log('[OCR] Error: ' + e.message);
                    }
                }

                // Write to machine/bakkies/production sheets (skip if already processed OR if this was an image handled by OCR)
                const msgId = msg.key.id || '';
                const alreadyWritten = msgId && isSent('sw:' + msgId);
                const isImageMsg = !!(msg.message?.imageMessage);
                if (!alreadyWritten && !isImageMsg) try {
                    // Delete cache so file changes take effect without restart
                    delete require.cache[require.resolve('./sheets_writer')];
                    const { writeMessageToSheets } = require('./sheets_writer');
                    const rawText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                    const alertFn = async (alertMsg) => {
                        try { await sock.sendMessage(TARGET_GROUP, { text: alertMsg }); } catch(e) {}
                    };
                    const _swResult = await writeMessageToSheets(enriched, rawText, alertFn);
                    // Only mark sent if write succeeded (not explicitly false/undefined-from-empty)
                    if (msgId && _swResult !== false) markSent('sw:' + msgId);
                    else if (_swResult === false) log('[sheets_writer] WRITE FAILED — not marking sent, will retry on next message');
                } catch(e) {
                    log('sheets_writer error: ' + e.message);
                    // Do NOT markSent on exception — allow retry
                }
                try {
                    await rateLimitedAppend(() => appendToSheets(enriched, msg), log)
                    if (enriched?.message_id) markSent(enriched.message_id)
                } catch (e) {
                    // leave queued for replay
                }
            }
            } catch (e) { // M3: graceful error boundary
                log(`[ERROR] Uncaught error in message handler: ${e.message} ${e.stack||''}`);
                // continue to next message — do NOT crash
            }
        }
    });

    startDailyDigestLoop()
}

// ── M3: Process-level error guards — reconnect on transient errors ─────────
let _reconnecting = false;
function safeReconnect(label, err) {
    log(`[${label}] ${err?.stack || err?.message || err}`);
    if (_reconnecting) { log(`[${label}] reconnect already in progress — skipping`); return; }
    _reconnecting = true;
    setTimeout(() => {
        _reconnecting = false;
        log(`[${label}] attempting reconnect after error...`);
        connectToWhatsApp().catch(e => log(`[${label}] reconnect failed: ${e.message}`));
    }, 5000);
}

process.on('uncaughtException', (err) => {
    // Exit only on truly fatal errors (e.g. ENOMEM); reconnect on everything else
    if (err?.code === 'ENOMEM') {
        log(`[uncaughtException] FATAL ENOMEM — exiting for PM2 restart`);
        process.exit(1);
    }
    safeReconnect('uncaughtException', err);
});

process.on('unhandledRejection', (reason) => {
    safeReconnect('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});
// ── End M3 ──────────────────────────────────────────────────────────────────

log('Starting Clearsun WhatsApp monitor (Baileys)...');
connectToWhatsApp().catch(err => {
    log(`Fatal error: ${err.message}`);
    process.exit(1);
});

// ── Service & Fuel Alert (08:00 SAST, injected into existing socket) ──────────
async function buildServiceAlert() {
    const { google } = require('googleapis');
    const SHEET_ID = process.env.SHEET_ID || '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4';
    const TOKENS_PATH = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/token.json';
    const SECRET_PATH = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/client_secret.json';
    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    const secret = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf8'));
    const creds = secret.installed || secret.web;
    const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
    auth.setCredentials(tokens);
    const sheets = google.sheets({ version: 'v4', auth });

    const svc = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Services!A4:F30' });
    const fuel = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!F47' });
    const fuelLitres = parseFloat((fuel.data.values?.[0]?.[0] || '0').replace(/[^0-9.-]/g, ''));

    const alerts = [];
    (svc.data.values || []).forEach(row => {
        const name = (row[0] || '').trim();
        const h = parseFloat((row[5] || '').toString().replace(/[^0-9.-]/g, ''));
        if (!name || isNaN(h)) return;
        if (h < 0) alerts.push('\u{1F534} *' + name + '* \u2014 OVERDUE by ' + Math.abs(Math.round(h)) + 'h');
        else if (h <= 50) alerts.push('\u{1F7E1} *' + name + '* \u2014 ' + Math.round(h) + 'h to next service');
    });
    if (!isNaN(fuelLitres) && fuelLitres > 0 && fuelLitres < 20000)
        alerts.push('\u26FD *Fuel stock LOW* \u2014 ' + fuelLitres.toLocaleString('en-ZA') + 'L remaining');

    const dateStr = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
    const header = '*\u{1F514} Clearsun Daily Alert \u2014 ' + dateStr + '*';

    const fuelLine = (!isNaN(fuelLitres) && fuelLitres > 0)
      ? ('\u26FD Fuel stock: ' + fuelLitres.toLocaleString('en-ZA') + 'L')
      : '\u26FD Fuel stock: (unknown)';

    if (!alerts.length) {
      return header + '\n\n\u2705 No machines overdue or within 50h to service.\n' + fuelLine;
    }
    return header + '\n\n' + alerts.join('\n') + '\n\n' + fuelLine;
}
