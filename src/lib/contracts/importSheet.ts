// Nhập một lần các đối tác trong sheet "Danh sách làm HĐ" vào danh sách đối tác của app
// (contractPartners). Sau khi bỏ hẳn việc đọc sheet, đây là cách duy nhất để người chỉ có
// trong sheet cũng chọn lại được.
//
// Luật gộp: dữ liệu đã lưu trên web là MỚI hơn sheet nên không bao giờ bị đè — với đối tác
// đã có, sheet chỉ điền vào ô đang trống. Trong sheet, cùng một người có nhiều dòng thì dòng
// dưới (làm sau) thắng dòng trên.

import type { ContractPartner } from '../../types';
import type { SheetRow } from './sheetSync';

const TRUONG: [string, keyof ContractPartner][] = [
  ['xung_ho', 'xungHo'], ['cccd', 'cccd'], ['ngay_cap', 'ngayCap'], ['mst', 'mst'],
  ['dia_chi', 'diaChi'], ['sdt', 'sdt'], ['email', 'email'], ['ten_tk', 'tenTk'],
  ['so_tk', 'soTk'], ['ngan_hang', 'nganHang'],
];

export interface DoiTacNhap {
  id: string;
  /** Chỉ các field cần GHI (merge) — đối tác đã có thì chỉ gồm ô đang trống. */
  data: Partial<ContractPartner>;
  moi: boolean;
}

export function gopDoiTacTuSheet(
  rows: SheetRow[],
  partners: Record<string, ContractPartner>,
  idDoiTac: (hoTen: string) => string,
): DoiTacNhap[] {
  const theoId = new Map<string, { hoTen: string; truong: Partial<ContractPartner>; soHd: number }>();
  for (const r of rows) {
    const hoTen = String(r.form.ho_ten || r.ho_ten || '').trim();
    const id = idDoiTac(hoTen);
    if (!id) continue;
    const g = theoId.get(id) ?? { hoTen, truong: {}, soHd: 0 };
    for (const [formKey, pKey] of TRUONG) {
      const v = String((r.form as Record<string, unknown>)[formKey] ?? '').trim();
      if (v) (g.truong as Record<string, unknown>)[pKey] = v;
    }
    if (r.da_co_hd || r.da_co_bbnt) g.soHd += 1;
    theoId.set(id, g);
  }

  const ra: DoiTacNhap[] = [];
  for (const [id, g] of theoId) {
    const cu = partners[id];
    if (!cu) {
      ra.push({ id, moi: true, data: { id, hoTen: g.hoTen, ...g.truong, soLan: g.soHd } });
      continue;
    }
    const bu: Partial<ContractPartner> = {};
    for (const [, pKey] of TRUONG) {
      const v = g.truong[pKey];
      if (v && !String(cu[pKey] ?? '').trim()) (bu as Record<string, unknown>)[pKey] = v;
    }
    if (Object.keys(bu).length) ra.push({ id, moi: false, data: bu });
  }
  return ra;
}
