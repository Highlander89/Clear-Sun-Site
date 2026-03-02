"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/', label: 'Fleet Status', icon: '🚛' },
  { href: '/services', label: 'Service Tracker', icon: '🔧' },
  { href: '/fuel', label: 'Fuel Management', icon: '⛽' },
  { href: '/production', label: 'Production', icon: '📊' },
  { href: '/messages', label: 'Message Log', icon: '💬' },
  { href: '/alerts', label: 'Alerts', icon: '🔔' },
  { href: '/logic', label: 'Sheet Logic', icon: '📐' },
  { href: '/checklist', label: 'Month Checklist', icon: '✅' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-slate-950 border-r border-slate-800 flex flex-col z-50">
      <div className="p-6 border-b border-slate-800">
        <div className="text-emerald-400 font-bold text-lg">☀️ Clearsun</div>
        <div className="text-slate-500 text-xs mt-1">Operations Dashboard</div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-emerald-600/20 text-emerald-400 font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-600">
        v1.0 · {new Date().getFullYear()}
      </div>
    </aside>
  );
}
