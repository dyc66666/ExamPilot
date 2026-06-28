Page({
  data: {
    questions: [],
    isParsing: false,
    isUploading: false,
    errorMsg: '',
    progress: '',
    parsedQuestions: [],
    editMode: false,
    selectedCount: 0,
    newQuestion: { stem: '', options: ['', '', '', ''], answer: '', explanation: '', knowledgePoint: '' },
    showForm: false
  },

  onShow: function() {
    this.setData({
      questions: wx.getStorageSync('questions') || [],
      editMode: false,
      selectedCount: 0
    })
  },

  chooseFile: function() {
    var that = this
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: function(res) {
        var file = res.tempFiles[0]
        var name = (file.name || '').toLowerCase()
        if (name && !name.endsWith('.pdf') && !name.endsWith('.doc') && !name.endsWith('.docx')) {
          wx.showToast({ title: '请选择 PDF 或 Word 文件', icon: 'none' })
          return
        }
        if (file.size > 20 * 1024 * 1024) {
          wx.showToast({ title: '文件大小超限', icon: 'none' })
          return
        }
        that.processFile(file)
      },
      fail: function(err) {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择失败', icon: 'none' })
        }
      }
    })
  },

  processFile: async function(file) {
    this.setData({ isUploading: true, errorMsg: '', progress: '' })
    wx.showLoading({ title: '上传并提取文字...' })
    try {
      var uploadRes = await wx.cloud.uploadFile({
        cloudPath: 'uploads/' + Date.now() + '_' + file.name,
        filePath: file.path
      })
      var extractRes = await wx.cloud.callFunction({
        name: 'aiParse',
        data: { fileID: uploadRes.fileID, fileName: file.name }
      })
      wx.hideLoading()
      if (!extractRes.result || !extractRes.result.success) {
        this.setData({ isUploading: false, errorMsg: extractRes.result.error || '提取失败' })
        return
      }
      var rawText = extractRes.result.rawText || ''
      var parts = rawText.split(/\n\s*\n/).filter(function(p) { return p.trim() })
      if (parts.length === 0) parts = [rawText]
      var chunks = []
      var cur = ''
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i]
        if (p.length > 3000) {
          this.setData({ isUploading: false, errorMsg: '段落过长(' + p.length + '字)' })
          return
        }
        if (cur && cur.length + p.length > 3000) {
          chunks.push(cur)
          cur = p
        } else {
          cur += (cur ? '\n\n' : '') + p
        }
      }
      if (cur) chunks.push(cur)

      this.setData({ isUploading: false, isParsing: true })
      var allQuestions = []
      var seen = {}
      for (var c = 0; c < chunks.length; c++) {
        this.setData({ progress: '解析中 ' + (c+1) + '/' + chunks.length })
        try {
          var parseRes = await wx.cloud.callFunction({ name: 'aiParse', data: { rawText: chunks[c] } })
          if (parseRes.result && parseRes.result.success && parseRes.result.questions) {
            var qs = parseRes.result.questions
            for (var j = 0; j < qs.length; j++) {
              var q = qs[j]
              var key = (q.stem || '').replace(/\s+/g, '').slice(0, 30)
              if (key && !seen[key]) {
                seen[key] = true
                q.order = allQuestions.length + 1
                q.id = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2,6)
                q._checked = true
                allQuestions.push(q)
              }
            }
          }
        } catch(e) {}
      }
      this.setData({ isParsing: false, progress: '', parsedQuestions: allQuestions })
      if (allQuestions.length === 0) wx.showToast({ title: '未识别到题目', icon: 'none' })
    } catch(err) {
      wx.hideLoading()
      this.setData({ isParsing: false, isUploading: false, errorMsg: err.errMsg || err.message || '错误' })
    }
  },

  toggleQuestion: function(e) {
    var idx = e.currentTarget.dataset.index
    var obj = {}
    obj['parsedQuestions[' + idx + ']._checked'] = !this.data.parsedQuestions[idx]._checked
    this.setData(obj)
  },

  saveAllParsed: function() {
    var checked = this.data.parsedQuestions.filter(function(q){ return q._checked })
    if (checked.length === 0) { wx.showToast({ title: '未选中题目', icon: 'none' }); return }
    var questions = wx.getStorageSync('questions') || []
    checked.forEach(function(q){ delete q._checked; q.wrongCount = 0; q.status = 'new'; questions.unshift(q) })
    wx.setStorageSync('questions', questions)
    getApp().globalData.questions = questions
    wx.showToast({ title: '已入库 ' + checked.length + ' 题', icon: 'success' })
    this.setData({ parsedQuestions: [] })
    this.setData({ questions: wx.getStorageSync('questions') || [] })
  },

  toggleEditMode: function() {
    var m = !this.data.editMode
    var qs = this.data.questions.map(function(q){ q._selected = false; return q })
    this.setData({ editMode: m, selectedCount: 0, questions: qs })
  },

  selectAll: function() {
    var qs = this.data.questions.map(function(q){ q._selected = true; return q })
    this.setData({ questions: qs, selectedCount: qs.length })
  },

  toggleSelect: function(e) {
    var id = e.currentTarget.dataset.id
    var qs = this.data.questions.map(function(q){ if (q.id === id) q._selected = !q._selected; return q })
    this.setData({ questions: qs, selectedCount: qs.filter(function(q){ return q._selected }).length })
  },

  deleteSelected: function() {
    var that = this
    var n = this.data.selectedCount
    if (n === 0) { wx.showToast({ title: '请先选择题目', icon: 'none' }); return }
    wx.showModal({
      title: '确认删除', content: '删除选中的 ' + n + ' 题？',
      success: function(r){
        if (r.confirm) {
          var all = wx.getStorageSync('questions') || []
          var ids = that.data.questions.filter(function(q){ return q._selected }).map(function(q){ return q.id })
          all = all.filter(function(q){ return ids.indexOf(q.id) === -1 })
          wx.setStorageSync('questions', all)
          getApp().globalData.questions = all
          that.setData({ questions: all, editMode: false, selectedCount: 0 })
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  showForm: function() { this.setData({ showForm: true }) },
  hideForm: function() {
    this.setData({ showForm: false, newQuestion: { stem: '', options: ['','','',''], answer: '', explanation: '', knowledgePoint: '' } })
  },
  onStemInput: function(e) { this.setData({ 'newQuestion.stem': e.detail.value }) },
  onOptionInput: function(e) {
    var i = e.currentTarget.dataset.index
    var o = {}; o['newQuestion.options[' + i + ']'] = e.detail.value; this.setData(o)
  },
  onAnswerInput: function(e) { this.setData({ 'newQuestion.answer': e.detail.value.toUpperCase() }) },
  onExplanationInput: function(e) { this.setData({ 'newQuestion.explanation': e.detail.value }) },
  onKnowledgeInput: function(e) { this.setData({ 'newQuestion.knowledgePoint': e.detail.value }) },
  saveQuestion: function() {
    var q = this.data.newQuestion
    if (!q.stem.trim() || !q.answer.trim()) { wx.showToast({ title: '请填写题干和答案', icon: 'none' }); return }
    var qs = wx.getStorageSync('questions') || []
    qs.unshift({ id: Date.now().toString(), stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation, knowledgePoint: q.knowledgePoint, wrongCount: 0, status: 'new' })
    wx.setStorageSync('questions', qs)
    getApp().globalData.questions = qs
    wx.showToast({ title: '添加成功', icon: 'success' })
    this.hideForm()
    this.setData({ questions: wx.getStorageSync('questions') || [] })
  }
})
