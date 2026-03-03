"use client";
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideSidebar = pathname === '/login';
  if (hideSidebar) return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 p-6 min-h-screen overflow-auto bg-slate-900">
        {children}
      </main>
    </div>
  );
}
