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

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeMathDelimiters(text) {
  return String(text || '')
    .replace(/\\\[([\s\S]*?)\\\]/g, function(_, formula) {
      return '$$' + formula + '$$'
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, function(_, formula) {
      return '$' + formula + '$'
    })
}

function isStandaloneFormula(text) {
  var value = String(text || '').trim()
  if (!value || /[\u3400-\u9fff]/.test(value)) return false
  if (/\\(?:frac|sqrt|int|sum|prod|lim|begin|hat|vec|overline|sin|cos|tan|log|ln)\b/.test(value)) return true
  if (/[_^]\{[^{}]+\}/.test(value)) return true
  if (/[∫∑√∞≠≈≤≥]/.test(value)) return true
  if (/[=<>]/.test(value) && /[A-Za-z\u0370-\u03ff]/.test(value)) return true
  return /[A-Za-z\u0370-\u03ff][A-Za-z0-9]*\s*[\(（][^\)）]+[\)）]/.test(value)
}

function normalizeUnicodeFormula(text) {
  var value = String(text || '')
    .replace(/∫[₋-]∞[⁺+]∞/g, '\\int_{-\\infty}^{+\\infty}')
    .replace(/∫_\([−-]∞\)\^\([+]∞\)/g, '\\int_{-\\infty}^{+\\infty}')
    .replace(/−/g, '-')
    .replace(/∫/g, '\\int ')
    .replace(/∑/g, '\\sum ')
    .replace(/√/g, '\\sqrt ')
    .replace(/∞/g, '\\infty ')
    .replace(/×/g, '\\times ')
    .replace(/·/g, '\\cdot ')
    .replace(/≤/g, '\\le ')
    .replace(/≥/g, '\\ge ')
    .replace(/≠/g, '\\ne ')
    .replace(/≈/g, '\\approx ')

  var superscript = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
    'ⁱ': 'i', 'ⁿ': 'n', 'ᵗ': 't'
  }
  var subscript = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')'
  }
  value = value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿᵗ]+/g, function(part) {
    return '^{' + part.split('').map(function(char) { return superscript[char] }).join('') + '}'
  })
  value = value.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]+/g, function(part) {
    return '_{' + part.split('').map(function(char) { return subscript[char] }).join('') + '}'
  })
  return value.trim()
}

function toMathHtml(text, options) {
  var value = normalizeMathDelimiters(text).trim()
  var settings = options || {}
  if (!value) return ''

  if (value.indexOf('$') === -1 && settings.autoFormula !== false && isStandaloneFormula(value)) {
    var formula = normalizeUnicodeFormula(value)
    value = settings.displayMode ? '$$' + formula + '$$' : '$' + formula + '$'
  }

  return value.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/).map(function(part) {
    if (!part) return ''
    if (part.slice(0, 2) === '$$' || (part.charAt(0) === '$' && part.charAt(part.length - 1) === '$')) {
      return escapeHtml(part)
    }
    return escapeHtml(part).replace(/\r?\n/g, '<br>')
  }).join('')
}

function normalizeDuplicateText(text) {
  return String(text || '')
    .replace(/^\s*\d+\s*[.．、]\s*/, '')
    .replace(/\s+/g, '')
    .replace(/[，。；：、,.．:;()（）【】\[\]]/g, '')
    .toUpperCase()
}

function duplicateTextSimilarity(left, right) {
  left = String(left || '')
  right = String(right || '')
  if (left === right) return left ? 1 : 0
  if (left.length < 4 || right.length < 4) return 0
  var leftParts = {}
  var rightParts = {}
  var i
  for (i = 0; i < left.length - 1; i++) leftParts[left.slice(i, i + 2)] = true
  for (i = 0; i < right.length - 1; i++) rightParts[right.slice(i, i + 2)] = true
  var leftKeys = Object.keys(leftParts)
  var rightKeys = Object.keys(rightParts)
  var intersection = 0
  for (i = 0; i < leftKeys.length; i++) {
    if (rightParts[leftKeys[i]]) intersection++
  }
  return (2 * intersection) / (leftKeys.length + rightKeys.length)
}

function areLikelyDuplicateQuestions(left, right) {
  var leftStem = normalizeDuplicateText(left && left.stem).slice(0, 180)
  var rightStem = normalizeDuplicateText(right && right.stem).slice(0, 180)
  if (!leftStem || !rightStem) return false
  if (leftStem === rightStem) return true
  var leftPoint = normalizeDuplicateText(left && left.knowledgePoint)
  var rightPoint = normalizeDuplicateText(right && right.knowledgePoint)
  if (leftPoint && rightPoint && leftPoint !== rightPoint) return false
  var negativePattern = /不正确|错误|不包括|不能|不是|不属于|除外|有误/
  if (negativePattern.test(left && left.stem || '') !== negativePattern.test(right && right.stem || '')) return false
  var stemSimilarity = duplicateTextSimilarity(leftStem, rightStem)
  var leftOptions = normalizeDuplicateText((left && left.options || []).join('|'))
  var rightOptions = normalizeDuplicateText((right && right.options || []).join('|'))
  var optionSimilarity = duplicateTextSimilarity(leftOptions, rightOptions)
  if (stemSimilarity >= 0.92 && optionSimilarity >= 0.45) return true
  if (leftPoint && leftPoint === rightPoint && stemSimilarity >= 0.82 && optionSimilarity >= 0.6) return true
  if (leftPoint && leftPoint === rightPoint && stemSimilarity >= 0.6 && optionSimilarity >= 0.8) return true
  return stemSimilarity >= 0.65 && optionSimilarity >= 0.88
}

function findDuplicateQuestionIndexes(questions) {
  var list = questions || []
  var duplicateIndexes = []
  for (var i = 0; i < list.length; i++) {
    for (var j = 0; j < i; j++) {
      if (areLikelyDuplicateQuestions(list[i], list[j])) {
        duplicateIndexes.push(i)
        break
      }
    }
  }
  return duplicateIndexes
}

module.exports = {
  formatMathText: formatMathText,
  normalizeAnswer: normalizeAnswer,
  randomizeQuestionOptions: randomizeQuestionOptions,
  toMathHtml: toMathHtml,
  areLikelyDuplicateQuestions: areLikelyDuplicateQuestions,
  findDuplicateQuestionIndexes: findDuplicateQuestionIndexes
}
