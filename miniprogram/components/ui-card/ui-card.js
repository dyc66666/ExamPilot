Component({
  options: {
    styleIsolation: 'shared'
  },

  properties: {
    title: {
      type: String,
      value: ''
    },
    subtitle: {
      type: String,
      value: ''
    },
    compact: {
      type: Boolean,
      value: false
    }
  }
})
