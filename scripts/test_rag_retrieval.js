const path = require('path')

function readFlag(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const subject = process.argv[2] || ''
const knowledgePoint = process.argv[3] || ''
const dataDir = readFlag('--data-dir', '')
const limit = Number(readFlag('--limit', '6')) || 6

if (!subject || !knowledgePoint) {
  console.error('用法: node scripts/test_rag_retrieval.js "科目" "考点" [--data-dir 语料目录] [--limit 6]')
  process.exit(1)
}

if (dataDir) process.env.EXAM_RAG_DATA_DIR = path.resolve(dataDir)

const rag = require('../miniprogram/cloudfunctions/aiParse/exam-rag-knn')
const retrieval = rag.search({ subject: subject, keyPoints: [knowledgePoint] }, [], limit)

console.log(JSON.stringify({
  status: rag.getStatus(),
  query: { subject: subject, knowledgePoint: knowledgePoint },
  retrieval: retrieval
}, null, 2))
