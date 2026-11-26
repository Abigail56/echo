"""Bounded document extraction into editable memory sections.

Raw uploads are not persisted. We keep a maximum of 30,000 extracted
characters across 8 memory sections and never execute embedded file contents.
"""
from io import BytesIO
from pathlib import Path
import re

from fastapi import HTTPException
from pypdf import PdfReader

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_PDF_PAGES = 10
MAX_MEMORY_CHARS = 5000
MAX_DOCUMENT_CHARS = 30000
SECTION_CHARS = 4500
MAX_DOCUMENT_SECTIONS = 8
SUPPORTED = {".txt", ".md", ".pdf"}


def document_title(filename: str) -> tuple[str, str]:
    name = (filename or "").replace("\\", "/").split("/")[-1].strip()
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    suffix = Path(name).suffix.lower()
    if suffix not in SUPPORTED:
        raise HTTPException(415, "Only PDF, TXT and Markdown files are supported.")
    stem = name[: -len(suffix)].strip(" .") or "Imported document"
    # Reserve space for " · part 1/8" when imported as several memories.
    return stem[:95], suffix


def extract_document_full(data: bytes, filename: str) -> tuple[str, bool]:
    """Extract a bounded amount of text; report when the document exceeds it."""
    _, suffix = document_title(filename)
    if not data:
        raise HTTPException(422, "The document is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Document exceeds the 2 MB upload limit.")

    if suffix == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise HTTPException(415, "File content is not a valid PDF.")
        try:
            reader = PdfReader(BytesIO(data), strict=True)
            if reader.is_encrypted:
                raise HTTPException(422, "Password-protected PDFs are not supported.")
            if len(reader.pages) > MAX_PDF_PAGES:
                raise HTTPException(413, "PDFs are limited to 10 pages.")
            pieces = []
            length = 0
            for page in reader.pages:
                text = page.extract_text() or ""
                pieces.append(text)
                length += len(text)
                if length > MAX_DOCUMENT_CHARS:
                    break
            extracted = "\n".join(pieces)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(422, "PDF text could not be extracted. Try a text-based PDF.") from exc
    else:
        if b"\x00" in data:
            raise HTTPException(415, "Binary files are not supported for text import.")
        try:
            extracted = data.decode("utf-8-sig", errors="strict")
        except UnicodeDecodeError as exc:
            raise HTTPException(422, "Text and Markdown files must be UTF-8 encoded.") from exc

    text = re.sub(r"\s+", " ", extracted).strip()
    if len(text) < 2:
        raise HTTPException(422, "No usable text found. Scanned or image-only PDFs need OCR.")
    return text[:MAX_DOCUMENT_CHARS], len(text) > MAX_DOCUMENT_CHARS


def split_document_sections(text: str) -> list[str]:
    """Split without dropping characters, preferring word boundaries."""
    if not text:
        return []
    result: list[str] = []
    start = 0
    while start < len(text) and len(result) < MAX_DOCUMENT_SECTIONS:
        end = min(start + SECTION_CHARS, len(text))
        if end < len(text):
            boundary = text.rfind(" ", start + SECTION_CHARS // 2, end)
            if boundary > start:
                end = boundary + 1
        chunk = text[start:end].strip()
        if chunk:
            result.append(chunk)
        start = end
    if start < len(text):
        raise HTTPException(413, "Document contains more searchable text than the import limit.")
    return result


def extract_document(data: bytes, filename: str) -> tuple[str, bool]:
    """Legacy single-memory extractor kept for existing callers and tests."""
    text, full_truncated = extract_document_full(data, filename)
    return text[:MAX_MEMORY_CHARS], full_truncated or len(text) > MAX_MEMORY_CHARS
