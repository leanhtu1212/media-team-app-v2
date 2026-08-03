import { useMemo } from 'react';
import { Camera, Video, Gauge, FolderKanban, ArrowRight, CalendarClock, ListTodo, CalendarDays, ClipboardList } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Card, Badge, STATUS_BADGE, STATUS_LABEL, ProgressBar, Avatar, EmptyState } from '../components/ui';
import { calculateMemberKpi } from '../lib/kpi';
import { currentMonth, formatDate, todayStr, isProjectFinished } from '../lib/utils';
import { useContentModals } from './DailyContent';
import type { Project } from '../types';
import type { User } from '../lib/firebase';

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: 'bg-pink-500/15 text-pink-300',
  TikTok: 'bg-slate-500/15 text-slate-200',
  Facebook: 'bg-blue-500/15 text-blue-300',
  YouTube: 'bg-red-500/15 text-red-300',
  'Đa kênh': 'bg-violet-500/15 text-violet-300',
};

export function MePage({ user, onOpenProject, onOpenContent }: { user: User; onOpenProject: (id: string) => void; onOpenContent: (id: string) => void }) {
  const { currentMember, projects, allTasks, dailyContent, reports } = useAppData();
  const { modals } = useContentModals(user);
  const today = todayStr();
  const month = currentMonth();

  // Matcher chuẩn của app: một id có thể là uid Firebase hoặc member doc id
  const isMine = useMemo(() => {
    const ids = new Set([currentMember?.uid, currentMember?.id].filter(Boolean) as string[]);
    return (id?: string) => !!id && ids.has(id);
  }, [currentMember]);

  // Admin cũng có chỉ tiêu riêng như editor → KPI cá nhân, không còn là tổng cả team.
  const kpi = useMemo(
    () => (currentMember ? calculateMemberKpi(currentMember, month, allTasks, projects, reports) : null),
    [currentMember, month, allTasks, projects, reports],
  );

  const progressOf = (p: Project) => {
    const pTasks = allTasks.filter((t) => t.projectId === p.id);
    const done = pTasks
      .filter((t) => (t.category === 'photo' || t.category === 'video') && (t.status === 'completed' || t.dntt))
      .reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const target = (p.photoTarget || 0) + (p.videoTarget || 0);
    return { done, target, pct: target > 0 ? (done / target) * 100 : 0 };
  };

  // Dự án của tôi = assigneeIds chứa tôi HOẶC có task của tôi trong tháng (từ kpi.projectIds)
  const myProjects = useMemo(() => {
    const kpiIds = new Set(kpi?.projectIds || []);
    return projects.filter((p) => (p.assigneeIds || []).some(isMine) || kpiIds.has(p.id));
  }, [projects, kpi, isMine]);

  const myActiveProjects = useMemo(
    () =>
      myProjects
        .filter((p) => !isProjectFinished(p.status))
        .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')),
    [myProjects],
  );

  // Công việc hôm nay
  const todayContent = useMemo(
    () =>
      dailyContent
        .filter((d) => isMine(d.assigneeId) && d.status !== 'done' && d.dueDate && d.dueDate <= today)
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')),
    [dailyContent, isMine, today],
  );

  const todayPreTasks = useMemo(
    () =>
      allTasks
        .filter(
          (t) =>
            isMine(t.createdBy) &&
            t.category === 'pre-production' &&
            t.status !== 'completed' &&
            !t.dntt &&
            t.deadline &&
            t.deadline <= today,
        )
        .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || '')),
    [allTasks, isMine, today],
  );

  const todayProjects = useMemo(
    () =>
      myActiveProjects.filter((p) => p.deadline && p.deadline <= today),
    [myActiveProjects, today],
  );

  const todayCount = todayContent.length + todayPreTasks.length + todayProjects.length;

  // Content chưa hoàn thành của tôi
  const upcomingContent = useMemo(
    () =>
      dailyContent
        .filter((d) => isMine(d.assigneeId) && d.status !== 'done')
        .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
        .slice(0, 6),
    [dailyContent, isMine],
  );

  const daysLabel = (deadline: string) => {
    const d = Math.round((new Date(deadline).getTime() - new Date(today).getTime()) / 86400000);
    if (deadline < today) return { text: `quá ${Math.abs(d)}d`, cls: 'text-red-400' };
    if (d === 0) return { text: 'hôm nay', cls: 'text-amber-300' };
    return { text: `còn ${d}d`, cls: d <= 3 ? 'text-amber-300' : 'text-dim' };
  };

  if (!currentMember) {
    return (
      <div className="fade-up">
        <EmptyState icon={<ClipboardList size={40} />} text="Không tìm thấy hồ sơ thành viên của bạn." />
      </div>
    );
  }

  return (
    <div className="fade-up space-y-6">
      {/* Header cá nhân */}
      <div className="flex items-center gap-3">
        <Avatar name={currentMember.username} url={currentMember.avatarUrl} size={48} />
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight truncate">{currentMember.username}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {currentMember.title && <span className="text-sm text-muted truncate">{currentMember.title}</span>}
            <Badge color="bg-accent/15 text-indigo-300">{currentMember.role}</Badge>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<FolderKanban size={16} />} tint="text-indigo-300" label="Dự án đang làm" value={myActiveProjects.length} />
        <StatCard icon={<Gauge size={16} />} tint="text-emerald-300" label="Sản lượng tháng" value={kpi?.outputCount ?? 0} sub={kpi?.hasTarget ? `/ ${kpi.kpiOutputTarget} chỉ tiêu` : 'chưa đặt chỉ tiêu'} />
        <StatCard icon={<Gauge size={16} />} tint={kpi?.hasTarget && kpi.finalKPI >= 100 ? 'text-emerald-300' : 'text-amber-300'} label="KPI tháng" value={kpi?.hasTarget ? `${kpi.finalKPI}%` : '—'} />
        <StatCard icon={<ListTodo size={16} />} tint="text-rose-300" label="Việc hôm nay" value={todayCount} danger={todayProjects.some((p) => p.deadline! < today) || todayPreTasks.some((t) => t.deadline! < today)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* KPI tháng này */}
        <Card className="lg:col-span-2 p-4">
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Gauge size={15} className="text-indigo-300" /> KPI tháng {Number(month.slice(5))}/{month.slice(0, 4)}</h2>
          {kpi && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <KpiStat icon={<Camera size={14} className="text-sky-300" />} label="Project ảnh" value={kpi.photoScore} />
                <KpiStat icon={<Video size={14} className="text-violet-300" />} label="Video" value={kpi.videoCount} />
                <KpiStat icon={<FolderKanban size={14} className="text-fuchsia-300" />} label="Outsource" value={kpi.outsourceScore} />
                <KpiStat icon={<ClipboardList size={14} className="text-amber-300" />} label="DNTT" value={kpi.dnttCount} />
              </div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted font-bold uppercase tracking-wide">Sản lượng / Chỉ tiêu</span>
                <span className="tabular-nums font-bold">{kpi.outputCount}{kpi.hasTarget ? `/${kpi.kpiOutputTarget}` : ' · chưa đặt chỉ tiêu'}</span>
              </div>
              <ProgressBar value={kpi.hasTarget ? kpi.finalKPI : 0} />
              <p className={`text-right text-lg font-extrabold tabular-nums mt-1.5 ${!kpi.hasTarget ? 'text-dim' : kpi.finalKPI >= 100 ? 'text-emerald-400' : kpi.finalKPI >= 60 ? 'text-indigo-300' : 'text-muted'}`}>{kpi.hasTarget ? `${kpi.finalKPI}%` : '—'}</p>
            </>
          )}
        </Card>

        {/* Công việc hôm nay */}
        <Card className="lg:col-span-3">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2"><CalendarClock size={15} className="text-rose-300" /> Công việc hôm nay</h2>
            <span className="text-xs text-muted">{todayCount} việc</span>
          </div>
          <div className="divide-y divide-line">
            {todayCount === 0 && <p className="text-sm text-dim py-8 text-center">Không có việc đến hạn hôm nay 🎉</p>}
            {todayProjects.map((p) => {
              const dl = daysLabel(p.deadline!);
              return (
                <button key={`p-${p.id}`} onDoubleClick={() => onOpenProject(p.id)} title="Nhấn đúp để mở dự án" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors text-left cursor-pointer select-none group">
                  <FolderKanban size={15} className="text-indigo-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-indigo-300 transition-colors">{p.title}</p>
                    <p className="text-[11px] text-dim">Dự án · <Badge color={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</Badge></p>
                  </div>
                  <span className={`text-[11px] font-bold shrink-0 ${dl.cls}`}>{dl.text}</span>
                </button>
              );
            })}
            {todayPreTasks.map((t) => {
              const dl = daysLabel(t.deadline!);
              return (
                <button key={`t-${t.id}`} onDoubleClick={() => onOpenProject(t.projectId)} title="Nhấn đúp để mở dự án" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors text-left cursor-pointer select-none group">
                  <ClipboardList size={15} className="text-amber-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-indigo-300 transition-colors">{t.title}</p>
                    <p className="text-[11px] text-dim">Task tiền kỳ</p>
                  </div>
                  <span className={`text-[11px] font-bold shrink-0 ${dl.cls}`}>{dl.text}</span>
                </button>
              );
            })}
            {todayContent.map((d) => {
              const dl = daysLabel(d.dueDate!);
              return (
                <button
                  key={`d-${d.id}`}
                  onDoubleClick={() => onOpenContent(d.id)}
                  title="Nhấn đúp để xem chi tiết"
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors text-left cursor-pointer select-none"
                >
                  <Badge color={PLATFORM_COLOR[d.platform] || PLATFORM_COLOR['Đa kênh']}>{d.platform}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-[11px] text-dim">Content · {d.type}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge color={STATUS_BADGE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                    <span className={`text-[11px] font-bold block mt-0.5 ${dl.cls}`}>{dl.text}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Dự án của tôi */}
        <Card>
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2"><FolderKanban size={15} className="text-indigo-300" /> Dự án của tôi</h2>
            <span className="text-xs text-muted">{myActiveProjects.length} đang làm</span>
          </div>
          <div className="divide-y divide-line">
            {myActiveProjects.length === 0 && <p className="text-sm text-dim py-8 text-center">Bạn chưa có dự án nào đang làm</p>}
            {myActiveProjects.map((p) => {
              const prog = progressOf(p);
              const dl = p.deadline ? daysLabel(p.deadline) : null;
              return (
                <button key={p.id} onDoubleClick={() => onOpenProject(p.id)} title="Nhấn đúp để mở dự án" className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors text-left cursor-pointer select-none group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate group-hover:text-indigo-300 transition-colors">{p.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge color={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      {p.deadline && <span className={`text-[11px] font-bold ${dl!.cls}`}>{formatDate(p.deadline)} · {dl!.text}</span>}
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

        {/* Content chưa hoàn thành của tôi */}
        <Card>
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2"><CalendarDays size={15} className="text-pink-300" /> Content chưa hoàn thành của tôi</h2>
          </div>
          <div className="divide-y divide-line">
            {upcomingContent.length === 0 && <p className="text-sm text-dim py-8 text-center">Không có nội dung nào đang chờ</p>}
            {upcomingContent.map((d) => {
              const overdue = !!d.dueDate && d.dueDate < today && d.status !== 'done';
              return (
                <button
                  key={d.id}
                  onDoubleClick={() => onOpenContent(d.id)}
                  title="Nhấn đúp để xem chi tiết"
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors text-left cursor-pointer select-none"
                >
                  <Badge color={PLATFORM_COLOR[d.platform] || PLATFORM_COLOR['Đa kênh']}>{d.platform}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-[11px] text-dim truncate">{d.type}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[11px] tabular-nums block ${overdue ? 'text-red-400 font-bold' : 'text-dim'}`}>{formatDate(d.dueDate)}</span>
                    <Badge color={STATUS_BADGE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {modals}
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

function KpiStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-bg border border-line rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted uppercase tracking-wide mb-1">{icon}{label}</div>
      <p className="text-lg font-extrabold tabular-nums leading-none">{value}</p>
    </div>
  );
}
