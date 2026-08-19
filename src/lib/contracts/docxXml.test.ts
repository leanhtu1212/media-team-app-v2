import { describe, expect, it } from 'vitest';
import {
  BA_CHAM, nfc, ptext, replaceAcrossRuns, replacePh, tatCaParagraph, timParagraph, vaXml, W_NS,
} from './docxXml';

function docTuXml(bodyInnerXml: string): Document {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}"><w:body>${bodyInnerXml}</w:body></w:document>`;
  return new DOMParser().parseFromString(xml, 'application/xml');
}

describe('nfc', () => {
  it('chuẩn hoá NFD về NFC', () => {
    const nfd = 'Bình'; // "Bình" viết dạng tổ hợp
    expect(nfc(nfd)).toBe('Bình');
  });
});

describe('ptext + tatCaParagraph', () => {
  it('gộp text mọi w:t trong 1 paragraph', () => {
    const doc = docTuXml('<w:p><w:r><w:t>Xin ch</w:t></w:r><w:r><w:t>ào</w:t></w:r></w:p>');
    const [p] = tatCaParagraph(doc);
    expect(ptext(p)).toBe('Xin chào');
  });
});

describe('replacePh', () => {
  it('thay lần lượt từng placeholder …', () => {
    const doc = docTuXml(`<w:p><w:r><w:t>Số: ${BA_CHAM}, ngày ${BA_CHAM}</w:t></w:r></w:p>`);
    const [p] = tatCaParagraph(doc);
    replacePh(p, ['123/HĐ', '19/08/2026']);
    expect(ptext(p)).toBe('Số: 123/HĐ, ngày 19/08/2026');
  });

  it('giá trị null giữ nguyên placeholder', () => {
    const doc = docTuXml(`<w:p><w:r><w:t>A: ${BA_CHAM}, B: ${BA_CHAM}</w:t></w:r></w:p>`);
    const [p] = tatCaParagraph(doc);
    replacePh(p, [null, 'X']);
    expect(ptext(p)).toBe(`A: ${BA_CHAM}, B: X`);
  });

  it('nhận cả "..." ba chấm ASCII', () => {
    const doc = docTuXml('<w:p><w:r><w:t>Tên: ...</w:t></w:r></w:p>');
    const [p] = tatCaParagraph(doc);
    replacePh(p, ['Nguyễn Văn A']);
    expect(ptext(p)).toBe('Tên: Nguyễn Văn A');
  });
});

describe('replaceAcrossRuns', () => {
  it('thay chuỗi bị Word cắt qua nhiều run', () => {
    const doc = docTuXml(
      '<w:p><w:r><w:t>BÀ TRẦN TRANG</w:t></w:r><w:r><w:t> ANH</w:t></w:r></w:p>',
    );
    const [p] = tatCaParagraph(doc);
    const ok = replaceAcrossRuns(p, 'BÀ TRẦN TRANG ANH', 'BÀ NGUYỄN THỊ B');
    expect(ok).toBe(true);
    expect(ptext(p)).toBe('BÀ NGUYỄN THỊ B');
  });

  it('trả về false khi không khớp', () => {
    const doc = docTuXml('<w:p><w:r><w:t>không liên quan</w:t></w:r></w:p>');
    const [p] = tatCaParagraph(doc);
    expect(replaceAcrossRuns(p, 'XYZ', 'ABC')).toBe(false);
  });
});

describe('timParagraph', () => {
  it('ưu tiên khớp startswith trước contains', () => {
    const doc = docTuXml(
      '<w:p><w:r><w:t>chứa Số: X ở giữa</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Số: 123</w:t></w:r></w:p>',
    );
    const P = tatCaParagraph(doc);
    const p = timParagraph(P, 'Số:');
    expect(ptext(p!)).toBe('Số: 123');
  });

  it('trả về null khi không tìm thấy', () => {
    const doc = docTuXml('<w:p><w:r><w:t>abc</w:t></w:r></w:p>');
    expect(timParagraph(tatCaParagraph(doc), 'không có')).toBeNull();
  });
});

describe('vaXml', () => {
  it('vá "Hôm nay …" nằm trong content-control (w:t không phải con trực tiếp của w:r cấp paragraph)', () => {
    const doc = docTuXml(
      `<w:sdt><w:sdtContent><w:p><w:r><w:t>Hôm nay, ngày ${BA_CHAM} tháng ${BA_CHAM} năm ${BA_CHAM}</w:t></w:r></w:p></w:sdtContent></w:sdt>`,
    );
    vaXml(doc, '19', '08', '2026');
    const [p] = tatCaParagraph(doc);
    expect(ptext(p)).toBe('Hôm nay, ngày 19 tháng 08 năm 2026');
  });
});
