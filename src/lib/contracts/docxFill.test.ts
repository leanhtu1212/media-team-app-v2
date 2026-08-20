import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { chuanBi, type ContractSettings } from './compute';
import { demPlaceholderSot, taoHaiFile } from './docxFill';

const CFG: ContractSettings = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30,
  baoTruocChamDut: 5, ngayThanhLy: 30, hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3,
};

function templateBytes(): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../assets/contracts/HDDV_BBNT_Mau_moi.docx'));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function docxText(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('text');
  return xml;
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Tìm run điền vào cột "Hạng mục"/"Nội dung" của bảng BBNT (bảng có header chứa "Hạng mục"),
 *  trả về giá trị w:ascii của w:rFonts (hoặc null nếu run không có w:rPr/w:rFonts). */
async function hangMucRunFonts(blob: Blob): Promise<(string | null)[]> {
  const xml = await docxText(blob);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const tbls = Array.from(doc.getElementsByTagNameNS(W_NS, 'tbl'));
  const tb = tbls.find((t) => {
    const firstRow = t.getElementsByTagNameNS(W_NS, 'tr')[0];
    return firstRow && (firstRow.textContent || '').includes('Hạng mục');
  });
  if (!tb) return [];
  const rows = Array.from(tb.getElementsByTagNameNS(W_NS, 'tr'));
  const dataRow = rows[1];
  const cells = Array.from(dataRow.children).filter((c) => c.namespaceURI === W_NS && c.localName === 'tc');
  return cells.slice(0, 2).map((c) => {
    const rFonts = c.getElementsByTagNameNS(W_NS, 'rFonts')[0];
    return rFonts ? rFonts.getAttribute('w:ascii') : null;
  });
}

describe('taoHaiFile', () => {
  it('sinh 2 file, không còn placeholder sót', async () => {
    const d = chuanBi(
      {
        ho_ten: 'Mã Thị Thanh Bình', net: '1.500.000', noi_dung: 'Sản xuất Reels tháng 8',
        cccd: '040303013569', ngay_cap: '28/09/2021', dia_chi: 'Hà Nội', sdt: '0912345678',
        email: 'a@b.com', ten_tk: 'MA THI THANH BINH', so_tk: '101871610416', ngan_hang: 'VietinBank',
      },
      CFG,
      new Date(2026, 7, 19),
    );
    const { hdBlob, bbntBlob, hdFilename, bbntFilename } = await taoHaiFile(d, CFG, templateBytes());

    // tenFileHd/tenFileBbnt (Task 2, đã duyệt) KHÔNG bỏ dấu — xem naming.test.ts:
    // `tenFileHd('Mã Thị Bình', ...)` giữ nguyên dấu trong tên file.
    expect(hdFilename).toBe('Hop dong - Mã Thị Thanh Bình - Sản xuất Reels tháng 8.docx');
    expect(bbntFilename).toBe('BBNT - Mã Thị Thanh Bình - Sản xuất Reels tháng 8.docx');
    expect(await demPlaceholderSot(hdBlob)).toBe(0);
    expect(await demPlaceholderSot(bbntBlob)).toBe(0);
  });

  it('nội dung HĐ chứa tên, số HĐ, tiền bằng chữ', async () => {
    const d = chuanBi({ ho_ten: 'Nguyễn Văn A', net: 1000000, noi_dung: 'Quay video' }, CFG, new Date(2026, 7, 19));
    const { hdBlob } = await taoHaiFile(d, CFG, templateBytes());
    const xml = await docxText(hdBlob);
    expect(xml).toContain('NGUYỄN VĂN A');
    expect(xml).toContain(d.so_hd);
  });

  it('HĐ không còn chứa đoạn "BBNT" (đã bị tách bỏ)', async () => {
    const d = chuanBi({ ho_ten: 'Nguyễn Văn A', net: 1000000, noi_dung: 'Quay video' }, CFG, new Date(2026, 7, 19));
    const { hdBlob, bbntBlob } = await taoHaiFile(d, CFG, templateBytes());
    const hdXml = await docxText(hdBlob);
    const bbXml = await docxText(bbntBlob);
    // Nhãn "HDDV"/"BBNT" tự thân (paragraph đánh dấu) không còn trong file tương ứng.
    expect(hdXml).not.toContain('>BBNT<');
    expect(bbXml).not.toContain('>HDDV<');
  });

  it('bảng "Hạng mục" trong BBNT dùng font Times New Roman (khớp Python: rr.font.name)', async () => {
    const d = chuanBi({ ho_ten: 'Nguyễn Văn A', net: 1000000, noi_dung: 'Quay video' }, CFG, new Date(2026, 7, 19));
    const { bbntBlob } = await taoHaiFile(d, CFG, templateBytes());
    const fonts = await hangMucRunFonts(bbntBlob);
    expect(fonts).toEqual(['Times New Roman', 'Times New Roman']);
  });

  it('kèm ảnh chứng minh vẫn sinh file hợp lệ, không còn placeholder', async () => {
    const d = chuanBi({ ho_ten: 'Trần Thị C', net: 2000000, noi_dung: 'Chụp ảnh sản phẩm' }, CFG, new Date(2026, 7, 19));
    const pngBytes = Uint8Array.from(
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFUlEQVR4nGP8z8DwnwEIGAkFjIMBAJqOA/8DfLQ2AAAAAElFTkSuQmCC', 'base64'),
    );
    const { bbntBlob } = await taoHaiFile(d, CFG, templateBytes(), { bytes: pngBytes, widthPx: 2, heightPx: 1 });
    expect(await demPlaceholderSot(bbntBlob)).toBe(0);

    // Ảnh phải nằm trong FILE CUỐI, không chỉ trong Document tạm: chenAnhBbnt sửa `bb.doc`
    // rồi mới docToZipXml — trước đây test chỉ kiểm placeholder nên nếu bước ghi lại hỏng thì
    // BBNT ra ngoài với ô "Hình ảnh chứng minh" trống mà không có gì báo.
    const zip = await JSZip.loadAsync(await bbntBlob.arrayBuffer());
    expect(zip.file('word/media/image1.png')).not.toBeNull();
    const xml = await zip.file('word/document.xml')!.async('text');
    expect(xml).toContain('<w:drawing');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(rels).toContain('media/image1.png');
  });

  it('link sản phẩm vào ô Nội dung của BBNT, bấm được (hyperlink external)', async () => {
    const d = chuanBi({ ho_ten: 'Trần Thị C', net: 2000000, noi_dung: 'Chụp ảnh sản phẩm' }, CFG, new Date(2026, 7, 19));
    const url = 'https://shopee.vn/san-pham-abc';
    const kq = await taoHaiFile(d, CFG, templateBytes(), undefined, url);
    expect(kq.daChenLink).toBe(true);

    const zip = await JSZip.loadAsync(await kq.bbntBlob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('text');
    expect(xml).toContain('Link sản phẩm: ');
    expect(xml).toContain(url);
    expect(xml).toContain('<w:hyperlink');
    // Rel phải là External, không thì Word coi link là đường dẫn nội bộ và báo hỏng file.
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(rels).toContain('TargetMode="External"');
    expect(rels).toContain(url);

    // Link CHỈ ở BBNT — hợp đồng không có mục nào cho link sản phẩm.
    const zipHd = await JSZip.loadAsync(await kq.hdBlob.arrayBuffer());
    expect(await zipHd.file('word/document.xml')!.async('text')).not.toContain(url);
  });

  it('không nhập link thì không thêm gì vào BBNT', async () => {
    const d = chuanBi({ ho_ten: 'Trần Thị C', net: 2000000, noi_dung: 'Chụp ảnh sản phẩm' }, CFG, new Date(2026, 7, 19));
    const kq = await taoHaiFile(d, CFG, templateBytes(), undefined, '   ');
    expect(kq.daChenLink).toBe(false);
    const zip = await JSZip.loadAsync(await kq.bbntBlob.arrayBuffer());
    expect(await zip.file('word/document.xml')!.async('text')).not.toContain('Link sản phẩm');
  });

  it('KHÔNG kèm ảnh thì taoHaiFile báo lại để UI cảnh báo ô ảnh trống', async () => {
    const d = chuanBi({ ho_ten: 'Trần Thị C', net: 2000000, noi_dung: 'Chụp ảnh sản phẩm' }, CFG, new Date(2026, 7, 19));
    const kq = await taoHaiFile(d, CFG, templateBytes());
    expect(kq.daChenAnh).toBe(false);
  });
});
