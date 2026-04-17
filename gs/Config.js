/**
 * Config – Gemini model presets and API key.
 */

var GEMINI_MODEL_PRESETS = {
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
  'default': 'gemini-3.1-flash-lite-preview'
};

var GEMINI_DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';

/**
 * @returns {string} Gemini API key from script properties.
 */
function getGeminiApiKey() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

/**
 * @param {string} [presetKey] Key in GEMINI_MODEL_PRESETS (e.g. 'gemini-3.1-flash-lite-preview'). Nếu bỏ trống dùng default.
 * @returns {string} Resolved model name for the API.
 */
function getGeminiModel(presetKey) {
  if (presetKey && GEMINI_MODEL_PRESETS[presetKey]) {
    return GEMINI_MODEL_PRESETS[presetKey];
  }
  if (presetKey && typeof presetKey === 'string' && presetKey.length > 0) {
    return presetKey;
  }
  return GEMINI_MODEL_PRESETS['default'] || GEMINI_DEFAULT_MODEL;
}

/**
 * Chấm Google Doc bằng PDF (xuất từ Drive) gửi Gemini – hữu ích khi đáp án chỉ thấy rõ qua highlight/màu.
 * Script Properties: GRADE_GOOGLE_DOC_AS_PDF
 * - always | 1 | true | yes : luôn xuất PDF thay vì đọc text
 * - auto : chỉ PDF khi không trích được text (rỗng)
 * Link bài nộp có thể thêm &gradeAsPdf=1 để bắt buộc PDF cho dòng đó.
 */
function getGradeGoogleDocAsPdfMode() {
  var v = (PropertiesService.getScriptProperties().getProperty('GRADE_GOOGLE_DOC_AS_PDF') || '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'always') return 'always';
  if (v === 'auto') return 'auto';
  return '';
}

function submissionUrlHasGradeAsPdf(url) {
  return url && typeof url === 'string' && /[?&]gradeAsPdf=1(?:&|$)/i.test(url);
}

var Config = {
  getGeminiApiKey: getGeminiApiKey,
  getGeminiModel: getGeminiModel,
  GEMINI_MODEL_PRESETS: GEMINI_MODEL_PRESETS,
  getGradeGoogleDocAsPdfMode: getGradeGoogleDocAsPdfMode,
  submissionUrlHasGradeAsPdf: submissionUrlHasGradeAsPdf
};
