const fs = require('fs')
const path = require('path')

const DATA_DIR = process.env.EXAM_RAG_DATA_DIR || path.join(__dirname, 'rag-data')

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeCourseName(value) {
  return normalizeText(value).replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
}

function loadCorpora() {
  const documents = []
  const records = []
  const skippedFiles = []
  const skippedRecords = []
  const seenIds = new Set()
  let files = []
  try {
    files = fs.readdirSync(DATA_DIR).filter(name => name.toLowerCase().endsWith('.json')).sort()
  } catch (error) {
    return { documents, records, skippedFiles: [{ file: DATA_DIR, reason: error.message }], skippedRecords }
  }

  files.forEach(fileName => {
    const filePath = path.join(DATA_DIR, fileName)
    let corpus
    try {
      corpus = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      skippedFiles.push({ file: fileName, reason: 'JSON 读取失败: ' + error.message })
      return
    }
    if (!corpus || corpus.kind !== 'exam_question_corpus' || !Array.isArray(corpus.records)) {
      skippedFiles.push({ file: fileName, reason: '不是 exam_question_corpus' })
      return
    }
    const document = Object.assign({}, corpus.document || {})
    if (document.status === 'staging' || document.status === 'disabled') {
      skippedFiles.push({ file: fileName, reason: '语料状态为 ' + document.status })
      return
    }
    const accepted = []
    corpus.records.forEach((sourceRecord, index) => {
      const record = Object.assign({}, sourceRecord || {})
      const id = String(record.id || '').trim()
      const stem = String(record.stem || '').trim()
      const qualityStatus = record.quality && record.quality.status
      if (!id || !stem || record.status === 'disabled' || record.status === 'review' || qualityStatus === 'blocked') {
        skippedRecords.push({ file: fileName, index, id, reason: !id ? '缺少 id' : (!stem ? '缺少题干' : '题目未发布') })
        return
      }
      if (seenIds.has(id)) {
        skippedRecords.push({ file: fileName, index, id, reason: '跨语料重复 id' })
        return
      }
      seenIds.add(id)
      record.id = id
      record.school = record.school || document.school || ''
      record.course = record.course || document.course || ''
      record.courseKey = record.courseKey || document.courseKey || ''
      record.courseAliases = Array.from(new Set([
        record.course,
        ...(Array.isArray(record.courseAliases) ? record.courseAliases : []),
        ...(Array.isArray(document.courseAliases) ? document.courseAliases : [])
      ].filter(Boolean)))
      record.sourceFile = record.sourceFile || document.sourceFile || fileName
      record.sourceType = record.sourceType || document.sourceType || 'exam'
      record.sourcePages = record.sourcePages || record.sourceUnits || []
      record.sourceLabels = record.sourceLabels || []
      record.topics = Array.isArray(record.topics) ? record.topics : []
      record.options = Array.isArray(record.options) ? record.options : []
      record.retrievalText = record.retrievalText || buildRecordText(record)
      accepted.push(record)
      records.push(record)
    })
    documents.push({
      file: fileName,
      title: document.title || fileName,
      school: document.school || '',
      course: document.course || '',
      courseKey: document.courseKey || '',
      courseAliases: document.courseAliases || [],
      sourceFile: document.sourceFile || fileName,
      sourceType: document.sourceType || 'exam',
      recordCount: accepted.length
    })
  })
  return { documents, records, skippedFiles, skippedRecords }
}

function buildRecordText(record) {
  return [
    record.course || '',
    (record.courseAliases || []).join(' '),
    record.paperYear || '',
    record.sectionTitle || '',
    record.questionType || '',
    (record.topics || []).join(' '),
    record.stem || '',
    (record.options || []).map(option => typeof option === 'string' ? option : option && option.text || '').join(' ')
  ].filter(Boolean).join('\n')
}

const loaded = loadCorpora()
const records = loaded.records
const topicTerms = Array.from(new Set(records.flatMap(record => record.topics || []).filter(Boolean)))

function tokenize(value) {
  const text = normalizeText(value)
  const tokens = []
  const latin = text.match(/[a-z][a-z0-9_+\-]*/g) || []
  latin.forEach(token => {
    if (token.length > 1) tokens.push('l:' + token)
  })
  const numbers = text.match(/\d+(?:\.\d+)?/g) || []
  numbers.forEach(token => tokens.push('n:' + token))
  const chineseGroups = text.match(/[\u4e00-\u9fff]+/g) || []
  chineseGroups.forEach(group => {
    for (let width = 2; width <= 3; width++) {
      for (let index = 0; index <= group.length - width; index++) {
        tokens.push('c:' + group.slice(index, index + width))
      }
    }
  })
  topicTerms.forEach(term => {
    if (text.indexOf(normalizeText(term)) !== -1) tokens.push('t:' + term)
  })
  return tokens
}

function termFrequency(tokens) {
  const counts = new Map()
  tokens.forEach(token => counts.set(token, (counts.get(token) || 0) + 1))
  const maxCount = Math.max(1, ...counts.values())
  const result = new Map()
  counts.forEach((count, token) => result.set(token, 0.5 + 0.5 * count / maxCount))
  return result
}

const documentFrequency = new Map()
records.forEach(record => {
  const unique = new Set(tokenize(record.retrievalText || buildRecordText(record)))
  unique.forEach(token => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1))
})

function inverseDocumentFrequency(token) {
  return Math.log((records.length + 1) / ((documentFrequency.get(token) || 0) + 1)) + 1
}

function buildVector(value) {
  const tf = termFrequency(tokenize(value))
  const weights = new Map()
  let normSquared = 0
  tf.forEach((frequency, token) => {
    const weight = frequency * inverseDocumentFrequency(token)
    weights.set(token, weight)
    normSquared += weight * weight
  })
  return { weights, norm: Math.sqrt(normSquared) || 1 }
}

const indexedRecords = records.map(record => ({
  record,
  vector: buildVector(record.retrievalText || buildRecordText(record))
}))

function cosineSimilarity(left, right) {
  const small = left.weights.size <= right.weights.size ? left : right
  const large = small === left ? right : left
  let dot = 0
  small.weights.forEach((weight, token) => {
    const other = large.weights.get(token)
    if (other) dot += weight * other
  })
  return dot / (left.norm * right.norm)
}

function buildCourseIndex() {
  const aliases = []
  loaded.documents.forEach(document => {
    const values = [document.course, document.courseKey, ...(document.courseAliases || [])]
    values.filter(Boolean).forEach(value => aliases.push({ alias: normalizeCourseName(value), courseKey: document.courseKey }))
  })
  records.forEach(record => {
    const values = [record.course, record.courseKey, ...(record.courseAliases || [])]
    values.filter(Boolean).forEach(value => aliases.push({ alias: normalizeCourseName(value), courseKey: record.courseKey }))
  })
  return aliases.filter(item => item.alias && item.courseKey)
}

const courseIndex = buildCourseIndex()

function resolveCourseKeys(subject) {
  const normalized = normalizeCourseName(subject)
  if (!normalized) return []
  const keys = new Set()
  courseIndex.forEach(item => {
    if (item.alias === normalized || (normalized.length >= 2 && (item.alias.includes(normalized) || normalized.includes(item.alias)))) {
      keys.add(item.courseKey)
    }
  })
  return Array.from(keys)
}

function buildQueryText(analysis, focusPlan) {
  analysis = analysis || {}
  focusPlan = Array.isArray(focusPlan) ? focusPlan : []
  return [
    analysis.subject || '',
    (analysis.chapters || []).join(' '),
    (analysis.keyPoints || []).join(' '),
    focusPlan.map(item => item && item.knowledgePoint || '').join(' ')
  ].filter(Boolean).join('\n')
}

function sharedTopics(record, queryText) {
  const normalizedQuery = normalizeText(queryText)
  return (record.topics || []).filter(topic => normalizedQuery.indexOf(normalizeText(topic)) !== -1)
}

function sanitizeNeighbor(item) {
  const record = item.record
  return {
    id: record.id,
    school: record.school,
    course: record.course,
    courseKey: record.courseKey,
    paperYear: record.paperYear,
    sectionTitle: record.sectionTitle,
    questionType: record.questionType,
    stem: String(record.stem || '').slice(0, 1800),
    options: (record.options || []).slice(0, 10),
    topics: record.topics || [],
    score: record.score,
    requiresFigure: !!record.requiresFigure,
    sourceFile: record.sourceFile,
    sourceType: record.sourceType,
    sourcePages: record.sourcePages || [],
    sourceLabels: record.sourceLabels || [],
    answerStatus: record.answerStatus || (record.answer ? 'provided' : 'missing'),
    similarity: Number(item.similarity.toFixed(4))
  }
}

function search(analysis, focusPlan, limit) {
  analysis = analysis || {}
  const queryText = buildQueryText(analysis, focusPlan)
  const subject = String(analysis.subject || '').trim()
  const courseKeys = resolveCourseKeys(subject)
  const queryVector = buildVector(queryText)
  const eligible = indexedRecords.filter(item => {
    if (!subject) return true
    return courseKeys.length > 0 && courseKeys.includes(item.record.courseKey)
  })
  const candidates = eligible
    .map(item => {
      let similarity = cosineSimilarity(queryVector, item.vector)
      const topics = sharedTopics(item.record, queryText)
      similarity += Math.min(0.12, topics.length * 0.04)
      if (item.record.requiresFigure) similarity *= 0.92
      return { record: item.record, similarity }
    })
    .filter(item => item.similarity > 0.015)
    .sort((left, right) => right.similarity - left.similarity)

  const selected = []
  const sourceCounts = {}
  const maxResults = Math.max(1, Math.min(12, Number(limit) || 6))
  const similarityFloor = candidates.length ? Math.max(0.025, candidates[0].similarity * 0.72) : Infinity
  for (const item of candidates) {
    if (selected.length >= maxResults || item.similarity < similarityFloor) break
    const source = [item.record.sourceFile, item.record.paperYear].filter(Boolean).join('|') || 'unknown'
    if ((sourceCounts[source] || 0) >= 3 && candidates.length > maxResults) continue
    sourceCounts[source] = (sourceCounts[source] || 0) + 1
    selected.push(sanitizeNeighbor(item))
  }

  const selectedDocuments = loaded.documents.filter(document => !subject || courseKeys.includes(document.courseKey))
  return {
    kind: 'local_knn',
    algorithm: 'tfidf-cosine-knn-v2',
    courseKey: courseKeys.length === 1 ? courseKeys[0] : '',
    courseKeys,
    courseMatched: !subject || courseKeys.length > 0,
    queryText,
    corpusTitle: selectedDocuments.map(document => document.title).join('；'),
    corpusSize: records.length,
    eligibleCorpusSize: eligible.length,
    neighbors: selected
  }
}

module.exports = {
  search,
  getStatus: function() {
    return {
      kind: 'exam_question_corpus_collection',
      algorithm: 'tfidf-cosine-knn-v2',
      corpusSize: records.length,
      documentCount: loaded.documents.length,
      documents: loaded.documents,
      skippedFiles: loaded.skippedFiles,
      skippedRecordCount: loaded.skippedRecords.length
    }
  }
}
