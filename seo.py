"""A simple on-page SEO checklist for the review screen."""

from __future__ import annotations

import re
from typing import Any


def _contains(text: str, keyword: str) -> bool:
    return bool(keyword) and keyword.lower() in text.lower()


def report(title: str, meta: str, body: str, keyword: str, has_image: bool) -> dict[str, Any]:
    """Score the post out of 100 and explain each check in plain language.

    `body` is the article Markdown without its H1 (the title is checked separately).
    """
    words = re.findall(r"[A-Za-z0-9'’-]+", re.sub(r"[#*_>`\[\]()|-]", " ", body))
    first_100 = " ".join(words[:100])
    h2_count = len(re.findall(r"^##\s", body, re.MULTILINE))
    keyword = keyword.strip()

    checks = [
        (
            "Title length",
            30 <= len(title) <= 65,
            f"{len(title)} characters. Aim for 30–65 so it isn't cut off in Google.",
        ),
        (
            "Keyword in title",
            _contains(title, keyword),
            f'Include "{keyword}" in the title.' if keyword else "No focus keyword set.",
        ),
        (
            "Meta description",
            120 <= len(meta) <= 160,
            f"{len(meta)} characters. Aim for 120–160; this is the snippet shown in search results.",
        ),
        (
            "Keyword in meta description",
            _contains(meta, keyword),
            "Mention the focus keyword in the meta description.",
        ),
        (
            "Keyword early on",
            _contains(first_100, keyword),
            "Use the focus keyword within the first 100 words.",
        ),
        (
            "Article length",
            len(words) >= 1200,
            f"{len(words):,} words. In-depth posts (1,200+ words) tend to rank better.",
        ),
        (
            "Clear sections",
            h2_count >= 4,
            f"{h2_count} main sections (H2). Use at least 4 so readers can skim.",
        ),
        (
            "Featured image",
            has_image,
            "Add a featured image; posts with images get more clicks when shared.",
        ),
    ]
    passed = sum(1 for _, ok, _ in checks if ok)
    return {
        "score": round(100 * passed / len(checks)),
        "words": len(words),
        "keyword": keyword,
        "checks": [{"label": label, "ok": ok, "hint": hint} for label, ok, hint in checks],
    }
