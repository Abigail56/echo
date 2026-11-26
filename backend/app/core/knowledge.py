"""Deterministic, permission-aware retrieval of approved ECHO memories.

No third-party embeddings or external API calls. Source selection happens before
sending context to the configured AI provider; the LLM still generates the answer.
"""
import re
from collections import Counter
from collections.abc import Iterable

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


def relevant_memory_context(
    memories: Iterable[Memory],
    question: str,
    *,
    public: bool,
    max_memories: int = 8,
    max_chars: int = 6500,
) -> str:
    """Return bounded, relevant approved facts. Private records never enter public context.

    The retrieval heuristic is deliberately transparent: overlap in a memory's
    title is worth more than overlap in its body. No matching facts means no
    additional memory context, rather than arbitrarily leaking unrelated facts.
    """
    if max_memories <= 0 or max_chars <= 0:
        return ""

    keywords = set(_terms(question))
    if not keywords:
        return ""

    candidates: list[tuple[float, str, Memory]] = []
    for memory in memories:
        if public and memory.visibility != "public":
            continue

        title_terms = set(_terms(memory.title))
        body_terms = Counter(_terms(memory.content))
        title_hits = len(keywords & title_terms)
        body_hits = sum(min(body_terms[keyword], 2) for keyword in keywords)
        if not title_hits and not body_hits:
            continue

        # Prefer several distinct keyword matches to repeated filler tokens.
        coverage = len(keywords & (title_terms | body_terms.keys()))
        score = 6 * title_hits + 2 * body_hits + 2 * coverage
        candidates.append((score, str(memory.id), memory))

    candidates.sort(key=lambda row: (-row[0], row[1]))

    chunks: list[str] = []
    remaining = max_chars
    for _, _, memory in candidates[:max_memories]:
        # Trim per-memory body so one long record cannot consume the full budget.
        snippet = f"- {memory.title[:120]}: {memory.content[:1400]}"
        if remaining < 100:
            break
        snippet = snippet[:remaining]
        chunks.append(snippet)
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
