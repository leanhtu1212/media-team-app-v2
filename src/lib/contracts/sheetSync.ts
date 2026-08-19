// Biến từng hàng của sheet "Danh sách làm HĐ" thành dữ liệu điền form. Port từ
// D:\App\core\sheet_sync.py. Apps Script (Task 11) chỉ trả về RAW rows — việc hiểu cột nào
// là gì nằm ở đây (client), theo nguyên tắc "logic ở client, server chỉ đọc/ghi hộ Google".

import { chuanTien, phanTichNhanh, type QuickParseForm } from './quickParse';

// Cột (tab mặc định "Thanh Toán"):
// A STT | B Nội dung công việc | C Họ Tên | D Link HĐ | E Link BBNT
// F Link SP | G Tiền | H Thông tin | I Link Lưu HĐ | J DONE
const COT = {
  stt: 0, noi_dung: 1, ho_ten: 2, link_hd: 3, link_bbnt: 4,
  link_sp: 5, tien: 6, thong_tin: 7, link_luu: 8, done: 9,
} as const;

function o(hang: string[], ten: keyof typeof COT): string {
  return (hang[COT[ten]] ?? '').trim();
}

function laTrue(s: string): boolean {
  return ['TRUE', 'X', '1', 'V', '✓', 'DONE', 'CÓ'].includes(s.trim().toUpperCase());
}

export interface SheetRow {
  dong: number;
  stt: string;
  ho_ten: string;
  noi_dung: string;
  tien: string;
  link_luu: string;
  da_co_hd: boolean;
  da_co_bbnt: boolean;
  nguoi_moi: boolean;
  done: boolean;
  form: QuickParseForm;
  goc: Partial<Record<keyof QuickParseForm, string>>;
  khongRo: string[];
}

export function phanTichHang(hang: string[], soDong: number): SheetRow {
  const hoTen = o(hang, 'ho_ten');
  const noiDung = o(hang, 'noi_dung');
  const tien = o(hang, 'tien');

  const r = phanTichNhanh(o(hang, 'thong_tin'));
  const form: QuickParseForm = { ...r.form };
  // Cột riêng thắng khối text: chúng là nơi người dùng chủ động nhập.
  if (hoTen) form.ho_ten = hoTen;
  if (noiDung) form.noi_dung = noiDung;
  if (tien) form.net = chuanTien(tien) || tien;

  const daCoHd = !!o(hang, 'link_hd');
  const daCoBbnt = !!o(hang, 'link_bbnt');
  return {
    dong: soDong,
    stt: o(hang, 'stt'),
    ho_ten: form.ho_ten || '',
    noi_dung: form.noi_dung || '',
    tien: form.net || '',
    link_luu: o(hang, 'link_luu'),
    da_co_hd: daCoHd,
    da_co_bbnt: daCoBbnt,
    nguoi_moi: !daCoHd && !daCoBbnt,
    done: laTrue(o(hang, 'done')),
    form,
    goc: r.goc,
    khongRo: r.khongRo,
  };
}

/** `rows` = giá trị thô trả về từ Apps Script (mảng 2 chiều, DÒNG 1 LÀ TIÊU ĐỀ). */
export function danhSachTuRows(rows: string[][]): SheetRow[] {
  const ra: SheetRow[] = [];
  rows.forEach((h, idx) => {
    const soDong = idx + 1;
    if (soDong === 1) return; // dòng tiêu đề
    if (!h.some((c) => (c || '').trim())) return; // dòng rỗng
    const muc = phanTichHang(h, soDong);
    if (!muc.ho_ten && !muc.noi_dung) return;
    ra.push(muc);
  });
  return ra;
}
