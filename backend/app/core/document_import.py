"""Small, bounded document-to-memory text extraction.

Only extracted text is retained as an ECHO memory. Never persist raw documents,
execute file contents, follow links, or fetch resources referenced in documents.
"""
from io import BytesIO
from pathlib import Path
import re

from fastapi import HTTPException
from pypdf import PdfReader

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_PDF_PAGES = 10
MAX_MEMORY_CHARS = 5000
SUPPORTED = {".txt", ".md", ".pdf"}


def document_title(filename: str) -> tuple[str, str]:
    # Browsers may provide a full path; normalize both slash forms.
    name = (filename or "").replace("\\", "/").split("/")[-1].strip()
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    suffix = Path(name).suffix.lower()
    if suffix not in SUPPORTED:
        raise HTTPException(415, "Only PDF, TXT and Markdown files are supported.")
    stem = name[: -len(suffix)].strip(" .") or "Imported document"
    return stem[:110], suffix


def extract_document(data: bytes, filename: str) -> tuple[str, bool]:
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
                if length > MAX_MEMORY_CHARS:
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
    return text[:MAX_MEMORY_CHARS], len(text) > MAX_MEMORY_CHARS
