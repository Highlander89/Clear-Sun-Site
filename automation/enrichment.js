const crypto = require('crypto')

const KEYWORDS = {
  SAFETY: ["injury", "accident", "danger", "fire", "electrical", "shock", "bleed", "ambulance"],
  ISSUE_BLOCKER: ["no stock", "out of", "missing", "delayed", "delay", "stuck", "cancelled", "broken", "failed", "problem"],
  ACCESS: ["locked", "can't get in", "cant get in", "security", "gate", "access"],
  WEATHER: ["rain", "storm", "wind"],
  LOGISTICS: ["delivery", "delivered", "supplier", "order", "invoice", "quote", "stock"],
  PROGRESS_UPDATE: ["done", "complete", "completed", "started", "finished", "installed", "mounted"],
}

function normalize(text) {
  return (text || "").toString().trim()
}

function containsAny(hay, needles) {
  const h = hay.toLowerCase()
  return needles.some((n) => h.includes(n))
}

function categorize(text) {
  const t = text.toLowerCase()
  // Question intent should win over generic topic keywords
  if (t.includes('?') || t.startsWith('can you') || t.startsWith('please')) return 'QUESTION'
  if (containsAny(t, KEYWORDS.SAFETY)) return 'SAFETY'
  if (containsAny(t, KEYWORDS.ACCESS)) return 'ADMIN'
  if (containsAny(t, KEYWORDS.ISSUE_BLOCKER)) return 'ISSUE_BLOCKER'
  if (containsAny(t, KEYWORDS.WEATHER)) return 'ADMIN'
  if (containsAny(t, KEYWORDS.LOGISTICS)) return 'LOGISTICS'
  if (containsAny(t, KEYWORDS.PROGRESS_UPDATE)) return 'PROGRESS_UPDATE'
  return 'ADMIN'
}

function priority(text, category) {
  const t = text.toLowerCase()
  if (category === 'SAFETY') return 'urgent'
  if (containsAny(t, ["asap", "urgent", "immediately", "now"])) return 'high'
  if (category === 'ISSUE_BLOCKER') return 'high'
  return 'med'
}

function extractActionItems(text) {
  // Lightweight heuristic: lines starting with verbs or containing "please" / "need to"
  const lines = normalize(text).split(/\n+/).map(l => l.trim()).filter(Boolean)
  const items = []
  for (const l of lines) {
    const low = l.toLowerCase()
    if (low.startsWith('please ') || low.includes('need to ') || low.includes('must ') || low.startsWith('can you ')) {
      items.push(l)
    }
  }
  return items
}

function fingerprint(entry) {
  // Stable-ish ID to dedupe: sender+text+minute bucket
  const bucket = entry.ts ? entry.ts.slice(0, 16) : '' // YYYY-MM-DDTHH:MM
  const raw = `${entry.sender}|${bucket}|${entry.text}`
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12)
}

function enrich(entry) {
  const text = normalize(entry.text)
  const category = categorize(text)
  const pri = priority(text, category)
  const action_items = extractActionItems(text)
  return {
    message_id: entry.message_id || fingerprint(entry),
    ts: entry.ts,
    sender: entry.sender,
    text,
    category,
    priority: pri,
    needs_reply: category === 'QUESTION',
    action_items,
    confidence: 0.7,
  }
}

module.exports = { enrich, categorize, priority }
