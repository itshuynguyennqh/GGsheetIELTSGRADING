/**
 * GeminiService – Call Gemini API (generateContent) with configurable model.
 */

/**
 * @param {string} model Model name (e.g. gemini-2.0-flash-exp).
 * @returns {string} Full generateContent URL.
 */
function getGeminiUrl(model) {
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
}

/**
 * @param {string} promptText User prompt.
 * @param {string} modelPresetKey Key from Config.GEMINI_MODEL_PRESETS (e.g. 'gemini-3.1-flash-lite-preview').
 * @returns {string} Response text from Gemini.
 * @throws {Error} If API key missing or request fails.
 */
function callGemini(promptText, modelPresetKey) {
  var apiKey = Config.getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trong Script Properties.');
  }
  var model = Config.getGeminiModel(modelPresetKey || 'default');
  if (!model) {
    model = 'gemini-3.1-flash-lite-preview';
  }
  var url = getGeminiUrl(model);
  var payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048
    }
  };
  var maxLog = 999999;
  var logPreview = promptText.length > maxLog
    ? promptText.substring(0, maxLog) + '\n...[truncated ' + (promptText.length - maxLog) + ' chars]'
    : promptText;
  Logger.log('[Gemini] prompt (len=' + promptText.length + '):\n' + logPreview);

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code !== 200) {
    throw new Error('Gemini API error ' + code + ': ' + body);
  }
  var json = JSON.parse(body);
  var candidate = json.candidates && json.candidates[0];
  if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
    throw new Error('Gemini API: no text in response.');
  }
  return candidate.content.parts[0].text || '';
}

var GeminiService = {
  getGeminiUrl: getGeminiUrl,
  callGemini: callGemini
};
