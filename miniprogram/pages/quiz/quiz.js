var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function getQuestionType(answer) {
  var ans = String(answer || '').replace(/[^A-Z]/g, '')
  if (ans.length > 1) return '多选题'
  return '单选题'
}

function decorateQuestion(question) {
  if (!question) return null
  var ans = String(question.answer || '').toUpperCase()
  var opts = (question.options || []).map(function(text, index) {
    return { label: LETTERS[index], text: text, _sel: false, _correct: false, _wrong: false }
  }).filter(function(item) { return item.text })
  return {
    stem: question.stem,
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
    progressText: '0/0',
    progressClass: 'progress-0'
  },

  onShow: function() {
    this.setData({ questions: wx.getStorageSync('questions') || [] })
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
    this.setData({
      isQuizStarted: true,
      questions: qs,
      isSubmitted: false,
      isCorrect: false
    })
    this.syncCurrentQuestion(0, qs)
  },

  goBack: function() {
    this.stopQuiz()
    wx.navigateBack()
  },

  stopQuiz: function() {
    this.setData({
      isQuizStarted: false, currentIndex: 0, currentQuestion: null,
      isSubmitted: false, isCorrect: false
    })
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
    }
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
    }
    wx.setStorageSync('wrongQuestions', wrongQuestions)
    getApp().globalData.wrongQuestions = wrongQuestions
  },

  nextQuestion: function() {
    var nextIndex = this.data.currentIndex + 1
    if (nextIndex >= this.data.questions.length) {
      wx.showModal({
        title: '测评完成',
        content: '你已完成本轮所有题目。',
        confirmText: '确定',
        success: this.stopQuiz.bind(this)
      })
      return
    }
    this.setData({ isSubmitted: false, isCorrect: false })
    this.syncCurrentQuestion(nextIndex)
  },

  goToImport: function() { wx.switchTab({ url: '/pages/import/import' }) }
})
