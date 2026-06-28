Page({
  data: {
    questions: [],
    showAddForm: false,
    optionLabels: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }],
    newQuestion: { stem: '', options: ['', '', '', ''], answer: '', explanation: '', knowledgePoint: '' }
  },
  onShow() { this.loadQuestions() },
  loadQuestions() { this.setData({ questions: wx.getStorageSync('questions') || [] }) },
  showForm() { this.setData({ showAddForm: true }) },
  hideForm() { this.setData({ showAddForm: false, newQuestion: { stem: '', options: ['', '', '', ''], answer: '', explanation: '', knowledgePoint: '' } }) },
  onStemInput(e) { this.setData({ 'newQuestion.stem': e.detail.value }) },
  onOptionInput(e) {
    const index = e.currentTarget.dataset.index !== undefined ? e.currentTarget.dataset.index : e.target.dataset.index
    this.setData({ [`newQuestion.options[${index}]`]: e.detail.value })
  },
  onAnswerInput(e) { this.setData({ 'newQuestion.answer': e.detail.value.toUpperCase() }) },
  onExplanationInput(e) { this.setData({ 'newQuestion.explanation': e.detail.value }) },
  onKnowledgeInput(e) { this.setData({ 'newQuestion.knowledgePoint': e.detail.value }) },
  saveQuestion() {
    const q = this.data.newQuestion
    if (!q.stem.trim() || !q.answer.trim()) {
      wx.showToast({ title: '请填写题干和答案', icon: 'none' })
      return
    }
    const questions = wx.getStorageSync('questions') || []
    questions.unshift({ ...q, id: Date.now().toString(), wrongCount: 0, status: 'new' })
    wx.setStorageSync('questions', questions)
    getApp().globalData.questions = questions
    wx.showToast({ title: '添加成功', icon: 'success' })
    this.hideForm()
    this.loadQuestions()
  }
})
