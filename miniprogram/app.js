const questionUtils = require('./utils/question-utils')

App({
  globalData: {
    questions: [],
    wrongQuestions: [],
    userInfo: null
  },

  onLaunch() {
    wx.cloud.init({ env: 'cloud1-d7g9nz5em55c161ca' })

    const normalized = questionUtils.ensureUniqueQuestionIds(wx.getStorageSync('questions') || [])
    const questions = normalized.questions
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    if (normalized.changed) wx.setStorageSync('questions', questions)
    this.globalData.questions = questions
    this.globalData.wrongQuestions = wrongQuestions
  }
})
