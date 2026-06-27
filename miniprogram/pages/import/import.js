Page({
  data: {
    questions: [],
    showAddForm: false,
    newQuestion: {
      stem: '',
      options: ['', '', '', ''],
      answer: '',
      explanation: '',
      knowledgePoint: ''
    }
  },

  onShow() {
    this.loadQuestions()
  },

  loadQuestions() {
    const questions = wx.getStorageSync('questions') || []
    this.setData({ questions })
  },

  showForm() {
    this.setData({ showAddForm: true })
  },

  hideForm() {
    this.setData({
      showAddForm: false,
      newQuestion: {
        stem: '',
        options: ['', '', '', ''],
        answer: '',
        explanation: '',
        knowledgePoint: ''
      }
    })
  },

  onStemInput(e) {
    this.setData({ 'newQuestion.stem': e.detail.value })
  },

  onOptionInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ [`newQuestion.options[${index}]`]: e.detail.value })
  },

  onAnswerInput(e) {
    this.setData({ 'newQuestion.answer': e.detail.value })
  },

  onExplanationInput(e) {
    this.setData({ 'newQuestion.explanation': e.detail.value })
  },

  onKnowledgeInput(e) {
    this.setData({ 'newQuestion.knowledgePoint': e.detail.value })
  },

  saveQuestion() {
    const q = this.data.newQuestion
    if (!q.stem || !q.answer) {
      wx.showToast({ title: '请填写题干和答案', icon: 'none' })
      return
    }

    const questions = wx.getStorageSync('questions') || []
    q.id = Date.now().toString()
    q.wrongCount = 0
    q.status = 'new'
    questions.push(q)
    wx.setStorageSync('questions', questions)

    const app = getApp()
    app.globalData.questions = questions

    wx.showToast({ title: '添加成功', icon: 'success' })
    this.hideForm()
    this.loadQuestions()
  },

  formatTime(ts) {
    const d = new Date(ts)
    return `${d.getMonth()+1}/${d.getDate()}`
  }
})
