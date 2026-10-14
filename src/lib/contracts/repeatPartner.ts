import type { ContractPartner } from '../../types';
import type { ContractForm } from './compute';
import { chuanHoa } from './naming';

const PERSONAL_FIELDS: Array<[keyof ContractPartner, keyof ContractForm]> = [
  ['xungHo', 'xung_ho'],
  ['cccd', 'cccd'],
  ['ngayCap', 'ngay_cap'],
  ['mst', 'mst'],
  ['diaChi', 'dia_chi'],
  ['sdt', 'sdt'],
  ['email', 'email'],
  ['tenTk', 'ten_tk'],
  ['soTk', 'so_tk'],
  ['nganHang', 'ngan_hang'],
];

/** Dựng form cho một hợp đồng mới: chỉ tái sử dụng danh tính và thông tin thanh toán. */
export function formChoHopDongMoi(
  partner?: ContractPartner,
  fallback: ContractForm = {},
): ContractForm {
  const form: ContractForm = {
    ho_ten: partner?.hoTen || fallback.ho_ten,
  };

  for (const [partnerKey, formKey] of PERSONAL_FIELDS) {
    const value = partner?.[partnerKey] || fallback[formKey];
    if (value) (form as Record<string, unknown>)[formKey] = value;
  }

  return form;
}

/** Chọn một đối tác đã lưu ngay trong form: ghi đè danh tính + thông tin thanh toán bằng hồ sơ
 *  đã lưu, nhưng GIỮ số tiền và nội dung công việc đang có (mở từ khoản chi thì hai ô này đã
 *  điền sẵn từ dự án — chọn đối tác không được xoá mất). */
export function apDoiTacVaoForm(form: ContractForm, partner: ContractPartner): ContractForm {
  const ra: ContractForm = { ...form, ho_ten: partner.hoTen };
  for (const [partnerKey, formKey] of PERSONAL_FIELDS) {
    (ra as Record<string, unknown>)[formKey] = partner[partnerKey] || '';
  }
  return ra;
}

/** Mốc thời gian của `lanCuoi` (Firestore Timestamp, hoặc null khi serverTimestamp chưa về). */
export function lanCuoiMs(partner: ContractPartner): number {
  const t = partner.lanCuoi as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : 0;
}

/** Khoá xếp kiểu danh sách lớp: TÊN (chữ cuối) trước, họ + đệm sau để phân thứ tự người
 *  trùng tên. "Nguyễn Tiến Anh" → ["Anh", "Nguyễn Tiến"]. */
function khoaTen(hoTen: string): [string, string] {
  const chu = hoTen.trim().split(/\s+/);
  const ten = chu.pop() || '';
  return [ten, chu.join(' ')];
}

const soSanh = (x: string, y: string) => x.localeCompare(y, 'vi', { sensitivity: 'base' });

/** Danh sách đối tác để chọn: xếp theo TÊN A→Z (không phân biệt hoa thường — tên nhập từ
 *  sheet có cái viết hoa toàn bộ), tìm không dấu theo tên / SĐT / CCCD / STK. */
export function danhSachDoiTac(
  partners: Record<string, ContractPartner>,
  tuKhoa = '',
): ContractPartner[] {
  const q = chuanHoa(tuKhoa);
  return Object.values(partners)
    .filter((p) => {
      if (!q) return true;
      return [p.hoTen, p.sdt, p.cccd, p.soTk, p.nganHang]
        .some((v) => chuanHoa(String(v || '')).includes(q));
    })
    .sort((a, b) => {
      const [tenA, hoA] = khoaTen(a.hoTen);
      const [tenB, hoB] = khoaTen(b.hoTen);
      return soSanh(tenA, tenB) || soSanh(hoA, hoB);
    });
}
