import { LayoutDashboard, FolderKanban, CalendarDays, FileText, TrendingUp, Settings, LogOut, Clapperboard, CircleUser, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { auth, signOut } from '../../lib/firebase';
import { Avatar } from '../ui';
import { useAppData } from '../../store/AppDataContext';

export type View = 'dashboard' | 'me' | 'projects' | 'daily' | 'reports' | 'performance' | 'settings';

const NAV: { view: View; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { view: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { view: 'me', label: 'Của tôi', icon: CircleUser },
  { view: 'projects', label: 'Dự án', icon: FolderKanban },
  { view: 'daily', label: 'Lịch tháng', icon: CalendarDays },
  { view: 'reports', label: 'Báo cáo', icon: FileText },
  { view: 'performance', label: 'Hiệu suất', icon: TrendingUp, adminOnly: true },
  { view: 'settings', label: 'Cài đặt', icon: Settings },
];

/** 4 mục hay dùng nhất nằm thẳng trên thanh tab điện thoại; phần còn lại vào nút "Thêm".
 *  Giữ đúng 4+1 để mỗi ô đủ rộng cho ngón tay (~64px trên màn 320px). */
const MOBILE_PRIMARY: View[] = ['dashboard', 'me', 'projects', 'daily'];

/* ---------- Điện thoại: thanh tab dính đáy màn hình ---------- */
function BottomNav({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { currentMember, isAdmin } = useAppData();
  const [sheetOpen, setSheetOpen] = useState(false);
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin);
  const primary = nav.filter((n) => MOBILE_PRIMARY.includes(n.view));
  const rest = nav.filter((n) => !MOBILE_PRIMARY.includes(n.view));
  const restActive = rest.some((n) => n.view === view);

  const go = (v: View) => { setSheetOpen(false); onNavigate(v); };

  return (
    <>
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-end" onClick={() => setSheetOpen(false)}>
          <div
            className="fade-up w-full bg-surface border-t border-line rounded-t-2xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-2 py-3 mb-1 border-b border-line">
              <Avatar name={currentMember?.username} url={currentMember?.avatarUrl} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{currentMember?.username || '...'}</p>
                <p className="text-[11px] text-muted uppercase font-bold">{currentMember?.role || ''}</p>
              </div>
            </div>
            {rest.map((n) => (
              <button
                key={n.view}
                onClick={() => go(n.view)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold cursor-pointer ${
                  view === n.view ? 'bg-accent/15 text-indigo-300' : 'text-ink active:bg-surface-2'
                }`}
              >
                <n.icon size={19} className="shrink-0" /> {n.label}
              </button>
            ))}
            <button
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-red-400 active:bg-surface-2 cursor-pointer"
            >
              <LogOut size={19} className="shrink-0" /> Đăng xuất
            </button>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-[120] bg-surface/95 backdrop-blur border-t border-line flex pb-[env(safe-area-inset-bottom)]">
        {primary.map((n) => {
          const active = view === n.view;
          return (
            <button
              key={n.view}
              onClick={() => onNavigate(n.view)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 cursor-pointer transition-colors ${active ? 'text-indigo-300' : 'text-muted'}`}
            >
              <n.icon size={21} className="shrink-0" />
              <span className="text-[10px] font-bold leading-none">{n.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setSheetOpen(true)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 cursor-pointer transition-colors ${restActive ? 'text-indigo-300' : 'text-muted'}`}
        >
          <MoreHorizontal size={21} className="shrink-0" />
          <span className="text-[10px] font-bold leading-none">Thêm</span>
        </button>
      </nav>
    </>
  );
}

export function Sidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { currentMember, isAdmin } = useAppData();

  return (
    <>
      <BottomNav view={view} onNavigate={onNavigate} />

      {/* Máy tính / tablet: thanh dọc như cũ */}
      <aside className="hidden md:flex w-16 lg:w-56 shrink-0 h-screen sticky top-0 flex-col border-r border-line bg-surface">
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
    </>
  );
}
