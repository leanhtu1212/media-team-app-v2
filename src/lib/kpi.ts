import type { Member, Project, Task, Report, Tag } from '../types';
import { isProjectFinished } from './utils';

const NO_ECOM = new Set<string>();

/** Tập id dự án được gắn tag loại Ecom → dùng để loại khỏi KPI & thống kê riêng. */
export function ecomProjectIdSet(projects: Project[], tags: Tag[]): Set<string> {
  const ecomTagIds = new Set(tags.filter((t) => t.scope === 'ecom').map((t) => t.id));
  if (ecomTagIds.size === 0) return NO_ECOM;
  return new Set(projects.filter((p) => p.tagId && ecomTagIds.has(p.tagId)).map((p) => p.id));
}

export interface MemberKpi {
  uid: string;
  username: string;
  email: string;
  role: string;
  title?: string;
  avatarUrl?: string;
  photoCount: number; // tổng số lượng ảnh inhouse (để hiển thị)
  photoProjectCount: number; // Ảnh KPI: số project inhouse đạt đủ target ảnh
  videoCount: number; // Video KPI: số lượng video inhouse
  outsourceProjectCount: number; // Outsource KPI: số project outsource hoàn thành
  dnttCount: number; // thông tin: số DNTT đã duyệt
  outputCount: number; // sản lượng KPI = project ảnh + video + project outsource
  kpiOutputTarget: number;
  outputKPI: number;
  finalKPI: number;
  projectCount: number;
  projectIds: string[];
}

/**
 * KPI theo sản lượng, tách 3 mục:
 * - Ảnh: số project INHOUSE đạt đủ target ảnh
 * - Video: số lượng video INHOUSE
 * - Outsource: số project OUTSOURCE hoàn thành (không kể số lượng ảnh/video)
 * Sản lượng = tổng 3 mục; KPI = sản lượng / chỉ tiêu chung.
 */
export function calculateMemberKpi(
  member: Member,
  month: string,
  allTasks: Task[],
  projects: Project[],
  reports: Report[],
  ecomIds: Set<string> = NO_ECOM,
): MemberKpi {
  const uid = member.uid || member.id;
  const isEcom = (pid?: string) => !!pid && ecomIds.has(pid); // dự án ecom → không tính KPI

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

  const projOf = (id?: string) => (id ? projects.find((p) => p.id === id) : undefined);
  const isOutsource = (p?: Project) => (p?.projectType || 'inhouse') === 'outsource';

  // Task inhouse vs outsource của thành viên trong tháng
  const inhousePhotoTasks = userTasks.filter((t) => t.category === 'photo' && !isOutsource(projOf(t.projectId)) && !isEcom(t.projectId));
  const inhouseVideoTasks = userTasks.filter((t) => t.category === 'video' && !isOutsource(projOf(t.projectId)) && !isEcom(t.projectId));

  const photoCount = inhousePhotoTasks.reduce((s, t) => s + (Number(t.quantity) || 1), 0);

  // ── Ảnh: số project INHOUSE đạt đủ target ảnh ──
  const photoProjectIds = Array.from(new Set(inhousePhotoTasks.map((t) => t.projectId).filter(Boolean))) as string[];
  const photoProjectCount = photoProjectIds.reduce((count, pid) => {
    const proj = projOf(pid);
    if (!proj) return count;
    const photoDone = allTasks
      .filter((t) => t.projectId === pid && t.category === 'photo' && (t.status === 'completed' || t.dntt))
      .reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const target = proj.photoTarget || 0;
    const reached = target > 0 ? photoDone >= target : photoDone > 0;
    return reached ? count + 1 : count;
  }, 0);

  // ── Video: số lượng video INHOUSE ──
  const videoCount = inhouseVideoTasks.reduce((s, t) => s + (Number(t.quantity) || 1), 0);

  // ── Outsource: số project OUTSOURCE hoàn thành (không kể số lượng ảnh/video) ──
  const outsourceProjectIds = Array.from(new Set(
    userTasks.filter((t) => (t.category === 'photo' || t.category === 'video') && isOutsource(projOf(t.projectId)) && !isEcom(t.projectId)).map((t) => t.projectId).filter(Boolean),
  )) as string[];
  const outsourceProjectCount = outsourceProjectIds.reduce((count, pid) => {
    const proj = projOf(pid);
    if (!proj) return count;
    const done = allTasks
      .filter((t) => t.projectId === pid && (t.category === 'photo' || t.category === 'video') && (t.status === 'completed' || t.dntt))
      .reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const target = (proj.photoTarget || 0) + (proj.videoTarget || 0);
    const reached = isProjectFinished(proj.status) || (target > 0 ? done >= target : done > 0);
    return reached ? count + 1 : count;
  }, 0);

  const dnttCount = userTasks.filter((t) => t.category === 'pre-production' && t.dntt).length;

  const outputCount = photoProjectCount + videoCount + outsourceProjectCount;
  const kpiOutputTarget = member.kpiOutput || 100;
  const outputKPI = (outputCount / kpiOutputTarget) * 100;

  const projectIds = Array.from(
    new Set([
      ...userTasks.map((t) => t.projectId).filter(Boolean),
      ...unlinkedManualReports.map((r) => r.projectId).filter(Boolean),
    ]),
  ) as string[];
  const userProjects = projects.filter((p) => projectIds.includes(p.id));

  const finalKPI = outputKPI;

  return {
    uid,
    username: member.username || member.email,
    email: member.email,
    role: member.role,
    title: member.title,
    avatarUrl: member.avatarUrl,
    photoCount,
    photoProjectCount,
    videoCount,
    outsourceProjectCount,
    dnttCount,
    outputCount,
    kpiOutputTarget,
    outputKPI: round1(outputKPI),
    finalKPI: round1(finalKPI),
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
  ecomIds: Set<string> = NO_ECOM,
): MemberKpi[] {
  return members
    .filter((m) => m.role === 'admin' || m.role === 'editor')
    .map((m) => calculateMemberKpi(m, month, allTasks, projects, reports, ecomIds))
    .sort((a, b) => b.finalKPI - a.finalKPI);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
