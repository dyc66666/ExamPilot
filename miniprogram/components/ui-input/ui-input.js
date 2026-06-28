Component({
  options: {
    styleIsolation: 'shared'
  },

  properties: {
    label: String,
    value: String,
    placeholder: String,
    multiline: Boolean
  },

  data: {
    focused: false
  },

  methods: {
    handleInput(e) {
      this.triggerEvent('input', e.detail)
      this.triggerEvent('change', e.detail)
    },

    handleFocus() {
      this.setData({ focused: true })
    },

    handleBlur() {
      this.setData({ focused: false })
    }
  }
})
