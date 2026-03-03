/**
 * ocr_service_sheet.js
 * Reads a service sheet image via Claude Vision and updates the Services sheet.
 */
const { google } = require('googleapis');
const fs = require('fs');
const https = require('https');

const SHEET_ID = process.env.SHEET_ID || '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4';
const TOKEN_PATH = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/token.json';
const SECRET_PATH = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/client_secret.json';

const SERVICES_ROWS = {
  SCRN002:4, DOZ001:5, BULLD12:6, FEL001:7, FEL002:8, FEL003:9, FEL004:10, FEL005:11,
  ADT001:12, ADT002:13, ADT003:14, ADT004:15, ADT005:16, ADT006:17,
  EXC001:18, EXC002:19, EXC003:20, EXC004:21, EXC005:22,
  GEN001:23, GEN002:24, GEN003:25, GEN004:26, GEN005:27,
};
const SVC_INTERVALS = {
  SCRN002:250, DOZ001:250, BULLD12:500,
  FEL001:250, FEL002:250, FEL003:250, FEL004:250, FEL005:250,
  ADT001:250, ADT002:250, ADT003:250, ADT004:250, ADT005:250, ADT006:250,
  EXC001:250, EXC002:250, EXC003:250, EXC004:250, EXC005:250,
  GEN001:250, GEN002:250, GEN003:250, GEN004:250, GEN005:250,
};
const NAME_TO_CODE = {
  'gen 001':'GEN001','gen001':'GEN001','gen 002':'GEN002','gen002':'GEN002',
  'gen 003':'GEN003','gen003':'GEN003','gen 004':'GEN004','gen004':'GEN004',
  'gen 005':'GEN005','gen005':'GEN005','rp gen':'GEN004',
  'exc 001':'EXC001','exc001':'EXC001','ex 001':'EXC001','hyundai':'EXC001',
  'exc 002':'EXC002','exc002':'EXC002','ex 002':'EXC002',
  'exc 003':'EXC003','exc003':'EXC003','ex 003':'EXC003','volvo':'EXC003',
  'exc 004':'EXC004','exc004':'EXC004','ex 004':'EXC004',
  'exc 005':'EXC005','exc005':'EXC005','ex 005':'EXC005',
  'adt 001':'ADT001','adt001':'ADT001','adt 002':'ADT002','adt002':'ADT002',
  'adt 003':'ADT003','adt003':'ADT003','adt 004':'ADT004','adt004':'ADT004',
  'adt 005':'ADT005','adt005':'ADT005','adt 006':'ADT006','adt006':'ADT006',
  'fel 001':'FEL001','fel001':'FEL001','fel 002':'FEL002','fel002':'FEL002',
  'fel 003':'FEL003','fel003':'FEL003','fel 004':'FEL004','fel004':'FEL004',
  'fel 005':'FEL005','fel005':'FEL005',
  'doz 001':'DOZ001','doz001':'DOZ001','dozer':'DOZ001','bulld 001':'DOZ001',
  'bulld 12':'BULLD12','bulld12':'BULLD12','bulld d12':'BULLD12',
  'scrn 002':'SCRN002','scrn002':'SCRN002','screen':'SCRN002','finlay':'SCRN002',
};

function resolveCode(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim().replace(/[^a-z0-9 ]/g,'');
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key];
  for (const [k, v] of Object.entries(NAME_TO_CODE)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

function callVision(b64Image, mediaType) {
  return new Promise((resolve, reject) => {
    // OCR-ONLY API key — NOT used for anything else. Everything else uses OAuth.
    const apiKey = process.env.ANTHROPIC_OCR_API_KEY;
    if (!apiKey) { reject(new Error('ANTHROPIC_OCR_API_KEY not set')); return; }
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: b64Image }
          },
          {
            type: 'text',
            text: `This is a Clearsun mining job card / service sheet. Extract exactly:
1. Machine name or number (e.g. GEN 002, EXC 001, ADT 003)
2. Hours reading at time of service (numeric)
3. Next service due hours (numeric)
4. Date of service (DD/MM/YYYY)

Reply ONLY in this exact format (no other text):
MACHINE: <name>
HOURS: <number>
NEXT_SERVICE: <number>
DATE: <dd/mm/yyyy>`
          }
        ]
      }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { reject(new Error('Anthropic API: ' + parsed.error.message)); return; }
          const text = parsed.content?.[0]?.text || '';
          console.log('[ocr] Claude Sonnet response:', text);
          resolve(text);
        } catch(e) { reject(new Error('Claude parse error: ' + data.substring(0,200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function ocrServiceSheet(imageInput, mimeOrDate, messageDate) {
  let b64, mime;
  if (typeof imageInput === 'string') {
    b64 = imageInput;
    mime = typeof mimeOrDate === 'string' && mimeOrDate.startsWith('image/') ? mimeOrDate : 'image/jpeg';
    if (!messageDate) messageDate = mimeOrDate;
  } else {
    b64 = imageInput.toString('base64');
    mime = 'image/jpeg';
    messageDate = mimeOrDate;
  }

  // M4: heap snapshot before OCR
  const _heapBefore = process.memoryUsage().heapUsed;
  console.log('[ocr] Sending image to Claude vision... heapBefore=' + (_heapBefore/1048576).toFixed(2) + 'MB');
  let _ocrResponse = await callVision(b64, mime);
  const text = _ocrResponse;
  _ocrResponse = null; // M4: null response buffer after extraction
  b64 = null;          // M4: null input buffer (caller should also null it)
  const _heapAfter = process.memoryUsage().heapUsed;
  console.log('[ocr] Claude response processed. heapAfter=' + (_heapAfter/1048576).toFixed(2) + 'MB delta=' + ((_heapAfter-_heapBefore)/1048576).toFixed(2) + 'MB');

  const records = [];
  const machineM = text.match(/MACHINE:\s*(.+)/i);
  const hoursM   = text.match(/HOURS:\s*([\d,]+)/i);
  const nextM    = text.match(/NEXT_SERVICE:\s*([\d,]+)/i);
  const dateM    = text.match(/DATE:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);

  if (machineM && hoursM) {
    const code = resolveCode(machineM[1].trim());
    const hours = parseFloat(hoursM[1].replace(/,/g,''));
    // Next service from OCR, or calculate as next fixed milestone
    let nextSvc;
    if (nextM) {
      nextSvc = parseFloat(nextM[1].replace(/,/g,''));
    } else {
      // Fixed milestones: 250, 500, 750, 1000... (or 500, 1000, 1500... for BULLD12)
      const interval = SVC_INTERVALS[code] || 250;
      nextSvc = Math.ceil(hours / interval) * interval;
    }
    const date = dateM ? dateM[1] : messageDate;
    if (code) records.push({ machine: code, serviceHours: hours, nextService: nextSvc, date });
  }
  return records;
}

function getSheets() {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH,'utf8'));
  const secret = JSON.parse(fs.readFileSync(SECRET_PATH,'utf8'));
  const creds = secret.installed || secret.web;
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
  auth.setCredentials(tokens);
  return google.sheets({ version:'v4', auth });
}

// Reuse the shared Sheets hardening wrapper from sheets_writer
const { sheetsWriteCall } = require('./sheets_writer');

async function applyServiceRecords(records, dateStr) {
  const sheets = getSheets();
  const results = [];
  for (const rec of records) {
    const row = SERVICES_ROWS[rec.machine];
    if (!row) { results.push({ machine: rec.machine, status: 'unknown machine' }); continue; }
    await sheetsWriteCall(`Services!B${row}:D${row}`, () => sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Services!B${row}:D${row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[rec.date || dateStr, rec.serviceHours, rec.nextService]] }
    }));
    results.push({ machine: rec.machine, status: `B=${rec.date} C=${rec.serviceHours} D=${rec.nextService}` });
    console.log(`[ocr] Wrote Services row ${row} for ${rec.machine}`);
  }
  return results;
}

module.exports = { ocrServiceSheet, applyServiceRecords };
