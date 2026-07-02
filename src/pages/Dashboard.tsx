import { useMemo, useState } from 'react';
import { Camera, Video, Wallet, Trophy, ArrowRight, Crown, FolderKanban, CheckCircle2, AlertTriangle, CalendarClock, FileText, CalendarDays } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Card, Badge, STATUS_BADGE, STATUS_LABEL, ProgressBar, Avatar, Input } from '../components/ui';
import { calculateTeamKpi } from '../lib/kpi';
import { currentMonth, monthRange, formatVND, formatDate, todayStr, isProjectFinished } from '../lib/utils';
import type { Project } from '../types';

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: 'bg-pink-500/15 text-pink-300',
  TikTok: 'bg-slate-500/15 text-slate-200',
  Facebook: 'bg-blue-500/15 text-blue-300',
  YouTube: 'bg-red-500/15 text-red-300',
  'Đa kênh': 'bg-violet-500/15 text-violet-300',
};

export function DashboardPage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { members, projects, allTasks, reports, dailyContent, isAdmin } = useAppData();
  const [month, setMonth] = useState(currentMonth());
  const [monthStart, monthEnd] = monthRange(month);
  const today = todayStr();

  const inMonth = (d?: string) => (d || '') >= monthStart && (d || '') <= monthEnd;

  const monthTasks = useMemo(() => allTasks.filter((t) => inMonth(t.reportDate)), [allTasks, monthStart, monthEnd]);

  const photoCount = monthTasks.filter((t) => t.category === 'photo' && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const videoCount = monthTasks.filter((t) => t.category === 'video' && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const monthCost = monthTasks.filter((t) => t.category === 'pre-production').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const kpi = useMemo(() => calculateTeamKpi(members, month, allTasks, projects, reports), [members, month, allTasks, projects, reports]);
  const totalOutput = kpi.reduce((s, m) => s + m.outputCount, 0);

  // A project "belongs" to a month by its deadline, falling back to createdAt.
  const projectMonth = (p: Project): string => {
    if (p.deadline) return p.deadline.slice(0, 7);
    const c = p.createdAt as { seconds?: number } | string | undefined;
    if (typeof c === 'string') return c.slice(0, 7);
    if (c && typeof c.seconds === 'number') return new Date(c.seconds * 1000).toISOString().slice(0, 7);
    return '';
  };
  const monthProjects = useMemo(() => projects.filter((p) => projectMonth(p) === month), [projects, month]);

  // Project stats
  const activeCount = projects.filter((p) => !isProjectFinished(p.status)).length;
  const doneCount = projects.filter((p) => isProjectFinished(p.status)).length;
  const overdueProjects = projects.filter((p) => !isProjectFinished(p.status) && p.deadline && p.deadline < today);
  const ALL_STATUSES = ['plan', 'pre-production', 'post-production', 'done', 'payment'];
  const statusCounts = {
    plan: monthProjects.filter((p) => p.status === 'plan' || !ALL_STATUSES.includes(p.status)).length,
    'pre-production': monthProjects.filter((p) => p.status === 'pre-production').length,
    'post-production': monthProjects.filter((p) => p.status === 'post-production').length,
    done: monthProjects.filter((p) => p.status === 'done').length,
    payment: monthProjects.filter((p) => p.status === 'payment').length,
  };

  const monthReports = reports.filter((r) => inMonth(r.reportDate));
  const monthDaily = dailyContent.filter((d) => inMonth(d.dueDate));

  // Deadline watchlist: active projects with a deadline, soonest first
  const watchlist = projects
    .filter((p) => !isProjectFinished(p.status) && p.deadline)
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
    .slice(0, 6);

  // Recent reports feed
  const recentReports = [...reports].sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || '')).slice(0, 6);
  const memberOf = (id?: string, email?: string) => members.find((m) => m.uid === id || m.id === id || m.email?.toLowerCase() === email?.toLowerCase());

  // Upcoming daily content (not published), soonest due first
  const upcomingDaily = dailyContent
    .filter((d) => d.status !== 'published')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .slice(0, 5);

  const progressOf = (p: Project) => {
    const pTasks = allTasks.filter((t) => t.projectId === p.id);
    const done = pTasks.filter((t) => (t.category === 'photo' || t.category === 'video') && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const target = (p.photoTarget || 0) + (p.videoTarget || 0);
    return { done, target, pct: target > 0 ? (done / target) * 100 : 0 };
  };

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted">Hoạt động của team trong {month === currentMonth() ? 'tháng này' : `tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`}</p>
        </div>
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="!w-auto" />
      </div>

      {/* Row 1 — production stats */}
      <div className={`grid grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
        <StatCard icon={<Camera size={16} />} tint="text-indigo-300" label="Ảnh hoàn thành" value={photoCount} sub={`${monthTasks.filter((t) => t.category === 'photo').length} task`} />
        <StatCard icon={<Video size={16} />} tint="text-violet-300" label="Video hoàn thành" value={videoCount} sub={`${monthTasks.filter((t) => t.category === 'video').length} task`} />
        <StatCard icon={<Trophy size={16} />} tint="text-emerald-400" label="Tổng sản lượng" value={totalOutput} sub="SP toàn team" />
        {isAdmin && <StatCard icon={<Wallet size={16} />} tint="text-amber-300" label="Chi phí tháng" value={formatVND(monthCost)} sub={`${monthTasks.filter((t) => t.category === 'pre-production').length} khoản`} />}
      </div>

      {/* Row 2 — project & activity overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<FolderKanban size={16} />} tint="text-blue-300" label="Dự án đang chạy" value={activeCount} sub={`${projects.length} tổng cộng`} />
        <StatCard icon={<AlertTriangle size={16} />} tint="text-red-400" label="Dự án quá hạn" value={overdueProjects.length} sub={overdueProjects.length > 0 ? 'cần xử lý' : 'không có'} danger={overdueProjects.length > 0} />
        <StatCard icon={<FileText size={16} />} tint="text-emerald-300" label="Báo cáo tháng" value={monthReports.length} sub={`${monthReports.filter((r) => r.reportType !== 'auto' && !r.content?.startsWith('Báo cáo tự động:')).length} thủ công`} />
        <StatCard icon={<CalendarDays size={16} />} tint="text-pink-300" label="Daily content" value={monthDaily.length} sub={`${monthDaily.filter((d) => d.status === 'published').length} đã đăng`} />
      </div>

      {/* Project status distribution */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">Phân bố trạng thái dự án</h2>
          <span className="text-xs text-muted">{monthProjects.length} dự án trong tháng</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-line mb-3">
          {(['plan', 'pre-production', 'post-production', 'done', 'payment'] as const).map((s) => {
            const count = statusCounts[s];
            const pct = monthProjects.length > 0 ? (count / monthProjects.length) * 100 : 0;
            const bar: Record<string, string> = { plan: 'bg-slate-400', 'pre-production': 'bg-amber-400', 'post-production': 'bg-indigo-400', done: 'bg-emerald-400', payment: 'bg-cyan-400' };
            return pct > 0 ? <div key={s} className={bar[s]} style={{ width: `${pct}%` }} title={`${STATUS_LABEL[s]}: ${count}`} /> : null;
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(['plan', 'pre-production', 'post-production', 'done', 'payment'] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <Badge color={STATUS_BADGE[s]}>{STATUS_LABEL[s]}</Badge>
              <span className="text-sm font-bold tabular-nums">{statusCounts[s]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Row 3 — deadline watchlist + KPI ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2"><CalendarClock size={15} className="text-amber-300" /> Deadline sắp tới</h2>
            {overdueProjects.length > 0 && <span className="text-xs text-red-400 font-bold">{overdueProjects.length} quá hạn</span>}
          </div>
          <div className="divide-y divide-line">
            {watchlist.length === 0 && <p className="text-sm text-dim py-8 text-center">Không có dự án nào có deadline</p>}
            {watchlist.map((p) => {
              const prog = progressOf(p);
              const overdue = p.deadline! < today;
              const daysLeft = Math.round((new Date(p.deadline!).getTime() - new Date(today).getTime()) / 86400000);
              return (
                <button key={p.id} onClick={() => onOpenProject(p.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors text-left cursor-pointer group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate group-hover:text-indigo-300 transition-colors">{p.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge color={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      <span className={`text-[11px] font-bold ${overdue ? 'text-red-400' : daysLeft <= 3 ? 'text-amber-300' : 'text-dim'}`}>
                        {formatDate(p.deadline)}{overdue ? ` · quá ${Math.abs(daysLeft)}d` : daysLeft === 0 ? ' · hôm nay' : ` · còn ${daysLeft}d`}
                      </span>
                    </div>
                  </div>
                  <div className="w-24 shrink-0">
                    <p className="text-[11px] text-muted text-right mb-1 tabular-nums">{prog.done}/{prog.target || '—'}</p>
                    <ProgressBar value={prog.pct} />
                  </div>
                  <ArrowRight size={14} className="text-dim group-hover:text-indigo-300 transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2"><Trophy size={15} className="text-amber-300" /> Xếp hạng KPI</h2>
            <span className="text-xs text-muted">{kpi.length} thành viên</span>
          </div>
          <div className="divide-y divide-line">
            {kpi.length === 0 && <p className="text-sm text-dim py-8 text-center">Chưa có dữ liệu</p>}
            {kpi.map((m, i) => (
              <div key={m.uid} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-center text-xs font-extrabold text-dim tabular-nums">{i + 1}</span>
                <div className="relative">
                  <Avatar name={m.username} url={m.avatarUrl} size={32} />
                  {i === 0 && m.finalKPI > 0 && <Crown size={13} className="absolute -top-1.5 -right-1 text-amber-400 rotate-12" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{m.username}</p>
                  <p className="text-[11px] text-muted tabular-nums">{m.outputCount}/{m.kpiOutputTarget} SP · {m.photoCount}A {m.videoCount}V</p>
                </div>
                <span className={`text-sm font-extrabold tabular-nums ${m.finalKPI >= 100 ? 'text-emerald-400' : m.finalKPI >= 60 ? 'text-indigo-300' : 'text-muted'}`}>
                  {m.finalKPI}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 4 — recent reports + upcoming daily content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2"><FileText size={15} className="text-emerald-300" /> Báo cáo gần đây</h2>
          </div>
          <div className="divide-y divide-line">
            {recentReports.length === 0 && <p className="text-sm text-dim py-8 text-center">Chưa có báo cáo</p>}
            {recentReports.map((r) => {
              const creator = memberOf(r.createdBy, r.userEmail);
              const proj = projects.find((p) => p.id === r.projectId);
              const isAuto = r.reportType === 'auto' || r.content?.startsWith('Báo cáo tự động:');
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={creator?.username} url={creator?.avatarUrl} size={26} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{(r.content || '').replace('Báo cáo tự động: ', '')}</p>
                    <p className="text-[11px] text-dim truncate">{creator?.username || r.userEmail} · {proj?.title || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[11px] text-dim tabular-nums block">{formatDate(r.reportDate)}</span>
                    <span className={`text-[10px] font-bold ${isAuto ? 'text-indigo-300' : 'text-emerald-400'}`}>{isAuto ? 'Tự động' : 'Thủ công'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2"><CalendarDays size={15} className="text-pink-300" /> Content sắp đăng</h2>
          </div>
          <div className="divide-y divide-line">
            {upcomingDaily.length === 0 && <p className="text-sm text-dim py-8 text-center">Không có nội dung sắp đăng</p>}
            {upcomingDaily.map((d) => {
              const assignee = memberOf(d.assigneeId);
              const overdue = (d.dueDate || '') < today && d.status !== 'done';
              return (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Badge color={PLATFORM_COLOR[d.platform] || PLATFORM_COLOR['Đa kênh']}>{d.platform}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-[11px] text-dim truncate">{d.type}{assignee ? ` · ${assignee.username}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[11px] tabular-nums block ${overdue ? 'text-red-400 font-bold' : 'text-dim'}`}>{formatDate(d.dueDate)}</span>
                    <Badge color={STATUS_BADGE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, tint, label, value, sub, danger }: { icon: React.ReactNode; tint: string; label: string; value: React.ReactNode; sub?: string; danger?: boolean }) {
  return (
    <Card className={`p-4 ${danger ? 'border-red-500/30' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-muted uppercase tracking-wide">{label}</span>
        <span className={tint}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[11px] text-dim mt-1.5">{sub}</p>}
    </Card>
  );
}
