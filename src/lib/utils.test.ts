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
  // Video '5' là doc cũ chưa có addedBy — phải đi vào dòng uid rỗng, không được thất lạc.
  const items = [
    { id: '1', title: '', done: true, addedBy: 'a' },
    { id: '2', title: '', done: true, addedBy: 'a' },
    { id: '3', title: '', done: true, addedBy: 'b' },
    { id: '4', title: '', done: false, addedBy: 'b' },
    { id: '5', title: '', done: true },
  ];

  it('đếm video đã trả theo addedBy, kèm định mức', () => {
    const r = editorProgress({ editorIds: ['a', 'b'], editorQty: { a: 3, b: 2 }, items });
    expect(r).toEqual([
      { uid: 'a', done: 2, quota: 3 },
      { uid: 'b', done: 1, quota: 2 },
      { uid: '', done: 1 },
    ]);
  });

  it('một người dựng thì không có định mức, người trả hộ vẫn ra dòng riêng', () => {
    expect(editorProgress({ editorId: 'a', items })).toEqual([
      { uid: 'a', done: 2 },
      { uid: 'b', done: 1 },
      { uid: '', done: 1 },
    ]);
  });

  it('người trả hộ ngoài danh sách ra dòng riêng, không có định mức', () => {
    // Chỉ 1 người dựng ('a') nên không có key quota dù editorQty có giá trị.
    const r = editorProgress({ editorIds: ['a'], editorQty: { a: 3 }, items });
    expect(r).toEqual([
      { uid: 'a', done: 2 },
      { uid: 'b', done: 1 },
      { uid: '', done: 1 },
    ]);
  });

  it('video cũ không có addedBy gom vào dòng uid rỗng', () => {
    const cu = [
      { id: '1', title: '', done: true },
      { id: '2', title: '', done: true },
      { id: '3', title: '', done: false },
    ];
    expect(editorProgress({ editorIds: ['q'], items: cu })).toEqual([
      { uid: 'q', done: 0 },
      { uid: '', done: 2 },
    ]);
  });

  it('không có video nào thiếu addedBy thì không thêm dòng rỗng', () => {
    const r = editorProgress({ editorIds: ['a'], items: [{ done: true, addedBy: 'a' }] });
    expect(r).toEqual([{ uid: 'a', done: 1 }]);
  });

  it('tổng done các dòng bằng tổng video đã trả', () => {
    const r = editorProgress({ editorIds: ['a'], items });
    expect(r.reduce((s, x) => s + x.done, 0)).toBe(items.filter((i) => i.done).length);
  });

  it('doc cũ chỉ có editorId (không phải mảng): tổng done vẫn khớp tổng video đã trả', () => {
    const r = editorProgress({ editorId: 'a', items });
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
