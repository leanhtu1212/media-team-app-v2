import { describe, expect, it } from 'vitest';
import { boDau, chuanHoa, lamSachTenFile, taoSoHopDong, tenFileBbnt, tenFileHd, vietTat } from './naming';

describe('boDau', () => {
  it('bỏ dấu tiếng Việt, giữ đ/Đ dạng d/D', () => {
    expect(boDau('Mã Thị Thanh Bình')).toBe('Ma Thi Thanh Binh');
    expect(boDau('Đông Đô')).toBe('Dong Do');
  });
});

describe('chuanHoa', () => {
  it('bỏ dấu, thường hoá, gộp khoảng trắng', () => {
    expect(chuanHoa('  Mã   Thị  Bình  ')).toBe('ma thi binh');
  });
});

describe('vietTat', () => {
  it('lấy chữ cái đầu mỗi từ, viết hoa', () => {
    expect(vietTat('Mã Thị Thanh Bình')).toBe('MTTB');
  });
});

describe('taoSoHopDong', () => {
  it('format ddmmyy/HĐ/ALC-<viết tắt>', () => {
    expect(taoSoHopDong('Mã Thị Thanh Bình', new Date(2026, 7, 14))).toBe('140826/HĐ/ALC-MTTB');
  });
});

describe('lamSachTenFile', () => {
  it('thay ký tự cấm bằng khoảng trắng, gộp khoảng trắng, bỏ dấu chấm/space cuối', () => {
    expect(lamSachTenFile('Video: A/B "test"...')).toBe('Video A B test');
  });
});

describe('tenFileHd / tenFileBbnt', () => {
  it('ghép đúng tiền tố', () => {
    expect(tenFileHd('Mã Thị Bình', 'Sản xuất Reels')).toBe('Hop dong - Ma Thi Binh - San xuat Reels.docx');
    expect(tenFileBbnt('Mã Thị Bình', 'Sản xuất Reels')).toBe('BBNT - Ma Thi Binh - San xuat Reels.docx');
  });
});
