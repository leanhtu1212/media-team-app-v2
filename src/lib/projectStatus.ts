import type { Project, ProjectStatus, Task } from '../types';

/** Trạng thái tự động; Done là trạng thái cuối, không tự mở lại. */
export function automaticProjectStatus(project: Project, tasks: Task[]): ProjectStatus | null {
  if (project.status === 'done') return null;
  const doneQty = (cat: string) => tasks
    .filter((t) => t.projectId === project.id && t.category === cat && (t.status === 'completed' || t.dntt))
    .reduce((sum, t) => sum + (Number(t.quantity) || 1), 0);
  const photos = doneQty('photo');
  const videos = doneQty('video');
  const photoTarget = Math.max(0, Number(project.photoTarget) || 0);
  const videoTarget = Math.max(0, Number(project.videoTarget) || 0);
  // Ảnh dư không bù được video thiếu (và ngược lại).
  if (photoTarget + videoTarget > 0 && photos >= photoTarget && videos >= videoTarget) {
    const costs = tasks.filter((t) => t.projectId === project.id && t.category === 'pre-production');
    return costs.every((t) => t.dntt) ? 'done' : 'payment';
  }
  return photos + videos >= 1 && (project.status === 'plan' || project.status === 'pre-production')
    ? 'post-production' : null;
}
