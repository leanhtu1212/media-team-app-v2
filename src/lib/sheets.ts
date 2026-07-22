import type { Member, Project, Task, Report, Tag } from '../types';
import { calculateTeamKpi, ecomProjectIdSet } from './kpi';
import { monthRange } from './utils';

const PROJECT_STATUS_LABEL: Record<string, string> = {
  plan: 'Kế hoạch',
  'pre-production': 'Tiền kỳ',
  'post-production': 'Hậu kỳ',
  payment: 'Thanh toán',
  done: 'Hoàn thành',
};

export interface SheetsPayload {
  syncedAt: string;
  month: string;
  sheets: Record<string, { headers: string[]; rows: (string | number)[][] }>;
}

export function buildSheetsPayload(
  month: string,
  members: Member[],
  projects: Project[],
  allTasks: Task[],
  reports: Report[],
  tags: Tag[] = [],
): SheetsPayload {
  const ecomIds = ecomProjectIdSet(projects, tags);
  const kpi = calculateTeamKpi(members, month, allTasks, projects, reports);
  const [monthStart, monthEnd] = monthRange(month);

  const kpiRows = kpi.map((m) => [
    m.username, m.role, m.photoScore, m.videoCount, m.dnttCount,
    m.outputCount, m.kpiOutputTarget, m.finalKPI, m.projectCount,
  ]);

  const projectRows = projects.map((p) => {
    const pTasks = allTasks.filter((t) => t.projectId === p.id);
    const photoDone = pTasks
      .filter((t) => t.category === 'photo' && (t.status === 'completed' || t.dntt))
      .reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const videoDone = pTasks
      .filter((t) => t.category === 'video' && (t.status === 'completed' || t.dntt))
      .reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    return [
      p.title || '', p.productType || p.projectType || '',
      PROJECT_STATUS_LABEL[p.status] || p.status || '', p.deadline || '',
      p.photoTarget || 0, p.videoTarget || 0, photoDone, videoDone,
      p.qualityScore !== undefined ? p.qualityScore : '',
    ];
  });

  const monthTasks = allTasks
    .filter((t) => {
      const d = t.reportDate || '';
      return d >= monthStart && d <= monthEnd;
    })
    .sort((a, b) => (a.reportDate || '').localeCompare(b.reportDate || ''));

  const taskRows = monthTasks.map((t) => {
    const proj = projects.find((p) => p.id === t.projectId);
    const member = members.find((m) => (m.uid || m.id) === t.createdBy);
    return [
      t.reportDate || '', member?.username || '', proj?.title || '',
      t.category || '', t.title || '', Number(t.quantity) || 1, t.status || '',
    ];
  });

  // Ecom (tách riêng, không tính KPI) — tổng hợp theo dự án Ecom có hoạt động trong tháng
  const ecomByProject = new Map<string, Task[]>();
  monthTasks
    .filter((t) => ecomIds.has(t.projectId))
    .forEach((t) => {
      const list = ecomByProject.get(t.projectId) || [];
      list.push(t);
      ecomByProject.set(t.projectId, list);
    });
  const ecomRows = Array.from(ecomByProject.entries()).map(([pid, list]) => {
    const p = projects.find((x) => x.id === pid);
    const photo = list.filter((t) => t.category === 'photo' && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const video = list.filter((t) => t.category === 'video' && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const cost = list.filter((t) => t.category === 'pre-production').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return [
      p?.title || '', p?.productType || p?.projectType || '',
      PROJECT_STATUS_LABEL[p?.status || ''] || p?.status || '', p?.deadline || '',
      photo, video, cost, list.length,
    ];
  });

  return {
    syncedAt: new Date().toLocaleString('vi-VN'),
    month,
    sheets: {
      [`KPI ${month}`]: {
        headers: ['Thành viên', 'Vai trò', 'Project ảnh', 'Video', 'DNTT', 'Tổng SL', 'Chỉ tiêu', 'KPI (%)', 'Số project'],
        rows: kpiRows,
      },
      [`Ecom ${month}`]: {
        headers: ['Dự án', 'Loại SP', 'Trạng thái', 'Deadline', 'Ảnh', 'Video', 'Chi phí (VND)', 'Số task'],
        rows: ecomRows,
      },
      Projects: {
        headers: ['Tên project', 'Loại SP', 'Trạng thái', 'Deadline', 'Target ảnh', 'Target video', 'Ảnh xong', 'Video xong', 'Điểm chất lượng'],
        rows: projectRows,
      },
      [`Tasks ${month}`]: {
        headers: ['Ngày báo cáo', 'Thành viên', 'Project', 'Loại', 'Tên task', 'Số lượng', 'Trạng thái'],
        rows: taskRows,
      },
    },
  };
}

/** POST to Apps Script webhook. No headers → text/plain → no CORS preflight. */
export async function postToWebhook(url: string, payload: SheetsPayload): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
  try {
    const data = await res.json();
    if (data.ok) {
      return { ok: true, message: `✅ Đã đồng bộ ${data.rows ?? ''} dòng vào Google Sheet` };
    }
    return { ok: false, message: data.error || 'Webhook trả về lỗi không xác định' };
  } catch {
    return res.ok
      ? { ok: true, message: '✅ Đã gửi dữ liệu (không đọc được phản hồi)' }
      : { ok: false, message: `Lỗi HTTP ${res.status}` };
  }
}
