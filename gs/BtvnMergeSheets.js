/**
 * Gộp các tab BTVN (tên theo ngày / có số) vào một tab "Tổng Hợp".
 * Tab mẫu: Base. Bỏ qua sheet mặc định kiểu "Trang tính 1", "Sheet1".
 *
 * Chạy tay: mergeBtvnSheetsIntoOne()
 * Tự động (khuyến nghị):
 *   1) Chạy tay forceAuth() một lần trong editor → dialog cấp quyền đầy đủ (ScriptApp không chạy với simple onEdit).
 *   2) installBtvnMergeTriggers() — installable On edit → btvnHandleEdit + On change.
 *   3) removeBtvnMergeTriggers() — gỡ trigger BTVN.
 *
 * Không dùng hàm tên đúng `onEdit`: đó là simple trigger, quyền hạn chế và không bao giờ hiện dialog OAuth đầy đủ.
 * Handler sửa ô cài đặt bằng trigger: btvnHandleEdit.
 */

var BTVN_MERGE_CONFIG = {
  /** Tab đích — chỉ clearContents(), giữ format / khung bạn đã set sẵn */
  outputSheetName: 'BTVNWAREHOUSE',

  /**
   * Loại trừ theo tên chính xác (không phân biệt hoa thường).
   * Nên gồm Base + mọi tab không phải bài tập theo ngày.
   */
  excludeExactNames: ['BTVNWAREHOUSE', 'Base'],

  /**
   * Sheet mặc định của Google (đa ngôn ngữ) — không gộp dù tên có số.
   * Trang tính / Sheet + optional số.
   */
  defaultSheetNamePatterns: [/^Trang tính\s*\d*\s*$/i, /^Sheet\s*\d*\s*$/i],

  /**
   * Chỉ gộp tab có ít nhất một chữ số (832026, 1532026, 24, 2732026, …).
   * false = mọi tab không bị loại ở trên đều được gộp (ít khuyến nghị).
   */
  sheetNameMustContainDigit: true,

  /** Cột đầu: tên tab nguồn (dòng đầu tiên dùng sourceColumnHeader) */
  addSourceColumn: true,
  sourceColumnHeader: 'Tab nguồn',

  /** Toast khi chạy tay mergeBtvnSheetsIntoOne */
  showToastOnManualRun: true,

  /**
   * onEdit: chỉ lên lịch gộp nếu ô sửa có giao với cột >= minColumn (1-based).
   * Ví dụ 3 = chỉ cột C trở đi (thường là vùng nộp bài, tránh cột STT/tên).
   */
  autoMergeOnEditMinColumn: 3,

  /** Thời gian chờ (ms) sau lần sửa cuối mới gộp — tránh lag khi gõ liên tục */
  debounceMs: 2500,

  /** true: sắp xếp tab nguồn theo tên tăng dần trước khi gộp; false: thứ tự tab trong file */
  sortSourceSheetsByName: false,
};

var BTVN_MERGE_LOCK_PROP_ = 'BTVN_MERGE_RUNNING';
var BTVN_MERGE_SCHEDULED_HANDLER_ = 'btvnMergeRunScheduled_';

// --- Chuẩn hóa mảng 2D (hình chữ nhật) trước setValues ---

function padMergedRowsToMaxColumns_(rows) {
  var maxCols = 0;
  var i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i].length > maxCols) {
      maxCols = rows[i].length;
    }
  }
  for (i = 0; i < rows.length; i++) {
    while (rows[i].length < maxCols) {
      rows[i].push('');
    }
  }
}

/** Dòng được coi là trống nếu mọi ô là null/'' hoặc chuỗi chỉ khoảng trắng. */
function isRowEmpty_(row) {
  var c;
  for (c = 0; c < row.length; c++) {
    var v = row[c];
    if (v == null || v === '') {
      continue;
    }
    if (typeof v === 'string') {
      if (v.trim() !== '') {
        return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Tab có được gộp không: không phải đích/Base, không phải "Trang tính…",
 * và (tuỳ chọn) tên phải chứa số.
 */
function btvnMergeShouldIncludeSheet_(sheetName) {
  var cfg = BTVN_MERGE_CONFIG;
  var n = String(sheetName).trim();
  var lower = n.toLowerCase();

  if (lower === String(cfg.outputSheetName).toLowerCase()) {
    return false;
  }

  var i;
  var excludes = cfg.excludeExactNames || [];
  for (i = 0; i < excludes.length; i++) {
    if (lower === String(excludes[i]).toLowerCase()) {
      return false;
    }
  }

  var patterns = cfg.defaultSheetNamePatterns || [];
  for (i = 0; i < patterns.length; i++) {
    if (patterns[i].test(n)) {
      return false;
    }
  }

  if (cfg.sheetNameMustContainDigit && !/\d/.test(n)) {
    return false;
  }

  return true;
}

/** Vùng sửa có chạm ít nhất một cột >= minCol (1-based) không. */
function btvnMergeEditTouchesMinColumn_(e, minCol) {
  var cEnd = e.range.getLastColumn();
  if (cEnd < minCol) {
    return false;
  }
  return true;
}

/**
 * Debounce ổn định: luôn xóa hết trigger one-shot cũ cùng handler, rồi tạo một cái mới.
 * Dùng LockService để tránh hai lần chồng khi sửa ô + onChange gần nhau.
 * Cần quyền ScriptApp — chỉ chắc chắn chạy được từ installable trigger hoặc chạy tay từ editor.
 */
function btvnMergeScheduleDebounced_() {
  var cfg = BTVN_MERGE_CONFIG;
  var ms = Math.max(400, Math.min(Number(cfg.debounceMs) || 2500, 60000));
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) {
    return;
  }
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === BTVN_MERGE_SCHEDULED_HANDLER_) {
        ScriptApp.deleteTrigger(t);
      }
    });
    ScriptApp.newTrigger(BTVN_MERGE_SCHEDULED_HANDLER_).timeBased().after(ms).create();
  } catch (err) {
    Logger.log('BTVN debounce (cần cài installBtvnMergeTriggers hoặc chạy từ editor): ' + err);
  } finally {
    lock.releaseLock();
  }
}

/** Hàm trigger one-shot gọi sau debounce. */
function btvnMergeRunScheduled_() {
  mergeBtvnSheetsIntoOneInternal_(false);
}

/**
 * Xử lý khi người dùng sửa ô — gắn với installable trigger "Khi chỉnh sửa" (On edit), KHÔNG dùng tên hàm onEdit.
 * Chỉ lên lịch gộp nếu: tab là sheet bài tập theo quy tắc tên, và vùng sửa có cột ≥ autoMergeOnEditMinColumn.
 */
function btvnHandleEdit(e) {
  if (!e || !e.range) {
    return;
  }
  var cfg = BTVN_MERGE_CONFIG;
  var sh = e.range.getSheet();
  var name = sh.getName();

  if (!btvnMergeShouldIncludeSheet_(name)) {
    return;
  }
  if (!btvnMergeEditTouchesMinColumn_(e, cfg.autoMergeOnEditMinColumn)) {
    return;
  }

  btvnMergeScheduleDebounced_();
}

/** Alias tên cũ — trigger thủ công vẫn trỏ btvnMergeOnEditHandler_ thì vẫn chạy. */
function btvnMergeOnEditHandler_(e) {
  btvnHandleEdit(e);
}

/** onChange: đổi cấu trúc — cũng debounce để hạn chế gộp liên tục khi chèn nhiều hàng. */
function btvnMergeOnChangeInstallable_(ev) {
  if (!ev) {
    return;
  }
  var skip = SpreadsheetApp.ChangeType;
  if (ev.changeType === skip.EDIT || ev.changeType === skip.FORMAT) {
    return;
  }
  btvnMergeScheduleDebounced_();
}

function mergeBtvnSheetsIntoOneInternal_(manual) {
  var cfg = BTVN_MERGE_CONFIG;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(BTVN_MERGE_LOCK_PROP_)) {
    return;
  }
  props.setProperty(BTVN_MERGE_LOCK_PROP_, '1');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();

    if (cfg.sortSourceSheetsByName) {
      sheets = sheets.slice().sort(function (a, b) {
        return String(a.getName()).localeCompare(String(b.getName()), 'vi');
      });
    }

    var merged = [];
    var headerCommitted = false;
    var i;
    var r;

    for (i = 0; i < sheets.length; i++) {
      var sh = sheets[i];
      var tabName = sh.getName();
      if (!btvnMergeShouldIncludeSheet_(tabName)) {
        continue;
      }

      var range = sh.getDataRange();
      if (range.getNumRows() === 0) {
        continue;
      }

      var values = range.getValues();
      var startRow = headerCommitted ? 1 : 0;
      if (headerCommitted && values.length <= 1) {
        continue;
      }

      for (r = startRow; r < values.length; r++) {
        var row = values[r];
        if (isRowEmpty_(row)) {
          continue;
        }
        if (cfg.addSourceColumn) {
          var isFirstRowOfOutput = merged.length === 0;
          var label = isFirstRowOfOutput ? cfg.sourceColumnHeader : tabName;
          merged.push([label].concat(row));
        } else {
          merged.push(row.slice());
        }
      }
      headerCommitted = true;
    }

    if (merged.length === 0) {
      if (manual) {
        SpreadsheetApp.getUi().alert(
          'Không có dữ liệu để gộp.\nKiểm tra: tab có tên chứa số, có dữ liệu, và không nằm trong danh sách loại trừ / sheet mặc định.'
        );
      }
      return;
    }

    padMergedRowsToMaxColumns_(merged);

    var out = ss.getSheetByName(cfg.outputSheetName);
    if (!out) {
      out = ss.insertSheet(cfg.outputSheetName);
    } else {
      out.clearContents();
    }

    var numCols = merged[0].length;
    out.getRange(1, 1, merged.length, numCols).setValues(merged);
    out.setFrozenRows(1);

    if (manual && cfg.showToastOnManualRun) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Đã gộp ' + merged.length + ' dòng vào "' + cfg.outputSheetName + '".',
        'BTVN',
        5
      );
    }
  } finally {
    props.deleteProperty(BTVN_MERGE_LOCK_PROP_);
  }
}

/** Gộp thủ công — gán nút hoặc chạy từ menu/editor. */
function mergeBtvnSheetsIntoOne() {
  mergeBtvnSheetsIntoOneInternal_(true);
}

/** Alias ngắn cho menu / nút (cùng hành vi với mergeBtvnSheetsIntoOne). */
function mergeBtvnSheets() {
  mergeBtvnSheetsIntoOne();
}

/**
 * Cài trigger: On edit (installable → btvnHandleEdit) + On change (installable), debounce một time-based trigger.
 * Nên chạy forceAuth() trước nếu chưa từng cấp quyền ScriptApp đầy đủ.
 */
function installBtvnMergeTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var i;
  var handlers = ['btvnHandleEdit', 'btvnMergeOnEditHandler_', 'btvnMergeOnChangeInstallable_'];
  for (i = 0; i < handlers.length; i++) {
    var h = handlers[i];
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === h) {
        ScriptApp.deleteTrigger(t);
      }
    });
  }

  ScriptApp.newTrigger('btvnHandleEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('btvnMergeOnChangeInstallable_').forSpreadsheet(ss).onChange().create();

  SpreadsheetApp.getUi().alert(
    'Đã cài trigger BTVN:\n' +
      '- Sửa ô: debounce ' +
      BTVN_MERGE_CONFIG.debounceMs +
      ' ms (cột ≥ ' +
      BTVN_MERGE_CONFIG.autoMergeOnEditMinColumn +
      ', tab bài tập theo quy tắc tên).\n' +
      '- Đổi cấu trúc sheet: cùng debounce.\n' +
      'Gỡ: removeBtvnMergeTriggers().'
  );
}

/** Gỡ trigger BTVN (onEdit/onChange installable + mọi btvnMergeRunScheduled_ đang chờ). */
function removeBtvnMergeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (
      h === 'btvnHandleEdit' ||
      h === 'btvnMergeOnEditHandler_' ||
      h === 'btvnMergeOnChangeInstallable_' ||
      h === BTVN_MERGE_SCHEDULED_HANDLER_
    ) {
      ScriptApp.deleteTrigger(t);
    }
  });
  SpreadsheetApp.getUi().alert(
    'Đã gỡ trigger BTVN. Để tự gộp khi sửa ô / đổi cấu trúc, chạy lại installBtvnMergeTriggers().'
  );
}

/** Tương thích tên cũ — gọi removeBtvnMergeTriggers. */
function removeBtvnMergeAutoTriggers() {
  removeBtvnMergeTriggers();
}

/** Tương thích tên cũ — chỉ onChange (không khuyến nghị); nên dùng installBtvnMergeTriggers. */
function installBtvnMergeAutoTriggers() {
  installBtvnMergeTriggers();
}

/**
 * Chạy một lần thủ công từ editor (Chọn hàm → Run) để Google hiện dialog cấp quyền đầy đủ.
 * Simple trigger onEdit không kích hoạt luồng OAuth này — luôn dùng btvnHandleEdit + installable trigger.
 */
function forceAuth() {
  // Lệnh DriveApp này đóng vai trò làm "mồi nhử"
  // để ép Google phải reset lại toàn bộ bộ đệm quyền
  DriveApp.getFiles();

  ScriptApp.getProjectTriggers();
  SpreadsheetApp.getActiveSpreadsheet().toast('Đã xác thực thành công!');
}
