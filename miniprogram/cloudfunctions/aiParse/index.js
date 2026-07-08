// 从环境变量读取 DeepSeek API Key（请在云开发控制台配置 DEEPSEEK_KEY）
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-d7g9nz5em55c161ca' })

function fixJSON(str) {
  let s = str
  s = s.replace(/[“”「」『』]/g, "'")
  s = s.replace(/[‘’]/g, "'")
  s = s.replace(/：/g, ':')
  s = s.replace(/，/g, ',')
  s = s.replace(/（/g, '(')
  s = s.replace(/）/g, ')')
  s = s.replace(/｛/g, '{')
  s = s.replace(/｝/g, '}')
  s = s.replace(/［/g, '[')
  s = s.replace(/］/g, ']')
  s = s.replace(/\),\("stem"/g, '},{"stem"')
  s = s.replace(/\["stem"/g, '[{"stem"')
  s = s.replace(/\(\"stem"/g, '{"stem"')
  s = s.replace(/"\)\]/g, '"}]')
  s = s.replace(/\"\),/g, '"},')
  s = s.replace(/\"\)$/g, '"}')
  s = s.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')
  return s
}

function tryParse(str) {
  try { return JSON.parse(str) } catch (e) {}
  const start = str.indexOf('[')
  const end = str.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try { return JSON.parse(str.slice(start, end + 1)) } catch (e) {}
  }
  const objStart = str.indexOf('{')
  const objEnd = str.lastIndexOf('}')
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const obj = JSON.parse(str.slice(objStart, objEnd + 1))
      if (obj.questions) return obj
      const arr = Object.values(obj).find(v => Array.isArray(v))
      if (arr) return arr
    } catch (e) {}
  }
  return null
}

// 普通解析（非分页模式）
async function callAI(text) {
  const prompt = '从以下文本中提取选择题。文本已经尽量按完整候选题块分组，但仍可能包含少量相邻题干上下文。严格按步骤执行：\n\nStep 1 — 识别完整题目\n一道完整题目 = 题干 + 至少2个明确选项。选项标记可能是 A/B/C/D、A、B、C、D、（A）（B）、1/2/3/4、1、2、3、4、（1）（2）、①②③④。只有候选题块不完整时才跳过，不要因为题目跨页就漏掉后半组选项。\n\nStep 2 — 识别选项组\n如果原文用 1/2/3/4 或 ①②③④ 表示选项，请按原始顺序放入 options，并把答案统一转换成 A/B/C/D：1或①=A，2或②=B，3或③=C，4或④=D。\n\nStep 3 — 清洗题干\n删除题干中嵌入的答案标记（如（B）(A) 【C】等）和题型标记（如【单选题】）。其余文字完全保留原文，不改写。\n例：原文"关于XX正确的是（B）" → stem为"关于XX正确的是"\n\nStep 4 — 提取或生成答案\n如果原文明确给出答案，按原文答案转换成 A/B/C/D 填入 answer。若原文没有答案，必须根据题干和选项判断最可能的正确答案并填入 answer，不要留空。多选题可返回多个字母，如 AC。\n\nStep 5 — 提取选项、答案、原文解析\n选项逐字照抄原文，但不要把选项标签本身重复写入选项内容。只有原文明确出现“解析/答案解析”等解析内容时，才填入 explanation；原文没有解析时 explanation 必须为空字符串，不要生成、推理或补写解析。\n\nStep 6 — 按原始顺序输出JSON\n格式：[{"stem":"题干","options":["选项1","选项2","选项3","选项4"],"answer":"A","explanation":""}]\n只输出JSON数组，不要markdown，不要其他文字。\n\n文本：\n' + text

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是选择题提取和答题器。严格按用户给定流程输出JSON数组；原文无答案时也必须根据题目生成答案。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 8192
    })
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'API错误')

  const content = data.choices?.[0]?.message?.content || ''
  const cleaned = fixJSON(content)
  const result = tryParse(cleaned)
  if (result && Array.isArray(result)) return result

  const lastComplete = cleaned.lastIndexOf('}')
  if (lastComplete > 0) {
    const fixed = cleaned.slice(0, lastComplete + 1) + ']'
    const fixedResult = tryParse(fixed)
    if (fixedResult && Array.isArray(fixedResult)) return fixedResult
  }

  throw new Error('AI解析结果格式异常，请重试')
}

async function callAIWindow(text, windowIndex) {
  const prompt = '从以下窗口文本中提取选择题。该文本来自长文档滑动窗口，和相邻窗口可能有重叠，也可能包含被截断的题。\n\n' +
    '规则：\n' +
    '1. 提取窗口内出现的选择题，输出题干、选项、答案、原文解析、知识点。\n' +
    '2. 如果题目基本完整，status 填 "complete"。\n' +
    '3. 如果明显缺少题干、后续选项或答案，但能看出是一道题的一部分，status 填 "incomplete"，保留已经看到的内容，不要编造缺失部分。\n' +
    '4. 对没有明确答案的完整题，可以根据题干和选项推断最可能答案；如果无法判断，answer 留空。\n' +
    '5. 选项标签统一转换为 A/B/C/D/E/F/G/H/I/J，options 只放选项内容，不重复标签。\n' +
    '6. stem 只能是题干正文，必须删除题干里的答案标记和题型标记，例如“（D）[单选题]”“（ABCD）[多选题]”不能出现在 stem 中；答案字母放入 answer。\n' +
    '7. 如果原文格式是“长题干……（ABCD）[多选题]\\nA. ...\\nB. ...”，stem 必须取 A 选项之前的完整长题干，不能把 A 选项当成 stem。\n' +
    '8. 只有原文明确出现“解析/答案解析”等解析内容时，才填入 explanation；原文没有解析时 explanation 必须为空字符串，不要生成、推理或补写解析。\n' +
    '9. sourceText 放该题在窗口中的关键原文片段，尽量简短但足够回溯。\n' +
    '10. 只输出 JSON 对象，不要 markdown，不要解释。\n\n' +
    '返回格式：{"questions":[{"stem":"题干","options":["选项1","选项2"],"answer":"A","explanation":"","knowledgePoint":"","status":"complete","sourceText":"原文片段"}]}\n\n' +
    '窗口编号：' + windowIndex + '\n' +
    '窗口文本：\n' + text

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是长文档选择题抽取器。严格输出 JSON 对象 {"questions":[...]}，不编造缺失内容。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 8192
    })
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'API错误')

  const content = data.choices?.[0]?.message?.content || ''
  const parsed = tryParse(fixJSON(content))
  if (parsed && parsed.questions && Array.isArray(parsed.questions)) return parsed.questions
  if (parsed && Array.isArray(parsed)) return parsed
  throw new Error('AI窗口解析结果格式异常，请重试')
}

function slimQuestionForMerge(question) {
  return {
    stem: String(question && question.stem || '').slice(0, 1200),
    options: (question && question.options || []).map(function(option) {
      return String(option || '').slice(0, 500)
    }).slice(0, 10),
    answer: String(question && question.answer || ''),
    explanation: String(question && question.explanation || '').slice(0, 600),
    knowledgePoint: String(question && question.knowledgePoint || ''),
    status: String(question && question.status || 'complete'),
    sourceText: String(question && question.sourceText || '').slice(0, 1000)
  }
}

async function callAIMergeWindows(prevQuestions, currentQuestions) {
  const prev = (prevQuestions || []).map(slimQuestionForMerge)
  const current = (currentQuestions || []).map(slimQuestionForMerge)
  const prompt = '你要合并两个相邻滑动窗口解析出的选择题列表。两个窗口有重叠，可能重复识别同一道题，也可能分别识别了同一道跨窗口题的不同部分。\n\n' +
    '请按以下原则输出：\n' +
    '1. prevOnly：只在上一个窗口出现、且不需要和当前窗口合并的题。完整题可以放这里；明显 incomplete 的题不要放这里，放 needsReview。\n' +
    '2. currentMerged：属于当前窗口的题目集合。包括只在当前窗口出现的题，以及上一个窗口和当前窗口重复/互补后合并出来的题。合并时保留更完整的题干、选项、答案、原文解析和知识点。\n' +
    '3. needsReview：疑似同题但答案/选项冲突、无法可靠合并，或上一个窗口遗留的不完整题。\n' +
    '4. 不要丢题。不能确定是否重复时，不要合并，分别保留或放 needsReview。\n' +
    '5. stem 只能保留题干正文，必须删除“（D）[单选题]”“（ABCD）[多选题]”等答案和题型标记；答案字母放入 answer。\n' +
    '6. 不要生成、推理或补写解析；只保留输入题目里已有的 explanation。\n' +
    '7. 只输出 JSON 对象，不要 markdown，不要解释。\n\n' +
    '返回格式：{"prevOnly":[题目],"currentMerged":[题目],"needsReview":[题目]}\n\n' +
    '上一个窗口题目 prevQuestions：\n' + JSON.stringify(prev) + '\n\n' +
    '当前窗口题目 currentQuestions：\n' + JSON.stringify(current)

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是选择题去重合并器。严格输出 JSON 对象 {"prevOnly":[],"currentMerged":[],"needsReview":[]}。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 8192
    })
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'API错误')

  const content = data.choices?.[0]?.message?.content || ''
  const parsed = tryParse(fixJSON(content))
  if (parsed && Array.isArray(parsed.prevOnly) && Array.isArray(parsed.currentMerged)) {
    return {
      prevOnly: parsed.prevOnly || [],
      currentMerged: parsed.currentMerged || [],
      needsReview: parsed.needsReview || []
    }
  }
  throw new Error('AI窗口合并结果格式异常，请重试')
}

async function callAIMergeQuestionPair(prevQuestion, currentQuestion) {
  const prev = slimQuestionForMerge(prevQuestion)
  const current = slimQuestionForMerge(currentQuestion)
  const prompt = '下面是相邻两个滑动窗口中疑似同一道选择题的两个版本。请只把这两个版本合并成一道更完整的题。\n\n' +
    '规则：\n' +
    '1. 输出一道题，不要输出数组。\n' +
    '2. stem 必须是完整题干正文，不能把选项当题干。\n' +
    '3. stem 必须删除答案和题型标记，例如“（D）[单选题]”“（ABCD）[多选题]”不能出现在 stem 中；答案字母放入 answer。\n' +
    '4. options 保留更完整的一组，选项内容不要带 A/B/C/D 标签。\n' +
    '5. answer 保留更完整/更明确的答案。\n' +
    '6. explanation 不要生成；只保留输入里已有的原文解析，没有就空字符串。\n' +
    '7. knowledgePoint 保留更准确的知识点，没有就空字符串。\n' +
    '8. 只输出 JSON 对象，不要 markdown，不要解释。\n\n' +
    '返回格式：{"stem":"题干","options":["选项1","选项2"],"answer":"A","explanation":"","knowledgePoint":"","status":"complete","sourceText":"原文片段"}\n\n' +
    '上一个窗口版本：\n' + JSON.stringify(prev) + '\n\n' +
    '当前窗口版本：\n' + JSON.stringify(current)

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是选择题合并器。严格输出单个 JSON 题目对象，不要输出其他内容。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 4096
    })
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'API错误')

  const content = data.choices?.[0]?.message?.content || ''
  const parsed = tryParse(fixJSON(content))
  if (parsed && parsed.stem !== undefined && parsed.options) return parsed
  throw new Error('AI单题合并结果格式异常，请重试')
}

// 逐页解析：带 carryOver 上下文
function isContinuationPageText(text) {
  const cleaned = String(text || '')
    .replace(/\r/g, '\n')
    .trim()
    .replace(/^\s*\d+\s*\/\s*\d+\s*/, '')
    .trim()
  return /(^|\n|\s)[D-J]\s*[.．、)]/.test(cleaned.slice(0, 1200))
}

async function callAIPage(currentPageText, carryOver) {
  const currentText = String(currentPageText || '')
  const contextText = String(carryOver || '')
  const isContinuation = isContinuationPageText(currentText)
  const crossPageBlock = isContinuation && contextText
    ? '跨页候选题块（优先解析，上一页末尾 + 当前页前段）：\n' + contextText + '\n' + currentText.slice(0, 1800) + '\n\n'
    : ''
  const fullText = crossPageBlock +
    (contextText ? '上一页末尾上下文（只用于补全跨页题）：\n' + contextText + '\n\n' : '') +
    '当前页文本：\n' + currentText
  const continuationRule = isContinuation
    ? '\n当前页前段检测到 D/E/F 等后续选项，这通常是跨页题。必须优先把上一页末尾上下文中的题干、A/B/C 选项，与当前页的 D/E/F 选项合并成一道完整题输出。不要因为当前页只有一个选项就跳过，也不要漏掉当前页的 D/E/F 选项。\n'
    : ''
  const prompt = '你是选择题结构化提取器。请从文本中提取选择题，并只输出 JSON 对象。\n' +
    continuationRule +
    '\n规则：\n' +
    '1. 文本可能包含“上一页末尾上下文”和“当前页文本”。上一页上下文只用于补全跨页题，不能独立抽取旧题。\n' +
    '2. 只有题干、选项或答案至少有一部分出现在当前页文本里，才允许输出。\n' +
    '3. 如果题干和 A/B/C 在上一页上下文，D/E/F 在当前页文本，这是一道完整跨页题，必须合并输出。\n' +
    '4. 一道题至少需要题干和 2 个明确选项。跨页题的选项可以来自上下文和当前页。\n' +
    '5. 题干中如果包含（A）（B）（C）（D）或【单选题】等答案/题型标记，删除这些标记；其余文字照抄原文。\n' +
    '6. 选项必须逐字照抄原文，按 A/B/C/D 顺序放入 options，不要漏掉当前页开头或前段的续页选项。\n' +
    '7. 答案字母填入 answer；没有明确答案就留空字符串。\n\n' +
    '返回格式：{"questions":[{"stem":"题干","options":["A选项","B选项","C选项","D选项"],"answer":"A"}]}\n' +
    '只输出 JSON 对象，不要 markdown，不要解释。\n\n' +
    '文本：\n' + fullText

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是选择题提取器。严格按用户规则输出 JSON 对象 {"questions":[...]}，不要输出其他内容。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 4096
    })
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'API错误')

  const content = data.choices?.[0]?.message?.content || ''
  const cleaned = fixJSON(content)
  const parsed = tryParse(cleaned)

  if (parsed && parsed.questions) {
    return { questions: parsed.questions, carryOver: parsed.carryOver || '' }
  }
  if (parsed && Array.isArray(parsed)) {
    return { questions: parsed, carryOver: '' }
  }

  throw new Error('AI解析结果格式异常，请重试')
}

async function callAIPageLegacy(currentPageText, carryOver) {
  const fullText = (carryOver ? '上一页末尾上下文：\n' + carryOver + '\n\n' : '') + '当前页文本：\n' + currentPageText
  const currentStart = (currentPageText || '').trim().slice(0, 300)
  const continuationHint = /(^|\n|\s)[D-J]\s*[.．、)]/.test(currentStart)
    ? '\n特别注意：当前页开头是 D/E/F 等续页选项，通常表示上一页题干和 A-C 选项被分页截断。必须优先尝试把上一页末尾上下文中的题干、A-C 选项，与当前页开头的续页选项合并成完整题目。不要因为当前页只有一个选项就跳过。\n'
    : ''

  const prompt = '从以下文本中提取选择题。文本分为“上一页末尾上下文”和“当前页文本”。严格按步骤执行：\n' + continuationHint + '\nStep 1 — 使用上下文\n上一页末尾上下文只用于补全跨页题，不能独立抽题。\n不要输出只存在于上一页末尾上下文里的完整旧题。\n只有当题目的题干、选项或答案至少有一部分出现在当前页文本里，才允许输出。\n如果题干在上一页末尾上下文、选项或答案在当前页文本，请合并成一道完整题输出。\n\nStep 2 — 识别完整题目\n一道完整题目 = 题干 + 至少2个明确选项（标记为A/B/C/D或A、B、C、D）。\n如果当前页文本提供了 D/E/F 等后续选项，而上一页末尾上下文提供了题干和前置选项，也算完整题。\n不完整题跳过。\n\nStep 3 — 清洗题干\n删除题干中嵌入的答案标记（如（B）(A) 【C】等）。其余文字完全保留原文，不改写。\n\nStep 4 — 提取选项和答案\n选项逐字照抄原文。答案字母填入answer字段。\n\n返回格式：{"questions":[{"stem":"题干","options":["A","B","C","D"],"answer":"A"}]}\n只输出JSON对象，不要markdown，不要其他文字。\n\n文本：\n' + fullText

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是选择题提取器。严格按用户给定的Step-by-step流程执行。只输出JSON对象 {"questions":[...]}。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 4096
    })
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'API错误')

  const content = data.choices?.[0]?.message?.content || ''
  const cleaned = fixJSON(content)
  const parsed = tryParse(cleaned)

  // 新格式返回 {questions: [...], carryOver: "..."}
  if (parsed && parsed.questions) {
    return { questions: parsed.questions, carryOver: parsed.carryOver || '' }
  }
  // 兼容：如果 AI 只返回了数组
  if (parsed && Array.isArray(parsed)) {
    return { questions: parsed, carryOver: '' }
  }

  throw new Error('AI解析结果格式异常，请重试')
}

// 单题解释
async function explainQuestion(question) {
  const stem = question.stem || ''
  const options = (question.options || []).map(function(o, i) {
    return String.fromCharCode(65 + i) + '. ' + o
  }).join('\n')
  const answer = question.answer || ''

  const prompt = '题目：' + stem + '\n选项：\n' + options + '\n正确答案：' + answer + '\n\n请用50字以内解释为什么这是正确答案。只输出解释文字，不要其他内容。'

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是试题讲解助手。用简洁的语言解释题目答案，50字以内，只输出解释内容。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 256
    })
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'API错误')
  return (data.choices?.[0]?.message?.content || '').trim()
}

// AI 对话（学习助手聊天）
async function callAIChat(messages) {
  // 验证 messages 有效
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new Error('消息不能为空')
  }

  const systemPrompt = '你是 ExamPilot AI 学习助手，一款考试冲刺小程序的内置 AI。你的职责是：\n\n' +
    '1. 回答学习问题（数学、英语、专业课等各科知识点）\n' +
    '2. 帮助拆解题干、分析选项、讲解解题思路\n' +
    '3. 根据用户需求整理资料、生成复习建议和冲刺计划\n' +
    '4. 保持友好、鼓励的语气，适合学生用户\n\n' +
    '回答要简洁清晰（一般 100-200 字），如果需要详细讲解可稍长。\n' +
    '如果用户问与学习无关的问题，礼貌地引导回学习话题。'

  const requestBody = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    temperature: 0.7,
    stream: false,
    max_tokens: 2048
  }

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_KEY
      },
      body: JSON.stringify(requestBody),
      timeout: 15000
    })

    const data = await res.json()
    if (!res.ok || data.error) {
      throw new Error(data.error?.message || 'API返回错误: ' + res.status)
    }
    return data.choices?.[0]?.message?.content || ''
  } catch (e) {
    console.error('callAIChat error:', e.message)
    throw e
  }
}

exports.main = async (event) => {
  try {
    // AI 对话模式
    if (event.mode === 'chat') {
      const reply = await callAIChat(event.messages || [])
      return {
        success: true,
        mode: 'chat',
        reply: reply
      }
    }

    // 单题解释
    if (event.mode === 'explain' && event.question) {
      const explanation = await explainQuestion(event.question)
      return { success: true, mode: 'explain', explanation: explanation }
    }

    // 滑动窗口解析
    if (event.mode === 'parseWindow') {
      const questions = await callAIWindow(event.text || '', event.windowIndex || 0)
      return { success: true, mode: 'parseWindow', questions: questions }
    }

    // 相邻窗口滚动合并
    if (event.mode === 'mergeWindows') {
      const result = await callAIMergeWindows(event.prevQuestions || [], event.currentQuestions || [])
      return {
        success: true,
        mode: 'mergeWindows',
        prevOnly: result.prevOnly,
        currentMerged: result.currentMerged,
        needsReview: result.needsReview
      }
    }

    // 单对重叠题合并
    if (event.mode === 'mergeQuestionPair') {
      const question = await callAIMergeQuestionPair(event.prevQuestion || {}, event.currentQuestion || {})
      return { success: true, mode: 'mergeQuestionPair', question: question }
    }

    // 逐页解析
    if (event.mode === 'parsePage') {
      const result = await callAIPage(event.currentPageText || '', event.carryOver || '')
      return { success: true, mode: 'parsePage', questions: result.questions, carryOver: result.carryOver }
    }

    // PDF 按页提取文字
    if (event.mode === 'extractPages' && event.fileID) {
      const downloadRes = await cloud.downloadFile({ fileID: event.fileID })
      const fileName = (event.fileName || '').toLowerCase()
      if (!fileName.endsWith('.pdf')) {
        return { success: false, error: 'extractPages 仅支持 PDF 文件' }
      }
      const pdfParse = require('pdf-parse')
      const pages = []
      await pdfParse(downloadRes.fileContent, {
        pagerender: function(pageData) {
          return pageData.getTextContent().then(function(textContent) {
            var lastY, text = ''
            var items = textContent.items
            for (var i = 0; i < items.length; i++) {
              var item = items[i]
              var y = item.transform ? item.transform[5] : 0
              if (lastY !== undefined && Math.abs(y - lastY) > 5) {
                text += '\n'
              } else if (text.length > 0 && !text.endsWith('\n')) {
                text += ' '
              }
              text += item.str
              lastY = y
            }
            text = text.replace(/\n\s*\d+\s*\/\s*\d+\s*\n/g, '\n')
            pages.push({ pageNo: pageData.pageIndex + 1, text: text.trim() })
            return text
          })
        }
      })
      return { success: true, mode: 'extractPages', pages: pages, totalPages: pages.length }
    }

    // === 以下为原有逻辑（Word/文本文件/手动输入）===

    let rawText = ''

    if (event.fileID) {
      const downloadRes = await cloud.downloadFile({ fileID: event.fileID })
      const fileName = (event.fileName || '').toLowerCase()

      if (fileName.endsWith('.pdf')) {
        const pdfParse = require('pdf-parse')
        const pdfData = await pdfParse(downloadRes.fileContent)
        rawText = pdfData.text
      } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer: downloadRes.fileContent })
        rawText = result.value
      } else {
        rawText = downloadRes.fileContent.toString('utf-8')
      }
    }

    if (event.rawText) rawText = event.rawText

    if (!rawText || !rawText.trim()) {
      return { success: false, error: '文件中未找到文字' }
    }

    rawText = rawText.replace(/\n\s*\d+\s*\/\s*\d+\s*\n/g, '\n')

    // 提取模式
    if (event.fileID && !event.rawText) {
      return { success: true, mode: 'extract', rawText: rawText, totalLength: rawText.length }
    }

    // 普通解析模式
    const questions = await callAI(rawText)
    return { success: true, mode: 'parse', questions: questions }
  } catch (err) {
    return { success: false, error: err.message || '解析失败' }
  }
}
