import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Pencil, Camera, Video, Wallet, Star, CheckCircle2, Circle, Calendar, Package, FileText, Check, TrendingUp, ExternalLink } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Button, Card, Badge, STATUS_BADGE, STATUS_LABEL, ProgressBar, Modal, Input, Select, Textarea, Field, ConfirmDialog, Avatar, Drawer } from '../components/ui';
import { updateProject, deleteProject, createTask, updateTask, deleteTask, toggleDntt, danhDauTaskDaLamHopDong } from '../lib/actions';
import { ContractFormModal, useContractConfig } from '../components/ContractFormModal';
import type { ContractForm } from '../lib/contracts/compute';
import { fmtSo } from '../lib/contracts/money';
import { formatVND, formatDate, todayStr, isProjectFinished } from '../lib/utils';
import { useToast } from '../hooks/useToast';
import { ProjectFormModal } from './Projects';
import type { Task, TaskCategory, Project, ProjectStatus } from '../types';
import type { User } from '../lib/firebase';

export function ProjectDetailPage({ projectId, user, onBack }: { projectId: string; user: User; onBack: () => void }) {
  const { projects, allTasks, members, isAdmin, isEditor } = useAppData();
  const toast = useToast();
  const project = projects.find((p) => p.id === projectId);

  const [taskModal, setTaskModal] = useState<{ open: boolean; category: TaskCategory; editing: Task | null }>({ open: false, category: 'photo', editing: null });
  // Form HĐ đang mở cho khoản chi nào. Object mới mỗi lần mở = ContractFormModal nạp lại form.
  const [hopDong, setHopDong] = useState<{ taskId: string; form: ContractForm } | null>(null);
  const cauHinhHd = useContractConfig();
  const moFormHopDong = (taskId: string, form: ContractForm) => setHopDong({ taskId, form });
  const [editProject, setEditProject] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'project' | 'task'; task?: Task } | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const tasks = useMemo(() => allTasks.filter((t) => t.projectId === projectId), [allTasks, projectId]);

  // Tự chuyển trạng thái theo tiến độ + thanh toán chi phí (editor mới có quyền ghi):
  //  - Giao thành phẩm ĐẦU TIÊN (≥1 ảnh/video) → "Hậu kỳ" (đã chụp/quay xong = hết tiền kỳ)
  //  - Tiến độ 100% + còn chi phí CHƯA thanh toán → "Thanh toán"
  //  - Tiến độ 100% + đã thanh toán hết (hoặc không có chi phí nào) → "Hoàn thành"
  //  - "Done" là terminal, không tự đổi nữa.
  useEffect(() => {
    if (!isEditor || !project || project.status === 'done') return;
    const doneQty = (cat: string) =>
      tasks.filter((t) => t.category === cat && (t.status === 'completed' || t.dntt)).reduce((s, t) => s + (Number(t.quantity) || 1), 0);
    const delivered = doneQty('photo') + doneQty('video');
    const target = (project.photoTarget || 0) + (project.videoTarget || 0);

    let desired: ProjectStatus | null = null;
    if (target > 0 && delivered >= target) {
      const costs = tasks.filter((t) => t.category === 'pre-production');
      desired = (costs.length === 0 || costs.every((t) => t.dntt)) ? 'done' : 'payment';
    } else if (delivered >= 1 && (project.status === 'plan' || project.status === 'pre-production')) {
      desired = 'post-production';
    }

    if (!desired || desired === project.status) return;
    updateProject(project.id, { status: desired }, { prev: project }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, project?.id, project?.status, project?.photoTarget, project?.videoTarget, isEditor]);

  if (!project) {
    return (
      <div className="text-center py-20 text-muted">
        <p>Không tìm thấy dự án</p>
        <Button variant="ghost" onClick={onBack} className="mt-3"><ArrowLeft size={15} /> Quay lại</Button>
      </div>
    );
  }

  const memberOf = (uid?: string) => members.find((m) => m.uid === uid || m.id === uid);

  const photoTasks = tasks.filter((t) => t.category === 'photo');
  const videoTasks = tasks.filter((t) => t.category === 'video');
  const preTasks = tasks.filter((t) => t.category === 'pre-production');

  const doneCount = (list: Task[]) =>
    list.filter((t) => t.status === 'completed' || t.dntt).reduce((s, t) => s + (Number(t.quantity) || 1), 0);

  const photoDone = doneCount(photoTasks);
  const videoDone = doneCount(videoTasks);
  const totalCost = preTasks.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const TaskTable = ({ list, category }: { list: Task[]; category: TaskCategory }) => (
    <div className="divide-y divide-line">
      {list.length === 0 && <p className="text-sm text-dim py-4 text-center">Chưa có task nào</p>}
      {list.map((t) => {
        const creator = memberOf(t.createdBy);
        return (
          <div
            key={t.id}
            onDoubleClick={() => setDetailTask(t)}
            title="Nhấn đúp để xem chi tiết"
            className="flex items-center gap-3 py-2.5 group cursor-default select-none"
          >
            {category === 'pre-production' && (
              <button
                onClick={() => isAdmin && toggleDntt(t).then(() => toast(t.dntt ? 'Đã bỏ thanh toán' : 'Đã đánh dấu thanh toán')).catch((e) => toast(`Lỗi: ${e.message}`, 'error'))}
                disabled={!isAdmin}
                title="Đã nộp tờ trình"
                className="shrink-0 cursor-pointer disabled:cursor-default"
              >
                {t.dntt ? <CheckCircle2 size={18} className="text-emerald-400" /> : <Circle size={18} className="text-dim hover:text-muted" />}
              </button>
            )}
            <Avatar name={creator?.username} url={creator?.avatarUrl} size={24} />
            <div className="flex-1 min-w-0">
              {category === 'pre-production' ? (
                <p className="text-sm font-medium truncate">{t.title}</p>
              ) : t.link ? (
                <a href={t.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={t.link} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200 underline underline-offset-2 truncate flex items-center gap-1">
                  <ExternalLink size={13} className="shrink-0" />
                  <span className="truncate">{t.quantity || 1} {category === 'photo' ? 'ảnh' : 'video'}</span>
                </a>
              ) : (
                <p className="text-sm font-semibold truncate">{t.quantity || 1} {category === 'photo' ? 'ảnh' : 'video'}</p>
              )}
              <div className="flex items-center gap-2 text-[11px] text-dim">
                <span>{formatDate(t.reportDate)}</span>
                {category === 'pre-production' && t.deadline && <span className="flex items-center gap-0.5"><Calendar size={10} /> {formatDate(t.deadline)}</span>}
                {category === 'pre-production' && (t.difficulty || 0) > 1 && (
                  <span className="flex items-center gap-0.5 text-amber-400"><Star size={10} /> {t.difficulty}</span>
                )}
              </div>
            </div>
            {category === 'pre-production' && (Number(t.amount) || 0) > 0 && (
              <span className="text-sm font-bold text-amber-300 tabular-nums">{formatVND(Number(t.amount) || 0)}</span>
            )}
            {isEditor && (
              <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => setTaskModal({ open: true, category, editing: t })} className="text-muted hover:text-ink cursor-pointer p-1"><Pencil size={13} /></button>
                <button onClick={() => setConfirmDelete({ type: 'task', task: t })} className="text-muted hover:text-red-400 cursor-pointer p-1"><Trash2 size={13} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const SectionHeader = ({ icon, title, extra, category }: { icon: React.ReactNode; title: string; extra?: React.ReactNode; category: TaskCategory }) => (
    <div className="flex items-center justify-between px-4 py-3 border-b border-line">
      <div className="flex items-center gap-2 font-bold text-sm">{icon}{title}</div>
      <div className="flex items-center gap-3">
        {extra}
        {isEditor && (
          <button onClick={() => setTaskModal({ open: true, category, editing: null })} className="text-muted hover:text-ink cursor-pointer">
            <Plus size={16} />
          </button>
        )}
      </div>
    </div>
  );

  /** Full-width section: header + count badge + progress bar + task list (khớp layout bản cũ). */
  const TaskSection = ({ icon, title, category, done, target, list }: { icon: React.ReactNode; title: string; category: TaskCategory; done: number; target: number; list: Task[] }) => {
    const pct = target > 0 ? (done / target) * 100 : 0;
    return (
      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div className="flex items-center gap-2 font-bold text-sm">
            {icon}{title}
            <span className="text-[11px] font-bold text-dim bg-bg border border-line rounded px-1.5 py-0.5 tabular-nums">{done}/{target || '—'}</span>
          </div>
          {isEditor && (
            <button onClick={() => setTaskModal({ open: true, category, editing: null })} className="text-muted hover:text-ink cursor-pointer">
              <Plus size={16} />
            </button>
          )}
        </div>
        {target > 0 && (
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted">Tiến độ</span>
              <span className="text-xs font-bold tabular-nums">{Math.round(pct)}%</span>
            </div>
            <ProgressBar value={pct} />
          </div>
        )}
        <div className="px-4 py-2">{<TaskTable list={list} category={category} />}</div>
      </Card>
    );
  };

  return (
    <div className="fade-up space-y-5">
      {/* Thanh tiêu đề DÍNH TRÊN: cuộn xuống vẫn thấy tên dự án + nút quay lại.
          Âm lề ngang + padding bù để nền phủ hết bề rộng khung nội dung (main có padding). */}
      <div className="sticky top-0 z-40 -mx-4 lg:-mx-8 px-4 lg:px-8 -mt-4 lg:-mt-8 pt-4 lg:pt-8 pb-3 bg-bg/95 backdrop-blur border-b border-line flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" onClick={onBack} className="!px-2 shrink-0"><ArrowLeft size={17} /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">{project.title}</h1>
              <Badge color={STATUS_BADGE[project.status]}>{STATUS_LABEL[project.status]}</Badge>
            </div>
            {project.deadline && (() => {
              const overdue = !isProjectFinished(project.status) && project.deadline! < todayStr();
              return <p className={`text-xs mt-1 ${overdue ? 'text-red-400 font-bold' : 'text-muted'}`}><Calendar size={11} className="inline mr-1" />Deadline: {formatDate(project.deadline)}{overdue && ' — QUÁ HẠN'}</p>;
            })()}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => setEditProject(true)}><Pencil size={14} /> <span className="hidden xs:inline">Sửa</span></Button>
            <Button variant="danger" onClick={() => setConfirmDelete({ type: 'project' })}><Trash2 size={14} /></Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Main column — các danh sách task, full width như bản cũ */}
        <div className="space-y-4 min-w-0">
          {/* Dự án chỉ làm video thì không hiện khối Ảnh và ngược lại.
              Khi CẢ HAI đều chưa có chỉ tiêu lẫn task (dự án mới) thì vẫn hiện đủ 2 khối,
              không thì không còn chỗ nào để thêm task đầu tiên. */}
          {(() => {
            const hasPhoto = (project.photoTarget || 0) > 0 || photoTasks.length > 0;
            const hasVideo = (project.videoTarget || 0) > 0 || videoTasks.length > 0;
            const blank = !hasPhoto && !hasVideo;
            return (
              <>
                {(hasPhoto || blank) && (
                  <TaskSection
                    icon={<Camera size={15} className="text-indigo-300" />}
                    title="Ảnh"
                    category="photo"
                    done={photoDone}
                    target={project.photoTarget || 0}
                    list={photoTasks}
                  />
                )}
                {(hasVideo || blank) && (
                  <TaskSection
                    icon={<Video size={15} className="text-violet-300" />}
                    title="Video"
                    category="video"
                    done={videoDone}
                    target={project.videoTarget || 0}
                    list={videoTasks}
                  />
                )}
              </>
            );
          })()}
          {isAdmin && (
            <Card>
              <SectionHeader
                icon={<Wallet size={15} className="text-amber-300" />}
                title="Chi phí"
                category="pre-production"
                extra={<span className="text-xs font-bold text-amber-300 tabular-nums">{formatVND(totalCost)}</span>}
              />
              <div className="px-4 pb-2">{<TaskTable list={preTasks} category="pre-production" />}</div>
            </Card>
          )}
        </div>

        {/* Sidebar — thông tin dự án + tiến độ + chi phí */}
        <div className="space-y-4">
          <InfoPanel
            project={project}
            isEditor={isEditor}
            toast={toast}
            user={user}
            creator={memberOf(project.createdBy)}
            assignees={(project.assigneeIds || []).map((id) => memberOf(id)).filter((m): m is NonNullable<typeof m> => !!m)}
          />

          {(() => {
            // Chỉ hiện loại có mục tiêu (hoặc đã có sản lượng): dự án chỉ-ảnh không hiện video & ngược lại.
            const showPhoto = (project.photoTarget || 0) > 0 || photoDone > 0;
            const showVideo = (project.videoTarget || 0) > 0 || videoDone > 0;
            if (!showPhoto && !showVideo) return null;
            return (
              <Card className="p-4">
                <h2 className="font-bold text-sm mb-3 flex items-center gap-2"><TrendingUp size={15} className="text-emerald-400" /> Tiến độ</h2>
                <div className="space-y-3">
                  {showPhoto && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-muted flex items-center gap-1.5"><Camera size={12} /> Ảnh</span>
                        <span className="text-xs font-bold tabular-nums">{photoDone}/{project.photoTarget || 0}</span>
                      </div>
                      <ProgressBar value={(project.photoTarget || 0) > 0 ? (photoDone / (project.photoTarget || 1)) * 100 : 0} />
                    </div>
                  )}
                  {showVideo && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-muted flex items-center gap-1.5"><Video size={12} /> Video</span>
                        <span className="text-xs font-bold tabular-nums">{videoDone}/{project.videoTarget || 0}</span>
                      </div>
                      <ProgressBar value={(project.videoTarget || 0) > 0 ? (videoDone / (project.videoTarget || 1)) * 100 : 0} />
                    </div>
                  )}
                </div>
              </Card>
            );
          })()}

          {isAdmin && (
            <Card className="p-4">
              <span className="text-xs font-bold text-muted uppercase flex items-center gap-1.5"><Wallet size={13} className="text-amber-300" /> Tổng chi phí</span>
              <p className="text-2xl font-extrabold tabular-nums text-amber-300 mt-1.5">{formatVND(totalCost)}</p>
              <p className="text-[11px] text-dim mt-1.5">{preTasks.filter((t) => t.dntt).length}/{preTasks.length} đã duyệt DNTT</p>
            </Card>
          )}
        </div>
      </div>

      <TaskFormModal
        state={taskModal}
        projectTitle={project.title}
        onClose={() => setTaskModal((s) => ({ ...s, open: false }))}
        onSave={async (data) => {
          try {
            let taskId = taskModal.editing?.id || '';
            if (taskModal.editing) {
              await updateTask(projectId, taskModal.editing.id, data, { prev: taskModal.editing, user, projectTitle: project.title });
              toast('Đã cập nhật task');
            } else {
              const isPre = taskModal.category === 'pre-production';
              taskId = await createTask(
                { ...data, projectId, category: taskModal.category, title: data.title || project.title, status: isPre ? 'pending' : 'completed' },
                user,
                project.title,
              );
              toast(isPre ? 'Đã thêm khoản chi' : 'Đã thêm — báo cáo tự động được tạo');
            }
            setTaskModal((s) => ({ ...s, open: false }));
            // Tick "có làm HĐ" → mở luôn form hợp đồng, số tiền + nội dung lấy từ khoản chi.
            // Không sinh file thì khoản chi vẫn còn đó, chỉ là chưa có hopDongDaLam.
            if (data.hopDong && !data.hopDongDaLam) {
              moFormHopDong(taskId, {
                // Format sẵn dấu chấm nghìn cho khớp ô Tiền NET của form HĐ.
                net: fmtSo(Number(data.amount) || 0),
                noi_dung: data.title || project.title,
              });
            }
          } catch (e: unknown) {
            toast(`Lỗi: ${(e as Error).message}`, 'error');
          }
        }}
      />

      {/* Form HĐ dùng chung với tab Hợp đồng — mở ngay tại đây để không mất ngữ cảnh dự án. */}
      <ContractFormModal
        open={!!hopDong}
        onClose={() => setHopDong(null)}
        tieuDe={`Hợp đồng — ${project.title}`}
        settings={cauHinhHd.settings}
        webhookUrl={cauHinhHd.webhookUrl}
        token={cauHinhHd.token}
        formBanDau={hopDong?.form ?? {}}
        hienODan
        onTaoXong={async (hoTen) => {
          if (hopDong?.taskId) await danhDauTaskDaLamHopDong(projectId, hopDong.taskId, hoTen);
        }}
      />

      {editProject && (
        <ProjectFormModal
          open={editProject}
          onClose={() => setEditProject(false)}
          editing={project}
          onSave={async (data) => {
            try {
              await updateProject(project.id, data, { prev: project, user });
              toast('Đã cập nhật dự án');
              setEditProject(false);
            } catch (e: unknown) {
              toast(`Lỗi: ${(e as Error).message}`, 'error');
            }
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete?.type === 'project' ? 'Xoá dự án?' : 'Xoá task?'}
        message={confirmDelete?.type === 'project'
          ? `Xoá "${project.title}" và không thể khôi phục.`
          : `Xoá task "${confirmDelete?.task?.title}"?`}
        onConfirm={async () => {
          try {
            if (confirmDelete?.type === 'project') {
              await deleteProject(project.id, project.title);
              toast('Đã xoá dự án');
              onBack();
            } else if (confirmDelete?.task) {
              if (confirmDelete.task.sourceReportId) {
                const { deleteReport } = await import('../lib/actions');
                try { await deleteReport(confirmDelete.task.sourceReportId); } catch { /* already gone */ }
              }
              await deleteTask(projectId, confirmDelete.task.id);
              toast('Đã xoá task');
            }
          } catch (e: unknown) {
            toast(`Lỗi: ${(e as Error).message}`, 'error');
          }
        }}
      />

      <TaskDetailDrawer
        task={detailTask}
        creator={detailTask ? memberOf(detailTask.createdBy) : undefined}
        projectTitle={project.title}
        canEdit={isEditor}
        onClose={() => setDetailTask(null)}
        onEdit={(t) => { setDetailTask(null); setTaskModal({ open: true, category: t.category, editing: t }); }}
        onDelete={(t) => { setDetailTask(null); setConfirmDelete({ type: 'task', task: t }); }}
      />
    </div>
  );
}

/* ---------- Task detail drawer (trượt từ trái) ---------- */
function TaskDetailDrawer({
  task, creator, projectTitle, canEdit, onClose, onEdit, onDelete,
}: {
  task: Task | null;
  creator?: { username?: string; avatarUrl?: string };
  projectTitle: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  if (!task) return null;
  const isPre = task.category === 'pre-production';
  const catLabel = isPre ? 'Chi phí' : task.category === 'photo' ? 'Ảnh' : 'Video';
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-line">
      <span className="text-xs font-bold text-muted uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-sm text-ink text-right break-words min-w-0">{children}</span>
    </div>
  );
  return (
    <Drawer
      open={!!task}
      onClose={onClose}
      side="left"
      title={<div>
        <p className="font-extrabold truncate">{task.title || projectTitle}</p>
        <p className="text-xs text-muted">{catLabel}</p>
      </div>}
      headerExtra={canEdit ? (
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onEdit(task)} title="Sửa" className="text-muted hover:text-ink cursor-pointer p-1"><Pencil size={16} /></button>
          <button type="button" onClick={() => onDelete(task)} title="Xoá" className="text-muted hover:text-red-400 cursor-pointer p-1"><Trash2 size={16} /></button>
        </div>
      ) : undefined}
    >
      <div className="space-y-0.5">
        <Row label="Trạng thái"><Badge color={STATUS_BADGE[task.status] || STATUS_BADGE.pending}>{STATUS_LABEL[task.status] || task.status}</Badge></Row>
        <Row label="Ngày báo cáo">{formatDate(task.reportDate)}</Row>
        {isPre ? (
          <>
            <Row label="Chi phí"><span className="font-bold text-amber-300">{formatVND(Number(task.amount) || 0)}</span></Row>
            {task.deadline && <Row label="Deadline">{formatDate(task.deadline)}</Row>}
            {(task.difficulty || 0) > 1 && <Row label="Độ khó">{task.difficulty}/5</Row>}
            <Row label="Đã thanh toán">{task.dntt ? <span className="text-emerald-400 font-bold">Rồi</span> : <span className="text-dim">Chưa</span>}</Row>
            {task.description && (
              <div className="pt-2">
                <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1">Mô tả</p>
                <p className="text-sm text-muted whitespace-pre-wrap break-words">{task.description}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <Row label="Số lượng">×{task.quantity || 1}</Row>
            {task.link && (
              <Row label="Link thành phẩm">
                <a href={task.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 underline underline-offset-2 break-all">
                  <ExternalLink size={13} className="shrink-0" /> {task.link}
                </a>
              </Row>
            )}
          </>
        )}
        <Row label="Người tạo">
          <span className="inline-flex items-center gap-1.5">
            <Avatar name={creator?.username} url={creator?.avatarUrl} size={20} />
            {creator?.username || '—'}
          </span>
        </Row>
        {task.sourceReportId && <Row label="Báo cáo"><span className="text-indigo-300">Đã liên kết báo cáo tự động</span></Row>}
      </div>
      {Array.isArray(task.images) && task.images.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Ảnh ({task.images.length})</p>
          <div className="grid grid-cols-3 gap-2">
            {task.images.map((src, i) => (
              <img key={i} src={src} alt="" className="w-full aspect-square object-cover rounded-lg border border-line" />
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ---------- Info panel (thông tin dự án) ---------- */
function InfoPanel({ project, isEditor, toast, user, creator, assignees }: { project: Project; isEditor: boolean; toast: (m: string, t?: 'success' | 'error') => void; user: User; creator?: { username?: string; avatarUrl?: string }; assignees?: { username?: string; avatarUrl?: string }[] }) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(project.description || '');
  const [savingDesc, setSavingDesc] = useState(false);
  const [editingPhotoLink, setEditingPhotoLink] = useState(false);
  const [photoLinkDraft, setPhotoLinkDraft] = useState(project.photoLink || '');
  const [savingPhotoLink, setSavingPhotoLink] = useState(false);

  const setField = async (data: Partial<Project>, ok: string) => {
    try { await updateProject(project.id, data, { prev: project, user }); toast(ok); }
    catch (e: unknown) { toast(`Lỗi: ${(e as Error).message}`, 'error'); }
  };

  return (
    <Card className="p-5">
      <h2 className="font-bold text-base flex items-center gap-2 mb-4"><FileText size={17} className="text-blue-400" /> Thông tin dự án</h2>

      {/* Mô tả */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">Mô tả</p>
          {isEditor && !editingDesc && (
            <button onClick={() => { setDescDraft(project.description || ''); setEditingDesc(true); }} className="text-muted hover:text-ink cursor-pointer"><Pencil size={13} /></button>
          )}
        </div>
        {editingDesc ? (
          <div className="space-y-2">
            <Textarea rows={3} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} autoFocus />
            <div className="flex gap-2">
              <Button variant="primary" className="!py-1.5 !px-3 !text-xs" disabled={savingDesc} onClick={async () => { setSavingDesc(true); await setField({ description: descDraft }, 'Đã lưu mô tả'); setSavingDesc(false); setEditingDesc(false); }}><Check size={13} /> Lưu</Button>
              <Button variant="ghost" className="!py-1.5 !px-3 !text-xs" onClick={() => setEditingDesc(false)}>Huỷ</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted break-words">{project.description ? <Linkify text={project.description} /> : <span className="text-dim">Không có mô tả</span>}</p>
        )}
      </div>

      {/* Link Ảnh */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">Link Ảnh</p>
          {isEditor && !editingPhotoLink && project.photoLink && (
            <button onClick={() => { setPhotoLinkDraft(project.photoLink || ''); setEditingPhotoLink(true); }} className="text-muted hover:text-ink cursor-pointer"><Pencil size={13} /></button>
          )}
        </div>
        {editingPhotoLink || !project.photoLink ? (
          isEditor ? (
            <div className="space-y-2">
              <Input value={photoLinkDraft} onChange={(e) => setPhotoLinkDraft(e.target.value)} placeholder="Dán link album/thư mục ảnh rồi nhấn Lưu" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!savingPhotoLink) { setSavingPhotoLink(true); setField({ photoLink: photoLinkDraft.trim() }, 'Đã lưu link ảnh').finally(() => { setSavingPhotoLink(false); setEditingPhotoLink(false); }); } } }} />
              <div className="flex gap-2">
                <Button variant="primary" className="!py-1.5 !px-3 !text-xs" disabled={savingPhotoLink} onClick={async () => { setSavingPhotoLink(true); await setField({ photoLink: photoLinkDraft.trim() }, 'Đã lưu link ảnh'); setSavingPhotoLink(false); setEditingPhotoLink(false); }}><Check size={13} /> Lưu</Button>
                {editingPhotoLink && <Button variant="ghost" className="!py-1.5 !px-3 !text-xs" onClick={() => setEditingPhotoLink(false)}>Huỷ</Button>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-dim">Chưa có link ảnh</p>
          )
        ) : (
          <a href={project.photoLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-indigo-300 hover:text-indigo-200 underline underline-offset-2 break-all">
            <ExternalLink size={13} className="shrink-0" /> {project.photoLink}
          </a>
        )}
      </div>

      {/* Grid: Sản phẩm / Deadline / Loại dự án */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Sản phẩm</p>
          <p className="text-lg font-extrabold flex items-center gap-1.5"><Package size={15} className="text-muted" />{project.productCount || 1} SP</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Deadline</p>
          <p className="text-sm font-bold">{project.deadline ? formatDate(project.deadline) : <span className="text-dim">Chưa đặt</span>}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Loại dự án</p>
          <Badge color="bg-violet-500/15 text-violet-300">{(project.projectType || 'inhouse').toUpperCase()}</Badge>
        </div>
      </div>

      {/* Người phụ trách (1 hoặc nhiều) */}
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1.5">Người phụ trách</p>
        {assignees && assignees.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {assignees.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 bg-bg border border-line rounded-full pl-1 pr-2.5 py-0.5">
                <Avatar name={a.username} url={a.avatarUrl} size={20} />
                <span className="text-xs font-bold">{a.username || '—'}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-dim">Chưa gán</p>
        )}
      </div>

      {/* Người tạo dự án */}
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1.5">Người tạo</p>
        <div className="flex items-center gap-2">
          <Avatar name={creator?.username} url={creator?.avatarUrl} size={22} />
          <span className="text-sm font-bold">{creator?.username || 'Không rõ'}</span>
        </div>
      </div>

      {/* Trạng thái dự án */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1.5">Trạng thái</p>
        <Select
          value={project.status}
          disabled={!isEditor}
          onChange={(e) => setField({ status: e.target.value as Project['status'] }, 'Đã cập nhật trạng thái')}
          className="!font-bold !w-auto"
        >
          <option value="plan">Kế hoạch</option>
          <option value="pre-production">Tiền kỳ</option>
          <option value="post-production">Hậu kỳ</option>
          <option value="payment">Thanh toán</option>
          <option value="done">Hoàn thành</option>
        </Select>
      </div>
    </Card>
  );
}

/** Render text with URLs as clickable links (open in new tab). */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function TaskFormModal({
  state, projectTitle, onClose, onSave,
}: {
  state: { open: boolean; category: TaskCategory; editing: Task | null };
  projectTitle: string;
  onClose: () => void;
  onSave: (data: Partial<Task> & { title?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Task>>({});
  const [busy, setBusy] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (state.open && !lastOpen) {
    setForm(state.editing ? { ...state.editing } : { quantity: 1, reportDate: todayStr(), difficulty: 1 });
    setLastOpen(true);
  } else if (!state.open && lastOpen) {
    setLastOpen(false);
  }

  const set = (k: keyof Task, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const isPre = state.category === 'pre-production';
  const laHopDong = !!form.hopDong;
  // Chỉ VIDEO bắt buộc link thành phẩm; ảnh & chi phí thì không.
  const invalid = (isPre && !form.title) || (state.category === 'video' && !form.link?.trim());
  const submit = async () => {
    if (busy || invalid) return;
    setBusy(true);
    await onSave(form);
    setBusy(false);
  };

  return (
    <Modal open={state.open} onClose={onClose} onSubmit={submit} title={state.editing ? 'Sửa task' : `Thêm ${isPre ? 'chi phí' : state.category === 'photo' ? 'ảnh' : 'video'}`}>
      <div className="space-y-4">
        {isPre ? (
          <Field label="Tên khoản chi">
            <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="VD: Thuê studio" autoFocus />
          </Field>
        ) : (
          !state.editing && (
            <p className="text-xs text-muted bg-bg border border-line rounded-lg px-3 py-2.5">
              Task sẽ mang tên project: <span className="font-bold text-ink">{projectTitle}</span>
            </p>
          )
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày báo cáo">
            <Input type="date" value={form.reportDate || ''} onChange={(e) => set('reportDate', e.target.value)} />
          </Field>
          {isPre ? (
            <Field label="Chi phí (VND)">
              {/* Text + inputMode numeric: nhận số lẻ bất kỳ (19.852.341), tự format dấu chấm nghìn */}
              <Input
                inputMode="numeric"
                value={(Number(form.amount) || 0).toLocaleString('vi-VN')}
                onChange={(e) => set('amount', Number(e.target.value.replace(/\D/g, '')) || 0)}
                onFocus={(e) => e.target.select()}
              />
            </Field>
          ) : (
            <Field label="Số lượng">
              <Input type="number" min={1} autoFocus value={form.quantity ?? 1} onChange={(e) => set('quantity', Math.max(1, Number(e.target.value)))} onFocus={(e) => e.target.select()} />
            </Field>
          )}
        </div>
        {isPre ? (
          <>
            <Field label="Mô tả">
              <Textarea rows={2} value={form.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="Ghi chú thêm về khoản chi (không bắt buộc)" />
            </Field>
            {/* Tick = lưu khoản chi xong mở luôn form HĐ, số tiền + nội dung điền sẵn từ đây. */}
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={laHopDong}
                onChange={(e) => set('hopDong', e.target.checked)}
              />
              <span>
                <span className="font-medium">Có làm hợp đồng cho khoản chi này</span>
                <span className="block text-xs text-dim">
                  {form.hopDongDaLam
                    ? 'Đã sinh file HĐ/BBNT cho khoản chi này.'
                    : 'Bấm Thêm xong sẽ mở form điền thông tin đối tác để tạo HĐ + BBNT ngay.'}
                </span>
              </span>
            </label>
          </>
        ) : (
          <Field label={<>Link thành phẩm {state.category === 'video' && <span className="text-red-400">*</span>}</>}>
            <Input value={form.link || ''} onChange={(e) => set('link', e.target.value)} placeholder={state.category === 'video' ? 'Dán link video (bắt buộc)' : 'Dán link ảnh (không bắt buộc)'} required={state.category === 'video'} />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button type="submit" disabled={busy || invalid}>
            {state.editing ? 'Lưu' : 'Thêm'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
