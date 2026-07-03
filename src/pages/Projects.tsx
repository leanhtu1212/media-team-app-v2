import { useMemo, useState } from 'react';
import { Plus, FolderKanban, Calendar, Camera, Video, Search, X } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Button, Card, Badge, STATUS_BADGE, STATUS_LABEL, ProgressBar, EmptyState, Modal, Input, Select, Textarea, Field } from '../components/ui';
import { createProject, updateProject } from '../lib/actions';
import { useToast } from '../hooks/useToast';
import { formatDate, todayStr, normalize, itemStatusFromProjectStatus, isProjectFinished } from '../lib/utils';
import type { Project, ProjectStatus } from '../types';
import type { User } from '../lib/firebase';

const COLUMNS: ProjectStatus[] = ['plan', 'pre-production', 'post-production', 'done', 'payment'];

export function ProjectsPage({
  user, onOpenProject, typeFilter, onTypeFilterChange,
}: {
  user: User;
  onOpenProject: (id: string) => void;
  typeFilter: 'inhouse' | 'outsource';
  onTypeFilterChange: (t: 'inhouse' | 'outsource') => void;
}) {
  const { projects, allTasks, productTypes, isEditor } = useAppData();
  const toast = useToast();
  const [showAllDone, setShowAllDone] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [dragOverCol, setDragOverCol] = useState<ProjectStatus | null>(null);

  // Legacy data may have projectType 'photo' | 'video' | undefined — treat everything
  // that is not explicitly 'outsource' as inhouse so no project is hidden.
  const filtered = useMemo(() => {
    const q = normalize(search);
    return projects.filter((p) => {
      if (typeFilter === 'outsource' ? p.projectType !== 'outsource' : p.projectType === 'outsource') return false;
      if (!q) return true;
      return normalize(`${p.title || ''} ${p.productType || ''} ${p.description || ''}`).includes(q);
    });
  }, [projects, typeFilter, search]);

  const handleDrop = async (projectId: string, status: ProjectStatus) => {
    const p = projects.find((x) => x.id === projectId);
    if (!p || p.status === status) return;
    try {
      // Status change drives itemStatus the same way ProjectDetail does
      await updateProject(projectId, { status, itemStatus: itemStatusFromProjectStatus(status) });
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
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Dự án</h1>
          <p className="text-sm text-muted">{filtered.length} dự án {typeFilter}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex bg-surface border border-line rounded-lg p-0.5">
            {(['inhouse', 'outsource'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onTypeFilterChange(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  typeFilter === t ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {t === 'inhouse' ? 'Inhouse' : 'Outsource'}
              </button>
            ))}
          </div>
          {isEditor && (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus size={15} /> Dự án mới
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {COLUMNS.map((status) => {
          // Unknown/legacy status values fall into the "plan" column so nothing is hidden
          const allColProjects = filtered.filter((p) =>
            status === 'plan' ? p.status === 'plan' || !COLUMNS.includes(p.status) : p.status === status,
          );
          // Done/Payment tích luỹ nhiều theo thời gian → thu gọn, chỉ hiện 5 đầu
          const doneHidden = isProjectFinished(status) && !showAllDone && allColProjects.length > 5;
          const colProjects = doneHidden ? allColProjects.slice(0, 5) : allColProjects;
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
                <span className="text-xs font-bold text-dim">{allColProjects.length}</span>
              </div>
              <div className="space-y-3">
                {colProjects.map((p) => {
                  const prog = progressOf(p);
                  return (
                    <Card
                      key={p.id}
                      draggable={isEditor}
                      onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/plain', p.id)}
                      className="p-4 hover:border-line-2 transition-all cursor-pointer group"
                    >
                      <div onClick={() => onOpenProject(p.id)}>
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
                })}
                {doneHidden && (
                  <button onClick={() => setShowAllDone(true)} className="w-full text-xs text-muted hover:text-ink py-2 cursor-pointer">
                    Xem tất cả ({allColProjects.length})
                  </button>
                )}
                {colProjects.length === 0 && (
                  <div className="border border-dashed border-line rounded-xl py-8 text-center text-xs text-dim">Trống</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && <EmptyState icon={<FolderKanban size={32} />} text="Chưa có dự án nào" />}

      <ProjectFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        productTypes={productTypes.map((t) => t.name)}
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
  open, onClose, editing, productTypes, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: Project | null;
  productTypes: string[];
  onSave: (data: Partial<Project>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Project>>({});
  const [busy, setBusy] = useState(false);

  // Reset form when opening
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setForm(editing ? { ...editing } : { status: 'plan', projectType: 'inhouse', photoTarget: 0, videoTarget: 0 });
    setLastOpen(true);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const set = (k: keyof Project, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (busy || !form.title) return;
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
          <Field label="Trạng thái">
            <Select value={form.status || 'plan'} onChange={(e) => set('status', e.target.value)}>
              <option value="plan">Kế hoạch</option>
              <option value="pre-production">Tiền kỳ</option>
              <option value="post-production">Hậu kỳ</option>
              <option value="done">Hoàn thành</option>
              <option value="payment">Thanh toán</option>
            </Select>
          </Field>
          <Field label="Loại dự án">
            <Select value={form.projectType || 'inhouse'} onChange={(e) => set('projectType', e.target.value)}>
              <option value="inhouse">Inhouse</option>
              <option value="outsource">Outsource</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại sản phẩm">
            <Select value={form.productType || ''} onChange={(e) => set('productType', e.target.value)}>
              <option value="">— Tuỳ chỉnh —</option>
              {productTypes.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Deadline">
            <Input type="date" value={form.deadline || ''} onChange={(e) => set('deadline', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target ảnh">
            <Input type="number" min={0} value={form.photoTarget ?? 0} onChange={(e) => set('photoTarget', Number(e.target.value))} />
          </Field>
          <Field label="Target video">
            <Input type="number" min={0} value={form.videoTarget ?? 0} onChange={(e) => set('videoTarget', Number(e.target.value))} />
          </Field>
        </div>
        {isProjectFinished(form.status || 'plan') && (
          <Field label="Điểm chất lượng (0–10)">
            <Input type="number" min={0} max={10} step={0.5} value={form.qualityScore ?? ''} onChange={(e) => set('qualityScore', e.target.value === '' ? undefined : Number(e.target.value))} />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button type="submit" disabled={busy || !form.title}>
            {editing ? 'Lưu' : 'Tạo dự án'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
