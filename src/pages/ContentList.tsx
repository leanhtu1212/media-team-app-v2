import { useMemo, useState } from 'react';
import { Search, X, CheckSquare, Square, ExternalLink, ListVideo, Calendar, ChevronRight, FolderKanban } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Card, Badge, STATUS_BADGE, STATUS_LABEL, ProgressBar, EmptyState, Input, Avatar } from '../components/ui';
import { formatDate, monthLabel, normalize, todayStr, tsToDateStr, contentOwnerId } from '../lib/utils';
import { setContentItemUsed, setTaskUsed } from '../lib/actions';
import { useToast } from '../hooks/useToast';
import { PLATFORM_COLOR, itemsDone, contentTarget, contentProgress } from './DailyContent';
import type { DailyContent, Project, Task } from '../types';
import type { User } from '../lib/firebase';

/* ================================================================
 * "DS Content" — mọi VIDEO team đã làm, gom về một danh sách để bên
 * content biết cái nào đã đăng. Gồm 2 nguồn:
 *   1. Daily content + các video con editor trả
 *   2. DỰ ÁN có task video — content cũng là người đăng video của dự án
 * Nhóm theo tháng, mới nhất trước. Chỉ admin + role 'content' vào được.
 *
 * Ô tick = "đã sử dụng" (`used`), KHÁC HOÀN TOÀN với việc editor đã trả video
 * (`ContentItem.done` / task completed) — không đụng tiến độ, báo cáo hay KPI.
 * ================================================================ */

/** Một thẻ trong danh sách: content hoặc dự án. `date` dùng để xếp tháng + sắp thứ tự. */
type Entry =
  | { kind: 'content'; key: string; date: string; content: DailyContent }
  | { kind: 'project'; key: string; date: string; project: Project; videos: Task[] };

/** Ngày của một video dự án: ngày báo cáo → deadline → ngày tạo. */
const videoDate = (t: Task) => t.reportDate || t.deadline || tsToDateStr(t.createdAt) || '';

export function ContentListPage({ user, onOpenContent, onOpenProject }: {
  user: User;
  onOpenContent: (id: string) => void;
  onOpenProject: (id: string) => void;
}) {
  const { dailyContent, projects, allTasks, members, canEditDaily } = useAppData();
  const toast = useToast();
  const [search, setSearch] = useState('');
  // Hai phần tách riêng: video của NỘI DUNG và video của DỰ ÁN — trộn chung thì khó dò
  const [tab, setTab] = useState<'content' | 'project'>('content');
  const today = todayStr();

  const memberOf = (id?: string) => members.find((m) => m.uid === id || m.id === id);

  const fail = (e: unknown) => toast(`Lỗi: ${(e as Error).message}`, 'error');
  const toggleItemUsed = (d: DailyContent, itemId: string, used: boolean) => {
    if (canEditDaily) setContentItemUsed(d, itemId, used, user).catch(fail);
  };
  const toggleTaskUsed = (t: Task, used: boolean) => {
    if (canEditDaily) setTaskUsed(t, used, user).catch(fail);
  };

  // Gộp 2 nguồn thành một danh sách thẻ
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = dailyContent.map((d) => ({
      kind: 'content',
      key: `c_${d.id}`,
      date: d.dueDate || d.orderDate || tsToDateStr(d.createdAt) || '',
      content: d,
    }));

    // Dự án CÓ video mới hiện — dự án chỉ chụp ảnh thì content không đăng nên bỏ qua.
    for (const p of projects) {
      const videos = allTasks
        .filter((t) => t.projectId === p.id && t.category === 'video')
        .sort((a, b) => videoDate(b).localeCompare(videoDate(a)));
      if (videos.length === 0) continue;
      list.push({
        kind: 'project',
        key: `p_${p.id}`,
        date: videoDate(videos[0]) || p.deadline || tsToDateStr(p.createdAt) || '',
        project: p,
        videos,
      });
    }
    return list;
  }, [dailyContent, projects, allTasks]);

  // Tìm không dấu: khớp cả tên thẻ lẫn tên/link từng video. Chỉ tìm trong phần đang mở.
  const filtered = useMemo(() => {
    const inTab = entries.filter((e) => e.kind === tab);
    const q = normalize(search);
    if (!q) return inTab;
    return inTab.filter((e) => {
      const hay = e.kind === 'content'
        ? `${e.content.title} ${e.content.type} ${e.content.platform} ${(e.content.items || []).map((i) => `${i.title} ${i.link || ''}`).join(' ')}`
        : `${e.project.title} ${e.project.productType || ''} ${e.videos.map((t) => `${t.title} ${t.link || ''}`).join(' ')}`;
      return normalize(hay).includes(q);
    });
  }, [entries, search, tab]);

  // Nhóm theo tháng, tháng mới nhất trước; trong tháng thì mục mới nhất trước
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      const m = e.date.slice(0, 7) || 'không rõ';
      const l = map.get(m);
      if (l) l.push(e);
      else map.set(m, [e]);
    }
    for (const l of map.values()) l.sort((a, b) => b.date.localeCompare(a.date));
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const tabCount = useMemo(
    () => ({
      content: entries.filter((e) => e.kind === 'content').length,
      project: entries.filter((e) => e.kind === 'project').length,
    }),
    [entries],
  );

  // Đếm trên danh sách đang hiện: tổng video đã có + số đã đánh dấu dùng
  const stats = useMemo(() => {
    let total = 0;
    let used = 0;
    for (const e of filtered) {
      if (e.kind === 'content') {
        const items = e.content.items || [];
        total += items.length;
        used += items.filter((i) => i.used).length;
      } else {
        total += e.videos.length;
        used += e.videos.filter((t) => t.used).length;
      }
    }
    return { total, used };
  }, [filtered]);

  /** Ô tick "đã sử dụng" dùng chung cho cả 2 loại video. */
  const UsedBox = ({ used, onToggle }: { used?: boolean; onToggle: () => void }) => (
    <button
      type="button"
      disabled={!canEditDaily}
      onClick={onToggle}
      title={used ? 'Đã sử dụng — bấm để bỏ đánh dấu' : 'Đánh dấu đã sử dụng'}
      className={`shrink-0 mt-0.5 transition-colors ${canEditDaily ? 'cursor-pointer' : 'cursor-default'} ${used ? 'text-emerald-400' : 'text-dim hover:text-muted'}`}
    >
      {used ? <CheckSquare size={16} /> : <Square size={16} />}
    </button>
  );

  return (
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">DS Content</h1>
          <p className="text-sm text-muted">
            {filtered.length} {tab === 'content' ? 'nội dung' : 'dự án'} · {stats.total} video · <span className="text-emerald-400 font-semibold">{stats.used} đã dùng</span>
          </p>
        </div>
        <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
        <div className="order-1 sm:order-none flex-1 sm:flex-none flex bg-surface border border-line rounded-xl p-1">
          {([['content', 'Nội dung'], ['project', 'Dự án']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                tab === k ? 'bg-accent text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {label} <span className={tab === k ? 'text-white/70' : 'text-dim'}>{tabCount[k]}</span>
            </button>
          ))}
        </div>
        <div className="relative order-2 sm:order-none w-full sm:w-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'content' ? 'Tìm nội dung, link video...' : 'Tìm dự án, link video...'}
            className="w-full sm:!w-64 !pl-8 !pr-7"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-ink cursor-pointer">
              <X size={13} />
            </button>
          )}
        </div>
        </div>
      </div>

      {groups.length === 0 && (
        <EmptyState icon={<ListVideo size={32} />} text={search ? 'Không tìm thấy mục nào' : tab === 'content' ? 'Chưa có nội dung nào' : 'Chưa có dự án nào trả video'} />
      )}

      {groups.map(([m, list]) => (
        <div key={m} className="space-y-2.5">
          <div className="flex items-center gap-3 pt-1">
            <h2 className="text-sm font-extrabold tracking-tight">{m === 'không rõ' ? 'Chưa có ngày' : monthLabel(m)}</h2>
            <span className="text-[11px] font-bold text-dim tabular-nums">{list.length}</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          {list.map((e) => {
            /* ---------- Thẻ NỘI DUNG ---------- */
            if (e.kind === 'content') {
              const d = e.content;
              const items = d.items || [];
              const overdue = !!d.dueDate && d.dueDate < today && d.status !== 'done';
              return (
                <Card key={e.key} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onOpenContent(d.id)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold group-hover:text-indigo-300 transition-colors">{d.title}</p>
                          <Badge color={STATUS_BADGE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          <Badge color={PLATFORM_COLOR[d.platform] || PLATFORM_COLOR['Đa kênh']}>{d.platform}</Badge>
                          <span className="text-[11px] text-dim">{d.type}</span>
                          {d.dueDate && (
                            <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-red-400 font-bold' : 'text-dim'}`}>
                              <Calendar size={11} />{formatDate(d.dueDate)}{overdue && ' · quá hạn'}
                            </span>
                          )}
                          {memberOf(contentOwnerId(d)) && (
                            <span className="flex items-center gap-1 text-[11px] text-dim">
                              <Avatar name={memberOf(contentOwnerId(d))!.username} url={memberOf(contentOwnerId(d))!.avatarUrl} size={16} />
                              {memberOf(contentOwnerId(d))!.username}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 w-20 sm:w-28 text-right">
                        <p className="text-[11px] font-bold tabular-nums text-violet-300 mb-1">{itemsDone(d)}/{contentTarget(d)} video</p>
                        <ProgressBar value={contentProgress(d)} />
                      </div>
                      <ChevronRight size={15} className="shrink-0 mt-1 text-dim group-hover:text-indigo-300 transition-colors" />
                    </div>
                  </button>

                  <div className="border-t border-line bg-bg/40">
                    {items.length === 0 ? (
                      <p className="text-[11px] text-dim px-4 py-2.5">Chưa có video nào được trả</p>
                    ) : (
                      <div className="divide-y divide-line/60">
                        {items.map((v) => {
                          const author = memberOf(v.addedBy);
                          return (
                            <div key={v.id} className={`flex items-start gap-2.5 px-4 py-2.5 transition-colors ${v.used ? 'bg-emerald-500/[0.06]' : ''}`}>
                              <UsedBox used={v.used} onToggle={() => toggleItemUsed(d, v.id, !v.used)} />
                              <div className="min-w-0 flex-1">
                                {v.title && <p className="text-[13px] font-semibold leading-snug">{v.title}</p>}
                                {v.link ? (
                                  <a href={v.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-2 break-all">
                                    <ExternalLink size={11} className="shrink-0 mt-0.5" /><span className="break-all">{v.link}</span>
                                  </a>
                                ) : (
                                  <p className="text-[11px] text-dim">Không có link</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                {v.doneDate && <span className="block text-[11px] text-dim tabular-nums" title="Ngày editor trả video">{formatDate(v.doneDate)}</span>}
                                {author?.username && <span className="block text-[10px] text-dim">{author.username}</span>}
                                {v.used && v.usedDate && <span className="block text-[10px] text-emerald-400 tabular-nums" title="Ngày đánh dấu đã sử dụng">dùng {formatDate(v.usedDate)}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              );
            }

            /* ---------- Thẻ DỰ ÁN (video do team quay/dựng) ---------- */
            const { project: p, videos } = e;
            const isOut = p.projectType === 'outsource';
            const usedN = videos.filter((t) => t.used).length;
            const totalQty = videos.reduce((s, t) => s + (Number(t.quantity) || 1), 0);
            return (
              <Card key={e.key} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => onOpenProject(p.id)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FolderKanban size={13} className="text-sky-300 shrink-0" />
                        <p className="text-sm font-bold group-hover:text-indigo-300 transition-colors">{p.title}</p>
                        <Badge color={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        <Badge color={isOut ? 'bg-fuchsia-500/15 text-fuchsia-300' : 'bg-sky-500/15 text-sky-300'}>
                          {isOut ? 'Outsource' : 'Inhouse'}
                        </Badge>
                        {p.productType && <span className="text-[11px] text-dim">{p.productType}</span>}
                        {p.deadline && (
                          <span className="text-[11px] text-dim flex items-center gap-1"><Calendar size={11} />{formatDate(p.deadline)}</span>
                        )}
                        {(p.assigneeIds || []).map((id) => memberOf(id)).filter(Boolean).map((mm) => (
                          <span key={mm!.id} className="flex items-center gap-1 text-[11px] text-dim">
                            <Avatar name={mm!.username} url={mm!.avatarUrl} size={16} />{mm!.username}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 w-20 sm:w-28 text-right">
                      <p className="text-[11px] font-bold tabular-nums text-violet-300 mb-1">{totalQty} video</p>
                      <p className="text-[10px] text-dim tabular-nums">{usedN}/{videos.length} đã dùng</p>
                    </div>
                    <ChevronRight size={15} className="shrink-0 mt-1 text-dim group-hover:text-indigo-300 transition-colors" />
                  </div>
                </button>

                <div className="border-t border-line bg-bg/40 divide-y divide-line/60">
                  {videos.map((t) => {
                    const author = memberOf(t.createdBy);
                    const qty = Number(t.quantity) || 1;
                    return (
                      <div key={t.id} className={`flex items-start gap-2.5 px-4 py-2.5 transition-colors ${t.used ? 'bg-emerald-500/[0.06]' : ''}`}>
                        <UsedBox used={t.used} onToggle={() => toggleTaskUsed(t, !t.used)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-snug">
                            {t.title}
                            {qty > 1 && <span className="ml-1.5 text-[11px] font-bold text-violet-300">×{qty}</span>}
                          </p>
                          {t.link ? (
                            <a href={t.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-2 break-all">
                              <ExternalLink size={11} className="shrink-0 mt-0.5" /><span className="break-all">{t.link}</span>
                            </a>
                          ) : (
                            <p className="text-[11px] text-dim">Không có link</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {videoDate(t) && <span className="block text-[11px] text-dim tabular-nums" title="Ngày trả video">{formatDate(videoDate(t))}</span>}
                          {author?.username && <span className="block text-[10px] text-dim">{author.username}</span>}
                          {t.used && t.usedDate && <span className="block text-[10px] text-emerald-400 tabular-nums" title="Ngày đánh dấu đã sử dụng">dùng {formatDate(t.usedDate)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}
