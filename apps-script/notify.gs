/**
 * Media Team — Thông báo Telegram (webhook + nhắc quá hạn mỗi sáng).
 * TÁCH RIÊNG với sync.gs (Google Sheet) — tạo một Apps Script project MỚI cho file này.
 *
 * ============================ CÁCH CÀI ĐẶT ============================
 *
 * A. TẠO BOT TELEGRAM (1 lần):
 *   1. Trong Telegram, chat với @BotFather → gõ /newbot → đặt tên + username cho bot
 *   2. BotFather trả về BOT TOKEN (dạng 123456789:AAH...xyz) — giữ kín
 *   3. Tạo group chat của team, THÊM BOT vào group
 *   4. Gõ 1 tin nhắn bất kỳ trong group (để bot "nhìn thấy" group)
 *
 * B. TẠO APPS SCRIPT:
 *   1. Vào https://script.google.com → New project (đăng nhập đúng tài khoản chủ Firebase:
 *      leanhtu1212@gmail.com — cần quyền đọc Firestore cho phần nhắc quá hạn)
 *   2. Xoá code mặc định, dán TOÀN BỘ file này vào
 *   3. Menu trái → Project Settings (bánh răng) → Script Properties → thêm:
 *        BOT_TOKEN = token ở bước A.2
 *   4. Quay lại Editor → chọn hàm showChatId → Run → cấp quyền khi được hỏi
 *      → xem Log (Ctrl+Enter) thấy chat id của group (số ÂM, vd -1001234567890)
 *      → thêm Script Property:  CHAT_ID = số đó
 *   5. Chọn hàm sendTest → Run → group Telegram phải nhận được tin "✅ Bot hoạt động!"
 *
 * C. BẬT ĐỌC FIRESTORE (cho nhắc quá hạn):
 *   1. Menu trái → Project Settings → tick "Show appsscript.json manifest file"
 *   2. Mở file appsscript.json trong Editor, thay bằng:
 *      {
 *        "timeZone": "Asia/Ho_Chi_Minh",
 *        "exceptionLogging": "STACKDRIVER",
 *        "runtimeVersion": "V8",
 *        "oauthScopes": [
 *          "https://www.googleapis.com/auth/script.external_request",
 *          "https://www.googleapis.com/auth/script.scriptapp",
 *          "https://www.googleapis.com/auth/datastore"
 *        ]
 *      }
 *   3. Chọn hàm dailyCheck → Run → cấp quyền lại → Log hiện danh sách dự án quá hạn
 *      (không có dự án quá hạn/sắp đến hạn thì bot không gửi gì — là bình thường)
 *   4. Chọn hàm setupDailyTrigger → Run → tự động tạo lịch chạy 8h sáng hằng ngày
 *
 * D. DEPLOY WEBHOOK (cho thông báo tức thì từ app):
 *   1. Deploy → New deployment → Web app
 *      - Execute as: Me     - Who has access: Anyone
 *   2. Copy Web app URL (dạng .../exec)
 *   3. Vào app → Cài đặt → Google Sheet → mục "Thông báo Telegram" → dán URL → Lưu → Gửi tin thử
 *
 * LƯU Ý: mỗi lần sửa code phải Deploy → Manage deployments → Edit → New version.
 * ======================================================================
 */

var FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/gen-lang-client-0678978112' +
  '/databases/ai-studio-9933e878-0247-44cf-b7f0-e77cd2ac2eac/documents/teams/MEDIA_TEAM_01';

/* ---------- Webhook: app POST { type:'notify', text } ---------- */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.type === 'notify' && data.text) {
      sendTelegram_(String(data.text).slice(0, 3500));
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'Payload không hợp lệ (cần type:"notify" + text)' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- Nhắc quá hạn mỗi sáng (time trigger) ---------- */

function dailyCheck() {
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var soon = Utilities.formatDate(new Date(Date.now() + 3 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var projects = fetchProjects_();

  var overdue = [], upcoming = [];
  projects.forEach(function (p) {
    // payment & done đều coi là "đã xong sản xuất" (giống isProjectFinished trong app)
    if (p.status === 'done' || p.status === 'payment') return;
    if (!p.deadline) return;
    if (p.deadline < today) overdue.push(p);
    else if (p.deadline <= soon) upcoming.push(p);
  });
  overdue.sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; });
  upcoming.sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; });

  Logger.log('Quá hạn: %s | Sắp đến hạn: %s', overdue.length, upcoming.length);
  if (!overdue.length && !upcoming.length) return; // không có gì → không làm phiền

  var lines = ['📋 Điểm tin dự án sáng ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM')];
  if (overdue.length) {
    lines.push('', '🔴 QUÁ HẠN (' + overdue.length + '):');
    overdue.forEach(function (p) {
      lines.push('• ' + p.title + ' — hạn ' + viDate_(p.deadline) + ' (trễ ' + daysBetween_(p.deadline, today) + ' ngày)');
    });
  }
  if (upcoming.length) {
    lines.push('', '🟡 ĐẾN HẠN TRONG 3 NGÀY (' + upcoming.length + '):');
    upcoming.forEach(function (p) {
      var d = daysBetween_(today, p.deadline);
      lines.push('• ' + p.title + ' — ' + (d === 0 ? 'HÔM NAY' : 'còn ' + d + ' ngày') + ' (' + viDate_(p.deadline) + ')');
    });
  }
  sendTelegram_(lines.join('\n'));
}

/** Chạy 1 lần để tạo lịch tự động 8h sáng hằng ngày (xoá trigger cũ nếu có). */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyCheck').timeBased().atHour(8).everyDays(1).inTimezone('Asia/Ho_Chi_Minh').create();
  Logger.log('Đã tạo trigger dailyCheck 8h sáng hằng ngày.');
}

/* ---------- Đọc Firestore (REST, xác thực bằng tài khoản chủ script) ---------- */

function fetchProjects_() {
  var out = [], pageToken = '';
  do {
    var url = FIRESTORE_BASE + '/projects?pageSize=300' + (pageToken ? '&pageToken=' + pageToken : '');
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Firestore trả lỗi ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    }
    var body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(function (d) {
      var f = d.fields || {};
      out.push({
        title: str_(f.title),
        status: str_(f.status),
        deadline: str_(f.deadline),
      });
    });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return out;
}

function str_(v) { return (v && v.stringValue) || ''; }

/** 'yyyy-MM-dd' → 'dd/MM' cho tin nhắn. */
function viDate_(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

/** Số ngày giữa 2 mốc 'yyyy-MM-dd' (b - a). */
function daysBetween_(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/* ---------- Telegram ---------- */

function sendTelegram_(text) {
  var props = PropertiesService.getScriptProperties();
  var token = (props.getProperty('BOT_TOKEN') || '').trim();
  var chatId = (props.getProperty('CHAT_ID') || '').trim();
  if (!token || !chatId) throw new Error('Thiếu Script Property BOT_TOKEN hoặc CHAT_ID');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true }),
    muteHttpExceptions: true,
  });
  var body = JSON.parse(res.getContentText());
  if (!body.ok) {
    // Lỗi hay gặp: "chat not found" = CHAT_ID sai; "bot was kicked" = bot bị xoá khỏi group;
    // "Unauthorized" = BOT_TOKEN sai. Migrate = group nâng cấp supergroup → dùng id mới trong lỗi.
    throw new Error('Telegram báo lỗi: ' + (body.description || res.getContentText()));
  }
  Logger.log('Đã gửi Telegram OK → chat %s', chatId);
}

/** Chạy tay sau khi đã nhắn 1 tin trong group — in ra chat id của các group bot nhìn thấy. */
function showChatId() {
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  if (!token) throw new Error('Thiếu Script Property BOT_TOKEN');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates');
  var updates = JSON.parse(res.getContentText()).result || [];
  if (!updates.length) {
    Logger.log('Chưa thấy tin nhắn nào — hãy gõ 1 tin trong group (có bot) rồi Run lại.');
    return;
  }
  updates.forEach(function (u) {
    var chat = (u.message || u.my_chat_member || {}).chat;
    // toFixed(0): tránh Logger in kiểu -5.007E9 → phải ra số nguyên đầy đủ để copy
    if (chat) Logger.log('CHAT_ID = ' + Number(chat.id).toFixed(0) + '  (' + chat.type + ' — "' + (chat.title || chat.username || '') + '")');
  });
}

/** Chạy tay để kiểm tra bot + chat id đã đúng chưa. */
function sendTest() {
  sendTelegram_('✅ Bot hoạt động! Thông báo Media Team đã sẵn sàng.');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
