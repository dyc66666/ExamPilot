Page({
  data: {
    wrongQuestions: [],
    groupedQuestions: [],
    activeFilter: 'all'
  },

  onShow() {
    this.loadErrors()
  },

  loadErrors() {
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    this.setData({ wrongQuestions })
    this.groupByKnowledge(wrongQuestions, 'all')
  },

  groupByKnowledge(list, filter) {
    const grouped = {}
    list.forEach(q => {
      const key = q.knowledgePoint || '未分类'
      if (!grouped[key]) {
        grouped[key] = { name: key, count: 0, questions: [] }
      }
      grouped[key].count++
      grouped[key].questions.push(q)
    })

    this.setData({
      groupedQuestions: Object.values(grouped),
      activeFilter: filter
    })
  },

  startSprint() {
    if (this.data.wrongQuestions.length === 0) {
      wx.showToast({ title: '没有错题，太棒了！', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/sprint/sprint' })
  },

  clearErrors() {
    wx.showModal({
      title: '确认清除',
      content: '确定要清空所有错题记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('wrongQuestions', [])
          const app = getApp()
          app.globalData.wrongQuestions = []
          this.loadErrors()
          wx.showToast({ title: '已清除', icon: 'success' })
        }
      }
    })
  }
})
