// Chèn ảnh chứng minh vào ô "Hạng mục" cột 3 của bảng Điều 1 BBNT. Dựng thủ công XML
// <w:drawing> + relationship + content-type vì không dùng thư viện tạo docx nào có sẵn API
// "chèn ảnh vào ô có sẵn". Cấu trúc XML là inline picture tối thiểu chuẩn OOXML, tương đương
// cấu trúc python-docx's add_picture() tự sinh (port ý tưởng từ D:\App\core\images.py, nhưng
// crop ảnh đã làm ở bước khác — xem imageCrop.ts — hàm này chỉ lo nhúng ảnh đã crop sẵn).

import type JSZip from 'jszip';
import { cellsOfRow, nfc, paragraphsOf, rowsOfTable, runsOf, setRunText, W_NS } from './docxXml';

const EMU_PER_INCH = 914400;
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

async function xmlDoc(zip: JSZip, path: string): Promise<Document> {
  const file = zip.file(path);
  if (!file) throw new Error(`Không tìm thấy ${path} trong file mẫu.`);
  const xml = await file.async('text');
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function writeXml(zip: JSZip, path: string, doc: Document): void {
  zip.file(path, new XMLSerializer().serializeToString(doc));
}

function nextImageName(zip: JSZip): string {
  let i = 1;
  while (zip.file(`word/media/image${i}.png`)) i++;
  return `image${i}.png`;
}

/** Thêm một Relationship vào word/_rels/document.xml.rels, trả về Id vừa cấp. */
async function themRel(
  zip: JSZip, loai: string, target: string, ngoai = false,
): Promise<string> {
  const relsPath = 'word/_rels/document.xml.rels';
  const relsDoc = await xmlDoc(zip, relsPath);
  const relsRoot = relsDoc.documentElement;
  const existingIds = Array.from(relsRoot.getElementsByTagNameNS(RELS_NS, 'Relationship'))
    .map((r) => Number((r.getAttribute('Id') || 'rId0').replace('rId', '')))
    .filter((n) => !Number.isNaN(n));
  const relId = `rId${Math.max(0, ...existingIds) + 1}`;
  const rel = relsDoc.createElementNS(RELS_NS, 'Relationship');
  rel.setAttribute('Id', relId);
  rel.setAttribute('Type', `${R_NS}/${loai}`);
  rel.setAttribute('Target', target);
  if (ngoai) rel.setAttribute('TargetMode', 'External');
  relsRoot.appendChild(rel);
  writeXml(zip, relsPath, relsDoc);
  return relId;
}

async function addImagePart(zip: JSZip, bytes: Uint8Array): Promise<{ relId: string }> {
  const name = nextImageName(zip);
  zip.file(`word/media/${name}`, bytes);
  const relId = await themRel(zip, 'image', `media/${name}`);

  const ctPath = '[Content_Types].xml';
  const ctDoc = await xmlDoc(zip, ctPath);
  const hasPngDefault = Array.from(ctDoc.getElementsByTagNameNS(CT_NS, 'Default')).some(
    (d) => (d.getAttribute('Extension') || '').toLowerCase() === 'png',
  );
  if (!hasPngDefault) {
    const def = ctDoc.createElementNS(CT_NS, 'Default');
    def.setAttribute('Extension', 'png');
    def.setAttribute('ContentType', 'image/png');
    ctDoc.documentElement.appendChild(def);
    writeXml(zip, ctPath, ctDoc);
  }

  return { relId };
}

function buildDrawingRun(doc: Document, relId: string, widthPx: number, heightPx: number, rongInch: number): Element {
  const widthEmu = Math.round(rongInch * EMU_PER_INCH);
  const heightEmu = Math.round(widthEmu * (heightPx / widthPx));

  const r = doc.createElementNS(W_NS, 'w:r');
  const drawing = doc.createElementNS(W_NS, 'w:drawing');
  const inline = doc.createElementNS(WP_NS, 'wp:inline');
  inline.setAttribute('distT', '0');
  inline.setAttribute('distB', '0');
  inline.setAttribute('distL', '0');
  inline.setAttribute('distR', '0');

  const extent = doc.createElementNS(WP_NS, 'wp:extent');
  extent.setAttribute('cx', String(widthEmu));
  extent.setAttribute('cy', String(heightEmu));
  inline.appendChild(extent);

  const docPr = doc.createElementNS(WP_NS, 'wp:docPr');
  docPr.setAttribute('id', '1');
  docPr.setAttribute('name', 'AnhChungMinh');
  inline.appendChild(docPr);

  const graphic = doc.createElementNS(A_NS, 'a:graphic');
  const graphicData = doc.createElementNS(A_NS, 'a:graphicData');
  graphicData.setAttribute('uri', PIC_NS);

  const pic = doc.createElementNS(PIC_NS, 'pic:pic');
  const nvPicPr = doc.createElementNS(PIC_NS, 'pic:nvPicPr');
  const cNvPr = doc.createElementNS(PIC_NS, 'pic:cNvPr');
  cNvPr.setAttribute('id', '0');
  cNvPr.setAttribute('name', 'AnhChungMinh');
  nvPicPr.appendChild(cNvPr);
  nvPicPr.appendChild(doc.createElementNS(PIC_NS, 'pic:cNvPicPr'));
  pic.appendChild(nvPicPr);

  const blipFill = doc.createElementNS(PIC_NS, 'pic:blipFill');
  const blip = doc.createElementNS(A_NS, 'a:blip');
  blip.setAttributeNS(R_NS, 'r:embed', relId);
  blipFill.appendChild(blip);
  const stretch = doc.createElementNS(A_NS, 'a:stretch');
  stretch.appendChild(doc.createElementNS(A_NS, 'a:fillRect'));
  blipFill.appendChild(stretch);
  pic.appendChild(blipFill);

  const spPr = doc.createElementNS(PIC_NS, 'pic:spPr');
  const xfrm = doc.createElementNS(A_NS, 'a:xfrm');
  const off = doc.createElementNS(A_NS, 'a:off');
  off.setAttribute('x', '0');
  off.setAttribute('y', '0');
  const ext = doc.createElementNS(A_NS, 'a:ext');
  ext.setAttribute('cx', String(widthEmu));
  ext.setAttribute('cy', String(heightEmu));
  xfrm.appendChild(off);
  xfrm.appendChild(ext);
  spPr.appendChild(xfrm);
  const prstGeom = doc.createElementNS(A_NS, 'a:prstGeom');
  prstGeom.setAttribute('prst', 'rect');
  prstGeom.appendChild(doc.createElementNS(A_NS, 'a:avLst'));
  spPr.appendChild(prstGeom);
  pic.appendChild(spPr);

  graphicData.appendChild(pic);
  graphic.appendChild(graphicData);
  inline.appendChild(graphic);
  drawing.appendChild(inline);
  r.appendChild(drawing);
  return r;
}

/** Ô hàng 2 của bảng "Hạng mục" trong BBNT, theo chỉ số cột. null nếu không tìm thấy bảng. */
function oBangHangMuc(doc: Document, cot: number): Element | null {
  for (const tb of Array.from(doc.getElementsByTagNameNS(W_NS, 'tbl'))) {
    const rows = rowsOfTable(tb);
    if (!rows.length) continue;
    const oDau = cellsOfRow(rows[0]).map((c) => nfc(c.textContent || '').trim());
    if (!oDau.includes('Hạng mục')) continue;
    if (rows.length < 2) return null;
    return cellsOfRow(rows[1])[cot] || null;
  }
  return null;
}

/**
 * Thêm dòng "Link sản phẩm: <url>" vào ô Nội dung (cột 2) của bảng Điều 1 BBNT.
 *
 * Dựng bằng cách NHÂN BẢN đoạn có sẵn trong ô rồi thay chữ, để thừa hưởng nguyên font/cỡ/căn
 * lề của mẫu — tự tạo <w:p> trắng thì đoạn link ra khác hẳn phần còn lại của bảng.
 * URL bọc trong <w:hyperlink> + rel TargetMode="External" nên bấm được trong Word.
 */
export async function chenLinkSpBbnt(zip: JSZip, doc: Document, url: string): Promise<boolean> {
  const link = (url || '').trim();
  if (!link) return false;
  const cell = oBangHangMuc(doc, 1);
  if (!cell) return false;
  const mau = paragraphsOf(cell)[0];
  if (!mau) return false;

  const p = mau.cloneNode(true) as Element;
  const runs = runsOf(p);
  if (!runs.length) return false;
  // Giữ đúng 1 run làm khuôn định dạng, bỏ phần còn lại (đoạn gốc có thể nhiều run).
  for (const r of runs.slice(1)) p.removeChild(r);
  const nhan = runs[0];
  setRunText(nhan, 'Link sản phẩm: ');

  const runLink = nhan.cloneNode(true) as Element;
  setRunText(runLink, link);
  const relId = await themRel(zip, 'hyperlink', link, true);
  const hyperlink = doc.createElementNS(W_NS, 'w:hyperlink');
  hyperlink.setAttributeNS(R_NS, 'r:id', relId);
  hyperlink.appendChild(runLink);
  p.appendChild(hyperlink);

  cell.appendChild(p);
  return true;
}

/** Chèn ảnh vào ô "Hình ảnh chứng minh" (cột 3) của bảng Điều 1 BBNT. `doc` phải là Document
 *  đã parse từ word/document.xml của CHÍNH `zip` này (caller ghi lại document.xml sau khi gọi
 *  xong — xem Task 8's `docToZipXml`). Trả false nếu không tìm thấy bảng "Hạng mục". */
export async function chenAnhBbnt(
  zip: JSZip, doc: Document, bytes: Uint8Array, widthPx: number, heightPx: number, rongInch: number,
): Promise<boolean> {
  const tbls = Array.from(doc.getElementsByTagNameNS(W_NS, 'tbl'));
  for (const tb of tbls) {
    const rows = rowsOfTable(tb);
    if (!rows.length) continue;
    const oDau = cellsOfRow(rows[0]).map((c) => nfc(c.textContent || '').trim());
    if (!oDau.includes('Hạng mục')) continue;
    if (rows.length < 2) return false;
    const cell = cellsOfRow(rows[1])[2];
    if (!cell) return false;
    const p = paragraphsOf(cell)[0];
    if (!p) return false;
    for (const r of runsOf(p)) p.removeChild(r);

    const { relId } = await addImagePart(zip, bytes);
    p.appendChild(buildDrawingRun(doc, relId, widthPx, heightPx, rongInch));
    return true;
  }
  return false;
}
