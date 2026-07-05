Page({
  data: {
    stats: { totalQuestions: 0, masteredCount: 0, wrongCount: 0, accuracy: 0 },
    overview: { daysLeft: 12, plan: '30min 冲刺', reviewCount: 0, newCount: 0 },
    currentBank: '',
    editingDays: false,
    editingTarget: '',
    showBankPicker: false,
    bankList: []
  },

  onShow() {
    const questions = wx.getStorageSync('questions') || []
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    const createdBanks = wx.getStorageSync('createdBanks') || []
    const currentBank = wx.getStorageSync('currentBank') || ''
    const savedDays = wx.getStorageSync('examDaysLeft')
    const total = questions.length
    const wrong = wrongQuestions.length
    const mastered = total > 0 ? Math.max(total - wrong, 0) : 0
    const accuracy = total > 0 ? Math.round((mastered / total) * 100) : 0
    var days = savedDays !== '' && savedDays !== undefined ? savedDays : this.data.overview.daysLeft
    // 构建bankList（含颜色）
    var bankColors = [
      'linear-gradient(135deg, #8B68FF, #A65CFF)',
      'linear-gradient(135deg, #4E7BFF, #5AA8FF)',
      'linear-gradient(135deg, #2DCAA7, #51E0BD)',
      'linear-gradient(135deg, #FFB23F, #FF8A2A)',
      'linear-gradient(135deg, #FF7A4F, #FF5B3D)',
      'linear-gradient(135deg, #6BC4E8, #8ED1F0)'
    ]
    var bankList = (createdBanks || []).map(function(b, i) {
      return { name: b.name, color: bankColors[b.colorIndex] || bankColors[0] }
    })
    this.setData({
      stats: { totalQuestions: total, masteredCount: mastered, wrongCount: wrong, accuracy },
      overview: {
        ...this.data.overview,
        daysLeft: days,
        plan: currentBank || '未选择题库',
        reviewCount: Math.ceil(wrong / 2),
        newCount: Math.max(total - mastered - Math.ceil(wrong / 2), 0)
      },
      currentBank: currentBank,
      bankList: bankList
    })
  },

  // 点击天数进入编辑模式
  editDaysTap() {
    this.setData({ editingDays: true })
  },

  // 天数输入完成（每次输入都实时更新）
  onDaysInput(e) {
    var val = e.detail.value
    if (!val) return
    var days = parseInt(val) || 0
    this.setData({ 'overview.daysLeft': days })
  },

  // 失去焦点退出编辑并保存
  onDaysBlur() {
    var days = parseInt(this.data.overview.daysLeft) || 12
    if (!days) days = 12
    wx.setStorageSync('examDaysLeft', days)
    this.setData({ editingDays: false, 'overview.daysLeft': days })
  },

  // 选择题库弹窗
  openBankPicker() {
    // 重新加载最新题库列表
    var createdBanks = wx.getStorageSync('createdBanks') || []
    var bankColors = [
      'linear-gradient(135deg, #8B68FF, #A65CFF)',
      'linear-gradient(135deg, #4E7BFF, #5AA8FF)',
      'linear-gradient(135deg, #2DCAA7, #51E0BD)',
      'linear-gradient(135deg, #FFB23F, #FF8A2A)',
      'linear-gradient(135deg, #FF7A4F, #FF5B3D)',
      'linear-gradient(135deg, #6BC4E8, #8ED1F0)'
    ]
    var bankList = (createdBanks || []).map(function(b, i) {
      return { name: b.name, color: bankColors[b.colorIndex] || bankColors[0] }
    })
    this.setData({ bankList: bankList, showBankPicker: true })
  },

  closeBankPicker() {
    this.setData({ showBankPicker: false })
  },

  selectBank(e) {
    var name = e.currentTarget.dataset.name
    if (name) {
      wx.setStorageSync('currentBank', name)
      this.setData({ currentBank: name, showBankPicker: false })
    }
  },

  noop() {},

  goToQuiz() { wx.navigateTo({ url: '/pages/quiz/quiz' }) },
  goToImport() { wx.switchTab({ url: '/pages/import/import' }) },
  goToAssistant() { wx.switchTab({ url: '/pages/assistant/assistant' }) },
  goToErrors() { wx.switchTab({ url: '/pages/errors/errors' }) },
  goToSprint() { wx.navigateTo({ url: '/pages/sprint/sprint' }) }
})
