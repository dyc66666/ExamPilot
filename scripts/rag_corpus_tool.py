import argparse
import csv
import hashlib
import json
import math
import re
import sys
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree


SCHEMA_VERSION = 2
CORPUS_KIND = "exam_question_corpus"
SUPPORTED_SUFFIXES = {".pdf", ".docx", ".pptx", ".txt", ".md", ".json", ".csv"}
QUESTION_PATTERNS = [
    re.compile(r"^\s*第\s*(\d{1,4})\s*题\s*[.．、:：]?\s*(.*)$"),
    re.compile(r"^\s*(\d{1,4})\s*[.．、:：]\s*(.*)$"),
]
SECTION_PATTERNS = [
    re.compile(r"^\s*[一二三四五六七八九十百]+\s*[、.．]\s*\S+"),
    re.compile(r"^\s*第\s*[一二三四五六七八九十百\d]+\s*(?:章|节|部分|单元)\s*\S*"),
    re.compile(r"^\s*(?:单项选择题|多项选择题|选择题|判断题|填空题|简答题|计算题|证明题|论述题|应用题|综合题|算法设计题)\s*$"),
]
LETTER_OPTION_RE = re.compile(
    r"^\s*(?:[（(]\s*)?([A-Ha-h])\s*(?:[）)]\s*|[．、:：]\s*|\.(?:\s+|(?=[^A-Za-z_]|$)))(.*)$"
)
NUMBER_OPTION_RE = re.compile(r"^\s*(?:[（(]\s*)?([1-9]|10)\s*(?:[）)]|[.．、:：])\s*(.*)$")
CIRCLED_OPTION_RE = re.compile(r"^\s*([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)$")
INLINE_OPTION_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:[（(]\s*)?([A-Ha-h])\s*(?:[）)]\s*|[．、:：]\s*|\.(?:\s+|(?=[^A-Za-z_]|$)))"
)
INLINE_CIRCLED_RE = re.compile(r"([①②③④⑤⑥⑦⑧⑨⑩])\s*")
ANSWER_RE = re.compile(r"^\s*(?:正确答案|参考答案|答案)\s*[:：]?\s*(.*)$")
EXPLANATION_RE = re.compile(r"^\s*(?:解析|解答|分析|答案解析)\s*[:：]?\s*(.*)$")
ANSWER_SECTION_RE = re.compile(r"^\s*(?:参考答案|答案速查|答案汇总|试题答案)\s*[:：]?\s*$")
ANSWER_ITEM_RE = re.compile(r"(?:^|\s)(\d{1,4})\s*[.．、:：]?\s*([A-Ha-h]+|正确|错误|对|错|√|×)(?=\s|$)")
PAGE_NUMBER_RE = re.compile(r"^\s*(?:第\s*)?\d{1,4}\s*(?:页)?\s*(?:/\s*\d{1,4})?\s*$")
FIGURE_RE = re.compile(r"如图|下图|上图|题图|图\s*\d|右图|左图|图中|见图|根据图|画出.*(?:树|图)|存储如下")
CHOICE_SECTION_RE = re.compile(r"选择|单选|多选|客观题")
QUESTION_CUE_RE = re.compile(
    r"[?？]$|^(?:题目|问题|例题|练习题|思考题)\s*[:：]|请选择|求(?:出|解)?|计算|证明|判断|简述|为什么|如何"
)
PAPER_YEAR_RE = re.compile(r"((?:19|20)\d{2})\s*[-—至]\s*((?:19|20)\d{2})\s*(?:学年)?")
CIRCLED_LABELS = "①②③④⑤⑥⑦⑧⑨⑩"
LETTERS = "ABCDEFGHIJ"


@dataclass
class SourceUnit:
    index: int
    label: str
    lines: list


def clean_line(value):
    value = str(value or "").replace("\u00a0", " ").replace("\u200b", "")
    return re.sub(r"[ \t]+", " ", value).strip()


def slug_key(value):
    normalized = re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")
    if normalized:
        return normalized
    digest = hashlib.sha1(str(value or "course").encode("utf-8")).hexdigest()[:10]
    return "course_" + digest


def natural_number(path):
    match = re.search(r"(\d+)(?=\.xml$)", str(path))
    return int(match.group(1)) if match else 0


def xml_paragraph_lines(xml_bytes, text_tag_suffix):
    root = ElementTree.fromstring(xml_bytes)
    lines = []
    for paragraph in root.iter():
        if not paragraph.tag.endswith("}p"):
            continue
        pieces = []
        for node in paragraph.iter():
            if any(node.tag.endswith(suffix) for suffix in text_tag_suffix) and node.text:
                pieces.append(node.text)
            elif node.tag.endswith("}tab"):
                pieces.append("\t")
            elif node.tag.endswith("}br"):
                pieces.append("\n")
        for value in "".join(pieces).splitlines():
            value = clean_line(value)
            if value:
                lines.append(value)
    return lines


def extract_pdf(path):
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("解析 PDF 需要 pdfplumber，请先运行 pip install pdfplumber") from exc
    units = []
    with pdfplumber.open(str(path)) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
            lines = [clean_line(line) for line in text.splitlines() if clean_line(line)]
            units.append(SourceUnit(index, "第{}页".format(index), lines))
    return units


def extract_docx(path):
    with zipfile.ZipFile(path) as archive:
        name = "word/document.xml"
        if name not in archive.namelist():
            raise RuntimeError("DOCX 中缺少 word/document.xml")
        lines = xml_paragraph_lines(archive.read(name), ("}t",))
    return [SourceUnit(1, "文档", lines)]


def extract_pptx(path):
    units = []
    with zipfile.ZipFile(path) as archive:
        slide_names = sorted(
            (name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
            key=natural_number,
        )
        for index, name in enumerate(slide_names, start=1):
            lines = xml_paragraph_lines(archive.read(name), ("}t",))
            units.append(SourceUnit(index, "第{}张幻灯片".format(index), lines))
    return units


def extract_text(path):
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    chunks = re.split(r"\f|\n\s*---+\s*\n", text)
    return [
        SourceUnit(index, "第{}段".format(index), [clean_line(line) for line in chunk.splitlines() if clean_line(line)])
        for index, chunk in enumerate(chunks, start=1)
    ]


def extract_units(path):
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_pdf(path)
    if suffix == ".docx":
        return extract_docx(path)
    if suffix == ".pptx":
        return extract_pptx(path)
    if suffix in {".txt", ".md"}:
        return extract_text(path)
    raise RuntimeError("{} 需要按结构化题库导入，不能按普通文档提取".format(suffix))


def is_question_start(line, custom_patterns):
    for pattern in custom_patterns + QUESTION_PATTERNS:
        match = pattern.match(line)
        if match:
            return match.group(1), clean_line(match.group(2))
    return None


def is_section(line, custom_patterns):
    return any(pattern.match(line) for pattern in custom_patterns + SECTION_PATTERNS)


def looks_like_question(line):
    return len(line) >= 4 and bool(QUESTION_CUE_RE.search(line))


def split_inline_options(line):
    for pattern, label_kind in ((INLINE_OPTION_RE, "letter"), (INLINE_CIRCLED_RE, "circled")):
        matches = list(pattern.finditer(line))
        if len(matches) < 2:
            continue
        stem = clean_line(line[:matches[0].start()])
        options = []
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
            raw_label = match.group(1)
            label = raw_label.upper() if label_kind == "letter" else LETTERS[CIRCLED_LABELS.index(raw_label)]
            value = clean_line(line[match.end():end]).strip(";；")
            if value:
                options.append({"label": label, "text": value})
        if len(options) >= 2:
            return stem, options
    return None


def repeated_margin_lines(units):
    if len(units) < 3:
        return set()
    counts = Counter()
    for unit in units:
        unique = {clean_line(line) for line in unit.lines if 1 < len(clean_line(line)) <= 100}
        counts.update(unique)
    threshold = max(3, int(math.ceil(len(units) * 0.35)))
    return {
        line for line, count in counts.items()
        if count >= threshold and not is_question_start(line, []) and not LETTER_OPTION_RE.match(line)
    }


def normalize_answer(answer, question_type):
    value = clean_line(answer)
    if question_type == "choice":
        letters = "".join(re.findall(r"[A-Ja-j]", value)).upper()
        if letters:
            return "".join(dict.fromkeys(letters))
    if question_type == "true_false":
        if value in {"正确", "对", "√", "T", "TRUE", "true"}:
            return "正确"
        if value in {"错误", "错", "×", "F", "FALSE", "false"}:
            return "错误"
    return value


def detect_question_type(section, options, stem):
    title = str(section or "")
    if options:
        return "choice"
    if "判断" in title or re.search(r"判断.*(?:正确|错误|对错)", stem):
        return "true_false"
    if "填空" in title or re.search(r"_{2,}|（\s*）|\(\s*\)", stem):
        return "fill_blank"
    if "证明" in title or re.search(r"证明|推导", stem):
        return "proof"
    if "算法" in title or re.search(r"编写.*(?:算法|程序|代码)|伪代码", stem):
        return "algorithm"
    if "计算" in title or re.search(r"计算|求值|求解", stem):
        return "calculation"
    return "subjective"


def build_retrieval_text(record):
    parts = [
        record.get("course", ""),
        " ".join(record.get("courseAliases", [])),
        record.get("paperYear", ""),
        record.get("sectionTitle", ""),
        record.get("questionType", ""),
        " ".join(record.get("topics", [])),
        record.get("stem", ""),
        " ".join(option.get("text", "") for option in record.get("options", [])),
    ]
    return "\n".join(str(part) for part in parts if part).strip()


def parse_units(units, metadata, custom_question_patterns=None, custom_section_patterns=None):
    custom_question_patterns = custom_question_patterns or []
    custom_section_patterns = custom_section_patterns or []
    repeated = repeated_margin_lines(units)
    records = []
    answer_map = {}
    orphan_lines = []
    section = ""
    answer_mode = False
    current = None
    synthetic_number = 0
    current_paper_year = metadata["paperYear"]
    pending_lines = []

    def start_question(number, stem, unit):
        nonlocal current, synthetic_number
        synthetic_number += 1
        current = {
            "questionNumber": str(number or "U{}".format(synthetic_number)),
            "sectionTitle": section,
            "stemLines": [stem] if stem else [],
            "options": [],
            "answer": "",
            "explanation": "",
            "sourceUnits": {unit.index},
            "sourceLabels": {unit.label},
            "numericOptionNext": 1,
            "paperYear": current_paper_year,
        }

    def finish_question():
        nonlocal current
        if not current:
            return
        stem = clean_line("\n".join(current["stemLines"]))
        options = current["options"]
        question_type = detect_question_type(current["sectionTitle"], options, stem)
        record = {
            "questionNumber": current["questionNumber"],
            "paperYear": current["paperYear"],
            "sectionTitle": current["sectionTitle"],
            "questionType": question_type,
            "stem": stem,
            "options": options,
            "answer": normalize_answer(current["answer"], question_type),
            "answerStatus": "provided" if current["answer"] else "missing",
            "explanation": clean_line(current["explanation"]),
            "score": None,
            "topics": list(metadata["defaultTopics"] or ([current["sectionTitle"]] if current["sectionTitle"] else [])),
            "requiresFigure": bool(FIGURE_RE.search(stem + " " + " ".join(option["text"] for option in options))),
            "sourceUnits": sorted(current["sourceUnits"]),
            "sourceLabels": sorted(current["sourceLabels"]),
            "rawText": "\n".join(current["stemLines"] + [option["label"] + ". " + option["text"] for option in options]),
        }
        records.append(record)
        current = None

    for unit in units:
        for raw_line in unit.lines:
            line = clean_line(raw_line)
            if not line or line in repeated or PAGE_NUMBER_RE.fullmatch(line):
                continue

            year_match = PAPER_YEAR_RE.search(line)
            if year_match:
                current_paper_year = year_match.group(1) + "-" + year_match.group(2)

            if ANSWER_SECTION_RE.match(line):
                finish_question()
                if pending_lines:
                    orphan_lines.extend({"unit": unit.index, "text": value} for value in pending_lines)
                    pending_lines = []
                answer_mode = True
                section = line
                continue

            if answer_mode:
                matches = list(ANSWER_ITEM_RE.finditer(line))
                if matches:
                    for match in matches:
                        answer_map.setdefault(match.group(1), match.group(2))
                    continue
                if is_section(line, custom_section_patterns) and not ANSWER_SECTION_RE.match(line):
                    answer_mode = False
                elif is_question_start(line, custom_question_patterns):
                    answer_mode = False
                else:
                    continue

            if is_section(line, custom_section_patterns):
                finish_question()
                if pending_lines:
                    orphan_lines.extend({"unit": unit.index, "text": value} for value in pending_lines)
                    pending_lines = []
                section = line
                continue

            if current and CHOICE_SECTION_RE.search(section):
                numeric = NUMBER_OPTION_RE.match(line)
                if numeric and int(numeric.group(1)) == current["numericOptionNext"] and int(numeric.group(1)) <= 10:
                    current["options"].append({
                        "label": LETTERS[int(numeric.group(1)) - 1],
                        "text": clean_line(numeric.group(2)),
                    })
                    current["numericOptionNext"] += 1
                    current["sourceUnits"].add(unit.index)
                    current["sourceLabels"].add(unit.label)
                    continue

            question_start = is_question_start(line, custom_question_patterns)
            if question_start:
                finish_question()
                start_question(question_start[0], question_start[1], unit)
                inline = split_inline_options(question_start[1])
                if inline:
                    current["stemLines"] = [inline[0]]
                    current["options"] = inline[1]
                continue

            if not current:
                inline = split_inline_options(line)
                if inline and inline[0]:
                    start_question(None, inline[0], unit)
                    current["options"] = inline[1]
                    pending_lines = []
                else:
                    letter_option = LETTER_OPTION_RE.match(line)
                    circled_option = CIRCLED_OPTION_RE.match(line)
                    if pending_lines and letter_option:
                        start_question(None, "\n".join(pending_lines), unit)
                        pending_lines = []
                        current["options"].append({"label": letter_option.group(1).upper(), "text": clean_line(letter_option.group(2))})
                    elif pending_lines and circled_option:
                        start_question(None, "\n".join(pending_lines), unit)
                        pending_lines = []
                        label = LETTERS[CIRCLED_LABELS.index(circled_option.group(1))]
                        current["options"].append({"label": label, "text": clean_line(circled_option.group(2))})
                    elif looks_like_question(line):
                        start_question(None, line, unit)
                        pending_lines = []
                    else:
                        pending_lines.append(line)
                        if len(pending_lines) > 12:
                            orphan_lines.append({"unit": unit.index, "text": pending_lines.pop(0)})
                continue

            current["sourceUnits"].add(unit.index)
            current["sourceLabels"].add(unit.label)

            answer_match = ANSWER_RE.match(line)
            if answer_match:
                current["answer"] = answer_match.group(1)
                continue
            explanation_match = EXPLANATION_RE.match(line)
            if explanation_match:
                current["explanation"] = explanation_match.group(1)
                continue

            inline = split_inline_options(line)
            if inline:
                if inline[0]:
                    current["stemLines"].append(inline[0])
                current["options"].extend(inline[1])
                continue

            letter_option = LETTER_OPTION_RE.match(line)
            circled_option = CIRCLED_OPTION_RE.match(line)
            if letter_option:
                current["options"].append({"label": letter_option.group(1).upper(), "text": clean_line(letter_option.group(2))})
                continue
            if circled_option:
                label = LETTERS[CIRCLED_LABELS.index(circled_option.group(1))]
                current["options"].append({"label": label, "text": clean_line(circled_option.group(2))})
                continue

            if len(current["options"]) >= 2 and looks_like_question(line):
                finish_question()
                start_question(None, line, unit)
                continue

            if current["explanation"]:
                current["explanation"] += "\n" + line
            elif current["options"]:
                current["options"][-1]["text"] = clean_line(current["options"][-1]["text"] + " " + line)
            else:
                current["stemLines"].append(line)

    finish_question()
    if pending_lines:
        orphan_lines.extend({"unit": units[-1].index if units else 0, "text": value} for value in pending_lines)

    source_hash = hashlib.sha1(
        (metadata["courseKey"] + "|" + metadata["sourceFile"]).encode("utf-8")
    ).hexdigest()[:8]
    seen_ids = set()
    for index, record in enumerate(records, start=1):
        number = re.sub(r"[^A-Za-z0-9]+", "", str(record["questionNumber"])) or str(index)
        base_id = "{}-{}-{}".format(metadata["courseKey"], source_hash, number).lower()
        record_id = base_id
        suffix = 2
        while record_id in seen_ids:
            record_id = "{}-{}".format(base_id, suffix)
            suffix += 1
        seen_ids.add(record_id)
        record.update({
            "id": record_id,
            "school": metadata["school"],
            "course": metadata["course"],
            "courseKey": metadata["courseKey"],
            "courseAliases": metadata["courseAliases"],
            "paperYear": record.get("paperYear") or metadata["paperYear"],
            "sourceFile": metadata["sourceFile"],
            "sourceType": metadata["sourceType"],
        })
        if not record["answer"] and str(record["questionNumber"]) in answer_map:
            record["answer"] = normalize_answer(answer_map[str(record["questionNumber"])], record["questionType"])
            record["answerStatus"] = "provided"
        record["retrievalText"] = build_retrieval_text(record)

    return records, orphan_lines, sorted(repeated)


def parse_options_cell(value):
    value = str(value or "").strip()
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            result = []
            for index, option in enumerate(parsed):
                if isinstance(option, dict):
                    result.append({"label": str(option.get("label") or LETTERS[index]), "text": str(option.get("text") or "")})
                else:
                    result.append({"label": LETTERS[index], "text": str(option)})
            return result
    except json.JSONDecodeError:
        pass
    return [{"label": LETTERS[index], "text": clean_line(option)} for index, option in enumerate(re.split(r"\s*\|\s*", value)) if clean_line(option)]


def parse_list_cell(value):
    if isinstance(value, list):
        return [clean_line(item) for item in value if clean_line(item)]
    text = clean_line(value)
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [clean_line(item) for item in parsed if clean_line(item)]
    except json.JSONDecodeError:
        pass
    return [item for item in (clean_line(part) for part in re.split(r"[|,，;；]", text)) if item]


def parse_bool_cell(value):
    if isinstance(value, bool):
        return value
    return clean_line(value).lower() in {"1", "true", "yes", "y", "是", "需要"}


def import_structured(path, metadata):
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        rows = payload.get("records", []) if isinstance(payload, dict) else payload
    else:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
    if not isinstance(rows, list):
        raise RuntimeError("JSON 必须是题目数组，或包含 records 数组")
    records = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            continue
        options = row.get("options", [])
        if isinstance(options, str):
            options = parse_options_cell(options)
        else:
            options = parse_options_cell(json.dumps(options, ensure_ascii=False))
        record = {
            "id": str(row.get("id") or "{}-{}".format(metadata["courseKey"], index)),
            "school": str(row.get("school") or metadata["school"]),
            "course": str(row.get("course") or metadata["course"]),
            "courseKey": str(row.get("courseKey") or metadata["courseKey"]),
            "courseAliases": parse_list_cell(row.get("courseAliases")) or metadata["courseAliases"],
            "paperYear": str(row.get("paperYear") or metadata["paperYear"]),
            "sectionTitle": str(row.get("sectionTitle") or ""),
            "questionNumber": str(row.get("questionNumber") or index),
            "questionType": str(row.get("questionType") or detect_question_type(row.get("sectionTitle"), options, str(row.get("stem") or ""))),
            "stem": clean_line(row.get("stem")),
            "options": options,
            "answer": clean_line(row.get("answer")),
            "answerStatus": str(row.get("answerStatus") or ("provided" if row.get("answer") else "missing")),
            "explanation": clean_line(row.get("explanation")),
            "score": row.get("score"),
            "topics": parse_list_cell(row.get("topics")) or metadata["defaultTopics"],
            "requiresFigure": parse_bool_cell(row.get("requiresFigure")),
            "sourceUnits": parse_list_cell(row.get("sourceUnits") or row.get("sourcePages")),
            "sourceLabels": parse_list_cell(row.get("sourceLabels")),
            "sourceFile": str(row.get("sourceFile") or metadata["sourceFile"]),
            "sourceType": str(row.get("sourceType") or metadata["sourceType"]),
            "rawText": str(row.get("rawText") or ""),
        }
        record["answer"] = normalize_answer(record["answer"], record["questionType"])
        record["retrievalText"] = str(row.get("retrievalText") or build_retrieval_text(record))
        records.append(record)
    return records, [], []


def assess_records(records):
    stem_counts = Counter(re.sub(r"\W+", "", record.get("stem", "")).lower() for record in records)
    blocking = 0
    review = 0
    warning_counts = Counter()
    for record in records:
        warnings = []
        stem = clean_line(record.get("stem"))
        options = record.get("options") or []
        if len(stem) < 4:
            warnings.append("题干过短或缺失")
        if record.get("questionType") == "choice" and len(options) < 2:
            warnings.append("选择题选项少于2个")
        if any(not clean_line(option.get("text")) for option in options):
            warnings.append("存在空选项")
        if not record.get("answer"):
            warnings.append("缺少答案")
        normalized_stem = re.sub(r"\W+", "", stem).lower()
        if normalized_stem and stem_counts[normalized_stem] > 1:
            warnings.append("题干重复")
        if record.get("requiresFigure"):
            warnings.append("依赖图片或图形")
        blockers = [warning for warning in warnings if warning in {"题干过短或缺失", "选择题选项少于2个", "存在空选项"}]
        status = "blocked" if blockers else ("review" if warnings else "ready")
        if status == "blocked":
            blocking += 1
        elif status == "review":
            review += 1
        warning_counts.update(warnings)
        record["quality"] = {"status": status, "warnings": warnings}
        record["status"] = "review"
    return {
        "records": len(records),
        "ready": len(records) - blocking - review,
        "review": review,
        "blocked": blocking,
        "warningCounts": dict(warning_counts),
        "types": dict(Counter(record.get("questionType", "unknown") for record in records)),
        "missingAnswers": sum(1 for record in records if not record.get("answer")),
        "requiresFigure": sum(1 for record in records if record.get("requiresFigure")),
    }


def validate_payload(payload):
    errors = []
    if not isinstance(payload, dict) or payload.get("kind") != CORPUS_KIND:
        return ["kind 必须是 exam_question_corpus"], {}
    document = payload.get("document") or {}
    for field in ("title", "course", "courseKey", "sourceFile"):
        if not clean_line(document.get(field)):
            errors.append("document.{} 不能为空".format(field))
    records = payload.get("records")
    if not isinstance(records, list) or not records:
        errors.append("records 必须是非空数组")
        return errors, {"records": 0, "blocked": 0}
    ids = set()
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            errors.append("records[{}] 不是对象".format(index))
            continue
        record_id = clean_line(record.get("id"))
        if not record_id:
            errors.append("records[{}].id 不能为空".format(index))
        elif record_id in ids:
            errors.append("重复 id: {}".format(record_id))
        ids.add(record_id)
        if not clean_line(record.get("stem")):
            errors.append("{} 缺少题干".format(record_id or index))
        if not clean_line(record.get("retrievalText")):
            record["retrievalText"] = build_retrieval_text(record)
    summary = assess_records(records)
    return errors, summary


def make_metadata(args, path):
    aliases = [clean_line(value) for value in (args.aliases or "").split(",") if clean_line(value)]
    topics = [clean_line(value) for value in (args.topics or "").split(",") if clean_line(value)]
    course_key = clean_line(args.course_key) or slug_key(args.course)
    return {
        "title": clean_line(args.title) or "{} - {}".format(args.course, path.stem),
        "school": clean_line(args.school),
        "course": clean_line(args.course),
        "courseKey": course_key,
        "courseAliases": list(dict.fromkeys([args.course] + aliases)),
        "paperYear": clean_line(args.year),
        "sourceFile": path.name,
        "sourceType": clean_line(args.source_type) or "exam",
        "defaultTopics": topics,
        "hasOfficialAnswers": bool(args.has_official_answers),
    }


def compile_custom_patterns(values, kind):
    patterns = []
    for value in values or []:
        try:
            pattern = re.compile(value)
        except re.error as exc:
            raise RuntimeError("无效的{}正则 {}: {}".format(kind, value, exc)) from exc
        if kind == "题号" and pattern.groups < 2:
            raise RuntimeError("题号正则必须包含两个捕获组：题号和题干")
        patterns.append(pattern)
    return patterns


def write_review_csv(payload, path):
    fields = ["id", "qualityStatus", "warnings", "questionType", "questionNumber", "sectionTitle", "stem", "options", "answer", "topics", "sourceLabels"]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for record in payload["records"]:
            writer.writerow({
                "id": record.get("id"),
                "qualityStatus": record.get("quality", {}).get("status"),
                "warnings": "；".join(record.get("quality", {}).get("warnings", [])),
                "questionType": record.get("questionType"),
                "questionNumber": record.get("questionNumber"),
                "sectionTitle": record.get("sectionTitle"),
                "stem": record.get("stem"),
                "options": " | ".join(option.get("label", "") + "." + option.get("text", "") for option in record.get("options", [])),
                "answer": record.get("answer"),
                "topics": " | ".join(record.get("topics", [])),
                "sourceLabels": " | ".join(str(value) for value in record.get("sourceLabels", [])),
            })


def command_import(args):
    source = Path(args.input).resolve()
    if not source.exists() or source.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise RuntimeError("不支持或不存在的输入文件: {}".format(source))
    output = Path(args.output).resolve()
    metadata = make_metadata(args, source)
    if source.suffix.lower() in {".json", ".csv"}:
        records, orphan_lines, repeated = import_structured(source, metadata)
    else:
        units = extract_units(source)
        records, orphan_lines, repeated = parse_units(
            units,
            metadata,
            compile_custom_patterns(args.question_regex, "题号"),
            compile_custom_patterns(args.section_regex, "章节"),
        )
    summary = assess_records(records)
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": CORPUS_KIND,
        "embedding": "char-ngram-tfidf-v2",
        "document": {
            "title": metadata["title"],
            "school": metadata["school"],
            "course": metadata["course"],
            "courseKey": metadata["courseKey"],
            "courseAliases": metadata["courseAliases"],
            "sourceFile": metadata["sourceFile"],
            "sourceType": metadata["sourceType"],
            "paperYears": [metadata["paperYear"]] if metadata["paperYear"] else [],
            "hasOfficialAnswers": metadata["hasOfficialAnswers"],
            "status": "staging",
            "importedAt": datetime.now(timezone.utc).isoformat(),
        },
        "qualitySummary": summary,
        "records": records,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path = output.with_suffix(".report.json")
    review_path = output.with_suffix(".review.csv")
    report = {
        "source": str(source),
        "output": str(output),
        "summary": summary,
        "orphanLineCount": len(orphan_lines),
        "orphanLineSamples": orphan_lines[:100],
        "removedRepeatedLines": repeated,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_review_csv(payload, review_path)
    print(json.dumps({"corpus": str(output), "reportPath": str(report_path), "reviewPath": str(review_path), "summary": summary}, ensure_ascii=False, indent=2))
    return 0


def command_validate(args):
    path = Path(args.corpus).resolve()
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    errors, summary = validate_payload(payload)
    print(json.dumps({"corpus": str(path), "valid": not errors and not summary.get("blocked"), "errors": errors, "summary": summary}, ensure_ascii=False, indent=2))
    return 0 if not errors and not summary.get("blocked") else 2


def command_publish(args):
    if not args.approve:
        raise RuntimeError("发布必须显式传入 --approve，表示开发者已审核 review.csv")
    source = Path(args.corpus).resolve()
    payload = json.loads(source.read_text(encoding="utf-8-sig"))
    errors, summary = validate_payload(payload)
    if errors or summary.get("blocked"):
        print(json.dumps({"published": False, "errors": errors, "summary": summary}, ensure_ascii=False, indent=2))
        return 2
    target_dir = Path(args.target_dir).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / source.name
    if target.exists() and not args.replace:
        raise RuntimeError("目标已存在，确认替换时请加 --replace: {}".format(target))
    existing_ids = set()
    for corpus_path in target_dir.glob("*.json"):
        if corpus_path.resolve() == target.resolve():
            continue
        try:
            other = json.loads(corpus_path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            continue
        existing_ids.update(str(record.get("id")) for record in other.get("records", []) if record.get("id"))
    conflicts = sorted({str(record.get("id")) for record in payload["records"] if str(record.get("id")) in existing_ids})
    if conflicts:
        raise RuntimeError("与已发布语料存在重复 ID: {}".format(", ".join(conflicts[:10])))
    payload["document"]["status"] = "published"
    payload["document"]["publishedAt"] = datetime.now(timezone.utc).isoformat()
    for record in payload["records"]:
        record["status"] = "active"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"published": True, "target": str(target), "records": len(payload["records"]), "reviewWarnings": summary.get("review", 0)}, ensure_ascii=False, indent=2))
    return 0


def build_parser():
    parser = argparse.ArgumentParser(description="通用开发者 RAG 题库导入、校验和发布工具")
    subparsers = parser.add_subparsers(dest="command", required=True)

    importer = subparsers.add_parser("import", help="从 PDF/DOCX/PPTX/TXT/JSON/CSV 生成 staging 语料")
    importer.add_argument("input")
    importer.add_argument("--output", required=True)
    importer.add_argument("--course", required=True)
    importer.add_argument("--course-key", default="")
    importer.add_argument("--aliases", default="")
    importer.add_argument("--school", default="")
    importer.add_argument("--year", default="")
    importer.add_argument("--title", default="")
    importer.add_argument("--source-type", default="exam")
    importer.add_argument("--topics", default="")
    importer.add_argument("--has-official-answers", action="store_true")
    importer.add_argument("--question-regex", action="append", default=[], help="额外题号正则，必须捕获题号和题干")
    importer.add_argument("--section-regex", action="append", default=[], help="额外章节标题正则")
    importer.set_defaults(func=command_import)

    validator = subparsers.add_parser("validate", help="校验 staging 或已发布语料")
    validator.add_argument("corpus")
    validator.set_defaults(func=command_validate)

    publisher = subparsers.add_parser("publish", help="审核后发布到云函数 rag-data")
    publisher.add_argument("corpus")
    publisher.add_argument("--target-dir", default="miniprogram/cloudfunctions/aiParse/rag-data")
    publisher.add_argument("--approve", action="store_true")
    publisher.add_argument("--replace", action="store_true")
    publisher.set_defaults(func=command_publish)
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
