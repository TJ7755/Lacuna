"""Freeze original samples from published Library payloads; never copy specification bodies."""

import hashlib
import json
import re
import subprocess
import urllib.request
import zlib
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[1]
OUTPUT = REPOSITORY / "apps/web/src/pages/courses"


def read_slot(base, slot):
    with urllib.request.urlopen(f"{base}/{slot}", timeout=30) as response:
        return response.read()


def sample_question(question, part):
    """Keep the shared stem; samples cannot supply images or other parts' answers."""
    parent_prompt = question.get("prompt", "").strip()
    part_prompt = part.get("prompt", "").strip()
    prompt = "\n\n".join(text for text in (parent_prompt, part_prompt) if text)
    if not part_prompt or part.get("subparts"):
        return None
    if re.search(r"!\[|<img\b|<svg\b|(?:asset|blob|data):|\]\([^)]*\)", prompt, re.I):
        return None
    if re.search(r"(?:previous|earlier) (?:part|answer)|(?:answer|result) (?:from|to|in) part", prompt, re.I):
        return None
    return prompt


def extract_topics(payload, specification):
    points = {point["id"]: point for point in specification["points"]}
    concepts = {concept["id"]: concept for concept in payload.get("concepts", [])}

    def topic_for(reference):
        point_id = reference.split(":")[-1]
        seen = set()
        while point_id in points and points[point_id].get("parentId"):
            if point_id in seen:
                raise ValueError("Circular specification hierarchy")
            seen.add(point_id)
            point_id = points[point_id]["parentId"]
        return point_id if point_id in points else None

    groups = {
        point["id"]: {
            "id": point["id"],
            "title": point["title"],
            "points": [],
            "flashcards": [],
            "questions": [],
        }
        for point in specification["points"]
        if not point.get("parentId") and point.get("kind") == "content"
    }
    for lesson in payload["lessons"]:
        for card in lesson.get("cards", []):
            if card.get("k") != 0:
                continue
            for reference in concepts.get(card.get("co"), {}).get("specificationPointIds", []):
                topic_id = topic_for(reference)
                if topic_id not in groups:
                    continue
                group = groups[topic_id]
                point = points[reference.split(":")[-1]]
                projected = {"code": point.get("ref", point["id"]), "title": point["title"]}
                if projected not in group["points"]:
                    group["points"].append(projected)
                if len(group["flashcards"]) < 2 and all(
                    isinstance(card.get(field), str) for field in ("f", "b")
                ):
                    group["flashcards"].append({"question": card["f"], "answer": card["b"]})

    for question_set in payload.get("questionSets", []):
        for question in question_set.get("questions", []):
            for part in question.get("parts", []):
                allocations = part.get("answer", {}).get("allocations", [])
                prompt = sample_question(question, part)
                if not allocations or prompt is None:
                    continue
                if not all(
                    allocation.get("techniqueTags", {}).get("provenance", {}).get("source")
                    == "author"
                    for allocation in allocations
                ):
                    continue
                topic_ids = {
                    topic_for(reference)
                    for allocation in allocations
                    for concept_id in allocation.get("targetConceptIds", [])
                    for reference in concepts.get(concept_id, {}).get("specificationPointIds", [])
                }
                for topic_id in sorted(topic_id for topic_id in topic_ids if topic_id in groups):
                    group = groups[topic_id]
                    if len(group["questions"]) < 2:
                        group["questions"].append({
                            "question": prompt,
                            "answer": " ".join(item["criterion"] for item in allocations),
                        })
    return [group for group in groups.values() if all(
        group[field] for field in ("points", "flashcards", "questions")
    )]


def main():
    catalogue = json.loads(subprocess.check_output([
        "bun", "-e", 'import {libraryCourses} from "./apps/web/src/library/catalogue.ts"; '
        'console.log(JSON.stringify(libraryCourses));',
    ], cwd=REPOSITORY, text=True))
    samples = []
    sources = []
    for course in catalogue:
        if not course.get("shareUrl") or any(
            course.get(field) != "Lacuna" for field in ("author", "publisher")
        ):
            continue
        share_id = course["shareUrl"].split("/s/")[-1]
        base = f"https://relay.getlacuna.app/shares/{share_id}"
        metadata = json.loads(read_slot(base, "meta"))
        encoded = read_slot(base, "payload")
        decoded = zlib.decompress(encoded[14:], -15) if encoded.startswith(b"LACUNA-SHARE:") else encoded
        payload = json.loads(decoded)["payload"]
        if payload.get("rv") != course["revision"] or metadata.get("revision") != course["revision"]:
            raise ValueError(f"Published revision differs from catalogue: {course['id']}")
        specification = payload["course"].get("specificationData")
        topics = extract_topics(payload, specification) if specification else []
        print(f"{course['id']}: {len(topics)} complete topics", flush=True)
        if not topics:
            continue
        samples.append({
            "courseId": course["id"],
            "specificationCode": specification["code"],
            "specificationTitle": specification["title"],
            "topics": topics,
        })
        sources.append({
            "courseId": course["id"],
            "revision": course["revision"],
            "shareUrl": course["shareUrl"],
            "sha256": hashlib.sha256(decoded).hexdigest(),
        })
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in (("topic-samples.json", samples), ("topic-sample-sources.json", sources)):
        temporary = OUTPUT / (name + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(OUTPUT / name)


if __name__ == "__main__":
    main()
