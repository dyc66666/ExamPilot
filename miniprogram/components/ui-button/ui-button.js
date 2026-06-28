Component({
  options: {
    styleIsolation: 'shared'
  },

  properties: {
    variant: {
      type: String,
      value: 'primary'
    },
    block: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    handleTap() {
      if (this.data.disabled) return
      this.triggerEvent('tap')
    }
  }
})
