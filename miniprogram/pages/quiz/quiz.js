Page({
  data: {
    isQuizStarted: false,
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    confidence: '',       // 'sure' | 'unsure' | 'guess'
    selectedAnswer: '',
    isSubmitted: false,
    isCorrect: false,
    showExplanation: false,
    progress: { done: 0, total: 0 }
  },

  onShow() {
    this.loadQuestions()
  },

  loadQuestions() {
    const questions = wx.getStorageSync('questions') || []
    if (questions.length > 0 && !this.data.isQuizStarted) {
      this.setData({
        questions,
        currentQuestion: questions[0],
        progress: { done: 0, total: questions.length }
      })
    }
  },

  startQuiz() {
    const questions = this.data.questions
    if (questions.length === 0) {
      wx.showToast({ title: '请先导入题库', icon: 'none' })
      return
    }
    this.setData({
      isQuizStarted: true,
      currentIndex: 0,
      currentQuestion: questions[0],
      progress: { done: 0, total: questions.length },
      confidence: '',
      selectedAnswer: '',
      isSubmitted: false,
      showExplanation: false
    })
  },

  // 选择自信度
  selectConfidence(e) {
    this.setData({ confidence: e.currentTarget.dataset.value })
  },

  // 选择答案
  selectAnswer(e) {
    if (this.data.isSubmitted) return
    this.setData({ selectedAnswer: e.currentTarget.dataset.value })
  },

  // 提交答案
  submitAnswer() {
    if (!this.data.confidence) {
      wx.showToast({ title: '请先选择自信度', icon: 'none' })
      return
    }
    if (!this.data.selectedAnswer) {
      wx.showToast({ title: '请选择答案', icon: 'none' })
      return
    }

    const correct = this.data.selectedAnswer === this.data.currentQuestion.answer

    // 认知冲突检测：高自信但答错
    const conflict = this.data.confidence === 'sure' && !correct

    this.setData({
      isSubmitted: true,
      isCorrect: correct,
      conflict: conflict
    })

    // 更新错题本
    if (!correct) {
      const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
      const q = this.data.currentQuestion
      q.wrongTime = new Date().toISOString()
      q.confidenceWhenWrong = this.data.confidence
      const exists = wrongQuestions.find(w => w.id === q.id)
      if (!exists) {
        q.wrongCount = (q.wrongCount || 0) + 1
        wrongQuestions.unshift(q)
        wx.setStorageSync('wrongQuestions', wrongQuestions)
        const app = getApp()
        app.globalData.wrongQuestions = wrongQuestions
      }
    }
  },

  // 下一题
  nextQuestion() {
    const nextIndex = this.data.currentIndex + 1
    if (nextIndex >= this.data.questions.length) {
      wx.showModal({
        title: '测评完成',
        content: '恭喜！你已完成本轮所有题目。',
        confirmText: '返回首页',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/index/index' })
          }
        }
      })
      return
    }

    this.setData({
      currentIndex: nextIndex,
      currentQuestion: this.data.questions[nextIndex],
      confidence: '',
      selectedAnswer: '',
      isSubmitted: false,
      isCorrect: false,
      showExplanation: false,
      conflict: false,
      progress: { ...this.data.progress, done: nextIndex }
    })
  },

  toggleExplanation() {
    this.setData({ showExplanation: !this.data.showExplanation })
  }
})
