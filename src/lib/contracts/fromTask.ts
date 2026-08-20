// Khoản chi tiền kỳ có tick "có làm HĐ" -> một dòng trong bảng tab Hợp đồng.
//
// Vì sao cần: bảng Hợp đồng vốn chỉ đọc sheet "Danh sách làm HĐ", mà sheet không có cột dự án
// và cũng không chứa hợp đồng phát sinh từ chi phí của một dự án. Dựng dòng từ task là cách
// duy nhất để cột "Dự án" có dữ liệu thật (xem CLAUDE.md mục 15).

import type { Project, Task } from '../../types';
import type { QuickParseForm } from './quickParse';
import type { SheetRow } from './sheetSync';
import { fmtSo } from './money';

/** Chi phí đã tick "làm HĐ". Task chưa tick thì không phải việc của tab Hợp đồng. */
export function laKhoanChiHopDong(t: Task): boolean {
  return t.category === 'pre-production' && !!t.hopDong;
}

/**
 * `thongTin` = thông tin cá nhân tra từ lịch sử đối tác (contractPartners) theo họ tên;
 * không có thì dòng chỉ hiện tên + tiền + nội dung, mở modal ra dán khối text là đủ.
 */
export function dongTuKhoanChi(
  task: Task, project: Project | undefined, thongTin?: QuickParseForm,
): SheetRow {
  const hoTen = String(task.hopDongHoTen || '').trim();
  const tien = Number(task.amount) || 0;
  const form: QuickParseForm = {
    ...(thongTin || {}),
    ho_ten: hoTen || thongTin?.ho_ten || '',
    noi_dung: task.title || '',
    net: tien ? fmtSo(tien) : '',
  };
  return {
    // `dong` chỉ có nghĩa với dòng đọc từ sheet; dòng này không nằm trong sheet nên để 0,
    // định danh bằng taskId (cũng là React key).
    dong: 0,
    stt: '',
    ho_ten: form.ho_ten || '',
    noi_dung: form.noi_dung || '',
    tien: form.net || '',
    link_sp: '',
    link_luu: '',
    // "Đã làm" ở đây = đã sinh file, KHÔNG phải đã có link trong sheet — app không ghi ngược
    // lại sheet nên hai chuyện đó không bao giờ trùng nhau.
    da_co_hd: !!task.hopDongDaLam,
    da_co_bbnt: !!task.hopDongDaLam,
    nguoi_moi: !task.hopDongDaLam,
    done: !!task.dntt,
    form,
    goc: {},
    khongRo: [],
    taskId: task.id,
    projectId: task.projectId,
    projectTitle: project?.title || '',
  };
}
