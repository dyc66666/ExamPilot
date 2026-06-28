const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
function decorateQuestion(question) {
  if (!question) return null
  return { ...question, answer: String(question.answer || '').toUpperCase(), optionItems: (question.options || []).map((text, index) => ({ label: LETTERS[index], text })).filter(item => item.text) }
}
function progressClass(current, total) {
  if (!total) return 'progress-0'
  const percent = Math.round(((current + 1) / total) * 100)
  if (percent >= 100) return 'progress-100'
  if (percent >= 75) return 'progress-75'
  if (percent >= 50) return 'progress-50'
  if (percent >= 25) return 'progress-25'
  return 'progress-10'
}
Page({
  data: { isQuizStarted: false, questions: [], currentIndex: 0, currentQuestion: null, confidence: '', selectedAnswer: '', isSubmitted: false, isCorrect: false, progressText: '0/0', progressClass: 'progress-0', nextButtonText: '下一题' },
  onShow() { this.loadQuestions() },
  loadQuestions() { this.setData({ questions: wx.getStorageSync('questions') || [] }) },
  syncCurrentQuestion(index, questions = this.data.questions) { this.setData({ currentIndex: index, currentQuestion: decorateQuestion(questions[index]), progressText: `${index + 1}/${questions.length}`, progressClass: progressClass(index, questions.length), nextButtonText: index + 1 < questions.length ? '下一题' : '完成测评' }) },
  startQuiz() {
    if (!this.data.questions.length) { wx.showToast({ title: '请先导入题库', icon: 'none' }); return }
    this.setData({ isQuizStarted: true, confidence: '', selectedAnswer: '', isSubmitted: false, isCorrect: false })
    this.syncCurrentQuestion(0)
  },
  stopQuiz() { this.setData({ isQuizStarted: false, currentIndex: 0, currentQuestion: null, confidence: '', selectedAnswer: '', isSubmitted: false, isCorrect: false }) },
  selectConfidence(e) { if (!this.data.isSubmitted) this.setData({ confidence: e.currentTarget.dataset.value }) },
  selectAnswer(e) { if (!this.data.isSubmitted) this.setData({ selectedAnswer: e.currentTarget.dataset.value }) },
  handlePrimaryAction() { this.data.isSubmitted ? this.nextQuestion() : this.submitAnswer() },
  submitAnswer() {
    if (!this.data.selectedAnswer || !this.data.confidence) return
    const correct = this.data.selectedAnswer === this.data.currentQuestion.answer
    this.setData({ isSubmitted: true, isCorrect: correct })
    if (!correct) this.saveWrongQuestion()
  },
  saveWrongQuestion() {
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    const current = { ...this.data.currentQuestion, wrongTime: new Date().toISOString(), confidenceWhenWrong: this.data.confidence, wrongCount: (this.data.currentQuestion.wrongCount || 0) + 1 }
    delete current.optionItems
    const nextWrongQuestions = wrongQuestions.filter(item => item.id !== current.id)
    nextWrongQuestions.unshift(current)
    wx.setStorageSync('wrongQuestions', nextWrongQuestions)
    getApp().globalData.wrongQuestions = nextWrongQuestions
  },
  nextQuestion() {
    const nextIndex = this.data.currentIndex + 1
    if (nextIndex >= this.data.questions.length) { wx.showToast({ title: '测评完成', icon: 'success' }); this.stopQuiz(); return }
    this.setData({ confidence: '', selectedAnswer: '', isSubmitted: false, isCorrect: false })
    this.syncCurrentQuestion(nextIndex)
  },
  goToImport() { wx.switchTab({ url: '/pages/import/import' }) }
})
