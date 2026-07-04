import { useMemo, useState } from 'react';
import { Crown, X, Camera, Video, Wallet, FolderKanban, TrendingUp, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Card, Badge, STATUS_BADGE, STATUS_LABEL, Avatar, Input, EmptyState } from '../components/ui';
import { calculateTeamKpi, calculateMemberKpi, type MemberKpi } from '../lib/kpi';
import { currentMonth, monthRange, shiftMonth, formatVND, formatDate } from '../lib/utils';
import type { Task } from '../types';

export function PerformancePage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { members, projects, allTasks, reports, isAdmin } = useAppData();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<MemberKpi | null>(null);

  const kpi = useMemo(
    () => calculateTeamKpi(members, month, allTasks, projects, reports),
    [members, month, allTasks, projects, reports],
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
      // Ảnh = số project INHOUSE đạt đủ target ảnh
      const monthPhotoProjectIds = Array.from(new Set(mt.filter((t) => t.category === 'photo' && !isOut(t.projectId)).map((t) => t.projectId).filter(Boolean))) as string[];
      const photo = monthPhotoProjectIds.reduce((count, pid) => {
        const proj = projects.find((p) => p.id === pid);
        if (!proj) return count;
        const photoDone = allTasks.filter((t) => t.projectId === pid && t.category === 'photo' && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
        const target = proj.photoTarget || 0;
        return (target > 0 ? photoDone >= target : photoDone > 0) ? count + 1 : count;
      }, 0);
      // Video = số lượng video INHOUSE
      const video = mt.filter((t) => t.category === 'video' && !isOut(t.projectId) && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
      // Bỏ chi phí mồ côi (project đã xoá) khỏi tổng
      const cost = mt.filter((t) => t.category === 'pre-production' && projects.some((p) => p.id === t.projectId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const teamKpi = calculateTeamKpi(members, mo, allTasks, projects, reports);
      const output = teamKpi.reduce((s, k) => s + k.outputCount, 0);
      const avgKpi = teamKpi.length > 0 ? teamKpi.reduce((s, k) => s + k.finalKPI, 0) / teamKpi.length : 0;
      return { month: mo, label: `T${Number(mo.slice(5))}`, photo, video, cost, output, avgKpi: Math.round(avgKpi * 10) / 10, reports: 0 };
    });
  }, [month, allTasks, members, projects, reports]);

  const thisIdx = trend.length - 1;
  const cur = trend[thisIdx];
  const prev = trend[thisIdx - 1];

  // Cost analysis: pre-production tasks in month grouped by project (bỏ mồ côi)
  const costTasks = monthTasks.filter((t) => t.category === 'pre-production' && projects.some((p) => p.id === t.projectId));
  const costByProject = new Map<string, Task[]>();
  costTasks.forEach((t) => {
    const list = costByProject.get(t.projectId) || [];
    list.push(t);
    costByProject.set(t.projectId, list);
  });
  const totalMonthCost = costTasks.reduce((s, t) => s + (Number(t.amount) || 0), 0);

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

      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="text-left px-4 py-3 font-bold">Thành viên</th>
              <th className="text-center px-2 py-3 font-bold">Project ảnh</th>
              <th className="text-center px-2 py-3 font-bold">Video</th>
              <th className="text-center px-2 py-3 font-bold">Outsource</th>
              <th className="text-center px-2 py-3 font-bold">DNTT</th>
              <th className="text-center px-2 py-3 font-bold">Sản lượng</th>
              <th className="text-center px-4 py-3 font-bold">KPI</th>
              <th className="text-center px-3 py-3 font-bold">So T.trước</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {kpi.map((m, i) => {
              const prevMember = members.find((mm) => (mm.uid || mm.id) === m.uid);
              const prevKpi = prevMember
                ? calculateMemberKpi(prevMember, shiftMonth(month, -1), allTasks, projects, reports)
                : null;
              const delta = prevKpi ? Math.round((m.finalKPI - prevKpi.finalKPI) * 10) / 10 : 0;
              return (
              <tr key={m.uid} onClick={() => setSelected(m)} className="hover:bg-surface-2 cursor-pointer transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <Avatar name={m.username} url={m.avatarUrl} size={30} />
                      {i === 0 && m.finalKPI > 0 && <Crown size={12} className="absolute -top-1.5 -right-1 text-amber-400 rotate-12" />}
                    </div>
                    <div>
                      <p className="font-bold">{m.username}</p>
                      <p className="text-[11px] text-dim">{m.title || m.role}</p>
                    </div>
                  </div>
                </td>
                <td className="text-center tabular-nums font-bold" title={`${m.photoCount} ảnh`}>{m.photoProjectCount}</td>
                <td className="text-center tabular-nums text-muted">{m.videoCount}</td>
                <td className="text-center tabular-nums text-muted">{m.outsourceProjectCount}</td>
                <td className="text-center tabular-nums text-muted">{m.dnttCount}</td>
                <td className="text-center tabular-nums font-bold">{m.outputCount}<span className="text-dim font-normal">/{m.kpiOutputTarget}</span></td>
                <td className="text-center px-4">
                  <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-extrabold tabular-nums ${
                    m.finalKPI >= 100 ? 'bg-emerald-500/15 text-emerald-400' : m.finalKPI >= 60 ? 'bg-indigo-500/15 text-indigo-300' : 'bg-slate-500/15 text-slate-300'
                  }`}>{m.finalKPI}%</span>
                </td>
                <td className="text-center px-3">
                  <span className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums ${
                    delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-dim'
                  }`}>
                    {delta > 0 ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                    {delta !== 0 ? Math.abs(delta) : ''}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
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
