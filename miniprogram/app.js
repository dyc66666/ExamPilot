App({
  globalData: {
    questions: [],
    wrongQuestions: [],
    userInfo: null
  },

  onLaunch() {
    wx.cloud.init({ env: 'cloud1-d7g9nz5em55c161ca' })

    const questions = wx.getStorageSync('questions') || []
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    this.globalData.questions = questions
    this.globalData.wrongQuestions = wrongQuestions
  }
})
