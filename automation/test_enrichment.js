const assert = require('assert')
const { enrich } = require('./enrichment')

function t(text) {
  const e = enrich({ ts: new Date().toISOString(), sender: 'tester', text })
  return e
}

// Safety
let e = t('There was an injury on site, ambulance called')
assert.equal(e.category, 'SAFETY')
assert.equal(e.priority, 'urgent')

// Blocker
e = t('No stock for brackets, delayed delivery')
assert.equal(e.category, 'ISSUE_BLOCKER')
assert.equal(e.priority, 'high')

// Question
e = t('Can you confirm delivery time?')
assert.equal(e.needs_reply, true)

console.log('✅ enrichment tests passed')
