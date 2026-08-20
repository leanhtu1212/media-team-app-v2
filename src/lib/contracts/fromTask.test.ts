import { describe, expect, it } from 'vitest';
import { dongTuKhoanChi, laKhoanChiHopDong } from './fromTask';
import type { Project, Task } from '../../types';

const TASK: Task = {
  id: 'task1',
  projectId: 'p1',
  title: 'Booking KOC quay review',
  category: 'pre-production',
  status: 'pending',
  amount: 5000000,
  hopDong: true,
  hopDongHoTen: 'Ngô Trần Ngọc Tú',
};

const PROJECT = { id: 'p1', title: 'Ecom tháng 8', status: 'plan' } as Project;

describe('laKhoanChiHopDong', () => {
  it('chỉ nhận chi phí tiền kỳ đã tick', () => {
    expect(laKhoanChiHopDong(TASK)).toBe(true);
    expect(laKhoanChiHopDong({ ...TASK, hopDong: false })).toBe(false);
    // Task ảnh/video không bao giờ là hợp đồng, kể cả nếu dữ liệu cũ lỡ có cờ.
    expect(laKhoanChiHopDong({ ...TASK, category: 'video' })).toBe(false);
  });
});

describe('dongTuKhoanChi', () => {
  it('lấy tên/nội dung/tiền từ khoản chi và gắn dự án', () => {
    const r = dongTuKhoanChi(TASK, PROJECT);
    expect(r.ho_ten).toBe('Ngô Trần Ngọc Tú');
    expect(r.noi_dung).toBe('Booking KOC quay review');
    expect(r.tien).toBe('5.000.000');
    expect(r.projectTitle).toBe('Ecom tháng 8');
    expect(r.taskId).toBe('task1');
  });

  it('chưa sinh file = người mới, sinh rồi = đã làm', () => {
    expect(dongTuKhoanChi(TASK, PROJECT).nguoi_moi).toBe(true);
    expect(dongTuKhoanChi({ ...TASK, hopDongDaLam: true }, PROJECT).nguoi_moi).toBe(false);
  });

  it('ghép thông tin cá nhân tra được, nhưng nội dung/tiền vẫn theo khoản chi', () => {
    const r = dongTuKhoanChi(TASK, PROJECT, {
      cccd: '001194007976', ngan_hang: 'Techcombank',
      noi_dung: 'việc cũ của lần trước', net: '1.000.000',
    });
    expect(r.form.cccd).toBe('001194007976');
    expect(r.form.ngan_hang).toBe('Techcombank');
    expect(r.noi_dung).toBe('Booking KOC quay review');
    expect(r.tien).toBe('5.000.000');
  });

  it('dự án đã xoá thì vẫn dựng được dòng', () => {
    expect(dongTuKhoanChi(TASK, undefined).projectTitle).toBe('');
  });
});
