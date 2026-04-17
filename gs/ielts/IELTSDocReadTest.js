/**
 * Test đọc nội dung Google Doc từ link.
 * Chạy từ Script Editor: chọn function testReadDocFromLink rồi Run.
 */

var TEST_DOC_URL = 'https://docs.google.com/document/d/1RWrQk-tq0FaSQSv779UmU_UeSqgi1aLuxX2VplIPA7g/edit?tab=t.93l09hnwddxs';

/**
 * Trích docId từ URL Google Doc.
 * @param {string} url
 * @returns {string|null}
 */
function _getDocIdFromUrl(url) {
  if (!url) return null;
  var str = String(url).trim();
  var match = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Đệ quy lấy danh sách tên tab (đúng chuỗi từ API) từ response.tabs.
 * @param {Array} tabs
 * @returns {string[]} Các tabProperties.title chính xác để dùng getTabContentBySheetName
 */
function _listTabTitles(tabs) {
  var out = [];
  if (!tabs || !tabs.length) return out;
  for (var t = 0; t < tabs.length; t++) {
    var tab = tabs[t];
    var props = tab.tabProperties || tab.tab_properties;
    var title = props ? (props.title || '') : '';
    if (title) out.push(title);
    var childTabs = tab.childTabs || tab.child_tabs;
    if (childTabs && childTabs.length) {
      out = out.concat(_listTabTitles(childTabs));
    }
  }
  return out;
}

/**
 * Test đọc nội dung file Doc từ link.
 * Gọi: testReadDocFromLink() hoặc testReadDocFromLink('https://docs.google.com/...')
 */
function testReadDocFromLink(url) {
  var link = url || TEST_DOC_URL;
  var docId = _getDocIdFromUrl(link);
  if (!docId) {
    Logger.log('TEST: Không trích được docId từ URL: ' + link);
    return;
  }
  Logger.log('TEST: docId = ' + docId);
  Logger.log('---');

  // 1) Đọc nội dung body (không tabs)
  Logger.log('1) getDocText (nội dung body, không tabs):');
  var text = DocsApiService.getDocText(docId);
  if (text === null) {
    Logger.log('   -> Lỗi hoặc không có quyền đọc.');
  } else {
    Logger.log('   Độ dài: ' + text.length + ' ký tự');
    var preview = text.length > 500 ? text.substring(0, 500) + '...' : text;
    Logger.log('   Nội dung (preview):\n' + preview);
  }
  Logger.log('---');

  // 2) Gọi API với includeTabsContent, liệt kê tên các tab
  Logger.log('2) Doc với tabs (includeTabsContent=true):');
  var urlWithTabs = 'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + '?includeTabsContent=true';
  var options = {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(urlWithTabs, options);
  var code = response.getResponseCode();
  Logger.log('   HTTP ' + code);
  if (code !== 200) {
    Logger.log('   Body: ' + response.getContentText().substring(0, 300));
    return;
  }
  var json = JSON.parse(response.getContentText());
  var tabs = json.tabs;
  if (!tabs || !tabs.length) {
    Logger.log('   Doc không có tabs.');
    return;
  }
  var titles = _listTabTitles(tabs);
  Logger.log('   Các tab tìm thấy: ' + titles.join(' | '));

  // 3) Đọc nội dung từng tab
  for (var i = 0; i < titles.length; i++) {
    var title = titles[i];
    if (!title) continue;
    var tabResult = DocsApiService.getTabContentBySheetName(docId, title);
    if (tabResult && tabResult.tabContent) {
      Logger.log('---');
      Logger.log('3) Tab "' + title + '" – độ dài: ' + tabResult.tabContent.length);
      var tabPreview = tabResult.tabContent.length > 400 ? tabResult.tabContent.substring(0, 400) + '...' : tabResult.tabContent;
      Logger.log('   Nội dung (preview):\n' + tabPreview);
    }
  }
  // 4) Test getTabContentByTabId nếu URL có ?tab=t.xxx
  var tabIdFromUrl = typeof DocsApiService !== 'undefined' && DocsApiService.getTabIdFromUrl
    ? DocsApiService.getTabIdFromUrl(link)
    : null;
  if (tabIdFromUrl) {
    Logger.log('---');
    Logger.log('4) getTabContentByTabId tabId=' + tabIdFromUrl + ':');
    var tabByIdRes = DocsApiService.getTabContentByTabId(docId, tabIdFromUrl);
    if (tabByIdRes && tabByIdRes.tabContent) {
      Logger.log('   len=' + tabByIdRes.tabContent.length);
      var prev4 = tabByIdRes.tabContent.length > 400 ? tabByIdRes.tabContent.substring(0, 400) + '...' : tabByIdRes.tabContent;
      Logger.log('   preview:\n' + prev4);
    } else {
      Logger.log('   NOT FOUND. error=' + (tabByIdRes ? tabByIdRes.error : 'null'));
      // Liệt kê tab IDs có trong response để debug
      var allIds = _listTabIds(tabs || []);
      Logger.log('   Các tabId trong Doc: ' + allIds.join(', '));
    }
  }

  Logger.log('---');
  Logger.log('TEST: xong.');
}

/**
 * Đệ quy lấy danh sách tabId từ response.tabs (để debug).
 */
function _listTabIds(tabs) {
  var out = [];
  if (!tabs || !tabs.length) return out;
  for (var t = 0; t < tabs.length; t++) {
    var tab = tabs[t];
    var props = tab.tabProperties || tab.tab_properties;
    var id = (props ? (props.tabId || props.tab_id) : null) || tab.tabId || tab.tab_id || '';
    if (id) out.push(id);
    var childTabs = tab.childTabs || tab.child_tabs;
    if (childTabs && childTabs.length) {
      out = out.concat(_listTabIds(childTabs));
    }
  }
  return out;
}
