Page({
  data: {
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    selectedAnswer: '',
    isSubmitted: false,
    isCorrect: false,
    remainingCount: 0,
    progress: 0
  },

  onLoad() {
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    if (wrongQuestions.length === 0) {
      wx.showToast({ title: '没有待冲刺的错题', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    // 随机打乱错题
    const shuffled = [...wrongQuestions].sort(() => Math.random() - 0.5)
    this.setData({
      questions: shuffled,
      currentQuestion: shuffled[0],
      remainingCount: shuffled.length,
      progress: 0
    })
  },

  selectAnswer(e) {
    if (this.data.isSubmitted) return
    this.setData({ selectedAnswer: e.currentTarget.dataset.value })
  },

  submitAnswer() {
    if (!this.data.selectedAnswer) {
      wx.showToast({ title: '请选择答案', icon: 'none' })
      return
    }

    const correct = this.data.selectedAnswer === this.data.currentQuestion.answer
    this.setData({ isSubmitted: true, isCorrect: correct })

    if (correct) {
      // 答对：从错题本移除
      const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
      const updated = wrongQuestions.filter(w => w.id !== this.data.currentQuestion.id)
      wx.setStorageSync('wrongQuestions', updated)

      const app = getApp()
      app.globalData.wrongQuestions = updated
    }
  },

  nextQuestion() {
    const nextIndex = this.data.currentIndex + 1
    const remaining = this.data.questions.length - nextIndex

    if (remaining <= 0) {
      wx.showModal({
        title: '冲刺完成！',
        content: '恭喜！你已消灭所有错题。',
        confirmText: '返回',
        success: (res) => {
          if (res.confirm) wx.navigateBack()
        }
      })
      return
    }

    this.setData({
      currentIndex: nextIndex,
      currentQuestion: this.data.questions[nextIndex],
      selectedAnswer: '',
      isSubmitted: false,
      isCorrect: false,
      remainingCount: remaining,
      progress: Math.round((nextIndex / this.data.questions.length) * 100)
    })
  }
})
