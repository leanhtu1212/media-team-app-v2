import { useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, ChevronRight, ChevronLeft, FolderKanban, Wallet } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Button, Card, Badge, STATUS_BADGE, STATUS_LABEL, Modal, Input, Select, Textarea, Field, ConfirmDialog, Avatar, Drawer } from '../components/ui';
import { createDailyContent, updateDailyContent, deleteDailyContent, updateProject, updateTask } from '../lib/actions';
import { currentMonth, shiftMonth, monthLabel, todayStr, formatDate, formatVND, isProjectFinished } from '../lib/utils';
import { useToast } from '../hooks/useToast';
import type { DailyContent, DailyStatus, Project, Task } from '../types';
import type { User } from '../lib/firebase';

const STATUSES: DailyStatus[] = ['planned', 'in-progress', 'done', 'published'];
const NEXT_STATUS: Record<DailyStatus, DailyStatus | null> = {
  planned: 'in-progress', 'in-progress': 'done', done: 'published', published: null,
};
const TYPES = ['Reels', 'Short', 'Viral / Trending', 'Brand Content', 'Lịch đăng'];
const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'YouTube', 'Đa kênh'];
const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: 'bg-pink-500/15 text-pink-300',
  TikTok: 'bg-slate-500/15 text-slate-200',
  Facebook: 'bg-blue-500/15 text-blue-300',
  YouTube: 'bg-red-500/15 text-red-300',
  'Đa kênh': 'bg-violet-500/15 text-violet-300',
};

const isDailyOverdue = (d: DailyContent) =>
  d.status !== 'published' && d.status !== 'done' && (d.dueDate || '') < todayStr();

// Nền chip theo LOẠI mục (phân biệt content / dự án inhouse / dự án outsource / task tiền kỳ)
const TYPE_TINT = {
  content: 'bg-violet-500/12 text-violet-200',
  inhouse: 'bg-sky-500/12 text-sky-200',
  outsource: 'bg-fuchsia-500/12 text-fuchsia-200',
  task: 'bg-amber-500/12 text-amber-200',
} as const;

// Vạch trái theo TIẾN ĐỘ: quá hạn → đỏ, xong → xanh lá, đang làm → vàng, chưa bắt đầu → xám
function stripeFor(entry: CalEntry, today: string): string {
  if (entry.kind === 'daily') {
    const d = entry.daily;
    if (isDailyOverdue(d)) return 'border-red-500';
    if (d.status === 'published' || d.status === 'done') return 'border-emerald-500';
    if (d.status === 'in-progress') return 'border-amber-400';
    return 'border-slate-500';
  }
  if (entry.kind === 'project') {
    const p = entry.project;
    if ((p.deadline || '') < today) return 'border-red-500';
    if (p.status === 'post-production') return 'border-amber-400';
    if (p.status === 'pre-production') return 'border-sky-400';
    return 'border-slate-500';
  }
  const t = entry.task;
  if ((t.deadline || '') < today) return 'border-red-500';
  return 'border-amber-400';
}

/* ================================================================
 * Shared modal/drawer wiring — dùng cho cả kanban (tab Content ở
 * trang Dự án) lẫn trang Lịch tháng, tránh lặp state 2 nơi.
 * ================================================================ */
function useContentModals(user: User) {
  const { members, canEditDaily } = useAppData();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DailyContent | null>(null);
  const [confirmDel, setConfirmDel] = useState<DailyContent | null>(null);
  const [detailItem, setDetailItem] = useState<DailyContent | null>(null);

  const memberOf = (id?: string) => members.find((m) => m.uid === id || m.id === id);
  const openNew = (presetDate?: string) => {
    setEditing(presetDate ? ({ dueDate: presetDate } as DailyContent) : null);
    setModalOpen(true);
  };
  const openEdit = (item: DailyContent) => { setEditing(item); setModalOpen(true); };

  const modals = (
    <>
      <ContentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        members={members.filter((m) => m.role !== 'viewer')}
        onSave={async (data) => {
          try {
            if (editing?.id) {
              await updateDailyContent(editing.id, data);
              toast('Đã cập nhật');
            } else {
              await createDailyContent(data, user);
              toast('Đã thêm nội dung');
            }
            setModalOpen(false);
          } catch (e: unknown) {
            toast(`Lỗi: ${(e as Error).message}`, 'error');
          }
        }}
      />
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Xoá nội dung?"
        message={`Xoá "${confirmDel?.title}"?`}
        onConfirm={() => confirmDel && deleteDailyContent(confirmDel.id).then(() => toast('Đã xoá')).catch((e) => toast(`Lỗi: ${e.message}`, 'error'))}
      />
      <ContentDetailDrawer
        item={detailItem}
        assignee={detailItem ? memberOf(detailItem.assigneeId) : undefined}
        canEdit={canEditDaily}
        onClose={() => setDetailItem(null)}
        onEdit={(it) => { setDetailItem(null); openEdit(it); }}
      />
    </>
  );

  return { canEditDaily, toast, memberOf, openNew, openEdit, setConfirmDel, setDetailItem, modals };
}

function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(shiftMonth(month, -1))} className="p-1.5 text-muted hover:text-ink cursor-pointer"><ChevronLeft size={17} /></button>
      <span className="font-bold text-sm">{monthLabel(month)}</span>
      <button onClick={() => onChange(shiftMonth(month, 1))} className="p-1.5 text-muted hover:text-ink cursor-pointer"><ChevronRight size={17} /></button>
      {month !== currentMonth() && (
        <button onClick={() => onChange(currentMonth())} className="text-xs text-indigo-300 hover:underline cursor-pointer">Về tháng này</button>
      )}
    </div>
  );
}

function ItemCard({
  item, assignee, canEdit, toast, onEdit, onDelete, onDetail,
}: {
  item: DailyContent;
  assignee?: { username?: string; avatarUrl?: string };
  canEdit: boolean;
  toast: (m: string, t?: 'success' | 'error') => void;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
}) {
  const overdue = isDailyOverdue(item);
  const next = NEXT_STATUS[item.status];
  return (
    <Card
      draggable={canEdit}
      onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/plain', item.id)}
      onDoubleClick={onDetail}
      title="Nhấn đúp để xem chi tiết"
      className="p-3 group hover:border-line-2 transition-all select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <Badge color={PLATFORM_COLOR[item.platform] || PLATFORM_COLOR['Đa kênh']}>{item.platform}</Badge>
        {canEdit && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="text-muted hover:text-ink cursor-pointer"><Pencil size={12} /></button>
            <button onClick={onDelete} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 size={12} /></button>
          </div>
        )}
      </div>
      <p className="text-sm font-bold leading-snug">{item.title}</p>
      <p className="text-[11px] text-dim mt-0.5">{item.type}</p>
      {item.notes && <p className="text-[11px] text-muted mt-1 line-clamp-2">{item.notes}</p>}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5">
          {assignee && <Avatar name={assignee.username} url={assignee.avatarUrl} size={20} />}
          <span className={`text-[11px] ${overdue ? 'text-red-400 font-bold' : 'text-dim'}`}>{formatDate(item.dueDate)}</span>
        </div>
        {canEdit && next && (
          <button
            onClick={() => updateDailyContent(item.id, { status: next }).then(() => toast(`→ ${STATUS_LABEL[next]}`)).catch((e) => toast(`Lỗi: ${e.message}`, 'error'))}
            className="flex items-center gap-0.5 text-[11px] font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer"
          >
            {STATUS_LABEL[next]} <ChevronRight size={11} />
          </button>
        )}
      </div>
    </Card>
  );
}

/* ================================================================
 * ContentKanban — kanban Daily Content, render trong tab "Content"
 * của trang Dự án.
 * ================================================================ */
export function ContentKanban({ user }: { user: User }) {
  const { dailyContent } = useAppData();
  const { canEditDaily, toast, memberOf, openNew, openEdit, setConfirmDel, setDetailItem, modals } = useContentModals(user);
  const [month, setMonth] = useState(currentMonth());
  const [dragOverCol, setDragOverCol] = useState<DailyStatus | null>(null);

  const monthItems = useMemo(
    () => dailyContent.filter((d) => (d.dueDate || '').startsWith(month)),
    [dailyContent, month],
  );

  const handleDrop = async (id: string, status: DailyStatus) => {
    const item = dailyContent.find((d) => d.id === id);
    if (!item || item.status === status) return;
    try {
      await updateDailyContent(id, { status });
      toast(`"${item.title}" → ${STATUS_LABEL[status]}`);
    } catch (e: unknown) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} onChange={setMonth} />
        {canEditDaily && <Button onClick={() => openNew()}><Plus size={15} /> Nội dung</Button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {STATUSES.map((status) => {
          const items = monthItems.filter((d) => d.status === status).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
          return (
            <div
              key={status}
              className={`space-y-3 rounded-xl transition-colors ${dragOverCol === status ? 'bg-accent/5 outline-2 outline-dashed outline-accent/40' : ''}`}
              onDragOver={(e) => { if (canEditDaily) { e.preventDefault(); setDragOverCol(status); } }}
              onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCol(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) handleDrop(id, status);
              }}
            >
              <div className="flex items-center justify-between px-1">
                <Badge color={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
                <span className="text-xs font-bold text-dim">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    assignee={memberOf(item.assigneeId)}
                    canEdit={canEditDaily}
                    toast={toast}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setConfirmDel(item)}
                    onDetail={() => setDetailItem(item)}
                  />
                ))}
                {items.length === 0 && <div className="border border-dashed border-line rounded-xl py-8 text-center text-xs text-dim">Trống</div>}
              </div>
            </div>
          );
        })}
      </div>

      {modals}
    </div>
  );
}

/* ================================================================
 * Trang "Lịch tháng" — lịch hiển thị mọi thứ đang chạy:
 *   - Daily Content theo ngày đăng
 *   - Deadline dự án chưa hoàn thành
 *   - Task tiền kỳ chưa xong (theo deadline)
 * ================================================================ */
type CalEntry =
  | { kind: 'daily'; daily: DailyContent }
  | { kind: 'project'; project: Project }
  | { kind: 'task'; task: Task; project?: Project };

/** Mã hoá payload kéo-thả cho từng loại chip → parse ở handler drop. */
function dragPayload(entry: CalEntry): string {
  if (entry.kind === 'daily') return `daily:${entry.daily.id}`;
  if (entry.kind === 'project') return `project:${entry.project.id}`;
  return `task:${entry.task.projectId}:${entry.task.id}`;
}

/** Chip trong ô lịch. PHẢI là component cấp module (không định nghĩa inline trong
 *  DailyContentPage) — nếu inline, mỗi lần re-render (vd click chọn ngày) React coi
 *  là component mới → remount chip → cú double-click bị gián đoạn giữa 2 lần click. */
function CalChip({
  entry, today, canEditDaily, isEditor, assigneeName, onDetail, onOpenProject,
}: {
  entry: CalEntry;
  today: string;
  canEditDaily: boolean;
  isEditor: boolean;
  assigneeName: (id?: string) => string | undefined;
  onDetail: (d: DailyContent) => void;
  onOpenProject: (id: string) => void;
}) {
  const stripe = stripeFor(entry, today);
  const canDrag = entry.kind === 'daily' ? canEditDaily : isEditor;
  const dragProps = canDrag ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', dragPayload(entry)); e.dataTransfer.effectAllowed = 'move'; },
  } : {};
  const dragCls = canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer';

  if (entry.kind === 'daily') {
    const d = entry.daily;
    const name = assigneeName(d.assigneeId);
    return (
      <div
        {...dragProps}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); onDetail(d); }}
        title={`Nội dung — nhấn đúp để xem chi tiết${canDrag ? ', kéo để đổi ngày' : ''}`}
        className={`rounded-md px-1.5 py-1 border-l-2 ${dragCls} ${stripe} ${TYPE_TINT.content}`}
      >
        <p className="text-[11px] font-bold leading-tight line-clamp-2">{d.title}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[9px] px-1 rounded font-bold ${PLATFORM_COLOR[d.platform] || PLATFORM_COLOR['Đa kênh']}`}>{d.platform}</span>
          {name && <span className="text-[9px] text-dim truncate">{name}</span>}
        </div>
      </div>
    );
  }
  if (entry.kind === 'project') {
    const p = entry.project;
    const isOut = p.projectType === 'outsource';
    return (
      <div
        {...dragProps}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenProject(p.id); }}
        title={`Dự án ${isOut ? 'outsource' : 'inhouse'} — nhấn đúp để mở${canDrag ? ', kéo để đổi deadline' : ''}`}
        className={`rounded-md px-1.5 py-1 border-l-2 ${dragCls} ${stripe} ${isOut ? TYPE_TINT.outsource : TYPE_TINT.inhouse}`}
      >
        <p className="text-[11px] font-bold leading-tight line-clamp-2 flex items-start gap-1"><FolderKanban size={10} className="mt-0.5 shrink-0" />{p.title}</p>
        <span className="text-[9px] font-bold uppercase opacity-80">{isOut ? 'Outsource' : 'Inhouse'} · {STATUS_LABEL[p.status]}</span>
      </div>
    );
  }
  const { task, project } = entry;
  return (
    <div
      {...dragProps}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); if (project) onOpenProject(project.id); }}
      title={`Task tiền kỳ — nhấn đúp để mở dự án${canDrag ? ', kéo để đổi deadline' : ''}`}
      className={`rounded-md px-1.5 py-1 border-l-2 ${dragCls} ${stripe} ${TYPE_TINT.task}`}
    >
      <p className="text-[11px] font-bold leading-tight line-clamp-2 flex items-start gap-1"><Wallet size={10} className="mt-0.5 shrink-0" />{task.title}</p>
      {project && <span className="text-[9px] text-dim truncate block">{project.title}</span>}
    </div>
  );
}

export function DailyContentPage({ user, onOpenProject }: { user: User; onOpenProject: (id: string) => void }) {
  const { dailyContent, projects, allTasks, isEditor } = useAppData();
  const { canEditDaily, toast, memberOf, openNew, openEdit, setConfirmDel, setDetailItem, modals } = useContentModals(user);
  const [month, setMonth] = useState(currentMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const today = todayStr();

  // Kéo chip sang ngày khác → cập nhật ngày (nội dung: dueDate; dự án/task: deadline)
  const handleDropOnDay = async (date: string, payload: string) => {
    const [kind, a, b] = payload.split(':');
    try {
      if (kind === 'daily') {
        if (!canEditDaily) return;
        const d = dailyContent.find((x) => x.id === a);
        if (!d || d.dueDate === date) return;
        await updateDailyContent(a, { dueDate: date });
        toast(`"${d.title}" → ${formatDate(date)}`);
      } else if (kind === 'project') {
        if (!isEditor) return;
        const p = projects.find((x) => x.id === a);
        if (!p || p.deadline === date) return;
        await updateProject(a, { deadline: date });
        toast(`Deadline "${p.title}" → ${formatDate(date)}`);
      } else if (kind === 'task') {
        if (!isEditor) return;
        const t = allTasks.find((x) => x.id === b && x.projectId === a);
        if (!t || t.deadline === date) return;
        await updateTask(a, b, { deadline: date });
        toast(`Deadline task → ${formatDate(date)}`);
      }
    } catch (e: unknown) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    }
  };

  // Gom mọi entry của tháng theo ngày
  const byDay = useMemo(() => {
    const map: Record<string, CalEntry[]> = {};
    const push = (date: string, e: CalEntry) => { (map[date] ||= []).push(e); };

    dailyContent.forEach((d) => {
      if ((d.dueDate || '').startsWith(month)) push(d.dueDate!, { kind: 'daily', daily: d });
    });
    // Dự án đang chạy, deadline trong tháng
    projects.forEach((p) => {
      if (!isProjectFinished(p.status) && (p.deadline || '').startsWith(month)) push(p.deadline!, { kind: 'project', project: p });
    });
    // Task tiền kỳ chưa xong, deadline trong tháng
    allTasks.forEach((t) => {
      if (t.category === 'pre-production' && t.status !== 'completed' && !t.dntt && (t.deadline || '').startsWith(month)) {
        push(t.deadline!, { kind: 'task', task: t, project: projects.find((p) => p.id === t.projectId) });
      }
    });
    return map;
  }, [dailyContent, projects, allTasks, month]);

  const monthCount = useMemo(() => Object.values(byDay).reduce((s, l) => s + l.length, 0), [byDay]);

  // Calendar cells
  const [yy, mm] = month.split('-').map(Number);
  const startOffset = (new Date(yy, mm - 1, 1).getDay() + 6) % 7;
  const lastDate = new Date(yy, mm, 0).getDate();
  const totalCells = Math.ceil((startOffset + lastDate) / 7) * 7;
  const cells: (string | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d >= 1 && d <= lastDate ? `${month}-${String(d).padStart(2, '0')}` : null;
  });

  const selectedEntries = selectedDay ? byDay[selectedDay] || [] : [];
  const selDailies = selectedEntries.filter((e): e is Extract<CalEntry, { kind: 'daily' }> => e.kind === 'daily');
  const selProjects = selectedEntries.filter((e): e is Extract<CalEntry, { kind: 'project' }> => e.kind === 'project');
  const selTasks = selectedEntries.filter((e): e is Extract<CalEntry, { kind: 'task' }> => e.kind === 'task');

  return (
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Lịch tháng</h1>
          <p className="text-sm text-muted">{monthCount} mục trong {monthLabel(month).toLowerCase()} — nội dung, deadline dự án & task đang chạy</p>
        </div>
        {canEditDaily && <Button onClick={() => openNew()}><Plus size={15} /> Nội dung</Button>}
      </div>

      <MonthNav month={month} onChange={setMonth} />

      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-2">
          {DAY_LABELS.map((d) => <div key={d} className="text-center text-xs font-bold text-dim py-1">{d}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const list = byDay[date] || [];
            const isToday = date === today;
            const isSelected = date === selectedDay;
            const isDragOver = date === dragOverDay;
            return (
              // Ô ngày là <div> (không phải <button>) để các chip lồng bên trong nhận
              // được sự kiện double-click riêng — button không giao event cho con.
              <div
                key={date}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedDay(isSelected ? null : date)}
                onDoubleClick={() => canEditDaily && openNew(date)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverDay !== date) setDragOverDay(date); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay((cur) => (cur === date ? null : cur)); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverDay(null);
                  const payload = e.dataTransfer.getData('text/plain');
                  if (payload) handleDropOnDay(date, payload);
                }}
                title={canEditDaily ? 'Nhấn đúp vào chỗ trống để tạo nội dung' : undefined}
                className={`min-h-32 sm:min-h-40 rounded-lg border p-2 text-left transition-all cursor-pointer overflow-hidden flex flex-col select-none ${
                  isDragOver ? 'border-accent bg-accent/15 ring-2 ring-accent/40' : isSelected ? 'border-accent bg-accent/10' : isToday ? 'border-indigo-500/40 bg-surface-2' : 'border-line hover:border-line-2'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-bold ${isToday ? 'text-indigo-300' : 'text-muted'}`}>{Number(date.slice(8))}</span>
                  {list.length > 0 && <span className="text-[10px] font-bold text-dim">{list.length}</span>}
                </div>
                <div className="space-y-1 flex-1">
                  {list.slice(0, 4).map((entry, j) => (
                    <CalChip
                      key={j}
                      entry={entry}
                      today={today}
                      canEditDaily={canEditDaily}
                      isEditor={isEditor}
                      assigneeName={(id) => memberOf(id)?.username}
                      onDetail={setDetailItem}
                      onOpenProject={onOpenProject}
                    />
                  ))}
                  {list.length > 4 && <span className="text-[10px] text-dim block pl-1">+{list.length - 4} mục khác</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-3 items-center text-[11px] text-muted">
            <span className="font-bold text-dim uppercase text-[10px] tracking-wide">Loại</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500/50" /> Content</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/50" /> Dự án inhouse</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-fuchsia-500/50" /> Dự án outsource</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/50" /> Task tiền kỳ</span>
          </div>
          <div className="flex flex-wrap gap-3 items-center text-[11px] text-muted">
            <span className="font-bold text-dim uppercase text-[10px] tracking-wide">Tiến độ (vạch)</span>
            <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-slate-500 rounded" /> Chưa bắt đầu</span>
            <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-amber-400 rounded" /> Đang làm</span>
            <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-emerald-500 rounded" /> Xong</span>
            <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-red-500 rounded" /> Quá hạn</span>
          </div>
        </div>
      </Card>

      {selectedDay && (
        <Card className="fade-up">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h3 className="font-bold text-sm">Ngày {formatDate(selectedDay)}</h3>
            {canEditDaily && (
              <Button variant="outline" onClick={() => openNew(selectedDay)} className="!py-1 !px-2.5 !text-xs"><Plus size={13} /> Thêm nội dung</Button>
            )}
          </div>
          <div className="p-4 space-y-5">
            {selectedEntries.length === 0 && <p className="text-sm text-dim text-center py-4">Không có mục nào</p>}

            {selDailies.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Nội dung ({selDailies.length})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selDailies.map(({ daily }) => (
                    <ItemCard
                      key={daily.id}
                      item={daily}
                      assignee={memberOf(daily.assigneeId)}
                      canEdit={canEditDaily}
                      toast={toast}
                      onEdit={() => openEdit(daily)}
                      onDelete={() => setConfirmDel(daily)}
                      onDetail={() => setDetailItem(daily)}
                    />
                  ))}
                </div>
              </div>
            )}

            {selProjects.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Deadline dự án ({selProjects.length})</p>
                <div className="space-y-2">
                  {selProjects.map(({ project }) => (
                    <button
                      key={project.id}
                      onClick={() => onOpenProject(project.id)}
                      className="w-full flex items-center gap-3 p-3 bg-bg border border-line rounded-xl hover:border-line-2 transition-all text-left cursor-pointer group"
                    >
                      <FolderKanban size={15} className="text-indigo-300 shrink-0" />
                      <span className="flex-1 text-sm font-bold truncate group-hover:text-indigo-300 transition-colors">{project.title}</span>
                      <Badge color={STATUS_BADGE[project.status]}>{STATUS_LABEL[project.status]}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selTasks.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Task tiền kỳ ({selTasks.length})</p>
                <div className="space-y-2">
                  {selTasks.map(({ task, project }) => (
                    <button
                      key={task.id}
                      onClick={() => project && onOpenProject(project.id)}
                      className="w-full flex items-center gap-3 p-3 bg-bg border border-line rounded-xl hover:border-line-2 transition-all text-left cursor-pointer group"
                    >
                      <Wallet size={15} className="text-amber-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate group-hover:text-indigo-300 transition-colors">{task.title}</p>
                        {project && <p className="text-[11px] text-dim truncate">{project.title}</p>}
                      </div>
                      {(Number(task.amount) || 0) > 0 && <span className="text-xs font-bold text-amber-300 tabular-nums">{formatVND(Number(task.amount) || 0)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {modals}
    </div>
  );
}

/* ---------- Content detail drawer (trượt từ trái) ---------- */
function ContentDetailDrawer({
  item, assignee, canEdit, onClose, onEdit,
}: {
  item: DailyContent | null;
  assignee?: { username?: string; avatarUrl?: string };
  canEdit: boolean;
  onClose: () => void;
  onEdit: (it: DailyContent) => void;
}) {
  if (!item) return null;
  const overdue = isDailyOverdue(item);
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-line">
      <span className="text-xs font-bold text-muted uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-sm text-ink text-right break-words min-w-0">{children}</span>
    </div>
  );
  return (
    <Drawer
      open={!!item}
      onClose={onClose}
      side="left"
      title={<div>
        <p className="font-extrabold leading-snug break-words">{item.title}</p>
        <p className="text-xs text-muted">{item.type}</p>
      </div>}
      headerExtra={canEdit ? (
        <button type="button" onClick={() => onEdit(item)} title="Sửa" className="text-muted hover:text-ink cursor-pointer p-1 shrink-0"><Pencil size={16} /></button>
      ) : undefined}
    >
      <div className="space-y-0.5">
        <Row label="Nền tảng"><Badge color={PLATFORM_COLOR[item.platform] || PLATFORM_COLOR['Đa kênh']}>{item.platform}</Badge></Row>
        <Row label="Trạng thái"><Badge color={STATUS_BADGE[item.status]}>{STATUS_LABEL[item.status]}</Badge></Row>
        <Row label="Ngày đăng"><span className={overdue ? 'text-red-400 font-bold' : ''}>{formatDate(item.dueDate)}{overdue ? ' · quá hạn' : ''}</span></Row>
        <Row label="Người phụ trách">
          {assignee ? (
            <span className="inline-flex items-center gap-1.5"><Avatar name={assignee.username} url={assignee.avatarUrl} size={20} />{assignee.username}</span>
          ) : <span className="text-dim">Chưa gán</span>}
        </Row>
      </div>
      {item.notes && (
        <div className="mt-4">
          <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">Ghi chú</p>
          <p className="text-sm text-muted whitespace-pre-wrap break-words">{item.notes}</p>
        </div>
      )}
    </Drawer>
  );
}

function ContentFormModal({
  open, onClose, editing, members, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: DailyContent | null;
  members: { uid?: string; id: string; username: string }[];
  onSave: (data: Partial<DailyContent>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<DailyContent>>({});
  const [busy, setBusy] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setForm(editing ? { ...editing } : { type: 'Reels', platform: 'Đa kênh', status: 'planned', dueDate: todayStr(), points: 3 });
    setLastOpen(true);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const set = (k: keyof DailyContent, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (busy || !form.title) return;
    setBusy(true);
    await onSave(form);
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title={editing?.id ? 'Sửa nội dung' : 'Nội dung mới'}>
      <div className="space-y-4">
        <Field label="Tiêu đề">
          <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="VD: Reels trend tuần này" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại">
            <Select value={form.type || 'Reels'} onChange={(e) => set('type', e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Nền tảng">
            <Select value={form.platform || 'Đa kênh'} onChange={(e) => set('platform', e.target.value)}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Người phụ trách">
            <Select value={form.assigneeId || ''} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">— Chưa gán —</option>
              {members.map((m) => <option key={m.uid || m.id} value={m.uid || m.id}>{m.username}</option>)}
            </Select>
          </Field>
          <Field label="Ngày đăng">
            <Input type="date" value={form.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Trạng thái">
          <Select value={form.status || 'planned'} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Ghi chú">
          <Textarea rows={2} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button type="submit" disabled={busy || !form.title}>
            {editing?.id ? 'Lưu' : 'Thêm'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
