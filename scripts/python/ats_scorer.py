#!/usr/bin/env python3
"""
Standalone ATS scorer using TF-IDF cosine similarity.

Used as a fast, zero-AI pre-check before the expensive LLM ATS call.
Returns a JSON object with:
  match_score       (float 0-100)
  matched_keywords  (list[str])
  missing_keywords  (list[str])
  available         (bool) — False if sklearn not installed

Usage:
  python ats_scorer.py '<json_config>'

Config keys:
  resume_text   (str) — plain text of the resume/CV
  jd_text       (str) — plain text of the job description
  ats_keywords  (list[str]) — keywords extracted from JD analysis
"""
import json
import sys
import re


def _tokenize(text: str) -> set[str]:
    """Lowercase tokenize, strip punctuation, return word set."""
    text = text.lower()
    tokens = re.findall(r"[a-z][a-z0-9+#.]*(?:\s+[a-z][a-z0-9+#.]*){0,3}", text)
    return set(tokens)


def _keyword_match(resume_text: str, ats_keywords: list[str]) -> tuple[list[str], list[str]]:
    """Simple presence check for ATS keywords in resume text."""
    resume_lower = resume_text.lower()
    matched = []
    missing = []
    for kw in ats_keywords:
        kw_norm = kw.lower().strip()
        if kw_norm and kw_norm in resume_lower:
            matched.append(kw)
        elif kw_norm:
            missing.append(kw)
    return matched, missing


def _cosine_score(resume_text: str, jd_text: str) -> float:
    """TF-IDF cosine similarity between resume and JD. Returns 0-100."""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
    except ImportError:
        return -1.0  # Signal: sklearn not available

    try:
        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            stop_words="english",
            max_features=5000,
        )
        tfidf_matrix = vectorizer.fit_transform([resume_text, jd_text])
        score = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        return round(float(score) * 100, 1)
    except Exception:
        return 0.0


def main() -> int:
    try:
        config = json.loads(sys.argv[1])
    except Exception as exc:
        sys.stderr.write(f"Invalid JSON config: {exc}\n")
        return 2

    resume_text = str(config.get("resume_text") or "")
    jd_text = str(config.get("jd_text") or "")
    ats_keywords = [str(k) for k in (config.get("ats_keywords") or [])]

    if not resume_text or not jd_text:
        print(json.dumps({
            "available": False,
            "match_score": None,
            "matched_keywords": [],
            "missing_keywords": ats_keywords,
            "error": "resume_text or jd_text missing",
        }))
        return 0

    cosine = _cosine_score(resume_text, jd_text)

    if cosine == -1.0:
        # sklearn not installed — keyword-only mode
        matched, missing = _keyword_match(resume_text, ats_keywords)
        kw_score = round(len(matched) / max(len(ats_keywords), 1) * 100, 1)
        print(json.dumps({
            "available": True,
            "sklearn_available": False,
            "match_score": kw_score,
            "matched_keywords": matched,
            "missing_keywords": missing,
            "note": "sklearn not installed — keyword-only scoring used. Install: pip install scikit-learn",
        }))
        return 0

    matched, missing = _keyword_match(resume_text, ats_keywords)
    kw_coverage = round(len(matched) / max(len(ats_keywords), 1) * 100, 1)

    # Blend: 60% cosine + 40% keyword coverage
    blend = round(0.6 * cosine + 0.4 * kw_coverage, 1)

    print(json.dumps({
        "available": True,
        "sklearn_available": True,
        "match_score": blend,
        "cosine_score": cosine,
        "keyword_coverage": kw_coverage,
        "matched_keywords": matched,
        "missing_keywords": missing,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
