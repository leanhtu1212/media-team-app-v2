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

/** Giá trị của ô link: URL thật ưu tiên, không có thì lấy chữ đang hiện.
 *
 *  Ô link trong sheet hiếm khi chứa URL dạng text. Người dùng thường Insert > Link (ô hiện
 *  chữ "Link SP", URL nằm ở rich text) hoặc dán thành smart chip (getDisplayValues trả về
 *  CHUỖI RỖNG). Cả hai kiểu đều làm cột link "biến mất" nếu chỉ đọc display value — và với
 *  cột D/E còn kéo theo việc gắn nhãn "người mới" sai. Apps Script vì thế trả kèm ma trận
 *  `links` (URL từ rich text / công thức HYPERLINK), tham số `lienKet` ở đây. */
function oLink(hang: string[], lienKet: string[] | undefined, ten: keyof typeof COT): string {
  const url = (lienKet?.[COT[ten]] ?? '').trim();
  return url || o(hang, ten);
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
  link_sp: string;
  link_luu: string;
  da_co_hd: boolean;
  da_co_bbnt: boolean;
  nguoi_moi: boolean;
  done: boolean;
  form: QuickParseForm;
  goc: Partial<Record<keyof QuickParseForm, string>>;
  khongRo: string[];
  // Chỉ có ở dòng dựng từ khoản chi của một dự án (xem fromTask.ts). Dòng đọc từ sheet để
  // trống vì sheet "Danh sách làm HĐ" không có cột dự án.
  taskId?: string;
  projectId?: string;
  projectTitle?: string;
}

export function phanTichHang(hang: string[], soDong: number, lienKet?: string[]): SheetRow {
  const hoTen = o(hang, 'ho_ten');
  const noiDung = o(hang, 'noi_dung');
  const tien = o(hang, 'tien');

  const r = phanTichNhanh(o(hang, 'thong_tin'));
  const form: QuickParseForm = { ...r.form };
  // Cột riêng thắng khối text: chúng là nơi người dùng chủ động nhập.
  if (hoTen) form.ho_ten = hoTen;
  if (noiDung) form.noi_dung = noiDung;
  if (tien) form.net = chuanTien(tien) || tien;

  const daCoHd = !!oLink(hang, lienKet, 'link_hd');
  const daCoBbnt = !!oLink(hang, lienKet, 'link_bbnt');
  return {
    dong: soDong,
    stt: o(hang, 'stt'),
    ho_ten: form.ho_ten || '',
    noi_dung: form.noi_dung || '',
    tien: form.net || '',
    link_sp: oLink(hang, lienKet, 'link_sp'),
    link_luu: oLink(hang, lienKet, 'link_luu'),
    da_co_hd: daCoHd,
    da_co_bbnt: daCoBbnt,
    nguoi_moi: !daCoHd && !daCoBbnt,
    done: laTrue(o(hang, 'done')),
    form,
    goc: r.goc,
    khongRo: r.khongRo,
  };
}

/** `rows` = giá trị thô trả về từ Apps Script (mảng 2 chiều, DÒNG 1 LÀ TIÊU ĐỀ).
 *  `links` = ma trận URL cùng kích thước (xem `oLink`); webhook bản cũ không trả field này
 *  nên tham số là tuỳ chọn. */
export function danhSachTuRows(rows: string[][], links?: string[][]): SheetRow[] {
  const ra: SheetRow[] = [];
  rows.forEach((h, idx) => {
    const soDong = idx + 1;
    if (soDong === 1) return; // dòng tiêu đề
    const lienKet = links?.[idx];
    // Dòng chỉ có smart chip: display value rỗng hết nhưng vẫn là dòng có dữ liệu.
    const rong = !h.some((c) => (c || '').trim()) && !lienKet?.some((c) => (c || '').trim());
    if (rong) return;
    const muc = phanTichHang(h, soDong, lienKet);
    if (!muc.ho_ten && !muc.noi_dung) return;
    ra.push(muc);
  });
  return ra;
}
