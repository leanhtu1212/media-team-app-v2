import type { Member, Project, Task, Report, Tag } from '../types';
import { isProjectFinished } from './utils';

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

const sumQty = (list: Task[]) => list.reduce((s, t) => s + (Number(t.quantity) || 1), 0);

/**
 * Tách sản lượng đã xong của 1 project theo mốc tháng.
 * `reportDate` dạng YYYY-MM-DD nên so chuỗi với `month` (YYYY-MM) cho ra đúng "trước tháng".
 */
function splitByMonth(allTasks: Task[], projectId: string, cats: string[], month: string) {
  // Bỏ task không có reportDate (dữ liệu cũ) — chuỗi rỗng luôn < month nên sẽ bị tính nhầm là "tháng trước".
  const list = allTasks.filter((t) => t.projectId === projectId && cats.includes(t.category) && isDone(t) && !!t.reportDate);
  const inMonthTasks = list.filter((t) => (t.reportDate || '').startsWith(month));
  return {
    before: sumQty(list.filter((t) => (t.reportDate || '') < month)),
    inMonth: sumQty(inMonthTasks),
    inMonthTasks,
    lastMonth: list.reduce((mx, t) => ((t.reportDate || '').slice(0, 7) > mx ? (t.reportDate || '').slice(0, 7) : mx), ''),
  };
}

/** Tiến độ ẢNH tích luỹ của project khi đã xong `qty` ảnh (0..1). Có ≥1 ảnh = 50%, phần còn lại theo tỉ lệ. */
function photoCumulative(qty: number, target: number): number {
  if (target > 0) return qty >= 1 ? Math.min(1, 0.5 + 0.5 * Math.min(1, qty / target)) : 0;
  return qty > 0 ? 1 : 0; // không đặt chỉ tiêu: có ảnh = tính đủ 1 project
}

/**
 * Ảnh — phần tiến độ MỚI đạt được TRONG THÁNG của 1 project (0..1).
 * Lấy tiến độ tích luỹ đến hết tháng trừ đi phần các tháng trước đã tính → cộng mọi tháng luôn ≤ 1,
 * không còn cảnh project kéo dài 2 tháng bị đếm 2 lần.
 * topUid = người đóng góp nhiều nhất trong tháng → mỗi project chỉ tính cho 1 người.
 */
export function photoProjectFraction(
  proj: Project,
  allTasks: Task[],
  month: string,
): { fraction: number; topUid?: string; done: number } {
  const { before, inMonth, inMonthTasks } = splitByMonth(allTasks, proj.id, ['photo'], month);
  const target = proj.photoTarget || 0;
  const fraction = photoCumulative(before + inMonth, target) - photoCumulative(before, target);
  return { fraction: Math.max(0, fraction), topUid: topContributor(inMonthTasks), done: inMonth };
}

/**
 * Outsource — phần tiến độ MỚI đạt được TRONG THÁNG của 1 project outsource (0..1).
 * Team chỉ QUẢN LÝ chứ không sản xuất, nên tính theo % tiến độ project chứ không theo số ảnh/video:
 * tháng trước xong 70% = 0,7đ; tháng sau xong nốt 30% = 0,3đ. Tổng cả vòng đời = 1 project.
 * Không đặt chỉ tiêu (target = 0): chỉ tính 1đ khi project đã kết thúc, vào tháng có việc cuối cùng.
 */
export function outsourceProjectFraction(
  proj: Project,
  allTasks: Task[],
  month: string,
): { fraction: number; topUid?: string; done: number; target: number } {
  const { before, inMonth, inMonthTasks, lastMonth } = splitByMonth(allTasks, proj.id, ['photo', 'video'], month);
  const target = (proj.photoTarget || 0) + (proj.videoTarget || 0);
  const cum = (qty: number) => (target > 0 ? Math.min(1, qty / target) : 0);
  const fraction = target > 0
    ? cum(before + inMonth) - cum(before)
    : (isProjectFinished(proj.status) && lastMonth === month ? 1 : 0);
  return { fraction: Math.max(0, fraction), topUid: topContributor(inMonthTasks), done: inMonth, target };
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

export interface OutsourceProjectBreakdown {
  projectId: string;
  title: string;
  done: number; // ảnh+video làm trong tháng (chỉ để hiển thị)
  target: number;
  fraction: number; // phần tiến độ project đạt được trong tháng (0..1)
}

export interface MemberKpi {
  uid: string;
  username: string;
  email: string;
  role: string;
  title?: string;
  avatarUrl?: string;
  photoCount: number; // số ảnh INHOUSE hoàn thành trong tháng — hiển thị/tooltip
  photoScore: number; // Ảnh KPI: tổng project inhouse hoàn thành (phân số)
  photoProjects: PhotoProjectBreakdown[]; // bóc tách từng project cho drawer
  videoCount: number; // Video KPI: số lượng video INHOUSE + video Daily Content (không tính outsource)
  outsourceScore: number; // Outsource KPI: tổng % tiến độ project outsource quản lý trong tháng (phân số)
  outsourceProjects: OutsourceProjectBreakdown[]; // bóc tách cho drawer
  dnttCount: number; // thông tin: số DNTT đã duyệt
  outputCount: number; // sản lượng = photoScore + videoCount + outsourceScore
  kpiOutputTarget: number; // 0 = admin chưa đặt chỉ tiêu cho người này
  hasTarget: boolean;
  outputKPI: number;
  finalKPI: number;
  projectCount: number;
  projectIds: string[];
  isTeamAggregate: boolean; // true = dòng admin (KPI = tổng cả team, không phải sản lượng cá nhân)
}

/**
 * KPI theo sản lượng, tách 3 mục:
 *  - Ảnh      = tổng project INHOUSE hoàn thành (phân số, xem photoProjectFraction)
 *  - Video    = số video INHOUSE + video trả trong Daily Content
 *  - Outsource= tổng % tiến độ project outsource QUẢN LÝ được (không tính số ảnh/video vì team
 *               chỉ quản lý chứ không sản xuất)
 * Mọi mục đều phân bổ theo tháng và không bao giờ cộng quá 1 project trên cả vòng đời.
 * Sản lượng = Ảnh + Video + Outsource; KPI = sản lượng / chỉ tiêu (admin đặt ở Settings → KPI).
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

  const isOutsource = (id?: string) => (projOf(id)?.projectType || 'inhouse') === 'outsource';

  // ── Ảnh: tổng project INHOUSE hoàn thành (phân số), tính cho người đóng góp nhiều nhất ──
  //    (project outsource KHÔNG tính theo ảnh — chỉ tính số project ở mục Outsource bên dưới)
  const photoTasks = userTasks.filter((t) => t.category === 'photo' && isDone(t) && !isOutsource(t.projectId));
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

  // ── Video: số lượng video hoàn thành trong tháng ──
  //    (a) video task dự án INHOUSE (bỏ outsource)  (b) video trả trong Daily Content (báo cáo có relatedContentId)
  const taskVideoCount = userTasks
    .filter((t) => t.category === 'video' && isDone(t) && !isOutsource(t.projectId))
    .reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const contentVideoCount = userReports
    .filter((r) => (r.relatedContentId || '') !== '' && r.outputType === 'video')
    .reduce((s, r) => s + (Number(r.quantity) || 1), 0);
  const videoCount = taskVideoCount + contentVideoCount;

  // ── Outsource: chỉ tính % TIẾN ĐỘ PROJECT quản lý được trong tháng, KHÔNG tính số ảnh/video ──
  const workedOutsourceIds = Array.from(new Set(
    userTasks.filter((t) => (t.category === 'photo' || t.category === 'video') && isOutsource(t.projectId)).map((t) => t.projectId).filter(Boolean),
  )) as string[];
  const outsourceProjects: OutsourceProjectBreakdown[] = [];
  let outsourceScoreRaw = 0;
  for (const pid of workedOutsourceIds) {
    const proj = projOf(pid);
    if (!proj) continue;
    const { fraction, topUid, done, target } = outsourceProjectFraction(proj, allTasks, month);
    if (fraction > 0 && topUid === uid) {
      outsourceScoreRaw += fraction;
      outsourceProjects.push({ projectId: pid, title: proj.title, done, target, fraction: round2(fraction) });
    }
  }
  const outsourceScore = round2(outsourceScoreRaw);

  const dnttCount = userTasks.filter((t) => t.category === 'pre-production' && t.dntt).length;

  const outputCount = round2(photoScore + videoCount + outsourceScore);
  // Không còn chỉ tiêu mặc định — admin phải đặt chỉ tiêu (Settings → KPI) cho từng editor.
  const kpiOutputTarget = Number(member.kpiOutput) || 0;
  const hasTarget = kpiOutputTarget > 0;
  const outputKPI = hasTarget ? (outputCount / kpiOutputTarget) * 100 : 0;

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
    outsourceScore,
    outsourceProjects,
    dnttCount,
    outputCount,
    kpiOutputTarget,
    hasTarget,
    outputKPI: round1(outputKPI),
    finalKPI: round1(outputKPI),
    projectCount: userProjects.length,
    projectIds,
    isTeamAggregate: false,
  };
}

export function calculateTeamKpi(
  members: Member[],
  month: string,
  allTasks: Task[],
  projects: Project[],
  reports: Report[],
): MemberKpi[] {
  const list = members
    .filter((m) => m.role === 'admin' || m.role === 'editor')
    .map((m) => calculateMemberKpi(m, month, allTasks, projects, reports));

  // Admin KHÔNG có chỉ tiêu riêng → dòng admin = TỔNG sản lượng & thành tích của CẢ TEAM.
  // Tổng lấy từ giá trị GỐC của mọi người; chỉ tiêu team = tổng chỉ tiêu các EDITOR (admin không góp chỉ tiêu).
  const teamPhoto = round2(list.reduce((s, k) => s + k.photoScore, 0));
  const teamVideo = list.reduce((s, k) => s + k.videoCount, 0);
  const teamOutsource = round2(list.reduce((s, k) => s + k.outsourceScore, 0));
  const teamOutput = round2(list.reduce((s, k) => s + k.outputCount, 0));
  const teamTarget = list.filter((k) => k.role !== 'admin').reduce((s, k) => s + k.kpiOutputTarget, 0);
  const teamKPI = teamTarget > 0 ? round1((teamOutput / teamTarget) * 100) : 0;

  return list
    .map((k) => (k.role !== 'admin' ? k : {
      ...k,
      photoScore: teamPhoto,
      videoCount: teamVideo,
      outsourceScore: teamOutsource,
      outputCount: teamOutput,
      kpiOutputTarget: teamTarget,
      hasTarget: teamTarget > 0,
      outputKPI: teamKPI,
      finalKPI: teamKPI,
      isTeamAggregate: true,
    }))
    .sort((a, b) => b.finalKPI - a.finalKPI);
}

/** Chỉ các dòng KPI cá nhân (bỏ dòng tổng-team của admin) — dùng cho bảng xếp hạng & cộng dồn. */
export const individualKpi = (list: MemberKpi[]) => list.filter((k) => !k.isTeamAggregate);
/** Dòng tổng-team (admin). Không có admin nào thì undefined. */
export const teamAggregate = (list: MemberKpi[]) => list.find((k) => k.isTeamAggregate);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
