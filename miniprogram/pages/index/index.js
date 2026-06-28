Page({
  data: {
    stats: { totalQuestions: 0, masteredCount: 0, wrongCount: 0, accuracy: 0 },
    overview: { daysLeft: 12, plan: '30min 冲刺', reviewCount: 0, newCount: 0 }
  },

  onShow() {
    const questions = wx.getStorageSync('questions') || []
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    const total = questions.length
    const wrong = wrongQuestions.length
    const mastered = total > 0 ? Math.max(total - wrong, 0) : 0
    const accuracy = total > 0 ? Math.round((mastered / total) * 100) : 0
    this.setData({
      stats: { totalQuestions: total, masteredCount: mastered, wrongCount: wrong, accuracy },
      overview: { ...this.data.overview, reviewCount: Math.ceil(wrong / 2), newCount: Math.max(total - mastered - Math.ceil(wrong / 2), 0) }
    })
  },

  goToQuiz() { wx.navigateTo({ url: '/pages/quiz/quiz' }) },
  goToImport() { wx.switchTab({ url: '/pages/import/import' }) },
  goToErrors() { wx.switchTab({ url: '/pages/errors/errors' }) },
  goToSprint() { wx.navigateTo({ url: '/pages/sprint/sprint' }) }
})
