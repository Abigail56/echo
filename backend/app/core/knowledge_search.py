"""Owner-library text lookup over bounded stored memories.

There are at most 100 memories per ECHO. Searching them in memory avoids
database-specific full-text indexes and SQL wildcard semantics. No data leaves
the backend except owner-authorized result excerpts.
"""
from dataclasses import dataclass
import re
from collections.abc import Iterable
from uuid import UUID

from app.models.entities import Memory

MAX_RESULTS = 30
SNIPPET_CHARS = 230


@dataclass(frozen=True)
class MemorySearchHit:
    id: UUID
    title: str
    visibility: str
    document_id: UUID | None
    snippet: str


def _keywords(query: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"[^\W_]+", query.casefold(), re.UNICODE)))


def _excerpt(body: str, keywords: list[str]) -> str:
    lower = body.casefold()
    starts = [lower.find(term) for term in keywords if term in lower]
    first = min(starts) if starts else 0
    start = max(0, first - 65)
    end = min(len(body), start + SNIPPET_CHARS)
    excerpt = body[start:end].strip()
    return ("…" if start else "") + excerpt + ("…" if end < len(body) else "")


def search_memories(
    records: Iterable[Memory],
    query: str,
    *,
    visibility: str = "all",
    origin: str = "all",
    max_results: int = MAX_RESULTS,
) -> list[MemorySearchHit]:
    if visibility not in {"all", "private", "public"}:
        raise ValueError("Invalid visibility filter")
    if origin not in {"all", "document", "manual"}:
        raise ValueError("Invalid origin filter")
    if not query.strip() or max_results <= 0:
        return []

    terms = _keywords(query[:120])
    if not terms:
        return []
    ranked: list[tuple[int, str, Memory]] = []
    for record in records:
        if visibility != "all" and record.visibility != visibility:
            continue
        if origin == "document" and record.document_id is None:
            continue
        if origin == "manual" and record.document_id is not None:
            continue
        title = record.title.casefold()
        content = record.content.casefold()
        title_hits = sum(term in title for term in terms)
        body_hits = sum(term in content for term in terms)
        if not title_hits and not body_hits:
            continue
        phrase_bonus = int(query.strip().casefold() in title) * 4
        score = title_hits * 6 + body_hits * 2 + phrase_bonus
        ranked.append((score, str(record.id), record))

    ranked.sort(key=lambda result: (-result[0], result[1]))
    return [
        MemorySearchHit(
            id=record.id, title=record.title, visibility=record.visibility,
            document_id=record.document_id, snippet=_excerpt(record.content, terms),
        )
        for _, _, record in ranked[:min(max_results, MAX_RESULTS)]
    ]
