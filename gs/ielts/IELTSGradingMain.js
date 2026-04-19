/**
 * IELTSGradingMain – Đã lưu trữ (Archived)
 * Hệ thống hiện tại chỉ sử dụng luồng chấm đơn giản (IELTSSimpleGrade.js).
 * Hàm này được giữ lại để chuyển hướng các nút bấm cũ sang luồng mới.
 */

/**
 * @param {string} mode 'all' | 'selection'
 */
function runIELTSGrading(mode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Đang khởi động luồng chấm đơn giản...', 'Thông báo', 2);
  if (typeof IELTSSimpleGrade !== 'undefined' && IELTSSimpleGrade.runFromMenu) {
    IELTSSimpleGrade.runFromMenu();
  } else {
    ss.toast('Chức năng chấm đơn giản chưa sẵn sàng.', 'Lỗi', 5);
  }
}