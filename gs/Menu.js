/**
 * Menu – Adds "Chấm bài IELTS AI" menu on spreadsheet open.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Chấm bài IELTS AI')
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
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu('Cài đặt')
        .addItem('Đổi nhà cung cấp AI (Gemini/Anthropic)', 'menuChangeAIProvider')
        .addItem('Cập nhật API key Gemini', 'menuCapNhatGeminiKey')
        .addItem('Thay đổi chế độ chấm PDF', 'menuChangePdfMode')
    )
    .addToUi();
}

function menuChamDonGian() {
  if (typeof IELTSSimpleGrade !== 'undefined' && IELTSSimpleGrade.runFromMenu) {
    IELTSSimpleGrade.runFromMenu();
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Chức năng chưa sẵn sàng. Kiểm tra file IELTSSimpleGrade.js.', 'Lỗi', 5);
  }
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

/**
 * Hiện hộp thoại để thay đổi nhà cung cấp AI đang hoạt động.
 */
function menuChangeAIProvider() {
  var ui = SpreadsheetApp.getUi();
  var currentProvider = PropertiesService.getScriptProperties().getProperty('ACTIVE_AI_PROVIDER') || 'gemini';

  var title = 'Đổi nhà cung cấp AI';
  var promptText = 'Nhà cung cấp hiện tại: ' + currentProvider + '\n\n' +
                   'Nhập "gemini" hoặc "anthropic" để đổi.';

  var result = ui.prompt(title, promptText, ui.ButtonSet.OK_CANCEL);

  if (result.getSelectedButton() === ui.Button.OK) {
    var newProvider = result.getResponseText().trim().toLowerCase();
    
    if (newProvider === 'gemini' || newProvider === 'anthropic') {
      PropertiesService.getScriptProperties().setProperty('ACTIVE_AI_PROVIDER', newProvider);
      SpreadsheetApp.getActiveSpreadsheet().toast('Đã đổi nhà cung cấp AI thành: ' + newProvider, 'Thành công', 4);
    } else {
      SpreadsheetApp.getActiveSpreadsheet().toast('Giá trị không hợp lệ. Chỉ chấp nhận "gemini" hoặc "anthropic".', 'Lỗi', 5);
    }
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Đã hủy thao tác.', 'Thông báo', 2);
  }
}

/**
 * Hiện hộp thoại nhập API key Gemini và lưu vào Script Properties.
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

/**
 * Hiện hộp thoại thay đổi thuộc tính GRADE_GOOGLE_DOC_AS_PDF.
 */
function menuChangePdfMode() {
  var ui = SpreadsheetApp.getUi();
  var currentMode = PropertiesService.getScriptProperties().getProperty('GRADE_GOOGLE_DOC_AS_PDF') || 'off';
  
  var title = 'Thay đổi chế độ chấm PDF';
  var promptText = 'Chế độ hiện tại: ' + currentMode + '\n\n' +
                   'Nhập một trong các giá trị sau:\n' +
                   '- "always": Luôn xuất PDF để AI chấm (giữ layout, hình ảnh, màu sắc).\n' +
                   '- "auto": Chỉ xuất PDF nếu không đọc được chữ.\n' +
                   '- "off" (hoặc để trống): Tắt, hệ thống chỉ đọc chữ thuần.';

  var result = ui.prompt(title, promptText, ui.ButtonSet.OK_CANCEL);

  if (result.getSelectedButton() === ui.Button.OK) {
    var newMode = result.getResponseText().trim().toLowerCase();
    
    if (newMode === 'always' || newMode === 'auto') {
      PropertiesService.getScriptProperties().setProperty('GRADE_GOOGLE_DOC_AS_PDF', newMode);
      SpreadsheetApp.getActiveSpreadsheet().toast('Đã lưu chế độ chấm PDF: ' + newMode, 'Thành công', 4);
    } else {
      PropertiesService.getScriptProperties().deleteProperty('GRADE_GOOGLE_DOC_AS_PDF');
      SpreadsheetApp.getActiveSpreadsheet().toast('Đã tắt chế độ chấm PDF.', 'Thành công', 4);
    }
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Đã hủy.', 'Thay đổi chế độ PDF', 2);
  }
}