import type { ContractPartner } from '../../types';
import type { ContractForm } from './compute';

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
