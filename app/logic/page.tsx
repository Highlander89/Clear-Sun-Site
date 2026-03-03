"use client";

const sections = [
  {
    title: "Sheet IDs & Config",
    icon: "📎",
    rules: [
      { label: "Feb 2026 Sheet", detail: "1Of4jDITb3OrrmSGdAKigoNwNnNzlh2xga8uc-ha8WWc" },
      { label: "Mar 2026 Sheet (live)", detail: "1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4" },
      { label: "Frederick Google Account", detail: "bfbotma@gmail.com (Editor access on all sheets)" },
      { label: "WA Group JID", detail: "120363302362176212@g.us" },
      { label: "Timezone", detail: "Africa/Johannesburg (SAST = UTC+2)" },
    ],
  },
  {
    title: "Message Format & Parsing",
    icon: "📨",
    rules: [
      {
        label: "Bulk Closing Message",
        detail: "Format: \"MACHINE closing_hours (next_service_due)\" per line, then load sections.\n\nExample:\n  FEL 001 3191 (3250)\n  ADT 002 4089 (4250)\n  QUARRY\n  ADT 002= 8\n  TAILINGS\n  ADT 006= 1\n  SCREEN MATERIAL\n  ADT 003 = 5\n\nFirst number = closing hours → D column\nBracketed number = next service milestone → Services!D",
      },
      { label: "Bulk Detection", detail: "3+ lines starting with machine codes (FEL/ADT/EXC/GEN/SCRN/BULLD) = bulk message." },
      {
        label: "Data Quality Layer (Normalization)",
        detail: "Before parsing, text is normalized to reduce human formatting errors. Implemented in production bot:\n\n• Machine codes: GEN005 / gen-5 / GEN 5 → GEN 005 (also FEL/EXC/ADT/SCRN/DOZ; BULLD variants)\n• Thousands separators: 42 500 / 42,500 → 42500 (keeps decimal commas for loads like 0,5)\n\nThis runs before all parsers so it applies to diesel, dips, hours, loads, services, and fuel price messages."
      },
      {
        label: "Confirmations on Risky Inputs",
        detail: "Implemented: for suspicious out-of-range values (fuel price, diesel dip, diesel issue), bot requires OK/CORRECT before writing. Normal values still write immediately."
      },
      { label: "Diesel Messages", detail: "Number adjacent to \"L\" or \"litres\" takes priority. Diesel ACCUMULATES — read existing F value and ADD (never overwrite)." },
      { label: "Service Messages", detail: "Keywords: \"service\", \"serviced\", \"250h\", \"500h\".\nWrites B=date, C=hours, D=next milestone to Services sheet.\nNEVER writes to E or F." },
      { label: "After-Midnight Rule", detail: "Messages 00:00–05:59 SAST → attributed to previous day." },
      { label: "Half Loads", detail: "Written as decimal (0.5, 1.5) using sheet's convention." },
      { label: "Unknown Machine", detail: "Log to RawData + send group alert. Do NOT attempt to write." },
      { label: "Ambiguous Input", detail: "Log only, do NOT write. Never guess." },
    ],
  },
  {
    title: "Row Mapping",
    icon: "🗓️",
    rules: [
      { label: "Formula", detail: "Row = 3 + day of month.\nMarch 1 = row 4, March 2 = row 5, ... March 31 = row 34" },
      { label: "Row 3", detail: "Column headers on all machine tabs." },
      { label: "C4 (Day 1 Start)", detail: "Opening hours for the month — set manually from previous month's final D35." },
      { label: "D4 (Day 1 Stop)", detail: "Set = C4 at month start until first real closing data." },
      { label: "C5:C34 Formula", detail: "=IF(D{row}=0,\"\",D{row-1})\nStart hours only appear once THAT DAY's closing hours (D) are written.\nBot NEVER writes to C for rows 5+." },
      { label: "Row 35", detail: "Monthly totals row — all formulas (SUM or derived). Never write raw values." },
    ],
  },
  {
    title: "Column Mapping — Machine Tabs (Standard)",
    icon: "📋",
    rules: [
      { label: "B", detail: "Date (formula from Hours Summary Page — never write)" },
      { label: "C", detail: "Start hours (formula C5:C34 — only C4 is manual)" },
      { label: "D", detail: "Stop/closing hours ✅ WRITE from daily closing message" },
      { label: "E", detail: "Hours worked = D-C (formula — never write)" },
      { label: "F", detail: "Diesel litres ✅ WRITE (accumulate, never overwrite)" },
      { label: "G", detail: "Area = EPL3218 (was ML130 — replaced everywhere)" },
      { label: "D35", detail: "Current stop hours — updated daily by bot" },
      { label: "E35", detail: "=SUM(E4:E34) total hours worked (formula)" },
      { label: "F35", detail: "=SUM(F4:F34) total diesel (formula — never clear this)" },
    ],
  },
  {
    title: "Column Mapping — ADT Load Columns",
    icon: "🚛",
    rules: [
      { label: "H — Quarry to Screen", detail: "From QUARRY section of closing message ✅ WRITE" },
      { label: "I — Stripping", detail: "Not in daily message. Manual entry only." },
      { label: "J — Screen to Plant", detail: "From SCREEN MATERIAL section ✅ WRITE\n(ADT001: labeled 'Waste Plant Sand')" },
      { label: "K — Plant Tailings", detail: "From TAILINGS section ✅ WRITE" },
      { label: "L — ADT001-005: Tons", detail: "FORMULA — never write. Auto-calculates from loads × payload." },
      { label: "L — ADT006: Concentrate", detail: "Separate load type (not formula). Only write if explicitly stated in message." },
    ],
  },
  {
    title: "ADT Payload Sizes",
    icon: "⚖️",
    rules: [
      { label: "ADT001 (Bell B20)", detail: "20 tonnes" },
      { label: "ADT002 (RBullD CMT96)", detail: "55 tonnes" },
      { label: "ADT003", detail: "40 tonnes" },
      { label: "ADT004 (Bell B40)", detail: "40 tonnes" },
      { label: "ADT005 (RB CMT96)", detail: "55 tonnes" },
      { label: "ADT006 (Powerstar 4035)", detail: "40 tonnes" },
    ],
  },
  {
    title: "Replacement Cost",
    icon: "💰",
    rules: [
      { label: "How It Works", detail: "Each machine tab has a rate cell and a daily replacement cost column.\nDaily formula: =IF(E{row}=0,\"\",E{row}*$RATE_CELL)\nRow 35: =SUM(col4:col34)" },
      { label: "Rate Cells & Columns", detail: "SCRN002: K1=R709/hr → K col\nDOZ001: K1=R270/hr → K col\nBULLD12: K1=R1,129.41/hr → K col\nFEL001: K1=R270/hr → M col\nFEL002-004: K1=R270/hr → K col\nFEL005: K1=R800/hr → K col\nADT001: P1=R40/hr → P col\nADT002-005: P1=R450/hr → P col\nADT006: Q1=R142/hr → Q col\nEXC001-003: K1=R542/hr → K col\nEXC004: K1=R253/hr → K col\nEXC005: K1=R800/hr → K col\nGEN001-005: K1=R18.457/hr → J col" },
      { label: "BULLD12 Derivation", detail: "Machine cost R18m, 20% salvage = R14.4m depreciable\n5yr × 255 days × 10h = 12,750h lifespan\nR14,400,000 / 12,750 = R1,129.41/hr" },
    ],
  },
  {
    title: "Services Sheet",
    icon: "🔧",
    rules: [
      { label: "Column Spec", detail: "A = Machine name\nB = Date of service (DD/MM/YYYY) ✅ WRITE\nC = Hours at service ✅ WRITE\nD = Next service due (fixed milestone) ✅ WRITE\nE = Current machine hours (updated daily via stop hours) ✅ WRITE\nF = =D-E (hours remaining — NEVER overwrite)" },
      { label: "Service Intervals", detail: "250h for all machines EXCEPT BULLD12 = 500h.\nFixed milestones: 250, 500, 750, 1000, 1250...\nBULLD12: 500, 1000, 1500, 2000...\nNext service = Math.ceil(hours / interval) * interval" },
      { label: "Row Map", detail: "SCRN002=4, DOZ001=5, BULLD12=6\nFEL001=7, FEL002=8, FEL003=9, FEL004=10, FEL005=11\nADT001=12, ADT002=13, ADT003=14, ADT004=15, ADT005=16, ADT006=17\nEXC001=18, EXC002=19, EXC003=20, EXC004=21, EXC005=22\nGEN001=23, GEN002=24, GEN003=25, GEN004=26, GEN005=27\nHilux2.8=28, Hilux2.5=29" },
      { label: "Write Rules", detail: "Service event → writes ONLY B:D\nDaily closing message → updates E (current hours)\nF is always formula =D-E\nOCR (photo) overrides text approximation\nFormat C:F as plain numbers (not dates — prevents display bug)" },
      { label: "Daily 17:00 Alert", detail: "Machines overdue (F < 0) → alert to WA group\nMachines ≤50h to service → warning\nFuel stock < 20,000L → alert" },
    ],
  },
  {
    title: "Production Summary",
    icon: "📊",
    rules: [
      { label: "Col B — Equipment", detail: "Machine names (formula from Hours Summary Page)" },
      { label: "Col I — Replacement Cost", detail: "Pulls from each machine tab's replacement cost column row 35.\nAuto-calculates as daily hours × rate accumulate." },
      { label: "Col J — Diesel Ltrs", detail: "Pulls from machine tab F35 (=SUM(F4:F34)).\nAuto-updates as diesel is logged." },
      { label: "Col K — Diesel/Hour", detail: "=IFERROR(IF(E35<=0,0,F35/E35),0)\nBULLD12 special: uses D35-C4 instead of E35." },
      { label: "Col L — Diesel Cost", detail: "=K2 × J{row}. Auto-recalculates when K2 (price/L) changes." },
      { label: "K2 — Diesel Price", detail: "R per litre. Updated via \"fuel price X\" / \"K2 update X\" message." },
    ],
  },
  {
    title: "Fuel Management (Production Summary rows 45-47)",
    icon: "⛽",
    rules: [
      { label: "C47 — Opening Stock", detail: "Previous month's F47 value. Set manually at month start." },
      { label: "D47 — Litres Refuelled", detail: "Auto-written when refuel detected (new dip > previous dip)." },
      { label: "E47 — Litres Used", detail: "=J30 (total diesel consumed for month)." },
      { label: "F47 — Stock On Hand", detail: "=(C47+D47)-E47. Auto-updates continuously." },
      { label: "Refuel Detection", detail: "New dip reading > previous dip → refuel detected.\nLitres added = new - previous → written to D47.\nGroup alert sent requesting updated fuel price." },
      { label: "Dip Entries", detail: "B48 onwards: date + litres for each diesel dip." },
    ],
  },
  {
    title: "Bakkies Diesel",
    icon: "🚙",
    rules: [
      { label: "Tab: Bakkies", detail: "Column A = Date, data rows start at 4." },
      { label: "Column Map", detail: "B = Hilux 2.5\nC = Hilux 3L / 3.0\nD = VW Bus\nE = Hino Truck\nF = Hilux 2.8" },
    ],
  },
  {
    title: "Machine Tab Map (exact sheet names)",
    icon: "🗺️",
    rules: [
      { label: "SCRN002", detail: "Finlay Screen - Scrn002" },
      { label: "DOZ001", detail: "DOZ 001" },
      { label: "BULLD12", detail: "BULLD 12" },
      { label: "FEL001", detail: "RB Loader RB856 - FEL 001" },
      { label: "FEL002", detail: "RB Loader ZL60 - FEL 002" },
      { label: "FEL003", detail: "Bell Loader - FEL 003" },
      { label: "FEL004", detail: "RB Loader RB856 - FEL 004" },
      { label: "FEL005", detail: "RB Loader RB856 - FEL 005" },
      { label: "ADT001", detail: "Bell B20 ADT 001" },
      { label: "ADT002", detail: "RBullD CMT96 - ADT 002" },
      { label: "ADT003", detail: "ADT003" },
      { label: "ADT004", detail: "Bell B40 - ADT 004" },
      { label: "ADT005", detail: "RB CMT96 - ADT 005" },
      { label: "ADT006", detail: "Powerstar 4035 - ADT 006" },
      { label: "EXC001", detail: "Hyundai - EX 001" },
      { label: "EXC002", detail: "RB - EX 002" },
      { label: "EXC003", detail: "Volvo - EX 003" },
      { label: "EXC004", detail: "RB - EX 004" },
      { label: "EXC005", detail: "RB - EX 005" },
      { label: "GEN001", detail: "Gen - 001 SCREEN" },
      { label: "GEN002", detail: "Gen - 002" },
      { label: "GEN003", detail: "Gen - 003" },
      { label: "GEN004", detail: "RP Gen - 004" },
      { label: "GEN005", detail: "Gen - 005 PLANT" },
    ],
  },
  {
    title: "Machine Aliases & Special Cases",
    icon: "🏷️",
    rules: [
      { label: "BULLD 001 = DOZ001", detail: "Frederick sends \"BULLD 001\" (with space) in messages → maps to DOZ 001 tab." },
      { label: "BULLD001 (retired)", detail: "\"BULLD001\" (no space) = retired machine. Log to RawData + alert. Do NOT write." },
      { label: "Roller CH", detail: "Does NOT exist. Removed from all code and arrays." },
      { label: "D12 / BULLD12", detail: "500h service interval. Tab: 'BULLD 12'. Rate: R1,129.41/hr." },
      { label: "ML130 → EPL3218", detail: "Area code replaced everywhere (G column + Hours Summary Page C4)." },
      { label: "ADT003 tab name", detail: "\"ADT003\" (no space, no tab artifact)." },
    ],
  },
  {
    title: "Hours Summary Page",
    icon: "📅",
    rules: [
      { label: "Purpose", detail: "Plant Schedule / Clear Sun Schedule dashboard. READ-ONLY.\nContains formulas referencing machine tabs." },
      { label: "Row 7", detail: "Dates across B..AF (B7 = 1st of month, C7 = B7+1, etc.)" },
      { label: "Row 8", detail: "Weekday numbers via WEEKDAY() formula." },
      { label: "Machine rows (10+)", detail: "Formula references into machine tabs (e.g. ='DOZ 001'!E4)." },
      { label: "NEVER WRITE", detail: "Do not write directly to Hours Summary Page. Write to machine tabs — schedule updates automatically." },
    ],
  },
  {
    title: "Weekly Reminders",
    icon: "⏰",
    rules: [
      { label: "Thursday 10:00 SAST", detail: "\"Friendly reminder to prepare PEP safety talk for tomorrow's safety meeting.\"" },
      { label: "Friday 09:00 SAST", detail: "\"Friendly reminder to do the weekly Plant Safety Checklist.\"" },
      { label: "Monday 09:00 SAST", detail: "\"Friendly reminder to do weekly Screen Checklist.\"" },
    ],
  },
  {
    title: "OCR (Service Sheet Photos)",
    icon: "📸",
    rules: [
      { label: "Model", detail: "Claude Sonnet 4.6 via Anthropic API (x-api-key header).\nOCR-only API key — separate from OAuth tokens used for everything else." },
      { label: "Flow", detail: "1. WhatsApp image received (imageMessage event)\n2. Buffer downloaded via Baileys downloadMediaMessage\n3. Base64 encoded + sent to Claude with structured prompt\n4. Response parsed: MACHINE, HOURS, NEXT_SERVICE, DATE\n5. Machine code resolved via fuzzy matching\n6. Written to Services sheet B:D" },
      { label: "Fallback", detail: "If OCR returns 0 records, image is logged to RawData.\nManual entry via text message still works." },
    ],
  },
  {
    title: "Safety Rules",
    icon: "🛡️",
    rules: [
      { label: "Never Guess", detail: "If input is ambiguous, log to RawData and alert. Do not write incorrect data." },
      { label: "Never Overwrite Formulas", detail: "Protected cells:\n- C5:C34 (start hours formula)\n- E column (hours worked = D-C)\n- F35 (=SUM diesel)\n- Services!F (=D-E)\n- L column on ADT001-005 (tons formula)\n- Hours Summary Page (entirely read-only)" },
      { label: "Diesel Accumulation", detail: "Read existing F value and ADD new litres — never overwrite." },
      { label: "Idempotent Replay", detail: "Deduped by message ID (isSent/markSent). Replay never double-writes." },
      { label: "History Sync DISABLED", detail: "syncFullHistory caused replay storm of all old messages. Only 'notify' type (live messages) processed." },
      { label: "SAST Timezone", detail: "All comparisons use:\nnew Date(dt.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }))" },
      { label: "RawData Immutable Log", detail: "Every processed message appended to RawData tab as audit trail. Never modified after writing." },
    ],
  },
  {
    title: "Weekly Report (Saturday 14:00 SAST)",
    icon: "📈",
    rules: [
      { label: "Source", detail: "Individual machine tab daily rows (Mon-Sat range), NOT Production Summary MTD totals." },
      { label: "ROM Tons", detail: "F32 delta: current F32 minus stored last Saturday's value in alert-state.json." },
      { label: "Loads", detail: "ADT H/J/K columns × payload, summed Mon-Sat rows." },
    ],
  },
];

export default function LogicPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">📐 Sheet Logic & Rules</h1>
        <p className="text-slate-400 mt-1">
          Complete reference for how WhatsApp messages map to Google Sheets cells.
          Every rule the bot follows is documented here.
        </p>
      </div>
      {sections.map((section) => (
        <div key={section.title} className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/80">
            <h2 className="text-lg font-semibold text-white">{section.icon} {section.title}</h2>
          </div>
          <div className="divide-y divide-slate-700/50">
            {section.rules.map((rule) => (
              <div key={rule.label} className="px-6 py-4">
                <h3 className="text-emerald-400 font-medium text-sm mb-1">{rule.label}</h3>
                <pre className="text-slate-300 text-sm whitespace-pre-wrap font-mono leading-relaxed">{rule.detail}</pre>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700 px-6 py-4">
        <p className="text-slate-500 text-xs">
          Last updated: 2 March 2026 · Source: 8 spec files (1,078 lines) · Confirmed with Frederick Botma
        </p>
      </div>
    </div>
  );
}
