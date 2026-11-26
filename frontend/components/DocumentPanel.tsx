import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { documents, type UploadedKnowledgeDocument } from '../lib/api';

const EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'];
const MAX_BYTES = 2 * 1024 * 1024;
type Visibility = 'private' | 'public';

export default function DocumentPanel({ echoId }: { echoId: string }) {
  const [items, setItems] = useState<UploadedKnowledgeDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try { setItems(await documents.list(echoId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load documents.'); }
    finally { setLoading(false); }
  }, [echoId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !file) return;
    if (file.size > MAX_BYTES || !EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
      setError('Choose a TXT, Markdown, PDF or DOCX file no larger than 2 MB.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const uploaded = await documents.upload(echoId, file, visibility);
      setFile(null);
      setVisibility('private');
      const input = document.getElementById(`document-upload-${echoId}`) as HTMLInputElement | null;
      if (input) input.value = '';
      await refresh();
      setNotice(uploaded.truncated ? 'Document saved. Only its first 30,000 extracted characters were retained.' : 'Document knowledge saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally { setBusy(false); }
  }

  async function changeVisibility(item: UploadedKnowledgeDocument, next: Visibility) {
    if (activeId) return;
    if (next === 'public' && !window.confirm('Make this entire document available to public ECHO chat? Only choose Public if every extracted detail is safe to share.')) return;
    setActiveId(item.id);
    setError('');
    setNotice('');
    try {
      await documents.setVisibility(echoId, item.id, next);
      await refresh();
      setNotice('Document visibility updated.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update visibility.'); }
    finally { setActiveId(''); }
  }

  async function remove(item: UploadedKnowledgeDocument) {
    if (activeId || !window.confirm(`Permanently delete the extracted knowledge from “${item.filename}”?`)) return;
    setActiveId(item.id);
    setError('');
    setNotice('');
    try {
      await documents.remove(echoId, item.id);
      await refresh();
      setNotice('Document knowledge removed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete document.'); }
    finally { setActiveId(''); }
  }

  return <section className="document-v11 section-space" aria-labelledby="document-v11-heading">
    <header>
      <span className="section-kicker">DOCUMENT KNOWLEDGE / APPROVED SOURCES</span>
      <h2 id="document-v11-heading">Knowledge documents</h2>
      <p className="muted">Add readable text from your documents to improve ECHO answers. Originals are not retained; extracted text is stored in your account. Scanned PDFs without selectable text are not supported.</p>
    </header>
    {error ? <p role="alert" className="error">{error}</p> : null}
    {notice ? <p role="status" className="voice-status">{notice}</p> : null}
    <div className="document-v11-grid">
      <form className="document-v11-form form" onSubmit={event => void upload(event)}>
        <h3>Import a document</h3>
        <label htmlFor={`document-upload-${echoId}`}>Document (TXT, MD, PDF or DOCX; max 2 MB)
          <input id={`document-upload-${echoId}`} type="file" accept=".txt,.md,.pdf,.docx" required onChange={event => setFile(event.target.files?.[0] || null)} />
        </label>
        <label>Knowledge visibility
          <select value={visibility} onChange={event => setVisibility(event.target.value as Visibility)}>
            <option value="private">Private — owner chat only</option>
            <option value="public">Public — available to visitors</option>
          </select>
        </label>
        {visibility === 'public' ? <p className="document-v11-warning">Public documents may be used when visitors chat with your ECHO. Review the document for private or sensitive information before uploading.</p> : <p className="document-v11-tip">Private documents are not selected for public chat. Approved context may still be sent to your configured AI provider when you chat.</p>}
        <button type="submit" className="button" disabled={!file || busy || items.length >= 10}>{busy ? 'Importing…' : 'Import knowledge ↗'}</button>
        <small className="muted">Up to 10 documents per ECHO. Text extraction is limited to 30,000 characters per file.</small>
      </form>
      <div className="document-v11-library">
        <div className="document-v11-library-heading"><h3>Document library</h3><span>{loading ? 'Loading…' : `${items.length} / 10`}</span></div>
        {loading ? <p role="status" className="muted">Loading your documents…</p> : null}
        {!loading && !items.length ? <p className="muted">No documents added yet.</p> : null}
        {items.map(item => <article className="document-v11-item" key={item.id}>
          <div className="document-v11-item-head"><strong>{item.filename}</strong><span className={`badge ${item.visibility === 'public' ? 'badge-public' : 'badge-private'}`}>{item.visibility}</span></div>
          <small className="muted">{item.characters.toLocaleString()} extracted characters · {new Date(item.created_at).toLocaleDateString()}</small>
          <div className="document-v11-actions">
            <label>Visibility <select aria-label={`Visibility for ${item.filename}`} value={item.visibility} disabled={Boolean(activeId)} onChange={event => void changeVisibility(item, event.target.value as Visibility)}>
              <option value="private">Private</option><option value="public">Public</option>
            </select></label>
            <button type="button" className="document-v11-delete" disabled={Boolean(activeId)} onClick={() => void remove(item)}>{activeId === item.id ? 'Working…' : 'Delete'}</button>
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}
