App({
  globalData: {
    questions: [],
    wrongQuestions: [],
    userInfo: null
  },

  onLaunch() {
    const questions = wx.getStorageSync('questions') || []
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    this.globalData.questions = questions
    this.globalData.wrongQuestions = wrongQuestions
  }
})
