const fs = require('fs')
const path = require('path')

const STATE_FILE = path.join(__dirname, '.digest-state.json')

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}

function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return []
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
  const out = []
  for (const l of lines) {
    try { out.push(JSON.parse(l)) } catch {}
  }
  return out
}

function startOfDayISO(date = new Date()) {
  const d = new Date(date)
  d.setHours(0,0,0,0)
  return d.toISOString()
}

function buildDailyDigest(enrichedRows, date = new Date()) {
  const dayStart = new Date(startOfDayISO(date))
  const today = enrichedRows.filter(r => r.ts && new Date(r.ts) >= dayStart)

  const urgent = today.filter(r => r.priority === 'urgent' || r.priority === 'high')
  const blockers = today.filter(r => r.category === 'ISSUE_BLOCKER')
  const actions = today.flatMap(r => (r.action_items || []).map(a => ({ ts: r.ts, sender: r.sender, text: a })))

  const topEvents = today.slice(-10).reverse().slice(0,5)

  const lines = []
  lines.push(`🧾 *Clearsun Daily Digest* — ${dayStart.toISOString().slice(0,10)}`)
  lines.push('')

  if (urgent.length) {
    lines.push(`🚨 *Urgent / High* (${urgent.length})`)
    for (const r of urgent.slice(0,5)) lines.push(`• ${short(r.text)} (${r.sender || 'unknown'})`)
    lines.push('')
  }

  if (blockers.length) {
    lines.push(`⛔ *Blockers* (${blockers.length})`)
    for (const r of blockers.slice(0,5)) lines.push(`• ${short(r.text)} (${r.sender || 'unknown'})`)
    lines.push('')
  }

  if (actions.length) {
    lines.push(`✅ *Action items* (${actions.length})`)
    for (const a of actions.slice(0,7)) lines.push(`• ${short(a.text)} (${a.sender || 'unknown'})`)
    lines.push('')
  }

  lines.push(`🗒 *Recent highlights*`) 
  for (const r of topEvents) lines.push(`• [${r.category}] ${short(r.text)} (${r.sender || 'unknown'})`)

  return lines.join('\n')
}

function short(t, n=120) {
  const s = (t || '').replace(/\s+/g,' ').trim()
  return s.length > n ? s.slice(0, n-1) + '…' : s
}

function shouldRunToday(key) {
  const st = loadState()
  const today = new Date().toISOString().slice(0,10)
  return st[key] !== today
}

function markRanToday(key) {
  const st = loadState()
  st[key] = new Date().toISOString().slice(0,10)
  saveState(st)
}

module.exports = { readJsonl, buildDailyDigest, shouldRunToday, markRanToday }
