/**
 * AIGateway – Tự động định tuyến Request tới Gemini hoặc Anthropic
 * Dựa trên cấu hình ACTIVE_AI_PROVIDER trong Config.js
 */

var AIGateway = (function () {
  
  /**
   * Gọi mô hình AI để lấy phản hồi Text.
   * @param {string} promptText Nội dung câu lệnh (Prompt).
   * @param {string} [modelPresetKey] Tên preset hoặc model cụ thể.
   * @returns {string} Kết quả dạng Text.
   */
  function callAI(promptText, modelPresetKey) {
    var provider = typeof Config !== 'undefined' && Config.getActiveAIProvider ? Config.getActiveAIProvider() : 'anthropic';
    
    if (provider === 'anthropic') {
      Logger.log('[AIGateway] Routing to Anthropic...');
      return AnthropicService.callClaude(promptText, modelPresetKey);
    } else {
      Logger.log('[AIGateway] Routing to Gemini...');
      return GeminiService.callGemini(promptText, modelPresetKey);
    }
  }

  return {
    callAI: callAI
  };
})();
