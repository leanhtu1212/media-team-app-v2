import type { Member, Project, Task, Report, Tag } from '../types';
import {
  calculateTeamKpi, ecomProjectIdSet, teamTypeTotals, individualKpi, teamAggregate,
  type MemberKpi, type ProjectClass, type TypeTotals,
} from './kpi';
import { monthRange, formatDateTime, shiftMonth } from './utils';

const CLASS_LABEL: Record<ProjectClass, string> = {
  inhouse: 'Inhouse',
  outsource: 'Outsource',
  ecom: 'Ecom',
};

type Cell = string | number;

/**
 * 1 bảng trong 1 tab. Nhiều section cùng tab được xếp dọc, cách nhau 2 dòng trống.
 * `title` rỗng = bảng nằm ngay từ dòng 1 (bắt buộc cho tab báo cáo app cũ — dashboard
 * "Data Media" đọc header ở dòng 1, chèn thêm dòng tiêu đề là hỏng).
 */
export interface SheetSection {
  title: string;
  headers: string[];
  rows: Cell[][];
  /** Mô tả ngắn hiện ở phần xem trước trong Cài đặt (không gửi lên sheet). */
  note?: string;
}

export interface SheetBlock {
  sections: SheetSection[];
}

export interface SheetsPayload {
  syncedAt: string;
  month: string;
  sheets: Record<string, SheetBlock>;
}

/** Tổng số dòng dữ liệu của 1 tab (không tính header/tiêu đề). */
export const blockRowCount = (b: SheetBlock) => b.sections.reduce((s, sec) => s + sec.rows.length, 0);

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const sumAmt = (list: Task[]) => list.reduce((s, t) => s + (Number(t.amount) || 0), 0);

/**
 * Payload đồng bộ Google Sheet — CÙNG CÔNG THỨC với trang Hiệu suất:
 * dùng chung `calculateTeamKpi` / `teamTypeTotals` nên số trên sheet luôn khớp số trên web.
 * Sheet nào đổi công thức thì phải sửa ở `lib/kpi.ts`, không tự tính lại ở đây.
 */
export function buildSheetsPayload(
  month: string,
  members: Member[],
  projects: Project[],
  allTasks: Task[],
  reports: Report[],
  tags: Tag[] = [],
): SheetsPayload {
  const ecomIds = ecomProjectIdSet(projects, tags);
  const projById = new Map(projects.map((p) => [p.id, p]));
  const memberByUid = new Map(members.map((m) => [m.uid || m.id, m]));
  const [monthStart, monthEnd] = monthRange(month);

  const allKpi = calculateTeamKpi(members, month, allTasks, projects, reports);
  const kpi = individualKpi(allKpi); // mọi thành viên tính việc, admin cũng là 1 dòng như editor
  const teamRow = teamAggregate(allKpi);
  const prevByUid = new Map(
    calculateTeamKpi(members, shiftMonth(month, -1), allTasks, projects, reports).map((k) => [k.uid, k]),
  );

  const typeTotals = teamTypeTotals(allTasks, projects, ecomIds, month);
  const totalTotals: TypeTotals = {
    photos: 0, videos: 0, cost: 0, photoTasks: [], videoTasks: [], costTasks: [],
  };
  (['inhouse', 'outsource', 'ecom'] as ProjectClass[]).forEach((cls) => {
    const t = typeTotals[cls];
    totalTotals.photos += t.photos;
    totalTotals.videos += t.videos;
    totalTotals.cost += t.cost;
    totalTotals.photoTasks.push(...t.photoTasks);
    totalTotals.videoTasks.push(...t.videoTasks);
    totalTotals.costTasks.push(...t.costTasks);
  });

  // ── (1) Tổng quan sản lượng: đúng 4 ô ở đầu trang Hiệu suất ──
  const overviewRow = (label: string, t: TypeTotals): Cell[] => [
    label, t.photoTasks.length, t.photos, t.videos, t.videoTasks.length, t.cost, t.costTasks.length,
  ];
  const overviewRows: Cell[][] = [
    overviewRow('Tổng team', totalTotals),
    ...(['inhouse', 'outsource', 'ecom'] as ProjectClass[]).map((cls) => overviewRow(CLASS_LABEL[cls], typeTotals[cls])),
  ];

  // ── (2) Bảng KPI thành viên: y hệt cột trên web + dòng tổng & KPI team ──
  const kpiRows: Cell[][] = kpi.map((m, i) => {
    const prev = prevByUid.get(m.uid);
    return [
      i + 1, m.username, m.title || m.role, m.role,
      m.photoScore, m.videoCount, m.outsourceScore, m.outputCount,
      m.hasTarget ? m.kpiOutputTarget : '',
      m.hasTarget ? m.finalKPI : '',
      prev?.hasTarget ? prev.finalKPI : '',
      prev && m.hasTarget && prev.hasTarget ? round1(m.finalKPI - prev.finalKPI) : '',
      m.projectCount,
    ];
  });
  // TỔNG TEAM = cộng mọi thành viên (admin + editor), chỉ tiêu cũng gồm cả admin → so được với 100%.
  if (teamRow) {
    kpiRows.push([
      '', 'TỔNG TEAM', `${kpi.length} thành viên`, '',
      teamRow.photoScore, teamRow.videoCount, teamRow.outsourceScore, teamRow.outputCount,
      teamRow.kpiOutputTarget,
      teamRow.hasTarget ? teamRow.finalKPI : '',
      '', '', teamRow.projectCount,
    ]);
  }

  // Dòng phụ: trung bình KPI cá nhân (chỉ người đã được đặt chỉ tiêu) — khác với KPI team ở trên.
  const rated = kpi.filter((k) => k.hasTarget);
  kpiRows.push([
    '', 'TB KPI CÁ NHÂN', `${rated.length} người có chỉ tiêu`, '',
    '', '', '', '', '',
    rated.length ? round1(rated.reduce((s, k) => s + k.finalKPI, 0) / rated.length) : '',
    '', '', '',
  ]);

  // ── (3) Phân tích chi phí: pre-production non-Ecom trong tháng, gom theo dự án ──
  const costTasks = allTasks.filter(
    (t) => t.category === 'pre-production' && (t.reportDate || '').startsWith(month)
      && !ecomIds.has(t.projectId) && projById.has(t.projectId),
  );
  const costByProject = new Map<string, Task[]>();
  costTasks.forEach((t) => {
    const l = costByProject.get(t.projectId) || [];
    l.push(t);
    costByProject.set(t.projectId, l);
  });
  const costRows: Cell[][] = Array.from(costByProject.entries())
    .sort((a, b) => sumAmt(b[1]) - sumAmt(a[1]))
    .flatMap(([pid, list]) => list
      .sort((a, b) => (a.reportDate || '').localeCompare(b.reportDate || ''))
      .map((t) => [
        t.reportDate || '', projById.get(pid)?.title || '', t.title || '',
        Number(t.amount) || 0, t.dntt ? 'Đã duyệt' : 'Chưa duyệt',
        memberByUid.get(t.createdBy || '')?.username || '',
      ] as Cell[]));

  // ── (4) Tab báo cáo theo tháng (định dạng app cũ) — nguồn cho dashboard "Data Media" ──
  const reporterEmail = (createdBy?: string, fallback?: string) =>
    fallback || memberByUid.get(createdBy || '')?.email || '';
  const inMonth = (d?: string) => { const s = d || ''; return s >= monthStart && s <= monthEnd; };

  const reportRecords = reports
    .filter((r) => inMonth(r.reportDate))
    .map((r) => {
      const qty = Number(r.quantity) || 0;
      return {
        date: r.reportDate || '',
        row: [
          r.id || '', r.reportDate || '', reporterEmail(r.createdBy, r.userEmail),
          r.content || '', projById.get(r.projectId || '')?.title || '', formatDateTime(r.createdAt),
          r.outputType === 'photo' ? qty : 0, r.outputType === 'video' ? qty : 0, 0,
          r.reportType === 'manual' ? 'Thủ công' : 'Tự động',
        ] as Cell[],
      };
    });

  const dnttRecords = allTasks
    .filter((t) => t.category === 'pre-production' && t.dntt && inMonth(t.reportDate) && projById.has(t.projectId))
    .map((t) => ({
      date: t.reportDate || '',
      row: [
        t.id || '', t.reportDate || '', reporterEmail(t.createdBy),
        t.title || '', projById.get(t.projectId)?.title || '', formatDateTime(t.createdAt),
        0, 0, Number(t.amount) || 0, 'Tự động',
      ] as Cell[],
    }));

  const baoCaoRows = [...reportRecords, ...dnttRecords]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => x.row);
  const [yyyy, mm] = month.split('-');
  const baoCaoTabName = `Bao_cao_thang_${Number(mm)}_${yyyy} web`;

  return {
    syncedAt: new Date().toLocaleString('vi-VN'),
    month,
    sheets: {
      // Cả 3 bảng của tab Hiệu suất nằm CHUNG 1 tab, xếp dọc.
      [`Tổng quan ${month}`]: {
        sections: [
          {
            title: `1. SẢN LƯỢNG THEO LOẠI DỰ ÁN — Tháng ${Number(mm)}/${yyyy}`,
            headers: ['Nhóm', 'Task ảnh', 'Số ảnh', 'Số video', 'Task video', 'Chi phí (VND)', 'Số khoản chi'],
            rows: overviewRows,
            note: 'Sản lượng sản xuất thô của cả team, tách Inhouse / Outsource / Ecom (khớp 4 ô đầu trang Hiệu suất)',
          },
          {
            title: '2. KPI THÀNH VIÊN',
            headers: ['#', 'Thành viên', 'Chức danh', 'Vai trò', 'Ảnh (project)', 'Video', 'Outsource', 'Sản lượng', 'Chỉ tiêu', 'KPI (%)', 'KPI T.trước (%)', 'Chênh lệch', 'Số project'],
            rows: kpiRows,
            note: 'Xếp hạng mọi thành viên (admin + editor đều có chỉ tiêu riêng) → TỔNG TEAM = KPI team → TB KPI cá nhân',
          },
          {
            title: '3. PHÂN TÍCH CHI PHÍ',
            headers: ['Ngày', 'Dự án', 'Khoản chi', 'Số tiền (VND)', 'DNTT', 'Người tạo'],
            rows: costRows,
            note: 'Chi phí tiền kỳ non-Ecom trong tháng, xếp theo dự án tốn nhiều nhất',
          },
        ],
      },
      [baoCaoTabName]: {
        sections: [{
          title: '', // header PHẢI ở dòng 1 — dashboard "Data Media" đọc theo vị trí
          headers: ['ID', 'Ngày', 'Người báo cáo', 'Nội dung', 'Dự án', 'Thời gian tạo', 'Số Ảnh', 'Số Video', 'Tiền DNTT', 'Loại báo cáo'],
          rows: baoCaoRows,
          note: 'Định dạng app cũ — nguồn cho dashboard "Data Media", đừng đổi cột',
        }],
      },
    },
  };
}

/** Vài con số chính để hiện xem trước trong Cài đặt (không gửi lên sheet). */
export interface SheetsPreview {
  photos: number;
  videos: number;
  cost: number;
  teamOutput: number;
  teamTarget: number;
  teamKpi: number | null;
  memberCount: number;
}

export function sheetsPreview(
  month: string,
  members: Member[],
  projects: Project[],
  allTasks: Task[],
  reports: Report[],
  tags: Tag[] = [],
): SheetsPreview {
  const ecomIds = ecomProjectIdSet(projects, tags);
  const tt = teamTypeTotals(allTasks, projects, ecomIds, month);
  const allKpi = calculateTeamKpi(members, month, allTasks, projects, reports);
  const kpi = individualKpi(allKpi);
  const team: MemberKpi | undefined = teamAggregate(allKpi);
  const teamOutput = team ? team.outputCount : round2(kpi.reduce((s, k) => s + k.outputCount, 0));
  const teamTarget = team ? team.kpiOutputTarget : kpi.reduce((s, k) => s + k.kpiOutputTarget, 0);
  return {
    photos: tt.inhouse.photos + tt.outsource.photos + tt.ecom.photos,
    videos: tt.inhouse.videos + tt.outsource.videos + tt.ecom.videos,
    cost: tt.inhouse.cost + tt.outsource.cost + tt.ecom.cost,
    teamOutput,
    teamTarget,
    teamKpi: teamTarget > 0 ? round1((teamOutput / teamTarget) * 100) : null,
    memberCount: kpi.length,
  };
}

/**
 * Trải nhiều section thành 1 bảng phẳng `{headers, rows}` cho Apps Script BẢN CŨ
 * (bản cũ chỉ biết đọc headers/rows, gặp payload sections sẽ lỗi "Cannot read ... 'length'").
 * Bản mới ưu tiên `sections` nên hai bên không đá nhau; giữ lại để không bắt buộc Deploy ngay.
 */
function flattenSections(sections: SheetSection[]): { headers: string[]; rows: Cell[][] } {
  const width = Math.max(...sections.map((s) => s.headers.length));
  const pad = (r: Cell[]): Cell[] => (r.length >= width ? r.slice(0, width) : [...r, ...Array(width - r.length).fill('')]);
  // Hàng tiêu đề KHÔNG được có ô rỗng: nếu tab đã bị chuyển thành "Bảng" (Table) thì Google Sheets
  // báo lỗi "Ô hàng tiêu đề của bảng phải có giá trị" và huỷ cả lần đồng bộ.
  const padHeader = (h: string[]): string[] =>
    Array.from({ length: width }, (_, i) => h[i] || `Cột ${i + 1}`);
  const headers = padHeader(sections[0].headers);
  const rows: Cell[][] = [...sections[0].rows.map(pad)];
  for (const sec of sections.slice(1)) {
    rows.push(pad([]), pad([sec.title]), padHeader(sec.headers), ...sec.rows.map(pad));
  }
  return { headers, rows };
}

/** POST to Apps Script webhook. No headers → text/plain → no CORS preflight. */
export async function postToWebhook(url: string, payload: SheetsPayload): Promise<{ ok: boolean; message: string }> {
  // `note` chỉ để hiện xem trước trên web — không gửi lên sheet cho nhẹ payload.
  const body = {
    ...payload,
    sheets: Object.fromEntries(
      Object.entries(payload.sheets).map(([name, b]) => [name, {
        sections: b.sections.map((s) => ({ title: s.title, headers: s.headers, rows: s.rows })),
        ...flattenSections(b.sections), // dự phòng cho Apps Script bản cũ
      }]),
    ),
  };
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
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
