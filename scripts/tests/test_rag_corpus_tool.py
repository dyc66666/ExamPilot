import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "rag_corpus_tool.py"
SPEC = importlib.util.spec_from_file_location("rag_corpus_tool", MODULE_PATH)
RAG = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RAG)


def metadata():
    return {
        "title": "测试语料",
        "school": "测试学校",
        "course": "测试课程",
        "courseKey": "test_course",
        "courseAliases": ["测试课程"],
        "paperYear": "2025-2026",
        "sourceFile": "fixture.txt",
        "sourceType": "test_fixture",
        "defaultTopics": [],
        "hasOfficialAnswers": True,
    }


class RagCorpusToolTests(unittest.TestCase):
    def parse(self, lines):
        units = [RAG.SourceUnit(1, "第1页", lines)]
        records, orphan_lines, _ = RAG.parse_units(units, metadata())
        return records, orphan_lines

    def test_inline_lowercase_options_are_split(self):
        records, _ = self.parse([
            "一、选择题",
            "1. Which statement is correct? a. first option b. second option c. third option d. fourth option",
            "答案：B",
        ])
        self.assertEqual(len(records), 1)
        self.assertEqual([item["label"] for item in records[0]["options"]], ["A", "B", "C", "D"])
        self.assertEqual(records[0]["answer"], "B")

    def test_parenthesized_subquestions_stay_in_one_question(self):
        records, _ = self.parse([
            "二、应用题",
            "1. 已知一棵二叉树，请回答：",
            "(1) 写出前序遍历；",
            "(2) 写出中序遍历；",
            "(3) 写出后序遍历。",
        ])
        self.assertEqual(len(records), 1)
        self.assertIn("(3) 写出后序遍历", records[0]["stem"])

    def test_code_member_access_is_not_an_option(self):
        records, _ = self.parse([
            "二、应用题",
            "1. 阅读下列代码并说明作用。",
            "G.vexs[v] = 1;",
            "G.arcs[v][i] = 0;",
            "求解下列问题：说明时间复杂度。",
        ])
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["options"], [])
        self.assertIn("G.arcs", records[0]["stem"])

    def test_unnumbered_question_with_separate_options(self):
        records, _ = self.parse([
            "一、选择题",
            "下列哪项属于连续函数的性质",
            "A. 选项一",
            "B. 选项二",
            "C. 选项三",
            "D. 选项四",
        ])
        self.assertEqual(len(records), 1)
        self.assertEqual(len(records[0]["options"]), 4)


if __name__ == "__main__":
    unittest.main()
