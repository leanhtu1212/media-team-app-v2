import {
  addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db, type User } from './firebase';
import { MAIN_TEAM_ID, genId, todayStr } from './utils';
import type { Project, Task, Report, DailyContent, Note, Tag, TaskCategory } from '../types';

const teamPath = ['teams', MAIN_TEAM_ID] as const;

export const col = {
  members: () => collection(db, ...teamPath, 'members'),
  projects: () => collection(db, ...teamPath, 'projects'),
  tasks: (projectId: string) => collection(db, ...teamPath, 'projects', projectId, 'tasks'),
  reports: () => collection(db, ...teamPath, 'reports'),
  productTypes: () => collection(db, ...teamPath, 'productTypes'),
  dailyContent: () => collection(db, ...teamPath, 'dailyContent'),
  notes: () => collection(db, ...teamPath, 'notes'),
  tags: () => collection(db, ...teamPath, 'tags'),
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
};

/* ---------- Projects ---------- */

export async function createProject(data: Partial<Project>, user: User): Promise<string> {
  const id = genId();
  await setDoc(ref.project(id), {
    ...data,
    id,
    status: data.status || 'plan',
    projectType: data.projectType || 'inhouse',
    photoTarget: Number(data.photoTarget) || 0,
    videoTarget: Number(data.videoTarget) || 0,
    photoPoint: Number(data.photoPoint) || 1,
    videoPoint: Number(data.videoPoint) || 3,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
  return id;
}

export async function updateProject(id: string, data: Partial<Project>): Promise<void> {
  await updateDoc(ref.project(id), { ...data, updatedAt: serverTimestamp() });
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

export async function deleteProject(id: string): Promise<void> {
  // Xoá cascade: Firestore không tự xoá subcollection → phải xoá tay tất cả
  // task (gồm DNTT/chi phí tiền kỳ) và report liên quan, rồi mới xoá project.
  const taskSnap = await getDocs(col.tasks(id));
  await Promise.all(taskSnap.docs.map((d) => deleteDoc(d.ref)));

  const reportSnap = await getDocs(query(col.reports(), where('projectId', '==', id)));
  await Promise.all(reportSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(ref.project(id));
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
}

/** Create task; if created as completed → also create the linked auto-report. */
export async function createTask(input: NewTaskInput, user: User, projectTitle: string): Promise<string> {
  const id = genId();
  const isCompleted = input.status === 'completed' || !!input.dntt;
  const reportDate = input.reportDate || todayStr();

  // Báo cáo tự động CHỈ cho ảnh & video — không tạo cho chi phí tiền kỳ.
  let sourceReportId: string | undefined;
  if (isCompleted && input.category !== 'pre-production') {
    sourceReportId = await createAutoReport(
      { taskId: id, projectId: input.projectId, projectTitle, title: input.title, category: input.category, quantity: input.quantity || 1, hasKB: !!input.hasKB, reportDate },
      user,
    );
  }

  await setDoc(ref.task(input.projectId, id), {
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
  return id;
}

export async function updateTask(projectId: string, taskId: string, data: Partial<Task>): Promise<void> {
  await updateDoc(ref.task(projectId, taskId), { ...data, updatedAt: serverTimestamp() });
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

async function createAutoReport(
  info: { taskId: string; projectId: string; projectTitle: string; title: string; category: string; quantity: number; hasKB: boolean; reportDate: string },
  user: User,
): Promise<string> {
  const id = genId();
  const outLabel = info.category === 'photo' ? 'ảnh' : info.category === 'video' ? 'video' : info.category;
  await setDoc(ref.report(id), {
    id,
    content: `Hoàn thành ${info.quantity} ${outLabel} - ${info.projectTitle}`,
    reportDate: info.reportDate,
    projectId: info.projectId,
    quantity: info.quantity,
    outputType: info.category,
    hasKB: info.hasKB,
    reportType: 'auto',
    relatedTaskId: info.taskId,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    userEmail: user.email || '',
  });
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
    dueDate: data.dueDate || todayStr(),
    notes: data.notes || '',
    points: Number(data.points) || 3,
    status: data.status || 'planned',
    projectId: data.projectId || '',
    tagId: data.tagId || '',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
}

export async function updateDailyContent(id: string, data: Partial<DailyContent>): Promise<void> {
  await updateDoc(ref.daily(id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDailyContent(id: string): Promise<void> {
  await deleteDoc(ref.daily(id));
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
