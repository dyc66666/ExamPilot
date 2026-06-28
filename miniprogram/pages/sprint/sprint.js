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
    questions: [],
    activeQuestions: [],
    currentIndex: 0,
    currentQuestion: null,
    isSubmitted: false,
    isCorrect: false,
    explanationLoading: false,
    remainingCount: 0,
    progressText: '0/0',
    progressClass: 'progress-0',
    isStarted: false,
    selectedMode: '60',
    currentModeTitle: '60min 强化模式',
    modeCards: [
      { value: '30', title: '30min 冲刺模式', desc: '只做最薄弱题和高频失误题', effect: '10-15%', tone: 'green', icon: '轻' },
      { value: '60', title: '60min 强化模式', desc: '重点突破错题成因', effect: '20-30%', tone: 'blue', icon: '中' },
      { value: '120', title: '120min 全面模式', desc: '全面复习、重扎根基', effect: '30-40%', tone: 'purple', icon: '强' }
    ]
  },

  onLoad: function() {
    this.loadWrongQuestions()
  },

  onShow: function() {
    if (!this.data.isStarted) this.loadWrongQuestions()
  },

  loadWrongQuestions: function() {
    var questions = (wx.getStorageSync('wrongQuestions') || []).map(function(q) {
      q.stem = stripAnswerMarkers(q.stem || '')
      if (q.options && q.options.length) {
        q.options = q.options.map(function(o) { return typeof o === 'string' ? o : (o.text || '') }).filter(function(t) { return t })
      }
      return q
    })
    wx.setStorageSync('wrongQuestions', questions)
    getApp().globalData.wrongQuestions = questions
    this.setData({ questions: questions, remainingCount: questions.length })
  },

  selectMode: function(e) {
    this.setData({ selectedMode: e.currentTarget.dataset.value })
  },

  startSprint: function() {
    if (!this.data.questions.length) {
      wx.showToast({ title: '暂无可冲刺错题', icon: 'none' })
      return
    }
    var selected = this.data.modeCards.find(function(item) { return item.value === this.data.selectedMode }, this)
    var shuffled = [].concat(this.data.questions).sort(function() { return Math.random() - 0.5 })
    this.setData({
      activeQuestions: shuffled,
      isStarted: true,
      currentModeTitle: selected ? selected.title : '错题冲刺',
      currentIndex: 0,
      isSubmitted: false,
      isCorrect: false
    })
    this.syncCurrentQuestion(0, shuffled)
  },

  syncCurrentQuestion: function(index, questions) {
    questions = questions || this.data.activeQuestions
    var total = questions.length
    this.setData({
      currentIndex: index,
      currentQuestion: decorateQuestion(questions[index]),
      remainingCount: Math.max(total - index, 0),
      progressText: (index + 1) + '/' + total,
      progressClass: progressClass(index, total)
    })
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
      this.removeFromWrongBook(cur.id)
    } else {
      this.markQuestionStatus('wrong')
      this.fetchExplanation()
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
    this.fetchExplanation()
  },

  markQuestionStatus: function(status) {
    var id = this.data.currentQuestion.id
    var questions = wx.getStorageSync('wrongQuestions') || []
    var active = this.data.activeQuestions
    questions = questions.map(function(q) { if (q.id === id) q.status = status; return q })
    active = active.map(function(q) { if (q.id === id) q.status = status; return q })
    wx.setStorageSync('wrongQuestions', questions)
    getApp().globalData.wrongQuestions = questions
    this.setData({ activeQuestions: active })
  },

  removeFromWrongBook: function(id) {
    var wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    wrongQuestions = wrongQuestions.filter(function(w) { return w.id !== id })
    wx.setStorageSync('wrongQuestions', wrongQuestions)
    getApp().globalData.wrongQuestions = wrongQuestions
    this.setData({ questions: wrongQuestions })
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
        var questions = wx.getStorageSync('wrongQuestions') || []
        questions = questions.map(function(qq) {
          if (qq.id === q.id) qq.explanation = explanation
          return qq
        })
        wx.setStorageSync('wrongQuestions', questions)
        getApp().globalData.wrongQuestions = questions
      } else {
        this.setData({ explanationLoading: false })
      }
    } catch(e) {
      this.setData({ explanationLoading: false })
    }
  },

  nextQuestion: function() {
    var nextIndex = this.data.currentIndex + 1
    if (nextIndex >= this.data.activeQuestions.length) {
      var that = this
      wx.showModal({
        title: '冲刺完成',
        content: '你已完成本轮所有错题。',
        confirmText: '确定',
        success: function() { that.stopSprint() }
      })
      return
    }
    this.setData({ isSubmitted: false, isCorrect: false, explanationLoading: false })
    this.syncCurrentQuestion(nextIndex)
  },

  stopSprint: function() {
    this.setData({
      isStarted: false, activeQuestions: [], currentIndex: 0,
      currentQuestion: null, isSubmitted: false, isCorrect: false,
      progressText: '0/0', progressClass: 'progress-0'
    })
    this.loadWrongQuestions()
  },

  goBack: function() {
    this.stopSprint()
    wx.navigateBack()
  }
})
