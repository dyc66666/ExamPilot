Page({
  data: {
    stats: {
      totalQuestions: 0,
      masteredCount: 0,
      wrongCount: 0,
      accuracy: 0
    }
  },

  onShow() {
    const app = getApp()
    const questions = app.globalData.questions || []
    const wrongQuestions = app.globalData.wrongQuestions || []
    const total = questions.length
    const wrong = wrongQuestions.length
    const mastered = total > 0 ? total - wrong : 0
    const accuracy = total > 0 ? Math.round((mastered / total) * 100) : 0

    this.setData({
      stats: {
        totalQuestions: total,
        masteredCount: mastered,
        wrongCount: wrong,
        accuracy: accuracy
      }
    })
  },

  goToQuiz() {
    wx.switchTab({ url: '/pages/quiz/quiz' })
  },

  goToImport() {
    wx.switchTab({ url: '/pages/import/import' })
  },

  goToErrors() {
    wx.switchTab({ url: '/pages/errors/errors' })
  },

  goToSprint() {
    wx.navigateTo({ url: '/pages/sprint/sprint' })
  }
})
