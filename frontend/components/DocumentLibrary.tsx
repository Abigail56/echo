import { useCallback, useEffect, useState } from 'react';
import { studio, type KnowledgeDocument } from '../lib/api';

export default function DocumentLibrary({echoId, revision, onChanged}: {
  echoId: string; revision: number; onChanged: () => Promise<void> | void;
}) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(await studio.documents(echoId));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your document library.');
    } finally {
      setLoading(false);
    }
  }, [echoId]);

  useEffect(() => { void load(); }, [load, revision]);

  async function setVisibility(document: KnowledgeDocument, visibility: 'private' | 'public') {
    if (busyId) return;
    if (visibility === document.visibility) return;
    if (visibility === 'public' && !window.confirm(
      `Share all ${document.section_count} saved sections of “${document.title}” with visitors? They may be used in public AI replies.`
    )) return;
    setBusyId(document.id);
    setError(''); setNotice('');
    try {
      await studio.setDocumentVisibility(echoId, document.id, visibility, visibility === 'public');
      await load();
      await onChanged();
      setNotice(`Document “${document.title}” is now ${visibility}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change document visibility.');
    } finally {
      setBusyId('');
    }
  }

  async function remove(document: KnowledgeDocument) {
    if (busyId || !window.confirm(
      `Permanently delete “${document.title}” and its ${document.section_count} saved sections? This cannot be undone.`
    )) return;
    setBusyId(document.id);
    setError(''); setNotice('');
    try {
      await studio.removeDocument(echoId, document.id);
      await load();
      await onChanged();
      setNotice(`Document “${document.title}” and its saved sections were deleted.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete document.');
    } finally {
      setBusyId('');
    }
  }

  return <section className="document-library-v14" aria-labelledby="document-library-heading">
    <div className="document-library-v14-heading">
      <div><span className="section-kicker">ORGANIZED KNOWLEDGE</span><h3 id="document-library-heading">Document Library</h3>
        <p>Manage all sections of a newly imported document together. Original file bytes are not retained.</p></div>
      <span>{loading ? 'Loading…' : `${documents.length} documents`}</span>
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {notice ? <p className="voice-status" role="status">{notice}</p> : null}
    {loading ? <p className="muted" role="status">Loading documents…</p> : !documents.length && !error ?
      <p className="document-library-v14-empty">No grouped documents yet. Import a document above to see it here. Previously imported sections remain in the memory library below.</p> : null}
    <div className="document-library-v14-list">
      {documents.map(document => <article className="document-library-v14-item" key={document.id}>
        <div><strong>{document.title}</strong>
          <span>{document.section_count} {document.section_count === 1 ? 'section' : 'sections'} · {document.visibility}</span>
        </div>
        <div className="document-library-v14-actions">
          <button className="button button-outline small" type="button" disabled={Boolean(busyId)} onClick={() => void setVisibility(document, document.visibility === 'public' ? 'private' : 'public')}>
            {busyId === document.id ? 'Updating…' : document.visibility === 'public' ? 'Make private' : 'Share publicly'}
          </button>
          <button className="memory-v8-delete" type="button" disabled={Boolean(busyId)} onClick={() => void remove(document)}>
            {busyId === document.id ? 'Working…' : 'Delete document'}
          </button>
        </div>
      </article>)}
    </div>
  </section>;
}
