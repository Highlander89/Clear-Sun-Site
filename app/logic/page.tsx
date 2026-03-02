"use client";

const sections = [
  {
    title: "Message Format & Parsing",
    icon: "📨",
    rules: [
      {
        label: "Bulk Closing Message",
        detail: "Format: \"MACHINE closing_hours (next_service_due)\" per line, then load sections.\nExample:\n  FEL 001 3191 (3250)\n  ADT 002 4089 (4250)\n  QUARRY\n  ADT 002= 8\n  TAILINGS\n  ADT 006= 1\n  SCREEN MATERIAL\n  ADT 003 = 5",
      },
      {
        label: "Bulk Detection",
        detail: "A message with 3+ lines starting with machine codes (FEL/ADT/EXC/GEN/SCRN/BULLD) is treated as a bulk message.",
      },
      {
        label: "Diesel Messages",
        detail: "Number adjacent to \"L\" or \"litres\" takes priority. Diesel accumulates — if logged twice for same machine same day, read existing F value and ADD (never overwrite).",
      },
      {
        label: "Service Messages",
        detail: "Detected by keywords: \"service\", \"serviced\", \"250h\", \"500h\". Writes B=date, C=hours, D=nextDue to Services sheet. NEVER writes to E or F.",
      },
      {
        label: "After-Midnight Rule",
        detail: "Messages received after midnight but before 06:00 SAST are attributed to the previous day.",
      },
    ],
  },
  {
    title: "Column Mapping — Machine Tabs",
    icon: "📋",
    rules: [
      {
        label: "Core Columns (all machines)",
        detail: "C = Start hours (formula: =IF(D{row}=0,\"\",D{prev_row}) — only shows when D is populated)\nD = Stop/closing hours (from daily closing message)\nE = Hours worked (formula: =D-C)\nF = Diesel litres\nG = Area (EPL3218)\nD35 = Current stop hours (updated daily)",
      },
      {
        label: "ADT Load Columns",
        detail: "H = Loads — Quarry to Screen (from QUARRY section)\nI = Loads — Stripping (not in daily message)\nJ = Loads — Screen to Plant (from SCREEN MATERIAL section)\nK = Loads — Plant Tailings (from TAILINGS section)\nL = ADT001-005: Tons (formula — NEVER write to it)\nL = ADT006 only: Loads — Concentrate (manual, only if stated)",
      },
      {
        label: "Replacement Cost Column",
        detail: "SCRN002, DOZ001, BULLD12, FEL002-005, EXC: K col (rate from K1)\nFEL001: M col (rate from K1)\nADT001-005: P col (rate from P1)\nADT006: Q col (rate from Q1)\nGEN001-005: J col (rate from K1)\nFormula: =IF(E{row}=0,\"\",E{row}*$RATE_CELL)",
      },
      {
        label: "Row 35 Totals",
        detail: "D35 = current stop hours (written daily by bot)\nE35 = =SUM(E4:E34) total hours worked\nF35 = =SUM(F4:F34) total diesel\nReplacement cost col row 35 = SUM of daily values",
      },
    ],
  },
  {
    title: "Row Mapping",
    icon: "🗓️",
    rules: [
      { label: "Formula", detail: "Row = 3 + day. March 1 = row 4, March 2 = row 5, etc." },
      { label: "C4 (Row 4, Day 1)", detail: "Opening hours for the month — set manually from previous month's final stop hours." },
      { label: "C5:C34", detail: "Formula: =IF(D{row}=0,\"\",D{row-1}) — start hours only appear once that day's closing hours are written. Bot NEVER writes to C for rows 5+." },
    ],
  },
  {
    title: "Services Sheet",
    icon: "🔧",
    rules: [
      {
        label: "Column Spec",
        detail: "A = Machine name\nB = Date of service (DD/MM/YYYY)\nC = Hours at service (from WA message or OCR)\nD = Next service due (C + interval)\nE = Current machine hours (updated daily via stop hours)\nF = =D-E formula (hours remaining — NEVER overwritten)",
      },
      { label: "Service Intervals", detail: "250h for all machines EXCEPT BULLD12 which is 500h." },
      {
        label: "Row Map",
        detail: "SCRN002=4, DOZ001=5, BULLD12=6, FEL001=7, FEL002-005=8-11\nADT001-006=12-17, EXC001-005=18-22, GEN001-005=23-27",
      },
      { label: "Service Write Rule", detail: "Service event writes ONLY B:D. E updated via daily stop hours. F is always formula =D-E." },
    ],
  },
  {
    title: "Machine Aliases & Special Cases",
    icon: "🏷️",
    rules: [
      { label: "BULLD 001 = DOZ001", detail: "Frederick sends BULLD 001 in messages — maps to DOZ 001 tab (the dozer)." },
      { label: "BULLD001 (retired)", detail: "If referenced (no space), log to RawData and alert. Do not write." },
      { label: "Roller CH", detail: "Does NOT exist. Removed from all code." },
      { label: "D12 / BULLD12", detail: "500h service interval. Tab name: 'BULLD 12'." },
    ],
  },
  {
    title: "Production Summary",
    icon: "📊",
    rules: [
      { label: "Column I — Machine Replacement Cost", detail: "Pulls from each machine tab's replacement cost column row 35." },
      { label: "Column J — Diesel Ltrs", detail: "Pulls from each machine tab F35 (=SUM(F4:F34))." },
      { label: "Column K — Diesel/Hour", detail: "Formula: diesel / hours. IFERROR for zero hours." },
      { label: "Column L — Diesel Cost", detail: "Formula: K2 (price/litre) × J (diesel litres)." },
    ],
  },
  {
    title: "Safety Rules",
    icon: "🛡️",
    rules: [
      { label: "Never Guess", detail: "If input is ambiguous, log to RawData and alert." },
      { label: "Never Overwrite Formulas", detail: "C5:C34, E col, Services!F, F35, L col on ADT001-005." },
      { label: "Diesel Accumulation", detail: "Read existing F value and ADD new litres — never overwrite." },
      { label: "Idempotent Replay", detail: "Deduped by message ID hash. Replay never double-writes." },
      { label: "Unknown Machines", detail: "Log to RawData + alert. Do not write." },
      { label: "SAST Timezone", detail: "All comparisons use toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' })" },
    ],
  },
  {
    title: "Replacement Cost Rates (R/hr)",
    icon: "💰",
    rules: [
      { label: "SCRN002", detail: "R709/hr (K1)" },
      { label: "DOZ001", detail: "R270/hr (K1)" },
      { label: "BULLD12", detail: "R1,129.41/hr (K1)" },
      { label: "FEL001-004", detail: "R270/hr (K1)" },
      { label: "FEL005", detail: "R800/hr (K1)" },
      { label: "ADT001", detail: "R40/hr (P1)" },
      { label: "ADT002-005", detail: "R450/hr (P1)" },
      { label: "ADT006", detail: "R142/hr (Q1)" },
      { label: "EXC001-003", detail: "R542/hr (K1)" },
      { label: "EXC004", detail: "R253/hr (K1)" },
      { label: "EXC005", detail: "R800/hr (K1)" },
      { label: "GEN001-005", detail: "R18.457/hr (K1)" },
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
        <p className="text-slate-500 text-xs">Last updated: 2 March 2026 · Confirmed with Frederick Botma</p>
      </div>
    </div>
  );
}
