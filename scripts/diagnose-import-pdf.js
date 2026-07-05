const fs = require('fs')
const path = require('path')
const vm = require('vm')

const pdfPath = process.argv[2]
if (!pdfPath) {
  console.error('Usage: node scripts/diagnose-import-pdf.js <pdf-path>')
  process.exit(1)
}

const repo = path.resolve(__dirname, '..')
const importJs = fs.readFileSync(path.join(repo, 'miniprogram/pages/import/import.js'), 'utf8')
let page
vm.runInNewContext(importJs, {
  Page: function(obj) { page = obj },
  wx: { showToast: function() {} },
  getApp: function() { return {} }
})

const pdfParse = require(path.join(repo, 'miniprogram/cloudfunctions/aiParse/node_modules/pdf-parse'))

async function main() {
  const buf = fs.readFileSync(pdfPath)
  const pages = []
  await pdfParse(buf, {
    pagerender: function(pageData) {
      return pageData.getTextContent().then(function(textContent) {
        let lastY
        let text = ''
        const items = textContent.items || []
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const y = item.transform ? item.transform[5] : 0
          if (lastY !== undefined && Math.abs(y - lastY) > 5) {
            text += '\n'
          } else if (text.length > 0 && !text.endsWith('\n')) {
            text += ' '
          }
          text += item.str
          lastY = y
        }
        text = text.replace(/\n\s*\d+\s*\/\s*\d+\s*\n/g, '\n')
        pages.push({ pageNo: pageData.pageIndex + 1, text: text.trim() })
        return text
      })
    }
  })

  const blocks = page.buildQuestionBlocksFromPages(pages)
  const parsed = []
  const failed = []
  blocks.forEach(function(block, index) {
    const q = page.parseQuestionBlockLocally(block)
    if (q) parsed.push({ index, q, block })
    else failed.push({ index, block })
  })

  const warnings = []
  parsed.forEach(function(item) {
    const q = item.q
    const warn = []
    if (!q.stem || !q.stem.trim()) warn.push('no stem')
    if (!q.options || q.options.length < 2) warn.push('few options')
    if (!q.answer || !q.answer.trim()) warn.push('no answer')
    if (q.answer && q.options && q.options.length) {
      const labels = 'ABCDEFGHIJ'.slice(0, q.options.length)
      const ansLetters = q.answer.replace(/[^A-Z]/g, '').split('')
      for (let i = 0; i < ansLetters.length; i++) {
        if (labels.indexOf(ansLetters[i]) === -1) {
          warn.push('answer outside options')
          break
        }
      }
    }
    if (warn.length) warnings.push({ index: item.index, warn, q, block: item.block })
  })

  const stems = {}
  const duplicates = []
  parsed.forEach(function(item) {
    const key = (item.q.stem || '').replace(/\s+/g, '').slice(0, 40)
    if (!key) return
    if (stems[key] !== undefined) duplicates.push({ first: stems[key], second: item.index, stem: item.q.stem })
    else stems[key] = item.index
  })

  console.log(JSON.stringify({
    pdfPath,
    pages: pages.length,
    blocks: blocks.length,
    parsed: parsed.length,
    failedBlocks: failed.length,
    warnings: warnings.length,
    duplicates: duplicates.length,
    warningSamples: warnings.slice(0, 12).map(summarize),
    failedSamples: failed.slice(0, 8).map(function(item) {
      return { index: item.index, text: item.block.text.slice(0, 500) }
    }),
    duplicateSamples: duplicates.slice(0, 8)
  }, null, 2))
}

function summarize(item) {
  return {
    index: item.index,
    warn: item.warn,
    stem: item.q.stem,
    answer: item.q.answer,
    optionCount: item.q.options ? item.q.options.length : 0,
    options: item.q.options,
    blockText: item.block.text.slice(0, 600)
  }
}

main().catch(function(err) {
  console.error(err && err.stack || err)
  process.exit(1)
})
