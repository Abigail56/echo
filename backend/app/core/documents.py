"""Bounded extraction of user-approved document text.

Source uploads never execute. Only UTF-8 TXT/Markdown, text-based PDF and
non-macro DOCX are accepted; binary source files are discarded after extraction.
"""
from io import BytesIO
from pathlib import PurePath
from zipfile import ZipFile

from fastapi import HTTPException

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_TEXT_CHARS = 30000
EXTENSIONS = frozenset({".txt", ".md", ".pdf", ".docx"})


def normalized_filename(value: str) -> str:
    name = PurePath(value.replace("\\", "/")).name.strip()
    if not name or len(name) > 180 or name.startswith("."):
        raise HTTPException(422, "Choose a valid document filename (180 characters maximum).")
    suffix = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if suffix not in EXTENSIONS:
        raise HTTPException(415, "Use a .txt, .md, .pdf or .docx document.")
    return name


def _text(value: str) -> str:
    # Preserve line boundaries while stripping non-printing control bytes.
    clean = "".join(ch for ch in value if ch in "\n\t\r" or ord(ch) >= 32)
    clean = clean.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not clean:
        raise HTTPException(422, "No readable text was found in this document.")
    return clean[:MAX_TEXT_CHARS]


def extract_document(raw: bytes, filename: str) -> tuple[str, str, bool]:
    """Return (clean text, MIME type, truncated). Raise a safe validation error."""
    name = normalized_filename(filename)
    if not raw:
        raise HTTPException(422, "The document is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Documents must be 2 MB or smaller.")

    ext = "." + name.rsplit(".", 1)[-1].lower()
    try:
        if ext in (".txt", ".md"):
            original = raw.decode("utf-8-sig", errors="strict")
            if "\x00" in original:
                raise HTTPException(422, "This is not a plain text document.")
            mime = "text/markdown" if ext == ".md" else "text/plain"
        elif ext == ".pdf":
            if not raw.startswith(b"%PDF-"):
                raise HTTPException(422, "The file is not a valid PDF.")
            from pypdf import PdfReader
            reader = PdfReader(BytesIO(raw), strict=True)
            if reader.is_encrypted:
                raise HTTPException(422, "Encrypted PDFs are not supported.")
            if len(reader.pages) > 30:
                raise HTTPException(413, "PDFs are limited to 30 pages.")
            original = "\n".join((page.extract_text() or "")[:MAX_TEXT_CHARS] for page in reader.pages)
            mime = "application/pdf"
        else:
            # Inspect the archive before handing it to python-docx. Bound total
            # decompression and entry count; macro-capable archives are rejected.
            with ZipFile(BytesIO(raw)) as archive:
                entries = archive.infolist()
                if len(entries) > 250 or sum(entry.file_size for entry in entries) > 12 * 1024 * 1024:
                    raise HTTPException(413, "DOCX archive exceeds extraction limits.")
                names = {entry.filename for entry in entries}
                if "word/document.xml" not in names or any("vbaproject" in name.lower() for name in names):
                    raise HTTPException(422, "Invalid or macro-enabled DOCX.")
            from docx import Document
            document = Document(BytesIO(raw))
            original = "\n".join(
                [paragraph.text for paragraph in document.paragraphs]
                + [cell.text for table in document.tables for row in table.rows for cell in row.cells]
            )
            mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    except HTTPException:
        raise
    except Exception as exc:
        # Never return parser internals, paths, or document text to clients.
        raise HTTPException(422, "Could not extract text from this document.") from exc

    return _text(original), mime, len(original) > MAX_TEXT_CHARS
