import type { Member, Project, Task, Report, Tag, DailyContent } from '../types';
import { isProjectFinished, normalize, projectMonth } from './utils';
import { projectTagIds, tagLevel, type TagLevel } from './tags';

/** Task ảnh/video được coi là đã xong (đã hoàn thành hoặc đã duyệt DNTT). */
const isDone = (t: Task) => t.status === 'completed' || !!t.dntt;

/**
 * Tỉ lệ đóng góp của từng người trong 1 nhóm task (tổng = 1).
 * Điểm project được CHIA THEO CÔNG SỨC chứ không dồn hết cho người làm nhiều nhất:
 * ai làm 49% vẫn được 0,49 phần thay vì mất trắng.
 */
function contributionShares(tasks: Task[]): Map<string, number> {
  const byMember = qtyByUid(tasks);
  const total = [...byMember.values()].reduce((s, q) => s + q, 0);
  if (total <= 0) return new Map();
  return new Map([...byMember].map(([uid, q]) => [uid, q / total]));
}

/** Số lượng mỗi người đóng góp trong nhóm task. */
function qtyByUid(tasks: Task[]): Map<string, number> {
  const byMember = new Map<string, number>();
  for (const t of tasks) {
    const uid = t.createdBy || '';
    byMember.set(uid, (byMember.get(uid) || 0) + (Number(t.quantity) || 1));
  }
  return byMember;
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
 * `shares` = tỉ lệ công sức từng người → điểm chia theo đóng góp, tổng vẫn đúng bằng `fraction`.
 */
export function photoProjectFraction(
  proj: Project,
  allTasks: Task[],
  month: string,
): { fraction: number; shares: Map<string, number>; done: number; byUid: Map<string, number> } {
  const { before, inMonth, inMonthTasks } = splitByMonth(allTasks, proj.id, ['photo'], month);
  const target = proj.photoTarget || 0;
  const fraction = photoCumulative(before + inMonth, target) - photoCumulative(before, target);
  return { fraction: Math.max(0, fraction), shares: contributionShares(inMonthTasks), done: inMonth, byUid: qtyByUid(inMonthTasks) };
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
): { fraction: number; shares: Map<string, number>; done: number; target: number; byUid: Map<string, number> } {
  const { before, inMonth, inMonthTasks, lastMonth } = splitByMonth(allTasks, proj.id, ['photo', 'video'], month);
  const target = (proj.photoTarget || 0) + (proj.videoTarget || 0);
  const cum = (qty: number) => (target > 0 ? Math.min(1, qty / target) : 0);
  const fraction = target > 0
    ? cum(before + inMonth) - cum(before)
    : (isProjectFinished(proj.status) && lastMonth === month ? 1 : 0);
  return {
    fraction: Math.max(0, fraction),
    shares: contributionShares(inMonthTasks),
    done: inMonth,
    target,
    byUid: qtyByUid(inMonthTasks),
  };
}

/**
 * Tag Mảng tên "Event" — dự án gắn tag này tính KHÁC: cả dự án chỉ 1 điểm, chia đôi
 * 0,5 Ảnh + 0,5 Video thay vì đếm đầu ảnh/video (buổi event ra hàng trăm ảnh, đếm đầu là vô nghĩa).
 * Nhận diện theo TÊN không dấu nên đổi màu/sửa tên hoa-thường vẫn đúng; đổi hẳn tên tag thì luật tắt.
 */
export const eventTagIdSet = (tags: Tag[]) =>
  new Set(tags.filter((t) => tagLevel(t) === 'mang' && normalize(t.name) === 'event').map((t) => t.id));

export type ProjectClass = 'inhouse' | 'outsource';

/**
 * Phân loại 1 project — CHỈ theo projectType (cấp 1).
 * Mảng (Ecom/Content/Trade/Brand) là TAG, không còn ghi đè phân loại này nữa:
 * dự án inhouse gắn tag Ecom vẫn là inhouse. Xem lib/tags.ts.
 */
export function projectClass(proj?: Project): ProjectClass {
  return (proj?.projectType || 'inhouse') === 'outsource' ? 'outsource' : 'inhouse';
}

export interface TypeTotals {
  photos: number;
  videos: number;
  cost: number;
  photoTasks: Task[];
  videoTasks: Task[];
  costTasks: Task[];
  /** Video trả trong Daily Content (không phải task) — đã cộng vào `videos`. */
  videoContents: ContentVideo[];
}

/** Một video Daily Content đã trả, quy về dạng đếm được như task. */
export interface ContentVideo {
  reportId: string;
  contentId: string;
  date: string;
  title: string;
  qty: number;
  projectId?: string;
  /** Tag Mảng gắn trên doc content — bảng theo tag dùng đến. */
  tagId?: string;
  createdBy?: string;
}

/**
 * Hệ số quy đổi sản lượng theo DẠNG CONTENT: Thumb Sub thì 2 video trả mới bằng 1 video
 * (mỗi video = 0,5), Full Video giữ 1-1. Doc cũ chưa có field ⇒ Full Video.
 * Chỉ đụng tới con số SẢN LƯỢNG — tiến độ "x/y video" của content vẫn đếm đầu video thật.
 */
export const contentVideoWeight = (c?: DailyContent) => (c?.contentFormat === 'thumb-sub' ? 0.5 : 1);

/**
 * Video trả trong Daily Content của tháng — nguồn là BÁO CÁO AUTO có `relatedContentId`
 * (đúng nguồn mà KPI cá nhân đang dùng), tra ngược sang doc content để lấy tên + projectId.
 * Phải dùng chung nguồn này, không thì bảng sản lượng lệch với cột Video của bảng KPI.
 */
export function contentVideoEntries(
  reports: Report[],
  dailyContent: DailyContent[],
  month: string,
): ContentVideo[] {
  const byId = new Map(dailyContent.map((d) => [d.id, d]));
  return reports
    .filter((r) => (r.relatedContentId || '') !== '' && r.outputType === 'video' && (r.reportDate || '').startsWith(month))
    .map((r) => {
      const c = byId.get(r.relatedContentId || '');
      return {
        reportId: r.id,
        contentId: r.relatedContentId || '',
        date: r.reportDate,
        title: c?.title || r.content || 'Video nội dung',
        qty: (Number(r.quantity) || 1) * contentVideoWeight(c),
        projectId: c?.projectId,
        tagId: c?.tagId,
        createdBy: r.createdBy,
      };
    });
}

const blankTotals = (): TypeTotals => ({ photos: 0, videos: 0, cost: 0, photoTasks: [], videoTasks: [], costTasks: [], videoContents: [] });

/**
 * Cộng 1 task vào bucket theo đúng loại (ảnh/video/chi phí). Trả về false nếu task không tính.
 * `qtyOverride` = 0 dùng cho task của dự án EVENT: vẫn liệt kê trong drawer nhưng KHÔNG cộng
 * đầu ảnh/video, vì cả dự án Event chỉ quy ra 0,5 ảnh + 0,5 video (cộng riêng ở dưới).
 */
function addTask(bucket: TypeTotals, t: Task, qtyOverride?: number): boolean {
  const qty = qtyOverride ?? (Number(t.quantity) || 1);
  if (t.category === 'photo' && isDone(t)) {
    bucket.photos += qty;
    bucket.photoTasks.push(t);
  } else if (t.category === 'video' && isDone(t)) {
    bucket.videos += qty;
    bucket.videoTasks.push(t);
  } else if (t.category === 'pre-production') {
    bucket.cost += Number(t.amount) || 0;
    bucket.costTasks.push(t);
  } else return false;
  return true;
}

/**
 * Dự án EVENT trong 1 tháng: cả dự án đáng `fraction` điểm, tách thành nửa ẢNH và nửa VIDEO.
 *  - Có cả ảnh lẫn video trong tháng → 0,5 / 0,5.
 *  - Chỉ có một bên → bên đó ăn trọn `fraction` (event chỉ chụp ảnh thì tính như dự án ảnh
 *    bình thường, không việc gì phải mất nửa điểm).
 * Mỗi nửa chia RIÊNG theo công sức của ĐÚNG loại đó: 0,5 ảnh về người chụp, 0,5 video về
 * người quay — không trộn chung một tỉ lệ đóng góp.
 */
function eventSplit(proj: Project, allTasks: Task[], month: string) {
  const { fraction } = outsourceProjectFraction(proj, allTasks, month);
  const ofCat = (cat: string) =>
    allTasks.filter((t) => t.projectId === proj.id && t.category === cat && isDone(t) && (t.reportDate || '').startsWith(month));
  const photoTasks = ofCat('photo');
  const videoTasks = ofCat('video');
  const both = photoTasks.length > 0 && videoTasks.length > 0;
  return {
    fraction,
    photoScore: photoTasks.length ? (both ? fraction / 2 : fraction) : 0,
    videoScore: videoTasks.length ? (both ? fraction / 2 : fraction) : 0,
    photoShares: contributionShares(photoTasks),
    videoShares: contributionShares(videoTasks),
    photoQtyByUid: qtyByUid(photoTasks),
    photoDone: sumQty(photoTasks),
  };
}

/** Task ảnh/video của dự án Event — đếm bằng điểm quy đổi chứ không đếm đầu. */
const isEventOutput = (t: Task) => t.category === 'photo' || t.category === 'video';

/** Cộng 1 video Daily Content vào bucket. */
function addContentVideo(bucket: TypeTotals, cv: ContentVideo) {
  bucket.videos += cv.qty;
  bucket.videoContents.push(cv);
}

/**
 * Loại của 1 video content: nội dung có gắn dự án thì theo loại dự án đó,
 * nội dung rời (đa số) coi là INHOUSE — team tự sản xuất.
 */
function contentClass(cv: ContentVideo, projById: Map<string, Project>): ProjectClass {
  const proj = cv.projectId ? projById.get(cv.projectId) : undefined;
  return proj ? projectClass(proj) : 'inhouse';
}

/**
 * Tổng sản lượng team trong tháng, tách theo loại dự án (inhouse/outsource).
 * `reports` + `dailyContent` (tuỳ chọn) để cộng cả VIDEO TRẢ TRONG DAILY CONTENT — đó cũng là
 * sản lượng team làm ra, và cột Video của bảng KPI vốn đã tính; không truyền vào thì
 * bảng sản lượng sẽ thấp hơn bảng KPI đúng bằng số video content.
 */
export function teamTypeTotals(
  allTasks: Task[],
  projects: Project[],
  month: string,
  reports: Report[] = [],
  dailyContent: DailyContent[] = [],
  tags: Tag[] = [],
): Record<ProjectClass, TypeTotals> {
  const projById = new Map(projects.map((p) => [p.id, p]));
  const eventTagIds = eventTagIdSet(tags);
  const isEventProj = (p: Project) => projectClass(p) === 'inhouse' && projectTagIds(p).some((x) => eventTagIds.has(x));
  const res: Record<ProjectClass, TypeTotals> = { inhouse: blankTotals(), outsource: blankTotals() };
  const eventProjects = new Map<string, Project>();
  for (const t of allTasks) {
    if (!(t.reportDate || '').startsWith(month)) continue;
    const proj = projById.get(t.projectId);
    if (!proj) continue; // bỏ task mồ côi (project đã xoá)
    const ev = isEventProj(proj) && isEventOutput(t);
    if (ev && isDone(t)) eventProjects.set(proj.id, proj);
    addTask(res[projectClass(proj)], t, ev ? 0 : undefined);
  }
  // Dự án Event: 0,5 ảnh + 0,5 video theo tiến độ, thay cho việc đếm đầu ảnh/video
  for (const proj of eventProjects.values()) {
    const ev = eventSplit(proj, allTasks, month);
    res.inhouse.photos += ev.photoScore;
    res.inhouse.videos += ev.videoScore;
  }
  for (const cv of contentVideoEntries(reports, dailyContent, month)) {
    addContentVideo(res[contentClass(cv, projById)], cv);
  }
  return res;
}

/* ================= Video cần làm trong tháng ================= */

export interface VideoDemandItem {
  id: string;
  kind: 'project' | 'content';
  title: string;
  date: string;   // deadline dự án / ngày đăng của content
  need: number;
  done: number;
}

export interface VideoDemand {
  need: number;
  done: number;
  remain: number;
  pct: number;    // % hoàn thành (0..100)
  items: VideoDemandItem[];
}

/**
 * Nhu cầu VIDEO của tháng — gộp 2 nguồn:
 *   1. Dự án thuộc tháng (theo projectMonth) có `videoTarget > 0` → cần = videoTarget,
 *      xong = số video đã giao của dự án đó (cả vòng đời, chặn trần ở target).
 *   2. Daily Content có `dueDate` trong tháng → cần = quantity, xong = số video con đã tick.
 * Phần Daily Content được NHÂN HỆ SỐ dạng content (contentVideoWeight): content Thumb Sub
 * đặt 5 clip = 2,5 video cần làm, trả 2 clip = 1 video xong — cùng thước đo với sản lượng KPI
 * nên "cần làm" và "đã làm" so được với nhau. Vì vậy các số ở đây CÓ THỂ LẺ 0,5 → hiển thị
 * qua fmtScore. Task video của dự án không có hệ số, giữ nguyên số lượng.
 */
export function monthVideoDemand(
  projects: Project[],
  dailyContent: DailyContent[],
  allTasks: Task[],
  month: string,
): VideoDemand {
  const items: VideoDemandItem[] = [];

  for (const p of projects) {
    const need = Number(p.videoTarget) || 0;
    if (need <= 0 || projectMonth(p) !== month) continue;
    const delivered = allTasks
      .filter((t) => t.projectId === p.id && t.category === 'video' && isDone(t))
      .reduce((sum, t) => sum + (Number(t.quantity) || 1), 0);
    items.push({
      id: `project:${p.id}`, kind: 'project', title: p.title,
      date: p.deadline || '', need, done: Math.min(need, delivered),
    });
  }

  for (const d of dailyContent) {
    if (!(d.dueDate || '').startsWith(month)) continue;
    const w = contentVideoWeight(d);
    const need = Math.max(1, Number(d.quantity) || 1) * w;
    const done = (d.items || []).filter((i) => i.done).length * w;
    items.push({
      id: `content:${d.id}`, kind: 'content', title: d.title,
      date: d.dueDate || '', need, done: Math.min(need, done),
    });
  }

  const need = round2(items.reduce((s, i) => s + i.need, 0));
  const done = round2(items.reduce((s, i) => s + i.done, 0));
  return {
    need,
    done,
    remain: Math.max(0, round2(need - done)),
    pct: need > 0 ? round1((done / need) * 100) : 0,
    items: items.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')),
  };
}

export interface TagTotals {
  tagId: string; // '' = dòng "Chưa gắn tag"
  name: string;
  color: string;
  level: TagLevel;
  byClass: Record<ProjectClass, TypeTotals>;
  projectCount: Record<ProjectClass, number>;
}

/**
 * Sản lượng trong tháng gộp theo TAG, tách cột Inhouse / Outsource.
 * Nguồn tag: dự án lấy `projectTagIds`, video Daily Content lấy tag riêng của nội dung
 * (+ tag dự án nếu nội dung có gắn dự án) — nên bảng có cả dòng tag cấp "Nội dung".
 * Đây là bảng BÓC TÁCH, không phải phân hoạch: 1 dự án gắn nhiều tag được cộng vào
 * NHIỀU dòng nên tổng các dòng KHÔNG bằng tổng team — đừng "sửa" cho khớp.
 * Dùng chung cho trang Hiệu suất và Google Sheets (sheets.ts không tự tính lại).
 */
export function tagTypeTotals(
  allTasks: Task[],
  projects: Project[],
  tags: Tag[],
  month: string,
  reports: Report[] = [],
  dailyContent: DailyContent[] = [],
): TagTotals[] {
  const projById = new Map(projects.map((p) => [p.id, p]));
  const blankRow = (tagId: string, name: string, color: string, level: TagLevel): TagTotals => ({
    tagId, name, color, level,
    byClass: { inhouse: blankTotals(), outsource: blankTotals() },
    projectCount: { inhouse: 0, outsource: 0 },
  });

  const rows = new Map<string, TagTotals>();
  // Tag cấp 'note' chỉ dùng cho ghi chú lịch, không bao giờ có sản lượng → bỏ khỏi bảng.
  // Daily Content dùng chung tag Mảng nên video content gộp thẳng vào dòng Ecom/Content/…
  for (const t of tags) {
    const lv = tagLevel(t);
    if (lv === 'note') continue;
    rows.set(t.id, blankRow(t.id, t.name, t.color, lv));
  }
  rows.set('', blankRow('', 'Chưa gắn tag', '', ''));

  const eventTagIds = eventTagIdSet(tags);
  const isEventProj = (p: Project) => projectClass(p) === 'inhouse' && projectTagIds(p).some((x) => eventTagIds.has(x));

  const seen = new Map<string, Set<string>>(); // key `${tagId}|${cls}` → set projectId
  const eventProjects = new Map<string, Project>();
  for (const t of allTasks) {
    if (!(t.reportDate || '').startsWith(month)) continue;
    const proj = projById.get(t.projectId);
    if (!proj) continue;
    const cls = projectClass(proj);
    const ev = isEventProj(proj) && isEventOutput(t);
    if (ev && isDone(t)) eventProjects.set(proj.id, proj);
    // id mồ côi (tag đã xoá) rơi về dòng "Chưa gắn tag" như dự án không tag
    const ids = projectTagIds(proj).filter((id) => rows.has(id));
    for (const id of ids.length ? ids : ['']) {
      const row = rows.get(id)!;
      if (!addTask(row.byClass[cls], t, ev ? 0 : undefined)) continue;
      const key = `${id}|${cls}`;
      const set = seen.get(key) || new Set<string>();
      set.add(proj.id);
      seen.set(key, set);
    }
  }
  // Dự án Event: mỗi dự án quy ra 0,5 ảnh + 0,5 video (× tiến độ trong tháng), cộng vào MỌI dòng
  // tag của dự án đó — giống cách task được bóc tách ở trên.
  for (const proj of eventProjects.values()) {
    const ev = eventSplit(proj, allTasks, month);
    if (ev.photoScore <= 0 && ev.videoScore <= 0) continue;
    const ids = projectTagIds(proj).filter((id) => rows.has(id));
    for (const id of ids.length ? ids : ['']) {
      const bucket = rows.get(id)!.byClass.inhouse;
      bucket.photos += ev.photoScore;
      bucket.videos += ev.videoScore;
    }
  }
  // Video Daily Content: cộng vào TAG RIÊNG của nội dung (ô Tag trong form Daily Content) và,
  // nếu nội dung có gắn dự án, cộng thêm vào TAG CỦA DỰ ÁN đó. Không tag nào tra được →
  // dồn vào dòng "Chưa gắn tag". Trước đây chỉ đọc tag dự án nên nội dung rời (đa số) biến mất
  // khỏi mọi dòng tag dù bản thân nó đã được gắn tag.
  for (const cv of contentVideoEntries(reports, dailyContent, month)) {
    const proj = cv.projectId ? projById.get(cv.projectId) : undefined;
    const cls = proj ? projectClass(proj) : 'inhouse';
    const ids = Array.from(new Set([
      ...(cv.tagId ? [cv.tagId] : []),
      ...(proj ? projectTagIds(proj) : []),
    ])).filter((id) => rows.has(id));
    for (const id of ids.length ? ids : ['']) {
      addContentVideo(rows.get(id)!.byClass[cls], cv);
      if (proj) {
        const key = `${id}|${cls}`;
        const set = seen.get(key) || new Set<string>();
        set.add(proj.id);
        seen.set(key, set);
      }
    }
  }

  for (const row of rows.values()) {
    row.projectCount.inhouse = seen.get(`${row.tagId}|inhouse`)?.size || 0;
    row.projectCount.outsource = seen.get(`${row.tagId}|outsource`)?.size || 0;
  }

  // Thứ tự ổn định giữa các tháng: Loại → Mảng → dùng chung → chưa gắn, trong nhóm theo tên
  const rank = (r: TagTotals) => (r.tagId === '' ? 3 : r.level === 'loai' ? 0 : r.level === 'mang' ? 1 : 2);
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'vi'));
}

export interface PhotoProjectBreakdown {
  projectId: string;
  title: string;
  done: number; // ảnh CẢ TEAM làm trong tháng
  myDone: number; // ảnh của riêng người này
  target: number;
  fraction: number; // tiến độ project đạt được trong tháng (0..1)
  share: number; // tỉ lệ đóng góp của người này (0..1)
  earned: number; // điểm thực nhận = fraction × share
}

export interface OutsourceProjectBreakdown {
  projectId: string;
  title: string;
  done: number; // ảnh+video CẢ TEAM làm trong tháng
  myDone: number;
  target: number;
  fraction: number; // phần tiến độ project đạt được trong tháng (0..1)
  share: number;
  earned: number;
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
  isTeamAggregate: boolean; // true = dòng TỔNG TEAM tổng hợp (do teamAggregate tạo), không phải người thật
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
  dailyContent: DailyContent[] = [],
  tags: Tag[] = [],
): MemberKpi {
  const uid = member.uid || member.id;
  // Cần doc content để biết dạng (Thumb Sub = 0,5 video). Không truyền vào thì mọi video tính 1-1.
  const contentById = new Map(dailyContent.map((d) => [d.id, d]));
  const projOf = (id?: string) => (id ? projects.find((p) => p.id === id) : undefined);

  // BỎ TASK MỒ CÔI (project đã xoá): teamTypeTotals và các drawer ở trang Hiệu suất đều bỏ,
  // nếu ở đây vẫn đếm thì video mồ côi cộng thẳng vào sản lượng → KPI cao hơn bảng tổng.
  const userTasks = allTasks.filter(
    (t) => t.createdBy === uid && (t.reportDate || '').startsWith(month) && !!projOf(t.projectId),
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
  // Dự án EVENT (inhouse): cả dự án chỉ đáng 1 điểm chia đôi 0,5 Ảnh + 0,5 Video — xem eventIds.
  // Tách khỏi luồng ảnh/video thường để không bị tính hai lần.
  const eventTagIds = eventTagIdSet(tags);
  const isEvent = (id?: string) => {
    const p = projOf(id);
    return !!p && !isOutsource(id) && projectTagIds(p).some((x) => eventTagIds.has(x));
  };

  // ── Ảnh: tổng project INHOUSE hoàn thành (phân số), tính cho người đóng góp nhiều nhất ──
  //    (project outsource KHÔNG tính theo ảnh — chỉ tính số project ở mục Outsource bên dưới)
  const photoTasks = userTasks.filter((t) => t.category === 'photo' && isDone(t) && !isOutsource(t.projectId) && !isEvent(t.projectId));
  // photoCount chỉ để hiển thị "đã chụp bao nhiêu ảnh" → đếm cả ảnh của dự án Event
  const photoCount = userTasks
    .filter((t) => t.category === 'photo' && isDone(t) && !isOutsource(t.projectId))
    .reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const photoProjectIds = Array.from(new Set(photoTasks.map((t) => t.projectId).filter(Boolean))) as string[];
  const photoProjects: PhotoProjectBreakdown[] = [];
  let photoScoreRaw = 0;
  for (const pid of photoProjectIds) {
    const proj = projOf(pid);
    if (!proj) continue;
    const { fraction, shares, done, byUid } = photoProjectFraction(proj, allTasks, month);
    const share = shares.get(uid) || 0;
    const earned = fraction * share;
    if (earned > 0) {
      photoScoreRaw += earned;
      photoProjects.push({
        projectId: pid, title: proj.title, done, myDone: byUid.get(uid) || 0,
        target: proj.photoTarget || 0, fraction: round2(fraction), share: round2(share), earned: round2(earned),
      });
    }
  }
  // ── Event: cả dự án đáng 1 điểm, tách nửa ẢNH và nửa VIDEO (xem eventSplit) ──
  //    Không đếm đầu ảnh/video nữa (một buổi event ra vài trăm ảnh + chục video thì đếm đầu là vô nghĩa).
  //    Nửa ảnh chia theo công sức CHỤP, nửa video chia theo công sức QUAY: người quay không ăn
  //    ké điểm ảnh và ngược lại.
  const eventProjectIds = Array.from(new Set(
    userTasks.filter((t) => (t.category === 'photo' || t.category === 'video') && isDone(t) && isEvent(t.projectId))
      .map((t) => t.projectId).filter(Boolean),
  )) as string[];
  let eventPhotoScore = 0;
  let eventVideoScore = 0;
  for (const pid of eventProjectIds) {
    const proj = projOf(pid);
    if (!proj) continue;
    const ev = eventSplit(proj, allTasks, month);
    const earnedPhoto = ev.photoScore * (ev.photoShares.get(uid) || 0);
    const earnedVideo = ev.videoScore * (ev.videoShares.get(uid) || 0);
    eventPhotoScore += earnedPhoto;
    eventVideoScore += earnedVideo;
    // Drawer Ảnh liệt kê phần ảnh; phần video nằm trong cột Video (không có drawer riêng)
    if (earnedPhoto > 0) {
      photoProjects.push({
        projectId: pid, title: `${proj.title} · Event`, done: ev.photoDone, myDone: ev.photoQtyByUid.get(uid) || 0,
        target: proj.photoTarget || 0, fraction: round2(ev.fraction),
        share: round2(ev.photoShares.get(uid) || 0), earned: round2(earnedPhoto),
      });
    }
  }

  const photoScore = round2(photoScoreRaw + eventPhotoScore);

  // ── Video: số lượng video hoàn thành trong tháng ──
  //    (a) video task dự án INHOUSE (bỏ outsource và Event)  (b) video trả trong Daily Content (báo cáo có relatedContentId)
  const taskVideoCount = userTasks
    .filter((t) => t.category === 'video' && isDone(t) && !isOutsource(t.projectId) && !isEvent(t.projectId))
    .reduce((s, t) => s + (Number(t.quantity) || 1), 0);
  const contentVideoCount = userReports
    .filter((r) => (r.relatedContentId || '') !== '' && r.outputType === 'video')
    .reduce((s, r) => s + (Number(r.quantity) || 1) * contentVideoWeight(contentById.get(r.relatedContentId || '')), 0);
  const videoCount = round2(taskVideoCount + contentVideoCount + eventVideoScore);

  // ── Outsource: chỉ tính % TIẾN ĐỘ PROJECT quản lý được trong tháng, KHÔNG tính số ảnh/video ──
  const workedOutsourceIds = Array.from(new Set(
    userTasks.filter((t) => (t.category === 'photo' || t.category === 'video') && isOutsource(t.projectId)).map((t) => t.projectId).filter(Boolean),
  )) as string[];
  const outsourceProjects: OutsourceProjectBreakdown[] = [];
  let outsourceScoreRaw = 0;
  for (const pid of workedOutsourceIds) {
    const proj = projOf(pid);
    if (!proj) continue;
    const { fraction, shares, done, target, byUid } = outsourceProjectFraction(proj, allTasks, month);
    const share = shares.get(uid) || 0;
    const earned = fraction * share;
    if (earned > 0) {
      outsourceScoreRaw += earned;
      outsourceProjects.push({
        projectId: pid, title: proj.title, done, myDone: byUid.get(uid) || 0,
        target, fraction: round2(fraction), share: round2(share), earned: round2(earned),
      });
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

/**
 * KPI của MỌI thành viên tính việc (admin + editor) — ai cũng là 1 dòng cá nhân với chỉ tiêu riêng.
 * Admin cũng phải được đặt `kpiOutput` ở Settings → KPI: sản lượng admin nằm ở tử số thì chỉ tiêu
 * admin phải nằm ở mẫu số, không thì KPI team luôn vượt 100% một cách giả tạo.
 */
export function calculateTeamKpi(
  members: Member[],
  month: string,
  allTasks: Task[],
  projects: Project[],
  reports: Report[],
  dailyContent: DailyContent[] = [],
  tags: Tag[] = [],
): MemberKpi[] {
  return members
    .filter((m) => m.role === 'admin' || m.role === 'editor')
    .map((m) => calculateMemberKpi(m, month, allTasks, projects, reports, dailyContent, tags))
    .sort((a, b) => b.finalKPI - a.finalKPI);
}

/** Chỉ các dòng KPI cá nhân (loại dòng tổng-team nếu lỡ lẫn vào) — dùng cho xếp hạng & cộng dồn. */
export const individualKpi = (list: MemberKpi[]) => list.filter((k) => !k.isTeamAggregate);

/**
 * Dòng TỔNG TEAM — cộng mọi thành viên (admin + editor), KPI = tổng sản lượng / tổng chỉ tiêu.
 * Tử số và mẫu số cùng phạm vi người nên con số này so được với 100%.
 */
export function teamAggregate(list: MemberKpi[]): MemberKpi | undefined {
  const rows = individualKpi(list);
  if (rows.length === 0) return undefined;
  const sum = (f: (k: MemberKpi) => number) => rows.reduce((s, k) => s + f(k), 0);
  const outputCount = round2(sum((k) => k.outputCount));
  const kpiOutputTarget = sum((k) => k.kpiOutputTarget);
  const teamKPI = kpiOutputTarget > 0 ? round1((outputCount / kpiOutputTarget) * 100) : 0;
  const projectIds = Array.from(new Set(rows.flatMap((k) => k.projectIds)));
  return {
    uid: '__team__',
    username: 'Cả team',
    email: '',
    role: 'team',
    photoCount: sum((k) => k.photoCount),
    photoScore: round2(sum((k) => k.photoScore)),
    photoProjects: rows.flatMap((k) => k.photoProjects),
    videoCount: round2(sum((k) => k.videoCount)),
    outsourceScore: round2(sum((k) => k.outsourceScore)),
    outsourceProjects: rows.flatMap((k) => k.outsourceProjects),
    dnttCount: sum((k) => k.dnttCount),
    outputCount,
    kpiOutputTarget,
    hasTarget: kpiOutputTarget > 0,
    outputKPI: teamKPI,
    finalKPI: teamKPI,
    projectCount: projectIds.length,
    projectIds,
    isTeamAggregate: true,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
