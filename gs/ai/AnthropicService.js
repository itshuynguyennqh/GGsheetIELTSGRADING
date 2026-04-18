/**
 * AnthropicService – Call Anthropic API (Claude) with configurable model.
 */

/**
 * @param {string} promptText User prompt.
 * @param {string} modelPresetKey Key from Config.ANTHROPIC_MODEL_PRESETS (e.g. 'claude-3-5-sonnet-20241022').
 * @returns {string} Response text from Claude.
 * @throws {Error} If API key missing or request fails.
 */
function callClaude(promptText, modelPresetKey) {
  var apiKey = typeof Config !== 'undefined' && Config.getAnthropicApiKey ? Config.getAnthropicApiKey() : null;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY chưa được cấu hình trong Script Properties.');
  }
  
  // Use config to get model or default to sonnet
  var model = typeof Config !== 'undefined' && Config.getAnthropicModel ? Config.getAnthropicModel(modelPresetKey || 'default') : 'claude-3-5-sonnet-20241022';
  
  var url = 'https://api.anthropic.com/v1/messages';
  
  var payload = {
    model: model,
    max_tokens: 4096,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: promptText
      }
    ]
  };

  var maxLog = 5000;
  var logPreview = promptText.length > maxLog
    ? promptText.substring(0, maxLog) + '\n...[truncated ' + (promptText.length - maxLog) + ' chars]'
    : promptText;
  Logger.log('[Anthropic] prompt (len=' + promptText.length + '):\n' + logPreview);

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = response.getContentText();
  
  if (code !== 200) {
    throw new Error('Anthropic API error ' + code + ': ' + body);
  }
  
  var json = JSON.parse(body);
  if (!json.content || !json.content[0] || !json.content[0].text) {
    throw new Error('Anthropic API: no text in response.');
  }
  
  return json.content[0].text || '';
}

var AnthropicService = {
  callClaude: callClaude
};
