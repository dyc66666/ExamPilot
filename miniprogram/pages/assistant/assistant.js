// 云开发已在 app.js 中初始化

Page({
  data: {
    inputValue: '',
    attachedFiles: [],
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: '你好，我是 ExamPilot AI 学习助手。你可以问我学习问题，也可以上传资料并告诉我想整理成什么内容。',
        result: null
      }
    ],
    pendingResults: {},
    scrollTop: 0,
    isNewChat: true,
    sending: false,
    uploadingFiles: false,
    // 题库选择
    showBankPicker: false,
    currentBank: '',
    bankList: []
  },

  onShow() {
    this.loadBankData()
  },

  loadBankData() {
    const createdBanks = wx.getStorageSync('createdBanks') || []
    const currentBank = wx.getStorageSync('currentBank') || ''
    const bankColors = ['#4E7BFF', '#34C759', '#FF9F0A', '#FF453A', '#AF52DE', '#636366']

    const bankList = createdBanks.map((name, index) => ({
      name,
      color: (() => {
        const saved = wx.getStorageSync(`bankColor_${name}`)
        if (saved) return saved
        return bankColors[index % bankColors.length]
      })()
    }))

    this.setData({ bankList, currentBank })
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value })
  },

  useQuickPrompt(e) {
    this.setData({ inputValue: e.currentTarget.dataset.text })
  },

  // ===== 猜你想问点击 =====
  useGuess(e) {
    const text = e.currentTarget.dataset.text
    this.setData({ inputValue: text })
    this.sendMessage()
  },

  chooseFiles() {
    if (this.data.uploadingFiles) return
    const remaining = 3 - this.data.attachedFiles.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多添加 3 个文件', icon: 'none' })
      return
    }

    wx.chooseMessageFile({
      count: remaining,
      type: 'file',
      extension: ['pdf', 'docx', 'pptx'],
      success: async res => {
        const selected = (res.tempFiles || []).filter(file => {
          const name = String(file.name || '').toLowerCase()
          const supported = name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.pptx')
          if (!supported) {
            wx.showToast({ title: '仅支持 PDF、DOCX、PPTX', icon: 'none' })
            return false
          }
          if (Number(file.size) > 50 * 1024 * 1024) {
            wx.showToast({ title: '单个文件不能超过 50MB', icon: 'none' })
            return false
          }
          return true
        })
        if (!selected.length) return
        await this.uploadAssistantFiles(selected)
      },
      fail: err => {
        if (!err.errMsg || err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' })
        }
      }
    })
  },

  async uploadAssistantFiles(files) {
    this.setData({ uploadingFiles: true })
    const uploaded = []
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        wx.showLoading({ title: '上传 ' + (i + 1) + '/' + files.length, mask: true })
        const safeName = String(file.name || 'material')
          .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_')
          .slice(-80)
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: 'assistant-uploads/' + Date.now() + '_' + i + '_' + safeName,
          filePath: file.path || file.tempFilePath
        })
        uploaded.push({
          name: file.name || safeName,
          path: file.path || file.tempFilePath,
          size: Number(file.size) || 0,
          fileID: uploadRes.fileID
        })
      }
      this.setData({ attachedFiles: this.data.attachedFiles.concat(uploaded) })
      wx.showToast({ title: '文件已添加', icon: 'success' })
    } catch (err) {
      if (uploaded.length) this.deleteCloudFiles(uploaded)
      wx.showToast({ title: '文件上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ uploadingFiles: false })
    }
  },

  removeFile(e) {
    const index = e.currentTarget.dataset.index
    const files = [...this.data.attachedFiles]
    const removed = files.splice(index, 1)
    this.setData({ attachedFiles: files })
    this.deleteCloudFiles(removed)
  },

  deleteCloudFiles(files) {
    const fileList = (files || []).map(file => file.fileID).filter(Boolean)
    if (!fileList.length) return
    wx.cloud.deleteFile({ fileList }).catch(() => {})
  },

  async buildAttachmentContext(files) {
    const parts = []
    let remainingChars = 24000
    for (let i = 0; i < files.length && remainingChars > 0; i++) {
      const file = files[i]
      const extractRes = await wx.cloud.callFunction({
        name: 'aiParse',
        data: { fileID: file.fileID, fileName: file.name }
      })
      const result = extractRes.result || {}
      if (!result.success) throw new Error(result.error || (file.name + ' 解析失败'))
      const text = String(result.rawText || '').trim()
      if (!text) throw new Error(file.name + ' 未提取到可复制文字')
      const excerpt = text.slice(0, Math.min(10000, remainingChars))
      parts.push('【附件：' + file.name + '】\n' + excerpt)
      remainingChars -= excerpt.length
    }
    return parts.join('\n\n')
  },

  sendMessage: async function() {
    if (this.data.sending || this.data.uploadingFiles) return

    const text = this.data.inputValue.trim()
    const files = this.data.attachedFiles.slice()
    if (!text && files.length === 0) {
      wx.showToast({ title: '请输入问题或上传文件', icon: 'none' })
      return
    }

    var loadingMessage = this.createMessage('assistant', '...', [], null, true)
    var loadingId = loadingMessage.id

    this.setData({
      messages: [...this.data.messages, this.createMessage('user', text || '请帮我分析这些资料', files), loadingMessage],
      inputValue: '',
      attachedFiles: [],
      isNewChat: false,
      sending: true,
      pendingResults: { ...this.data.pendingResults }
    })

    this.scrollToBottom()

    try {
      var attachmentContext = files.length ? await this.buildAttachmentContext(files) : ''
      var userContent = text || '请分析我上传的学习资料，并提炼重点内容。'
      if (attachmentContext) userContent += '\n\n以下是附件中提取的内容：\n' + attachmentContext
      var res = await wx.cloud.callFunction({
        name: 'aiParse',
        data: {
          mode: 'chat',
          messages: [{ role: 'user', content: userContent }]
        }
      })
      var reply = (res.result && res.result.reply) || 'AI 服务暂时无法回复，请稍后再试'
      this.replaceLoading(loadingId, reply)
    } catch (err) {
      console.error('cloud call failed', err)
      this.replaceLoading(loadingId, err.message || '文件处理失败，请稍后重试')
    } finally {
      this.deleteCloudFiles(files)
    }
  },

  replaceLoading(loadingId, text) {
    const messages = this.data.messages.map(msg => {
      if (msg.id === loadingId) {
        return { ...msg, content: text, loading: false }
      }
      return msg
    })
    this.setData({ messages, sending: false }, () => {
      this.scrollToBottom()
    })
  },

  scrollToBottom() {
    this.setData({
      scrollTop: this.data.scrollTop + 100000
    })
  },

  createMessage(role, content, files = [], result = null, loading = false) {
    const id = `${role}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    return { id, role, content, files, result, loading }
  },

  importResult(e) {
    const id = e.currentTarget.dataset.id
    const question = this.data.pendingResults[id]
    if (!question) {
      wx.showToast({ title: '没有可入库内容', icon: 'none' })
      return
    }

    const questions = wx.getStorageSync('questions') || []
    questions.unshift({ ...question, id: `ai-${Date.now()}` })
    wx.setStorageSync('questions', questions)
    getApp().globalData.questions = questions

    const pendingResults = { ...this.data.pendingResults }
    delete pendingResults[id]
    const messages = this.data.messages.map(message => {
      if (message.id !== id || !message.result) return message
      return {
        ...message,
        result: {
          ...message.result,
          canImport: false,
          title: '已加入专属题库',
          desc: '你可以在题库页查看，也可以直接开始学习测评。'
        }
      }
    })

    this.setData({ messages, pendingResults }, () => {
      this.scrollToBottom()
    })
    wx.showToast({ title: '已加入题库', icon: 'success' })
  },

  clearChat() {
    this.deleteCloudFiles(this.data.attachedFiles)
    this.setData({
      inputValue: '',
      attachedFiles: [],
      pendingResults: {},
      scrollTop: 0,
      isNewChat: true,
      sending: false,
      uploadingFiles: false,
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          content: '你好，我是 ExamPilot AI 学习助手。你可以问我学习问题，也可以上传资料并告诉我想整理成什么内容。',
          result: null
        }
      ]
    })
  },

  // ===== 题库选择弹窗 =====
  openBankPicker() {
    this.loadBankData()
    this.setData({ showBankPicker: true })
  },

  closeBankPicker() {
    this.setData({ showBankPicker: false })
  },

  selectBank(e) {
    const name = e.currentTarget.dataset.name
    wx.setStorageSync('currentBank', name)
    this.setData({
      currentBank: name,
      showBankPicker: false
    })
    wx.showToast({ title: `已切换至「${name}」`, icon: 'none' })
  },

  noop() {
    // 空函数，阻止冒泡
  }
})
