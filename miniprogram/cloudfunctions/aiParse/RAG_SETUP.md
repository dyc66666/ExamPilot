# 通用开发者 RAG 导入系统

公共 RAG 只能由开发者维护。用户上传的 PDF、Word、PPT 只用于限定本次复习范围，不会自动进入公共 RAG。

## 系统组成

- `scripts/rag_corpus_tool.py`：通用离线导入、校验、发布工具。
- `scripts/test_rag_retrieval.js`：本地 KNN 检索测试工具。
- `rag-data/*.json`：已审核并随 `aiParse` 云函数部署的公共语料。
- `exam-rag-knn.js`：云函数内自动加载全部已发布 JSON，执行 TF-IDF 余弦 KNN。

支持导入：PDF、DOCX、PPTX、TXT、Markdown、JSON、CSV。

## 安全工作流

```text
来源文件
  -> import 生成 staging JSON
  -> 查看 report.json 和 review.csv
  -> 修正题干、选项、答案、考点或来源
  -> validate 质量校验
  -> publish 显式审核发布
  -> 本地检索测试
  -> 部署 aiParse 云函数
```

导入阶段不会直接写入 `rag-data`，避免错误解析污染公共知识库。

## 1. 导入

```powershell
python scripts/rag_corpus_tool.py import "F:\资料\高数历年题.pdf" `
  --output "rag-staging\higher-math.json" `
  --course "高等数学" `
  --course-key "advanced_math" `
  --aliases "高数,微积分,Calculus" `
  --school "某大学" `
  --year "2021-2025" `
  --title "某大学高等数学历年期末题" `
  --source-type "past_exam" `
  --has-official-answers
```

输出三个文件：

- `higher-math.json`：待发布的标准语料。
- `higher-math.report.json`：数量、题型、阻断项、孤立文本和重复页眉报告。
- `higher-math.review.csv`：可用 Excel 核对的逐题审核表。

`course-key` 必须稳定。同一科目的不同资料必须使用相同值，例如高数统一使用 `advanced_math`。

## 2. 切分规则

默认采用保守的结构化切分：

- 顶层题号：`1.`、`1、`、`第1题`。
- 章节：`一、选择题`、`第一章`、`计算题`等。
- 选项：大写或小写字母、带圈数字、同行多选项。
- `(1)(2)(3)` 默认视为一道大题内部的子问，不拆成多道题。
- 没有顶层题号时，通过题干和连续选项建立题目。
- PDF 跨页时，只要没有出现新题边界，就继续拼接当前题。
- 重复页眉、页脚和独立页码会自动清理。

某个来源使用特殊题号时，可增加自定义正则。正则必须有两个捕获组：题号和题干。

```powershell
python scripts/rag_corpus_tool.py import "F:\资料\题库.pdf" `
  --output "rag-staging\course.json" `
  --course "课程名" `
  --course-key "course_key" `
  --question-regex '^\s*[（(](\d+)[）)]\s*(.*)$'
```

## 3. 质量校验

```powershell
python scripts/rag_corpus_tool.py validate "rag-staging\higher-math.json"
```

阻断发布的问题：

- 题干缺失或过短。
- 选择题少于两个选项。
- 存在空选项。
- JSON 结构错误或题目 ID 重复。

需要人工核对但允许发布的问题：缺答案、依赖原图、题干重复。没有官方答案的真题可以用于参考考法，但 `answerStatus` 必须保持 `missing`。

## 4. 发布

确认已经检查 `review.csv` 后执行：

```powershell
python scripts/rag_corpus_tool.py publish "rag-staging\higher-math.json" `
  --target-dir "miniprogram\cloudfunctions\aiParse\rag-data" `
  --approve
```

替换同名已发布语料时额外添加 `--replace`。发布工具会检查其他语料中的重复 ID，并把题目状态改为 `active`。

## 5. 本地检索测试

```powershell
node scripts/test_rag_retrieval.js "高等数学" "洛必达法则" --limit 6
```

重点检查：

- `courseMatched` 是否为 `true`。
- `eligibleCorpusSize` 是否只包含当前科目。
- 前几个 `neighbors` 是否属于正确考点。
- 没有该科目语料时是否返回空数组，而不是其他科目的题。

也可以在云函数测试页面调用：

```json
{
  "mode": "retrieveExamNeighbors",
  "analysis": {
    "subject": "高等数学",
    "keyPoints": ["洛必达法则"]
  },
  "focusPlan": [
    { "knowledgePoint": "未定式极限", "questionCount": 3 }
  ],
  "limit": 6
}
```

## 6. 部署

在微信开发者工具中右键 `cloudfunctions/aiParse`，选择：

```text
上传并部署：云端安装依赖
```

顶部“小程序上传”不会部署云函数中的新语料。

## 检索约束

- 课程名称和 `courseAliases` 先用于严格科目过滤，再执行 KNN。
- 未发布对应科目的语料时返回空近邻，禁止跨科目借题。
- 用户资料决定知识范围，RAG 只提供真实考试的题型、设问层次和难度参考。
- 生成题必须更换原题中的数字、序列、代码或情境，不能复制整道题。
- 依赖图片的近邻只能参考考法，新题必须补全全部作答条件。
