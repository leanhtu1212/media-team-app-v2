/**
 * Media Team — Google Sheets sync + Apple Calendar (iCal) feed webhook.
 *
 * CÁCH CÀI ĐẶT:
 * 1. Mở Google Sheet của bạn → Extensions (Tiện ích mở rộng) → Apps Script
 * 2. Xoá code mặc định, dán TOÀN BỘ file này vào (đè lên bản cũ nếu có)
 * 3. Nhấn Deploy → New deployment (hoặc Manage deployments → Edit → New version) → "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Nhấn Deploy, copy "Web app URL" (dạng .../exec)
 * 5. Vào app → Cài đặt:
 *    - Đồng bộ Google Sheet → dán URL → Lưu  (dùng POST)
 *    - Lịch Apple (iCal) → nhấn "Cập nhật feed", rồi Subscribe URL trên Apple Calendar
 *      (Apple Calendar → File → New Calendar Subscription → dán URL webcal://.../exec)
 *
 * LƯU Ý: mỗi lần đổi code phải Deploy version mới thì URL mới có doGet trả .ics.
 *
 * ============================================================================
 * BẮT BUỘC cho tính năng Hợp đồng KOL/KOC (2026-08) — USER Properties
 * ============================================================================
 * Web app này chạy dưới quyền "Execute as: Me / Who has access: Anyone", tức là
 * BẤT KỲ AI biết URL cũng gọi được. URL lại nằm ở team doc mà mọi thành viên đọc
 * được. Vì dữ liệu hợp đồng có CCCD + số tài khoản, ba endpoint hợp đồng:
 *   - KHÔNG nhận sheetId / rootFolderId từ phía client nữa (đọc từ User Property),
 *   - BẮT BUỘC kèm token khớp CONTRACT_TOKEN,
 *   - chỉ ghi được vào thư mục nằm BÊN TRONG CONTRACT_ROOT_FOLDER_ID.
 * Feed .ics và đồng bộ Google Sheet giữ nguyên như cũ, KHÔNG cần token.
 *
 * ⚠ 4 giá trị cấu hình nằm ở USER Properties, KHÔNG phải Script Properties.
 * Lý do: hàm saveIcs_ (feed lịch Apple) gọi setProperties(map, true) — tham số
 * `true` = XOÁ MỌI KEY KHÁC trong Script Properties. Mỗi lần app bấm "Cập nhật
 * feed" là 4 property hợp đồng bị xoá sạch, tab Hợp đồng chết và phải nhập tay lại.
 * Để ở User Properties thì feed .ics không bao giờ đụng tới.
 *
 * ⚠ Vì thế deployment BẮT BUỘC là "Execute as: Me": User Properties gắn với NGƯỜI
 * ĐANG CHẠY script. Deploy "Execute as: Me" → người chạy hiệu dụng trong web app
 * chính là chủ script, đúng bằng người bấm Run trong trình soạn thảo Apps Script,
 * nên hai bên đọc CÙNG một kho User Properties. Nếu đổi sang "Execute as: User
 * accessing the web app" thì mỗi người gọi sẽ có kho riêng (rỗng) → hỏng ngay.
 *
 * Cách đặt: Project Settings → Script Properties KHÔNG quản lý User Properties
 * (không có giao diện nhập tay), nên phải chạy hàm setup trong file này:
 *   1. Mở Apps Script → tìm hàm `thietLapCauHinhHopDong` ở cuối file
 *   2. Sửa 4 hằng số ở đầu hàm thành giá trị thật:
 *        CONTRACT_SHEET_ID        = id của Google Sheet "Danh sách làm HĐ"
 *                                   (phần giữa /d/ và /edit trong URL sheet)
 *        CONTRACT_SHEET_TAB       = tên tab chứa danh sách (vd: Thanh Toán)
 *        CONTRACT_ROOT_FOLDER_ID  = id thư mục Drive gốc để lưu HĐ/BBNT
 *                                   (phần sau /folders/ trong URL thư mục)
 *        CONTRACT_TOKEN           = chuỗi bí mật tự đặt (dài, ngẫu nhiên). Dán ĐÚNG
 *                                   chuỗi này vào app → Hợp đồng → Cài đặt → "Token".
 *                                   Token lưu ở teams/{id}/private/contracts (admin-only).
 *   3. Chọn hàm `thietLapCauHinhHopDong` trên thanh công cụ → Run (chạy 1 lần)
 *   4. Kiểm lại bất cứ lúc nào bằng cách Run hàm `kiemTraCauHinhHopDong`
 *      (chỉ đọc, in ra Log, token bị che chỉ còn 4 ký tự đầu)
 *   5. Nên xoá lại 4 giá trị thật trong code sau khi chạy xong (giá trị đã nằm
 *      trong User Properties rồi) để không lưu token dạng chữ thường trong file.
 * Thiếu property nào thì mọi endpoint hợp đồng trả { ok:false, error:'Chưa cấu hình…' }.
 * Đổi CONTRACT_TOKEN thì chạy lại hàm setup + sửa token trong app; KHÔNG cần Deploy
 * lại (property đọc lúc chạy), nhưng đổi CODE thì vẫn phải Deploy version mới.
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // --- Hợp đồng KOL/KOC ---
    if (data.action === 'contract-drive-match') return contractDriveMatch_(data);
    if (data.action === 'contract-drive-copy') return contractDriveCopy_(data);

    // --- Feed lịch Apple: lưu chuỗi .ics do app build sẵn ---
    if (data.type === 'ics') {
      saveIcs_(data.ics || '');
      return json_({ ok: true });
    }

    // --- Đồng bộ Google Sheet (giữ nguyên như cũ) ---
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var totalRows = 0;
    var sheetNames = Object.keys(data.sheets);
    for (var i = 0; i < sheetNames.length; i++) {
      var name = sheetNames[i];
      var block = data.sheets[name];
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      sh.clearContents();
      sh.clearFormats();
      // clearFormats KHÔNG bỏ merge — còn ô merge cũ của dòng tiêu đề thì setValues sẽ lỗi.
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();

      // 1 tab có thể chứa NHIỀU bảng (section) xếp dọc, cách nhau 2 dòng trống.
      // Bản cũ gửi {headers, rows} → bọc lại thành 1 section không tiêu đề cho tương thích.
      var sections = block.sections || [{ title: '', headers: block.headers, rows: block.rows }];
      var row = 1;
      var maxCol = 1;
      sh.setFrozenRows(0); // đặt lại, chỉ khoá khi bảng đầu nằm ngay dòng 1
      for (var s = 0; s < sections.length; s++) {
        var sec = sections[s];
        var nCol = sec.headers.length;
        if (nCol > maxCol) maxCol = nCol;
        ensureRows_(sh, row + sec.rows.length + 4);

        if (sec.title) {
          sh.getRange(row, 1, 1, nCol).merge()
            .setValue(sec.title)
            .setFontWeight('bold').setFontSize(12).setBackground('#e8eaed');
          row++;
        }
        sh.getRange(row, 1, 1, nCol).setValues([sec.headers])
          .setFontWeight('bold').setBackground('#f1f3f4');
        // Chỉ khoá dòng đầu khi bảng đầu tiên bắt đầu ngay từ dòng 1 (tab báo cáo app cũ).
        if (s === 0 && row === 1) sh.setFrozenRows(1);
        row++;

        if (sec.rows.length > 0) {
          sh.getRange(row, 1, sec.rows.length, nCol).setValues(sec.rows);
          boldSummaryRows_(sh, sec.rows, nCol, row);
          row += sec.rows.length;
        } else {
          sh.getRange(row, 1).setValue('(không có dữ liệu)').setFontStyle('italic');
          row++;
        }
        row += 2; // chừa 2 dòng trống trước bảng kế tiếp
        totalRows += sec.rows.length;
      }
      sh.autoResizeColumns(1, maxCol);
      sh.getRange(row, 1).setValue('Cập nhật: ' + data.syncedAt);
    }
    return json_({ ok: true, rows: totalRows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Nới thêm dòng nếu bảng dài hơn số dòng sẵn có (mặc định 1000) — không thì setValues lỗi. */
function ensureRows_(sh, needed) {
  var have = sh.getMaxRows();
  if (needed > have) sh.insertRowsAfter(have, needed - have);
}

/** In đậm các dòng tổng kết (TỔNG TEAM / KPI TEAM) cho dễ đọc. `startRow` = dòng của rows[0]. */
function boldSummaryRows_(sh, rows, nCol, startRow) {
  for (var r = 0; r < rows.length; r++) {
    var label = String(rows[r][1] || rows[r][0] || '');
    if (label.indexOf('TỔNG') === 0 || label.indexOf('KPI TEAM') === 0 || label.indexOf('TB KPI') === 0) {
      sh.getRange(startRow + r, 1, 1, nCol).setFontWeight('bold').setBackground('#fff8e1');
    }
  }
}

/** Apple/Google Calendar gọi GET để lấy feed .ics. Hợp đồng KOL/KOC gọi GET để lấy sheet. */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'contract-list') {
    return contractList_(e.parameter);
  }
  var ics = loadIcs_();
  if (!ics) {
    ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Media Team//Lich//VI\r\nEND:VCALENDAR';
  }
  return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
}

/** Lưu .ics vào Script Properties, chia nhỏ 8000 ký tự/chunk (vượt giới hạn 9KB/property). */
function saveIcs_(ics) {
  var size = 8000;
  var n = Math.max(1, Math.ceil(ics.length / size));
  var map = { ICS_N: String(n) };
  for (var j = 0; j < n; j++) map['ICS_' + j] = ics.substr(j * size, size);
  // ⚠ Tham số `true` = deleteAllOthers: XOÁ MỌI KEY KHÁC trong Script Properties (cần thiết để
  // dọn chunk ICS_* cũ khi feed ngắn lại). Vì vậy TUYỆT ĐỐI không lưu cấu hình gì khác ở
  // Script Properties — cấu hình hợp đồng (CONTRACT_*) nằm ở User Properties, xem đầu file.
  PropertiesService.getScriptProperties().setProperties(map, true);
}

/** Ghép lại .ics từ các chunk đã lưu. */
function loadIcs_() {
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty('ICS_N') || 0);
  if (!n) return '';
  var parts = [];
  for (var i = 0; i < n; i++) parts.push(props.getProperty('ICS_' + i) || '');
  return parts.join('');
}

// ============ Hợp đồng KOL/KOC (thêm 2026-08) ============
// GET  ?action=contract-list&token=...                     -> { ok, rows: [[...], ...] }
// POST {action:'contract-drive-match', token, ten, depth}  -> { ok, ket_qua: [{id,name}] }
// POST {action:'contract-drive-copy', token, filename, base64, folderId?, ten?}
//      -> { ok, fileId, name, folderId }
// Đọc sheet CHỈ trả raw rows — việc hiểu cột nào là gì nằm ở client (src/lib/contracts/sheetSync.ts),
// để không lặp logic quick_parse/sheet_sync ở hai ngôn ngữ.
//
// BẢO MẬT: sheetId / rootFolderId / sheetTab KHÔNG còn lấy từ request (xem khối chú thích
// đầu file). Nếu client vẫn gửi kèm thì bị BỎ QUA hoàn toàn — nếu không, ai biết URL webhook
// cũng đọc được sheet bất kỳ hoặc ghi file vào thư mục Drive bất kỳ của chủ script.
// 4 giá trị này nằm ở USER Properties (đặt bằng cách chạy `thietLapCauHinhHopDong()` trong
// trình soạn thảo), KHÔNG phải Script Properties — Script Properties bị saveIcs_ xoá sạch
// mỗi lần app cập nhật feed .ics. Deployment BẮT BUỘC "Execute as: Me" để web app và trình
// soạn thảo cùng đọc một kho User Properties. Chi tiết xem khối chú thích đầu file.

/** Tên 4 khoá cấu hình hợp đồng. Dùng chung cho hàm setup, hàm kiểm tra và hàm đọc. */
var KHOA_HOP_DONG = [
  'CONTRACT_SHEET_ID',
  'CONTRACT_SHEET_TAB',
  'CONTRACT_ROOT_FOLDER_ID',
  'CONTRACT_TOKEN',
];

/**
 * Đọc cấu hình hợp đồng từ USER Properties (KHÔNG phải Script Properties — saveIcs_ dùng
 * setProperties(map, true) sẽ xoá sạch Script Properties mỗi lần cập nhật feed .ics).
 * Web app deploy "Execute as: Me" nên người chạy hiệu dụng = chủ script = người bấm Run
 * trong trình soạn thảo → cả hai ngữ cảnh đọc cùng một kho.
 */
function propHD_(ten) {
  var v = PropertiesService.getUserProperties().getProperty(ten);
  return v ? String(v).trim() : '';
}

/** So token kiểu hằng-thời-gian (không thoát sớm) — tránh lộ prefix đúng qua thời gian phản hồi. */
function soSanhToken_(mong, nhanVao) {
  var nhan = nhanVao ? String(nhanVao) : '';
  if (nhan.length !== mong.length) return false;
  var lech = 0;
  for (var i = 0; i < mong.length; i++) {
    lech |= mong.charCodeAt(i) ^ nhan.charCodeAt(i);
  }
  return lech === 0;
}

/**
 * Cổng chung cho 3 endpoint hợp đồng. Trả về '' nếu hợp lệ, hoặc mã lỗi:
 *   'chua-cau-hinh' — thiếu ít nhất 1 trong 4 User Property (chủ script chưa chạy setup)
 *   'tu-choi'       — có cấu hình đầy đủ nhưng token gửi lên không khớp
 * Cả hai đều CHẶN, chỉ khác thông báo để admin biết phải làm gì.
 */
function kiemQuyenHopDong_(token) {
  for (var i = 0; i < KHOA_HOP_DONG.length; i++) {
    if (!propHD_(KHOA_HOP_DONG[i])) return 'chua-cau-hinh';
  }
  return soSanhToken_(propHD_('CONTRACT_TOKEN'), token) ? '' : 'tu-choi';
}

/** Chuyển mã lỗi của kiemQuyenHopDong_ thành response. Không lộ token/ID trong thông báo. */
function loiQuyen_(ma) {
  if (ma === 'chua-cau-hinh') {
    return json_({
      ok: false,
      error: 'Chưa cấu hình — chạy thietLapCauHinhHopDong() trong Apps Script',
    });
  }
  return json_({ ok: false, error: 'Không có quyền' });
}

function contractList_(params) {
  try {
    var loi = kiemQuyenHopDong_(params && params.token);
    if (loi) return loiQuyen_(loi);
    var sheetId = propHD_('CONTRACT_SHEET_ID');
    var sheetTab = propHD_('CONTRACT_SHEET_TAB');
    var ss = SpreadsheetApp.openById(sheetId);
    var sh = ss.getSheetByName(sheetTab);
    if (!sh) return json_({ ok: false, error: 'Không tìm thấy tab "' + sheetTab + '"' });
    var lastRow = Math.max(1, sh.getLastRow());
    var rows = sh.getRange(1, 1, lastRow, 10).getDisplayValues();
    return json_({ ok: true, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Mọi thư mục con từ cấp 1 tới cấp `depth` của folder `rootId`. */
function folderConTheoDoSau_(rootId, depth) {
  var tang = [DriveApp.getFolderById(rootId)];
  var ra = [];
  for (var d = 0; d < Math.max(1, depth); d++) {
    var keTiep = [];
    for (var i = 0; i < tang.length; i++) {
      var it = tang[i].getFolders();
      while (it.hasNext()) {
        var f = it.next();
        ra.push(f);
        keTiep.push(f);
      }
    }
    if (!keTiep.length) break;
    tang = keTiep;
  }
  return ra;
}

function chuanHoaTen_(s) {
  return (s || '')
    .toString()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function contractDriveMatch_(data) {
  try {
    var loi = kiemQuyenHopDong_(data && data.token);
    if (loi) return loiQuyen_(loi);
    var rootId = propHD_('CONTRACT_ROOT_FOLDER_ID');
    // depth vẫn nhận từ client nhưng chặn trên 5 tầng: chỉ ảnh hưởng phạm vi quét BÊN TRONG
    // thư mục gốc, không mở rộng ra ngoài.
    var doSau = Math.min(5, Math.max(1, Number(data.depth) || 2));
    var con = folderConTheoDoSau_(rootId, doSau);
    var khoa = chuanHoaTen_(data.ten);
    var khop = con.filter(function (f) {
      return chuanHoaTen_(f.getName()) === khoa;
    });
    if (!khop.length) {
      khop = con.filter(function (f) {
        return chuanHoaTen_(f.getName()).indexOf(khoa) >= 0;
      });
    }
    khop.sort(function (a, b) {
      return b.getLastUpdated() - a.getLastUpdated();
    });
    return json_({
      ok: true,
      ket_qua: khop.map(function (f) {
        return { id: f.getId(), name: f.getName() };
      }),
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Folder tên "T8 26" / "T8 2026" của tháng/năm hiện tại, nằm ngay dưới `rootId`. */
function timFolderThang_(rootId) {
  var now = new Date();
  var thang = now.getMonth() + 1;
  var nam = now.getFullYear();
  var re = /^T0?(\d{1,2})[\s\-\/\._]*?(\d{2}|\d{4})$/i;
  var con = folderConTheoDoSau_(rootId, 1);
  var khop = con.filter(function (f) {
    var m = re.exec(f.getName().trim());
    if (!m) return false;
    var t = Number(m[1]);
    var n = Number(m[2]);
    if (n < 100) n += 2000;
    return t === thang && n === nam;
  });
  khop.sort(function (a, b) {
    return b.getLastUpdated() - a.getLastUpdated();
  });
  return khop.length ? khop[0] : null;
}

function tenKhongTrung_(folder, ten) {
  if (!folder.getFilesByName(ten).hasNext()) return ten;
  var than = ten.replace(/\.docx$/i, '');
  var i = 2;
  while (folder.getFilesByName(than + ' (' + i + ').docx').hasNext()) i++;
  return than + ' (' + i + ').docx';
}

/** `folderId` có nằm trong (hoặc chính là) `rootId` không? Đi ngược lên qua getParents(),
 *  giới hạn 10 tầng + 40 nút để không treo trên cây thư mục lạ. Một thư mục Drive có thể có
 *  NHIỀU cha nên phải duyệt rộng chứ không chỉ cha đầu tiên. */
function laConCuaGoc_(folderId, rootId) {
  if (!folderId || !rootId) return false;
  if (folderId === rootId) return true;
  var hangDoi = [DriveApp.getFolderById(folderId)];
  var daXet = {};
  daXet[folderId] = true;
  var soNut = 0;
  for (var tang = 0; tang < 10 && hangDoi.length; tang++) {
    var keTiep = [];
    for (var i = 0; i < hangDoi.length; i++) {
      var ps = hangDoi[i].getParents();
      while (ps.hasNext()) {
        var p = ps.next();
        var pid = p.getId();
        if (pid === rootId) return true;
        if (daXet[pid]) continue;
        daXet[pid] = true;
        if (++soNut > 40) return false;
        keTiep.push(p);
      }
    }
    hangDoi = keTiep;
  }
  return false;
}

function contractDriveCopy_(data) {
  try {
    var loi = kiemQuyenHopDong_(data && data.token);
    if (loi) return loiQuyen_(loi);
    var rootId = propHD_('CONTRACT_ROOT_FOLDER_ID');
    var folder;
    if (data.folderId) {
      // folderId đến từ kết quả contract-drive-match trước đó, nhưng vẫn phải kiểm lại:
      // request là do client gửi nên không được tin, nếu không thì ghi được file (kèm CCCD,
      // số tài khoản) vào bất kỳ thư mục nào mà chủ script có quyền.
      if (!laConCuaGoc_(String(data.folderId), rootId)) {
        return json_({ ok: false, error: 'Thư mục đích không nằm trong thư mục gốc đã cấu hình' });
      }
      folder = DriveApp.getFolderById(data.folderId);
    } else {
      var rootFolder = DriveApp.getFolderById(rootId);
      var thangFolder = timFolderThang_(rootId);
      var cha = thangFolder || rootFolder;
      var hienCo = cha.getFoldersByName(data.ten);
      folder = hienCo.hasNext() ? hienCo.next() : cha.createFolder(data.ten);
    }
    var bytes = Utilities.base64Decode(data.base64);
    var mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    var blob = Utilities.newBlob(bytes, mime, data.filename);
    var tenCuoi = tenKhongTrung_(folder, data.filename);
    var file = folder.createFile(blob).setName(tenCuoi);
    return json_({ ok: true, fileId: file.getId(), name: file.getName(), folderId: folder.getId() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ============ Cấu hình hợp đồng: chạy tay trong trình soạn thảo ============
// Project Settings → Script Properties CHỈ quản lý Script Properties, không có giao diện
// nhập User Properties. Nên 2 hàm dưới đây là cách duy nhất để đặt / kiểm tra cấu hình.
// Chạy trong trình soạn thảo = chạy dưới tài khoản chủ script, đúng bằng người chạy hiệu
// dụng của web app khi deploy "Execute as: Me" → cùng một kho User Properties.

/** Che token khi in log: chỉ giữ 4 ký tự đầu, phần còn lại thay bằng dấu sao. */
function cheToken_(s) {
  if (!s) return '(chưa đặt)';
  var t = String(s);
  if (t.length <= 4) return '**** (' + t.length + ' ký tự)';
  return t.substring(0, 4) + '**** (' + t.length + ' ký tự)';
}

/**
 * CHẠY 1 LẦN trong trình soạn thảo Apps Script để đặt cấu hình hợp đồng.
 * Cách dùng: sửa 4 hằng số ngay dưới đây thành giá trị thật → chọn hàm này trên thanh
 * công cụ → nhấn Run → xem Log để xác nhận. Sau khi chạy xong nên xoá lại giá trị thật
 * khỏi code (giá trị đã nằm trong User Properties rồi).
 */
function thietLapCauHinhHopDong() {
  // ======= SỬA 4 DÒNG DƯỚI ĐÂY, RỒI NHẤN RUN =======
  var CONTRACT_SHEET_ID = 'DIEN_ID_GOOGLE_SHEET_VAO_DAY';
  var CONTRACT_SHEET_TAB = 'DIEN_TEN_TAB_VAO_DAY';
  var CONTRACT_ROOT_FOLDER_ID = 'DIEN_ID_THU_MUC_DRIVE_GOC_VAO_DAY';
  var CONTRACT_TOKEN = 'DIEN_TOKEN_BI_MAT_VAO_DAY';
  // =================================================

  var giaTri = {
    CONTRACT_SHEET_ID: CONTRACT_SHEET_ID,
    CONTRACT_SHEET_TAB: CONTRACT_SHEET_TAB,
    CONTRACT_ROOT_FOLDER_ID: CONTRACT_ROOT_FOLDER_ID,
    CONTRACT_TOKEN: CONTRACT_TOKEN,
  };

  var thieu = [];
  var canDat = {};
  for (var i = 0; i < KHOA_HOP_DONG.length; i++) {
    var khoa = KHOA_HOP_DONG[i];
    var v = giaTri[khoa] == null ? '' : String(giaTri[khoa]).trim();
    // Chưa sửa placeholder (còn bắt đầu bằng "DIEN_") hoặc để trống -> coi như thiếu.
    if (!v || v.indexOf('DIEN_') === 0) thieu.push(khoa);
    else canDat[khoa] = v;
  }
  if (thieu.length) {
    throw new Error(
      'Chưa điền giá trị thật cho: ' + thieu.join(', ') +
      '. Mở hàm thietLapCauHinhHopDong(), sửa 4 hằng số ở đầu hàm rồi chạy lại.'
    );
  }

  // KHÔNG dùng setProperties(map, true) ở đây — chỉ ghi đè đúng 4 khoá, giữ nguyên phần còn lại.
  PropertiesService.getUserProperties().setProperties(canDat, false);

  Logger.log('Đã lưu cấu hình hợp đồng vào User Properties:');
  Logger.log('  CONTRACT_SHEET_ID       = ' + canDat.CONTRACT_SHEET_ID);
  Logger.log('  CONTRACT_SHEET_TAB      = ' + canDat.CONTRACT_SHEET_TAB);
  Logger.log('  CONTRACT_ROOT_FOLDER_ID = ' + canDat.CONTRACT_ROOT_FOLDER_ID);
  Logger.log('  CONTRACT_TOKEN          = ' + cheToken_(canDat.CONTRACT_TOKEN));
  Logger.log('Nhớ dán ĐÚNG token này vào app → Hợp đồng → Cài đặt → "Token".');
}

/**
 * CHỈ ĐỌC: in ra Log tình trạng 4 khoá cấu hình hợp đồng (token bị che).
 * Dùng để kiểm tra mà không phải nhập lại gì cả.
 */
function kiemTraCauHinhHopDong() {
  var thieu = [];
  Logger.log('Cấu hình hợp đồng hiện tại (User Properties):');
  for (var i = 0; i < KHOA_HOP_DONG.length; i++) {
    var khoa = KHOA_HOP_DONG[i];
    var v = propHD_(khoa);
    if (!v) thieu.push(khoa);
    Logger.log('  ' + khoa + ' = ' + (khoa === 'CONTRACT_TOKEN' ? cheToken_(v) : (v || '(chưa đặt)')));
  }
  if (thieu.length) {
    Logger.log('THIẾU: ' + thieu.join(', ') + ' → chạy thietLapCauHinhHopDong() để đặt.');
  } else {
    Logger.log('Đủ 4 khoá — tab Hợp đồng dùng được (miễn là token trong app khớp).');
  }
}
