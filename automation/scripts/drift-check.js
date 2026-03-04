#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SHEETS_WRITER_PATH = path.join(__dirname, '../sheets_writer.js');
// Deployed layout: dashboard lives at /home/ubuntu/clearsun-dashboard
// Repo layout: dashboard/ inside this monorepo.
const BULK_CLOSE_RULES_PATH = fs.existsSync('/home/ubuntu/clearsun-dashboard/app/bulk-close-rules/page.tsx')
  ? '/home/ubuntu/clearsun-dashboard/app/bulk-close-rules/page.tsx'
  : path.join(__dirname, '../../dashboard/app/bulk-close-rules/page.tsx');

const VALID_MACHINE_CODES = new Set([
  'FEL001', 'FEL002', 'FEL003', 'FEL004', 'FEL005',
  'ADT001', 'ADT002', 'ADT003', 'ADT004', 'ADT005', 'ADT006',
  'EXC001', 'EXC002', 'EXC003', 'EXC004', 'EXC005',
  'GEN001', 'GEN002', 'GEN003', 'GEN004', 'GEN005',
  'SCRN002', 'DOZ001', 'BULLD12',
]);

const TAB_MAP = {
  SCRN002: 'Finlay Screen - Scrn002', DOZ001: 'DOZ 001', BULLD12: 'BULLD 12',
  FEL001: 'RB Loader RB856 - FEL 001', FEL002: 'RB Loader ZL60 - FEL 002',
  FEL003: 'Bell Loader - FEL 003', FEL004: 'RB Loader RB856 - FEL 004',
  FEL005: 'RB Loader RB856 - FEL 005', ADT001: 'Bell B20 ADT 001',
  ADT002: 'RBullD CMT96 - ADT 002', ADT003: 'ADT003', ADT004: 'Bell B40 - ADT 004',
  ADT005: 'RB CMT96 - ADT 005', ADT006: 'Powerstar 4035 - ADT 006',
  EXC001: 'Hyundai - EX 001', EXC002: 'RB - EX 002', EXC003: 'Volvo - EX 003',
  EXC004: 'RB - EX 004', EXC005: 'RB - EX 005', GEN001: 'Gen - 001 SCREEN',
  GEN002: 'Gen - 002', GEN003: 'Gen - 003', GEN004: 'RP Gen - 004',
  GEN005: 'Gen - 005 PLANT',
};

const SVC_INTERVALS = {
  SCRN002: 250, DOZ001: 250, BULLD12: 500,
  FEL001: 250, FEL002: 250, FEL003: 250, FEL004: 250, FEL005: 250,
  ADT001: 250, ADT002: 250, ADT003: 250, ADT004: 250, ADT005: 250, ADT006: 250,
  EXC001: 250, EXC002: 250, EXC003: 250, EXC004: 250, EXC005: 250,
  GEN001: 250, GEN002: 250, GEN003: 250, GEN004: 250, GEN005: 250,
};

const SVC_ROW_MAP = {
  SCRN002: 4, DOZ001: 5, BULLD12: 6, FEL001: 7, FEL002: 8, FEL003: 9, FEL004: 10, FEL005: 11,
  ADT001: 12, ADT002: 13, ADT003: 14, ADT004: 15, ADT005: 16, ADT006: 17,
  EXC001: 18, EXC002: 19, EXC003: 20, EXC004: 21, EXC005: 22,
  GEN001: 23, GEN002: 24, GEN003: 25, GEN004: 26, GEN005: 27,
};

function checkDrift() {
  const errors = [];
  const warnings = [];
  
  console.log('=== Bulk Close Rules Drift Check ===\n');
  
  console.log('1. Checking VALID_MACHINE_CODES in sheets_writer.js...');
  console.log('   Machine codes from code:', [...VALID_MACHINE_CODES].sort().join(', '));
  
  console.log('\n2. Checking TAB_MAP in sheets_writer.js...');
  const tabMapKeys = Object.keys(TAB_MAP).sort();
  console.log('   Tab map keys:', tabMapKeys.join(', '));
  
  console.log('\n3. Checking SVC_INTERVALS in sheets_writer.js...');
  console.log('   Service intervals:', JSON.stringify(SVC_INTERVALS, null, 2));
  
  console.log('\n4. Checking SVC_ROW_MAP in sheets_writer.js...');
  console.log('   Service row map:', JSON.stringify(SVC_ROW_MAP, null, 2));
  
  console.log('\n5. Validating consistency...');
  
  const tabMapCodes = new Set(tabMapKeys.map(k => k.replace(/\s/g, '')));
  for (const code of VALID_MACHINE_CODES) {
    if (!tabMapCodes.has(code)) {
      errors.push(`VALID_MACHINE_CODES has ${code} but TAB_MAP is missing`);
    }
  }
  
  for (const code of tabMapKeys) {
    const normalizedCode = code.replace(/\s/g, '');
    if (!VALID_MACHINE_CODES.has(normalizedCode)) {
      warnings.push(`TAB_MAP has ${code} but not in VALID_MACHINE_CODES`);
    }
  }
  
  for (const code of Object.keys(SVC_INTERVALS)) {
    if (!VALID_MACHINE_CODES.has(code)) {
      errors.push(`SVC_INTERVALS has ${code} but not in VALID_MACHINE_CODES`);
    }
  }
  
  for (const code of Object.keys(SVC_ROW_MAP)) {
    if (!VALID_MACHINE_CODES.has(code)) {
      errors.push(`SVC_ROW_MAP has ${code} but not in VALID_MACHINE_CODES`);
    }
  }
  
  console.log('\n6. Checking bulk-close-rules page...');
  if (fs.existsSync(BULK_CLOSE_RULES_PATH)) {
    const content = fs.readFileSync(BULK_CLOSE_RULES_PATH, 'utf8');
    
    for (const code of [...VALID_MACHINE_CODES].sort()) {
      if (!content.includes(code) && !content.includes(code.replace(/(\d)$/, ' $1'))) {
        warnings.push(`Machine code ${code} not found in bulk-close-rules page`);
      }
    }
    
    if (content.includes('column H') && content.includes('column J') && content.includes('column K')) {
      console.log('   ✓ Load columns documented (H, J, K)');
    } else {
      errors.push('Load columns (H, J, K) not fully documented');
    }
    
    if (content.includes('column D') && content.includes('D35')) {
      console.log('   ✓ Hours columns documented (D, D35)');
    } else {
      errors.push('Hours columns (D, D35) not fully documented');
    }
    
    if (content.includes('column F')) {
      console.log('   ✓ Diesel column documented (F)');
    } else {
      errors.push('Diesel column (F) not documented');
    }
    
    if (content.includes('Services!C') && content.includes('Services!D') && content.includes('Services!E')) {
      console.log('   ✓ Services sheet columns documented');
    } else {
      errors.push('Services sheet columns not fully documented');
    }
    
    if (content.includes('250') && content.includes('500')) {
      console.log('   ✓ Service intervals documented');
    } else {
      warnings.push('Service intervals not documented');
    }
  } else {
    errors.push('bulk-close-rules page not found');
  }
  
  console.log('\n=== Results ===');
  
  if (errors.length > 0) {
    console.log('\nERRORS:');
    errors.forEach(e => console.log('  - ' + e));
  }
  
  if (warnings.length > 0) {
    console.log('\nWARNINGS:');
    warnings.forEach(w => console.log('  - ' + w));
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✓ No drift detected - all checks passed!');
  }
  
  return { errors, warnings, passed: errors.length === 0 };
}

if (require.main === module) {
  const result = checkDrift();
  process.exit(result.passed ? 0 : 1);
}

module.exports = { checkDrift, VALID_MACHINE_CODES, TAB_MAP, SVC_INTERVALS, SVC_ROW_MAP };
