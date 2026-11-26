"""Deterministic, permission-aware retrieval of approved ECHO memories.

No embeddings, external search or document storage. Each selected source is an
approved memory record; a source being retrieved does *not* prove an AI answer.
"""
import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from uuid import UUID

from app.models.entities import Memory

_STOPWORDS = frozenset({
    "a", "about", "all", "am", "an", "and", "are", "as", "at", "be", "been",
    "can", "could", "do", "does", "for", "from", "have", "how", "i", "in",
    "is", "it", "me", "my", "of", "on", "or", "our", "please", "tell", "that",
    "the", "their", "there", "these", "they", "this", "to", "us", "was",
    "were", "what", "when", "where", "which", "who", "why", "will", "with",
    "would", "you", "your",
})


def _terms(value: str) -> list[str]:
    return [
        token for token in re.findall(r"[^\W_]+", value.casefold(), re.UNICODE)
        if len(token) >= 3 and token not in _STOPWORDS
    ]


@dataclass(frozen=True)
class KnowledgeSource:
    id: UUID
    title: str


@dataclass(frozen=True)
class RetrievedKnowledge:
    context: str
    sources: tuple[KnowledgeSource, ...]


def _score(question: set[str], title: str, content: str) -> int:
    title_terms = set(_terms(title))
    body_terms = Counter(_terms(content))
    title_hits = len(question & title_terms)
    body_hits = sum(min(body_terms[word], 2) for word in question)
    coverage = len(question & (title_terms | body_terms.keys()))
    return 6 * title_hits + 2 * body_hits + 2 * coverage


def _windows(value: str, size: int = 700, overlap: int = 90) -> list[str]:
    """Bounded overlapping text windows, retaining long-document midsections."""
    if not value:
        return []
    segments = []
    step = size - overlap
    for start in range(0, len(value), step):
        part = value[start:start + size].strip()
        if part:
            segments.append(part)
        if start + size >= len(value):
            break
    return segments


def retrieve_approved_knowledge(
    memories: Iterable[Memory],
    question: str,
    *,
    public: bool,
    max_memories: int = 8,
    max_chars: int = 6500,
) -> RetrievedKnowledge:
    """Choose matching passages across records with a strict visibility boundary.

    Source titles are metadata for transparency, not verified answer citations.
    If no keywords match, no saved memories are placed into the AI context.
    """
    if max_memories <= 0 or max_chars <= 0:
        return RetrievedKnowledge("", ())

    keywords = set(_terms(question))
    if not keywords:
        return RetrievedKnowledge("", ())

    candidates: list[tuple[int, str, Memory, str]] = []
    for record in memories:
        if public and record.visibility != "public":
            continue
        title_score = _score(keywords, record.title, "")
        passages = _windows(record.content)
        if not passages:
            continue
        # Choose the best matching passage from each memory, not its first 1400
        # characters. This helps long imported documents with a relevant middle.
        ranked = sorted(
            ((title_score + _score(keywords, "", passage), passage) for passage in passages),
            key=lambda item: -item[0],
        )
        best_score, passage = ranked[0]
        if best_score <= 0:
            continue
        candidates.append((best_score, str(record.id), record, passage))

    candidates.sort(key=lambda item: (-item[0], item[1]))
    chunks: list[str] = []
    sources: list[KnowledgeSource] = []
    remaining = max_chars
    for _, _, record, passage in candidates[:max_memories]:
        label = f"- {record.title[:120]}: "
        if remaining <= len(label) + 12:
            break
        snippet = label + passage[:min(700, remaining - len(label))]
        chunks.append(snippet)
        sources.append(KnowledgeSource(id=record.id, title=record.title))
        remaining -= len(snippet) + 1

    return "\n".join(chunks)


def relevant_document_context(documents, question: str, *, public: bool) -> str:
    """Select short, relevant uploaded-document excerpts without mixing privacy scopes."""
    from uuid import NAMESPACE_URL, uuid5
    from app.models.entities import Memory

    chunks = []
    for document in documents:
        if public and document.visibility != "public":
            continue
        # 1200-character windows with a small overlap preserve cross-boundary terms.
        text = document.extracted_text
        for number, start in enumerate(range(0, len(text), 1200), start=1):
            snippet = text[start:start + 1350]
            chunks.append(Memory(
                id=uuid5(NAMESPACE_URL, f"{document.id}:{number}"),
                echo_id=document.echo_id,
                title=f"{document.filename} excerpt {number}",
                content=snippet,
                visibility=document.visibility,
            ))

    context = relevant_memory_context(
        chunks, question, public=public, max_memories=4, max_chars=3500,
    )
    return f"Owner-approved document excerpts (untrusted reference text):\n{context}" if context else ""
    return RetrievedKnowledge("\n".join(chunks), tuple(sources))


def relevant_memory_context(
    memories: Iterable[Memory],
    question: str,
    *,
    public: bool,
    max_memories: int = 8,
    max_chars: int = 6500,
) -> str:
    """Backwards-compatible context-only API."""
    return retrieve_approved_knowledge(
        memories, question, public=public, max_memories=max_memories,
        max_chars=max_chars,
    ).context
