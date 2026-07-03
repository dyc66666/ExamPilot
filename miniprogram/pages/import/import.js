Page({
  data: {
    questions: [],
    isParsing: false,
    isUploading: false,
    errorMsg: '',
    parseWarning: '',
    progress: '',
    parsedQuestions: [],
    duplicateCount: 0,
    duplicateGroupCount: 0,
    duplicateExtraCount: 0,
    activeParsedIndex: -1,
    activeParsedQuestion: null,
    showParsedEditor: false,
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
    this.setData({ isUploading: true, errorMsg: '', parseWarning: '', progress: '' })
    wx.showLoading({ title: '上传中...' })
    try {
      var uploadRes = await wx.cloud.uploadFile({
        cloudPath: 'uploads/' + Date.now() + '_' + file.name,
        filePath: file.path
      })

      var name = (file.name || '').toLowerCase()

      if (name.endsWith('.pdf')) {
        await this.processPDF(uploadRes.fileID, file.name)
      } else {
        await this.processChunked(uploadRes.fileID, file.name)
      }
    } catch(err) {
      wx.hideLoading()
      this.setData({ isParsing: false, isUploading: false, errorMsg: err.errMsg || err.message || '错误' })
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
      return String(option || '').trim()
    }).filter(function(option) {
      return option
    })
    q.answer = this.normalizeAnswerLetters(q.answer)
    q.explanation = String(q.explanation || '').trim()
    q.knowledgePoint = String(q.knowledgePoint || '').trim()
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
    this.setData({ isParsing: false, progress: '', parsedQuestions: display })
    if (allQuestions.length === 0) wx.showToast({ title: '未识别到题目', icon: 'none' })
  },

  processPDF: async function(fileID, fileName) {
    wx.showLoading({ title: '提取页面...' })
    var pagesRes = await wx.cloud.callFunction({
      name: 'aiParse',
      data: { fileID: fileID, fileName: fileName, mode: 'extractPages' }
    })
    wx.hideLoading()
    if (!pagesRes.result || !pagesRes.result.success) {
      this.setData({ isUploading: false, errorMsg: pagesRes.result.error || '页面提取失败' })
      return
    }
    var pages = pagesRes.result.pages || []
    if (!pages.length) {
      this.setData({ isUploading: false, errorMsg: 'PDF 未提取到文字' })
      return
    }

    this.setData({ isUploading: false, isParsing: true, progress: '识别题块中...' })
    var blocks = this.buildQuestionBlocksFromPages(pages)
    var allQuestions = await this.parseQuestionBlocks(blocks)
    this.finishParsedQuestions(allQuestions)
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
      this.setData({ isUploading: false, errorMsg: extractRes.result.error || '提取失败' })
      return
    }
    var rawText = extractRes.result.rawText || ''
    this.setData({ isUploading: false, isParsing: true, progress: '识别题块中...' })
    var blocks = this.buildQuestionBlocksFromText(rawText)
    var allQuestions = await this.parseQuestionBlocks(blocks)
    this.finishParsedQuestions(allQuestions)
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
    var answer = this.normalizeAnswerLetters(q && q.answer || '')
    var options = (q && q.options || []).map(function(option) {
      return String(option || '').replace(/\s+/g, '').replace(/[，。；：、,.．:;()（）【】\[\]]/g, '').toUpperCase()
    }).join('|')
    return stem.slice(0, 80) + '||' + answer + '||' + options
  },

  markDuplicateQuestions: function(list) {
    var groups = {}
    for (var i = 0; i < list.length; i++) {
      var q = list[i]
      q._duplicate = false
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
        duplicateCount++
      }
    }
    this.setData({ duplicateCount: duplicateCount, duplicateGroupCount: groupNo, duplicateExtraCount: duplicateCount - groupNo })
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
    var qs = this.data.parsedQuestions.map(function(q) {
      if (q._duplicate) q._checked = false
      return q
    })
    this.setData({ parsedQuestions: qs })
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
    var questions = wx.getStorageSync('questions') || []
    checked.forEach(function(q) {
      delete q._checked
      delete q._warn
      delete q._duplicate
      delete q._duplicateGroup
      delete q._duplicateLabel
      q.wrongCount = 0
      q.status = 'new'
      questions.unshift(q)
    })
    wx.setStorageSync('questions', questions)
    getApp().globalData.questions = questions
    wx.showToast({ title: '已入库 ' + checked.length + ' 题', icon: 'success' })
    this.setData({ parsedQuestions: [], warnCount: 0, duplicateCount: 0, duplicateGroupCount: 0, duplicateExtraCount: 0 })
    this.setData({ questions: wx.getStorageSync('questions') || [] })
  },

  // ===== 题库管理 =====
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
          that.setData({ questions: all, editMode: false, selectedCount: 0 })
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // ===== 手动添加 =====
  showForm: function() { this.setData({ showForm: true }) },
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
    this.setData({ questions: wx.getStorageSync('questions') || [] })
  }
})
