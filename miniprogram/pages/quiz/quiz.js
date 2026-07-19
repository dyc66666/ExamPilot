var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
var questionUtils = require('../../utils/question-utils')
var PETS = {
  idle: '/images/pets/pet-greeting-drawn.gif',
  thinking: '/images/pets/pet-thinking-drawn.gif',
  happy: '/images/pets/pet-happy-drawn.gif',
  wrong: '/images/pets/pet-wrong-drawn.gif',
  waiting: '/images/pets/pet-waiting-drawn.gif',
  review: '/images/pets/pet-review-drawn.gif'
}

function stripAnswerMarkers(stem) {
  var s = String(stem || '')
  s = s.replace(/（[A-F]+）/g, '')
  s = s.replace(/\([A-F]+\)/g, '')
  s = s.replace(/【[A-F]+】/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

function normalizeAnswer(answer) {
  return String(answer || '').toUpperCase().replace(/[^A-F]/g, '')
}

function sanitizeAiText(text) {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .trim()
}

function getQuestionType(answer) {
  return normalizeAnswer(answer).length > 1 ? '多选题' : '单选题'
}

function countDuplicateQuestions(questions) {
  return questionUtils.findDuplicateQuestionIndexes(questions || []).length
}

function decorateQuestion(question, state) {
  if (!question) return null
  var ans = normalizeAnswer(question.answer)
  var opts = (question.options || []).map(function(raw, index) {
    var text = typeof raw === 'string' ? raw : (raw.text || '')
    var label = LETTERS[index]
    var selected = !!(state && state.selectedLabels && state.selectedLabels.indexOf(label) > -1)
    var isAnswer = ans.indexOf(label) > -1
    return {
      label: label,
      text: text,
      html: questionUtils.toMathHtml(text, { autoFormula: true }),
      _sel: selected,
      _correct: !!(state && state.submitted && isAnswer),
      _wrong: !!(state && state.submitted && selected && !isAnswer)
    }
  }).filter(function(item) { return item.text })
  var stem = stripAnswerMarkers(question.stem || '')
  var explanation = question.explanation || ''
  return {
    stem: stem,
    stemHtml: questionUtils.toMathHtml(stem, { autoFormula: true, displayMode: true }),
    answer: ans,
    knowledgePoint: question.knowledgePoint || '',
    explanation: explanation,
    explanationHtml: questionUtils.toMathHtml(explanation, { autoFormula: true }),
    id: question.id,
    order: question.order,
    sourceType: question.sourceType || '',
    sourceLabel: question.sourceLabel || (question.sourceType === 'original' ? '原题' : (question.sourceType === 'generated' ? 'AI生成' : '')),
    qtype: getQuestionType(ans),
    optionItems: opts
  }
}

function progressClass(current, total) {
  if (!total) return 'progress-0'
  var pct = Math.round(((current + 1) / total) * 100)
  if (pct >= 100) return 'progress-100'
  if (pct >= 75) return 'progress-75'
  if (pct >= 50) return 'progress-50'
  if (pct >= 25) return 'progress-25'
  return 'progress-10'
}

Page({
  data: {
    isQuizStarted: false,
    sortMode: 'sequential',
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    isSubmitted: false,
    isCorrect: false,
    explanationLoading: false,
    quizProgress: null,
    hasProgress: false,
    progressText: '0/0',
    progressClass: 'progress-0',
    hasSelection: false,
    currentBank: '',
    bankQuestionCount: 0,
    duplicateQuestionCount: 0,
    mascotSrc: PETS.thinking,
    mascotChatVisible: false,
    mascotGreeting: '你好呀，我是你的 AI 学习伙伴。答题时点我，我可以陪你复盘这道题。',
    mascotChatInput: '',
    mascotChatSending: false,
    mascotChatScrollTop: 0,
    mascotChatMessages: [],
    mascotChatPanelHeight: 48,
    mascotChatFullscreen: false,
    mascotChatDragging: false,
    mascotChatWindowHeight: 0,
    questionStates: {},
    touchStartX: 0,
    touchStartY: 0
  },

  onShow: function() {
    var allQuestions = (wx.getStorageSync('questions') || []).map(function(q) {
      q.stem = stripAnswerMarkers(q.stem || '')
      return q
    })
    var changed = false
    allQuestions = allQuestions.map(function(q, index) {
      var normalized = questionUtils.randomizeQuestionOptions(q, index)
      if (normalized._optionsRandomized && !q._optionsRandomized) changed = true
      return normalized
    })
    var currentBank = wx.getStorageSync('currentBank') || ''
    var questions = allQuestions
    if (currentBank) {
      questions = allQuestions.filter(function(q) {
        return (q.knowledgePoint || '') === currentBank
      })
    }
    if (changed) {
      wx.setStorageSync('questions', allQuestions)
      wx.removeStorageSync('quizProgress')
    }
    getApp().globalData.questions = allQuestions
    var progress = wx.getStorageSync('quizProgress')
    var hasProgress = !!(progress && progress.questionIds && progress.questionIds.length && progress.bankName === currentBank)
    if (!hasProgress) {
      progress = null
    }
    this.setData({
      questions: questions,
      quizProgress: progress,
      hasProgress: hasProgress,
      currentBank: currentBank || '全部题目',
      bankQuestionCount: questions.length,
      duplicateQuestionCount: countDuplicateQuestions(questions)
    })
  },

  getQuestionStateKey: function(question, index) {
    return String(question && question.id || 'question-' + index)
  },

  syncCurrentQuestion: function(index, questions, states) {
    questions = questions || this.data.questions
    states = states || this.data.questionStates
    var state = states[this.getQuestionStateKey(questions[index], index)] || null
    this.setData({
      currentIndex: index,
      currentQuestion: decorateQuestion(questions[index], state),
      isSubmitted: !!(state && state.submitted),
      isCorrect: !!(state && state.correct),
      hasSelection: !!(state && state.selectedLabels && state.selectedLabels.length),
      explanationLoading: false,
      progressText: (index + 1) + '/' + questions.length,
      progressClass: progressClass(index, questions.length),
      mascotSrc: state && state.submitted ? (state.correct ? PETS.happy : PETS.wrong) : (state && state.selectedLabels && state.selectedLabels.length ? PETS.waiting : PETS.thinking)
    })
  },

  captureCurrentQuestionState: function() {
    if (!this.data.currentQuestion) return this.data.questionStates || {}
    var states = Object.assign({}, this.data.questionStates || {})
    var key = this.getQuestionStateKey(this.data.questions[this.data.currentIndex], this.data.currentIndex)
    states[key] = {
      selectedLabels: (this.data.currentQuestion.optionItems || []).filter(function(item) { return item._sel }).map(function(item) { return item.label }),
      submitted: this.data.isSubmitted,
      correct: this.data.isCorrect
    }
    return states
  },

  toggleSortMode: function() {
    var next = this.data.sortMode === 'sequential' ? 'random' : 'sequential'
    this.setData({ sortMode: next })
  },

  startQuiz: function() {
    var qs = this.data.questions.slice()
    if (!qs.length) {
      wx.showToast({ title: '请先导入题库', icon: 'none' })
      return
    }
    if (this.data.sortMode === 'sequential') {
      qs.sort(function(a, b) { return (a.order || 0) - (b.order || 0) })
    } else {
      qs.sort(function() { return Math.random() - 0.5 })
    }
    var questionIds = qs.map(function(q) { return q.id })
    this.setData({
      isQuizStarted: true,
      questions: qs,
      isSubmitted: false,
      isCorrect: false,
      hasSelection: false,
      questionStates: {},
      quizProgress: {
        sortMode: this.data.sortMode,
        currentIndex: 0,
        bankName: wx.getStorageSync('currentBank') || '',
        questionIds: questionIds
      },
      hasProgress: true
    })
    this.saveProgress(0, qs)
    this.syncCurrentQuestion(0, qs)
  },

  goBack: function() {
    if (this.data.isQuizStarted) {
      var states = this.captureCurrentQuestionState()
      this.setData({ questionStates: states })
      this.saveProgress(this.data.currentIndex, this.data.questions, states)
    }
    wx.navigateBack()
  },

  stopQuiz: function() {
    this.setData({
      isQuizStarted: false,
      currentIndex: 0,
      currentQuestion: null,
      isSubmitted: false,
      isCorrect: false,
      hasSelection: false,
      hasProgress: false,
      quizProgress: null,
      questionStates: {}
    })
  },

  saveProgress: function(index, questions, states) {
    var progress = {
      sortMode: this.data.sortMode,
      currentIndex: index,
      bankName: wx.getStorageSync('currentBank') || '',
      questionIds: (questions || this.data.questions).map(function(q) { return q.id }),
      questionStates: states || this.data.questionStates || {}
    }
    wx.setStorageSync('quizProgress', progress)
    this.setData({ quizProgress: progress, hasProgress: true })
  },

  clearProgress: function() {
    wx.removeStorageSync('quizProgress')
    this.setData({ hasProgress: false, quizProgress: null })
  },

  openMascotChat: function() {
    var text = '你好呀，我在这里陪你答题。'
    if (this.data.isSubmitted) {
      text = this.data.isCorrect
        ? '这题答对啦，状态不错！可以继续下一题。'
        : '这题没关系，我们看一下解析，再接再厉。'
    } else if (this.data.hasSelection) {
      text = '已经选好啦，可以提交答案，我来帮你一起看结果。'
    }
    var messages = this.data.mascotChatMessages
    if (!messages.length) {
      messages = [this.createMascotMessage('assistant', text)]
    }
    this.setData({
      mascotChatVisible: true,
      mascotGreeting: text,
      mascotSrc: PETS.idle,
      mascotChatMessages: messages,
      mascotChatPanelHeight: 48,
      mascotChatFullscreen: false
    }, this.scrollMascotChatToBottom)
  },

  onMascotChatInput: function(e) {
    this.setData({ mascotChatInput: e.detail.value })
  },

  createMascotMessage: function(role, content, loading) {
    return {
      id: role + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      role: role,
      content: content,
      loading: !!loading
    }
  },

  getCurrentQuestionContext: function() {
    var q = this.data.currentQuestion || {}
    var selected = (q.optionItems || []).filter(function(o) { return o._sel }).map(function(o) { return o.label })
    return {
      stem: q.stem || '',
      qtype: q.qtype || '选择题',
      options: (q.optionItems || []).map(function(o) { return o.text }),
      answer: q.answer || '',
      explanation: q.explanation || '',
      selected: selected,
      isSubmitted: this.data.isSubmitted
    }
  },

  buildQuizChatMessages: function(nextUserText) {
    var history = this.data.mascotChatMessages.filter(function(msg) {
      return !msg.loading
    }).slice(-8).map(function(msg) {
      return { role: msg.role, content: msg.content }
    })
    history.push({ role: 'user', content: nextUserText })
    return history
  },

  buildQuizChatFallbackPrompt: function(nextUserText) {
    var q = this.getCurrentQuestionContext()
    var optionLines = (q.options || []).map(function(text, index) {
      return LETTERS[index] + '. ' + text
    }).join('\n')

    return [
      '我正在答一道选择题，请你作为学习助手，只围绕这道题回答。',
      '用户刚才的问题：' + nextUserText,
      '',
      '题型：' + q.qtype,
      '题干：' + (q.stem || '无'),
      '选项：',
      optionLines || '无',
      '正确答案：' + (q.answer || '未知'),
      '用户当前选择：' + ((q.selected || []).join('') || '未选择'),
      '是否已经提交：' + (q.isSubmitted ? '是' : '否'),
      '已有解析：' + (q.explanation || '暂无'),
      '',
      '回答要求：',
      '1. 如果用户问“给我提示”，不要直接说答案，只给思路。',
      '2. 如果用户问“讲讲这题”，说明考点、选项判断和易错点。'
    ].join('\n')
  },

  startMascotPanelDrag: function(e) {
    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      mascotChatDragging: true,
      mascotChatWindowHeight: info.windowHeight || 0
    })
    this.updateMascotPanelHeight(e)
  },

  dragMascotPanel: function(e) {
    if (!this.data.mascotChatDragging) return
    this.updateMascotPanelHeight(e)
  },

  endMascotPanelDrag: function() {
    this.setData({ mascotChatDragging: false })
  },

  updateMascotPanelHeight: function(e) {
    var touches = e.changedTouches || e.touches || []
    if (!touches.length) return

    var windowHeight = this.data.mascotChatWindowHeight
    if (!windowHeight) {
      var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      windowHeight = info.windowHeight || 0
    }
    if (!windowHeight) return

    var clientY = touches[0].clientY
    var height = Math.round(((windowHeight - clientY) / windowHeight) * 100)
    height = Math.max(38, Math.min(82, height))
    if (Math.abs(height - this.data.mascotChatPanelHeight) < 1) return
    this.setData({
      mascotChatPanelHeight: height,
      mascotChatFullscreen: false
    })
  },

  expandMascotChat: function() {
    this.setData({
      mascotChatPanelHeight: 100,
      mascotChatFullscreen: true
    }, this.scrollMascotChatToBottom)
  },

  shrinkMascotChat: function() {
    this.setData({
      mascotChatPanelHeight: 48,
      mascotChatFullscreen: false
    }, this.scrollMascotChatToBottom)
  },

  sendMascotChat: async function(text) {
    if (this.data.mascotChatSending) return
    text = String(text || this.data.mascotChatInput || '').trim()
    if (!text) {
      wx.showToast({ title: '请输入问题', icon: 'none' })
      return
    }

    var apiMessages = this.buildQuizChatMessages(text)
    var loadingMessage = this.createMascotMessage('assistant', '...', true)
    var loadingId = loadingMessage.id
    var messages = this.data.mascotChatMessages.concat([
      this.createMascotMessage('user', text),
      loadingMessage
    ])
    this.setData({
      mascotChatMessages: messages,
      mascotChatInput: '',
      mascotChatSending: true,
      mascotSrc: PETS.thinking
    }, this.scrollMascotChatToBottom)

    try {
      var res = await wx.cloud.callFunction({
        name: 'aiParse',
        data: {
          mode: 'quizChat',
          question: this.getCurrentQuestionContext(),
          messages: apiMessages
        }
      })
      var reply = sanitizeAiText((res.result && res.result.reply) || 'AI 服务暂时无法回复，请稍后再试')
      this.replaceMascotLoading(loadingId, reply)
    } catch (err) {
      console.error('quiz assistant quizChat failed', err)
      try {
        var fallbackRes = await wx.cloud.callFunction({
          name: 'aiParse',
          data: {
            mode: 'chat',
            messages: [
              {
                role: 'user',
                content: this.buildQuizChatFallbackPrompt(text)
              }
            ]
          }
        })
        var fallbackReply = sanitizeAiText((fallbackRes.result && fallbackRes.result.reply) || 'AI 服务暂时无法回复，请稍后再试')
        this.replaceMascotLoading(loadingId, fallbackReply)
      } catch (fallbackErr) {
        console.error('quiz assistant fallback chat failed', fallbackErr)
        this.replaceMascotLoading(loadingId, 'AI 服务暂时无法回复，请稍后再试')
      }
    }
  },

  sendMascotChatFromInput: function() {
    this.sendMascotChat()
  },

  useMascotQuick: function(e) {
    var text = e.currentTarget.dataset.text
    this.sendMascotChat(text)
  },

  replaceMascotLoading: function(loadingId, text) {
    var messages = this.data.mascotChatMessages.map(function(msg) {
      if (msg.id === loadingId) {
        return {
          id: msg.id,
          role: msg.role,
          content: text,
          loading: false
        }
      }
      return msg
    })
    this.setData({
      mascotChatMessages: messages,
      mascotChatSending: false,
      mascotSrc: this.data.isSubmitted ? (this.data.isCorrect ? PETS.happy : PETS.wrong) : (this.data.hasSelection ? PETS.waiting : PETS.thinking)
    }, this.scrollMascotChatToBottom)
  },

  scrollMascotChatToBottom: function() {
    this.setData({ mascotChatScrollTop: this.data.mascotChatScrollTop + 100000 })
  },

  closeMascotChat: function() {
    this.setData({
      mascotChatVisible: false,
      mascotChatPanelHeight: 48,
      mascotChatFullscreen: false,
      mascotSrc: this.data.isSubmitted ? (this.data.isCorrect ? PETS.happy : PETS.wrong) : (this.data.hasSelection ? PETS.waiting : PETS.thinking)
    })
  },

  noop: function() {},

  resumeQuiz: function() {
    var progress = this.data.quizProgress
    if (!progress || !progress.questionIds) return
    var allQuestions = this.data.questions
    var idMap = {}
    allQuestions.forEach(function(q) { idMap[q.id] = q })
    var qs = progress.questionIds.map(function(id) { return idMap[id] }).filter(function(q) { return q })
    if (!qs.length) {
      this.clearProgress()
      wx.showToast({ title: '题目已变化，请重新开始', icon: 'none' })
      return
    }
    this.setData({
      isQuizStarted: true,
      sortMode: progress.sortMode,
      questions: qs,
      isSubmitted: false,
      isCorrect: false,
      hasSelection: false,
      questionStates: progress.questionStates || {}
    })
    this.syncCurrentQuestion(progress.currentIndex, qs, progress.questionStates || {})
  },

  toggleAnswer: function(e) {
    if (this.data.isSubmitted) return
    var val = e.currentTarget.dataset.value
    var isMulti = this.data.currentQuestion.qtype === '多选题'
    var items = this.data.currentQuestion.optionItems

    if (isMulti) {
      items = items.map(function(o) {
        if (o.label === val) o._sel = !o._sel
        return o
      })
    } else {
      items = items.map(function(o) {
        o._sel = o.label === val
        return o
      })
    }
    var hasSelection = items.some(function(o) { return o._sel })
    this.setData({
      'currentQuestion.optionItems': items,
      hasSelection: hasSelection,
      mascotSrc: hasSelection ? PETS.waiting : PETS.thinking
    })
  },

  submitAnswer: function() {
    var items = this.data.currentQuestion.optionItems
    var hasSel = items.some(function(o) { return o._sel })
    if (!hasSel) {
      wx.showToast({ title: '请先选择一个选项', icon: 'none' })
      return
    }

    var cur = this.data.currentQuestion
    var given = items.filter(function(o) { return o._sel }).map(function(o) { return o.label }).sort().join('')
    var expected = normalizeAnswer(cur.answer).split('').sort().join('')
    var correct = given === expected
    var answerLabels = normalizeAnswer(cur.answer).split('')

    items = items.map(function(o) {
      var isAnswer = answerLabels.indexOf(o.label) > -1
      o._correct = isAnswer
      o._wrong = o._sel && !isAnswer
      return o
    })

    this.setData({
      'currentQuestion.optionItems': items,
      isSubmitted: true,
      isCorrect: correct,
      mascotSrc: correct ? PETS.happy : PETS.wrong
    })
    var states = this.captureCurrentQuestionState()
    this.setData({ questionStates: states })
    this.saveProgress(this.data.currentIndex, this.data.questions, states)

    if (correct) {
      this.markQuestionStatus('mastered')
    } else {
      this.markQuestionStatus('wrong')
      this.saveToWrongBook()
      this.fetchExplanation()
    }
  },

  markAsMastered: function() {
    if (this.data.isSubmitted) return
    this.markQuestionStatus('mastered')
    var nextIndex = this.data.currentIndex + 1
    if (nextIndex >= this.data.questions.length) {
      this.finishQuiz()
      return
    }
    this.saveProgress(nextIndex)
    this.setData({ isSubmitted: false, isCorrect: false, hasSelection: false, mascotSrc: PETS.thinking })
    this.syncCurrentQuestion(nextIndex)
  },

  markAsDontKnow: function() {
    if (this.data.isSubmitted) return
    var items = this.data.currentQuestion.optionItems
    var answerLabels = normalizeAnswer(this.data.currentQuestion.answer).split('')
    items = items.map(function(o) {
      o._correct = answerLabels.indexOf(o.label) > -1
      o._sel = false
      return o
    })
    this.setData({
      'currentQuestion.optionItems': items,
      isSubmitted: true,
      isCorrect: false,
      mascotSrc: PETS.review
    })
    var states = this.captureCurrentQuestionState()
    this.setData({ questionStates: states })
    this.saveProgress(this.data.currentIndex, this.data.questions, states)
    this.markQuestionStatus('dontknow')
    this.saveToWrongBook()
    this.fetchExplanation()
  },

  markQuestionStatus: function(status) {
    var id = this.data.currentQuestion.id
    var questions = wx.getStorageSync('questions') || []
    var qs = this.data.questions
    questions = questions.map(function(q) { if (q.id === id) q.status = status; return q })
    qs = qs.map(function(q) { if (q.id === id) q.status = status; return q })
    wx.setStorageSync('questions', questions)
    getApp().globalData.questions = questions
    this.setData({ questions: qs })
  },

  saveToWrongBook: function() {
    var wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    var cur = this.data.currentQuestion
    var exists = wrongQuestions.findIndex(function(w) { return w.id === cur.id })
    if (exists === -1) {
      var stemKey = (cur.stem || '').replace(/\s+/g, '')
      var optsKey = (cur.optionItems || []).map(function(o) { return o.text.replace(/\s+/g, '') }).join('|')
      exists = wrongQuestions.findIndex(function(w) {
        var wStem = (w.stem || '').replace(/\s+/g, '')
        var wOpts = (w.options || []).map(function(t) { return (t || '').replace(/\s+/g, '') }).join('|')
        return wStem === stemKey && wOpts === optsKey
      })
    }
    if (exists === -1) {
      wrongQuestions.unshift({
        id: cur.id,
        stem: cur.stem,
        options: cur.optionItems ? cur.optionItems.map(function(o) { return o.text }) : [],
        answer: cur.answer,
        explanation: cur.explanation,
        knowledgePoint: cur.knowledgePoint,
        sourceType: cur.sourceType,
        sourceLabel: cur.sourceLabel,
        wrongTime: new Date().toISOString(),
        wrongCount: 1
      })
    } else {
      wrongQuestions[exists].wrongCount = (wrongQuestions[exists].wrongCount || 1) + 1
      wrongQuestions[exists].wrongTime = new Date().toISOString()
      wrongQuestions[exists].id = cur.id
      wrongQuestions[exists].stem = cur.stem
      wrongQuestions[exists].options = cur.optionItems ? cur.optionItems.map(function(o) { return o.text }) : []
      wrongQuestions[exists].answer = cur.answer
      wrongQuestions[exists].explanation = cur.explanation
      wrongQuestions[exists].knowledgePoint = cur.knowledgePoint
      wrongQuestions[exists].sourceType = cur.sourceType
      wrongQuestions[exists].sourceLabel = cur.sourceLabel
    }
    wx.setStorageSync('wrongQuestions', wrongQuestions)
    getApp().globalData.wrongQuestions = wrongQuestions
  },

  fetchExplanation: async function() {
    var q = this.data.currentQuestion
    if (q.explanation) return
    this.setData({ explanationLoading: true })
    try {
      var res = await wx.cloud.callFunction({
        name: 'aiParse',
        data: {
          mode: 'explain',
          question: {
            stem: q.stem,
            options: q.optionItems.map(function(o) { return o.text }),
            answer: q.answer
          }
        }
      })
      if (res.result && res.result.success) {
        var explanation = String(res.result.explanation || '')
        if (this.data.currentQuestion && this.data.currentQuestion.id === q.id) {
          this.setData({
            'currentQuestion.explanation': explanation,
            'currentQuestion.explanationHtml': questionUtils.toMathHtml(explanation, { autoFormula: true }),
            explanationLoading: false
          })
        }
        var questions = wx.getStorageSync('questions') || []
        questions = questions.map(function(qq) {
          if (qq.id === q.id) qq.explanation = explanation
          return qq
        })
        wx.setStorageSync('questions', questions)
        getApp().globalData.questions = questions
      } else {
        if (this.data.currentQuestion && this.data.currentQuestion.id === q.id) {
          this.setData({ explanationLoading: false })
        }
      }
    } catch (e) {
      if (this.data.currentQuestion && this.data.currentQuestion.id === q.id) {
        this.setData({ explanationLoading: false })
      }
    }
  },

  goToQuestion: function(index) {
    if (index < 0 || index >= this.data.questions.length || index === this.data.currentIndex) return
    var states = this.captureCurrentQuestionState()
    this.setData({ questionStates: states })
    this.saveProgress(index, this.data.questions, states)
    this.syncCurrentQuestion(index, this.data.questions, states)
  },

  previousQuestion: function() {
    this.goToQuestion(this.data.currentIndex - 1)
  },

  nextQuestion: function() {
    var nextIndex = this.data.currentIndex + 1
    if (nextIndex >= this.data.questions.length) {
      if (this.data.isSubmitted) this.finishQuiz()
      return
    }
    this.goToQuestion(nextIndex)
  },

  onQuestionTouchStart: function(e) {
    var touches = e.touches || []
    if (!touches.length) return
    this.setData({ touchStartX: touches[0].clientX, touchStartY: touches[0].clientY })
  },

  onQuestionTouchEnd: function(e) {
    var touches = e.changedTouches || []
    if (!touches.length) return
    var dx = touches[0].clientX - this.data.touchStartX
    var dy = touches[0].clientY - this.data.touchStartY
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    if (dx < 0) this.nextQuestion()
    else this.previousQuestion()
  },

  finishQuiz: function() {
    var that = this
    wx.showModal({
      title: '测评完成',
      content: '你已完成本轮所有题目。',
      confirmText: '确定',
      success: function() {
        that.clearProgress()
        that.stopQuiz()
      }
    })
  },

  goToImport: function() {
    wx.switchTab({ url: '/pages/import/import' })
  }
})
