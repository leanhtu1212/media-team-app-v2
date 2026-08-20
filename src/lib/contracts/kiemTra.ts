// Soát lại HĐ + BBNT ĐÃ SINH, trước khi đẩy lên Drive.
//
// Cố ý đọc ngược từ chính file .docx chứ không so lại với form: nếu đọc form thì mọi lỗi ở
// khâu điền (đặt nhầm đoạn, placeholder không khớp, ảnh không chèn được) đều "đạt" hết, mà
// đó mới là loại lỗi cần bắt. File lên Drive rồi là ra tay đối tác, gỡ lại rất phiền.

import JSZip from 'jszip';
import { nfc, ptext, tatCaParagraph } from './docxXml';
import { fmtSo, soThanhChu, tinhGross } from './money';
import type { ContractSettings, PreparedData } from './compute';

export interface MucKiemTra {
  ten: string;
  dat: boolean;
  /** Vì sao trượt — hiện kèm để biết phải sửa gì, không chỉ báo đỏ trơn. */
  chiTiet?: string;
  /** Trượt mục này thì KHÔNG nên gửi file đi. Mục không nghiêm trọng chỉ để nhắc. */
  nghiemTrong: boolean;
}

export interface KetQuaKiemTra {
  muc: MucKiemTra[];
  soLoi: number;      // số mục nghiêm trọng trượt
  soCanhBao: number;  // số mục không nghiêm trọng trượt
}

interface NoiDungFile {
  text: string;
  coAnh: boolean;
}

/** Toàn bộ chữ trong document.xml (mỗi đoạn một dòng) + có ảnh nhúng hay không. */
export async function docNoiDung(blob: Blob): Promise<NoiDungFile> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const dong: string[] = [];
  for (const p of tatCaParagraph(doc)) dong.push(ptext(p));
  const coMedia = Object.keys(zip.files).some((f) => /^word\/media\/.+/.test(f));
  return { text: nfc(dong.join('\n')), coAnh: coMedia && xml.includes('<w:drawing') };
}

/** So chuỗi trong văn bản: bỏ dấu cách thừa hai bên, so không phân biệt hoa/thường. */
function chua(text: string, can: string): boolean {
  const c = nfc(can).trim();
  if (!c) return false;
  return text.toLowerCase().includes(c.toLowerCase());
}

function demPlaceholder(text: string): number {
  return (text.match(/…/g) || []).length + (text.match(/\.\.\./g) || []).length;
}

/**
 * `d` = dữ liệu đã chuẩn bị (nguồn của việc điền). Mọi mục đều tra trong VĂN BẢN CUỐI, `d`
 * chỉ dùng để biết cần tìm chuỗi nào.
 */
export async function kiemTraHaiFile(
  hdBlob: Blob, bbntBlob: Blob, d: PreparedData, cfg: ContractSettings,
): Promise<KetQuaKiemTra> {
  // Tính lại gross đúng công thức docxFill dùng — nếu hai bên lệch nhau thì mục "số tiền"
  // trượt, và đó chính là thứ cần biết trước khi gửi file đi.
  const gross = tinhGross(d.net, cfg.thueTNCN);
  const grossSo = fmtSo(gross);
  const grossChu = soThanhChu(gross);
  const [hd, bb] = await Promise.all([docNoiDung(hdBlob), docNoiDung(bbntBlob)]);
  const muc: MucKiemTra[] = [];
  const them = (ten: string, dat: boolean, nghiemTrong: boolean, chiTiet?: string) =>
    muc.push({ ten, dat, nghiemTrong, chiTiet: dat ? undefined : chiTiet });

  const sotHd = demPlaceholder(hd.text);
  const sotBb = demPlaceholder(bb.text);
  them(
    'Không còn chỗ trống "…" chưa điền',
    sotHd + sotBb === 0,
    true,
    `HĐ: ${sotHd} chỗ · BBNT: ${sotBb} chỗ`,
  );

  them('Họ tên đối tác có trong cả 2 file', chua(hd.text, d.ho_ten) && chua(bb.text, d.ho_ten), true,
    `Không thấy «${d.ho_ten}»`);
  them('Số hợp đồng có trong cả 2 file', chua(hd.text, d.so_hd) && chua(bb.text, d.so_hd), true,
    `Không thấy «${d.so_hd}»`);
  them('Số tiền (gross) có trong cả 2 file', chua(hd.text, grossSo) && chua(bb.text, grossSo), true,
    `Không thấy «${grossSo}»`);
  them('Tiền bằng chữ có trong HĐ', chua(hd.text, grossChu), true,
    `Không thấy «${grossChu}»`);
  them('Nội dung công việc có trong cả 2 file', chua(hd.text, d.noi_dung) && chua(bb.text, d.noi_dung), true,
    `Không thấy «${d.noi_dung}»`);

  // Nhóm dưới đây có thể trống hợp lệ (đối tác chưa cung cấp) — chỉ nhắc, không chặn.
  them('BBNT có ảnh chứng minh', bb.coAnh, false, 'Ô "Hình ảnh chứng minh" đang trống');
  them('Số tài khoản có trong HĐ', !!d.so_tk && chua(hd.text, d.so_tk), false,
    d.so_tk ? `Không thấy «${d.so_tk}»` : 'Chưa nhập số tài khoản');
  them('Ngân hàng có trong HĐ', !!d.ngan_hang && chua(hd.text, d.ngan_hang), false,
    d.ngan_hang ? `Không thấy «${d.ngan_hang}»` : 'Chưa nhập ngân hàng');
  them('CCCD có trong HĐ', !!d.cccd && chua(hd.text, d.cccd), false,
    d.cccd ? `Không thấy «${d.cccd}»` : 'Chưa nhập CCCD');

  return {
    muc,
    soLoi: muc.filter((m) => !m.dat && m.nghiemTrong).length,
    soCanhBao: muc.filter((m) => !m.dat && !m.nghiemTrong).length,
  };
}
