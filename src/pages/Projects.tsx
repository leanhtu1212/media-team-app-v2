import { useMemo, useRef, useState } from 'react';
import { Plus, FolderKanban, Calendar, Camera, Video, Search, X, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Button, Card, Badge, STATUS_BADGE, STATUS_LABEL, ProgressBar, EmptyState, Modal, Input, Textarea, Field } from '../components/ui';
import { createProject, updateProject } from '../lib/actions';
import { useToast } from '../hooks/useToast';
import { formatDate, todayStr, normalize, itemStatusFromProjectStatus, isProjectFinished } from '../lib/utils';
import { ContentKanban } from './DailyContent';
import { TagSelect } from '../components/tags';
import type { Project, ProjectStatus } from '../types';
import type { User } from '../lib/firebase';

// Luồng: Kế hoạch → Tiền kỳ → Hậu kỳ → Thanh toán → (Done, ở ô ngang riêng bên dưới).
// 'done' KHÔNG nằm trong kanban — dự án đã thanh toán xong mới rơi xuống ô Done.
const COLUMNS: ProjectStatus[] = ['plan', 'pre-production', 'post-production', 'payment'];
const ALL_STATUS: ProjectStatus[] = ['plan', 'pre-production', 'post-production', 'payment', 'done'];

export type ProjectsTab = 'inhouse' | 'outsource' | 'content';
const TAB_LABEL: Record<ProjectsTab, string> = { inhouse: 'Inhouse', outsource: 'Outsource', content: 'Content' };

interface Prog { photoDone: number; videoDone: number; pct: number }

/** Card dự án dùng chung cho cột kanban và ô Done. */
function ProjectCard({
  p, prog, draggable, onOpen, onDragStart,
}: {
  p: Project;
  prog: Prog;
  draggable: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <Card
      draggable={draggable}
      onDragStart={onDragStart}
      className="p-4 hover:border-line-2 transition-all cursor-pointer group"
    >
      <div onClick={onOpen}>
        <h3 className="font-bold text-sm mb-1 group-hover:text-indigo-300 transition-colors">{p.title}</h3>
        {p.productType && <p className="text-[11px] text-muted mb-2">{p.productType}</p>}
        <div className="flex items-center gap-3 text-[11px] text-muted mb-3">
          <span className="flex items-center gap-1"><Camera size={11} /> {prog.photoDone}/{p.photoTarget || 0}</span>
          <span className="flex items-center gap-1"><Video size={11} /> {prog.videoDone}/{p.videoTarget || 0}</span>
          {p.deadline && (
            <span className={`flex items-center gap-1 ml-auto ${!isProjectFinished(p.status) && p.deadline < todayStr() ? 'text-red-400 font-bold' : ''}`}>
              <Calendar size={11} /> {formatDate(p.deadline)}
            </span>
          )}
        </div>
        <ProgressBar value={prog.pct} />
      </div>
    </Card>
  );
}

export function ProjectsPage({
  user, onOpenProject, typeFilter, onTypeFilterChange,
}: {
  user: User;
  onOpenProject: (id: string) => void;
  typeFilter: ProjectsTab;
  onTypeFilterChange: (t: ProjectsTab) => void;
}) {
  const { projects, allTasks, isEditor, canEditDaily } = useAppData();
  const toast = useToast();
  const contentNewRef = useRef<(() => void) | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [dragOverCol, setDragOverCol] = useState<ProjectStatus | null>(null);

  // Legacy data may have projectType 'photo' | 'video' | undefined — treat everything
  // that is not explicitly 'outsource' as inhouse so no project is hidden.
  const filtered = useMemo(() => {
    if (typeFilter === 'content') return [];
    const q = normalize(search);
    return projects.filter((p) => {
      if (typeFilter === 'outsource' ? p.projectType !== 'outsource' : p.projectType === 'outsource') return false;
      if (!q) return true;
      return normalize(`${p.title || ''} ${p.productType || ''} ${p.description || ''}`).includes(q);
    });
  }, [projects, typeFilter, search]);

  // Dự án đã hoàn thành (status 'done') — hiển thị ở ô ngang riêng, mới nhất trước
  const doneProjects = useMemo(
    () => filtered.filter((p) => p.status === 'done').sort((a, b) => (b.deadline || '').localeCompare(a.deadline || '')),
    [filtered],
  );

  const handleDrop = async (projectId: string, status: ProjectStatus) => {
    const p = projects.find((x) => x.id === projectId);
    if (!p || p.status === status) return;
    try {
      // Status change drives itemStatus the same way ProjectDetail does
      await updateProject(projectId, { status, itemStatus: itemStatusFromProjectStatus(status) }, { title: p.title, prevStatus: p.status });
      toast(`"${p.title}" → ${STATUS_LABEL[status]}`);
    } catch (e: unknown) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    }
  };

  const progressOf = (p: Project) => {
    const pTasks = allTasks.filter((t) => t.projectId === p.id);
    const photoDone = pTasks.filter((t) => t.category === 'photo' && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const videoDone = pTasks.filter((t) => t.category === 'video' && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const target = (p.photoTarget || 0) + (p.videoTarget || 0);
    const done = photoDone + videoDone;
    return { photoDone, videoDone, pct: target > 0 ? (done / target) * 100 : 0 };
  };

  return (
    <div className="fade-up flex flex-col gap-5 min-h-[calc(100vh-2rem)] lg:min-h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Dự án</h1>
          <p className="text-sm text-muted">
            {typeFilter === 'content' ? 'Kanban nội dung hằng ngày' : `${filtered.length} dự án ${typeFilter}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {typeFilter !== 'content' && (
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm dự án..."
                className="!w-44 sm:!w-56 !pl-8 !pr-7"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-ink cursor-pointer">
                  <X size={13} />
                </button>
              )}
            </div>
          )}
          <div className="flex bg-surface border border-line rounded-xl p-1">
            {(['inhouse', 'outsource', 'content'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onTypeFilterChange(t)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                  typeFilter === t ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
          {typeFilter !== 'content' && isEditor && (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus size={15} /> Dự án mới
            </Button>
          )}
          {typeFilter === 'content' && canEditDaily && (
            <Button onClick={() => contentNewRef.current?.()}>
              <Plus size={15} /> Nội dung
            </Button>
          )}
        </div>
      </div>

      {typeFilter === 'content' && <ContentKanban user={user} newRef={contentNewRef} />}

      {typeFilter !== 'content' && (
      <>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((status) => {
          // Unknown/legacy status → cột "Kế hoạch" (trừ 'done' đã tách ra ô riêng)
          const colProjects = filtered.filter((p) =>
            status === 'plan' ? p.status === 'plan' || !ALL_STATUS.includes(p.status) : p.status === status,
          );
          return (
            <div
              key={status}
              className={`space-y-3 rounded-xl transition-colors ${dragOverCol === status ? 'bg-accent/5 outline-2 outline-dashed outline-accent/40' : ''}`}
              onDragOver={(e) => { if (isEditor) { e.preventDefault(); setDragOverCol(status); } }}
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
                <span className="text-xs font-bold text-dim">{colProjects.length}</span>
              </div>
              <div className="space-y-3">
                {colProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    p={p}
                    prog={progressOf(p)}
                    draggable={isEditor}
                    onOpen={() => onOpenProject(p.id)}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                  />
                ))}
                {colProjects.length === 0 && (
                  <div className="border border-dashed border-line rounded-xl py-8 text-center text-xs text-dim">Trống</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ô ngang "Done" — dự án đã thanh toán xong. Kéo card vào đây để đánh dấu done.
          mt-auto đẩy ô sát xuống đáy màn hình. */}
      <div
        className={`mt-auto rounded-xl border transition-colors ${dragOverCol === 'done' ? 'border-accent bg-accent/5 outline-2 outline-dashed outline-accent/40' : 'border-line'}`}
        onDragOver={(e) => { if (isEditor) { e.preventDefault(); setDragOverCol('done'); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverCol(null);
          const id = e.dataTransfer.getData('text/plain');
          if (id) handleDrop(id, 'done');
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 size={16} className="text-emerald-400" /> Đã hoàn thành
            <Badge color={STATUS_BADGE.done}>Done</Badge>
            <span className="text-xs font-bold text-dim">{doneProjects.length}</span>
          </div>
          {doneProjects.length > 5 && (
            <button onClick={() => setShowAllDone((v) => !v)} className="flex items-center gap-1 text-xs font-bold text-muted hover:text-ink cursor-pointer">
              {showAllDone ? <>Thu gọn <ChevronUp size={14} /></> : <>Xem thêm ({doneProjects.length - 5}) <ChevronDown size={14} /></>}
            </button>
          )}
        </div>
        <div className="p-4">
          {doneProjects.length === 0 ? (
            <p className="text-sm text-dim text-center py-6">Chưa có dự án hoàn thành — kéo dự án đã thanh toán vào đây</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {(showAllDone ? doneProjects : doneProjects.slice(0, 5)).map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  prog={progressOf(p)}
                  draggable={isEditor}
                  onOpen={() => onOpenProject(p.id)}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 && <EmptyState icon={<FolderKanban size={32} />} text="Chưa có dự án nào" />}
      </>
      )}

      <ProjectFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        // Không còn ô "Loại dự án" trong form → lấy theo tab đang mở
        preset={{ projectType: typeFilter === 'outsource' ? 'outsource' : 'inhouse' }}
        onSave={async (data) => {
          try {
            if (editing) {
              await updateProject(editing.id, data);
              toast('Đã cập nhật dự án');
            } else {
              await createProject(data, user);
              toast('Đã tạo dự án mới');
            }
            setModalOpen(false);
          } catch (e: unknown) {
            toast(`Lỗi: ${(e as Error).message}`, 'error');
          }
        }}
      />
    </div>
  );
}

export function ProjectFormModal({
  open, onClose, editing, onSave, preset,
}: {
  open: boolean;
  onClose: () => void;
  editing: Project | null;
  onSave: (data: Partial<Project>) => Promise<void>;
  // Giá trị điền sẵn khi tạo MỚI (vd từ lịch tháng: projectType + deadline)
  preset?: Partial<Project>;
}) {
  const [form, setForm] = useState<Partial<Project>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Reset form when opening
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setForm(editing ? { ...editing } : { status: 'plan', projectType: 'inhouse', photoTarget: 0, videoTarget: 0, ...preset });
    setLastOpen(true);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const set = (k: keyof Project, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (busy || !form.title || !form.tagId) return;
    if ((Number(form.photoTarget) || 0) < 1 && (Number(form.videoTarget) || 0) < 1) {
      toast('Cần nhập khối lượng: target ảnh hoặc target video ≥ 1', 'error');
      return;
    }
    if (form.startDate && form.deadline && form.deadline < form.startDate) {
      toast('Deadline phải sau hoặc bằng ngày bắt đầu (kiểm tra lại tháng)', 'error');
      return;
    }
    setBusy(true);
    const clean = { ...form };
    if (clean.qualityScore === undefined) delete clean.qualityScore;
    await onSave(clean);
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title={editing ? 'Sửa dự án' : 'Dự án mới'}>
      <div className="space-y-4">
        <Field label="Tên dự án">
          <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="VD: Chụp lookbook mùa hè" />
        </Field>
        <Field label="Mô tả">
          <Textarea rows={2} value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày bắt đầu">
            <Input type="date" value={form.startDate || ''} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Deadline">
            <Input type="date" min={form.startDate || undefined} value={form.deadline || ''} onChange={(e) => set('deadline', e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target ảnh">
              <Input type="number" min={0} value={form.photoTarget ?? 0} onChange={(e) => set('photoTarget', Number(e.target.value))} />
            </Field>
            <Field label="Target video">
              <Input type="number" min={0} value={form.videoTarget ?? 0} onChange={(e) => set('videoTarget', Number(e.target.value))} />
            </Field>
          </div>
          <p className="text-[11px] text-dim mt-1.5">* Cần khối lượng ở ít nhất 1 loại (ảnh hoặc video ≥ 1)</p>
        </div>
        <Field label="Tag màu">
          <TagSelect value={form.tagId} onChange={(id) => set('tagId', id)} scope={form.projectType === 'outsource' ? 'outsource' : ['inhouse-photo', 'inhouse-video', 'ecom']} autoSelect={form.projectType === 'outsource'} />
        </Field>
        {isProjectFinished(form.status || 'plan') && (
          <Field label="Điểm chất lượng (0–10)">
            <Input type="number" min={0} max={10} step={0.5} value={form.qualityScore ?? ''} onChange={(e) => set('qualityScore', e.target.value === '' ? undefined : Number(e.target.value))} />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button type="submit" disabled={busy || !form.title || !form.tagId}>
            {editing ? 'Lưu' : 'Tạo dự án'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
