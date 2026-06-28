Component({
  options: {
    styleIsolation: 'shared'
  },

  properties: {
    title: String,
    subtitle: String,
    back: Boolean,
    logo: Boolean
  },

  methods: {
    handleBack() {
      this.triggerEvent('back')
    }
  }
})
