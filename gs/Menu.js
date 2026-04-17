/**
 * Menu – Adds "Chấm bài IELTS AI" menu on spreadsheet open.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Chấm bài IELTS AI')
    .addItem('Chấm toàn bộ Sheet', 'menuChamToanBoSheet')
    .addItem('Chấm các dòng đã chọn', 'menuChamDongDaChon')
    .addItem('Chấm đơn giản (dòng đã chọn)', 'menuChamDonGian')
    .addSeparator()
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu('BTVN')
        .addItem('Cấp quyền Script (một lần)', 'menuForceAuthBtvn')
        .addSeparator()
        .addItem('Gộp vào Tổng Hợp', 'menuMergeBtvnSheets')
        .addItem('Bật tự động gộp (trigger)', 'menuInstallBtvnMergeTriggers')
        .addItem('Gỡ tự động gộp', 'menuRemoveBtvnMergeTriggers')
    )
    .addSeparator()
    .addItem('Cập nhật API key Gemini', 'menuCapNhatGeminiKey')
    .addToUi();
}

function menuForceAuthBtvn() {
  if (typeof forceAuth === 'function') {
    forceAuth();
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Chức năng chưa sẵn sàng. Kiểm tra file BtvnMergeSheets.js.', 'Lỗi', 5);
  }
}

function menuMergeBtvnSheets() {
  if (typeof mergeBtvnSheets === 'function') {
    mergeBtvnSheets();
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Chức năng chưa sẵn sàng. Kiểm tra file BtvnMergeSheets.js.', 'Lỗi', 5);
  }
}

function menuInstallBtvnMergeTriggers() {
  if (typeof installBtvnMergeTriggers === 'function') {
    installBtvnMergeTriggers();
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Chức năng chưa sẵn sàng. Kiểm tra file BtvnMergeSheets.js.', 'Lỗi', 5);
  }
}

function menuRemoveBtvnMergeTriggers() {
  if (typeof removeBtvnMergeTriggers === 'function') {
    removeBtvnMergeTriggers();
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Chức năng chưa sẵn sàng. Kiểm tra file BtvnMergeSheets.js.', 'Lỗi', 5);
  }
}

function menuChamToanBoSheet() {
  if (typeof runIELTSGrading === 'function') {
    runIELTSGrading('all');
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Chức năng chưa sẵn sàng. Kiểm tra file IELTSGradingMain.js.', 'Lỗi', 5);
  }
}

function menuChamDongDaChon() {
  if (typeof runIELTSGrading === 'function') {
    runIELTSGrading('selection');
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Chức năng chưa sẵn sàng. Kiểm tra file IELTSGradingMain.js.', 'Lỗi', 5);
  }
}

/**
 * Hiện hộp thoại nhập API key Gemini và lưu vào Script Properties.
 * Menu: Chấm bài IELTS AI > Cập nhật API key Gemini
 */
function menuCapNhatGeminiKey() {
  var ui = SpreadsheetApp.getUi();
  var currentKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  var hint = currentKey ? 'Key hiện tại: ' + currentKey.substring(0, 8) + '...' : 'Chưa có key.';
  var result = ui.prompt(
    'Cập nhật API key Gemini',
    'Dán API key (lấy tại https://aistudio.google.com/apikey):\n' + hint,
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Đã hủy.', 'Cập nhật key', 2);
    return;
  }
  var key = (result.getResponseText() || '').trim();
  if (!key) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Key trống. Không lưu.', 'Lỗi', 4);
    return;
  }
  try {
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
    SpreadsheetApp.getActiveSpreadsheet().toast('Đã lưu API key. Có thể chạy chấm bài ngay.', 'Đã cập nhật', 4);
  } catch (e) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Lỗi khi lưu: ' + (e.message || e.toString()), 'Lỗi', 5);
  }
}
