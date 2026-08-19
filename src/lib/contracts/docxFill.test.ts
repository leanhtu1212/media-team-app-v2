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
});
