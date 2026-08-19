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

/** Cắt `file` (ảnh PNG/JPG) theo `vung` (tỉ lệ 0..1), trả PNG. `vung=null` giữ nguyên cả ảnh. */
export async function catAnh(file: Blob, vung: CropRegion | null): Promise<CroppedImage> {
  validateCropRegion(vung);
  const bitmap = await createImageBitmap(file);
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
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không lấy được canvas 2D context.');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG.'))), 'image/png'),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, widthPx: sw, heightPx: sh, blob };
}
