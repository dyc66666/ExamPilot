var LETTERS = 'ABCDEFGHIJ'

function normalizeAnswer(answer) {
  return String(answer || '').toUpperCase().replace(/[^A-J]/g, '')
}

function hashText(text) {
  var hash = 2166136261
  var value = String(text || '')
  for (var i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed) {
  var state = seed >>> 0
  return function() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function randomizeQuestionOptions(question, sequenceIndex) {
  var q = Object.assign({}, question || {})
  var options = (q.options || []).map(function(option) {
    return typeof option === 'string' ? option : String(option && option.text || '')
  }).filter(function(option) { return option.trim() })
  var answer = normalizeAnswer(q.answer)

  if (q._optionsRandomized || options.length < 2 || !answer) {
    q.options = options
    return q
  }

  var correctIndexes = answer.split('').map(function(letter) {
    return LETTERS.indexOf(letter)
  }).filter(function(index) {
    return index >= 0 && index < options.length
  })
  if (!correctIndexes.length) {
    q.options = options
    return q
  }

  var seed = hashText((q.stem || '') + '|' + options.join('|'))
  var random = seededRandom(seed)
  var order = options.map(function(_, index) { return index })
  for (var i = order.length - 1; i > 0; i--) {
    var swapIndex = Math.floor(random() * (i + 1))
    var temp = order[i]
    order[i] = order[swapIndex]
    order[swapIndex] = temp
  }

  // 单选题额外均衡答案位置，避免同一批 AI 题集中在 A。
  if (correctIndexes.length === 1) {
    var currentPosition = order.indexOf(correctIndexes[0])
    var targetPosition = Math.abs(Number(sequenceIndex) || 0) % order.length
    var currentValue = order[targetPosition]
    order[targetPosition] = correctIndexes[0]
    order[currentPosition] = currentValue
  }

  q.options = order.map(function(originalIndex) { return options[originalIndex] })
  q.answer = order.map(function(originalIndex, newIndex) {
    return correctIndexes.indexOf(originalIndex) > -1 ? LETTERS[newIndex] : ''
  }).filter(Boolean).join('')
  q._optionsRandomized = true
  return q
}

var SUPER = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'i': 'ⁱ', 'n': 'ⁿ', 't': 'ᵗ'
}
var SUB = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎'
}

function mapScript(value, table, marker) {
  var chars = String(value || '').split('')
  var canMapAll = chars.every(function(char) { return !!table[char] })
  if (!canMapAll) {
    return marker + '(' + chars.join('').replace(/-/g, '−') + ')'
  }
  return chars.map(function(char) { return table[char] }).join('')
}

function formatMathText(text) {
  var value = String(text || '')
  var greek = {
    '\\omega': 'ω', '\\xi': 'ξ', '\\theta': 'θ', '\\pi': 'π',
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\lambda': 'λ',
    '\\mu': 'μ', '\\sigma': 'σ', '\\Delta': 'Δ'
  }
  Object.keys(greek).forEach(function(command) {
    value = value.split(command).join(greek[command])
  })
  value = value
    .replace(/\\infty/g, '∞')
    .replace(/\\int/g, '∫')
    .replace(/\\sum/g, '∑')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\hat\{([^{}])\}/g, '$1̂')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\^\{([^{}]+)\}/g, function(_, part) { return mapScript(part, SUPER, '^') })
    .replace(/_\{([^{}]+)\}/g, function(_, part) { return mapScript(part, SUB, '_') })
    .replace(/\^([0-9+\-=int])/g, function(_, part) { return mapScript(part, SUPER, '^') })
    .replace(/_([0-9+\-=])/g, function(_, part) { return mapScript(part, SUB, '_') })
    .replace(/\\(?:mathrm|text)\{([^{}]+)\}/g, '$1')
    .replace(/\\[,;! ]/g, ' ')
    .replace(/\$|\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return value
}

module.exports = {
  formatMathText: formatMathText,
  normalizeAnswer: normalizeAnswer,
  randomizeQuestionOptions: randomizeQuestionOptions
}
