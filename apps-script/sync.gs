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
      sh.getRange(1, 1, 1, block.headers.length).setValues([block.headers]);
      if (block.rows.length > 0) {
        sh.getRange(2, 1, block.rows.length, block.headers.length).setValues(block.rows);
      }
      sh.getRange(sh.getLastRow() + 2, 1).setValue('Cập nhật: ' + data.syncedAt);
      totalRows += block.rows.length;
    }
    return json_({ ok: true, rows: totalRows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
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
