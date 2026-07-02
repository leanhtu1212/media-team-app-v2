import { LayoutDashboard, FolderKanban, CalendarDays, FileText, TrendingUp, Settings, LogOut, Clapperboard } from 'lucide-react';
import { auth, signOut } from '../../lib/firebase';
import { Avatar } from '../ui';
import { useAppData } from '../../store/AppDataContext';

export type View = 'dashboard' | 'projects' | 'daily' | 'reports' | 'performance' | 'settings';

const NAV: { view: View; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { view: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { view: 'projects', label: 'Dự án', icon: FolderKanban },
  { view: 'daily', label: 'Daily Content', icon: CalendarDays },
  { view: 'reports', label: 'Báo cáo', icon: FileText },
  { view: 'performance', label: 'Hiệu suất', icon: TrendingUp, adminOnly: true },
  { view: 'settings', label: 'Cài đặt', icon: Settings },
];

export function Sidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { currentMember, isAdmin } = useAppData();

  return (
    <aside className="w-16 lg:w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-3 lg:px-5 h-16 border-b border-line">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center shrink-0">
          <Clapperboard size={17} className="text-white" />
        </div>
        <span className="hidden lg:block font-extrabold tracking-tight">Media Team</span>
      </div>

      <nav className="flex-1 py-4 px-2 lg:px-3 space-y-1">
        {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
          const active = view === n.view;
          return (
            <button
              key={n.view}
              onClick={() => onNavigate(n.view)}
              className={`w-full flex items-center gap-3 px-2.5 lg:px-3 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                active ? 'bg-accent/15 text-indigo-300' : 'text-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              <n.icon size={18} className="shrink-0" />
              <span className="hidden lg:block">{n.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line flex items-center gap-2.5">
        <Avatar name={currentMember?.username} url={currentMember?.avatarUrl} size={34} />
        <div className="hidden lg:block flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{currentMember?.username || '...'}</p>
          <p className="text-[11px] text-muted uppercase font-bold">{currentMember?.role || ''}</p>
        </div>
        <button
          onClick={() => signOut(auth)}
          title="Đăng xuất"
          className="hidden lg:flex text-muted hover:text-red-400 transition-colors cursor-pointer"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
