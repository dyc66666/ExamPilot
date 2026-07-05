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
    const mockFile = {
      name: '模拟学习资料.pdf',
      path: `mock-file-${Date.now()}`,
      size: 0
    }
    this.setData({
      attachedFiles: [...this.data.attachedFiles, mockFile]
    })
    wx.showToast({ title: '已添加模拟附件', icon: 'none' })
  },

  removeFile(e) {
    const index = e.currentTarget.dataset.index
    const files = [...this.data.attachedFiles]
    files.splice(index, 1)
    this.setData({ attachedFiles: files })
  },

  sendMessage: async function() {
    if (this.data.sending) return

    const text = this.data.inputValue.trim()
    const files = this.data.attachedFiles
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
      var res = await wx.cloud.callFunction({
        name: 'aiParse',
        data: {
          mode: 'chat',
          messages: [{ role: 'user', content: text }]
        }
      })
      var reply = (res.result && res.result.reply) || 'AI 服务暂时无法回复，请稍后再试'
      this.replaceLoading(loadingId, reply)
    } catch (err) {
      console.error('cloud call failed', err)
      this.replaceLoading(loadingId, 'AI 服务暂时无法回复，请稍后再试')
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
    this.setData({
      inputValue: '',
      attachedFiles: [],
      pendingResults: {},
      scrollTop: 0,
      isNewChat: true,
      sending: false,
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
