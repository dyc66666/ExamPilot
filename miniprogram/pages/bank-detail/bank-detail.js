Page({
  data: {
    bankName: '',
    allQuestions: [],
    questions: [],
    filteredQuestions: [],
    editMode: false,
    selectedCount: 0,
    searchValue: '',
    masteredCount: 0,
    masteryRate: 0,
    showDetail: false,
    currentDetail: null,
    detailOpts: [],
    optLetters: ['A','B','C','D','E','F','G','H','I','J']
  },

  onLoad: function(options) {
    var name = options.name || ''
    this.loadQuestions(name)
  },

  loadQuestions: function(name) {
    var all = wx.getStorageSync('questions') || []
    var filtered = all.filter(function(q) {
      return (q.knowledgePoint || '未分类题库') === name
    })
    filtered = filtered.map(function(q) { q._selected = false; return q })
    var mastered = filtered.filter(function(q) { return q.status === 'mastered' }).length
    this.setData({
      bankName: name,
      allQuestions: all,
      questions: filtered,
      filteredQuestions: filtered,
      masteredCount: mastered,
      masteryRate: filtered.length ? Math.round(mastered / filtered.length * 100) : 0,
      editMode: false,
      selectedCount: 0,
      searchValue: ''
    })
  },

  goBack: function() {
    wx.navigateBack()
  },

  clearSearch: function() {
    this.setData({ searchValue: '', filteredQuestions: this.data.questions })
  },

  onSearchInput: function(e) {
    var val = (e.detail.value || '').trim().toLowerCase()
    this.setData({ searchValue: e.detail.value })
    if (!val) {
      this.setData({ filteredQuestions: this.data.questions })
      return
    }
    var filtered = this.data.questions.filter(function(q) {
      return (q.stem || '').toLowerCase().indexOf(val) !== -1
    })
    this.setData({ filteredQuestions: filtered })
  },

  toggleEditMode: function() {
    var m = !this.data.editMode
    var qs = this.data.filteredQuestions.map(function(q) { q._selected = false; return q })
    this.setData({ editMode: m, filteredQuestions: qs, selectedCount: 0 })
  },

  toggleSelect: function(e) {
    if (!this.data.editMode) return
    var id = e.currentTarget.dataset.id
    var qs = this.data.filteredQuestions.map(function(q) {
      if (q.id === id) q._selected = !q._selected
      return q
    })
    this.setData({
      filteredQuestions: qs,
      selectedCount: qs.filter(function(q) { return q._selected }).length
    })
  },

  toggleSelectAll: function() {
    var allSelected = this.data.selectedCount === this.data.filteredQuestions.length
    var qs = this.data.filteredQuestions.map(function(q) { q._selected = !allSelected; return q })
    this.setData({
      filteredQuestions: qs,
      selectedCount: allSelected ? 0 : qs.length
    })
  },

  deleteSelected: function() {
    var that = this
    var n = this.data.selectedCount
    if (n === 0) { wx.showToast({ title: '请先选择题目', icon: 'none' }); return }
    wx.showModal({
      title: '确认删除',
      content: '从「' + that.data.bankName + '」中删除 ' + n + ' 题？',
      success: function(r) {
        if (!r.confirm) return
        var ids = {}
        var selected = that.data.filteredQuestions.filter(function(q) { return q._selected })
        for (var i = 0; i < selected.length; i++) { ids[selected[i].id] = true }
        var all = wx.getStorageSync('questions') || []
        all = all.filter(function(q) { return !ids[q.id] })
        wx.setStorageSync('questions', all)
        getApp().globalData.questions = all
        that.loadQuestions(that.data.bankName)
        wx.showToast({ title: '已删除 ' + n + ' 题', icon: 'success' })
      }
    })
  },

  favoriteSelected: function() {
    var that = this
    var n = that.data.selectedCount
    if (n === 0) { wx.showToast({ title: '请先选择题目', icon: 'none' }); return }
    var ids = {}
    var selected = that.data.filteredQuestions.filter(function(q) { return q._selected })
    for (var i = 0; i < selected.length; i++) { ids[selected[i].id] = true }
    var all = wx.getStorageSync('questions') || []
    all = all.map(function(q) {
      if (ids[q.id]) q.status = 'mastered'
      return q
    })
    wx.setStorageSync('questions', all)
    getApp().globalData.questions = all
    that.loadQuestions(that.data.bankName)
    wx.showToast({ title: '已收藏 ' + n + ' 题', icon: 'success' })
  },

  // ===== 题目详情 =====
  openQuestionDetail: function(e) {
    var index = parseInt(e.currentTarget.dataset.index)
    var item = this.data.filteredQuestions[index]
    if (item) {
      var opts = []
      var answer = item.answer || ''
      var letters = this.data.optLetters
      for (var i = 0; i < (item.options || []).length && i < letters.length; i++) {
        opts.push({
          letter: letters[i],
          text: item.options[i],
          isCorrect: answer.indexOf(letters[i]) !== -1
        })
      }
      this.setData({ showDetail: true, currentDetail: item, detailOpts: opts })
    }
  },

  closeDetail: function() {
    this.setData({ showDetail: false, currentDetail: null })
  },

  deleteCurrentQuestion: function(e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这道题？',
      success: function(r) {
        if (!r.confirm) return
        var all = wx.getStorageSync('questions') || []
        all = all.filter(function(q) { return q.id !== id })
        wx.setStorageSync('questions', all)
        getApp().globalData.questions = all
        that.closeDetail()
        that.loadQuestions(that.data.bankName)
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  favoriteCurrentQuestion: function(e) {
    var id = e.currentTarget.dataset.id
    var that = this
    var detail = this.data.currentDetail
    if (!detail) return
    var isMastered = detail.status === 'mastered'
    var all = wx.getStorageSync('questions') || []
    all = all.map(function(q) {
      if (q.id === id) q.status = isMastered ? '' : 'mastered'
      return q
    })
    wx.setStorageSync('questions', all)
    getApp().globalData.questions = all
    // 更新当前详情状态
    detail.status = isMastered ? '' : 'mastered'
    // 更新列表中对应项的状态
    var qs = that.data.filteredQuestions.map(function(q) {
      if (q.id === id) q.status = isMastered ? '' : 'mastered'
      return q
    })
    var mastered = qs.filter(function(q) { return q.status === 'mastered' }).length
    that.setData({
      currentDetail: detail,
      filteredQuestions: qs,
      masteredCount: mastered,
      masteryRate: qs.length ? Math.round(mastered / qs.length * 100) : 0
    })
    wx.showToast({ title: isMastered ? '已取消收藏' : '已收藏', icon: 'success' })
  }
})
