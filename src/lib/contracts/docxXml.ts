// Thao tác cấp thấp trên XML của document.xml (docx). Port từ D:\App\core\docx_util.py,
// nhưng làm việc trực tiếp trên DOM Element (thay vì object model python-docx).

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const BA_CHAM = '…';

export function nfc(s: string | null | undefined): string {
  return (s || '').normalize('NFC');
}

function isW(el: Element, local: string): boolean {
  return el.namespaceURI === W_NS && el.localName === local;
}

function directChildren(el: Element, local: string): Element[] {
  return Array.from(el.children).filter((c) => isW(c, local));
}

/** Text đầy đủ của 1 <w:p>, gộp cả w:t nằm trong content-control (đệ quy toàn bộ subtree). */
export function ptext(p: Element): string {
  const ts = p.getElementsByTagNameNS(W_NS, 't');
  let out = '';
  for (let i = 0; i < ts.length; i++) out += ts[i].textContent || '';
  return nfc(out);
}

export function tatCaParagraph(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));
}

/** <w:r> CON TRỰC TIẾP của <w:p> — khớp hành vi Paragraph.runs của python-docx, KHÔNG đi
 *  vào content-control lồng bên trong. */
export function runsOf(p: Element): Element[] {
  return directChildren(p, 'r');
}

/** Text đầy đủ của 1 <w:r>, khớp hành vi `Run.text` của python-docx: gộp MỌI <w:t> con trực
 *  tiếp (một run có thể chứa nhiều <w:t> xen <w:tab/>, ví dụ 2 nhãn "CCCD số:"/"Ngày cấp:"
 *  cách nhau bằng tab trong CÙNG 1 run), <w:tab/> → '\t', <w:br/>/<w:cr/> → '\n'. */
export function runText(r: Element): string {
  let out = '';
  for (const child of Array.from(r.children)) {
    if (isW(child, 't')) out += child.textContent || '';
    else if (isW(child, 'tab')) out += '\t';
    else if (isW(child, 'br') || isW(child, 'cr')) out += '\n';
  }
  return out;
}

/** Ghi lại toàn bộ nội dung text của 1 <w:r>, dựng lại <w:t>/<w:tab/>/<w:br/> từ chuỗi (đảo
 *  ngược runText) — giữ nguyên các con khác của run (vd <w:rPr>) và thứ tự tab/br gốc. */
export function setRunText(r: Element, text: string): void {
  for (const child of Array.from(r.children)) {
    if (isW(child, 't') || isW(child, 'tab') || isW(child, 'br') || isW(child, 'cr')) {
      r.removeChild(child);
    }
  }
  const doc = r.ownerDocument!;
  let buf = '';
  const flush = () => {
    if (buf === '') return;
    const t = doc.createElementNS(W_NS, 'w:t');
    t.textContent = buf;
    if (/^\s|\s$/.test(buf)) t.setAttribute('xml:space', 'preserve');
    r.appendChild(t);
    buf = '';
  };
  for (const ch of text) {
    if (ch === '\t') {
      flush();
      r.appendChild(doc.createElementNS(W_NS, 'w:tab'));
    } else if (ch === '\n') {
      flush();
      r.appendChild(doc.createElementNS(W_NS, 'w:br'));
    } else {
      buf += ch;
    }
  }
  flush();
  if (text === '') r.appendChild(doc.createElementNS(W_NS, 'w:t'));
}

/** Thay lần lượt từng placeholder '…' hoặc '...' bằng values[i]. null giữ nguyên placeholder.
 *  Ghi thẳng vào run chứa placeholder nên format gốc (bold/italic…) được giữ nguyên. */
export function replacePh(p: Element | null, values: (string | null)[]): void {
  if (!p) return;
  let chiSo = 0;
  const lay = (): string | null => (chiSo < values.length ? values[chiSo++] : null);

  for (const r of runsOf(p)) {
    const t = runText(r);
    if (!t.includes(BA_CHAM) && !t.includes('...')) continue;
    let ra = '';
    let i = 0;
    while (i < t.length) {
      if (t[i] === BA_CHAM) {
        const v = lay();
        ra += v ?? BA_CHAM;
        i += 1;
      } else if (t.startsWith('...', i)) {
        const v = lay();
        ra += v ?? '...';
        i += 3;
      } else {
        ra += t[i];
        i += 1;
      }
    }
    setRunText(r, ra);
  }
}

/** Thay chuỗi kể cả khi Word cắt nó qua nhiều run. Phần thay thế ghi vào run chứa ký tự đầu
 *  tiên của chuỗi cũ (thừa hưởng format run đó); các run còn lại chỉ bị xoá phần chồng lấn. */
export function replaceAcrossRuns(p: Element | null, cu: string, moi: string): boolean {
  if (!p) return false;
  const runs = runsOf(p);
  let texts = runs.map(runText);
  let gop = texts.join('');
  let dau = gop.indexOf(cu);
  if (dau < 0) {
    // Đoạn có thể đang ở dạng NFD — chuẩn hoá rồi ghi lại vào run để chỉ số ký tự khớp.
    const chuan = texts.map(nfc);
    dau = chuan.join('').indexOf(cu);
    if (dau < 0) return false;
    runs.forEach((r, i) => setRunText(r, chuan[i]));
    texts = chuan;
  }
  const cuoi = dau + cu.length;
  let viTri = 0;
  runs.forEach((r, i) => {
    const t = texts[i];
    const batDau = viTri;
    const ketThuc = viTri + t.length;
    viTri = ketThuc;
    if (ketThuc <= dau || batDau >= cuoi) return;
    const trai = t.slice(0, Math.max(dau, batDau) - batDau);
    const phai = t.slice(Math.min(cuoi, ketThuc) - batDau);
    setRunText(r, batDau <= dau && dau < ketThuc ? trai + moi + phai : trai + phai);
  });
  return true;
}

/** Khớp startswith trước (chính xác hơn), không có thì khớp contains. */
export function timParagraph(danhSach: Element[], tienTo: string): Element | null {
  for (const p of danhSach) {
    if (ptext(p).trim().startsWith(tienTo)) return p;
  }
  for (const p of danhSach) {
    if (ptext(p).includes(tienTo)) return p;
  }
  return null;
}

/** Vá dòng "Hôm nay …" còn sót trong content-control (w:t không phải con trực tiếp của
 *  w:r cấp paragraph nên replacePh không sửa được) — quét MỌI w:t trong toàn document. */
export function vaXml(doc: Document, dd: string, mm: string, yy: string): void {
  const ts = doc.getElementsByTagNameNS(W_NS, 't');
  const giaTri = [dd, mm, yy];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const text = t.textContent || '';
    if (text.startsWith('Hôm nay') && text.includes(BA_CHAM)) {
      let k = 0;
      let ra = '';
      for (const ch of text) {
        if (ch === BA_CHAM && k < 3) {
          ra += giaTri[k];
          k += 1;
        } else {
          ra += ch;
        }
      }
      t.textContent = ra;
    }
  }
}

export function rowsOfTable(tbl: Element): Element[] {
  return directChildren(tbl, 'tr');
}

export function cellsOfRow(tr: Element): Element[] {
  return directChildren(tr, 'tc');
}

export function paragraphsOf(el: Element): Element[] {
  return directChildren(el, 'p');
}
