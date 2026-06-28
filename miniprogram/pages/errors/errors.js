function confidenceText(value) {
  if (value === 'sure') return '高自信偏差'
  if (value === 'unsure') return '模糊判断'
  if (value === 'guess') return '猜测失误'
  return '未标记'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return `${date.getMonth() + 1}`.padStart(2, '0') + '-' + `${date.getDate()}`.padStart(2, '0')
}

function stripAnswerMarkers(stem) {
  var s = stem
  s = s.replace(/（[A-E]+）/g, '')
  s = s.replace(/\([A-E]+\)/g, '')
  s = s.replace(/【[A-E]+】/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

function dedupWrongQuestions(list) {
  var seen = {}
  var result = []
  for (var i = 0; i < list.length; i++) {
    var item = list[i]
    var stemKey = (item.stem || '').replace(/\s+/g, '')
    var optsKey = (item.options || []).map(function(t) { return (t || '').replace(/\s+/g, '') }).join('|')
    var key = stemKey + '|||' + optsKey
    var existing = seen[key]
    if (existing) {
      // 合并：累加错误次数，保留较新的时间
      existing.wrongCount = (existing.wrongCount || 1) + (item.wrongCount || 1)
      if (new Date(item.wrongTime) > new Date(existing.wrongTime)) {
        existing.wrongTime = item.wrongTime
      }
    } else {
      seen[key] = item
      result.push(item)
    }
  }
  if (result.length !== list.length) {
    wx.setStorageSync('wrongQuestions', result)
    getApp().globalData.wrongQuestions = result
  }
  return result
}

Page({
  data: {
    wrongQuestions: [],
    groupedQuestions: [],
    activeFilter: 'all',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '高自信', value: 'sure' },
      { label: '模糊判断', value: 'unsure' },
      { label: '猜测', value: 'guess' }
    ]
  },
  onShow() { this.loadErrors() },
  loadErrors() {
    // 数据规范化：旧数据选项可能是对象格式，统一转字符串数组
    var raw = (wx.getStorageSync('wrongQuestions') || []).map(function(item) {
      var clean = Object.assign({}, item)
      clean.stem = stripAnswerMarkers(clean.stem || '')
      if (clean.options && clean.options.length) {
        clean.options = clean.options.map(function(o) {
          return typeof o === 'string' ? o : (o.text || '')
        }).filter(function(t) { return t })
      }
      return clean
    })
    wx.setStorageSync('wrongQuestions', raw)
    getApp().globalData.wrongQuestions = raw
    var deduped = dedupWrongQuestions(raw)
    var wrongQuestions = deduped.map(function(item) {
      return Object.assign({}, item, { confidenceText: confidenceText(item.confidenceWhenWrong), dateText: formatDate(item.wrongTime) })
    })
    this.setData({ wrongQuestions: wrongQuestions })
    this.groupByKnowledge(wrongQuestions, this.data.activeFilter)
  },
  onFilterChange(e) { this.groupByKnowledge(this.data.wrongQuestions, e.detail.value) },
  groupByKnowledge(list, filter) {
    const grouped = {}
    ;(filter === 'all' ? list : list.filter(item => item.confidenceWhenWrong === filter)).forEach(item => {
      const key = item.knowledgePoint || '未分类'
      if (!grouped[key]) grouped[key] = { name: key, count: 0, questions: [] }
      grouped[key].count += 1
      grouped[key].questions.push(item)
    })
    this.setData({ groupedQuestions: Object.values(grouped), activeFilter: filter })
  },
  startSprint() { wx.navigateTo({ url: '/pages/sprint/sprint' }) },
  goToQuiz() { wx.navigateTo({ url: '/pages/quiz/quiz' }) },
  clearErrors() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有错题记录吗？',
      confirmText: '清空',
      confirmColor: '#FF453A',
      success: res => {
        if (!res.confirm) return
        wx.setStorageSync('wrongQuestions', [])
        getApp().globalData.wrongQuestions = []
        this.loadErrors()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  }
})
