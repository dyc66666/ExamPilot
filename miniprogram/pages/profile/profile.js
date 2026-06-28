const DEFAULT_USER = {
  name: '数学小能手',
  identity: '大学生',
  grade: '大二',
  major: '数学与应用数学',
  targetExam: '期末高数冲刺',
  avatar: ''
}

function withInitial(user) {
  const name = user.name || DEFAULT_USER.name
  return {
    ...DEFAULT_USER,
    ...user,
    initial: name.slice(0, 1)
  }
}

Page({
  data: {
    user: withInitial(DEFAULT_USER),
    draftUser: { ...DEFAULT_USER },
    isEditing: false,
    stats: {
      totalQuestions: 0,
      wrongCount: 0,
      accuracy: 0,
      favoriteCount: 0
    }
  },

  onShow() {
    this.loadUser()
    this.loadProfileData()
  },

  loadUser() {
    const savedUser = wx.getStorageSync('profileUser') || DEFAULT_USER
    const user = withInitial(savedUser)
    this.setData({
      user,
      draftUser: {
        name: user.name,
        identity: user.identity,
        grade: user.grade,
        major: user.major,
        targetExam: user.targetExam,
        avatar: user.avatar
      }
    })
  },

  loadProfileData() {
    const questions = wx.getStorageSync('questions') || []
    const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
    const favorites = wx.getStorageSync('favoriteQuestions') || []
    const total = questions.length
    const wrong = wrongQuestions.length
    const mastered = total > 0 ? Math.max(total - wrong, 0) : 0
    const accuracy = total > 0 ? Math.round((mastered / total) * 100) : 0
    this.setData({
      stats: {
        totalQuestions: total,
        wrongCount: wrong,
        accuracy,
        favoriteCount: favorites.length
      }
    })
  },

  toggleEdit() {
    this.setData({ isEditing: true })
  },

  cancelEdit() {
    this.setData({ isEditing: false })
  },

  saveProfile() {
    const draft = this.data.draftUser
    if (!draft.name.trim()) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    const savedUser = {
      name: draft.name.trim(),
      identity: draft.identity.trim() || DEFAULT_USER.identity,
      grade: draft.grade.trim() || DEFAULT_USER.grade,
      major: draft.major.trim() || DEFAULT_USER.major,
      targetExam: draft.targetExam.trim() || DEFAULT_USER.targetExam,
      avatar: draft.avatar
    }
    wx.setStorageSync('profileUser', savedUser)
    this.setData({
      user: withInitial(savedUser),
      isEditing: false
    })
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  onChooseAvatar(e) {
    const avatar = e.detail.avatarUrl
    this.setData({
      isEditing: true,
      'draftUser.avatar': avatar,
      'user.avatar': avatar
    })
  },

  onNameInput(e) {
    this.setData({ 'draftUser.name': e.detail.value })
  },

  onIdentityInput(e) {
    this.setData({ 'draftUser.identity': e.detail.value })
  },

  onGradeInput(e) {
    this.setData({ 'draftUser.grade': e.detail.value })
  },

  onMajorInput(e) {
    this.setData({ 'draftUser.major': e.detail.value })
  },

  onTargetInput(e) {
    this.setData({ 'draftUser.targetExam': e.detail.value })
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
