import { useMemo, useState } from 'react';
import { Camera, Video, Wallet, Trophy, ArrowRight, Crown, FolderKanban, CheckCircle2, Circle, AlertTriangle, CalendarClock, FileText, CalendarDays } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Card, Badge, STATUS_BADGE, STATUS_LABEL, ProgressBar, Avatar, Input } from '../components/ui';
import { calculateTeamKpi, ecomProjectIdSet } from '../lib/kpi';
import { toggleDntt } from '../lib/actions';
import { useToast } from '../hooks/useToast';
import { currentMonth, monthRange, shiftMonth, formatVND, formatDate, todayStr, isProjectFinished } from '../lib/utils';
import type { Project } from '../types';
import type { User } from '../lib/firebase';

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: 'bg-pink-500/15 text-pink-300',
  TikTok: 'bg-slate-500/15 text-slate-200',
  Facebook: 'bg-blue-500/15 text-blue-300',
  YouTube: 'bg-red-500/15 text-red-300',
  'Đa kênh': 'bg-violet-500/15 text-violet-300',
};

export function DashboardPage({ user, onOpenProject }: { user: User; onOpenProject: (id: string) => void }) {
  const { members, projects, allTasks, reports, dailyContent, tags, isAdmin } = useAppData();
  const ecomIds = useMemo(() => ecomProjectIdSet(projects, tags), [projects, tags]);
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const today = todayStr();

  // DNTT chưa thanh toán = khoản tiền kỳ có chi phí nhưng CHƯA tick (dntt) — toàn bộ dự án, mọi thời điểm.
  // Tick ở "Tiền kỳ & Chi phí" = đã thanh toán.
  const unpaidTasks = useMemo(() => {
    const liveIds = new Set(projects.map((p) => p.id));
    return allTasks
      // Bỏ task mồ côi (project đã xoá) — không còn là công nợ thật
      .filter((t) => t.category === 'pre-production' && (Number(t.amount) || 0) > 0 && !t.dntt && liveIds.has(t.projectId))
      .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  }, [allTasks, projects]);
  const unpaidTotal = unpaidTasks.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const kpi = useMemo(() => calculateTeamKpi(members, month, allTasks, projects, reports, ecomIds), [members, month, allTasks, projects, reports, ecomIds]);

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
  const overdueProjects = projects.filter((p) => !isProjectFinished(p.status) && p.deadline && p.deadline < today);
  const ALL_STATUSES = ['plan', 'pre-production', 'post-production', 'done', 'payment'];
  const statusCounts = {
    plan: monthProjects.filter((p) => p.status === 'plan' || !ALL_STATUSES.includes(p.status)).length,
    'pre-production': monthProjects.filter((p) => p.status === 'pre-production').length,
    'post-production': monthProjects.filter((p) => p.status === 'post-production').length,
    done: monthProjects.filter((p) => p.status === 'done').length,
    payment: monthProjects.filter((p) => p.status === 'payment').length,
  };

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

      {/* DNTT chưa thanh toán — danh sách gọn, đặt cuối trang (admin) */}
      {isAdmin && (
        <Card>
          <div className="px-3 py-2 border-b border-line flex items-center justify-between">
            <h2 className="font-bold text-[13px] flex items-center gap-1.5"><Wallet size={13} className="text-rose-300" /> DNTT chưa thanh toán</h2>
            <span className="text-[11px] font-bold text-rose-300 tabular-nums">{formatVND(unpaidTotal)} · {unpaidTasks.length} khoản</span>
          </div>
          <div className="p-2">
            {unpaidTasks.length === 0 ? (
              <p className="text-xs text-dim text-center py-4">Không có khoản nào chưa thanh toán 🎉</p>
            ) : (
              <div className="space-y-1">
                {unpaidTasks.map((t) => {
                  const p = projects.find((x) => x.id === t.projectId);
                  if (!p) return null;
                  const overdue = t.deadline && t.deadline < today;
                  return (
                    <div
                      key={t.id}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-bg border border-line rounded-lg hover:border-line-2 transition-all group"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDntt(t).then(() => toast('Đã đánh dấu thanh toán')).catch((e) => toast(`Lỗi: ${e.message}`, 'error'))}
                        title="Đánh dấu đã thanh toán"
                        className="shrink-0 text-dim hover:text-emerald-400 cursor-pointer"
                      >
                        <Circle size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenProject(p.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate group-hover:text-indigo-300 transition-colors">{t.title}</p>
                          <p className="text-[10px] text-dim truncate">{p.title}{t.deadline ? ` · hạn ${formatDate(t.deadline)}` : ''}</p>
                        </div>
                        {overdue && <span className="text-[9px] font-bold text-red-400 uppercase shrink-0">Quá hạn</span>}
                        <span className="text-[13px] font-bold text-amber-300 tabular-nums shrink-0">{formatVND(Number(t.amount) || 0)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function EcomInline({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={tint}>{icon}</span>
      <span className="text-[11px] font-bold text-muted uppercase tracking-wide">{label}</span>
      <span className="text-lg font-extrabold tabular-nums leading-none">{value}</span>
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
