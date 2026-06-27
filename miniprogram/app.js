App({
  globalData: {
    questions: [],
    wrongQuestions: [],
    userInfo: null
  },

  onLaunch() {
    // 从本地存储加载数据
    const questions = wx.getStorageSync('questions') || []
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    this.globalData.questions = questions
    this.globalData.wrongQuestions = wrongQuestions
  }
})
