Component({
  options: {
    styleIsolation: 'shared'
  },

  properties: {
    items: Array,
    active: String
  },

  methods: {
    handleTap(e) {
      this.triggerEvent('change', { value: e.currentTarget.dataset.value })
    }
  }
})
