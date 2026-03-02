"use client";
import { useState } from "react";

type CheckItem = { id: string; label: string; detail?: string };
type CheckSection = { title: string; icon: string; items: CheckItem[] };

const endOfMonth: CheckSection[] = [
  {
    title: "Final Day Data Capture",
    icon: "📥",
    items: [
      { id: "eom1", label: "Confirm all machine closing hours received and written to D column" },
      { id: "eom2", label: "Confirm all diesel entries for last day written to F column" },
      { id: "eom3", label: "Confirm all ADT loads for last day written (H/I/J/K columns)" },
      { id: "eom4", label: "Verify D35 on all 24 machine tabs = last day's closing hours" },
    ],
  },
  {
    title: "Services Sheet Audit",
    icon: "🔧",
    items: [
      { id: "eom5", label: "Update Services!E for all 24 machines with final closing hours" },
      { id: "eom6", label: "Verify Services!F formula (=D-E) is intact on all rows 4-27" },
      { id: "eom7", label: "Screenshot overdue services (F < 0) for Frederick" },
      { id: "eom8", label: "Log any machines that were serviced but not recorded" },
    ],
  },
  {
    title: "Production Summary Verification",
    icon: "📊",
    items: [
      { id: "eom9", label: "Verify column I (Replacement Cost) shows values for all 24 machines" },
      { id: "eom10", label: "Verify column J (Diesel Ltrs) matches F35 totals across machine tabs" },
      { id: "eom11", label: "Verify column K (Diesel/Hour) shows reasonable values" },
      { id: "eom12", label: "Verify column L (Diesel Cost) uses correct K2 rate" },
      { id: "eom13", label: "Check ROM Tons calculation (F32 or applicable cell)" },
    ],
  },
  {
    title: "Backup & Archive",
    icon: "💾",
    items: [
      { id: "eom14", label: "Git commit + tag: prod-YYYY-MM-DD-final" },
      { id: "eom15", label: "Record final D35 values for all machines (needed for next month C4)" },
      { id: "eom16", label: "Export RawData tab as CSV backup" },
      { id: "eom17", label: "Save alert-state.json snapshot (weekly report ROM baseline)" },
    ],
  },
];

const startOfMonth: CheckSection[] = [
  {
    title: "New Sheet Setup",
    icon: "📄",
    items: [
      { id: "som1", label: "Duplicate previous month's sheet (or use template)" },
      { id: "som2", label: "Update SHEET_ID in clearsun.env with new sheet ID" },
      { id: "som3", label: "Restart clearsun-wa PM2 process to pick up new SHEET_ID" },
      { id: "som4", label: "Share new sheet with bfbotma@gmail.com (Editor access)" },
    ],
  },
  {
    title: "Machine Tab Setup (all 24 tabs)",
    icon: "🚛",
    items: [
      { id: "som5", label: "Set C4 (opening hours) = previous month's final D35 for each machine", detail: "This is the starting meter reading for the new month" },
      { id: "som6", label: "Set C5:C34 formulas: =IF(D{row}=0,\"\",D{row-1})", detail: "750 cells across 24 tabs — bot has script for this" },
      { id: "som7", label: "Clear D4:D34 (stop hours) — start fresh" },
      { id: "som8", label: "Clear F4:F34 (diesel) — start fresh" },
      { id: "som9", label: "Clear H4:L34 on ADT tabs (loads) — start fresh" },
      { id: "som10", label: "Verify E column formulas: =D-C for rows 4-34" },
      { id: "som11", label: "Verify F35 formula: =SUM(F4:F34) on all tabs" },
      { id: "som12", label: "Verify replacement cost formulas in correct columns (K/M/P/Q/J)" },
    ],
  },
  {
    title: "Rates & Configuration",
    icon: "⚙️",
    items: [
      { id: "som13", label: "Confirm K1 rates unchanged (or update if Frederick provides new rates)", detail: "SCRN=709, DOZ=270, BULLD=1129.41, FEL=270/800, EXC=542/253/800, GEN=18.457" },
      { id: "som14", label: "Confirm P1 rates for ADT001-005 (currently 40/450)" },
      { id: "som15", label: "Confirm Q1 rate for ADT006 (currently 142)" },
      { id: "som16", label: "Update K2 on Production Summary if diesel price changed" },
    ],
  },
  {
    title: "Services Sheet",
    icon: "🔧",
    items: [
      { id: "som17", label: "Services!E updated with new month opening hours for all machines" },
      { id: "som18", label: "Verify Services!F formula (=D-E) intact on rows 4-27" },
      { id: "som19", label: "Format Services!C:F as plain numbers (not dates)", detail: "Use batchUpdate numberFormat — prevents date display bug" },
    ],
  },
  {
    title: "Production Summary",
    icon: "📊",
    items: [
      { id: "som20", label: "Verify all formula references point to correct new-month machine tabs" },
      { id: "som21", label: "Verify F35 pull for diesel on all 24 rows" },
      { id: "som22", label: "Verify replacement cost column I pulls from correct cells" },
    ],
  },
  {
    title: "Bot & Infrastructure",
    icon: "🤖",
    items: [
      { id: "som23", label: "Update SHEET_ID in clearsun.env" },
      { id: "som24", label: "PM2 restart clearsun-wa" },
      { id: "som25", label: "Send test message to WA group, verify it writes to new sheet" },
      { id: "som26", label: "Verify RawData tab exists and bot can append" },
      { id: "som27", label: "Update alert-state.json with new ROM baseline (F32 value)" },
      { id: "som28", label: "Git commit + tag: prod-YYYY-MM-01-setup" },
    ],
  },
];

function ChecklistSection({ sections, color }: { sections: CheckSection[]; color: string }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  const total = sections.reduce((s, sec) => s + sec.items.length, 0);
  const done = Object.values(checked).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className={`text-sm font-medium px-3 py-1 rounded-full ${color}`}>
          {done}/{total} complete
        </div>
        <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${color.includes("emerald") ? "bg-emerald-500" : "bg-blue-500"}`}
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>
      {sections.map((section) => (
        <div key={section.title} className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-700 bg-slate-800/80">
            <h3 className="text-white font-semibold">{section.icon} {section.title}</h3>
          </div>
          <div className="divide-y divide-slate-700/30">
            {section.items.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-3 px-6 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={!!checked[item.id]}
                  onChange={() => toggle(item.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-700"
                />
                <div>
                  <span className={`text-sm ${checked[item.id] ? "text-slate-500 line-through" : "text-slate-200"}`}>
                    {item.label}
                  </span>
                  {item.detail && (
                    <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChecklistPage() {
  const [tab, setTab] = useState<"eom" | "som">("som");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">✅ Month-End / Month-Start Checklist</h1>
        <p className="text-slate-400 mt-1">Everything needed to close out one month and set up the next.</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setTab("eom")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "eom" ? "bg-amber-600/20 text-amber-400 border border-amber-600/40" : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          📤 End of Month
        </button>
        <button
          onClick={() => setTab("som")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "som" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/40" : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          📥 Start of Month
        </button>
      </div>
      {tab === "eom" ? (
        <ChecklistSection sections={endOfMonth} color="bg-amber-600/20 text-amber-400" />
      ) : (
        <ChecklistSection sections={startOfMonth} color="bg-emerald-600/20 text-emerald-400" />
      )}
    </div>
  );
}
