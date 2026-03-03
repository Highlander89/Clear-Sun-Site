"use client";
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface FuelData {
  openingStock: number | null; litresRefuelled: number | null; litresUsed: number | null;
  stockOnHand: number | null; pricePerLitre: number | null;
  dipHistory: { date: string; litres: number | null }[];
  dailyBurn: number | null; daysRemaining: number | null;
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold ${color || 'text-slate-100'}`}>{value}</div>
      {unit && <div className="text-xs text-slate-400 mt-1">{unit}</div>}
    </div>
  );
}

export default function FuelPage() {
  const [data, setData] = useState<FuelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/fuel').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString('en-ZA') : '—';
  const stockColor = data?.stockOnHand != null
    ? data.stockOnHand < 20000 ? 'text-red-400' : data.stockOnHand < 50000 ? 'text-amber-400' : 'text-emerald-400'
    : 'text-slate-100';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">Fuel Management</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? [...Array(3)].map((_, i) => <div key={i} className="h-28 bg-slate-800 rounded-xl animate-pulse border border-slate-700"></div>) : (
          <>
            <StatCard label="Current Stock" value={fmt(data?.stockOnHand)} unit="Litres on hand" color={stockColor} />
            <StatCard label="Daily Burn Rate" value={fmt(data?.dailyBurn ? Math.round(data.dailyBurn) : null)} unit="Litres per day (avg)" />
            <StatCard label="Days Remaining" value={data?.daysRemaining ? String(data.daysRemaining) : '—'} unit="At current burn rate" color={data?.daysRemaining && data.daysRemaining < 7 ? 'text-red-400' : 'text-emerald-400'} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {!loading && (
          <>
            <StatCard label="Opening Stock" value={fmt(data?.openingStock)} unit="Start of month" />
            <StatCard label="Refuelled" value={fmt(data?.litresRefuelled)} unit="Added this month" color="text-emerald-400" />
            <StatCard label="Price per Litre" value={data?.pricePerLitre ? `R${data.pricePerLitre.toFixed(3)}` : '—'} unit="K2 current rate" />
          </>
        )}
      </div>

      {data?.dipHistory && data.dipHistory.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Dip History</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.dipHistory.map(d => ({ ...d, litres: d.litres ?? 0 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#34d399' }} />
              <Line type="monotone" dataKey="litres" stroke="#34d399" strokeWidth={2} dot={{ fill: '#34d399', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
