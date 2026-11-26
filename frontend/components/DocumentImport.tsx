import { useState, type FormEvent } from 'react';
import { importKnowledgeDocument } from '../lib/api';

const MAX_FILE_SIZE = 2 * 1024 * 1024;

export default function DocumentImport({ echoId, onImported }: { echoId: string; onImported: () => Promise<void> | void }) {
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    if (file.size > MAX_FILE_SIZE) { setError('Choose a file smaller than 2 MB.'); return; }
    if (visibility === 'public' && !confirmPublic) { setError('Confirm that this extracted knowledge can be shared publicly.'); return; }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await importKnowledgeDocument(echoId, file, visibility, confirmPublic);
      setNotice(result.notice);
      setFile(null);
      setVisibility('private');
      setConfirmPublic(false);
      const input = document.getElementById(`knowledge-file-${echoId}`) as HTMLInputElement | null;
      if (input) input.value = '';
      await onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document import failed.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="document-import-v11" aria-labelledby="document-import-heading">
    <div className="document-import-intro">
      <span className="section-kicker">DOCUMENT KNOWLEDGE</span>
      <h3 id="document-import-heading">Import from a file.</h3>
      <p>Extract text from a PDF, TXT or Markdown file into one editable memory. Your original file is not stored. Maximum 2 MB, 10 PDF pages, and 5,000 saved characters. Image-only PDFs are not supported.</p>
    </div>
    <form className="form" onSubmit={event => void submit(event)}>
      <label htmlFor={`knowledge-file-${echoId}`}>Choose a document
        <input id={`knowledge-file-${echoId}`} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          required onChange={event => { setFile(event.target.files?.[0] || null); setError(''); setNotice(''); }} />
      </label>
      {file ? <p className="document-import-file">Selected: {file.name} · {(file.size / 1024).toFixed(0)} KB</p> : null}
      <label>Save extracted knowledge as
        <select value={visibility} onChange={event => { setVisibility(event.target.value as 'private' | 'public'); setConfirmPublic(false); }}>
          <option value="private">Private — only owner chat</option>
          <option value="public">Public — visitor conversations may use it</option>
        </select>
      </label>
      {visibility === 'public' ? <label className="document-import-confirm">
        <input type="checkbox" checked={confirmPublic} onChange={event => setConfirmPublic(event.target.checked)} />
        <span>I reviewed this document and approve its extracted text for public ECHO responses.</span>
      </label> : <p className="document-import-private">Default: private. You can edit or delete the imported memory after saving.</p>}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="voice-status" role="status">{notice}</p> : null}
      <button className="button" type="submit" disabled={!file || busy || (visibility === 'public' && !confirmPublic)}>
        {busy ? 'Extracting text…' : 'Import knowledge ↗'}
      </button>
    </form>
  </section>;
}
