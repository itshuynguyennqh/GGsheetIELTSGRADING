/**
 * ConfigPrompts – Tập trung tất cả prompt dùng cho chấm bài Gemini.
 * Cập nhật Version 2.0: Tối ưu hóa đối chiếu dữ liệu, chống ảo giác và sửa lỗi trực tiếp.
 */

var ConfigPrompts = (function () {
  /** Nhận diện phạm vi và Quy trình tư duy 3 bước để đảm bảo độ chính xác 100%. */
  var taskScopeFromHandout =
    'Phạm vi & Quy trình: \n' +
    '1. XÁC ĐỊNH PHẠM VI: Căn cứ handout/rubric để biết đề yêu cầu kỹ năng nào (READING, LISTENING, WRITING, SPEAKING). Chỉ ghi "THIẾU [...]" nếu đề thực sự yêu cầu mà học sinh bỏ trống.\n' +
    '2. TRÍCH XUẤT: Quét bài làm, lưu ý các dấu hiệu [HS_CHỌN], highlight, tô đậm, chữ màu (đỏ/xanh) là đã làm bài.\n' +
    '3. ĐỐI CHIẾU CHÉO: So sánh câu trả lời với văn bản gốc. Kiểm tra kỹ tính nhất quán (VD: tên địa danh trong bản đồ vs bài viết, từ vựng đúng ngữ cảnh trong đoạn văn).';

  var P = {
    gradingWriting: {
      instruction: 'Đóng vai giáo viên chấm IELTS. Quy tắc: Đối chiếu kỹ văn bản gốc/hình ảnh với bài làm. Nếu bài viết (Task 1) lệch địa danh so với đề (vd: Norbiton vs Sunnyhills), phải chỉ rõ trong lỗi Task Achievement.',
      formatGuide: 'BẮT BUỘC đúng format, chỉ dùng keyword/cụm từ ngắn:\n' +
                   'WRITING\n' +
                   '+ [2-3 điểm sáng: từ vựng / ngữ pháp / cấu trúc]\n' +
                   '+ [điểm tốt khác nếu có]\n' +
                   '- [lỗi Task Achievement / Coherence / lệch thông tin đề bài]\n' +
                   '- [lỗi grammar-vocab + sửa lỗi trực tiếp vào câu sai]\n' +
                   '- [cách khắc phục nhanh: hành động cụ thể]\n' +
                   'Quy tắc định dạng: Nếu thấy [HS_CHỌN: chữ đỏ] hoặc chữ màu, coi là ĐÃ LÀM; không kết luận "không làm" khi có dấu hiệu này.',
      labelDeBai: 'Đề bài tham khảo:',
      labelBaiLam: 'Bài làm của học sinh:'
    },
    gradingWritingPipeline: {
      instruction: 'Đóng vai giáo viên chấm IELTS Writing. Tập trung đối chiếu sự khớp nhau giữa dữ liệu đề bài và nội dung học sinh viết.',
      formatGuide: 'BẮT BUỘC đúng format (Keyword-based):\n' +
                   'WRITING\n' +
                   '+ [2-3 điểm sáng: lexical resource / grammar / cấu trúc]\n' +
                   '+ [điểm tốt khác nếu có]\n' +
                   '- [lỗi Task Achievement / lệch đề / sai thông tin biểu đồ]\n' +
                   '- [lỗi grammar-vocab + sửa trực tiếp]\n' +
                   '- [fix nhanh: ưu tiên hành động cụ thể]\n' +
                   'Lưu ý: Nếu đề giao Reading/Vocab, đối chiếu chính xác từ vựng trong đoạn văn (vd: nhầm seaweed vs unfamiliar food).',
      labelTask: 'Task/rubric context:',
      labelStudentWriting: 'Student writing:'
    },
    gradingWritingImage: {
      instruction: 'Đóng vai giáo viên chấm IELTS. Nhận diện hình ảnh/PDF, quét kỹ các phần học sinh tô màu, khoanh tròn hoặc viết đè.',
      formatGuide: 'BẮT BUỘC đúng format:\n' +
                   'WRITING\n' +
                   '+ [2-3 điểm sáng]\n' +
                   '+ [điểm tốt khác nếu có]\n' +
                   '- [lỗi Task Achievement / Coherence / thiếu sót]\n' +
                   '- [lỗi grammar-vocab + sửa trực tiếp]\n' +
                   '- [cách khắc phục nhanh]\n' +
                   'Quy tắc cho PDF/ảnh: highlight, tô đậm, bôi đen, màu chữ (vd đỏ) trên lựa chọn là dấu hiệu học sinh đã chọn; không kết luận "không làm".',
      labelDeBai: 'Đề bài:',
      labelBaiLamImage: 'Bài làm (PDF/ảnh):',
      systemInstruction: 'Bạn là giáo viên chấm bài. Quy trình: Quét dấu hiệu chọn (màu sắc/tô đậm) -> Đối chiếu văn bản gốc -> Xuất nhận xét ngắn gọn theo khung WRITING +/-. Sửa lỗi trực tiếp, không nói chung chung.'
    },
    gradingSpeaking: {
      instruction: 'Chấm bài BTVN IELTS Speaking & Tổng hợp. Đối chiếu phạm vi đề giao.',
      formatGuide: 'Định dạng: Ex X sai Y câu. THIẾU [READING/WRITING/SPEAKING] (chỉ khi đề có giao mà học sinh chưa làm). \n' +
                   'Nếu sai bài đọc: Chỉ rõ lỗi sai thông tin (Ví dụ: Nhầm đối tượng anh/chị/em hoặc nhầm từ vựng trong đoạn văn).',
      labelDeBai: 'Đề bài:',
      systemInstruction: 'Chấm bài tổng hợp. Format: Ex X sai Y câu. THIẾU [...]. Chỉ nhắc thiếu nếu đề có yêu cầu. Nếu học sinh có đánh dấu bằng màu sắc/tô đậm thì coi là đã làm bài.'
    },
    // Các phần khác giữ nguyên logic cũ nhưng có thể cập nhật instruction nếu cần
    answerKeyExtract: 'You are an IELTS expert. Extract correct answers as a JSON array ["A","B",...]. Only extract keys for exercises actually present in the handout.',
    bandConversion: 'You are an IELTS expert. Reply only with one band number (1-9) based on raw score.',
    skillClassifier: 'Identify IELTS skill: WRITING, READING, LISTENING, or SPEAKING. Reply with exactly one word.'
  };

  // Các hàm helper phía dưới giữ nguyên cấu trúc để không làm hỏng logic module khác
  function getGradingWritingPrompt(content, promptContext) {
    var p = P.gradingWriting;
    var ctx = promptContext ? '\n\n' + p.labelDeBai + '\n' + promptContext : '';
    return p.instruction + '\n' + taskScopeFromHandout + '\n' + p.formatGuide + ctx + '\n\n' + p.labelBaiLam + '\n' + (content || '');
  }

  function getGradingWritingMultimodalPrompt(tabContext) {
    var p = P.gradingWritingImage;
    return p.instruction + '\n' + taskScopeFromHandout + '\n' + p.formatGuide + (tabContext ? '\n\n' + p.labelDeBai + '\n' + tabContext : '');
  }

  function getGradingWritingPipelinePrompt(tabContent, studentText) {
    var p = P.gradingWritingPipeline;
    return p.instruction + '\n' + taskScopeFromHandout + '\n' + p.formatGuide + '\n\n' + p.labelTask + '\n' + (tabContent || '') + '\n\n' + p.labelStudentWriting + '\n' + studentText;
  }

  function getGradingWritingImageParts(tabContent) {
    var p = P.gradingWritingImage;
    return {
      systemInstruction: p.systemInstruction,
      textPart: getGradingWritingMultimodalPrompt(tabContent) + '\n\n' + p.labelBaiLamImage
    };
  }

  function getGradingSpeakingPrompt(tabContent) {
    var p = P.gradingSpeaking;
    return p.instruction + '\n' + taskScopeFromHandout + '\n' + p.formatGuide + '\n\n' + p.labelDeBai + '\n' + (tabContent || '');
  }

  function getAnswerKeyPrompt(tabContent) { return P.answerKeyExtract + '\n\n' + (tabContent || ''); }
  function getBandConversionPrompt(skillLabel, correct, total) {
    return P.bandConversion.replace('{skill}', skillLabel).replace('{correct}', correct).replace('{total}', total);
  }
  function getSkillClassifierPrompt(tabContent) { return P.skillClassifier + (tabContent || ''); }

  return {
    gradingWriting: P.gradingWriting,
    gradingWritingPipeline: P.gradingWritingPipeline,
    gradingWritingImage: P.gradingWritingImage,
    gradingSpeaking: P.gradingSpeaking,
    answerKeyExtract: P.answerKeyExtract,
    bandConversion: P.bandConversion,
    skillClassifier: P.skillClassifier,
    taskScopeFromHandout: taskScopeFromHandout,
    getGradingWritingPrompt: getGradingWritingPrompt,
    getGradingWritingMultimodalPrompt: getGradingWritingMultimodalPrompt,
    getGradingWritingPipelinePrompt: getGradingWritingPipelinePrompt,
    getGradingWritingImageParts: getGradingWritingImageParts,
    getGradingSpeakingPrompt: getGradingSpeakingPrompt,
    getAnswerKeyPrompt: getAnswerKeyPrompt,
    getBandConversionPrompt: getBandConversionPrompt,
    getSkillClassifierPrompt: getSkillClassifierPrompt
  };
})();