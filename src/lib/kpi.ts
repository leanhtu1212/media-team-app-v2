import type { Member, Project, Task, Report, Tag } from '../types';

const NO_ECOM = new Set<string>();

/** Task ảnh/video được coi là đã xong (đã hoàn thành hoặc đã duyệt DNTT). */
const isDone = (t: Task) => t.status === 'completed' || !!t.dntt;

/** Người đóng góp nhiều số lượng nhất trong danh sách task (tie-break theo uid cho ổn định). */
function topContributor(tasks: Task[]): string | undefined {
  if (tasks.length === 0) return undefined;
  const byMember = new Map<string, number>();
  tasks.forEach((t) => {
    const uid = t.createdBy || '';
    byMember.set(uid, (byMember.get(uid) || 0) + (Number(t.quantity) || 1));
  });
  return [...byMember.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/**
 * Ảnh — tỉ lệ hoàn thành 1 project TRONG THÁNG (dạng phân số 0..1):
 *  - Có ≥1 ảnh (đã chụp) = 50% project; 50% còn lại theo số lượng (ảnh xong / target).
 *  - target = 0 (dữ liệu cũ): có ảnh = tính đủ 1 project.
 * topUid = người đóng góp nhiều nhất → mỗi project chỉ tính cho 1 người, không trùng.
 */
export function photoProjectFraction(
  proj: Project,
  allTasks: Task[],
  month: string,
): { fraction: number; topUid?: string; done: number } {
  const monthTasks = allTasks.filter(
    (t) => t.projectId === proj.id && t.category === 'photo' && (t.reportDate || '').startsWith(month) && isDone(t),
  );
  const done = monthTasks.reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const target = proj.photoTarget || 0;
  let fraction: number;
  if (target > 0) fraction = done >= 1 ? Math.min(1, 0.5 + 0.5 * Math.min(1, done / target)) : 0;
  else fraction = done > 0 ? 1 : 0;
  return { fraction, topUid: topContributor(monthTasks), done };
}

/** Tập id dự án được gắn tag loại Ecom. */
export function ecomProjectIdSet(projects: Project[], tags: Tag[]): Set<string> {
  const ecomTagIds = new Set(tags.filter((t) => t.scope === 'ecom').map((t) => t.id));
  if (ecomTagIds.size === 0) return NO_ECOM;
  return new Set(projects.filter((p) => p.tagId && ecomTagIds.has(p.tagId)).map((p) => p.id));
}

export type ProjectClass = 'inhouse' | 'outsource' | 'ecom';

/** Phân loại 1 project vào đúng 1 nhóm: Ecom > Outsource > Inhouse. */
export function projectClass(proj: Project | undefined, ecomIds: Set<string>): ProjectClass {
  if (!proj) return 'inhouse';
  if (ecomIds.has(proj.id)) return 'ecom';
  if ((proj.projectType || 'inhouse') === 'outsource') return 'outsource';
  return 'inhouse';
}

export interface TypeTotals {
  photos: number;
  videos: number;
  cost: number;
  photoTasks: Task[];
  videoTasks: Task[];
  costTasks: Task[];
}

/** Tổng sản lượng team trong tháng, tách theo loại dự án (inhouse/outsource/ecom). */
export function teamTypeTotals(
  allTasks: Task[],
  projects: Project[],
  ecomIds: Set<string>,
  month: string,
): Record<ProjectClass, TypeTotals> {
  const projById = new Map(projects.map((p) => [p.id, p]));
  const blank = (): TypeTotals => ({ photos: 0, videos: 0, cost: 0, photoTasks: [], videoTasks: [], costTasks: [] });
  const res: Record<ProjectClass, TypeTotals> = { inhouse: blank(), outsource: blank(), ecom: blank() };
  for (const t of allTasks) {
    if (!(t.reportDate || '').startsWith(month)) continue;
    const proj = projById.get(t.projectId);
    if (!proj) continue; // bỏ task mồ côi (project đã xoá)
    const bucket = res[projectClass(proj, ecomIds)];
    if (t.category === 'photo' && isDone(t)) {
      bucket.photos += Number(t.quantity) || 1;
      bucket.photoTasks.push(t);
    } else if (t.category === 'video' && isDone(t)) {
      bucket.videos += Number(t.quantity) || 1;
      bucket.videoTasks.push(t);
    } else if (t.category === 'pre-production') {
      bucket.cost += Number(t.amount) || 0;
      bucket.costTasks.push(t);
    }
  }
  return res;
}

export interface PhotoProjectBreakdown {
  projectId: string;
  title: string;
  done: number;
  target: number;
  fraction: number;
}

export interface MemberKpi {
  uid: string;
  username: string;
  email: string;
  role: string;
  title?: string;
  avatarUrl?: string;
  photoCount: number; // tổng số ảnh hoàn thành trong tháng (mọi loại) — hiển thị/tooltip
  photoScore: number; // Ảnh KPI: tổng project hoàn thành (phân số)
  photoProjects: PhotoProjectBreakdown[]; // bóc tách từng project cho drawer
  videoCount: number; // Video KPI: số lượng video
  dnttCount: number; // thông tin: số DNTT đã duyệt
  outputCount: number; // sản lượng = photoScore + videoCount
  kpiOutputTarget: number;
  outputKPI: number;
  finalKPI: number;
  projectCount: number;
  projectIds: string[];
}

/**
 * KPI theo sản lượng, KHÔNG phân loại dự án (inhouse/outsource/ecom gộp chung):
 *  - Ảnh = tổng project hoàn thành (phân số, xem photoProjectFraction)
 *  - Video = tổng số lượng video hoàn thành trong tháng
 * Sản lượng = Ảnh + Video; KPI = sản lượng / chỉ tiêu (kpiOutput).
 */
export function calculateMemberKpi(
  member: Member,
  month: string,
  allTasks: Task[],
  projects: Project[],
  reports: Report[],
): MemberKpi {
  const uid = member.uid || member.id;
  const projOf = (id?: string) => (id ? projects.find((p) => p.id === id) : undefined);

  const userTasks = allTasks.filter(
    (t) => t.createdBy === uid && (t.reportDate || '').startsWith(month),
  );

  const userReports = reports.filter(
    (r) =>
      (r.createdBy === uid || r.userEmail?.toLowerCase() === (member.email || '').toLowerCase()) &&
      (r.reportDate || '').startsWith(month),
  );

  const unlinkedManualReports = userReports.filter((r) => {
    const isAuto = r.reportType === 'auto' || r.content?.startsWith('Báo cáo tự động:');
    if (isAuto) return false;
    return !allTasks.some((t) => t.sourceReportId === r.id);
  });

  // ── Ảnh: tổng project hoàn thành (phân số), tính cho người đóng góp nhiều nhất ──
  const photoTasks = userTasks.filter((t) => t.category === 'photo' && isDone(t));
  const photoCount = photoTasks.reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const photoProjectIds = Array.from(new Set(photoTasks.map((t) => t.projectId).filter(Boolean))) as string[];
  const photoProjects: PhotoProjectBreakdown[] = [];
  let photoScoreRaw = 0;
  for (const pid of photoProjectIds) {
    const proj = projOf(pid);
    if (!proj) continue;
    const { fraction, topUid, done } = photoProjectFraction(proj, allTasks, month);
    if (fraction > 0 && topUid === uid) {
      photoScoreRaw += fraction;
      photoProjects.push({ projectId: pid, title: proj.title, done, target: proj.photoTarget || 0, fraction: round2(fraction) });
    }
  }
  const photoScore = round2(photoScoreRaw);

  // ── Video: tổng số lượng video hoàn thành trong tháng (mọi loại dự án) ──
  const videoCount = userTasks
    .filter((t) => t.category === 'video' && isDone(t))
    .reduce((s, t) => s + (Number(t.quantity) || 1), 0);

  const dnttCount = userTasks.filter((t) => t.category === 'pre-production' && t.dntt).length;

  const outputCount = round2(photoScore + videoCount);
  const kpiOutputTarget = member.kpiOutput || 100;
  const outputKPI = (outputCount / kpiOutputTarget) * 100;

  const projectIds = Array.from(
    new Set([
      ...userTasks.map((t) => t.projectId).filter(Boolean),
      ...unlinkedManualReports.map((r) => r.projectId).filter(Boolean),
    ]),
  ) as string[];
  const userProjects = projects.filter((p) => projectIds.includes(p.id));

  return {
    uid,
    username: member.username || member.email,
    email: member.email,
    role: member.role,
    title: member.title,
    avatarUrl: member.avatarUrl,
    photoCount,
    photoScore,
    photoProjects,
    videoCount,
    dnttCount,
    outputCount,
    kpiOutputTarget,
    outputKPI: round1(outputKPI),
    finalKPI: round1(outputKPI),
    projectCount: userProjects.length,
    projectIds,
  };
}

export function calculateTeamKpi(
  members: Member[],
  month: string,
  allTasks: Task[],
  projects: Project[],
  reports: Report[],
): MemberKpi[] {
  return members
    .filter((m) => m.role === 'admin' || m.role === 'editor')
    .map((m) => calculateMemberKpi(m, month, allTasks, projects, reports))
    .sort((a, b) => b.finalKPI - a.finalKPI);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
