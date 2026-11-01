"""The generated practice sample must retain the learner's full question."""

import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "extract_topic_samples", Path(__file__).with_name("extract-topic-samples.py")
)
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class TopicSampleTests(unittest.TestCase):
    def test_published_question_keeps_its_shared_stem(self):
        specification = {"points": [
            {"id": "topic-1", "title": "Life processes", "kind": "content"},
            {"id": "1.1", "ref": "1.1", "title": "Life processes", "parentId": "topic-1"},
        ]}
        answer = {"allocations": [{
            "criterion": "The process is egestion.",
            "targetConceptIds": ["egestion"],
            "techniqueTags": {"provenance": {"source": "author"}},
        }]}
        payload = {
            "concepts": [{"id": "egestion", "specificationPointIds": ["biology:1.1"]}],
            "lessons": [{"cards": [{
                "k": 0, "co": "egestion", "f": "What is egestion?", "b": "Removing undigested food.",
            }]}],
            "questionSets": [{"questions": [{
                "prompt": "A pupil describes faeces leaving the body as absorption.",
                "parts": [{
                    "prompt": "Correct the process name and describe what is removed.",
                    "answer": answer, "subparts": [],
                }],
            }, {
                "prompt": "![Required diagram](asset:gut.png)",
                "parts": [{"prompt": "Name X.", "answer": answer, "subparts": []}],
            }]}],
        }
        topics = extractor.extract_topics(payload, specification)
        self.assertEqual(topics[0]["questions"], [{
            "question": "A pupil describes faeces leaving the body as absorption.\n\n"
            "Correct the process name and describe what is removed.",
            "answer": "The process is egestion.",
        }])


if __name__ == "__main__":
    unittest.main()
