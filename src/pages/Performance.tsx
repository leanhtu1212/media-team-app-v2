import { useMemo, useState } from 'react';
import { Crown, X, Camera, Video, Wallet, FolderKanban, TrendingUp, ArrowUp, ArrowDown, Minus, ShoppingBag, CalendarDays, AlertTriangle } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Card, Badge, STATUS_BADGE, STATUS_LABEL, Avatar, Input, EmptyState } from '../components/ui';
import { calculateTeamKpi, calculateMemberKpi, ecomProjectIdSet, type MemberKpi } from '../lib/kpi';
import { currentMonth, monthRange, shiftMonth, formatVND, formatDate, todayStr, isProjectFinished, tsToDateStr } from '../lib/utils';
import type { Task, Project } from '../types';

export function PerformancePage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { members, projects, allTasks, reports, dailyContent, tags, isAdmin } = useAppData();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<MemberKpi | null>(null);

  const ecomIds = useMemo(() => ecomProjectIdSet(projects, tags), [projects, tags]);
  const kpi = useMemo(
    () => calculateTeamKpi(members, month, allTasks, projects, reports, ecomIds),
    [members, month, allTasks, projects, reports, ecomIds],
  );

  if (!isAdmin) {
    return <EmptyState icon={<TrendingUp size={32} />} text="Chỉ admin mới xem được trang này" />;
  }

  const [monthStart, monthEnd] = monthRange(month);
  const monthTasks = allTasks.filter((t) => (t.reportDate || '') >= monthStart && (t.reportDate || '') <= monthEnd);

  // ── 6-month trend series (ending at selected month) ──
  const trend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
    return months.map((mo) => {
      const [ms, me] = monthRange(mo);
      const mt = allTasks.filter((t) => (t.reportDate || '') >= ms && (t.reportDate || '') <= me);
      const isOut = (pid?: string) => (projects.find((p) => p.id === pid)?.projectType || 'inhouse') === 'outsource';
      // Ảnh = số project INHOUSE đạt đủ target ảnh (Ecom tách riêng)
      const monthPhotoProjectIds = Array.from(new Set(mt.filter((t) => t.category === 'photo' && !isOut(t.projectId) && !ecomIds.has(t.projectId)).map((t) => t.projectId).filter(Boolean))) as string[];
      const photo = monthPhotoProjectIds.reduce((count, pid) => {
        const proj = projects.find((p) => p.id === pid);
        if (!proj) return count;
        const photoDone = allTasks.filter((t) => t.projectId === pid && t.category === 'photo' && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
        const target = proj.photoTarget || 0;
        return (target > 0 ? photoDone >= target : photoDone > 0) ? count + 1 : count;
      }, 0);
      // Video = số lượng video INHOUSE (Ecom tách riêng)
      const video = mt.filter((t) => t.category === 'video' && !isOut(t.projectId) && !ecomIds.has(t.projectId) && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
      // Bỏ chi phí mồ côi (project đã xoá) + chi phí Ecom (tách riêng) khỏi tổng
      const cost = mt.filter((t) => t.category === 'pre-production' && !ecomIds.has(t.projectId) && projects.some((p) => p.id === t.projectId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const teamKpi = calculateTeamKpi(members, mo, allTasks, projects, reports, ecomIds);
      const output = teamKpi.reduce((s, k) => s + k.outputCount, 0);
      const avgKpi = teamKpi.length > 0 ? teamKpi.reduce((s, k) => s + k.finalKPI, 0) / teamKpi.length : 0;
      const created = projects.filter((p) => (tsToDateStr(p.createdAt) || '').slice(0, 7) === mo).length;
      const finished = projects.filter((p) => isProjectFinished(p.status) && (p.deadline ? p.deadline.slice(0, 7) : (tsToDateStr(p.createdAt) || '').slice(0, 7)) === mo).length;
      return { month: mo, label: `T${Number(mo.slice(5))}`, photo, video, cost, output, avgKpi: Math.round(avgKpi * 10) / 10, created, finished, tasks: mt.length };
    });
  }, [month, allTasks, members, projects, reports, ecomIds]);

  const thisIdx = trend.length - 1;
  const cur = trend[thisIdx];
  const prev = trend[thisIdx - 1];

  // Cost analysis: pre-production tasks in month grouped by project (bỏ mồ côi + Ecom tách riêng)
  const costTasks = monthTasks.filter((t) => t.category === 'pre-production' && !ecomIds.has(t.projectId) && projects.some((p) => p.id === t.projectId));
  const costByProject = new Map<string, Task[]>();
  costTasks.forEach((t) => {
    const list = costByProject.get(t.projectId) || [];
    list.push(t);
    costByProject.set(t.projectId, list);
  });
  const totalMonthCost = costTasks.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // ── Thống kê Ecom (tách riêng khỏi KPI): tổng team trong tháng ──
  const ecomTasks = monthTasks.filter((t) => ecomIds.has(t.projectId));
  const ecomPhotos = ecomTasks.filter((t) => t.category === 'photo').reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const ecomVideos = ecomTasks.filter((t) => t.category === 'video').reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const ecomCost = ecomTasks.filter((t) => t.category === 'pre-production').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const ecomProjectCount = new Set(ecomTasks.map((t) => t.projectId)).size;

  // ── Hoạt động tháng (chuyển từ Tổng quan) — production loại Ecom ──
  const photoQty = monthTasks.filter((t) => t.category === 'photo' && !ecomIds.has(t.projectId) && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const videoQty = monthTasks.filter((t) => t.category === 'video' && !ecomIds.has(t.projectId) && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const today = todayStr();
  const activeCount = projects.filter((p) => !isProjectFinished(p.status)).length;
  const overdueCount = projects.filter((p) => !isProjectFinished(p.status) && p.deadline && p.deadline < today).length;
  const monthDaily = dailyContent.filter((d) => (d.dueDate || '') >= monthStart && (d.dueDate || '') <= monthEnd);
  const liveIds = new Set(projects.map((p) => p.id));
  const unpaidTasks = allTasks.filter((t) => t.category === 'pre-production' && (Number(t.amount) || 0) > 0 && !t.dntt && !ecomIds.has(t.projectId) && liveIds.has(t.projectId));
  const unpaidTotal = unpaidTasks.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Hiệu suất</h1>
          <p className="text-sm text-muted">KPI = Sản lượng (project ảnh + video + project outsource) / chỉ tiêu</p>
        </div>
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="!w-auto" />
      </div>

      {/* Delta vs previous month */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DeltaCard label="Tổng sản lượng" icon={<TrendingUp size={15} />} tint="text-emerald-400" cur={cur.output} prev={prev.output} />
        <DeltaCard label="Ảnh" icon={<Camera size={15} />} tint="text-indigo-300" cur={cur.photo} prev={prev.photo} />
        <DeltaCard label="Video" icon={<Video size={15} />} tint="text-violet-300" cur={cur.video} prev={prev.video} />
        <DeltaCard label="KPI trung bình" icon={<Crown size={15} />} tint="text-amber-300" cur={cur.avgKpi} prev={prev.avgKpi} suffix="%" />
      </div>

      {/* Hoạt động tháng (chuyển từ Tổng quan) */}
      <Card className="p-5">
        <SectionTitle icon={<TrendingUp size={16} />} tint="text-emerald-300" title="Hoạt động tháng" note={`tháng ${Number(month.slice(5))}`} />
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <StatTile icon={<Camera size={15} />} tint="text-indigo-300" label="Ảnh hoàn thành" value={photoQty} sub={`${monthTasks.filter((t) => t.category === 'photo' && !ecomIds.has(t.projectId)).length} task`} />
          <StatTile icon={<Video size={15} />} tint="text-violet-300" label="Video hoàn thành" value={videoQty} sub={`${monthTasks.filter((t) => t.category === 'video' && !ecomIds.has(t.projectId)).length} task`} />
          <StatTile icon={<Wallet size={15} />} tint="text-amber-300" label="Chi phí tháng" value={formatVND(totalMonthCost)} />
          <StatTile icon={<FolderKanban size={15} />} tint="text-blue-300" label="Dự án đang chạy" value={activeCount} sub={`${projects.length} tổng`} />
          <StatTile icon={<AlertTriangle size={15} />} tint="text-red-400" label="Quá hạn" value={overdueCount} danger={overdueCount > 0} />
          <StatTile icon={<Wallet size={15} />} tint="text-rose-300" label="DNTT chưa TT" value={formatVND(unpaidTotal)} sub={`${unpaidTasks.length} khoản`} danger={unpaidTotal > 0} />
          <StatTile icon={<CalendarDays size={15} />} tint="text-pink-300" label="Daily content" value={monthDaily.length} sub={`${monthDaily.filter((d) => d.status === 'published').length} đã đăng`} />
        </div>
      </Card>

      {/* Ecom — tách riêng, KHÔNG tính vào KPI team */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag size={16} className="text-teal-300" />
          <h2 className="font-bold text-sm">Ecom <span className="text-xs text-muted font-normal">· tách riêng, không tính KPI team · tổng tháng {Number(month.slice(5))}</span></h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <EcomStat icon={<Camera size={15} />} tint="text-indigo-300" label="Ảnh ecom" value={ecomPhotos} />
          <EcomStat icon={<Video size={15} />} tint="text-violet-300" label="Video ecom" value={ecomVideos} />
          <EcomStat icon={<Wallet size={15} />} tint="text-amber-300" label="Chi phí ecom" value={formatVND(ecomCost)} />
          <EcomStat icon={<FolderKanban size={15} />} tint="text-teal-300" label="Dự án ecom" value={ecomProjectCount} />
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="font-bold text-sm mb-1">Sản lượng Ảnh & Video theo tháng</h2>
          <p className="text-xs text-muted mb-4">6 tháng gần nhất · Ảnh = số project, Video = số lượng</p>
          <GroupedBarChart
            data={trend}
            series={[
              { key: 'photo', label: 'Project ảnh', color: '#818cf8' },
              { key: 'video', label: 'Video', color: '#fb923c' },
            ]}
          />
        </Card>
        <Card className="p-4">
          <h2 className="font-bold text-sm mb-1">KPI trung bình team theo tháng</h2>
          <p className="text-xs text-muted mb-4">6 tháng gần nhất</p>
          <LineChart data={trend.map((t) => ({ label: t.label, value: t.avgKpi }))} suffix="%" color="#fbbf24" />
        </Card>
        <Card className="p-4">
          <h2 className="font-bold text-sm mb-1">Dự án: tạo mới vs hoàn thành</h2>
          <p className="text-xs text-muted mb-4">6 tháng gần nhất</p>
          <GroupedBarChart
            data={trend}
            series={[
              { key: 'created', label: 'Tạo mới', color: '#38bdf8' },
              { key: 'finished', label: 'Hoàn thành', color: '#34d399' },
            ]}
          />
        </Card>
        <Card className="p-4">
          <h2 className="font-bold text-sm mb-1">Khối lượng task theo tháng</h2>
          <p className="text-xs text-muted mb-4">Tổng số task báo cáo mỗi tháng</p>
          <LineChart data={trend.map((t) => ({ label: t.label, value: t.tasks }))} color="#a78bfa" />
        </Card>
      </div>

      {/* So sánh chi phí giữa các tháng */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-sm flex items-center gap-2"><Wallet size={15} className="text-amber-300" /> Chi phí theo tháng</h2>
          <span className="text-xs text-muted">
            {cur.cost >= prev.cost ? '▲' : '▼'} {formatVND(Math.abs(cur.cost - prev.cost))} so tháng trước
          </span>
        </div>
        <p className="text-xs text-muted mb-4">Tổng chi phí tiền kỳ 6 tháng gần nhất</p>
        <CostBarChart data={trend.map((t) => ({ label: t.label, cost: t.cost }))} />
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-sm"><Crown size={15} className="text-amber-300" /> Bảng KPI thành viên</div>
          <span className="text-xs text-muted">KPI = Sản lượng / Chỉ tiêu · nhấp vào dòng để xem chi tiết</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-dim border-b border-line">
                <th className="text-center w-10 py-2.5 font-bold">#</th>
                <th className="text-left px-2 py-2.5 font-bold">Thành viên</th>
                <th className="text-center px-2 py-2.5 font-bold">Ảnh</th>
                <th className="text-center px-2 py-2.5 font-bold">Video</th>
                <th className="text-center px-2 py-2.5 font-bold">Outsrc</th>
                <th className="text-center px-2 py-2.5 font-bold text-dim">DNTT</th>
                <th className="text-left px-3 py-2.5 font-bold w-36">Sản lượng</th>
                <th className="text-left px-3 py-2.5 font-bold w-52">KPI</th>
                <th className="text-center pr-4 pl-2 py-2.5 font-bold">T.trước</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {kpi.map((m, i) => {
                const prevMember = members.find((mm) => (mm.uid || mm.id) === m.uid);
                const prevKpi = prevMember
                  ? calculateMemberKpi(prevMember, shiftMonth(month, -1), allTasks, projects, reports, ecomIds)
                  : null;
                const delta = prevKpi ? Math.round((m.finalKPI - prevKpi.finalKPI) * 10) / 10 : 0;
                const kpiBar = m.finalKPI >= 100 ? 'bg-emerald-400' : m.finalKPI >= 60 ? 'bg-indigo-400' : 'bg-slate-400';
                const kpiText = m.finalKPI >= 100 ? 'text-emerald-400' : m.finalKPI >= 60 ? 'text-indigo-300' : 'text-slate-300';
                const outPct = m.kpiOutputTarget > 0 ? Math.min(100, (m.outputCount / m.kpiOutputTarget) * 100) : 0;
                const rankTint = ['text-amber-400', 'text-slate-300', 'text-orange-400'][i] || 'text-dim';
                return (
                <tr key={m.uid} onClick={() => setSelected(m)} className="hover:bg-surface-2 cursor-pointer transition-colors">
                  <td className="text-center"><span className={`text-sm font-extrabold tabular-nums ${rankTint}`}>{i + 1}</span></td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="relative shrink-0">
                        <Avatar name={m.username} url={m.avatarUrl} size={30} />
                        {i === 0 && m.finalKPI > 0 && <Crown size={12} className="absolute -top-1.5 -right-1 text-amber-400 rotate-12" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold truncate">{m.username}</p>
                        <p className="text-[11px] text-dim truncate">{m.title || m.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-center tabular-nums font-semibold" title={`${m.photoCount} ảnh hoàn thành`}>{m.photoProjectCount}</td>
                  <td className="text-center tabular-nums font-semibold">{m.videoCount}</td>
                  <td className="text-center tabular-nums font-semibold">{m.outsourceProjectCount}</td>
                  <td className="text-center tabular-nums text-dim">{m.dnttCount}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-baseline justify-between text-[11px] mb-1">
                      <span className="font-bold tabular-nums">{m.outputCount}</span>
                      <span className="text-dim tabular-nums">/ {m.kpiOutputTarget}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full bg-indigo-400/80" style={{ width: `${outPct}%` }} /></div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-line overflow-hidden">
                        <div className={`h-full rounded-full ${kpiBar}`} style={{ width: `${Math.min(100, m.finalKPI)}%` }} />
                      </div>
                      <span className={`text-xs font-extrabold tabular-nums w-11 text-right ${kpiText}`}>{m.finalKPI}%</span>
                    </div>
                  </td>
                  <td className="text-center pr-4 pl-2">
                    <span className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-md ${
                      delta > 0 ? 'bg-emerald-500/10 text-emerald-400' : delta < 0 ? 'bg-red-500/10 text-red-400' : 'text-dim'
                    }`}>
                      {delta > 0 ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                      {delta !== 0 ? Math.abs(delta) : ''}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
            {kpi.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line text-[12px]">
                  <td />
                  <td className="px-2 py-2.5 font-bold text-muted uppercase tracking-wide text-[11px]">Tổng team</td>
                  <td className="text-center tabular-nums font-bold">{kpi.reduce((s, m) => s + m.photoProjectCount, 0)}</td>
                  <td className="text-center tabular-nums font-bold">{kpi.reduce((s, m) => s + m.videoCount, 0)}</td>
                  <td className="text-center tabular-nums font-bold">{kpi.reduce((s, m) => s + m.outsourceProjectCount, 0)}</td>
                  <td className="text-center tabular-nums text-dim">{kpi.reduce((s, m) => s + m.dnttCount, 0)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-bold">{kpi.reduce((s, m) => s + m.outputCount, 0)}<span className="text-dim font-normal">/{kpi.reduce((s, m) => s + m.kpiOutputTarget, 0)}</span></td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-muted">TB </span>
                    <span className="text-xs font-extrabold tabular-nums text-amber-300">{cur.avgKpi}%</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Cost analysis */}
      <Card>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm"><Wallet size={15} className="text-amber-300" /> Phân tích chi phí</div>
          <span className="text-sm font-extrabold text-amber-300 tabular-nums">{formatVND(totalMonthCost)}</span>
        </div>
        {costByProject.size === 0 ? (
          <p className="text-sm text-dim py-8 text-center">Không có chi phí trong tháng</p>
        ) : (
          <div className="divide-y divide-line">
            {Array.from(costByProject.entries())
              .sort((a, b) => sumAmt(b[1]) - sumAmt(a[1]))
              .map(([pid, list]) => {
                const proj = projects.find((p) => p.id === pid);
                const total = sumAmt(list);
                const approved = list.filter((t) => t.dntt).length;
                return (
                  <div key={pid} className="px-4 py-3">
                    <button onClick={() => proj && onOpenProject(pid)} className="w-full flex items-center justify-between cursor-pointer group">
                      <div className="text-left">
                        <p className="text-sm font-bold group-hover:text-indigo-300 transition-colors">{proj?.title || 'Không rõ project'}</p>
                        <p className="text-[11px] text-dim">{list.length} khoản · {approved}/{list.length} đã duyệt DNTT</p>
                      </div>
                      <span className="text-sm font-bold text-amber-300 tabular-nums">{formatVND(total)}</span>
                    </button>
                    <div className="mt-2 space-y-1">
                      {list.map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-xs text-muted pl-3 border-l border-line">
                          <span className="truncate">{t.title}{t.dntt && <span className="text-emerald-400 ml-1.5">✓</span>}</span>
                          <span className="tabular-nums shrink-0 ml-3">{formatVND(Number(t.amount) || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      {/* Member drill-down */}
      {selected && (
        <MemberDetail
          kpi={selected}
          month={month}
          onClose={() => setSelected(null)}
          onOpenProject={onOpenProject}
        />
      )}
    </div>
  );
}

function sumAmt(list: Task[]) {
  return list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

/* ---------- Delta card (this month vs last) ---------- */
function DeltaCard({ label, icon, tint, cur, prev, suffix = '' }: { label: string; icon: React.ReactNode; tint: string; cur: number; prev: number; suffix?: string }) {
  const diff = Math.round((cur - prev) * 10) / 10;
  const pctChange = prev > 0 ? Math.round((diff / prev) * 100) : cur > 0 ? 100 : 0;
  const up = diff > 0, down = diff < 0;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-muted uppercase tracking-wide">{label}</span>
        <span className={tint}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold tabular-nums leading-none">{cur}{suffix}</p>
      <div className="flex items-center gap-1 mt-1.5 text-[11px] font-bold">
        <span className={up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-dim'}>
          {up ? '▲' : down ? '▼' : '—'} {diff !== 0 ? `${Math.abs(diff)}${suffix}` : 'không đổi'}
        </span>
        {diff !== 0 && <span className="text-dim">({pctChange > 0 ? '+' : ''}{pctChange}%)</span>}
        <span className="text-dim ml-auto">T.trước: {prev}{suffix}</span>
      </div>
    </Card>
  );
}

function SectionTitle({ icon, tint, title, note }: { icon: React.ReactNode; tint: string; title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className={tint}>{icon}</span>
      <h2 className="font-bold text-sm">{title}{note && <span className="text-xs text-muted font-normal"> · {note}</span>}</h2>
    </div>
  );
}

function StatTile({ icon, tint, label, value, sub, danger }: { icon: React.ReactNode; tint: string; label: string; value: React.ReactNode; sub?: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl bg-bg border p-3.5 ${danger ? 'border-red-500/30' : 'border-line'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold text-muted uppercase tracking-wide">{label}</span>
        <span className={tint}>{icon}</span>
      </div>
      <p className="text-xl font-extrabold tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[10px] text-dim mt-1">{sub}</p>}
    </div>
  );
}

function EcomStat({ label, icon, tint, value }: { label: string; icon: React.ReactNode; tint: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-bg border border-line p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-muted uppercase tracking-wide">{label}</span>
        <span className={tint}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold tabular-nums leading-none">{value}</p>
    </div>
  );
}

/* ---------- Grouped bar chart (SVG) ---------- */
function GroupedBarChart({ data, series }: { data: Record<string, number | string>[]; series: { key: string; label: string; color: string }[] }) {
  const W = 480, H = 200, padB = 26, padL = 24, padT = 22;
  const rawMax = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const max = rawMax * 1.15; // headroom so value labels don't clip
  const groupW = (W - padL * 2) / data.length;
  const barW = Math.min(18, (groupW - 8) / series.length);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padL} y1={padT + (H - padT - padB) * (1 - f)} y2={padT + (H - padT - padB) * (1 - f)} stroke="#26262c" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const gx = padL + groupW * i + groupW / 2;
          return (
            <g key={i}>
              {series.map((s, j) => {
                const val = Number(d[s.key]) || 0;
                const h = ((H - padT - padB) * val) / max;
                const x = gx - (barW * series.length) / 2 + j * barW;
                return (
                  <g key={s.key}>
                    <rect x={x} y={H - padB - h} width={barW - 2} height={h} rx={2} fill={s.color} />
                    {val > 0 && <text x={x + (barW - 2) / 2} y={H - padB - h - 3} textAnchor="middle" fontSize={9} fill="#8b8b94">{val}</text>}
                  </g>
                );
              })}
              <text x={gx} y={H - 8} textAnchor="middle" fontSize={10} fill="#8b8b94">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 justify-center mt-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Line chart (SVG) ---------- */
function LineChart({ data, suffix = '', color }: { data: { label: string; value: number }[]; suffix?: string; color: string }) {
  const W = 480, H = 200, padB = 26, padL = 30, padT = 26;
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.12; // headroom for top labels
  const stepX = (W - padL * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => ({
    x: padL + stepX * i,
    y: padT + (H - padT - padB) * (1 - d.value / max),
    ...d,
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padL} x2={W - padL} y1={padT + (H - padT - padB) * (1 - f)} y2={padT + (H - padT - padB) * (1 - f)} stroke="#26262c" strokeWidth={1} />
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill={color} />
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill="#f2f2f4" fontWeight="bold">{p.value}{suffix}</text>
          <text x={p.x} y={H - 8} textAnchor="middle" fontSize={10} fill="#8b8b94">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

/* ---------- Cost-by-month bar chart (SVG) ---------- */
function costShort(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} tr`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return `${n}`;
}
function CostBarChart({ data }: { data: { label: string; cost: number }[] }) {
  const W = 480, H = 200, padB = 26, padL = 24, padT = 22;
  const max = Math.max(1, ...data.map((d) => d.cost)) * 1.18;
  const groupW = (W - padL * 2) / data.length;
  const barW = Math.min(36, groupW - 14);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padL} x2={W - padL} y1={padT + (H - padT - padB) * (1 - f)} y2={padT + (H - padT - padB) * (1 - f)} stroke="#26262c" strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const gx = padL + groupW * i + groupW / 2;
        const h = ((H - padT - padB) * d.cost) / max;
        return (
          <g key={i}>
            <rect x={gx - barW / 2} y={H - padB - h} width={barW} height={h} rx={3} fill="#fbbf24" />
            {d.cost > 0 && <text x={gx} y={H - padB - h - 4} textAnchor="middle" fontSize={9} fill="#e6b34d" fontWeight="bold">{costShort(d.cost)}</text>}
            <text x={gx} y={H - 8} textAnchor="middle" fontSize={10} fill="#8b8b94">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MemberDetail({
  kpi, month, onClose, onOpenProject,
}: { kpi: MemberKpi; month: string; onClose: () => void; onOpenProject: (id: string) => void }) {
  const { allTasks, projects } = useAppData();
  const [tab, setTab] = useState<'photo' | 'video' | 'dntt' | 'projects'>('photo');

  const userTasks = allTasks.filter((t) => t.createdBy === kpi.uid && (t.reportDate || '').startsWith(month));
  const photoTasks = userTasks.filter((t) => t.category === 'photo');
  const videoTasks = userTasks.filter((t) => t.category === 'video');
  const preTasks = userTasks.filter((t) => t.category === 'pre-production');

  const projOf = (id?: string) => projects.find((p) => p.id === id);

  const TaskList = ({ list }: { list: Task[] }) => (
    <div className="divide-y divide-line">
      {list.length === 0 && <p className="text-sm text-dim py-6 text-center">Không có dữ liệu</p>}
      {list.map((t) => {
        const proj = projOf(t.projectId);
        return (
          <div key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="text-[11px] text-dim tabular-nums w-16 shrink-0">{formatDate(t.reportDate)}</span>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{t.title}</p>
              <p className="text-[11px] text-dim truncate">{proj?.title || '—'}</p>
            </div>
            {t.category === 'pre-production' ? (
              <span className="text-xs font-bold text-amber-300 tabular-nums">{formatVND(Number(t.amount) || 0)}</span>
            ) : (
              <span className="text-xs text-muted tabular-nums">×{t.quantity || 1}</span>
            )}
            <Badge color={STATUS_BADGE[t.status] || STATUS_BADGE.pending}>{STATUS_LABEL[t.status] || t.status}</Badge>
          </div>
        );
      })}
    </div>
  );

  const memberProjects = projects.filter((p) => kpi.projectIds.includes(p.id));

  return (
    <div className="fixed inset-0 z-[140] flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="fade-up w-full max-w-2xl h-full bg-surface border-l border-line overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Avatar name={kpi.username} url={kpi.avatarUrl} size={40} />
          <div className="flex-1">
            <h2 className="font-extrabold">{kpi.username}</h2>
            <p className="text-xs text-muted">{kpi.title || kpi.role} · Tháng {Number(month.slice(5))}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-lg text-sm font-extrabold tabular-nums ${kpi.finalKPI >= 100 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-indigo-500/15 text-indigo-300'}`}>
            KPI {kpi.finalKPI}%
          </span>
          <button onClick={onClose} className="text-muted hover:text-ink cursor-pointer p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <MiniStat label="Project ảnh" value={kpi.photoProjectCount} />
            <MiniStat label="Video" value={kpi.videoCount} />
            <MiniStat label="Project outsource" value={kpi.outsourceProjectCount} />
            <MiniStat label="DNTT" value={kpi.dnttCount} />
            <MiniStat label="Sản lượng" value={`${kpi.outputCount}/${kpi.kpiOutputTarget}`} />
            <MiniStat label="KPI" value={`${kpi.finalKPI}%`} />
          </div>

          <div className="flex bg-bg border border-line rounded-lg p-0.5">
            {([
              ['photo', 'Ảnh', <Camera key="i" size={13} />],
              ['video', 'Video', <Video key="i" size={13} />],
              ['dntt', 'Chi phí', <Wallet key="i" size={13} />],
              ['projects', 'Projects', <FolderKanban key="i" size={13} />],
            ] as const).map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  tab === key ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {tab === 'photo' && <TaskList list={photoTasks} />}
          {tab === 'video' && <TaskList list={videoTasks} />}
          {tab === 'dntt' && <TaskList list={preTasks} />}
          {tab === 'projects' && (
            <div className="space-y-2">
              {memberProjects.length === 0 && <p className="text-sm text-dim py-6 text-center">Không có project</p>}
              {memberProjects.map((p) => {
                const pTasks = userTasks.filter((t) => t.projectId === p.id);
                const qty = pTasks.reduce((s, t) => s + (t.category === 'pre-production' ? 1 : Number(t.quantity) || 1), 0);
                return (
                  <button
                    key={p.id}
                    onClick={() => { onClose(); onOpenProject(p.id); }}
                    className="w-full flex items-center gap-3 p-3 bg-bg border border-line rounded-xl hover:border-line-2 transition-all text-left cursor-pointer group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate group-hover:text-indigo-300 transition-colors">{p.title}</p>
                      <p className="text-[11px] text-dim">{pTasks.length} task trong tháng</p>
                    </div>
                    <Badge color={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    <span className="text-xs font-bold text-indigo-300 tabular-nums">{qty} SP</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-bg border border-line rounded-xl p-3 text-center">
      <p className="text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted font-bold uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}
