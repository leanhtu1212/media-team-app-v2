import { useMemo, useState } from 'react';
import { Crown, X, Camera, Video, Wallet, FolderKanban, TrendingUp, ArrowUp, ArrowDown, Minus, ShoppingBag, Building2, Users } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Card, Badge, STATUS_BADGE, STATUS_LABEL, Avatar, Input, EmptyState, Drawer } from '../components/ui';
import { calculateTeamKpi, ecomProjectIdSet, teamTypeTotals, type MemberKpi, type ProjectClass, type TypeTotals } from '../lib/kpi';
import { currentMonth, shiftMonth, formatVND, formatDate } from '../lib/utils';
import type { Task, Project } from '../types';

const isDone = (t: Task) => t.status === 'completed' || !!t.dntt;
const fmtScore = (n: number) => (Math.round(n * 100) / 100).toString();

const CLASS_META: Record<ProjectClass, { label: string; tint: string; icon: (s: number) => React.ReactNode }> = {
  inhouse: { label: 'Inhouse', tint: 'text-sky-300', icon: (s) => <Building2 size={s} /> },
  outsource: { label: 'Outsource', tint: 'text-fuchsia-300', icon: (s) => <Users size={s} /> },
  ecom: { label: 'Ecom', tint: 'text-teal-300', icon: (s) => <ShoppingBag size={s} /> },
};

type MemberTab = 'photo' | 'video' | 'dntt' | 'projects';

interface DrawerItem {
  id: string;
  date?: string;
  title: string;
  sub?: string;
  right?: string;
  status?: string;
}
interface MetricDrawerData {
  title: string;
  subtitle?: string;
  items: DrawerItem[];
}

function taskItem(t: Task, projById: Map<string, Project>): DrawerItem {
  const isCost = t.category === 'pre-production';
  return {
    id: t.id,
    date: t.reportDate,
    title: t.title,
    sub: projById.get(t.projectId)?.title || '—',
    right: isCost ? formatVND(Number(t.amount) || 0) : `×${t.quantity || 1}`,
    status: isCost ? undefined : t.status,
  };
}

export function PerformancePage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { members, projects, allTasks, reports, tags, isAdmin } = useAppData();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<MemberKpi | null>(null);
  const [detailTab, setDetailTab] = useState<MemberTab>('photo');
  const [drawer, setDrawer] = useState<MetricDrawerData | null>(null);

  const ecomIds = useMemo(() => ecomProjectIdSet(projects, tags), [projects, tags]);
  const projById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const kpi = useMemo(
    () => calculateTeamKpi(members, month, allTasks, projects, reports),
    [members, month, allTasks, projects, reports],
  );
  const prevByUid = useMemo(() => {
    const prev = calculateTeamKpi(members, shiftMonth(month, -1), allTasks, projects, reports);
    return new Map(prev.map((k) => [k.uid, k]));
  }, [members, month, allTasks, projects, reports]);
  const typeTotals = useMemo(
    () => teamTypeTotals(allTasks, projects, ecomIds, month),
    [allTasks, projects, ecomIds, month],
  );
  const totalTotals = useMemo<TypeTotals>(() => {
    const parts = [typeTotals.inhouse, typeTotals.outsource, typeTotals.ecom];
    return {
      photos: parts.reduce((s, x) => s + x.photos, 0),
      videos: parts.reduce((s, x) => s + x.videos, 0),
      cost: parts.reduce((s, x) => s + x.cost, 0),
      photoTasks: parts.flatMap((x) => x.photoTasks),
      videoTasks: parts.flatMap((x) => x.videoTasks),
      costTasks: parts.flatMap((x) => x.costTasks),
    };
  }, [typeTotals]);

  // ── 6-month trend (kết thúc ở tháng đang chọn) ──
  const trend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
    return months.map((mo) => {
      const teamKpi = calculateTeamKpi(members, mo, allTasks, projects, reports);
      const photo = Math.round(teamKpi.reduce((s, k) => s + k.photoScore, 0) * 10) / 10;
      const video = teamKpi.reduce((s, k) => s + k.videoCount, 0);
      const avgKpi = teamKpi.length ? teamKpi.reduce((s, k) => s + k.finalKPI, 0) / teamKpi.length : 0;
      const tt = teamTypeTotals(allTasks, projects, ecomIds, mo);
      const cost = tt.inhouse.cost + tt.outsource.cost; // chi phí non-ecom (Ecom xem ở bảng loại)
      return { month: mo, label: `T${Number(mo.slice(5))}`, photo, video, cost, avgKpi: Math.round(avgKpi * 10) / 10 };
    });
  }, [month, allTasks, members, projects, reports, ecomIds]);

  // ── Phân tích chi phí (giữ như cũ): pre-production non-ecom trong tháng, gom theo project ──
  const costTasks = useMemo(
    () => allTasks.filter((t) => t.category === 'pre-production' && (t.reportDate || '').startsWith(month) && !ecomIds.has(t.projectId) && projById.has(t.projectId)),
    [allTasks, month, ecomIds, projById],
  );
  const costByProject = useMemo(() => {
    const m = new Map<string, Task[]>();
    costTasks.forEach((t) => { const l = m.get(t.projectId) || []; l.push(t); m.set(t.projectId, l); });
    return m;
  }, [costTasks]);
  const totalMonthCost = costTasks.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  if (!isAdmin) {
    return <EmptyState icon={<TrendingUp size={32} />} text="Chỉ admin mới xem được trang này" />;
  }

  const openMember = (m: MemberKpi, tab: MemberTab = 'photo') => { setDetailTab(tab); setSelected(m); };

  const openMetric = (tt: TypeTotals, label: string, metric: 'photos' | 'videos' | 'cost') => {
    if (metric === 'photos') setDrawer({ title: `${label} · Ảnh`, subtitle: `${tt.photos} ảnh · ${tt.photoTasks.length} task`, items: tt.photoTasks.map((t) => taskItem(t, projById)) });
    else if (metric === 'videos') setDrawer({ title: `${label} · Video`, subtitle: `${tt.videos} video · ${tt.videoTasks.length} task`, items: tt.videoTasks.map((t) => taskItem(t, projById)) });
    else setDrawer({ title: `${label} · Chi phí`, subtitle: `${formatVND(tt.cost)} · ${tt.costTasks.length} khoản`, items: tt.costTasks.map((t) => taskItem(t, projById)) });
  };
  const openTypeMetric = (cls: ProjectClass, metric: 'photos' | 'videos' | 'cost') => openMetric(typeTotals[cls], CLASS_META[cls].label, metric);

  const openOutputMonth = (mo: string) => {
    const items = allTasks
      .filter((t) => (t.reportDate || '').startsWith(mo) && (t.category === 'photo' || t.category === 'video') && isDone(t) && projById.has(t.projectId))
      .map((t) => taskItem(t, projById));
    setDrawer({ title: `Sản lượng · T${Number(mo.slice(5))}`, subtitle: `${items.length} task ảnh/video`, items });
  };
  const openCostMonth = (mo: string) => {
    const items = allTasks
      .filter((t) => t.category === 'pre-production' && (t.reportDate || '').startsWith(mo) && !ecomIds.has(t.projectId) && projById.has(t.projectId))
      .map((t) => taskItem(t, projById));
    setDrawer({ title: `Chi phí · T${Number(mo.slice(5))}`, subtitle: `${items.length} khoản`, items });
  };
  const openKpiMonth = (mo: string) => {
    const k = calculateTeamKpi(members, mo, allTasks, projects, reports);
    setDrawer({ title: `KPI · T${Number(mo.slice(5))}`, subtitle: 'KPI từng thành viên', items: k.map((m) => ({ id: m.uid, title: m.username, sub: `Sản lượng ${fmtScore(m.outputCount)}/${m.kpiOutputTarget}`, right: `${m.finalKPI}%` })) });
  };

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Hiệu suất</h1>
          <p className="text-sm text-muted">KPI = Sản lượng (project ảnh + số video) / chỉ tiêu · nhấp đúp mọi số để xem chi tiết</p>
        </div>
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="!w-auto" />
      </div>

      {/* Tổng sản lượng cả team (tổng của tất cả loại) */}
      <Card className="p-4 border-indigo-500/30 bg-indigo-500/[0.04]">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-indigo-300"><TrendingUp size={16} /></span>
          <h3 className="font-bold text-sm">Tổng sản lượng team <span className="text-xs text-muted font-normal">· gộp Inhouse + Outsource + Ecom</span></h3>
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <StatCell icon={<Camera size={14} />} tint="text-indigo-300" label="Tổng ảnh" value={totalTotals.photos} onDoubleClick={() => openMetric(totalTotals, 'Tổng team', 'photos')} />
          <StatCell icon={<Video size={14} />} tint="text-violet-300" label="Tổng video" value={totalTotals.videos} onDoubleClick={() => openMetric(totalTotals, 'Tổng team', 'videos')} />
          <StatCell icon={<Wallet size={14} />} tint="text-amber-300" label="Tổng chi phí" value={formatVND(totalTotals.cost)} small onDoubleClick={() => openMetric(totalTotals, 'Tổng team', 'cost')} />
        </div>
      </Card>

      {/* 3 bảng theo loại */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['inhouse', 'outsource', 'ecom'] as ProjectClass[]).map((cls) => (
          <TypePanel key={cls} cls={cls} totals={typeTotals[cls]} onMetric={(metric) => openTypeMetric(cls, metric)} />
        ))}
      </div>

      {/* Bảng KPI thành viên */}
      <Card>
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-sm"><Crown size={15} className="text-amber-300" /> Bảng KPI thành viên</div>
          <span className="text-xs text-muted">KPI = Sản lượng / Chỉ tiêu · nhấp đúp dòng hoặc ô để xem chi tiết</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-dim border-b border-line">
                <th className="text-center w-10 py-2.5 font-bold">#</th>
                <th className="text-left px-2 py-2.5 font-bold">Thành viên</th>
                <th className="text-center px-2 py-2.5 font-bold">Ảnh</th>
                <th className="text-center px-2 py-2.5 font-bold">Video</th>
                <th className="text-left px-3 py-2.5 font-bold w-40">Sản lượng</th>
                <th className="text-left px-3 py-2.5 font-bold w-52">KPI</th>
                <th className="text-center pr-4 pl-2 py-2.5 font-bold">T.trước</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {kpi.map((m, i) => {
                const prev = prevByUid.get(m.uid);
                const delta = prev ? Math.round((m.finalKPI - prev.finalKPI) * 10) / 10 : 0;
                const kpiBar = m.finalKPI >= 100 ? 'bg-emerald-400' : m.finalKPI >= 60 ? 'bg-indigo-400' : 'bg-slate-400';
                const kpiText = m.finalKPI >= 100 ? 'text-emerald-400' : m.finalKPI >= 60 ? 'text-indigo-300' : 'text-slate-300';
                const outPct = m.kpiOutputTarget > 0 ? Math.min(100, (m.outputCount / m.kpiOutputTarget) * 100) : 0;
                const rankTint = ['text-amber-400', 'text-slate-300', 'text-orange-400'][i] || 'text-dim';
                return (
                  <tr key={m.uid} onDoubleClick={() => openMember(m)} className="hover:bg-surface-2 cursor-pointer transition-colors select-none">
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
                    <td className="text-center tabular-nums font-semibold hover:text-indigo-300" title={`${m.photoCount} ảnh · ${m.photoProjects.length} project`} onDoubleClick={(e) => { e.stopPropagation(); openMember(m, 'photo'); }}>{fmtScore(m.photoScore)}</td>
                    <td className="text-center tabular-nums font-semibold hover:text-indigo-300" onDoubleClick={(e) => { e.stopPropagation(); openMember(m, 'video'); }}>{m.videoCount}</td>
                    <td className="px-3 py-3" onDoubleClick={(e) => { e.stopPropagation(); openMember(m, 'projects'); }}>
                      <div className="flex items-baseline justify-between text-[11px] mb-1">
                        <span className="font-bold tabular-nums">{fmtScore(m.outputCount)}</span>
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
                  <td className="text-center tabular-nums font-bold">{fmtScore(kpi.reduce((s, m) => s + m.photoScore, 0))}</td>
                  <td className="text-center tabular-nums font-bold">{kpi.reduce((s, m) => s + m.videoCount, 0)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-bold">{fmtScore(kpi.reduce((s, m) => s + m.outputCount, 0))}<span className="text-dim font-normal">/{kpi.reduce((s, m) => s + m.kpiOutputTarget, 0)}</span></td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-muted">TB </span>
                    <span className="text-xs font-extrabold tabular-nums text-amber-300">{trend[trend.length - 1].avgKpi}%</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* 3 biểu đồ: Sản lượng / KPI / Chi phí */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="font-bold text-sm mb-1">Sản lượng Ảnh &amp; Video theo tháng</h2>
          <p className="text-xs text-muted mb-4">6 tháng gần nhất · Ảnh = project (phân số), Video = số lượng · nhấp đúp cột</p>
          <GroupedBarChart
            data={trend}
            series={[
              { key: 'photo', label: 'Project ảnh', color: '#818cf8' },
              { key: 'video', label: 'Video', color: '#fb923c' },
            ]}
            onBarDblClick={(i) => openOutputMonth(trend[i].month)}
          />
        </Card>
        <Card className="p-4">
          <h2 className="font-bold text-sm mb-1">KPI trung bình team theo tháng</h2>
          <p className="text-xs text-muted mb-4">6 tháng gần nhất · nhấp đúp điểm</p>
          <LineChart data={trend.map((t) => ({ label: t.label, value: t.avgKpi }))} suffix="%" color="#fbbf24" onPointDblClick={(i) => openKpiMonth(trend[i].month)} />
        </Card>
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-sm flex items-center gap-2"><Wallet size={15} className="text-amber-300" /> Chi phí theo tháng</h2>
            <span className="text-xs text-muted">
              {trend[5].cost >= trend[4].cost ? '▲' : '▼'} {formatVND(Math.abs(trend[5].cost - trend[4].cost))} so tháng trước
            </span>
          </div>
          <p className="text-xs text-muted mb-4">Tổng chi phí tiền kỳ non-Ecom 6 tháng gần nhất · nhấp đúp cột</p>
          <CostBarChart data={trend.map((t) => ({ label: t.label, cost: t.cost }))} onBarDblClick={(i) => openCostMonth(trend[i].month)} />
        </Card>
      </div>

      {/* Phân tích chi phí (giữ nguyên) */}
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
                const proj = projById.get(pid);
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

      {/* Drawer chi tiết chỉ số */}
      <MetricDrawer data={drawer} onClose={() => setDrawer(null)} />

      {/* Drill-down thành viên */}
      {selected && (
        <MemberDetail kpi={selected} month={month} initialTab={detailTab} onClose={() => setSelected(null)} onOpenProject={onOpenProject} />
      )}
    </div>
  );
}

function sumAmt(list: Task[]) {
  return list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

/* ---------- Bảng loại (inhouse/outsource/ecom) ---------- */
function TypePanel({ cls, totals, onMetric }: { cls: ProjectClass; totals: TypeTotals; onMetric: (m: 'photos' | 'videos' | 'cost') => void }) {
  const meta = CLASS_META[cls];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={meta.tint}>{meta.icon(16)}</span>
        <h3 className="font-bold text-sm">{meta.label}</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatCell icon={<Camera size={14} />} tint="text-indigo-300" label="Ảnh" value={totals.photos} onDoubleClick={() => onMetric('photos')} />
        <StatCell icon={<Video size={14} />} tint="text-violet-300" label="Video" value={totals.videos} onDoubleClick={() => onMetric('videos')} />
        <StatCell icon={<Wallet size={14} />} tint="text-amber-300" label="Chi phí" value={formatVND(totals.cost)} small onDoubleClick={() => onMetric('cost')} />
      </div>
    </Card>
  );
}

function StatCell({ icon, tint, label, value, small, onDoubleClick }: { icon: React.ReactNode; tint: string; label: string; value: React.ReactNode; small?: boolean; onDoubleClick: () => void }) {
  return (
    <div onDoubleClick={onDoubleClick} title="Nhấp đúp để xem chi tiết" className="rounded-xl bg-bg border border-line p-3 cursor-pointer hover:border-line-2 transition-colors select-none">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-muted uppercase tracking-wide">{label}</span>
        <span className={tint}>{icon}</span>
      </div>
      <p className={`${small ? 'text-sm' : 'text-xl'} font-extrabold tabular-nums leading-none`}>{value}</p>
    </div>
  );
}

/* ---------- Drawer chi tiết chỉ số (dùng chung) ---------- */
function MetricDrawer({ data, onClose }: { data: MetricDrawerData | null; onClose: () => void }) {
  return (
    <Drawer
      open={!!data}
      onClose={onClose}
      side="left"
      title={data ? (
        <div>
          <h2 className="font-extrabold text-sm">{data.title}</h2>
          {data.subtitle && <p className="text-[11px] text-muted">{data.subtitle}</p>}
        </div>
      ) : null}
    >
      {data && (
        <div className="divide-y divide-line">
          {data.items.length === 0 && <p className="text-sm text-dim py-6 text-center">Không có dữ liệu</p>}
          {data.items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 py-2.5 text-sm">
              {it.date && <span className="text-[11px] text-dim tabular-nums w-16 shrink-0">{formatDate(it.date)}</span>}
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{it.title}</p>
                {it.sub && <p className="text-[11px] text-dim truncate">{it.sub}</p>}
              </div>
              {it.right && <span className="text-xs font-bold tabular-nums shrink-0">{it.right}</span>}
              {it.status && <Badge color={STATUS_BADGE[it.status] || STATUS_BADGE.pending}>{STATUS_LABEL[it.status] || it.status}</Badge>}
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}

/* ---------- Grouped bar chart (SVG) ---------- */
function GroupedBarChart({ data, series, onBarDblClick }: { data: Record<string, number | string>[]; series: { key: string; label: string; color: string }[]; onBarDblClick?: (i: number) => void }) {
  const W = 480, H = 200, padB = 26, padL = 24, padT = 22;
  const rawMax = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const max = rawMax * 1.15;
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
              {onBarDblClick && <rect x={gx - groupW / 2} y={padT} width={groupW} height={H - padT - padB} fill="transparent" style={{ cursor: 'pointer' }} onDoubleClick={() => onBarDblClick(i)}><title>Nhấp đúp xem chi tiết</title></rect>}
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
function LineChart({ data, suffix = '', color, onPointDblClick }: { data: { label: string; value: number }[]; suffix?: string; color: string; onPointDblClick?: (i: number) => void }) {
  const W = 480, H = 200, padB = 26, padL = 30, padT = 26;
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.12;
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
          {onPointDblClick && <rect x={p.x - stepX / 2} y={padT} width={stepX} height={H - padT - padB} fill="transparent" style={{ cursor: 'pointer' }} onDoubleClick={() => onPointDblClick(i)}><title>Nhấp đúp xem chi tiết</title></rect>}
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
function CostBarChart({ data, onBarDblClick }: { data: { label: string; cost: number }[]; onBarDblClick?: (i: number) => void }) {
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
            {onBarDblClick && <rect x={gx - groupW / 2} y={padT} width={groupW} height={H - padT - padB} fill="transparent" style={{ cursor: 'pointer' }} onDoubleClick={() => onBarDblClick(i)}><title>Nhấp đúp xem chi tiết</title></rect>}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Member drill-down ---------- */
function MemberDetail({
  kpi, month, initialTab, onClose, onOpenProject,
}: { kpi: MemberKpi; month: string; initialTab: MemberTab; onClose: () => void; onOpenProject: (id: string) => void }) {
  const { allTasks, projects } = useAppData();
  const [tab, setTab] = useState<MemberTab>(initialTab);

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat label="Ảnh (project)" value={fmtScore(kpi.photoScore)} />
            <MiniStat label="Video" value={kpi.videoCount} />
            <MiniStat label="Sản lượng" value={`${fmtScore(kpi.outputCount)}/${kpi.kpiOutputTarget}`} />
            <MiniStat label="KPI" value={`${kpi.finalKPI}%`} />
          </div>

          {/* Bóc tách điểm ảnh theo project */}
          {kpi.photoProjects.length > 0 && (
            <div className="rounded-xl bg-bg border border-line p-3">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Điểm ảnh theo project</p>
              <div className="space-y-1.5">
                {kpi.photoProjects.map((pp) => (
                  <div key={pp.projectId} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">{pp.title}</span>
                    <span className="text-dim tabular-nums">{pp.done}/{pp.target || '—'} ảnh</span>
                    <span className="font-bold text-indigo-300 tabular-nums w-12 text-right">{Math.round(pp.fraction * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
