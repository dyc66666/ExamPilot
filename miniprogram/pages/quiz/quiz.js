var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function stripAnswerMarkers(stem) {
  var s = stem
  s = s.replace(/（[A-E]+）/g, '')
  s = s.replace(/\([A-E]+\)/g, '')
  s = s.replace(/【[A-E]+】/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

function getQuestionType(answer) {
  var ans = String(answer || '').replace(/[^A-Z]/g, '')
  if (ans.length > 1) return '多选题'
  return '单选题'
}

function decorateQuestion(question) {
  if (!question) return null
  var ans = String(question.answer || '').toUpperCase()
  var opts = (question.options || []).map(function(raw, index) {
    var text = typeof raw === 'string' ? raw : (raw.text || '')
    return { label: LETTERS[index], text: text, _sel: false, _correct: false, _wrong: false }
  }).filter(function(item) { return item.text })
  return {
    stem: stripAnswerMarkers(question.stem || ''),
    answer: ans,
    knowledgePoint: question.knowledgePoint || '',
    explanation: question.explanation || '',
    id: question.id,
    order: question.order,
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
    progressClass: 'progress-0'
  },

  onShow: function() {
    var questions = (wx.getStorageSync('questions') || []).map(function(q) {
      q.stem = stripAnswerMarkers(q.stem || '')
      return q
    })
    wx.setStorageSync('questions', questions)
    getApp().globalData.questions = questions
    var progress = wx.getStorageSync('quizProgress')
    var hasProgress = !!(progress && progress.questionIds && progress.questionIds.length)
    this.setData({ questions: questions, quizProgress: progress, hasProgress: hasProgress })
  },

  syncCurrentQuestion: function(index, questions) {
    questions = questions || this.data.questions
    this.setData({
      currentIndex: index,
      currentQuestion: decorateQuestion(questions[index]),
      progressText: (index + 1) + '/' + questions.length,
      progressClass: progressClass(index, questions.length)
    })
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
      quizProgress: { sortMode: this.data.sortMode, currentIndex: 0, questionIds: questionIds },
      hasProgress: true
    })
    this.saveProgress(0, qs)
    this.syncCurrentQuestion(0, qs)
  },

  goBack: function() {
    if (this.data.isQuizStarted) {
      this.saveProgress(this.data.currentIndex, this.data.questions)
    }
    wx.navigateBack()
  },

  stopQuiz: function() {
    this.setData({
      isQuizStarted: false, currentIndex: 0, currentQuestion: null,
      isSubmitted: false, isCorrect: false, hasProgress: false, quizProgress: null
    })
  },

  saveProgress: function(index, questions) {
    var progress = {
      sortMode: this.data.sortMode,
      currentIndex: index,
      questionIds: (questions || this.data.questions).map(function(q) { return q.id })
    }
    wx.setStorageSync('quizProgress', progress)
    this.setData({ quizProgress: progress, hasProgress: true })
  },

  clearProgress: function() {
    wx.removeStorageSync('quizProgress')
    this.setData({ hasProgress: false, quizProgress: null })
  },

  resumeQuiz: function() {
    var progress = this.data.quizProgress
    if (!progress || !progress.questionIds) return
    var allQuestions = this.data.questions
    var idMap = {}
    allQuestions.forEach(function(q) { idMap[q.id] = q })
    // 按保存的顺序重建题目列表，过滤已删除的
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
      isCorrect: false
    })
    this.syncCurrentQuestion(progress.currentIndex, qs)
  },

  // 点击选项：直接修改 optionItems 里的 _sel 标记
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
    this.setData({ 'currentQuestion.optionItems': items })
  },

  submitAnswer: function() {
    var items = this.data.currentQuestion.optionItems
    var hasSel = items.some(function(o) { return o._sel })
    if (!hasSel) return

    var cur = this.data.currentQuestion
    var given = items.filter(function(o) { return o._sel }).map(function(o) { return o.label }).sort().join('')
    var expected = cur.answer.replace(/[^A-Z]/g, '').split('').sort().join('')
    var correct = given === expected
    var answerLabels = cur.answer.replace(/[^A-Z]/g, '').split('')

    // 标记每个选项
    items = items.map(function(o) {
      o._correct = !correct && answerLabels.indexOf(o.label) > -1
      o._wrong = correct ? false : o._sel
      return o
    })

    this.setData({
      'currentQuestion.optionItems': items,
      isSubmitted: true,
      isCorrect: correct
    })

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
      var that = this
      wx.showModal({
        title: '测评完成',
        content: '你已完成本轮所有题目。',
        confirmText: '确定',
        success: function() { that.clearProgress(); that.stopQuiz() }
      })
      return
    }
    this.saveProgress(nextIndex)
    this.setData({ isSubmitted: false, isCorrect: false })
    this.syncCurrentQuestion(nextIndex)
  },

  markAsDontKnow: function() {
    if (this.data.isSubmitted) return
    var items = this.data.currentQuestion.optionItems
    var answerLabels = this.data.currentQuestion.answer.replace(/[^A-Z]/g, '').split('')
    items = items.map(function(o) {
      o._correct = answerLabels.indexOf(o.label) > -1
      o._sel = false
      return o
    })
    this.setData({
      'currentQuestion.optionItems': items,
      isSubmitted: true,
      isCorrect: false
    })
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
    // 先按ID查
    var exists = wrongQuestions.findIndex(function(w) { return w.id === cur.id })
    if (exists === -1) {
      // 再按题干+选项完全一致去重
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
        id: cur.id, stem: cur.stem,
        options: cur.optionItems ? cur.optionItems.map(function(o) { return o.text }) : [],
        answer: cur.answer, explanation: cur.explanation,
        knowledgePoint: cur.knowledgePoint,
        wrongTime: new Date().toISOString(), wrongCount: 1
      })
    } else {
      wrongQuestions[exists].wrongCount = (wrongQuestions[exists].wrongCount || 1) + 1
      wrongQuestions[exists].wrongTime = new Date().toISOString()
      // 用最新的题目数据更新（可能被重新导入过）
      wrongQuestions[exists].id = cur.id
      wrongQuestions[exists].stem = cur.stem
      wrongQuestions[exists].options = cur.optionItems ? cur.optionItems.map(function(o) { return o.text }) : []
      wrongQuestions[exists].answer = cur.answer
      wrongQuestions[exists].explanation = cur.explanation
      wrongQuestions[exists].knowledgePoint = cur.knowledgePoint
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
        var explanation = res.result.explanation
        this.setData({ 'currentQuestion.explanation': explanation, explanationLoading: false })
        var questions = wx.getStorageSync('questions') || []
        questions = questions.map(function(qq) {
          if (qq.id === q.id) qq.explanation = explanation
          return qq
        })
        wx.setStorageSync('questions', questions)
        getApp().globalData.questions = questions
      } else {
        this.setData({ explanationLoading: false })
      }
    } catch(e) {
      this.setData({ explanationLoading: false })
    }
  },

  nextQuestion: function() {
    var nextIndex = this.data.currentIndex + 1
    if (nextIndex >= this.data.questions.length) {
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
      return
    }
    this.saveProgress(nextIndex)
    this.setData({ isSubmitted: false, isCorrect: false })
    this.syncCurrentQuestion(nextIndex)
  },

  goToImport: function() { wx.switchTab({ url: '/pages/import/import' }) }
})
