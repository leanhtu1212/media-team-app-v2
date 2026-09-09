# Daily Content: nhiều người dựng + định mức từng người — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép gán nhiều người dựng cho một nội dung, nhập định mức số video từng người, và hiện rõ ai đã trả video nào.

**Architecture:** `DailyContent.editorIds[]` là nguồn sự thật, `editorQty` là map uid→định mức, `editorId` cũ được ghi mirror `editorIds[0]` để bot Lark n8n và doc cũ không gãy. Toàn bộ logic đọc/đếm nằm ở hàm thuần trong `src/lib/utils.ts` có test; các trang chỉ gọi helper. Tiến độ từng người đếm từ `ContentItem.addedBy` đã có sẵn — không thêm bước nhập liệu nào khi trả video.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4, Firebase Firestore, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-content-nhieu-nguoi-dung-design.md`

## Global Constraints

- KHÔNG sửa `src/lib/kpi.ts`. Sản lượng video content tính theo `report.createdBy`, không liên quan `editorId`.
- KHÔNG sửa `firestore.rules`. Update `dailyContent` đã mở cho `canEditDaily`, field mới không cần luật mới.
- KHÔNG viết script migrate. Doc cũ chỉ có `editorId` được quy đổi lúc đọc.
- KHÔNG đọc `d.editorId` / `d.editorIds` trực tiếp ở bất kỳ page nào — luôn qua `contentEditorIds()` / `contentOwnerId()`.
- `createDailyContent` trong `src/lib/actions.ts` là **whitelist field**: field mới không thêm vào đó sẽ bị rơi mất im lặng.
- Firestore không bật `ignoreUndefinedProperties` — không được ghi key có giá trị `undefined`.
- Trước mỗi commit: `npx tsc --noEmit` và `npm test` đều phải sạch.
- Comment tiếng Việt, ngắn, chỉ giải thích WHY.

---

### Task 1: Helper thuần + test

**Files:**
- Modify: `src/types/index.ts` (interface `DailyContent`, quanh dòng 144-166)
- Modify: `src/lib/utils.ts` (cuối file, cạnh `contentOwnerId` dòng 112-117)
- Create: `src/lib/utils.test.ts`

**Interfaces:**
- Consumes: `ContentItem` từ `src/types/index.ts`
- Produces:
  - `contentEditorIds(d: ContentEditorSrc): string[]`
  - `contentOwnerId(d: ContentEditorSrc): string` (giữ nguyên tên, đổi ruột)
  - `editorProgress(d: ContentProgressSrc): EditorProgress[]` với `EditorProgress = { uid: string; done: number; quota?: number }`
  - `quotaSummary(quantity: number | undefined, editorIds: string[], editorQty?: Record<string, number>): QuotaSummary` với `QuotaSummary = { target: number; assigned: number; diff: number; ok: boolean }`
  - `splitEven(total: number, n: number): number[]`

- [ ] **Step 1: Thêm field mới vào type**

Trong `src/types/index.ts`, interface `DailyContent`, ngay dưới dòng `editorId?: string;`:

```ts
  /** Danh sách người dựng — NGUỒN SỰ THẬT khi có nhiều người. `editorId` ở trên là mirror của
   *  phần tử [0], giữ lại vì bot Lark n8n và doc cũ vẫn đọc field đó. Luôn đọc qua
   *  contentEditorIds() trong lib/utils.ts, đừng đọc thẳng field này. */
  editorIds?: string[];
  /** Định mức số video từng người dựng, key = uid. Chỉ ghi khi có ≥2 người dựng. */
  editorQty?: Record<string, number>;
```

- [ ] **Step 2: Viết test thất bại**

Tạo `src/lib/utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contentEditorIds, contentOwnerId, editorProgress, quotaSummary, splitEven } from './utils';

describe('contentEditorIds', () => {
  it('doc mới đọc editorIds', () => {
    expect(contentEditorIds({ editorIds: ['a', 'b'] })).toEqual(['a', 'b']);
  });
  it('doc cũ chỉ có editorId', () => {
    expect(contentEditorIds({ editorId: 'a' })).toEqual(['a']);
  });
  it('editorIds rỗng thì rơi về editorId, không trả mảng rỗng', () => {
    expect(contentEditorIds({ editorIds: [], editorId: 'a' })).toEqual(['a']);
  });
  it('doc rất cũ rơi về assigneeId', () => {
    expect(contentEditorIds({ assigneeId: 'a' })).toEqual(['a']);
  });
  it('không có gì thì rỗng', () => {
    expect(contentEditorIds({})).toEqual([]);
  });
  it('contentOwnerId lấy người đầu tiên', () => {
    expect(contentOwnerId({ editorIds: ['a', 'b'] })).toBe('a');
    expect(contentOwnerId({})).toBe('');
  });
});

describe('editorProgress', () => {
  const items = [
    { id: '1', title: '', done: true, addedBy: 'a' },
    { id: '2', title: '', done: true, addedBy: 'a' },
    { id: '3', title: '', done: true, addedBy: 'b' },
    { id: '4', title: '', done: false, addedBy: 'b' },
  ];

  it('đếm video đã trả theo addedBy, kèm định mức', () => {
    const r = editorProgress({ editorIds: ['a', 'b'], editorQty: { a: 3, b: 2 }, items });
    expect(r).toEqual([
      { uid: 'a', done: 2, quota: 3 },
      { uid: 'b', done: 1, quota: 2 },
    ]);
  });

  it('một người dựng thì không có định mức', () => {
    expect(editorProgress({ editorId: 'a', items })).toEqual([{ uid: 'a', done: 2 }]);
  });

  it('người trả hộ ngoài danh sách ra dòng riêng, không có định mức', () => {
    const r = editorProgress({ editorIds: ['a'], editorQty: { a: 3 }, items });
    expect(r).toEqual([
      { uid: 'a', done: 2, quota: 3 },
      { uid: 'b', done: 1 },
    ]);
  });

  it('tổng done các dòng bằng tổng video đã trả', () => {
    const r = editorProgress({ editorIds: ['a'], items });
    expect(r.reduce((s, x) => s + x.done, 0)).toBe(items.filter((i) => i.done).length);
  });
});

describe('quotaSummary', () => {
  it('chia đủ thì ok', () => {
    expect(quotaSummary(11, ['a', 'b'], { a: 6, b: 5 })).toEqual({ target: 11, assigned: 11, diff: 0, ok: true });
  });
  it('chia thiếu thì không ok', () => {
    expect(quotaSummary(11, ['a', 'b'], { a: 6, b: 3 })).toEqual({ target: 11, assigned: 9, diff: -2, ok: false });
  });
  it('chia thừa thì không ok', () => {
    expect(quotaSummary(11, ['a', 'b'], { a: 6, b: 7 })).toEqual({ target: 11, assigned: 13, diff: 2, ok: false });
  });
  it('dưới 2 người thì không áp định mức', () => {
    expect(quotaSummary(11, ['a']).ok).toBe(true);
    expect(quotaSummary(11, []).ok).toBe(true);
  });
  it('thiếu định mức của một người thì tính là 0', () => {
    expect(quotaSummary(11, ['a', 'b'], { a: 11 })).toEqual({ target: 11, assigned: 11, diff: 0, ok: true });
  });
});

describe('splitEven', () => {
  it('chia đều, phần dư dồn cho người đầu', () => {
    expect(splitEven(11, 2)).toEqual([6, 5]);
    expect(splitEven(10, 2)).toEqual([5, 5]);
    expect(splitEven(11, 3)).toEqual([4, 4, 3]);
  });
  it('n <= 0 thì rỗng', () => {
    expect(splitEven(11, 0)).toEqual([]);
  });
});
```

- [ ] **Step 3: Chạy test cho chắc là fail**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: FAIL — `contentEditorIds is not a function` / `editorProgress is not exported`.

- [ ] **Step 4: Cài đặt helper**

Trong `src/lib/utils.ts`, **thay** khối `contentOwnerId` hiện tại (dòng 112-117) bằng:

```ts
type ContentEditorSrc = { editorIds?: string[]; editorId?: string; assigneeId?: string };
type ContentProgressSrc = ContentEditorSrc & {
  editorQty?: Record<string, number>;
  items?: { done: boolean; addedBy?: string }[];
};

export type EditorProgress = { uid: string; done: number; quota?: number };
export type QuotaSummary = { target: number; assigned: number; diff: number; ok: boolean };

/** Danh sách NGƯỜI DỰNG của 1 nội dung. `editorIds` là nguồn sự thật; doc cũ chỉ có `editorId`,
 *  doc rất cũ chỉ có `assigneeId` (ô "người phụ trách" đã gỡ khỏi form) — quy đổi lúc đọc nên
 *  không cần migrate. Đừng đọc thẳng field, mọi nơi phải gọi hàm này. */
export function contentEditorIds(d: ContentEditorSrc): string[] {
  const ids = (d.editorIds || []).filter(Boolean);
  if (ids.length) return ids;
  const cu = d.editorId || d.assigneeId || '';
  return cu ? [cu] : [];
}

export const contentOwnerId = (d: ContentEditorSrc): string => contentEditorIds(d)[0] || '';

/** Tiến độ từng người dựng, đếm từ `items[].addedBy` (đã lưu sẵn lúc trả video).
 *  Người TRẢ HỘ (không nằm trong danh sách người dựng) vẫn được một dòng riêng không có định
 *  mức — để tổng `done` các dòng luôn bằng tổng video đã trả, không thất lạc cái nào. */
export function editorProgress(d: ContentProgressSrc): EditorProgress[] {
  const items = (d.items || []).filter((i) => i.done);
  const demTheoUid = (uid: string) => items.filter((i) => (i.addedBy || '') === uid).length;
  const ids = contentEditorIds(d);
  const nhieuNguoi = ids.length >= 2;
  const ra: EditorProgress[] = ids.map((uid) => {
    const quota = nhieuNguoi ? d.editorQty?.[uid] : undefined;
    return quota === undefined ? { uid, done: demTheoUid(uid) } : { uid, done: demTheoUid(uid), quota };
  });
  for (const i of items) {
    const uid = i.addedBy || '';
    if (uid && !ids.includes(uid) && !ra.some((x) => x.uid === uid)) ra.push({ uid, done: demTheoUid(uid) });
  }
  return ra;
}

/** Đối chiếu tổng định mức với ô "Số lượng". Dưới 2 người dựng thì không áp định mức nên luôn ok. */
export function quotaSummary(
  quantity: number | undefined,
  editorIds: string[],
  editorQty?: Record<string, number>,
): QuotaSummary {
  const target = Math.max(1, Number(quantity) || 1);
  const assigned = editorIds.reduce((s, uid) => s + (Number(editorQty?.[uid]) || 0), 0);
  return { target, assigned, diff: assigned - target, ok: editorIds.length < 2 || assigned === target };
}

/** Chia đều `total` cho `n` người, phần dư dồn cho người đầu (11 → [6, 5]). */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  const co = Math.floor(total / n);
  const du = total - co * n;
  return Array.from({ length: n }, (_, i) => co + (i < du ? 1 : 0));
}
```

- [ ] **Step 5: Chạy test + type-check**

Run: `npx vitest run src/lib/utils.test.ts && npx tsc --noEmit`
Expected: PASS toàn bộ, tsc không in gì.

- [ ] **Step 6: Chạy cả bộ test cho chắc không vỡ chỗ khác**

Run: `npm test`
Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/utils.ts src/lib/utils.test.ts
git commit -m "feat(content): helper nhiều người dựng + định mức từng người"
```

---

### Task 2: Ghi Firestore (whitelist + mirror)

**Files:**
- Modify: `src/lib/actions.ts` (`createDailyContent` dòng 412-436, `updateDailyContent` dòng 443+)

**Interfaces:**
- Consumes: `DailyContent.editorIds` / `editorQty` (Task 1)
- Produces: doc Firestore luôn có `editorId === editorIds[0] || ''`

- [ ] **Step 1: Thêm helper chuẩn hoá ngay trên `createDailyContent`**

```ts
/** editorId là MIRROR của editorIds[0] — bot Lark n8n và doc cũ vẫn đọc field đó.
 *  ≤1 người dựng thì xoá sạch định mức, không để lại số cũ sau khi bỏ bớt người. */
function editorFields(data: Partial<DailyContent>): Pick<DailyContent, 'editorIds' | 'editorId' | 'editorQty'> {
  const ids = (data.editorIds || (data.editorId ? [data.editorId] : [])).filter(Boolean);
  const qty: Record<string, number> = {};
  if (ids.length >= 2) {
    for (const uid of ids) qty[uid] = Math.max(0, Number(data.editorQty?.[uid]) || 0);
  }
  return { editorIds: ids, editorId: ids[0] || '', editorQty: qty };
}
```

- [ ] **Step 2: Dùng trong `createDailyContent`**

Thay dòng `editorId: data.editorId || '',` (dòng 418) bằng `...editorFields(data),`.

- [ ] **Step 3: Dùng trong `updateDailyContent`**

Trong `updateDailyContent`, khi `data` có chứa `editorIds` **hoặc** `editorId`, ghi đè bằng `editorFields(data)` trước khi gửi lên Firestore. Không đụng tới các lần gọi chỉ đổi `status`/`items` (không có key editor nào thì giữ nguyên data).

```ts
  const patch = ('editorIds' in data || 'editorId' in data) ? { ...data, ...editorFields(data) } : data;
```

rồi dùng `patch` thay cho `data` ở lệnh `updateDoc`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: không in gì.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions.ts
git commit -m "feat(content): ghi editorIds/editorQty, mirror editorId"
```

---

### Task 3: Form chọn nhiều người dựng + ô định mức

**Files:**
- Modify: `src/pages/DailyContent.tsx` — `ContentFormModal` (dòng 1914-2007: state, `submit`, Field "Người dựng")

**Interfaces:**
- Consumes: `contentEditorIds`, `quotaSummary`, `splitEven` (Task 1); `editorFields` qua `onSave` (Task 2)
- Produces: `onSave` nhận `Partial<DailyContent>` có `editorIds` + `editorQty`

- [ ] **Step 1: Import helper**

Thêm `contentEditorIds, quotaSummary, splitEven` vào dòng import từ `'../lib/utils'` (dòng 10) và `useToast` đã có sẵn (dòng 11).

- [ ] **Step 2: Lấy toast + tính trạng thái chia trong `ContentFormModal`**

Ngay dưới `const [busy, setBusy] = useState(false);`:

```ts
  const toast = useToast();
  const editorIds = contentEditorIds(form);
  const chia = quotaSummary(form.quantity, editorIds, form.editorQty);
```

- [ ] **Step 3: Hàm bật/tắt người dựng, tự chia đều lần đầu có 2 người**

Đặt cạnh `const set = ...`:

```ts
  // Bấm chip để bật/tắt người dựng. Lần ĐẦU có đủ 2 người thì tự chia đều tổng cho đỡ phải gõ;
  // các lần sau không tự chia lại, tránh ghi đè số người dùng vừa sửa.
  const toggleEditor = (uid: string) => {
    const dang = contentEditorIds(form);
    const co = dang.includes(uid);
    const ids = co ? dang.filter((x) => x !== uid) : [...dang, uid];
    const qty: Record<string, number> = {};
    for (const id of ids) if (form.editorQty?.[id] !== undefined) qty[id] = form.editorQty[id];
    if (ids.length >= 2 && ids.every((id) => qty[id] === undefined)) {
      const phan = splitEven(Math.max(1, Number(form.quantity) || 1), ids.length);
      ids.forEach((id, i) => { qty[id] = phan[i]; });
    }
    setForm((f) => ({ ...f, editorIds: ids, editorId: ids[0] || '', editorQty: qty }));
  };
```

- [ ] **Step 4: Guard trong `submit`**

Trong `submit`, ngay sau `if (busy || !form.title) return;`:

```ts
    // Guard đặt trong submit (không chỉ disable nút) — quy ước form của repo.
    if (!chia.ok) {
      toast(chia.diff < 0
        ? `Định mức mới chia ${chia.assigned}/${chia.target} — còn thiếu ${-chia.diff}`
        : `Định mức chia ${chia.assigned}/${chia.target} — thừa ${chia.diff}`, 'error');
      return;
    }
```

- [ ] **Step 5: Sửa Field "Người dựng"**

Thay nguyên khối `<Field label="Người dựng (chọn 1)">` (dòng 1983-2007) bằng:

```tsx
        <Field label="Người dựng">
          {editors.length === 0 ? (
            <p className="text-xs text-dim">Chưa có editor để gán</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {editors.map((m) => {
                  const id = m.uid || m.id;
                  const on = editorIds.includes(id);
                  return (
                    <div key={m.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleEditor(id)}
                        className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-sm font-medium transition-all cursor-pointer ${
                          on ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted hover:border-line-2'
                        }`}
                      >
                        <Avatar name={m.username} url={m.avatarUrl} size={20} />
                        {m.username}
                      </button>
                      {on && editorIds.length >= 2 && (
                        <Input
                          type="number"
                          min={0}
                          className="!w-16"
                          value={form.editorQty?.[id] ?? 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => set('editorQty', { ...(form.editorQty || {}), [id]: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {editorIds.length >= 2 && (
                <p className={`text-[11px] mt-1.5 font-medium ${chia.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                  Đã chia {chia.assigned}/{chia.target}
                  {chia.diff < 0 && ` — còn ${-chia.diff}`}
                  {chia.diff > 0 && ` — thừa ${chia.diff}`}
                </p>
              )}
            </>
          )}
        </Field>
```

- [ ] **Step 6: Type-check + build thử**

Run: `npx tsc --noEmit && npm test`
Expected: sạch, 100% test PASS.

- [ ] **Step 7: Kiểm bằng tay trên dev server**

Run: `npx vite --port 5199` (nếu chưa chạy), mở nội dung bất kỳ → Sửa.
Kiểm:
1. Chọn 1 người → không có ô số, lưu được bình thường.
2. Chọn thêm người thứ 2 với Số lượng 11 → hai ô tự thành 6 và 5, dòng `Đã chia 11/11` màu xanh.
3. Sửa 6 → 4 → dòng thành `Đã chia 9/11 — còn 2` màu vàng, bấm Lưu bị chặn kèm toast.
4. Sửa lại cho đủ 11 → lưu được. Mở lại form thấy đúng 2 người và đúng số.
5. Bỏ chọn 1 người → còn 1 người, ô số biến mất, lưu được.

- [ ] **Step 8: Commit**

```bash
git add src/pages/DailyContent.tsx
git commit -m "feat(content): form chọn nhiều người dựng + định mức từng người"
```

---

### Task 4: Panel tiến độ từng người + hiện người trả video

**Files:**
- Modify: `src/pages/DailyContent.tsx` — panel "Thông tin nội dung" (dòng 1856-1864), dòng video đã trả (dòng 1722-1726)

**Interfaces:**
- Consumes: `editorProgress` (Task 1)

- [ ] **Step 1: Import + tính tiến độ trong `ContentDetail`**

Thêm `editorProgress` vào import từ `'../lib/utils'` (`contentEditorIds` đã được thêm ở Task 3 —
nếu làm task này trước thì thêm cả hai). Trong `ContentDetail`, cạnh
`const editor = memberOf(contentOwnerId(item));` (dòng 1558):

```ts
  const tienDoNguoiDung = editorProgress(item);
```

- [ ] **Step 2: Thay khối "Người dựng" trong panel**

Thay dòng 1857-1864 bằng:

```tsx
          <div className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1.5">Người dựng</p>
            {tienDoNguoiDung.length === 0 ? (
              <p className="text-sm text-dim">Chưa gán</p>
            ) : (
              <div className="space-y-1.5">
                {tienDoNguoiDung.map((n) => {
                  const m = memberOf(n.uid);
                  const ngoai = !contentEditorIds(item).includes(n.uid);
                  return (
                    <div key={n.uid} className="flex items-center gap-2">
                      <Avatar name={m?.username} url={m?.avatarUrl} size={20} />
                      <span className="text-xs font-bold flex-1 truncate">{m?.username || 'Không rõ'}</span>
                      <span className="text-[11px] font-bold tabular-nums text-dim shrink-0">
                        {n.done}{n.quota !== undefined && `/${n.quota}`}
                        {ngoai && <span className="font-medium"> · ngoài định mức</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
```

- [ ] **Step 3: Hiện người trả trên từng dòng video**

Trong danh sách video con, ngay TRƯỚC khối `{v.done && v.doneDate && (` (dòng 1722), chèn:

```tsx
                        {v.done && memberOf(v.addedBy) && (
                          <span className="shrink-0 flex items-center gap-1 text-[11px] text-dim" title={`Người trả: ${memberOf(v.addedBy)!.username}`}>
                            <Avatar name={memberOf(v.addedBy)!.username} url={memberOf(v.addedBy)!.avatarUrl} size={16} />
                            <span className="hidden sm:inline">{memberOf(v.addedBy)!.username}</span>
                          </span>
                        )}
```

`addedBy` rỗng (video cũ) thì không hiện gì — không hiện "Không rõ".

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit && npm test`
Expected: sạch.

- [ ] **Step 5: Kiểm bằng tay**

Mở một nội dung đã có video trả:
1. Panel phải hiện từng người dựng kèm `đã trả/định mức`.
2. Nếu có video do người ngoài danh sách trả → có dòng `· ngoài định mức`.
3. Mỗi dòng video hiện avatar + tên người trả; video cũ không có `addedBy` thì không hiện gì.
4. Trả thêm một video mới → số của chính mình tăng 1 ngay.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DailyContent.tsx
git commit -m "feat(content): tiến độ từng người dựng + hiện người trả video"
```

---

### Task 5: Card kanban/lịch + trang Tôi / Dashboard / DS Content

**Files:**
- Modify: `src/pages/DailyContent.tsx` — `ItemCard` (dòng 327-380) và chỗ gọi (dòng 452)
- Modify: `src/pages/Me.tsx:64` và `:97`
- Modify: `src/pages/Dashboard.tsx:193`
- Modify: `src/pages/ContentList.tsx:222-227`

**Interfaces:**
- Consumes: `contentEditorIds` (Task 1)

- [ ] **Step 1: `ItemCard` nhận danh sách người dựng**

Đổi prop `editor?: {...}` thành:

```ts
  /** Người dựng — nhiều người thì hiện chồng avatar */
  editors?: { username?: string; avatarUrl?: string }[];
```

Thay khối render avatar (dòng 374-378) bằng:

```tsx
          {(editors?.length ?? 0) > 0 && (
            <span className="flex items-center -space-x-1.5" title={`Người dựng: ${editors!.map((e) => e.username || '').join(', ')}`}>
              {editors!.slice(0, 3).map((e, i) => (
                <span key={i} className="ring-2 ring-surface rounded-full"><Avatar name={e.username} url={e.avatarUrl} size={20} /></span>
              ))}
              {editors!.length > 3 && <span className="text-[10px] font-bold text-dim pl-2.5">+{editors!.length - 3}</span>}
            </span>
          )}
```

- [ ] **Step 2: Sửa chỗ gọi `ItemCard` (dòng 452)**

```tsx
                    editors={contentEditorIds(item).map((uid) => memberOf(uid)).filter(Boolean) as { username?: string; avatarUrl?: string }[]}
```

- [ ] **Step 3: Trang Tôi khớp bất kỳ người dựng nào**

`src/pages/Me.tsx` — đổi import `contentOwnerId` thành `contentEditorIds`, rồi ở dòng 64 và 97 đổi
`isMine(contentOwnerId(d))` thành `contentEditorIds(d).some(isMine)`.

- [ ] **Step 4: Dashboard hiện đủ tên**

`src/pages/Dashboard.tsx` — đổi import sang `contentEditorIds`, thay dòng 193:

```ts
              const tenNguoiDung = contentEditorIds(d).map((uid) => memberOf(uid)?.username).filter(Boolean).join(', ');
```

và chỗ dùng `{assignee ? ` · ${assignee.username}` : ''}` thành `{tenNguoiDung ? ` · ${tenNguoiDung}` : ''}`.

- [ ] **Step 5: DS Content hiện chồng avatar**

`src/pages/ContentList.tsx` — đổi import sang `contentEditorIds`, thay khối dòng 222-227:

```tsx
                          {contentEditorIds(d).length > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-dim">
                              {contentEditorIds(d).slice(0, 3).map((uid) => (
                                <Avatar key={uid} name={memberOf(uid)?.username} url={memberOf(uid)?.avatarUrl} size={16} />
                              ))}
                              {contentEditorIds(d).map((uid) => memberOf(uid)?.username).filter(Boolean).join(', ')}
                            </span>
                          )}
```

- [ ] **Step 6: Type-check + test**

Run: `npx tsc --noEmit && npm test`
Expected: sạch. Nếu `contentOwnerId` không còn ai import thì bỏ khỏi import cho khỏi cảnh báo unused.

- [ ] **Step 7: Kiểm bằng tay**

1. Card kanban của nội dung 2 người dựng → 2 avatar chồng nhau, hover thấy đủ tên.
2. Trang Tôi đăng nhập bằng người dựng thứ 2 → nội dung đó phải xuất hiện.
3. Dashboard hiện `Reels · Quang, Hiếu`.
4. DS Content hiện đủ tên.

- [ ] **Step 8: Commit**

```bash
git add src/pages/DailyContent.tsx src/pages/Me.tsx src/pages/Dashboard.tsx src/pages/ContentList.tsx
git commit -m "feat(content): hiện nhiều người dựng ở card, trang Tôi, Dashboard, DS Content"
```

---

### Task 6: Build + deploy

**Files:**
- Modify: `dist/` (build output, CỐ Ý commit vào repo)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: build thành công, `dist/index.html` trỏ tới `assets/index-<hash mới>.js`.

- [ ] **Step 2: Commit cả dist**

```bash
git add dist
git commit -m "build: dist cho content nhiều người dựng"
```

- [ ] **Step 3: Push (chỉ khi người dùng đồng ý)**

```bash
git push origin main
```

Plesk tự pull qua webhook GitHub. Kiểm bản đang chạy bằng cách so hash `assets/index-*.js` giữa `dist/index.html` local và `curl https://annatoiyeu.info.vn/`.
