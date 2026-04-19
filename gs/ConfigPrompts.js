/**
 * ConfigPrompts – Tập trung tất cả prompt dùng cho chấm bài Gemini.
 * Cập nhật Version 2.0: Tối ưu hóa đối chiếu dữ liệu, chống ảo giác và sửa lỗi trực tiếp.
 */

var ConfigPrompts = (function () {
  /** Nhận diện phạm vi và Quy trình tư duy 3 bước để đảm bảo độ chính xác 100%. */
  var taskScopeFromHandout =
    'Phạm vi & Quy trình: \n' +
    '1. XÁC ĐỊNH PHẠM VI: Căn cứ handout/rubric để biết đề yêu cầu kỹ năng nào (READING, LISTENING, WRITING, SPEAKING). Chỉ ghi "THIẾU [...]" nếu đề thực sự yêu cầu mà học sinh bỏ trống.\n' +
    '2. TRÍCH XUẤT: Quét bài làm, lưu ý các dấu hiệu <b>chọn</b>, <u>tô đậm</u>, <i>highlight</i>, chữ màu (đỏ/xanh) là đã làm bài.\n' +
    '3. ĐỐI CHIẾU CHÉO: So sánh câu trả lời với văn bản gốc. Kiểm tra kỹ tính nhất quán (VD: tên địa danh trong bản đồ vs bài viết, từ vựng đúng ngữ cảnh trong đoạn văn).';

  var P = {
    gradingStrictJSON: {
      instruction: 'Bạn là chuyên gia chấm thi IELTS khắt khe. Lệnh tối cao: KHÔNG chào hỏi, KHÔNG giải thích dài dòng, KHÔNG kết luận. BẮT BUỘC trả về kết quả 100% dưới dạng JSON hợp lệ, KHÔNG chứa markdown ```json hay bất kỳ văn bản nào bên ngoài JSON.',
      antiHallucination: 'CƠ CHẾ CHỐNG HALLUCINATION:\n' +
        '- ĐÁP ÁN BẮT BUỘC: Bạn phải sử dụng các đáp án (Listening/Reading) và Địa danh mục tiêu (Target Location) được cung cấp dưới đây để đối chiếu. Tuyệt đối không tự giải đề.\n' +
        '- LỖI TASK ACHIEVEMENT: Nếu bài viết (Task 1) sử dụng sai địa danh mục tiêu, hãy ghi rõ lỗi này.\n\n' +
        'Dữ liệu cung cấp:\n' +
        'Listening Key: {listeningKey}\n' +
        'Reading Key: {readingKey}\n' +
        'Target Location: {targetLocation}\n',
      formatGuide: 'Cấu trúc JSON BẮT BUỘC trả về:\n' +
        '{\n' +
        '  "listening": {\n' +
        '    "score": "Số câu đúng/Tổng",\n' +
        '    "errors": [\n' +
        '      { "question": "1", "student_answer": "A", "correct_answer": "B", "advice": "Ngắn gọn: sai thì, nhầm số..." }\n' +
        '    ]\n' +
        '  },\n' +
        '  "reading": {\n' +
        '    "score": "Số câu đúng/Tổng",\n' +
        '    "errors": [\n' +
        '      { "question": "2", "student_answer": "F", "correct_answer": "T", "advice": "Nhầm thông tin đoạn 2" }\n' +
        '    ]\n' +
        '  },\n' +
        '  "writing": {\n' +
        '    "pros": [],\n' +
        '    "cons_task_achievement": ["Lỗi 1", "Lỗi 2"],\n' +
        '    "cons_grammar": ["câu sai -> sửa thành..."]\n' +
        '  }\n' +
        '}\n' +
        'Lưu ý quan trọng: List "errors" của Reading/Listening chỉ bao gồm các câu sai. Phần "advice" phải CỰC KỲ NGẮN GỌN (dưới 10 chữ).',
      labelDeBai: 'Đề bài:',
      labelDapAn: 'Đáp án được cung cấp:',
      labelBaiLam: 'Bài làm:'
    },
    gradingWriting: {
      instruction: 'Đóng vai giáo viên chấm IELTS. Quy tắc: Đối chiếu kỹ văn bản gốc/hình ảnh với bài làm. Nhận xét cực kỳ NGẮN GỌN, xưng hô thân thiện (ví dụ: cô/thầy và em).',
      formatGuide: 'BẮT BUỘC trả về định dạng dấu gạch ngang đầu dòng như mẫu dưới đây (Tuyệt đối không giải thích dài dòng, bỏ qua các phần khen ngợi chung chung):\n' +
                   'WRITING\n' +
                   '- Em nên lưu ý rằng đây là năm trong quá khứ => nên dùng thì quá khứ\n' +
                   '- Trong bài này nhiều du khách nên phải là tourists\n' +
                   '- câu 1 em nên sửa lại là "..."\n' +
                   '- để mô tả thấp hơn thì em dùng "less" nhé => ...\n' +
                   'Quy tắc định dạng: Nếu thấy thẻ <b>, <u>, <i> hoặc chữ màu, coi là ĐÃ LÀM; không kết luận "không làm" khi có dấu hiệu này.',
      labelDeBai: 'Đề bài tham khảo:',
      labelBaiLam: 'Bài làm của học sinh:'
    },
    gradingWritingPipeline: {
      instruction: 'Đóng vai giáo viên chấm IELTS Writing. Nhận xét cực kỳ NGẮN GỌN, tập trung sửa lỗi trực tiếp.',
      formatGuide: 'BẮT BUỘC đúng format:\n' +
                   'WRITING\n' +
                   '- [Chỉ ra lỗi 1] => [Cách sửa 1]\n' +
                   '- [Chỉ ra lỗi 2] => [Cách sửa 2]',
      labelTask: 'Task/rubric context:',
      labelStudentWriting: 'Student writing:'
    },
    gradingWritingImage: {
      instruction: 'Đóng vai giáo viên chấm IELTS. Nhận diện hình ảnh/PDF. Nhận xét cực kỳ NGẮN GỌN, thân thiện.',
      formatGuide: 'BẮT BUỘC trả về định dạng gạch đầu dòng:\n' +
                   'WRITING\n' +
                   '- [Chỉ ra lỗi sai 1] => [Sửa lại thành...]\n' +
                   '- [Chỉ ra lỗi sai 2] => [Sửa lại thành...]\n' +
                   'Quy tắc cho PDF/ảnh: highlight, tô đậm, bôi đen, màu chữ (vd đỏ) trên lựa chọn là dấu hiệu học sinh đã chọn; không kết luận "không làm".',
      labelDeBai: 'Đề bài:',
      labelBaiLamImage: 'Bài làm (PDF/ảnh):',
      systemInstruction: 'Bạn là giáo viên chấm bài. Quy trình: Quét dấu hiệu chọn (màu sắc/tô đậm) -> Đối chiếu văn bản gốc -> Xuất nhận xét bằng các gạch đầu dòng cực kỳ ngắn gọn (chỉ lỗi và cách sửa). Không giải thích lan man.'
    },
    gradingSpeaking: {
      instruction: 'Chấm bài BTVN IELTS Speaking. Đánh giá cực kỳ NGẮN GỌN, đi thẳng vào lỗi sai và cách khắc phục, xưng hô thân thiện (em).',
      formatGuide: 'BẮT BUỘC định dạng gạch đầu dòng:\n' +
                   'SPEAKING\n' +
                   '- [Lỗi phát âm/từ vựng 1] => [Sửa lại là...]\n' +
                   '- [Lỗi ngữ pháp 2] => [Sửa lại là...]\n' +
                   'Tuyệt đối không giải thích dài dòng.',
      labelDeBai: 'Đề bài:',
      systemInstruction: 'Chấm bài tổng hợp. Dùng gạch đầu dòng chỉ ra lỗi và cách sửa trực tiếp, cực kỳ ngắn gọn, không lan man.'
    },
    answerKeyExtract: 'You are an IELTS expert. Extract correct answers as a JSON array ["A","B",...]. Only extract keys for exercises actually present in the handout.',
    bandConversion: 'You are an IELTS expert. Reply only with one band number (1-9) based on raw score.',
    skillClassifier: 'Identify IELTS skill: WRITING, READING, LISTENING, or SPEAKING. Reply with exactly one word.'
  };

  function getGradingStrictPrompt(tabContent, text, keys) {
    var p = P.gradingStrictJSON;
    var keysContext = p.antiHallucination
      .replace('{listeningKey}', keys.listeningKey || 'Không có')
      .replace('{readingKey}', keys.readingKey || 'Không có')
      .replace('{targetLocation}', keys.targetLocation || 'Không có');
    
    var dapAnContext = '';
    if (keys.listeningKey || keys.readingKey) {
        dapAnContext = p.labelDapAn + '\n' +
                       (keys.listeningKey ? 'Listening: ' + keys.listeningKey + '\n' : '') +
                       (keys.readingKey ? 'Reading: ' + keys.readingKey + '\n' : '');
    }

    return p.instruction + '\n' + keysContext + '\n' + p.formatGuide + '\n' +
           (tabContent ? p.labelDeBai + '\n' + tabContent + '\n\n' : '') +
           (dapAnContext ? dapAnContext + '\n\n' : '') +
           p.labelBaiLam + '\n' + (text || '');
  }

  function getGradingWritingPrompt(content, promptContext, keys) {
    var p = P.gradingWriting;
    var ctx = promptContext ? '\n\n' + p.labelDeBai + '\n' + promptContext : '';
    
    var dapAn = '';
    if (keys && (keys.listeningKey || keys.readingKey || keys.targetLocation)) {
      dapAn = '\n\nĐáp án tham khảo:\n' +
              (keys.listeningKey ? '- Listening: ' + keys.listeningKey + '\n' : '') +
              (keys.readingKey ? '- Reading: ' + keys.readingKey + '\n' : '') +
              (keys.targetLocation ? '- Target Location: ' + keys.targetLocation + '\n' : '');
    }
    
    return p.instruction + '\n' + taskScopeFromHandout + '\n' + p.formatGuide + ctx + dapAn + '\n\n' + p.labelBaiLam + '\n' + (content || '');
  }

  function getGradingWritingMultimodalPrompt(tabContent, keys) {
    var p = P.gradingWritingImage;
    
    var dapAn = '';
    if (keys && (keys.listeningKey || keys.readingKey || keys.targetLocation)) {
      dapAn = '\n\nĐáp án tham khảo:\n' +
              (keys.listeningKey ? '- Listening: ' + keys.listeningKey + '\n' : '') +
              (keys.readingKey ? '- Reading: ' + keys.readingKey + '\n' : '') +
              (keys.targetLocation ? '- Target Location: ' + keys.targetLocation + '\n' : '');
    }
    
    return p.instruction + '\n' + taskScopeFromHandout + '\n' + p.formatGuide + (tabContent ? '\n\n' + p.labelDeBai + '\n' + tabContent : '') + dapAn;
  }

  function getGradingWritingPipelinePrompt(tabContent, studentText) {
    var p = P.gradingWritingPipeline;
    return p.instruction + '\n' + taskScopeFromHandout + '\n' + p.formatGuide + '\n\n' + p.labelTask + '\n' + (tabContent || '') + '\n\n' + p.labelStudentWriting + '\n' + studentText;
  }

  function getGradingWritingImageParts(tabContent, keys) {
    var p = P.gradingWritingImage;
    return {
      systemInstruction: p.systemInstruction,
      textPart: getGradingWritingMultimodalPrompt(tabContent, keys) + '\n\n' + p.labelBaiLamImage
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
    gradingStrictJSON: P.gradingStrictJSON,
    gradingWriting: P.gradingWriting,
    gradingWritingPipeline: P.gradingWritingPipeline,
    gradingWritingImage: P.gradingWritingImage,
    gradingSpeaking: P.gradingSpeaking,
    answerKeyExtract: P.answerKeyExtract,
    bandConversion: P.bandConversion,
    skillClassifier: P.skillClassifier,
    taskScopeFromHandout: taskScopeFromHandout,
    getGradingStrictPrompt: getGradingStrictPrompt,
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