function makeQuestionFromPrompt(prompt) {
  const subject = prompt.includes('导数') ? '导数与函数单调性' : '资料核心概念'
  return {
    id: `ai-${Date.now()}`,
    stem: `根据你上传的资料，关于「${subject}」的正确理解是？`,
    options: [
      '先识别概念，再判断条件和结论之间的关系',
      '只记住答案，不需要理解推导过程',
      '遇到相似题型时直接套用任意公式',
      '忽略题干中的限定条件'
    ],
    answer: 'A',
    explanation: 'AI 助手根据你的需求生成了这道示例题。正式接入模型后，这里会由真实资料解析结果生成。',
    knowledgePoint: subject,
    wrongCount: 0,
    status: 'new',
    source: 'AI助手'
  }
}

function canImportToQuestionBank(text, files) {
  const keywords = ['题库', '整理', '生成题', '选择题', '入库', '导入', '资料']
  return files.length > 0 || keywords.some(keyword => text.includes(keyword))
}

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
    scrollTop: 0
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value })
  },

  useQuickPrompt(e) {
    this.setData({ inputValue: e.currentTarget.dataset.text })
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

  sendMessage() {
    const text = this.data.inputValue.trim()
    const files = this.data.attachedFiles
    if (!text && files.length === 0) {
      wx.showToast({ title: '请输入问题或上传文件', icon: 'none' })
      return
    }

    const userMessage = this.createMessage('user', text || '请帮我分析这些资料', files)
    const assistantMessage = this.buildAssistantReply(text, files)
    const nextMessages = [...this.data.messages, userMessage, assistantMessage]
    const pendingResults = { ...this.data.pendingResults }

    if (assistantMessage.result && assistantMessage.result.question) {
      pendingResults[assistantMessage.id] = assistantMessage.result.question
    }

    this.setData({
      messages: nextMessages,
      inputValue: '',
      attachedFiles: [],
      pendingResults
    }, () => {
      this.scrollToBottom()
    })
  },

  scrollToBottom() {
    this.setData({
      scrollTop: this.data.scrollTop + 100000
    })
  },

  createMessage(role, content, files = [], result = null) {
    const id = `${role}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    return { id, role, content, files, result }
  },

  buildAssistantReply(text, files) {
    if (canImportToQuestionBank(text, files)) {
      const question = makeQuestionFromPrompt(text)
      return this.createMessage(
        'assistant',
        '我已经识别到你的需求是“资料整理/题库生成”。当前先用本地模拟结果生成预览；接入真实 AI 后会读取文件内容并批量生成题目。',
        [],
        {
          title: '已生成 1 道题目预览',
          desc: `知识点：${question.knowledgePoint}。确认后会加入你的专属题库。`,
          canImport: true,
          question
        }
      )
    }

    if (text.includes('冲刺') || text.includes('计划')) {
      return this.createMessage(
        'assistant',
        '建议你先做 30min 错题冲刺：前 10 分钟复盘高自信错题，中间 15 分钟限时练习，最后 5 分钟整理错因。这个需求可以通过错题本和冲刺模式完成。'
      )
    }

    return this.createMessage(
      'assistant',
      '我可以先帮你拆解问题：先找题干关键词，再判断考查的知识点，最后对比选项差异。如果你上传题目图片或文件，我可以继续帮你整理成题库。'
    )
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
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          content: '你好，我是 ExamPilot AI 学习助手。你可以问我学习问题，也可以上传资料并告诉我想整理成什么内容。',
          result: null
        }
      ]
    })
  }
})
