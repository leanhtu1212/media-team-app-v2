import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  collection, collectionGroup, doc, onSnapshot, query,
} from 'firebase/firestore';
import { db, type User } from '../lib/firebase';
import { MAIN_TEAM_ID, ADMIN_EMAILS } from '../lib/utils';
import { setNotifyWebhook } from '../lib/notify';
import type { Member, Project, Task, Report, ProductType, DailyContent, Note, Tag, TeamDoc } from '../types';

interface AppData {
  team: TeamDoc | null;
  members: Member[];
  projects: Project[];
  allTasks: Task[];
  reports: Report[];
  productTypes: ProductType[];
  dailyContent: DailyContent[];
  notes: Note[];
  tags: Tag[];
  loading: boolean;
  isAdmin: boolean;
  isEditor: boolean;
  /** Role thô từ members doc — dùng khi cần phân biệt đúng role 'content'. */
  role: string;
  /** Role "content": chỉ được sửa Daily Content, mọi nơi khác chỉ xem. */
  canEditDaily: boolean;
  /** TẠO dự án mới: chỉ admin. Editor vẫn sửa được dự án đã có. */
  canCreateProject: boolean;
  /** TẠO nội dung mới: admin và role "content". Editor vẫn sửa được nội dung đã có. */
  canCreateContent: boolean;
  currentMember: Member | null;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ user, children }: { user: User; children: ReactNode }) {
  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [dailyContent, setDailyContent] = useState<DailyContent[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loaded, setLoaded] = useState({ members: false, projects: false, tasks: false });

  useEffect(() => {
    const teamRef = doc(db, 'teams', MAIN_TEAM_ID);
    const unsubs = [
      onSnapshot(teamRef, (snap) => {
        const t = snap.exists() ? ({ id: snap.id, ...snap.data() } as TeamDoc) : null;
        setTeam(t);
        setNotifyWebhook(t?.notifyWebhookUrl); // actions.ts đọc qua module notify, không cần context
      }),

      onSnapshot(collection(db, 'teams', MAIN_TEAM_ID, 'members'), (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Member)));
        setLoaded((s) => ({ ...s, members: true }));
      }, (err) => {
        // Non-member (đã bị siết quyền đọc) → permission-denied. Vẫn set loaded để
        // thoát màn hình loading, app render read-only trống thay vì kẹt spinner.
        console.warn('members listener error:', err.message);
        setLoaded((s) => ({ ...s, members: true }));
      }),

      onSnapshot(collection(db, 'teams', MAIN_TEAM_ID, 'projects'), (snap) => {
        setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project)));
        setLoaded((s) => ({ ...s, projects: true }));
      }, (err) => {
        console.warn('projects listener error:', err.message);
        setLoaded((s) => ({ ...s, projects: true }));
      }),

      // Unfiltered collectionGroup (legacy tasks may lack teamId) — infer from path.
      onSnapshot(query(collectionGroup(db, 'tasks')), (snap) => {
        const tasks: Task[] = [];
        snap.docs.forEach((d) => {
          const segs = d.ref.path.split('/'); // teams/{tid}/projects/{pid}/tasks/{id}
          if (segs[0] !== 'teams' || segs[1] !== MAIN_TEAM_ID) return;
          const data = d.data() as Task;
          tasks.push({ ...data, id: d.id, projectId: data.projectId || segs[3] });
        });
        setAllTasks(tasks);
        setLoaded((s) => ({ ...s, tasks: true }));
      }, (err) => {
        console.warn('collectionGroup tasks listener error:', err.message);
        setLoaded((s) => ({ ...s, tasks: true }));
      }),

      onSnapshot(collection(db, 'teams', MAIN_TEAM_ID, 'reports'), (snap) =>
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report))),
      ),

      onSnapshot(collection(db, 'teams', MAIN_TEAM_ID, 'productTypes'), (snap) =>
        setProductTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductType))),
      ),

      onSnapshot(collection(db, 'teams', MAIN_TEAM_ID, 'dailyContent'), (snap) =>
        setDailyContent(snap.docs.map((d) => {
          const data = { id: d.id, ...d.data() } as DailyContent;
          // Trạng thái 'published' đã bỏ — doc cũ vẫn còn nên quy về 'done', nếu không
          // chúng sẽ rơi ra ngoài mọi cột kanban và biến mất khỏi UI.
          if ((data.status as string) === 'published') data.status = 'done';
          return data;
        })),
      ),

      onSnapshot(collection(db, 'teams', MAIN_TEAM_ID, 'notes'), (snap) =>
        setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Note))),
      ),

      onSnapshot(collection(db, 'teams', MAIN_TEAM_ID, 'tags'), (snap) =>
        setTags(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tag))),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user.uid]);

  const currentMember = members.find((m) => m.uid === user.uid || m.id === user.uid) || null;
  const role = currentMember?.role || 'viewer';
  const isAdmin = role === 'admin' || ADMIN_EMAILS.includes(user.email || '');
  const isEditor = role === 'editor' || isAdmin;
  const canEditDaily = isEditor || role === 'content';
  // Quyền TẠO hẹp hơn quyền sửa: editor không mở được dự án/nội dung mới (tránh đẻ thêm đầu việc
  // ngoài kế hoạch), nhưng vẫn sửa/cập nhật bình thường và vẫn tạo được ghi chú trên lịch.
  const canCreateProject = isAdmin;
  const canCreateContent = isAdmin || role === 'content';
  const loading = !loaded.members || !loaded.projects || !loaded.tasks;

  return (
    <AppDataContext.Provider
      value={{ team, members, projects, allTasks, reports, productTypes, dailyContent, notes, tags, loading, isAdmin, isEditor, role, canEditDaily, canCreateProject, canCreateContent, currentMember }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
