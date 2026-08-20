import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db, type User } from './firebase';
import { MAIN_TEAM_ID, genId, todayStr, formatVND } from './utils';
import { notify, displayName, diffLines, type DiffField } from './notify';
import type { Project, Task, Report, DailyContent, Note, Tag, TaskCategory, ContractPartner, ContractSettingsDoc } from '../types';
import { chuanHoa } from './contracts/naming';
import type { ContractForm } from './contracts/compute';

const teamPath = ['teams', MAIN_TEAM_ID] as const;

/* ---------- Nhãn dùng để dựng thông báo "sửa từ gì thành gì" ---------- */
const STATUS_LABEL_VI: Record<string, string> = {
  plan: 'Kế hoạch', 'pre-production': 'Tiền kỳ', 'post-production': 'Hậu kỳ', payment: 'Thanh toán', done: 'Hoàn thành',
};
const PROJECT_TYPE_LABEL_VI: Record<string, string> = { inhouse: 'Inhouse', outsource: 'Outsource' };
const CONTENT_STATUS_LABEL_VI: Record<string, string> = {
  planned: 'Chưa làm', 'in-progress': 'Đang làm', done: 'Xong', published: 'Đã đăng',
};
const CATEGORY_LABEL_VI: Record<string, string> = { photo: 'Ảnh', video: 'Video', 'pre-production': 'Chi phí' };
const enumFmt = (labels: Record<string, string>) => (v: unknown) => labels[v as string] || (v ? String(v) : '(trống)');
const emptyFmt = (v: unknown) => (v === undefined || v === null || v === '' ? '(trống)' : String(v));

const PROJECT_DIFF_FIELDS: DiffField<Project>[] = [
  { key: 'title', label: 'Tên' },
  { key: 'deadline', label: 'Deadline', fmt: emptyFmt },
  { key: 'startDate', label: 'Ngày bắt đầu', fmt: emptyFmt },
  { key: 'status', label: 'Trạng thái', fmt: enumFmt(STATUS_LABEL_VI) },
  { key: 'projectType', label: 'Loại', fmt: enumFmt(PROJECT_TYPE_LABEL_VI) },
  { key: 'photoTarget', label: 'Chỉ tiêu ảnh', fmt: emptyFmt },
  { key: 'videoTarget', label: 'Chỉ tiêu video', fmt: emptyFmt },
  { key: 'productType', label: 'Sản phẩm', fmt: emptyFmt },
];

const TASK_DIFF_FIELDS: DiffField<Task>[] = [
  { key: 'title', label: 'Tên' },
  { key: 'quantity', label: 'Số lượng', fmt: emptyFmt },
  { key: 'deadline', label: 'Deadline', fmt: emptyFmt },
  { key: 'link', label: 'Link', fmt: emptyFmt },
  { key: 'amount', label: 'Chi phí', fmt: (v) => (Number(v) ? formatVND(Number(v)) : '(trống)') },
  { key: 'status', label: 'Trạng thái', fmt: (v) => (v === 'completed' ? 'Xong' : v === 'in-progress' ? 'Đang làm' : 'Chưa làm') },
];

const CONTENT_DIFF_FIELDS: DiffField<DailyContent>[] = [
  { key: 'title', label: 'Tên' },
  { key: 'dueDate', label: 'Deadline', fmt: emptyFmt },
  { key: 'platform', label: 'Nền tảng' },
  { key: 'type', label: 'Loại' },
  { key: 'quantity', label: 'Số lượng', fmt: emptyFmt },
  { key: 'status', label: 'Trạng thái', fmt: enumFmt(CONTENT_STATUS_LABEL_VI) },
];

export const col = {
  members: () => collection(db, ...teamPath, 'members'),
  projects: () => collection(db, ...teamPath, 'projects'),
  tasks: (projectId: string) => collection(db, ...teamPath, 'projects', projectId, 'tasks'),
  reports: () => collection(db, ...teamPath, 'reports'),
  productTypes: () => collection(db, ...teamPath, 'productTypes'),
  dailyContent: () => collection(db, ...teamPath, 'dailyContent'),
  notes: () => collection(db, ...teamPath, 'notes'),
  tags: () => collection(db, ...teamPath, 'tags'),
  contractPartners: () => collection(db, ...teamPath, 'contractPartners'),
};

export const ref = {
  team: () => doc(db, ...teamPath),
  member: (uid: string) => doc(db, ...teamPath, 'members', uid),
  project: (id: string) => doc(db, ...teamPath, 'projects', id),
  task: (projectId: string, taskId: string) => doc(db, ...teamPath, 'projects', projectId, 'tasks', taskId),
  report: (id: string) => doc(db, ...teamPath, 'reports', id),
  productType: (id: string) => doc(db, ...teamPath, 'productTypes', id),
  daily: (id: string) => doc(db, ...teamPath, 'dailyContent', id),
  note: (id: string) => doc(db, ...teamPath, 'notes', id),
  tag: (id: string) => doc(db, ...teamPath, 'tags', id),
  contractPartner: (id: string) => doc(db, ...teamPath, 'contractPartners', id),
  // teams/{id}/private/contracts — bí mật admin-only (token webhook hợp đồng). KHÔNG để trên
  // team doc: team doc mọi thành viên đọc được, mà token cho phép đọc sheet CCCD/STK.
  contractPrivate: () => doc(db, ...teamPath, 'private', 'contracts'),
};

/* ---------- Projects ---------- */

/** Dedup tagIds + mirror sang field cũ `tagId` (bundle cũ còn cache vẫn thấy màu tag). */
function tagFields(data: Partial<Project>): Partial<Project> {
  if (!Array.isArray(data.tagIds)) return {};
  const tagIds = Array.from(new Set(data.tagIds.filter(Boolean)));
  return { tagIds, tagId: tagIds[0] || '' };
}

export async function createProject(data: Partial<Project>, user: User): Promise<string> {
  const id = genId();
  await setDoc(ref.project(id), {
    ...data,
    ...tagFields(data),
    id,
    status: data.status || 'plan',
    projectType: data.projectType || 'inhouse',
    photoTarget: Number(data.photoTarget) || 0,
    videoTarget: Number(data.videoTarget) || 0,
    photoPoint: Number(data.photoPoint) || 1,
    videoPoint: Number(data.videoPoint) || 3,
    assigneeIds: Array.isArray(data.assigneeIds) ? data.assigneeIds : [],
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
  const type = (data.projectType || 'inhouse') === 'outsource' ? 'Outsource' : 'Inhouse';
  const qtyParts: string[] = [];
  if (Number(data.photoTarget) > 0) qtyParts.push(`${data.photoTarget} ảnh`);
  if (Number(data.videoTarget) > 0) qtyParts.push(`${data.videoTarget} video`);
  const qtyText = qtyParts.length ? ` · ${qtyParts.join(', ')}` : '';
  notify(`🆕 ${displayName(user)} tạo dự án ${type} "${data.title || 'Không tên'}"${data.deadline ? ` — deadline ${data.deadline}` : ''}${qtyText}`);
  return id;
}

/** info (tuỳ chọn):
 *  - `prev` (dự án TRƯỚC khi sửa) → cần để biết prevStatus (mừng khi chuyển Thanh toán/Hoàn thành)
 *    VÀ để dựng diff "sửa từ gì thành gì" khi có kèm `user` (sửa tự động, vd. hệ thống tự
 *    chuyển trạng thái, không truyền `user` → không bắn diff, tránh thông báo vô chủ).
 *  Không truyền `info` → chỉ ghi dữ liệu, không thông báo gì. */
export async function updateProject(
  id: string,
  data: Partial<Project>,
  info?: { prev?: Project; user?: User },
): Promise<void> {
  const prev = info?.prev;
  const prevStatus = prev?.status;
  const title = prev?.title;
  // Đóng dấu thời điểm hoàn thành để ô "Đã hoàn thành" xếp mới nhất trước.
  // Chỉ ghi khi thực sự vừa chuyển sang done (sửa lại dự án đã done không làm nó nhảy lên đầu).
  const justDone = data.status === 'done' && prevStatus !== 'done';
  await updateDoc(ref.project(id), {
    ...data,
    ...tagFields(data),
    ...(justDone ? { completedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  });

  let statusCelebrated = false;
  if (data.status && title && data.status !== prevStatus) {
    if (data.status === 'payment') { notify(`💵 Dự án "${title}" xong sản xuất → THANH TOÁN`); statusCelebrated = true; }
    else if (data.status === 'done') { notify(`🎉 Dự án "${title}" đã HOÀN THÀNH`); statusCelebrated = true; }
  }

  if (prev && info?.user) {
    // Trạng thái đã có thông báo mừng riêng thì bỏ dòng diff Trạng thái, tránh trùng ý.
    const lines = diffLines(prev, data, PROJECT_DIFF_FIELDS).filter((l) => !statusCelebrated || !l.startsWith('Trạng thái:'));
    if (lines.length) notify(`✏️ ${displayName(info.user)} sửa dự án "${prev.title}":\n${lines.map((l) => `• ${l}`).join('\n')}`);
  }
}

/** Dọn dữ liệu mồ côi: xoá task + report của các project đã bị xoá trước đây
 *  (thời điểm chưa có cascade). Nhận sẵn danh sách đã tính ở client. */
export async function deleteOrphans(
  tasks: { projectId: string; id: string }[],
  reportIds: string[],
): Promise<void> {
  await Promise.all([
    ...tasks.map((t) => deleteDoc(ref.task(t.projectId, t.id))),
    ...reportIds.map((id) => deleteDoc(ref.report(id))),
  ]);
}

export async function deleteProject(id: string, title?: string): Promise<void> {
  // Xoá cascade: Firestore không tự xoá subcollection → phải xoá tay tất cả
  // task (gồm DNTT/chi phí tiền kỳ) và report liên quan, rồi mới xoá project.
  const taskSnap = await getDocs(col.tasks(id));
  await Promise.all(taskSnap.docs.map((d) => deleteDoc(d.ref)));

  const reportSnap = await getDocs(query(col.reports(), where('projectId', '==', id)));
  await Promise.all(reportSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(ref.project(id));
  notify(`🗑️ Đã xoá dự án "${title || id}"`);
}

/* ---------- Tasks (+ auto-report pipeline) ---------- */

interface NewTaskInput {
  projectId: string;
  title: string;
  description?: string;
  category: TaskCategory;
  quantity?: number;
  amount?: number;
  difficulty?: number;
  deadline?: string;
  hasKB?: boolean;
  images?: string[];
  reportDate?: string;
  status?: Task['status'];
  dntt?: boolean;
  tagId?: string;
  link?: string;
}

/** Create task; if created as completed → also create the linked auto-report.
 *  Ghi atomic bằng batch: task + auto-report cùng thành công hoặc cùng huỷ,
 *  không để lại report mồ côi khi bước ghi task lỗi. */
export async function createTask(input: NewTaskInput, user: User, projectTitle: string): Promise<string> {
  const id = genId();
  const isCompleted = input.status === 'completed' || !!input.dntt;
  const reportDate = input.reportDate || todayStr();
  const batch = writeBatch(db);

  // Báo cáo tự động CHỈ cho ảnh & video — không tạo cho chi phí tiền kỳ.
  let sourceReportId: string | undefined;
  if (isCompleted && input.category !== 'pre-production') {
    const report = buildAutoReport(
      { taskId: id, projectId: input.projectId, projectTitle, title: input.title, category: input.category, quantity: input.quantity || 1, hasKB: !!input.hasKB, reportDate, link: input.link },
      user,
    );
    sourceReportId = report.id;
    batch.set(ref.report(report.id), report.data);
  }

  batch.set(ref.task(input.projectId, id), {
    id,
    projectId: input.projectId,
    teamId: MAIN_TEAM_ID,
    title: input.title,
    description: input.description || '',
    category: input.category,
    status: input.status || 'pending',
    quantity: Number(input.quantity) || 1,
    amount: Number(input.amount) || 0,
    difficulty: Number(input.difficulty) || 1,
    dntt: !!input.dntt,
    link: input.link || '',
    deadline: input.deadline || '',
    hasKB: !!input.hasKB,
    images: input.images || [],
    reportDate,
    tagId: input.tagId || '',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    ...(isCompleted ? { completedAt: serverTimestamp() } : {}),
    ...(sourceReportId ? { sourceReportId } : {}),
  });
  await batch.commit();

  const who = displayName(user);
  if (input.category === 'pre-production') {
    const amount = Number(input.amount) || 0;
    notify(`💰 ${who} thêm khoản chi "${input.title}"${amount ? ` ${formatVND(amount)}` : ''} — ${projectTitle}`);
  } else {
    const label = input.category === 'photo' ? 'ảnh' : 'video';
    const icon = input.category === 'photo' ? '📸' : '🎬';
    const link = (input.link || '').trim();
    const deadline = (input.deadline || '').trim();
    notify(`${icon} ${who} vừa thêm ${Number(input.quantity) || 1} ${label} — ${projectTitle}${deadline ? ` · hạn ${deadline}` : ''}${link ? `\n🔗 ${link}` : ''}`);
  }
  return id;
}

/** info (tuỳ chọn): truyền `prev` (task TRƯỚC khi sửa) + `user` để bắn thông báo
 *  "sửa từ gì thành gì". Không truyền → chỉ ghi dữ liệu, không thông báo (dùng cho các
 *  thao tác nội bộ như gỡ liên kết report, không phải người dùng chủ động sửa). */
export async function updateTask(
  projectId: string,
  taskId: string,
  data: Partial<Task>,
  info?: { prev?: Task; user?: User; projectTitle?: string },
): Promise<void> {
  // Firestore từ chối giá trị undefined → lọc bỏ trước khi ghi.
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  await updateDoc(ref.task(projectId, taskId), { ...clean, updatedAt: serverTimestamp() });

  if (info?.prev && info.user) {
    const lines = diffLines(info.prev, data, TASK_DIFF_FIELDS);
    if (lines.length) {
      const label = CATEGORY_LABEL_VI[info.prev.category] || info.prev.category;
      const where = info.projectTitle ? ` — ${info.projectTitle}` : '';
      notify(`✏️ ${displayName(info.user)} sửa ${label} "${info.prev.title}"${where}:\n${lines.map((l) => `• ${l}`).join('\n')}`);
    }
  }
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await deleteDoc(ref.task(projectId, taskId));
}

/** Mark task completed and create linked auto-report (order: report first, then task). */
export async function completeTask(task: Task, user: User, projectTitle: string): Promise<void> {
  const reportId = await createAutoReport(
    {
      taskId: task.id, projectId: task.projectId, projectTitle,
      title: task.title, category: task.category,
      quantity: task.quantity || 1, hasKB: !!task.hasKB,
      reportDate: task.reportDate || todayStr(),
    },
    user,
  );
  await updateDoc(ref.task(task.projectId, task.id), {
    status: 'completed',
    completedAt: serverTimestamp(),
    sourceReportId: reportId,
    updatedAt: serverTimestamp(),
  });
  const label = task.category === 'photo' ? 'ảnh' : task.category === 'video' ? 'video' : 'task';
  notify(`✅ ${displayName(user)} hoàn thành ${task.quantity || 1} ${label} — ${projectTitle}`);
}

/** DNTT toggle trên khoản chi phí tiền kỳ. KHÔNG tạo báo cáo tự động (báo cáo tự động
 *  chỉ dành cho ảnh & video). ON: đánh dấu thanh toán. OFF: bỏ. */
export async function toggleDntt(task: Task): Promise<void> {
  if (!task.dntt) {
    await updateDoc(ref.task(task.projectId, task.id), {
      dntt: true, status: 'completed', completedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  } else {
    // Dọn báo cáo tự động cũ nếu khoản này từng tạo (dữ liệu trước khi bỏ auto-report cho chi phí)
    if (task.sourceReportId) {
      try { await deleteDoc(ref.report(task.sourceReportId)); } catch { /* already gone */ }
    }
    await updateDoc(ref.task(task.projectId, task.id), {
      dntt: false, status: 'pending', sourceReportId: '', updatedAt: serverTimestamp(),
    });
  }
}

/* ---------- Reports ---------- */

interface AutoReportInfo {
  taskId: string; projectId: string; projectTitle: string; title: string;
  category: string; quantity: number; hasKB: boolean; reportDate: string; link?: string;
}

/** Dựng dữ liệu report tự động (thuần — không ghi Firestore) để dùng trong batch. */
function buildAutoReport(info: AutoReportInfo, user: User): { id: string; data: Record<string, unknown> } {
  const id = genId();
  const outLabel = info.category === 'photo' ? 'ảnh' : info.category === 'video' ? 'video' : info.category;
  return {
    id,
    data: {
      id,
      content: `Hoàn thành ${info.quantity} ${outLabel} - ${info.projectTitle}`,
      reportDate: info.reportDate,
      projectId: info.projectId,
      quantity: info.quantity,
      outputType: info.category,
      hasKB: info.hasKB,
      reportType: 'auto',
      relatedTaskId: info.taskId,
      link: info.link || '',
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      userEmail: user.email || '',
    },
  };
}

async function createAutoReport(info: AutoReportInfo, user: User): Promise<string> {
  const { id, data } = buildAutoReport(info, user);
  await setDoc(ref.report(id), data);
  return id;
}

export async function createManualReport(data: Partial<Report>, user: User): Promise<string> {
  const id = genId();
  await setDoc(ref.report(id), {
    id,
    content: data.content || '',
    reportDate: data.reportDate || todayStr(),
    projectId: data.projectId || '',
    quantity: Number(data.quantity) || 1,
    outputType: data.outputType || 'none',
    hasKB: !!data.hasKB,
    reportType: 'manual',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    userEmail: user.email || '',
  });
  notify(`📝 Báo cáo mới từ ${displayName(user)}: ${data.content || ''}`);
  return id;
}

/** Report tự động khi trả 1 video trong Daily Content (1 video = 1 báo cáo). */
export async function createContentVideoReport(input: {
  contentId: string; title: string; projectId?: string; reportDate: string;
  createdBy: string; userEmail: string; link?: string;
}): Promise<string> {
  const id = genId();
  await setDoc(ref.report(id), {
    id,
    content: `Hoàn thành 1 video - ${input.title}`,
    reportDate: input.reportDate || todayStr(),
    projectId: input.projectId || '',
    quantity: 1,
    outputType: 'video',
    hasKB: false,
    reportType: 'auto',
    relatedContentId: input.contentId,
    link: input.link || '',
    createdAt: serverTimestamp(),
    createdBy: input.createdBy,
    userEmail: input.userEmail || '',
  });
  return id;
}

export async function updateReport(id: string, data: Partial<Report>): Promise<void> {
  await updateDoc(ref.report(id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteReport(id: string): Promise<void> {
  await deleteDoc(ref.report(id));
}

/* ---------- Daily Content ---------- */

export async function createDailyContent(data: Partial<DailyContent>, user: User): Promise<void> {
  await addDoc(col.dailyContent(), {
    title: data.title || '',
    type: data.type || 'Reels',
    platform: data.platform || 'Đa kênh',
    assigneeId: data.assigneeId || '',
    editorId: data.editorId || '',
    orderDate: data.orderDate || todayStr(),
    dueDate: data.dueDate || todayStr(),
    notes: data.notes || '',
    points: Number(data.points) || 3,
    quantity: Math.max(1, Number(data.quantity) || 1),
    // Dạng content quyết định hệ số quy đổi sản lượng (Thumb Sub = 0,5 video) — whitelist này
    // lọc field nên thiếu dòng dưới là chọn Thumb Sub lúc tạo mới bị rơi mất, im lặng.
    contentFormat: data.contentFormat || 'full-video',
    status: data.status || 'planned',
    projectId: data.projectId || '',
    tagId: data.tagId || '',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
  const qty = Math.max(1, Number(data.quantity) || 1);
  const dl = (data.dueDate || '').trim();
  notify(`📅 ${displayName(user)} thêm nội dung "${data.title || 'Không tên'}"${data.platform ? ` · ${data.platform}` : ''}${qty > 1 ? ` · SL ${qty}` : ''}${dl ? ` · hạn ${dl}` : ''}`);
}

/** info (tuỳ chọn):
 *  - `title`/`platform` (kiểu cũ, vẫn còn dùng ở vài nơi) → chỉ bắn thông báo mừng khi
 *    chuyển sang "Hoàn thành", không diff.
 *  - `prev` (nội dung TRƯỚC khi sửa) + `user` → bắn thêm diff "sửa từ gì thành gì".
 *  Không truyền `info` → chỉ ghi dữ liệu, không thông báo. */
export async function updateDailyContent(
  id: string,
  data: Partial<DailyContent>,
  info?: { title?: string; platform?: string; prev?: DailyContent; user?: User },
): Promise<void> {
  await updateDoc(ref.daily(id), { ...data, updatedAt: serverTimestamp() });

  const title = info?.title || info?.prev?.title;
  const platform = info?.platform || info?.prev?.platform;
  let statusCelebrated = false;
  if (data.status === 'done' && title) {
    notify(`✅ Nội dung "${title}" đã HOÀN THÀNH${platform ? ` (${platform})` : ''}`);
    statusCelebrated = true;
  }

  if (info?.prev && info.user) {
    const lines = diffLines(info.prev, data, CONTENT_DIFF_FIELDS).filter((l) => !statusCelebrated || !l.startsWith('Trạng thái:'));
    if (lines.length) notify(`✏️ ${displayName(info.user)} sửa nội dung "${info.prev.title}":\n${lines.map((l) => `• ${l}`).join('\n')}`);
  }
}

/** Tick/bỏ tick "đã sử dụng" cho 1 video của DỰ ÁN (task category 'video') ở trang DS Content.
 *  Chỉ ghi 3 field used/usedDate/usedBy — rules cho role 'content' đúng bấy nhiêu key. */
export async function setTaskUsed(
  task: Task,
  used: boolean,
  user: { uid: string },
): Promise<void> {
  await updateDoc(ref.task(task.projectId, task.id), used
    ? { used: true, usedDate: todayStr(), usedBy: user.uid }
    : { used: false, usedDate: '', usedBy: '' });
}

/** Tick/bỏ tick "đã sử dụng" cho 1 video trong content (trang DS Content).
 *  KHÔNG đụng tới `done` (editor trả video), tiến độ hay báo cáo/KPI — chỉ là dấu của bên content. */
export async function setContentItemUsed(
  content: DailyContent,
  itemId: string,
  used: boolean,
  user: { uid: string },
): Promise<void> {
  const items = (content.items || []).map((it) =>
    it.id === itemId
      ? { ...it, used, ...(used ? { usedDate: todayStr(), usedBy: user.uid } : { usedDate: '', usedBy: '' }) }
      : it,
  );
  await updateDoc(ref.daily(content.id), { items, updatedAt: serverTimestamp() });
}

export async function deleteDailyContent(id: string, title?: string): Promise<void> {
  // Xoá luôn báo cáo auto sinh ra từ các video con của content này (tránh mồ côi).
  try {
    const snap = await getDocs(query(col.reports(), where('relatedContentId', '==', id)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch { /* không chặn xoá content nếu dọn báo cáo lỗi */ }
  await deleteDoc(ref.daily(id));
  notify(`🗑️ Đã xoá nội dung "${title || id}"`);
}

/* ---------- Notes (ghi chú ghim vào ngày trên lịch) ---------- */

export async function createNote(data: Partial<Note>, user: User): Promise<void> {
  await addDoc(col.notes(), {
    text: data.text || '',
    date: data.date || todayStr(),
    tagId: data.tagId || '',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
}

export async function updateNote(id: string, data: Partial<Note>): Promise<void> {
  await updateDoc(ref.note(id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteNote(id: string): Promise<void> {
  await deleteDoc(ref.note(id));
}

/* ---------- Tags (nhãn màu tuỳ chỉnh cho mục lịch) ---------- */

export async function createTag(data: Partial<Tag>, user: User): Promise<void> {
  await addDoc(col.tags(), {
    name: data.name || '',
    color: data.color || '#6366f1',
    ...(data.scope ? { scope: data.scope } : {}),
    // ctx = ngữ cảnh của tag Mảng; quên spread field này là tag tạo ra dùng được ở MỌI ngữ cảnh
    ...(data.ctx?.length ? { ctx: data.ctx } : {}),
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
}

export async function updateTag(id: string, data: Partial<Tag>): Promise<void> {
  await updateDoc(ref.tag(id), { ...data });
}

export async function deleteTag(id: string): Promise<void> {
  await deleteDoc(ref.tag(id));
}

/* ---------- Hợp đồng KOL/KOC ---------- */

const CONTRACT_FORM_TO_PARTNER: Record<string, keyof ContractPartner> = {
  xung_ho: 'xungHo', cccd: 'cccd', ngay_cap: 'ngayCap', mst: 'mst', dia_chi: 'diaChi',
  sdt: 'sdt', email: 'email', ten_tk: 'tenTk', so_tk: 'soTk', ngan_hang: 'nganHang',
};

/** Id doc lịch sử đối tác. `chuanHoa` bỏ dấu + gộp khoảng trắng nhưng KHÔNG bỏ '/', mà '/'
 *  cắt path Firestore (tên "A/B" → path sai). Bỏ luôn các ký tự Firestore cấm khác. */
export function idDoiTac(hoTen: string): string {
  return chuanHoa(hoTen)
    .replace(/[/\\.[\]*~#$?]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** Lưu/ghi đè lịch sử đối tác sau khi tạo file thành công — port `store.luu` (history.json). */
export async function luuContractPartner(form: ContractForm): Promise<void> {
  const hoTen = String(form.ho_ten || '').trim();
  if (!hoTen) return;
  const id = idDoiTac(hoTen);
  if (!id) return;
  const snap = await getDoc(ref.contractPartner(id));
  const truoc = snap.exists() ? (snap.data() as ContractPartner) : null;

  const data: Partial<ContractPartner> = { id, hoTen };
  for (const [k, target] of Object.entries(CONTRACT_FORM_TO_PARTNER)) {
    const giaTri = String((form as Record<string, unknown>)[k] || '').trim();
    if (giaTri) (data as Record<string, unknown>)[target] = giaTri;
  }

  await setDoc(ref.contractPartner(id), {
    ...(truoc || {}),
    ...data,
    soLan: (truoc?.soLan || 0) + 1,
    lanCuoi: serverTimestamp(),
  });
}

/** Đánh dấu một khoản chi tiền kỳ đã sinh file HĐ/BBNT (tab Hợp đồng đọc ngược lên để dựng
 *  dòng kèm cột "Dự án"). Chỉ ghi 3 field hợp đồng — đừng đụng status/dntt, hai thứ đó là
 *  luồng thanh toán, không liên quan tới việc đã làm hợp đồng hay chưa. */
export async function danhDauTaskDaLamHopDong(
  projectId: string, taskId: string, hoTen: string,
): Promise<void> {
  await updateDoc(ref.task(projectId, taskId), {
    hopDong: true,
    hopDongHoTen: hoTen,
    hopDongDaLam: true,
    updatedAt: serverTimestamp(),
  });
}

/** Ghi đè toàn bộ cài đặt tính năng Hợp đồng (giống ghi_cai_dat của bản Python — ghi cả object). */
export async function capNhatContractSettings(settings: ContractSettingsDoc): Promise<void> {
  await updateDoc(ref.team(), { contractSettings: settings });
}

/** Token dùng chung với Apps Script (User Property CONTRACT_TOKEN). Lưu ở doc admin-only. */
export async function docContractToken(): Promise<string> {
  const snap = await getDoc(ref.contractPrivate());
  return snap.exists() ? String((snap.data() as { contractToken?: string }).contractToken || '') : '';
}

export async function luuContractToken(token: string): Promise<void> {
  await setDoc(ref.contractPrivate(), { contractToken: token.trim() }, { merge: true });
}

/** Toàn bộ lịch sử đối tác, key = `idDoiTac(hoTen)`. Dùng để biết ai ĐÃ từng làm HĐ qua app —
 *  cột Link HĐ/BBNT của sheet chỉ đúng khi người dùng tự dán link vào, nên nếu chỉ nhìn sheet
 *  thì người vừa làm xong vẫn bị gắn nhãn "người mới". */
export async function docContractPartners(): Promise<Record<string, ContractPartner>> {
  const snap = await getDocs(col.contractPartners());
  const ra: Record<string, ContractPartner> = {};
  snap.forEach((d) => { ra[d.id] = { ...(d.data() as ContractPartner), id: d.id }; });
  return ra;
}
