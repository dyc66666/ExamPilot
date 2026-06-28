const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function decorateQuestion(question) {
  if (!question) return null

  const optionItems = (question.options || []).map((text, index) => ({
    label: LETTERS[index],
    text
  })).filter((item) => item.text)

  return {
    ...question,
    optionItems
  }
}

function getProgressClass(current, total) {
  if (!total) return 'progress-0'
  const percent = Math.round((current / total) * 100)
  if (percent >= 100) return 'progress-100'
  if (percent >= 75) return 'progress-75'
  if (percent >= 50) return 'progress-50'
  if (percent >= 25) return 'progress-25'
  return 'progress-10'
}

Page({
  data: {
    questions: [],
    activeQuestions: [],
    currentIndex: 0,
    currentQuestion: null,
    selectedAnswer: '',
    isSubmitted: false,
    isCorrect: false,
    remainingCount: 0,
    progressText: '0/0',
    progressClass: 'progress-0',
    isStarted: false,
    selectedMode: '60',
    currentModeTitle: '60min 强化模式',
    nextButtonText: '下一题',
    modeCards: [
      {
        value: '30',
        title: '30min 冲刺模式',
        desc: '只做最薄弱题和高频失误题',
        effect: '10-15%',
        tone: 'green',
        icon: '轻'
      },
      {
        value: '60',
        title: '60min 强化模式',
        desc: '重点突破错题成因',
        effect: '20-30%',
        tone: 'blue',
        icon: '中'
      },
      {
        value: '120',
        title: '120min 全面模式',
        desc: '全面复习、重扎根基',
        effect: '30-40%',
        tone: 'purple',
        icon: '强'
      }
    ]
  },

  onLoad() {
    this.loadWrongQuestions()
  },

  onShow() {
    if (!this.data.isStarted) {
      this.loadWrongQuestions()
    }
  },

  loadWrongQuestions() {
    const questions = wx.getStorageSync('wrongQuestions') || []
    this.setData({
      questions,
      remainingCount: questions.length
    })
  },

  selectMode(e) {
    this.setData({
      selectedMode: e.currentTarget.dataset.value
    })
  },

  startSprint() {
    if (!this.data.questions.length) {
      wx.showToast({ title: '暂无可冲刺错题', icon: 'none' })
      return
    }

    const selected = this.data.modeCards.find((item) => item.value === this.data.selectedMode)
    const shuffled = [...this.data.questions].sort(() => Math.random() - 0.5)

    this.setData({
      activeQuestions: shuffled,
      isStarted: true,
      currentModeTitle: selected ? selected.title : '错题冲刺',
      currentIndex: 0,
      selectedAnswer: '',
      isSubmitted: false,
      isCorrect: false
    })

    this.syncCurrentQuestion(0, shuffled)
  },

  syncCurrentQuestion(index, questions = this.data.activeQuestions) {
    const total = questions.length
    const current = decorateQuestion(questions[index])
    const answered = index

    this.setData({
      currentIndex: index,
      currentQuestion: current,
      remainingCount: Math.max(total - index, 0),
      progressText: `${Math.min(answered + 1, total)}/${total}`,
      progressClass: getProgressClass(answered, total),
      nextButtonText: index >= total - 1 ? '完成冲刺' : '下一题'
    })
  },

  selectAnswer(e) {
    if (this.data.isSubmitted) return
    this.setData({
      selectedAnswer: e.currentTarget.dataset.value
    })
  },

  handlePrimaryAction() {
    if (this.data.isSubmitted) {
      this.nextQuestion()
      return
    }
    this.submitAnswer()
  },

  submitAnswer() {
    if (!this.data.selectedAnswer) {
      wx.showToast({ title: '请选择答案', icon: 'none' })
      return
    }

    const current = this.data.currentQuestion
    const correct = this.data.selectedAnswer === current.answer

    this.setData({
      isSubmitted: true,
      isCorrect: correct,
      progressClass: getProgressClass(this.data.currentIndex + 1, this.data.activeQuestions.length)
    })

    if (correct) {
      const wrongQuestions = wx.getStorageSync('wrongQuestions') || []
      const updated = wrongQuestions.filter((item) => item.id !== current.id)
      wx.setStorageSync('wrongQuestions', updated)

      const app = getApp()
      app.globalData.wrongQuestions = updated

      this.setData({
        questions: updated
      })
    }
  },

  nextQuestion() {
    const nextIndex = this.data.currentIndex + 1

    if (nextIndex >= this.data.activeQuestions.length) {
      wx.showToast({ title: '冲刺完成', icon: 'success' })
      this.stopSprint()
      return
    }

    this.setData({
      selectedAnswer: '',
      isSubmitted: false,
      isCorrect: false
    })
    this.syncCurrentQuestion(nextIndex)
  },

  stopSprint() {
    this.setData({
      isStarted: false,
      activeQuestions: [],
      currentIndex: 0,
      currentQuestion: null,
      selectedAnswer: '',
      isSubmitted: false,
      isCorrect: false,
      progressText: '0/0',
      progressClass: 'progress-0'
    })
    this.loadWrongQuestions()
  },

  goBack() {
    wx.navigateBack()
  }
})
