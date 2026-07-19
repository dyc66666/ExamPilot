var questionUtils = require('../../utils/question-utils')

Page({
  data: {
    questions: [],
    isParsing: false,
    isUploading: false,
    errorMsg: '',
    parseWarning: '',
    progress: '',
    parseProgress: 0,
    parsedQuestions: [],
    showMaterialDecision: false,
    materialAnalysis: null,
    materialDecisionMode: '',
    generateLevel: 'basic',
    generateLevelOptions: [
      { value: 'basic', title: '基础保过', desc: '核心考点 + 经典速通题 + 易混辨析', perPoint: '每考点2-3题' },
      { value: 'improve', title: '稳定提分', desc: '常考变式 + 陷阱题 + 章节综合', perPoint: '每考点3-4题' },
      { value: 'sprint', title: '高分冲刺', desc: '难题 + 多选题 + 材料题 + 跨章节综合', perPoint: '每考点4-6题' }
    ],
    duplicateCount: 0,
    duplicateGroupCount: 0,
    duplicateExtraCount: 0,
    activeParsedIndex: -1,
    activeParsedQuestion: null,
    showParsedEditor: false,
    showImportSheet: false,
    showUploadPanel: false,
    importSuccess: false,
    importSavedCount: 0,
    editMode: false,
    selectedCount: 0,
    newQuestion: { stem: '', options: ['', '', '', ''], answer: '', explanation: '', knowledgePoint: '' },
    showForm: false,
    bankSummary: { total: 0, masteredRate: 0, learnedToday: 0 },
    bankDecks: [],
    createdBanks: [],
    deckManageMode: false,
    selectedDeckCount: 0,
    favoriteDecks: [],
    importBankName: '',
    useNewImportBank: false,
    importNewBankName: '',
    showCreateBankPanel: false,
    newBankName: '',
    newBankNameLen: 0,
    canCreateBank: false,
    selectedColorIndex: 0,
    bankColors: [
      'linear-gradient(135deg, #8B68FF, #A65CFF)',
      'linear-gradient(135deg, #4E7BFF, #5AA8FF)',
      'linear-gradient(135deg, #2DCAA7, #51E0BD)',
      'linear-gradient(135deg, #FFB23F, #FF8A2A)',
      'linear-gradient(135deg, #FF7A4F, #FF5B3D)',
      'linear-gradient(135deg, #6BC4E8, #8ED1F0)'
    ]
  },

  onShow: function() {
    var questions = wx.getStorageSync('questions') || []
    var favoriteDecks = wx.getStorageSync('favoriteDecks') || []
    var createdBanks = wx.getStorageSync('createdBanks') || []
    var decks = this.buildBankDecks(questions, favoriteDecks, createdBanks)
    this.setData({
      questions: questions,
      editMode: false,
      selectedCount: 0,
      deckManageMode: false,
      selectedDeckCount: 0,
      favoriteDecks: favoriteDecks,
      createdBanks: createdBanks,
      bankSummary: this.buildBankSummary(questions),
      bankDecks: decks,
      importBankName: this.getDefaultImportBank(decks)
    })
  },

  getDefaultImportBank: function(decks) {
    return decks && decks.length ? decks[0].name : '未分类题库'
  },

  buildBankSummary: function(questions) {
    var total = questions.length
    var mastered = questions.filter(function(q) { return q.status === 'mastered' }).length
    var rate = total ? Math.round((mastered / total) * 100) : 0
    return { total: total, masteredRate: rate, learnedToday: Math.min(total, 12) }
  },

  buildBankDecks: function(questions, favoriteDecks, createdBanks) {
    favoriteDecks = favoriteDecks || this.data.favoriteDecks || []
    createdBanks = createdBanks || []
    var groups = {}
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i]
      var name = q.knowledgePoint || '未分类题库'
      if (!groups[name]) groups[name] = { name: name, total: 0, mastered: 0, sample: '', colorIndex: -1 }
      groups[name].total++
      if (q.status === 'mastered') groups[name].mastered++
      if (!groups[name].sample) groups[name].sample = q.stem || ''
    }
    var names = Object.keys(groups)
    // build a lookup for created bank colors
    var createdColorLookup = {}
    for (var ci = 0; ci < createdBanks.length; ci++) {
      createdColorLookup[createdBanks[ci].name] = createdBanks[ci].colorClass
    }
    var decks = names.map(function(name, index) {
      var item = groups[name]
      var progress = item.total ? Math.round((item.mastered / item.total) * 100) : 0
      // preserve saved color if user created this bank, otherwise cycle
      var colorClass = createdColorLookup[name] || 'deck-color-' + (index % 6)
      return {
        name: item.name,
        total: item.total,
        totalText: item.total + '题',
        progress: progress,
        sample: item.sample,
        timeText: index === 0 ? '今天学习' : (index === 1 ? '昨天学习' : (index < 4 ? '3天前' : '1周前')),
        colorClass: colorClass,
        favorite: favoriteDecks.indexOf(item.name) !== -1,
        _selected: false
      }
    })
    // add empty created banks
    for (var ci = 0; ci < createdBanks.length; ci++) {
      var cb = createdBanks[ci]
      var found = false
      for (var di = 0; di < decks.length; di++) {
        if (decks[di].name === cb.name) { found = true; break }
      }
      if (!found) {
        decks.push({
          name: cb.name,
          total: 0,
          totalText: '0题',
          progress: 0,
          sample: '',
          timeText: '刚刚创建',
          colorClass: cb.colorClass || 'deck-color-0',
          favorite: false,
          _selected: false
        })
      }
    }
    return decks.sort(function(a, b) {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return b.total - a.total
    })
  },

  openImportSheet: function() {
    this.setData({ showImportSheet: true })
  },

  closeImportSheet: function() {
    this.setData({ showImportSheet: false })
  },

  openUploadPanel: function() {
    this.setData({
      showImportSheet: false,
      showUploadPanel: true,
      showForm: false,
      importSuccess: false,
      importSavedCount: 0,
      parsedQuestions: [],
      showMaterialDecision: false,
      materialAnalysis: null,
      materialDecisionMode: '',
      generateLevel: 'basic',
      errorMsg: '',
      parseWarning: '',
      progress: '',
      parseProgress: 0,
      useNewImportBank: false,
      importNewBankName: '',
      importBankName: this.getDefaultImportBank(this.data.bankDecks)
    })
  },

  closeUploadPanel: function() {
    this._pendingImport = null
    this.setData({ showUploadPanel: false, importSuccess: false })
  },

  viewImportedBank: function() {
    this.setData({
      showUploadPanel: false,
      importSuccess: false,
      parsedQuestions: []
    })
    this._pendingImport = null
  },

  continueImport: function() {
    this.setData({
      showUploadPanel: true,
      importSuccess: false,
      importSavedCount: 0,
      parsedQuestions: [],
      showMaterialDecision: false,
      materialAnalysis: null,
      materialDecisionMode: '',
      generateLevel: 'basic',
      errorMsg: '',
      parseWarning: '',
      progress: '',
      parseProgress: 0,
      useNewImportBank: false,
      importNewBankName: '',
      importBankName: this.getDefaultImportBank(this.data.bankDecks)
    })
  },

  chooseImportBank: function(e) {
    this.setData({
      importBankName: e.currentTarget.dataset.name,
      useNewImportBank: false,
      importNewBankName: ''
    })
  },

  useNewBankForImport: function() {
    this.setData({
      useNewImportBank: true,
      importBankName: ''
    })
  },

  onImportNewBankInput: function(e) {
    this.setData({ importNewBankName: e.detail.value })
  },

  openManualEntry: function() {
    this.setData({ showImportSheet: false, showUploadPanel: false, showForm: true })
  },

  createNewBank: function() {
    this.setData({
      showImportSheet: false,
      showCreateBankPanel: true,
      newBankName: '',
      newBankNameLen: 0,
      canCreateBank: false,
      selectedColorIndex: 0
    })
  },

  closeCreateBankPanel: function() {
    this.setData({
      showCreateBankPanel: false,
      newBankName: ''
    })
  },

  onNewBankNameInput: function(e) {
    var val = e.detail.value
    this.setData({ newBankName: val, newBankNameLen: val.length, canCreateBank: val.trim().length > 0 })
  },

  selectColor: function(e) {
    var index = parseInt(e.currentTarget.dataset.index)
    this.setData({ selectedColorIndex: index })
  },

  confirmCreateBank: function() {
    var name = (this.data.newBankName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入题库名称', icon: 'none' })
      return
    }
    var colorClass = 'deck-color-' + this.data.selectedColorIndex

    // 持久化存储新创建的题库
    var createdBanks = wx.getStorageSync('createdBanks') || []
    var exists = false
    for (var i = 0; i < createdBanks.length; i++) {
      if (createdBanks[i].name === name) { exists = true; break }
    }
    if (!exists) {
      createdBanks.push({ name: name, colorClass: colorClass })
    }
    wx.setStorageSync('createdBanks', createdBanks)

    // 合并到当前列表
    var decks = this.data.bankDecks.slice()
    var alreadyInList = false
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].name === name) { alreadyInList = true; break }
    }
    if (!alreadyInList) {
      decks.unshift({
        name: name,
        total: 0,
        totalText: '0题',
        progress: 0,
        sample: '',
        timeText: '刚刚创建',
        colorClass: colorClass,
        favorite: false,
        _selected: false
      })
    }

    this.setData({
      showCreateBankPanel: false,
      bankDecks: decks,
      createdBanks: createdBanks,
      useNewImportBank: true,
      importNewBankName: name
    })
    wx.showToast({ title: '已创建「' + name + '」', icon: 'success' })
  },

  openCameraCapture: function() {
    var that = this
    this.setData({ showImportSheet: false })
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: function(res) {
        var tempFile = res.tempFiles[0]
        that.processFile({ name: tempFile.tempFilePath.split('/').pop() || 'camera_photo.jpg', path: tempFile.tempFilePath, size: tempFile.size })
      },
      fail: function(err) {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '拍照失败', icon: 'none' })
        }
      }
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
        if (name && name.endsWith('.doc') && !name.endsWith('.docx')) {
          wx.showToast({ title: '旧版 .doc 请另存为 .docx', icon: 'none' })
          return
        }
        if (name && !name.endsWith('.pdf') && !name.endsWith('.docx')) {
          wx.showToast({ title: '请选择 PDF 或 .docx 文件', icon: 'none' })
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
    this._pendingImport = null
    this.setData({
      isUploading: true,
      importSuccess: false,
      errorMsg: '',
      parseWarning: '',
      progress: '正在上传文件...',
      parseProgress: 8,
      parsedQuestions: [],
      showMaterialDecision: false,
      materialAnalysis: null,
      materialDecisionMode: '',
      generateLevel: 'basic'
    })
    wx.showLoading({ title: '上传中...' })
    try {
      var uploadRes = await wx.cloud.uploadFile({
        cloudPath: 'uploads/' + Date.now() + '_' + file.name,
        filePath: file.path
      })

      await this.processExtractedFile(uploadRes.fileID, file.name)
    } catch(err) {
      wx.hideLoading()
      this.setData({ isParsing: false, isUploading: false, errorMsg: err.errMsg || err.message || '错误' })
    }
  },

  buildMaterialSampleFromPages: function(pages) {
    var chunks = []
    for (var i = 0; i < pages.length; i++) {
      if (!pages[i] || !pages[i].text) continue
      chunks.push('第' + pages[i].pageNo + '页：\n' + pages[i].text)
      if (chunks.join('\n\n').length > 12000) break
    }
    return chunks.join('\n\n').slice(0, 12000)
  },

  buildMaterialSampleFromText: function(text) {
    return String(text || '').slice(0, 12000)
  },

  getPendingMaterialText: function(maxLength) {
    var pending = this._pendingImport || {}
    var text = pending.rawText || ''
    if (!text && pending.pages) {
      text = pending.pages.map(function(page) {
        return '第' + page.pageNo + '页：\n' + (page.text || '')
      }).join('\n\n')
    }
    return maxLength ? text.slice(0, maxLength) : text
  },

  normalizeMaterialAnalysis: function(analysis, fileName) {
    analysis = analysis || {}
    var type = analysis.materialType || '混合资料'
    var intent = analysis.recommendedAction || ''
    return {
      materialType: type,
      materialTypeLabel: type,
      subject: analysis.subject || '未识别科目',
      examGoal: analysis.examGoal || '考试复习',
      confidence: typeof analysis.confidence === 'number' ? Math.round(analysis.confidence * 100) : 70,
      summary: analysis.summary || 'AI 已完成资料初步判断，请选择接下来的处理方式。',
      chapters: (analysis.chapters || []).slice(0, 8),
      keyPoints: (analysis.keyPoints || []).slice(0, 12),
      questionEvidence: analysis.questionEvidence || '',
      recommendedAction: intent || (type.indexOf('题库') !== -1 ? 'organizeQuestions' : 'generateFromMaterial'),
      fileName: fileName || ''
    }
  },

  classifyPendingMaterial: async function(sampleText, fileName) {
    this.setData({ isUploading: false, isParsing: true, progress: 'AI 正在判断资料类型...', parseProgress: 22 })
    var res = await wx.cloud.callFunction({
      name: 'aiParse',
      data: {
        mode: 'classifyMaterial',
        text: sampleText,
        fileName: fileName
      }
    })
    if (!res.result || !res.result.success) {
      throw new Error((res.result && res.result.error) || '资料类型判断失败')
    }
    var analysis = this.normalizeMaterialAnalysis(res.result.analysis, fileName)
    this.setData({
      isParsing: false,
      progress: '',
      parseProgress: 30,
      showMaterialDecision: true,
      materialAnalysis: analysis
    })
  },

  chooseMaterialMode: async function(e) {
    var mode = e.currentTarget.dataset.mode
    if (!this._pendingImport) {
      wx.showToast({ title: '请重新上传资料', icon: 'none' })
      return
    }
    this.setData({
      materialDecisionMode: mode,
      showMaterialDecision: false,
      isParsing: true,
      errorMsg: '',
      parseWarning: ''
    })
    try {
      if (mode === 'generate') {
        await this.generateQuestionsFromMaterialBatched()
      } else {
        await this.organizeQuestionsFromDocument()
      }
    } catch (err) {
      this.setData({
        isParsing: false,
        errorMsg: err.errMsg || err.message || '处理失败，请重试'
      })
    }
  },

  chooseGenerateLevel: function(e) {
    var level = e.currentTarget.dataset.level || 'basic'
    this.setData({ generateLevel: level })
  },

  getGenerateLevelConfig: function(level) {
    var configs = {
      basic: { label: '基础保过', minPerPoint: 2, maxPerPoint: 3, fallbackCount: 30, maxCount: 80 },
      improve: { label: '稳定提分', minPerPoint: 3, maxPerPoint: 4, fallbackCount: 45, maxCount: 120 },
      sprint: { label: '高分冲刺', minPerPoint: 4, maxPerPoint: 6, fallbackCount: 60, maxCount: 160 }
    }
    return configs[level] || configs.basic
  },

  estimateGenerateTargetCount: function(level, analysis) {
    var config = this.getGenerateLevelConfig(level)
    analysis = analysis || {}
    var keyPointCount = (analysis.keyPoints || []).length
    var chapterCount = (analysis.chapters || []).length
    var baseCount = keyPointCount ? keyPointCount * config.minPerPoint : config.fallbackCount
    if (!keyPointCount && chapterCount) baseCount = chapterCount * 6
    return Math.max(config.fallbackCount, Math.min(config.maxCount, baseCount))
  },

  organizeQuestionsFromDocument: async function() {
    var pending = this._pendingImport || {}
    this.setData({ progress: '正在按原文整理题目...', parseProgress: 12 })
    var allQuestions = []
    if (pending.pages && pending.pages.length) {
      var windowsFromPages = this.makeSlidingWindowsFromPages(pending.pages)
      allQuestions = await this.parseSlidingWindows(windowsFromPages)
    } else {
      var windowsFromText = this.makeSlidingWindowsFromText(pending.rawText || '')
      allQuestions = await this.parseSlidingWindows(windowsFromText)
    }
    this.finishParsedQuestions(allQuestions)
  },

  generateQuestionsFromMaterialBatched: async function() {
    var level = this.data.generateLevel || 'basic'
    var levelConfig = this.getGenerateLevelConfig(level)
    var targetCount = this.estimateGenerateTargetCount(level, this.data.materialAnalysis || {})
    var batchSize = 8
    var totalBatches = Math.max(1, Math.ceil(targetCount / batchSize))
    var allQuestions = []
    var materialText = this.getPendingMaterialText(18000)
    this.setData({ progress: 'AI 正在按「' + levelConfig.label + '」识别章节和考点...', parseProgress: 35 })
    try {
      for (var i = 0; i < totalBatches && allQuestions.length < targetCount; i++) {
        var remaining = targetCount - allQuestions.length
        var currentTarget = Math.min(batchSize, remaining)
        var percent = 35 + Math.round(((i + 1) / totalBatches) * 48)
        this.setData({
          progress: 'AI 正在按考点生成第 ' + (i + 1) + '/' + totalBatches + ' 批题目...',
          parseProgress: percent
        })
        var res = null
        var batchError = null
        try {
          res = await wx.cloud.callFunction({
            name: 'aiParse',
            data: {
              mode: 'generateStudyQuestions',
              text: materialText,
              analysis: this.data.materialAnalysis || {},
              targetCount: currentTarget,
              level: level,
              levelLabel: levelConfig.label,
              batchIndex: i + 1,
              totalBatches: totalBatches,
              existingStems: allQuestions.slice(-30).map(function(q) { return q.stem || '' }).filter(Boolean)
            }
          })
        } catch (err) {
          batchError = err
        }
        if ((batchError || !res || !res.result || !res.result.success) && currentTarget > 3) {
          this.setData({
            progress: '第 ' + (i + 1) + ' 批生成较慢，正在缩小批量重试...',
            parseProgress: percent
          })
          res = await wx.cloud.callFunction({
            name: 'aiParse',
            data: {
              mode: 'generateStudyQuestions',
              text: materialText.slice(0, 12000),
              analysis: this.data.materialAnalysis || {},
              targetCount: 3,
              level: level,
              levelLabel: levelConfig.label,
              batchIndex: i + 1,
              totalBatches: totalBatches,
              existingStems: allQuestions.slice(-30).map(function(q) { return q.stem || '' }).filter(Boolean)
            }
          })
        }
        if (batchError && (!res || !res.result)) {
          throw batchError
        }
        if (!res || !res.result || !res.result.success) {
          throw new Error((res && res.result && res.result.error) || '生成题目失败')
        }
        var batchQuestions = res.result.questions || []
        for (var j = 0; j < batchQuestions.length; j++) {
          if (allQuestions.length >= targetCount) break
          allQuestions.push(batchQuestions[j])
        }
      }
      if (!allQuestions.length) {
        throw new Error('AI 未生成可用题目')
      }
      this.setData({
        parseWarning: '已按「' + levelConfig.label + '」生成题目：原文例题优先加入，缺少例题的考点由 AI 补题；预计约 ' + targetCount + ' 题，实际生成 ' + allQuestions.length + ' 题，请核对后再入库'
      })
      this.finishParsedQuestions(allQuestions)
    } catch (err) {
      this.setData({
        isParsing: false,
        errorMsg: err.errMsg || err.message || '生成题目失败'
      })
    }
  },

  generateQuestionsFromMaterial: async function() {
    this.setData({ progress: 'AI 正在提炼考点并生成题目...', parseProgress: 35 })
    try {
      var res = await wx.cloud.callFunction({
        name: 'aiParse',
        data: {
          mode: 'generateStudyQuestions',
          text: this.getPendingMaterialText(24000),
          analysis: this.data.materialAnalysis || {}
        }
      })
      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '生成题目失败')
      }
      var questions = res.result.questions || []
      this.setData({ parseWarning: '已优先保留资料中的原题，其余知识点由 AI 补充出题，请核对后再入库' })
      this.finishParsedQuestions(questions)
    } catch (err) {
      this.setData({
        isParsing: false,
        errorMsg: err.errMsg || err.message || '生成题目失败'
      })
    }
  },

  normalizeText: function(text) {
    return (text || '').replace(/\s+/g, '').replace(/[，。；：、,.．:;()（）【】\[\]]/g, '').toUpperCase()
  },

  normalizeOptionLabel: function(label) {
    var s = String(label || '').toUpperCase()
    var fullWidth = {
      'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F', 'Ｇ': 'G', 'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J',
      '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9'
    }
    if (fullWidth[s]) s = fullWidth[s]
    var alpha = 'ABCDEFGHIJ'
    var circled = '①②③④⑤⑥⑦⑧⑨⑩'
    if (alpha.indexOf(s) !== -1) return { kind: 'alpha', index: alpha.indexOf(s) }
    if (/^[1-9]$/.test(s)) return { kind: 'number', index: Number(s) - 1 }
    if (s === '10' || s === '１０') return { kind: 'number', index: 9 }
    if (circled.indexOf(s) !== -1) return { kind: 'circled', index: circled.indexOf(s) }
    return null
  },

  extractOptionLabels: function(line) {
    var labels = []
    var text = line || ''
    var patterns = [
      /(^|[\s　])([A-Ja-jＡ-Ｊ])\s*[.．、)]/g,
      /(^|[\s　])([A-JＡ-Ｊ])\s+(?=[^\sA-Za-zＡ-Ｚａ-ｚ])/g,
      /[（(]\s*([A-Ja-jＡ-Ｊ])\s*[）)]/g,
      /(^|[\s　])([1-9１-９]|10|１０)\s*[.．、)]/g,
      /(^|[\s　])([1-9１-９]|10|１０)\s+(?=[^\s\d])/g,
      /[（(]\s*([1-9１-９]|10|１０)\s*[）)]/g,
      /([①②③④⑤⑥⑦⑧⑨⑩])/g
    ]
    for (var p = 0; p < patterns.length; p++) {
      var re = patterns[p]
      var match
      while ((match = re.exec(text)) !== null) {
        var raw = match[2] || match[1]
        var label = this.normalizeOptionLabel(raw)
        if (label) labels.push(label)
      }
    }
    return labels
  },

  hasOptionClusterFrom: function(records, startIndex) {
    var labels = this.extractOptionLabels(records[startIndex].text)
    var first = null
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].index === 0) {
        first = labels[i]
        break
      }
    }
    if (!first) return false

    var seen = {}
    seen[0] = true
    var maxIndex = 0
    for (var r = startIndex; r < records.length && r <= startIndex + 10; r++) {
      var current = this.extractOptionLabels(records[r].text)
      for (var c = 0; c < current.length; c++) {
        if (current[c].kind === first.kind) {
          seen[current[c].index] = true
          if (current[c].index > maxIndex) maxIndex = current[c].index
        }
      }
    }
    var seenCount = 0
    for (var key in seen) {
      if (seen[key]) seenCount++
    }
    return !!(seen[1] && seen[2] && seenCount >= 3)
  },

  buildQuestionBlocksFromPages: function(pages) {
    var records = []
    for (var i = 0; i < pages.length; i++) {
      var pageNo = pages[i].pageNo || (i + 1)
      var lines = String(pages[i].text || '').replace(/\r/g, '\n').split('\n')
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j].replace(/\s+/g, ' ').trim()
        if (line) records.push({ text: line, pageNo: pageNo })
      }
    }
    return this.buildQuestionBlocks(records)
  },

  buildQuestionBlocksFromText: function(rawText) {
    var lines = String(rawText || '').replace(/\r/g, '\n').split('\n')
    var records = []
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+/g, ' ').trim()
      if (line) records.push({ text: line, pageNo: null })
    }
    return this.buildQuestionBlocks(records)
  },

  estimateBlockStart: function(records, optionStart) {
    var min = Math.max(0, optionStart - 10)
    for (var i = optionStart - 1; i >= min; i--) {
      if (/^(答案|参考答案|正确答案|解析|答案解析)\s*[:：]?/.test(records[i].text)) {
        return Math.min(optionStart, i + 1)
      }
    }
    return min
  },

  trimTrailingNextStem: function(blockRecords) {
    var answerIndex = -1
    for (var i = 0; i < blockRecords.length; i++) {
      if (/^(答案|参考答案|正确答案)\s*[:：]?/.test(blockRecords[i].text)) answerIndex = i
    }
    if (answerIndex === -1 || answerIndex >= blockRecords.length - 1) return blockRecords

    for (var j = answerIndex + 1; j < blockRecords.length; j++) {
      var line = blockRecords[j].text
      if (/^(解析|答案解析)\s*[:：]?/.test(line)) return blockRecords
      if (this.extractOptionLabels(line).length) return blockRecords
    }
    return blockRecords.slice(0, answerIndex + 1)
  },

  buildQuestionBlocks: function(records) {
    var inlineAnswerBlocks = this.buildQuestionBlocksByInlineAnswerAnchors(records)
    if (inlineAnswerBlocks.length >= 20) return inlineAnswerBlocks

    var starts = []
    for (var i = 0; i < records.length; i++) {
      var labels = this.extractOptionLabels(records[i].text)
      var hasFirstOption = labels.some(function(label) { return label.index === 0 })
      if (hasFirstOption && this.hasOptionClusterFrom(records, i)) starts.push(i)
    }

    if (!starts.length) {
      var answerBlocks = this.buildQuestionBlocksByAnswerMarks(records)
      if (answerBlocks.length) return answerBlocks
      return this.fallbackTextBlocks(records.map(function(record) { return record.text }).join('\n'))
    }

    var blocks = []
    for (var s = 0; s < starts.length; s++) {
      var start = this.estimateBlockStart(records, starts[s])
      var end = s + 1 < starts.length ? starts[s + 1] : records.length
      var blockRecords = this.trimTrailingNextStem(records.slice(start, end))

      var text = blockRecords.map(function(record) { return record.text }).join('\n').trim()
      if (text.length >= 20) {
        var sourcePages = []
        for (var p = 0; p < blockRecords.length; p++) {
          var pageNo = blockRecords[p].pageNo
          if (pageNo && sourcePages.indexOf(pageNo) === -1) sourcePages.push(pageNo)
        }
        blocks.push({ text: text, sourcePages: sourcePages })
      }
    }
    return blocks
  },

  buildQuestionBlocksByInlineAnswerAnchors: function(records) {
    var marks = []
    for (var i = 0; i < records.length; i++) {
      var text = records[i].text
      if (this.getInlineAnswer(text) && (!this.getLeadingOptionLabel(text) || this.isAnswerLikeLine(text))) {
        marks.push(i)
      }
    }
    if (!marks.length) return []

    var starts = []
    for (var m = 0; m < marks.length; m++) {
      var min = m === 0 ? 0 : marks[m - 1] + 1
      var start = marks[m]
      for (var s = marks[m] - 1; s >= min; s--) {
        if (this.getLeadingOptionLabel(records[s].text) || this.getOptionSegments(records[s].text).length) break
        start = s
      }
      starts.push(start)
    }

    var blocks = []
    for (var b = 0; b < starts.length; b++) {
      var end = b + 1 < starts.length ? starts[b + 1] : records.length
      var blockRecords = records.slice(starts[b], end)
      var text = blockRecords.map(function(record) { return record.text }).join('\n').trim()
      if (text.length < 20) continue
      var sourcePages = []
      for (var p = 0; p < blockRecords.length; p++) {
        var pageNo = blockRecords[p].pageNo
        if (pageNo && sourcePages.indexOf(pageNo) === -1) sourcePages.push(pageNo)
      }
      blocks.push({ text: text, sourcePages: sourcePages })
    }
    return blocks
  },

  hasInlineQuestionEndMark: function(text) {
    return /(\[[^\]]*(单选题|多选题|选择题)[^\]]*\]|【[^】]*(单选题|多选题|选择题)[^】]*】)/.test(String(text || ''))
  },

  getInlineAnswer: function(text) {
    var match = String(text || '').match(/[（(]\s*([A-Ja-jＡ-Ｊ1-9１-９①②③④⑤⑥⑦⑧⑨⑩\s　]{1,20})\s*[）)]/)
    return match ? this.normalizeAnswerLetters(match[1]) : ''
  },

  isAnswerLikeLine: function(text) {
    var line = String(text || '').trim()
    if (/^(答案|参考答案|正确答案)\s*[:：]?/.test(line)) return true
    return /[（(]\s*[A-Ja-jＡ-Ｊ1-9１-９①②③④⑤⑥⑦⑧⑨⑩]{1,10}\s*[）)]\s*(\[[^\]]*(单选题|多选题|选择题)[^\]]*\]|【[^】]*(单选题|多选题|选择题)[^】]*】)/.test(line)
  },

  buildQuestionBlocksByAnswerMarks: function(records) {
    var ends = []
    for (var i = 0; i < records.length; i++) {
      if (this.isAnswerLikeLine(records[i].text)) ends.push(i)
    }
    if (!ends.length) return []

    var blocks = []
    var start = 0
    for (var e = 0; e < ends.length; e++) {
      var end = ends[e] + 1
      var blockRecords = records.slice(start, end)
      start = end

      var text = blockRecords.map(function(record) { return record.text }).join('\n').trim()
      if (text.length < 20) continue
      var sourcePages = []
      for (var p = 0; p < blockRecords.length; p++) {
        var pageNo = blockRecords[p].pageNo
        if (pageNo && sourcePages.indexOf(pageNo) === -1) sourcePages.push(pageNo)
      }
      blocks.push({ text: text, sourcePages: sourcePages })
    }
    return blocks
  },

  fallbackTextBlocks: function(text) {
    var blocks = []
    var parts = String(text || '').split(/\n\s*\n/)
    var cur = ''
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim()
      if (!part) continue
      if (cur && cur.length + part.length > 9000) {
        blocks.push({ text: cur, sourcePages: [] })
        cur = part
      } else {
        cur += (cur ? '\n\n' : '') + part
      }
    }
    if (cur) blocks.push({ text: cur, sourcePages: [] })
    return blocks
  },

  makeParseBatches: function(blocks) {
    var batches = []
    var cur = []
    var length = 0
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i]
      if (cur.length && (cur.length >= 6 || length + block.text.length > 4500)) {
        batches.push(cur)
        cur = []
        length = 0
      }
      cur.push(block)
      length += block.text.length
    }
    if (cur.length) batches.push(cur)
    return batches
  },

  makeSlidingWindowsFromText: function(rawText) {
    var text = String(rawText || '')
      .replace(/\r/g, '\n')
      .replace(/\n\s*\d+\s*\/\s*\d+\s*(?=\n|$)/g, '\n')
      .trim()
    var windowSize = 7000
    var overlap = 2200
    var windows = []
    if (!text) return windows
    if (text.length <= windowSize) {
      return [{ index: 1, start: 0, end: text.length, text: text }]
    }
    var start = 0
    while (start < text.length) {
      var end = Math.min(start + windowSize, text.length)
      var cut = end
      if (end < text.length) {
        var slice = text.slice(start, end)
        var lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'))
        if (lastBreak > windowSize * 0.65) cut = start + lastBreak
      }
      windows.push({
        index: windows.length + 1,
        start: start,
        end: cut,
        text: text.slice(start, cut)
      })
      if (cut >= text.length) break
      start = Math.max(0, cut - overlap)
      if (windows.length > 80) break
    }
    return windows
  },

  makeSlidingWindowsFromPages: function(pages) {
    var text = (pages || []).map(function(page, index) {
      var pageNo = page.pageNo || (index + 1)
      return '【第' + pageNo + '页】\n' + String(page.text || '').trim()
    }).filter(function(part) {
      return part.replace(/【第\d+页】\s*/, '').trim()
    }).join('\n\n')
    return this.makeSlidingWindowsFromText(text)
  },

  normalizeWindowQuestion: function(question, windowIndex) {
    var q = this.normalizeParsedQuestion(question)
    q.status = question && question.status ? String(question.status) : 'complete'
    q.sourceText = question && question.sourceText ? String(question.sourceText) : ''
    q._windowIndex = windowIndex
    q._checked = q.status !== 'incomplete'
    q._warn = q.status === 'incomplete' ? '跨窗口题需核对' : ''
    return q
  },

  recordParseIssue: function(message) {
    if (!message) return
    if (!this._parseIssues) this._parseIssues = []
    if (this._parseIssues.indexOf(message) === -1) this._parseIssues.push(message)
  },

  parseWindowQuestions: async function(win, total) {
    this.setData({
      progress: '解析窗口 ' + win.index + '/' + total,
      parseProgress: Math.max(12, Math.min(88, Math.round((win.index / total) * 78)))
    })
    try {
      var res = await wx.cloud.callFunction({
        name: 'aiParse',
        data: { mode: 'parseWindow', text: win.text, windowIndex: win.index }
      })
      if (res.result && res.result.success && res.result.questions) {
        return (res.result.questions || []).map(function(q) {
          return this.normalizeWindowQuestion(q, win.index)
        }, this).filter(function(q) {
          return q.stem || (q.options && q.options.length)
        })
      }
      if (res.result && res.result.success === false) {
        this.recordParseIssue('窗口 ' + win.index + ' 解析失败：' + (res.result.error || '云函数未返回题目'))
      }
    } catch(e) {
      this.recordParseIssue('窗口 ' + win.index + ' 解析异常：' + (e.errMsg || e.message || '未知错误'))
    }
    try {
      var fallback = await wx.cloud.callFunction({ name: 'aiParse', data: { rawText: win.text } })
      if (fallback.result && fallback.result.success && fallback.result.questions) {
        return (fallback.result.questions || []).map(function(q) {
          return this.normalizeWindowQuestion(q, win.index)
        }, this)
      }
      if (fallback.result && fallback.result.success === false) {
        this.recordParseIssue('窗口 ' + win.index + ' 兼容解析失败：' + (fallback.result.error || '云函数未返回题目'))
      }
    } catch(err) {
      this.recordParseIssue('窗口 ' + win.index + ' 兼容解析异常：' + (err.errMsg || err.message || '未知错误'))
    }
    return []
  },

  parseWindowsConcurrently: async function(windows, limit) {
    var results = new Array(windows.length)
    var nextIndex = 0
    var completed = 0
    var that = this
    var workerCount = Math.min(limit || 2, windows.length)

    async function runWorker() {
      while (nextIndex < windows.length) {
        var index = nextIndex
        nextIndex++
        results[index] = await that.parseWindowQuestions(windows[index], windows.length)
        completed++
        that.setData({
          progress: '解析窗口 ' + completed + '/' + windows.length,
          parseProgress: Math.max(12, Math.min(82, Math.round((completed / windows.length) * 70)))
        })
      }
    }

    var workers = []
    for (var i = 0; i < workerCount; i++) workers.push(runWorker())
    await Promise.all(workers)
    return results
  },

  isSameQuestionRoughly: function(a, b) {
    var stemA = this.normalizeText(a && a.stem || '').slice(0, 80)
    var stemB = this.normalizeText(b && b.stem || '').slice(0, 80)
    if (!stemA || !stemB) return false
    if (stemA === stemB || stemA.indexOf(stemB) === 0 || stemB.indexOf(stemA) === 0) return true
    var min = Math.min(stemA.length, stemB.length)
    var same = 0
    for (var i = 0; i < min; i++) {
      if (stemA.charAt(i) === stemB.charAt(i)) same++
    }
    return min >= 20 && same / min > 0.82
  },

  optionSimilarity: function(a, b) {
    var optsA = (a && a.options || []).map(function(option) { return this.normalizeText(option) }, this).filter(function(option) { return option })
    var optsB = (b && b.options || []).map(function(option) { return this.normalizeText(option) }, this).filter(function(option) { return option })
    var len = Math.min(optsA.length, optsB.length)
    if (!len) return 0
    var matched = 0
    for (var i = 0; i < len; i++) {
      if (!optsA[i] || !optsB[i]) continue
      if (optsA[i] === optsB[i] || optsA[i].indexOf(optsB[i]) !== -1 || optsB[i].indexOf(optsA[i]) !== -1) {
        matched++
      }
    }
    return matched / Math.max(optsA.length, optsB.length)
  },

  stemHitsOption: function(stem, question) {
    var key = this.normalizeText(stem || '')
    if (!key || key.length < 4) return false
    var options = question && question.options || []
    for (var i = 0; i < options.length; i++) {
      var optionKey = this.normalizeText(options[i])
      if (!optionKey) continue
      if (optionKey === key || optionKey.indexOf(key) !== -1 || key.indexOf(optionKey) !== -1) return true
    }
    return false
  },

  questionSimilarityScore: function(a, b) {
    var stemA = this.normalizeText(a && a.stem || '')
    var stemB = this.normalizeText(b && b.stem || '')
    var answerA = this.normalizeAnswerLetters(a && a.answer || '')
    var answerB = this.normalizeAnswerLetters(b && b.answer || '')
    var sameAnswer = !answerA || !answerB || answerA === answerB
    var optScore = this.optionSimilarity(a, b)
    if (optScore >= 0.85 && sameAnswer) return 0.96
    if (optScore >= 0.7 && sameAnswer && (this.stemHitsOption(stemA, b) || this.stemHitsOption(stemB, a))) return 0.93
    if (stemA && stemB && (stemA.indexOf(stemB) !== -1 || stemB.indexOf(stemA) !== -1)) return 0.88
    if (this.isSameQuestionRoughly(a, b)) return 0.84
    return 0
  },

  findWindowOverlap: function(prevQuestions, currentQuestions) {
    var prev = prevQuestions || []
    var curr = currentQuestions || []
    var prevStartMin = 0
    var currStartMax = curr.length
    var best = null
    for (var i = prevStartMin; i < prev.length; i++) {
      for (var j = 0; j < currStartMax; j++) {
        var maxLen = Math.min(prev.length - i, curr.length - j)
        var matched = 0
        var scoreSum = 0
        for (var k = 0; k < maxLen; k++) {
          var score = this.questionSimilarityScore(prev[i + k], curr[j + k])
          if (score < 0.78) break
          matched++
          scoreSum += score
        }
        if (!matched) continue
        var avg = scoreSum / matched
        if (matched === 1 && avg < 0.92) continue
        var candidate = { prevStart: i, currStart: j, length: matched, score: avg }
        if (!best || candidate.length > best.length || (candidate.length === best.length && candidate.score > best.score)) {
          best = candidate
        }
      }
    }
    return best
  },

  chooseBetterQuestion: function(a, b) {
    var qa = a || {}
    var qb = b || {}
    var scoreA = String(qa.stem || '').length + ((qa.options || []).length * 80) + (qa.answer ? 60 : 0) + (qa.explanation ? 40 : 0)
    var scoreB = String(qb.stem || '').length + ((qb.options || []).length * 80) + (qb.answer ? 60 : 0) + (qb.explanation ? 40 : 0)
    var best = scoreB >= scoreA ? Object.assign({}, qa, qb) : Object.assign({}, qb, qa)
    best.stem = (String(qb.stem || '').length >= String(qa.stem || '').length ? qb.stem : qa.stem) || ''
    best.options = ((qb.options || []).length >= (qa.options || []).length ? qb.options : qa.options) || []
    best.answer = qb.answer || qa.answer || ''
    best.explanation = qb.explanation || qa.explanation || ''
    best.knowledgePoint = qb.knowledgePoint || qa.knowledgePoint || ''
    best.status = qa.status === 'incomplete' && qb.status === 'incomplete' ? 'incomplete' : 'complete'
    best.sourceText = [qa.sourceText, qb.sourceText].filter(function(t) { return t }).join('\n')
    return best
  },

  mergeQuestionPairWithAI: async function(prevQuestion, currentQuestion, currentIndex) {
    try {
      var res = await wx.cloud.callFunction({
        name: 'aiParse',
        data: {
          mode: 'mergeQuestionPair',
          prevQuestion: prevQuestion,
          currentQuestion: currentQuestion
        }
      })
      if (res.result && res.result.success && res.result.question) {
        return this.normalizeWindowQuestion(res.result.question, currentIndex)
      }
      if (res.result && res.result.success === false) {
        this.recordParseIssue('窗口 ' + currentIndex + ' 交点题合并失败：' + (res.result.error || '云函数未返回题目'))
      }
    } catch(e) {
      this.recordParseIssue('窗口 ' + currentIndex + ' 交点题合并异常：' + (e.errMsg || e.message || '未知错误'))
    }
    return this.normalizeWindowQuestion(this.chooseBetterQuestion(prevQuestion, currentQuestion), currentIndex)
  },

  mergeWindowsLocally: function(prevQuestions, currentQuestions) {
    var prevOnly = []
    var currentMerged = (currentQuestions || []).slice()
    var needsReview = []
    for (var i = 0; i < (prevQuestions || []).length; i++) {
      var prev = prevQuestions[i]
      var matchIndex = -1
      for (var j = 0; j < currentMerged.length; j++) {
        if (this.isSameQuestionRoughly(prev, currentMerged[j])) {
          matchIndex = j
          break
        }
      }
      if (matchIndex >= 0) {
        currentMerged[matchIndex] = this.chooseBetterQuestion(prev, currentMerged[matchIndex])
      } else if (prev.status === 'incomplete') {
        needsReview.push(prev)
      } else {
        prevOnly.push(prev)
      }
    }
    return { prevOnly: prevOnly, currentMerged: currentMerged, needsReview: needsReview }
  },

  mergeAdjacentWindows: async function(prevQuestions, currentQuestions, currentIndex, total) {
    this.setData({
      progress: '合并窗口 ' + (currentIndex - 1) + '-' + currentIndex + '/' + total,
      parseProgress: Math.max(18, Math.min(92, Math.round((currentIndex / total) * 86)))
    })
    var overlap = this.findWindowOverlap(prevQuestions, currentQuestions)
    if (!overlap) {
      return { prevOnly: prevQuestions || [], currentMerged: currentQuestions || [], needsReview: [] }
    }
    var prevOnly = (prevQuestions || []).slice(0, overlap.prevStart)
    var needsReview = (currentQuestions || []).slice(0, overlap.currStart).map(function(q) {
      q._checked = false
      q._warn = q._warn || '窗口交点前的疑似误切题，需核对'
      return q
    })
    var currentMerged = (currentQuestions || []).slice(overlap.currStart)
    if (currentMerged.length) {
      currentMerged[0] = await this.mergeQuestionPairWithAI(prevQuestions[overlap.prevStart], currentQuestions[overlap.currStart], currentIndex)
    }
    return { prevOnly: prevOnly, currentMerged: currentMerged, needsReview: needsReview }
  },

  parseSlidingWindows: async function(windows) {
    if (!windows.length) return []
    this._parseIssues = []
    var committed = []
    var review = []
    var parsedWindows = await this.parseWindowsConcurrently(windows, 2)
    var prev = parsedWindows[0] || []

    for (var i = 1; i < windows.length; i++) {
      var curr = parsedWindows[i] || []
      var merged = await this.mergeAdjacentWindows(prev, curr, windows[i].index, windows.length)
      committed = committed.concat(merged.prevOnly || [])
      review = review.concat(merged.needsReview || [])
      prev = merged.currentMerged || []
    }

    var allQuestions = committed.concat(prev).concat(review)
    for (var q = 0; q < allQuestions.length; q++) {
      allQuestions[q].order = q + 1
      allQuestions[q].id = 'ai_' + Date.now() + '_' + q + '_' + Math.random().toString(36).slice(2, 6)
      if (allQuestions[q].status === 'incomplete') allQuestions[q]._checked = false
      else if (allQuestions[q]._checked !== false) allQuestions[q]._checked = true
    }
    if (!allQuestions.length) {
      var detail = (this._parseIssues || []).slice(0, 3).join('；')
      this.setData({
        errorMsg: '未识别到题目。' + (detail ? '原因：' + detail : '请确认文件文字可复制，或换一份包含明确题干和选项的资料再试。')
      })
    }
    return allQuestions
  },

  normalizeAnswerLetters: function(answer) {
    var text = String(answer || '').toUpperCase()
    var map = {
      '1': 'A', '2': 'B', '3': 'C', '4': 'D',
      '5': 'E', '6': 'F', '7': 'G', '8': 'H', '9': 'I',
      '１': 'A', '２': 'B', '３': 'C', '４': 'D', '５': 'E', '６': 'F', '７': 'G', '８': 'H', '９': 'I',
      '①': 'A', '②': 'B', '③': 'C', '④': 'D', '⑤': 'E', '⑥': 'F', '⑦': 'G', '⑧': 'H', '⑨': 'I', '⑩': 'J',
      'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F', 'Ｇ': 'G', 'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J'
    }
    var result = ''
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i)
      if (/[A-J]/.test(ch)) result += ch
      else if (map[ch]) result += map[ch]
    }
    return result
  },

  normalizeParsedQuestion: function(question) {
    var q = question || {}
    q.stem = String(q.stem || '').trim()
    q.options = (q.options || []).map(function(option) {
      return this.stripOptionLabel(String(option || '')).trim()
    }, this).filter(function(option) {
      return option
    })
    q.answer = this.normalizeAnswerLetters(q.answer)
    if (!q.answer && question && question.stem) {
      q.answer = this.getInlineAnswer(question.stem)
    }
    q.explanation = String(q.explanation || '').trim()
    q.knowledgePoint = String(q.knowledgePoint || '').trim()
    q.difficulty = String(q.difficulty || '').trim()
    q.questionStyle = String(q.questionStyle || '').trim()
    q.sourceType = q.sourceType === 'original' ? 'original' : (q.sourceType === 'generated' ? 'generated' : '')
    q.sourceLabel = q.sourceLabel || (q.sourceType === 'original' ? '原题' : (q.sourceType === 'generated' ? 'AI生成' : ''))
    q.sourceText = String(q.sourceText || '').trim()
    return q
  },

  stripOptionLabel: function(text) {
    return String(text || '')
      .replace(/^\s*[A-JＡ-Ｊ]\s*[.．、)]?\s*/, '')
      .replace(/^\s*[a-j]\s*[.．、)]\s*/, '')
      .replace(/^\s*[（(]\s*[A-Ja-jＡ-Ｊ]\s*[）)]\s*/, '')
      .replace(/^\s*([1-9１-９]|10|１０)\s*[.．、)]?\s*/, '')
      .replace(/^\s*[（(]\s*([1-9１-９]|10|１０)\s*[）)]\s*/, '')
      .replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
      .trim()
  },

  getOptionSegments: function(line) {
    var text = String(line || '')
    var re = /(^|[\s　])([A-Ja-jＡ-Ｊ])\s*[.．、)]|(^|[\s　])([A-JＡ-Ｊ])\s+(?=[^\sA-Za-zＡ-Ｚａ-ｚ])|[（(]\s*([A-Ja-jＡ-Ｊ])\s*[）)]|(^|[\s　])([1-9１-９]|10|１０)\s*[.．、)]|(^|[\s　])([1-9１-９]|10|１０)\s+(?=[^\s\d])|[（(]\s*([1-9１-９]|10|１０)\s*[）)]|([①②③④⑤⑥⑦⑧⑨⑩])/g
    var matches = []
    var match
    while ((match = re.exec(text)) !== null) {
      var raw = match[2] || match[4] || match[5] || match[7] || match[9] || match[10] || match[11]
      var label = this.normalizeOptionLabel(raw)
      if (!label) continue
      var prefix = match[1] || match[3] || match[6] || match[8] || ''
      matches.push({
        label: label,
        markerStart: match.index + prefix.length,
        contentStart: re.lastIndex
      })
    }
    if (!matches.length) return []

    var segments = []
    for (var i = 0; i < matches.length; i++) {
      var end = i + 1 < matches.length ? matches[i + 1].markerStart : text.length
      var content = text.slice(matches[i].contentStart, end).trim()
      if (content) segments.push({ label: matches[i].label, text: content })
    }
    return segments
  },

  getLeadingOptionLabel: function(line) {
    var text = String(line || '').trim()
    var match = text.match(/^([A-Ja-jＡ-Ｊ])\s*[.．、)]/)
      || text.match(/^([A-JＡ-Ｊ])\s+(?=[^\sA-Za-zＡ-Ｚａ-ｚ])/)
      || text.match(/^[（(]\s*([A-Ja-jＡ-Ｊ])\s*[）)]/)
      || text.match(/^([1-9１-９]|10|１０)\s*[.．、)]/)
      || text.match(/^([1-9１-９]|10|１０)\s+(?=[^\s\d])/)
      || text.match(/^[（(]\s*([1-9１-９]|10|１０)\s*[）)]/)
      || text.match(/^([①②③④⑤⑥⑦⑧⑨⑩])/)
    if (!match) return null
    return this.normalizeOptionLabel(match[1])
  },

  cleanStemLines: function(lines) {
    var cleaned = (lines || []).slice()
    var questionMarkIndex = -1
    for (var i = 0; i < cleaned.length; i++) {
      var withoutAnswer = String(cleaned[i] || '')
        .replace(/[（(]\s*[A-Ja-jＡ-Ｊ1-9１-９①②③④⑤⑥⑦⑧⑨⑩\s　]{1,20}\s*[）)]/g, '')
        .replace(/(\[[^\]]*(单选题|多选题|选择题)[^\]]*\]|【[^】]*(单选题|多选题|选择题)[^】]*】)/g, '')
        .trim()
      if (withoutAnswer.replace(/\s/g, '').length >= 4 && /[（(]\s*[A-Ja-jＡ-Ｊ1-9１-９①②③④⑤⑥⑦⑧⑨⑩\s　]{1,20}\s*[）)]/.test(cleaned[i])) {
        questionMarkIndex = i
      }
    }
    if (questionMarkIndex !== -1) cleaned = cleaned.slice(questionMarkIndex)

    while (cleaned.length) {
      var label = this.getLeadingOptionLabel(cleaned[0])
      if (!label) break
      cleaned.shift()
      while (cleaned.length && !this.getLeadingOptionLabel(cleaned[0]) && !/[（(]\s*[A-Ja-jＡ-Ｊ1-9１-９①②③④⑤⑥⑦⑧⑨⑩]{1,10}\s*[）)]/.test(cleaned[0])) {
        cleaned.shift()
      }
    }
    return cleaned
  },

  parseQuestionBlockLocally: function(block) {
    var normalizedBlockText = String(block && block.text || '')
      .replace(/\r/g, '\n')
      .replace(/\[\s*(单选|多选|选择)\s*\n\s*题\s*\]/g, '[$1题]')
      .replace(/\n\s*\d+\s*\/\s*\d+\s*(?=\n|$)/g, '\n')
    var lines = normalizedBlockText.split('\n').map(function(line) {
      return line.replace(/\s+/g, ' ').trim()
    }).filter(function(line) { return line })

    var optionStart = -1
    for (var i = 0; i < lines.length; i++) {
      var segments = this.getOptionSegments(lines[i])
      var label = this.getLeadingOptionLabel(lines[i])
      var hasFirst = (label && label.index === 0) || segments.some(function(segment) { return segment.label.index === 0 })
      if (hasFirst) {
        optionStart = i
        break
      }
    }
    if (optionStart === -1) return null

    var stemLines = lines.slice(0, optionStart).filter(function(line) {
      return !/^(答案|参考答案|正确答案|解析|答案解析)\s*[:：]?/.test(line)
    })
    var options = []
    var current = null
    var answer = ''
    var explanation = ''

    for (var r = optionStart; r < lines.length; r++) {
      var line = lines[r]
      var inlineAnswerValue = this.getInlineAnswer(line)
      if (inlineAnswerValue && !this.getLeadingOptionLabel(line) && !this.getOptionSegments(line).length) {
        if (!options[0]) {
          options = []
          current = null
          stemLines = [line]
          answer = inlineAnswerValue
          continue
        }
        if (stemLines.length && options.filter(function(option) { return option && option.trim() }).length >= 2) {
          break
        }
        if (stemLines.indexOf(line) === -1) stemLines.push(line)
        answer = inlineAnswerValue
        current = null
        continue
      }
      if (this.hasInlineQuestionEndMark(line)) {
        if (stemLines.length && options.filter(function(option) { return option && option.trim() }).length >= 2) {
          break
        }
        if (inlineAnswerValue) answer = inlineAnswerValue
        if (stemLines.indexOf(line) === -1) stemLines.push(line)
        current = null
        continue
      }
      if (/^(答案|参考答案|正确答案)\s*[:：]?/.test(line)) {
        answer = this.normalizeAnswerLetters(line.replace(/^(答案|参考答案|正确答案)\s*[:：]?/, ''))
        current = null
        continue
      }
      if (/^(解析|答案解析)\s*[:：]?/.test(line)) {
        explanation = line.replace(/^(解析|答案解析)\s*[:：]?/, '').trim()
        current = null
        continue
      }

      var segments = this.getOptionSegments(line)
      if (segments.length) {
        for (var s = 0; s < segments.length; s++) {
          current = segments[s].label.index
          options[current] = segments[s].text
        }
      } else {
        var optionLabel = this.getLeadingOptionLabel(line)
        if (optionLabel) {
          current = optionLabel.index
          options[current] = this.stripOptionLabel(line)
        } else if (current !== null && !answer) {
          options[current] = (options[current] ? options[current] + ' ' : '') + line
        } else if (explanation) {
          explanation += ' ' + line
        }
      }
    }

    stemLines = this.cleanStemLines(stemLines)
    if (!answer) {
      for (var ansIdx = 0; ansIdx < stemLines.length; ansIdx++) {
        answer = this.getInlineAnswer(stemLines[ansIdx])
        if (answer) break
      }
    }
    if (!options[0]) return null
    options = options.filter(function(option) { return option && option.trim() })
    if (!stemLines.length || options.length < 2) return null
    var stem = stemLines.join('\n')
      .replace(/[（(]\s*[A-Ja-jＡ-Ｊ1-9１-９①②③④⑤⑥⑦⑧⑨⑩]{1,10}\s*[）)]/g, '')
      .replace(/(\[[^\]]*(单选题|多选题|选择题)[^\]]*\]|【[^】]*(单选题|多选题|选择题)[^】]*】)/g, '')
      .trim()
    if (!stem) return null

    return this.normalizeParsedQuestion({
      stem: stem,
      options: options,
      answer: answer,
      explanation: explanation,
      knowledgePoint: ''
    })
  },

  parseQuestionBlocks: async function(blocks) {
    var batches = this.makeParseBatches(blocks)
    var allQuestions = []
    var failedBatches = []
    var aiFallbackBatches = []

    for (var b = 0; b < batches.length; b++) {
      this.setData({ progress: '解析题块 ' + (b + 1) + '/' + batches.length })
      var current = b + 1
      var percent = batches.length ? Math.max(12, Math.min(96, Math.round((current / batches.length) * 100))) : 12
      this.setData({
        progress: '解析题块 ' + current + '/' + batches.length,
        parseProgress: percent
      })
      var localQuestions = batches[b].map(function(block) {
        return this.parseQuestionBlockLocally(block)
      }, this)
      var text = batches[b].map(function(block, index) {
        var pages = block.sourcePages && block.sourcePages.length ? ' 页码：' + block.sourcePages.join(',') : ''
        return '【题块' + (index + 1) + pages + '】\n' + block.text
      }).join('\n\n')

      try {
        var parseRes = await wx.cloud.callFunction({ name: 'aiParse', data: { rawText: text } })
        if (parseRes.result && parseRes.result.success && parseRes.result.questions) {
          var qs = parseRes.result.questions
          var localValidCount = localQuestions.filter(function(q) { return q }).length
          if (localValidCount) {
            var aiIndex = 0
            for (var j = 0; j < localQuestions.length; j++) {
              var localQ = localQuestions[j]
              if (!localQ) continue
              var aiQ = qs[aiIndex] ? this.normalizeParsedQuestion(qs[aiIndex]) : null
              aiIndex++
              var q = localQ
              if (aiQ) {
                if ((!q.answer || !q.answer.trim()) && aiQ.answer) q.answer = aiQ.answer
                if ((!q.explanation || !q.explanation.trim()) && aiQ.explanation) q.explanation = aiQ.explanation
                if ((!q.knowledgePoint || !q.knowledgePoint.trim()) && aiQ.knowledgePoint) q.knowledgePoint = aiQ.knowledgePoint
                if ((!q.stem || q.stem.length < 4) && aiQ.stem) q.stem = aiQ.stem
                if ((!q.options || q.options.length < 2) && aiQ.options && aiQ.options.length >= 2) q.options = aiQ.options
              }
              q.order = allQuestions.length + 1
              q.id = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
              q._checked = true
              q._warn = ''
              allQuestions.push(q)
            }
          } else {
            aiFallbackBatches.push(b + 1)
          }
        } else {
          failedBatches.push(b + 1)
          aiFallbackBatches.push(b + 1)
          for (var l = 0; l < localQuestions.length; l++) {
            if (!localQuestions[l]) continue
            var localOnly = localQuestions[l]
            localOnly.order = allQuestions.length + 1
            localOnly.id = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
            localOnly._checked = true
            localOnly._warn = ''
            allQuestions.push(localOnly)
          }
        }
      } catch(e) {
        failedBatches.push(b + 1)
        aiFallbackBatches.push(b + 1)
        for (var m = 0; m < localQuestions.length; m++) {
          if (!localQuestions[m]) continue
          var fallback = localQuestions[m]
          fallback.order = allQuestions.length + 1
          fallback.id = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
          fallback._checked = true
          fallback._warn = ''
          allQuestions.push(fallback)
        }
      }
    }

    if (failedBatches.length && !allQuestions.length) {
      this.setData({ errorMsg: '第 ' + failedBatches.join('、') + ' 批题块解析失败，可重试' })
    } else if (aiFallbackBatches.length) {
      this.setData({ parseWarning: '第 ' + aiFallbackBatches.join('、') + ' 批 AI 补答案失败，已保留原文识别结果，可点开核对' })
    }
    return allQuestions
  },

  finishParsedQuestions: function(allQuestions) {
    for (var i = 0; i < allQuestions.length; i++) allQuestions[i].order = i + 1
    allQuestions = this.validateQuestions(allQuestions)
    allQuestions = this.markDuplicateQuestions(allQuestions)
    var display = this.sortParsedQuestions(allQuestions)
    this.setData({
      isParsing: false,
      progress: '',
      parseProgress: 100,
      parsedQuestions: display,
      importBankName: this.data.importBankName || this.getDefaultImportBank(this.data.bankDecks)
    })
    if (allQuestions.length === 0) {
      if (!this.data.errorMsg) {
        this.setData({ errorMsg: '未识别到题目。请确认文件不是扫描图片，且内容里包含可复制的题干和选项。' })
      }
      wx.showToast({ title: '未识别到题目', icon: 'none' })
    }
  },

  processExtractedFile: async function(fileID, fileName) {
    var lowerName = (fileName || '').toLowerCase()
    if (lowerName.endsWith('.pdf')) {
      await this.processPDF(fileID, fileName)
    } else {
      await this.processChunked(fileID, fileName)
    }
  },

  processPDF: async function(fileID, fileName) {
    wx.showLoading({ title: '提取页面...' })
    var pagesRes = await wx.cloud.callFunction({
      name: 'aiParse',
      data: { fileID: fileID, fileName: fileName, mode: 'extractPages' }
    })
    wx.hideLoading()
    if (!pagesRes.result || !pagesRes.result.success) {
      await this.processChunked(fileID, fileName)
      return
    }
    var pages = pagesRes.result.pages || []
    if (!pages.length) {
      await this.processChunked(fileID, fileName)
      return
    }

    this._pendingImport = {
      kind: 'pdf',
      fileID: fileID,
      fileName: fileName,
      pages: pages
    }
    await this.classifyPendingMaterial(this.buildMaterialSampleFromPages(pages), fileName)
  },

  // ===== Word/文本 分段解析（原有逻辑）=====
  processChunked: async function(fileID, fileName) {
    wx.showLoading({ title: '提取文字...' })
    var extractRes = await wx.cloud.callFunction({
      name: 'aiParse',
      data: { fileID: fileID, fileName: fileName }
    })
    wx.hideLoading()
    if (!extractRes.result || !extractRes.result.success) {
      this.setData({ isUploading: false, errorMsg: (extractRes.result && extractRes.result.error) || '提取失败' })
      return
    }
    var rawText = extractRes.result.rawText || ''
    this._pendingImport = {
      kind: 'text',
      fileID: fileID,
      fileName: fileName,
      rawText: rawText
    }
    await this.classifyPendingMaterial(this.buildMaterialSampleFromText(rawText), fileName)
  },

  // ===== 去重：题干前30字+答案 → 保留选项多的 =====
  dedupAndSort: function(list) {
    var groups = {}
    for (var i = 0; i < list.length; i++) {
      var q = list[i]
      var key = (q.stem || '').replace(/\s+/g, '').slice(0, 30) + '|||' + (q.answer || '').replace(/[^A-Z]/g, '')
      if (!groups[key]) groups[key] = []
      groups[key].push(q)
    }
    var keys = Object.keys(groups)
    var result = []
    for (var k = 0; k < keys.length; k++) {
      var group = groups[keys[k]]
      var best = group[0]
      for (var g = 1; g < group.length; g++) {
        if ((group[g].options || []).length > (best.options || []).length) best = group[g]
      }
      result.push(best)
    }
    for (var o = 0; o < result.length; o++) result[o].order = o + 1
    return result
  },

  // ===== 校验：标记异常题 =====
  validateQuestions: function(list) {
    var warnCount = 0
    for (var i = 0; i < list.length; i++) {
      var q = list[i]
      var warns = []
      q.answer = this.normalizeAnswerLetters(q.answer)
      if (!q.answer || !q.answer.trim()) warns.push('缺答案')
      if (!q.options || q.options.length < 2) warns.push('选项少于2个')
      if (q.answer && q.options && q.options.length) {
        var labels = 'ABCDEFGHIJ'.slice(0, q.options.length)
        var ansLetters = (q.answer || '').replace(/[^A-Z]/g, '').split('')
        for (var a = 0; a < ansLetters.length; a++) {
          if (labels.indexOf(ansLetters[a]) === -1) {
            warns.push('答案不在选项中')
            break
          }
        }
      }
      var stemText = q.stem || ''
      var stemLength = stemText.replace(/\s/g, '').length
      if (q.status === 'incomplete') warns.push('跨窗口题需核对')
      if (stemLength < 2) warns.push('题干过短')
      else if (this.getLeadingOptionLabel(stemText)) warns.push('题干疑似选项内容')
      q._warn = warns.join('；')
      if (warns.length) {
        q._checked = false   // 异常题默认不勾选
        warnCount++
      }
    }
    this.setData({ warnCount: warnCount })
    return list
  },

  buildDuplicateKey: function(q) {
    var stem = this.normalizeText(q && q.stem || '')
    var options = (q && q.options || []).map(function(option) {
      return String(option || '').replace(/\s+/g, '').replace(/[，。；：、,.．:;()（）【】\[\]]/g, '').toUpperCase()
    }).sort().join('|')
    return stem.slice(0, 120) + '||' + options
  },

  markDuplicateQuestions: function(list) {
    var groups = {}
    var existingQuestions = wx.getStorageSync('questions') || []
    var existingKeys = {}
    for (var e = 0; e < existingQuestions.length; e++) {
      var existingKey = this.buildDuplicateKey(existingQuestions[e])
      if (existingKey) existingKeys[existingKey] = true
    }
    for (var i = 0; i < list.length; i++) {
      var q = list[i]
      q._duplicate = false
      q._duplicateExisting = false
      q._duplicateGroup = ''
      q._duplicateLabel = ''
      var key = this.buildDuplicateKey(q)
      if (!key || key.length < 8) continue
      if (!groups[key]) groups[key] = []
      groups[key].push(i)
    }

    var duplicateCount = 0
    var groupNo = 0
    var keys = Object.keys(groups)
    for (var k = 0; k < keys.length; k++) {
      var indexes = groups[keys[k]]
      if (indexes.length <= 1) continue
      groupNo++
      for (var j = 0; j < indexes.length; j++) {
        var item = list[indexes[j]]
        item._duplicate = true
        item._duplicateGroup = String(groupNo)
        item._duplicateLabel = '重复 ' + groupNo + '-' + (j + 1) + '/' + indexes.length
        item._checked = j === 0  // 每组默认只保留第一份勾选
        duplicateCount++
      }
    }
    for (var x = 0; x < list.length; x++) {
      var currentKey = this.buildDuplicateKey(list[x])
      if (!currentKey || !existingKeys[currentKey]) continue
      if (!list[x]._duplicate) {
        groupNo++
        duplicateCount++
      }
      list[x]._duplicate = true
      list[x]._duplicateExisting = true
      list[x]._duplicateGroup = 'existing-' + currentKey.slice(0, 16)
      list[x]._duplicateLabel = '题库中已存在'
      list[x]._checked = false
    }
    duplicateCount = list.filter(function(item) { return item._duplicate }).length
    var keptInternalGroups = {}
    var removableCount = 0
    for (var r = 0; r < list.length; r++) {
      var duplicateItem = list[r]
      if (!duplicateItem._duplicate) continue
      if (duplicateItem._duplicateExisting) {
        removableCount++
      } else if (keptInternalGroups[duplicateItem._duplicateGroup]) {
        removableCount++
      } else {
        keptInternalGroups[duplicateItem._duplicateGroup] = true
      }
    }
    this.setData({ duplicateCount: duplicateCount, duplicateGroupCount: groupNo, duplicateExtraCount: removableCount })
    return list
  },

  sortParsedQuestions: function(list) {
    return list.slice().sort(function(a, b) {
      var ad = a._duplicate ? 0 : 1
      var bd = b._duplicate ? 0 : 1
      if (ad !== bd) return ad - bd
      var aw = a._warn ? 0 : 1
      var bw = b._warn ? 0 : 1
      if (aw !== bw) return aw - bw
      return (a.order || 0) - (b.order || 0)
    })
  },

  // ===== 核对页操作 =====
  noop: function() {},

  toggleQuestion: function(e) {
    var idx = e.currentTarget.dataset.index
    var obj = {}
    obj['parsedQuestions[' + idx + ']._checked'] = !this.data.parsedQuestions[idx]._checked
    this.setData(obj)
  },

  openParsedEditor: function(e) {
    var idx = e.currentTarget.dataset.index
    var q = this.data.parsedQuestions[idx]
    if (!q) return
    this.setData({
      activeParsedIndex: idx,
      activeParsedQuestion: JSON.parse(JSON.stringify(q)),
      showParsedEditor: true
    })
  },

  closeParsedEditor: function() {
    this.setData({ activeParsedIndex: -1, activeParsedQuestion: null, showParsedEditor: false })
  },

  onParsedStemInput: function(e) { this.setData({ 'activeParsedQuestion.stem': e.detail.value }) },
  onParsedOptionInput: function(e) {
    var i = e.currentTarget.dataset.index
    var obj = {}
    obj['activeParsedQuestion.options[' + i + ']'] = e.detail.value
    this.setData(obj)
  },
  onParsedAnswerInput: function(e) {
    this.setData({ 'activeParsedQuestion.answer': this.normalizeAnswerLetters(e.detail.value) })
  },
  onParsedExplanationInput: function(e) { this.setData({ 'activeParsedQuestion.explanation': e.detail.value }) },
  onParsedKnowledgeInput: function(e) { this.setData({ 'activeParsedQuestion.knowledgePoint': e.detail.value }) },

  addParsedOption: function() {
    var q = this.data.activeParsedQuestion
    if (!q) return
    var options = (q.options || []).concat('')
    this.setData({ 'activeParsedQuestion.options': options })
  },

  removeParsedOption: function(e) {
    var idx = e.currentTarget.dataset.index
    var q = this.data.activeParsedQuestion
    if (!q || !q.options || q.options.length <= 2) {
      wx.showToast({ title: '至少保留2个选项', icon: 'none' })
      return
    }
    var options = q.options.slice()
    options.splice(idx, 1)
    this.setData({ 'activeParsedQuestion.options': options })
  },

  saveParsedEdit: function() {
    var idx = this.data.activeParsedIndex
    if (idx < 0) return
    var q = this.normalizeParsedQuestion(this.data.activeParsedQuestion)
    q._checked = true
    q._warn = ''
    var list = this.data.parsedQuestions.slice()
    list[idx] = q
    list = this.validateQuestions(list)
    list = this.markDuplicateQuestions(list)
    list = this.sortParsedQuestions(list)
    var obj = {}
    obj.parsedQuestions = list
    obj.activeParsedIndex = -1
    obj.activeParsedQuestion = null
    obj.showParsedEditor = false
    this.setData(obj)
  },

  selectAllParsed: function() {
    var qs = this.data.parsedQuestions.map(function(q) { q._checked = true; return q })
    this.setData({ parsedQuestions: qs })
  },

  deselectAllParsed: function() {
    var qs = this.data.parsedQuestions.map(function(q) { q._checked = false; return q })
    this.setData({ parsedQuestions: qs })
  },

  deselectDuplicateParsed: function() {
    if (!this.data.duplicateCount) {
      wx.showToast({ title: '没有重复题', icon: 'none' })
      return
    }
    var keptGroups = {}
    var qs = this.data.parsedQuestions.map(function(q) {
      if (!q._duplicate) return q
      if (q._duplicateExisting) {
        q._checked = false
        return q
      }
      if (!keptGroups[q._duplicateGroup]) {
        keptGroups[q._duplicateGroup] = true
        q._checked = true
      } else {
        q._checked = false
      }
      return q
    })
    this.setData({ parsedQuestions: qs })
    wx.showToast({ title: '每组重复题已保留一份', icon: 'success' })
  },

  removeDuplicateParsed: function() {
    var that = this
    if (!this.data.duplicateCount) {
      wx.showToast({ title: '没有重复题', icon: 'none' })
      return
    }
    wx.showModal({
      title: '移除重复题',
      content: '每组保留 1 道，从本次核对列表移除 ' + this.data.duplicateExtraCount + ' 道重复项？',
      success: function(res) {
        if (!res.confirm) return
        var keptGroups = {}
        var qs = that.data.parsedQuestions.filter(function(q) {
          if (!q._duplicate) return true
          if (q._duplicateExisting) return false
          if (!keptGroups[q._duplicateGroup]) {
            keptGroups[q._duplicateGroup] = true
            return true
          }
          return false
        })
        for (var i = 0; i < qs.length; i++) qs[i].order = i + 1
        qs = that.validateQuestions(qs)
        qs = that.markDuplicateQuestions(qs)
        qs = that.sortParsedQuestions(qs)
        that.setData({ parsedQuestions: qs })
      }
    })
  },

  saveAllParsed: function() {
    var checked = this.data.parsedQuestions.filter(function(q) { return q._checked })
    if (checked.length === 0) { wx.showToast({ title: '未选中题目', icon: 'none' }); return }
    var targetBank = this.data.useNewImportBank ? (this.data.importNewBankName || '').trim() : this.data.importBankName
    if (!targetBank) { wx.showToast({ title: '请选择题库', icon: 'none' }); return }
    var questions = wx.getStorageSync('questions') || []
    var createdBanks = wx.getStorageSync('createdBanks') || []
    if (this.data.useNewImportBank) {
      var existsBank = createdBanks.some(function(bank) { return bank.name === targetBank })
      if (!existsBank) {
        createdBanks.push({
          name: targetBank,
          colorClass: 'deck-color-' + (createdBanks.length % 6)
        })
      }
    }
    checked.forEach(function(q) {
      delete q._checked
      delete q._warn
      delete q._duplicate
      delete q._duplicateGroup
      delete q._duplicateLabel
      delete q._duplicateExisting
      q.knowledgePoint = targetBank
      q.wrongCount = 0
      q.status = 'new'
      questions.unshift(questionUtils.randomizeQuestionOptions(q, questions.length))
    })
    wx.setStorageSync('questions', questions)
    wx.setStorageSync('createdBanks', createdBanks)
    wx.setStorageSync('currentBank', targetBank)
    wx.removeStorageSync('quizProgress')
    getApp().globalData.questions = questions
    wx.showToast({ title: '已入库 ' + checked.length + ' 题', icon: 'success' })
    this.setData({
      parsedQuestions: [],
      warnCount: 0,
      duplicateCount: 0,
      duplicateGroupCount: 0,
      duplicateExtraCount: 0,
      showUploadPanel: true,
      importSuccess: true,
      importSavedCount: checked.length,
      useNewImportBank: false,
      importNewBankName: '',
      importBankName: targetBank,
      createdBanks: createdBanks,
      questions: questions,
      bankSummary: this.buildBankSummary(questions),
      bankDecks: this.buildBankDecks(questions, this.data.favoriteDecks, createdBanks)
    })
  },

  // ===== 题库管理 =====
  toggleDeckManage: function() {
    var mode = !this.data.deckManageMode
    var decks = this.data.bankDecks.map(function(deck) {
      deck._selected = false
      return deck
    })
    this.setData({
      deckManageMode: mode,
      selectedDeckCount: 0,
      bankDecks: decks
    })
  },

  toggleDeckSelect: function(e) {
    var name = e.currentTarget.dataset.name
    if (!this.data.deckManageMode) {
      // 非管理模式下，记录当前题库并跳转到题库详情页
      wx.setStorageSync('currentBank', name)
      wx.navigateTo({ url: '/pages/bank-detail/bank-detail?name=' + encodeURIComponent(name) })
      return
    }
    var decks = this.data.bankDecks.map(function(deck) {
      if (deck.name === name) deck._selected = !deck._selected
      return deck
    })
    this.setData({
      bankDecks: decks,
      selectedDeckCount: decks.filter(function(deck) { return deck._selected }).length
    })
  },


  selectAllDecks: function() {
    var allSelected = this.data.selectedDeckCount === this.data.bankDecks.length
    var decks = this.data.bankDecks.map(function(deck) {
      deck._selected = !allSelected
      return deck
    })
    this.setData({
      bankDecks: decks,
      selectedDeckCount: allSelected ? 0 : decks.length
    })
  },

  favoriteSelectedDecks: function() {
    var selected = this.data.bankDecks.filter(function(deck) { return deck._selected }).map(function(deck) { return deck.name })
    if (!selected.length) { wx.showToast({ title: '请先选择题库', icon: 'none' }); return }
    var favorites = this.data.favoriteDecks.slice()
    selected.forEach(function(name) {
      if (favorites.indexOf(name) === -1) favorites.push(name)
    })
    wx.setStorageSync('favoriteDecks', favorites)
    this.setData({
      favoriteDecks: favorites,
      bankDecks: this.buildBankDecks(this.data.questions, favorites, this.data.createdBanks),
      deckManageMode: false,
      selectedDeckCount: 0
    })
    wx.showToast({ title: '已收藏', icon: 'success' })
  },

  deleteSelectedDecks: function() {
    var that = this
    var selected = this.data.bankDecks.filter(function(deck) { return deck._selected }).map(function(deck) { return deck.name })
    if (!selected.length) { wx.showToast({ title: '请先选择题库', icon: 'none' }); return }
    wx.showModal({
      title: '删除题库',
      content: '删除选中的 ' + selected.length + ' 个题库及其中题目？',
      success: function(res) {
        if (!res.confirm) return
        var questions = (wx.getStorageSync('questions') || []).filter(function(q) {
          var name = q.knowledgePoint || '未分类题库'
          return selected.indexOf(name) === -1
        })
        var favorites = that.data.favoriteDecks.filter(function(name) {
          return selected.indexOf(name) === -1
        })
        wx.setStorageSync('questions', questions)
        wx.setStorageSync('favoriteDecks', favorites)
        // 从 createdBanks 中移除被删除的
        var createdBanks = (wx.getStorageSync('createdBanks') || []).filter(function(b) {
          return selected.indexOf(b.name) === -1
        })
        wx.setStorageSync('createdBanks', createdBanks)
        getApp().globalData.questions = questions
        that.setData({
          questions: questions,
          favoriteDecks: favorites,
          createdBanks: createdBanks,
          bankSummary: that.buildBankSummary(questions),
          bankDecks: that.buildBankDecks(questions, favorites, createdBanks),
          deckManageMode: false,
          selectedDeckCount: 0
        })
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  toggleEditMode: function() {
    var m = !this.data.editMode
    var qs = this.data.questions.map(function(q) { q._selected = false; return q })
    this.setData({ editMode: m, selectedCount: 0, questions: qs })
  },

  selectAll: function() {
    var qs = this.data.questions.map(function(q) { q._selected = true; return q })
    this.setData({ questions: qs, selectedCount: qs.length })
  },

  toggleSelect: function(e) {
    var id = e.currentTarget.dataset.id
    var qs = this.data.questions.map(function(q) { if (q.id === id) q._selected = !q._selected; return q })
    this.setData({ questions: qs, selectedCount: qs.filter(function(q) { return q._selected }).length })
  },

  deleteSelected: function() {
    var that = this
    var n = this.data.selectedCount
    if (n === 0) { wx.showToast({ title: '请先选择题目', icon: 'none' }); return }
    wx.showModal({
      title: '确认删除', content: '删除选中的 ' + n + ' 题？',
      success: function(r) {
        if (r.confirm) {
          var all = wx.getStorageSync('questions') || []
          var ids = that.data.questions.filter(function(q) { return q._selected }).map(function(q) { return q.id })
          all = all.filter(function(q) { return ids.indexOf(q.id) === -1 })
          wx.setStorageSync('questions', all)
          getApp().globalData.questions = all
          that.setData({
            questions: all,
            editMode: false,
            selectedCount: 0,
            bankSummary: that.buildBankSummary(all),
            bankDecks: that.buildBankDecks(all, that.data.favoriteDecks, that.data.createdBanks)
          })
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // ===== 手动添加 =====
  showForm: function() { this.setData({ showForm: true, showImportSheet: false, showUploadPanel: false }) },
  hideForm: function() {
    this.setData({ showForm: false, newQuestion: { stem: '', options: ['', '', '', ''], answer: '', explanation: '', knowledgePoint: '' } })
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
    this.setData({
      questions: qs,
      bankSummary: this.buildBankSummary(qs),
      bankDecks: this.buildBankDecks(qs, this.data.favoriteDecks, this.data.createdBanks)
    })
  }
})
