import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { chuanBi, type ContractSettings } from './compute';
import { chenAnhBbnt } from './docxImage';

const CFG: ContractSettings = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30,
  baoTruocChamDut: 5, ngayThanhLy: 30, hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3,
};

// PNG 2x1 pixel đỏ/xanh, dựng tay (không cần file ngoài).
const PNG_2X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFUlEQVR4nGP8z8DwnwEIGAkFjIMBAJqOA/8DfLQ2AAAAAElFTkSuQmCC';

function pngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(PNG_2X1_BASE64, 'base64'));
}

function templateBytes(): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../assets/contracts/HDDV_BBNT_Mau_moi.docx'));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('chenAnhBbnt', () => {
  it('thêm media part + rels + w:drawing vào ô ảnh của bảng "Hạng mục"', async () => {
    const d = chuanBi({ ho_ten: 'Nguyễn Văn A', net: 1000000, noi_dung: 'Quay video' }, CFG, new Date(2026, 7, 19));
    void d;
    // Bọc lại bằng Uint8Array — dưới vitest+jsdom, ArrayBuffer đọc qua Node `fs` có thể khác
    // "realm" với ArrayBuffer toàn cục mà JSZip dùng để instanceof-check (xem docxFill.ts).
    const zip = await JSZip.loadAsync(new Uint8Array(templateBytes()));
    const xml = await zip.file('word/document.xml')!.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    const ok = await chenAnhBbnt(zip, doc, pngBytes(), 2, 1, 2.3);
    expect(ok).toBe(true);

    // 1. Có media part mới.
    expect(zip.file('word/media/image1.png')).not.toBeNull();

    // 2. Có relationship trỏ tới nó.
    const relsXml = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(relsXml).toContain('media/image1.png');

    // 3. [Content_Types].xml có khai báo extension png.
    const ctXml = await zip.file('[Content_Types].xml')!.async('text');
    expect(ctXml.toLowerCase()).toContain('extension="png"');

    // 4. document.xml (đã sửa qua `doc`) có <w:drawing> mới.
    const serialized = new XMLSerializer().serializeToString(doc);
    expect(serialized).toContain('w:drawing');
    expect(serialized).toContain('pic:pic');
  });

  it('trả về false nếu không tìm thấy bảng "Hạng mục"', async () => {
    const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const zip = new JSZip();
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    const ok = await chenAnhBbnt(zip, doc, pngBytes(), 2, 1, 2.3);
    expect(ok).toBe(false);
  });
});
