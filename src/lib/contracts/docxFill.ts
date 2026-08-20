// Điền MẪU MỚI và tách thành hai file HĐ + BBNT. Port từ D:\App\core\docx_fill.py.
// Chạy hoàn toàn trong trình duyệt: JSZip đọc/ghi file .docx (zip), DOMParser/XMLSerializer
// sửa word/document.xml trực tiếp — không cần server.

import JSZip from 'jszip';
import type { ContractSettings, PreparedData } from './compute';
import { chenAnhBbnt } from './docxImage';
import { fmtSo, soNgayChu, soThanhChu, tinhGross } from './money';
import { tenFileBbnt, tenFileHd } from './naming';
import {
  BA_CHAM, cellsOfRow, nfc, paragraphsOf, ptext, replaceAcrossRuns, replacePh, rowsOfTable,
  runsOf, runText, setRunText, tatCaParagraph, timParagraph, vaXml, W_NS,
} from './docxXml';

const TEN_MAU = 'TRẦN TRANG ANH';

function txtCua(el: Element): string {
  if (el.namespaceURI === W_NS && el.localName === 'p') return ptext(el);
  return '__tbl__';
}

function dmy(d: Date): [string, string, string] {
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getFullYear()),
  ];
}

function dienBang(doc: Document, d: PreparedData, cfg: ContractSettings, ten: string): void {
  const tbls = Array.from(doc.getElementsByTagNameNS(W_NS, 'tbl'));
  for (const tb of tbls) {
    const rows = rowsOfTable(tb);
    if (!rows.length) continue;
    const oDau = cellsOfRow(rows[0]).map((c) => nfc(c.textContent || '').trim());
    const gop = oDau.join(' ');

    // Bảng chữ ký
    if (gop.includes('BÊN A') && gop.includes('BÊN B')) {
      for (const row of rows) {
        for (const c of cellsOfRow(row)) {
          for (const p of paragraphsOf(c)) {
            for (const r of runsOf(p)) {
              // Dùng runText/setRunText (docxXml) thay vì đọc <w:t> đầu tiên: một run có thể
              // chứa nhiều <w:t> xen <w:tab/>, đọc mỗi cái đầu là bỏ sót/ghi lệch.
              const t = runText(r);
              if (t.trim() === BA_CHAM) setRunText(r, t.replace(BA_CHAM, ten));
            }
          }
        }
      }
    }

    // Bảng nội dung BBNT: cột 3 (ảnh) để trống — chèn ở Task 9.
    if (oDau.includes('Hạng mục')) {
      if (rows.length < 2) continue;
      const o = cellsOfRow(rows[1]);
      const dat = (cell: Element, txt: string) => {
        const p = paragraphsOf(cell)[0];
        if (!p) return;
        for (const r of runsOf(p)) p.removeChild(r);
        const r = doc.createElementNS(W_NS, 'w:r');
        // Khớp python-docx `rr.font.name = "Times New Roman"`: mặc định của document.xml
        // là Arial (kiểm chứng qua styles.xml của template thật), phần còn lại của bảng
        // "Hạng mục" dùng Times New Roman — thiếu w:rPr/w:rFonts sẽ lệch font khỏi phần còn lại.
        const rPr = doc.createElementNS(W_NS, 'w:rPr');
        const rFonts = doc.createElementNS(W_NS, 'w:rFonts');
        rFonts.setAttribute('w:ascii', 'Times New Roman');
        rFonts.setAttribute('w:hAnsi', 'Times New Roman');
        rFonts.setAttribute('w:cs', 'Times New Roman');
        rFonts.setAttribute('w:eastAsia', 'Times New Roman');
        rPr.appendChild(rFonts);
        r.appendChild(rPr);
        const t = doc.createElementNS(W_NS, 'w:t');
        t.textContent = txt;
        if (/^\s|\s$/.test(txt)) t.setAttribute('xml:space', 'preserve');
        r.appendChild(t);
        p.appendChild(r);
      };
      if (o[0]) dat(o[0], cfg.hangMucBbnt);
      if (o[1]) dat(o[1], d.noi_dung.trim());
    }
  }
}

function dien(doc: Document, d: PreparedData, cfg: ContractSettings): void {
  const net = d.net;
  const gross = tinhGross(net, cfg.thueTNCN);
  const ten = d.ho_ten.toUpperCase();
  const xungHo = (d.xung_ho || 'Bà').toUpperCase();

  const [dd, mm, yy] = dmy(d.ngay_hd);
  const ngayHieuLuc = `${dd}/${mm}/${yy}`;
  const [dbb, mbb, ybb] = dmy(d.ngay_bbnt);
  const ngayHoanThanh = `${dbb}/${mbb}/${ybb}`;

  const P = tatCaParagraph(doc);

  // (c) phải chạy TRƯỚC phép thay tên toàn cục, vì nó khớp cụm dài hơn.
  for (const p of P) replaceAcrossRuns(p, `BÀ ${TEN_MAU}`, `${xungHo} ${ten}`);
  // (b) đồng bộ thời hạn thanh toán ghi cứng trong BBNT.
  const moiHan = soNgayChu(cfg.thoiHanThanhToan);
  for (const p of P) replaceAcrossRuns(p, '14 (mười bốn)', moiHan);
  // Thay tên mẫu còn lại (chữ ký HĐ, chữ ký BBNT).
  for (const p of P) replaceAcrossRuns(p, TEN_MAU, ten);

  replacePh(timParagraph(P, 'Số:'), [d.so_hd]);

  // "Hôm nay, ngày … tháng … năm …" của HĐ nằm trước nhãn BBNT. Bản của BBNT nằm trong
  // content-control (replacePh không sửa được) — vá sau bằng vaXml().
  let trongBbnt = false;
  for (const p of P) {
    const sTxt = ptext(p).trim();
    if (sTxt === 'BBNT') trongBbnt = true;
    if (sTxt.startsWith('Hôm nay, ngày') && !trongBbnt) replacePh(p, [dd, mm, yy]);
  }

  replacePh(timParagraph(P, 'BÊN CUNG CẤP DỊCH VỤ: …'), [ten]);

  for (const p of P) {
    const sTxt = ptext(p).trim();
    if (sTxt.startsWith('CCCD số:')) replacePh(p, [d.cccd, d.ngay_cap]);
    else if (sTxt.startsWith('MST:')) replacePh(p, [d.mst]);
    else if (sTxt.startsWith('Địa chỉ:')) replacePh(p, [d.dia_chi]);
    else if (sTxt.startsWith('SĐT:')) replacePh(p, [d.sdt, d.email]);
  }

  const noiDung = d.noi_dung.trim().replace(/;+$/, '');
  replacePh(timParagraph(P, 'Bên A có trách nhiệm thực hiện các công việc'), [noiDung]);
  replacePh(timParagraph(P, 'Hợp đồng này có hiệu lực'), [ngayHieuLuc]);
  replacePh(timParagraph(P, 'Thời gian dự kiến hoàn thành công việc'), [ngayHoanThanh]);
  replacePh(
    timParagraph(P, '1.  Phí dịch vụ') || timParagraph(P, 'Phí dịch vụ thực hiện'),
    [fmtSo(gross), soThanhChu(gross).toLowerCase() + ' '],
  );
  replacePh(timParagraph(P, 'Tên tài khoản:'), [d.ten_tk]);
  replacePh(timParagraph(P, 'Số tài khoản:'), [d.so_tk]);
  replacePh(timParagraph(P, 'Ngân hàng:'), [d.ngan_hang]);
  replacePh(timParagraph(P, '- Thanh toán: Trong vòng'), [String(cfg.thoiHanThanhToan), fmtSo(net), soThanhChu(net)]);

  // Hai chỗ script gốc bỏ sót.
  replacePh(timParagraph(P, 'Khi muốn chấm dứt hợp đồng trước thời hạn'), [soNgayChu(cfg.baoTruocChamDut)]);
  replacePh(timParagraph(P, 'kể từ ngày Bên B hoàn thành nghĩa vụ thanh toán'), [soNgayChu(cfg.ngayThanhLy)]);

  // BBNT
  replacePh(timParagraph(P, 'Căn cứ vào Hợp đồng số'), [d.so_hd, dd, mm, yy]);
  replacePh(timParagraph(P, 'Bên A đã hoàn thành toàn bộ công việc'), [d.so_hd, dd, mm, yy]);
  replacePh(timParagraph(P, '- Tổng phí dịch vụ là:'), [
    fmtSo(gross), soThanhChu(gross).toLowerCase(), fmtSo(net), soThanhChu(net).toLowerCase(),
  ]);

  dienBang(doc, d, cfg, ten);
  vaXml(doc, dd, mm, yy);
}

async function docxToDoc(zip: JSZip): Promise<Document> {
  const xml = await zip.file('word/document.xml')!.async('text');
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function docToZipXml(zip: JSZip, doc: Document): void {
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
}

/** giu='hd' giữ phần trước nhãn BBNT; giu='bb' giữ phần sau. Mỗi lần gọi mở LẠI template gốc
 *  (giống bản Python: mỗi nửa fill độc lập trên bản sao riêng của template). */
async function luuMotNua(
  templateBytes: ArrayBuffer, d: PreparedData, cfg: ContractSettings, giu: 'hd' | 'bb',
): Promise<{ zip: JSZip; doc: Document }> {
  // Bọc lại bằng Uint8Array (không dùng instanceof ArrayBuffer): trong môi trường test
  // (vitest + jsdom) ArrayBuffer đọc qua Node `fs` có thể khác "realm" với ArrayBuffer toàn
  // cục mà JSZip dùng để instanceof-check, khiến loadAsync báo lỗi "không đọc được dữ liệu".
  const zip = await JSZip.loadAsync(new Uint8Array(templateBytes));
  const doc = await docxToDoc(zip);
  dien(doc, d, cfg);

  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const con = Array.from(body.children);
  const iBb = con.findIndex((el) => txtCua(el) === 'BBNT');
  if (iBb < 0) throw new Error('Không tìm thấy nhãn BBNT trong file mẫu — mẫu có thể đã bị đổi.');

  if (giu === 'hd') {
    for (const el of con.slice(iBb)) body.removeChild(el);
    for (const el of Array.from(body.children)) {
      if (txtCua(el) === 'HDDV') {
        body.removeChild(el);
        break;
      }
    }
  } else {
    for (const el of con.slice(0, iBb + 1)) body.removeChild(el);
  }

  return { zip, doc };
}

export interface GeneratedFiles {
  hdBlob: Blob;
  bbntBlob: Blob;
  hdFilename: string;
  bbntFilename: string;
  /** Ô "Hình ảnh chứng minh" của BBNT đã có ảnh chưa. false = không chọn ảnh, HOẶC không tìm
   *  thấy bảng "Hạng mục" trong mẫu. UI phải cảnh báo — BBNT thiếu ảnh vẫn tải về bình
   *  thường nên không nói ra thì chỉ phát hiện lúc mở file (hoặc lúc đối tác nhận được). */
  daChenAnh: boolean;
}

/** Sinh 2 file HĐ + BBNT từ template. `templateBytes` = nội dung file mẫu (bundle sẵn, xem
 *  Contracts.tsx ở Task 12 — fetch 1 lần lúc mở trang). */
export async function taoHaiFile(
  d: PreparedData, cfg: ContractSettings, templateBytes: ArrayBuffer,
  anh?: { bytes: Uint8Array; widthPx: number; heightPx: number },
): Promise<GeneratedFiles> {
  const [hd, bb] = await Promise.all([
    luuMotNua(templateBytes, d, cfg, 'hd'),
    luuMotNua(templateBytes, d, cfg, 'bb'),
  ]);
  const daChenAnh = anh
    ? await chenAnhBbnt(bb.zip, bb.doc, anh.bytes, anh.widthPx, anh.heightPx, cfg.anhRongInch)
    : false;
  docToZipXml(hd.zip, hd.doc);
  docToZipXml(bb.zip, bb.doc);
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const [hdBlob, bbntBlob] = await Promise.all([
    hd.zip.generateAsync({ type: 'blob', mimeType: mime }),
    bb.zip.generateAsync({ type: 'blob', mimeType: mime }),
  ]);
  return {
    hdBlob, bbntBlob,
    hdFilename: tenFileHd(d.ho_ten, d.noi_dung),
    bbntFilename: tenFileBbnt(d.ho_ten, d.noi_dung),
    daChenAnh,
  };
}

/** Đếm placeholder còn sót ('…' hoặc '...') — dùng để cảnh báo trước khi giao file cho đối tác. */
export async function demPlaceholderSot(blob: Blob): Promise<number> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  let t = '';
  for (const p of tatCaParagraph(doc)) t += ptext(p) + '\n';
  const c1 = (t.match(/…/g) || []).length;
  const c2 = (t.match(/\.\.\./g) || []).length;
  return c1 + c2;
}

export function taiXuong(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
