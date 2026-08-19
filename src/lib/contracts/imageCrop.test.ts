import { describe, expect, it } from 'vitest';
import { validateCropRegion } from './imageCrop';

describe('validateCropRegion', () => {
  it('null (không crop) luôn hợp lệ', () => {
    expect(() => validateCropRegion(null)).not.toThrow();
  });

  it('vùng hợp lệ trong khung 0..1 không ném lỗi', () => {
    expect(() => validateCropRegion({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).not.toThrow();
  });

  it('w hoặc h <= 0 thì ném lỗi', () => {
    expect(() => validateCropRegion({ x: 0, y: 0, w: 0, h: 0.5 })).toThrow('Vùng cắt ảnh nằm ngoài khung ảnh.');
  });

  it('x hoặc y âm thì ném lỗi', () => {
    expect(() => validateCropRegion({ x: -0.1, y: 0, w: 0.5, h: 0.5 })).toThrow();
  });

  it('vượt quá khung ảnh (x+w > 1) thì ném lỗi', () => {
    expect(() => validateCropRegion({ x: 0.8, y: 0, w: 0.5, h: 0.5 })).toThrow();
  });
});
