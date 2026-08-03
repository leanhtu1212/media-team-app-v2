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
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

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

/** Apple/Google Calendar gọi GET để lấy feed .ics. */
function doGet() {
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
  PropertiesService.getScriptProperties().setProperties(map, true); // true = xoá các key cũ còn sót
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

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
