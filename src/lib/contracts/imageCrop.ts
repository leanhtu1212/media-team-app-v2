// Cắt ảnh chứng minh bằng canvas — thay Pillow (server-side) của bản Python vì giờ chạy
// hoàn toàn trong trình duyệt. `vung` là tỉ lệ 0..1 so với khung ảnh gốc, giống images.py.
// Chỉ `catAnh` phụ thuộc DOM canvas thật — không test tự động được (xem docxImage.test.ts /
// Task 12 để test thủ công trên trình duyệt thật).

export interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ném lỗi nếu vùng cắt (tỉ lệ 0..1) nằm ngoài khung ảnh. null = không crop, luôn hợp lệ. */
export function validateCropRegion(vung: CropRegion | null): void {
  if (!vung) return;
  const { x, y, w, h } = vung;
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 1.0001 || y + h > 1.0001) {
    throw new Error('Vùng cắt ảnh nằm ngoài khung ảnh.');
  }
}

export interface CroppedImage {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  blob: Blob;
}

/** Cạnh dài tối đa (px) khi không truyền `canhDaiToiDa`. Ảnh trong BBNT chỉ rộng ~2,3 inch;
 *  ở 300 DPI là ~690 px, Word bỏ hết chi tiết vượt quá. Không hạ kích thước thì một tấm ảnh
 *  12 MP điện thoại thành PNG vài chục MB → treo trình duyệt lúc mã hoá base64 và Apps Script
 *  từ chối payload. Bản Python không cần vì ghi thẳng ra ổ đĩa mount, không đẩy qua HTTP. */
export const CANH_DAI_MAC_DINH = 700;

/** Cắt `file` (ảnh PNG/JPG) theo `vung` (tỉ lệ 0..1), trả PNG. `vung=null` giữ nguyên cả ảnh.
 *  Ảnh được thu nhỏ sao cho cạnh dài ≤ `canhDaiToiDa` (không bao giờ phóng to). */
export async function catAnh(
  file: Blob, vung: CropRegion | null, canhDaiToiDa = CANH_DAI_MAC_DINH,
): Promise<CroppedImage> {
  validateCropRegion(vung);
  const bitmap = await createImageBitmap(file);
  try {
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (vung) {
      sx = Math.round(vung.x * bitmap.width);
      sy = Math.round(vung.y * bitmap.height);
      sw = Math.round(vung.w * bitmap.width);
      sh = Math.round(vung.h * bitmap.height);
    }
    const gioiHan = Math.max(1, Math.round(canhDaiToiDa));
    const tiLe = Math.min(1, gioiHan / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * tiLe));
    const dh = Math.max(1, Math.round(sh * tiLe));

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không lấy được canvas 2D context.');
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG.'))), 'image/png'),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // widthPx/heightPx = kích thước THẬT của bytes trả về (docxImage tính tỉ lệ khung từ đây).
    return { bytes, widthPx: dw, heightPx: dh, blob };
  } finally {
    bitmap.close();
  }
}
