import { FormEvent, useCallback, useEffect, useState } from 'react';
import { studio } from '../lib/api';
import DocumentImport from './DocumentImport';

type MemoryVisibility = 'private' | 'public';
type Memory = { id: string; title: string; content: string; visibility: MemoryVisibility; created_at?: string };

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.';
}

export default function MemoryPanel({ echoId }: { echoId: string }) {
  const [items, setItems] = useState<Memory[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<MemoryVisibility>('private');
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editVisibility, setEditVisibility] = useState<MemoryVisibility>('private');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const memories = await studio.memories(echoId) as Memory[];
      setItems(memories);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [echoId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    studio.memories(echoId).then(memories => {
      if (!cancelled) { setItems(memories as Memory[]); setError(''); }
    }).catch(cause => {
      if (!cancelled) setError(errorMessage(cause));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [echoId]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await studio.addMemory(echoId, { title: title.trim(), content: content.trim(), visibility });
      setTitle('');
      setContent('');
      setVisibility('private');
      await refresh();
      setNotice('Memory saved with your chosen visibility.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(memory: Memory) {
    setEditingId(memory.id);
    setEditTitle(memory.title);
    setEditContent(memory.content);
    setEditVisibility(memory.visibility);
    setNotice('');
    setError('');
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || busyId) return;
    setBusyId(editingId);
    setNotice('');
    setError('');
    try {
      await studio.updateMemory(echoId, editingId, {
        title: editTitle.trim(), content: editContent.trim(), visibility: editVisibility,
      });
      setEditingId('');
      await refresh();
      setNotice('Memory updated.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  async function remove(memory: Memory) {
    if (busyId || !window.confirm(`Delete “${memory.title}” permanently? This cannot be undone.`)) return;
    setBusyId(memory.id);
    setError('');
    setNotice('');
    try {
      await studio.removeMemory(echoId, memory.id);
      if (editingId === memory.id) setEditingId('');
      await refresh();
      setNotice('Memory deleted.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  const privateCount = items.filter(item => item.visibility === 'private').length;
  const publicCount = items.length - privateCount;

  return <section className="memory-v8 section-space" aria-labelledby="memories-heading" id="echo-memories">
    <header className="memory-v8-heading">
      <div><span className="section-kicker">KNOWLEDGE / YOUR RULES</span><h2 id="memories-heading">ECHO Memory Center</h2>
        <p>Add factual knowledge your ECHO may use. Private memories are for owner chat; public memories may be used in conversations with visitors. Avoid passwords or sensitive credentials.</p></div>
    </header>
    <div className="memory-v8-stats" aria-label="Memory overview">
      <div><span>Total memories</span><strong>{loading ? '—' : items.length}</strong></div>
      <div><span>Private</span><strong>{loading ? '—' : privateCount}</strong></div>
      <div><span>Public</span><strong>{loading ? '—' : publicCount}</strong></div>
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {notice ? <p className="voice-status" role="status">{notice}</p> : null}

    <DocumentImport echoId={echoId} onImported={refresh} />
    <div className="memory-v8-layout">
      <form className="form memory-v8-create" onSubmit={event => void add(event)}>
        <div><span className="section-kicker">ADD KNOWLEDGE</span><h3>Teach your ECHO.</h3><p>Write a specific fact or detail that your representative should know.</p></div>
        <label>Memory title<input required minLength={2} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Portfolio projects" /></label>
        <label>Information<textarea required minLength={2} maxLength={5000} rows={5} value={content} onChange={event => setContent(event.target.value)} placeholder="Write the knowledge here…" /></label>
        <label>Visibility<select value={visibility} onChange={event => setVisibility(event.target.value as MemoryVisibility)}>
          <option value="private">Private — owner chat only</option><option value="public">Public — approved for visitors</option>
        </select></label>
        {visibility === 'public' ? <p className="memory-v8-warning">Public knowledge may be included in replies to visitors. Only publish information you are comfortable sharing.</p> : <p className="memory-v8-tip">Private memories may be used in your owner chat, and are not included in public ECHO chat.</p>}
        <button className="button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save memory ↗'}</button>
      </form>

      <div className="memory-v8-library">
        <div className="memory-v8-library-heading"><div><span className="section-kicker">SAVED KNOWLEDGE</span><h3>Your memory library</h3></div><span>{loading ? 'Loading…' : `${items.length} / 100`}</span></div>
        {loading ? <p className="memory-v8-empty" role="status">Loading approved memories…</p> : null}
        {!loading && !items.length && !error ? <div className="memory-v8-empty"><strong>Nothing stored yet.</strong><p>Your first approved memory will appear here.</p></div> : null}
        <div className="memory-v8-list">
          {items.map(memory => <article className="memory-v8-item" key={memory.id}>
            {editingId === memory.id ? <form className="form memory-v8-edit" onSubmit={event => void saveEdit(event)}>
              <label>Memory title<input required minLength={2} maxLength={120} value={editTitle} onChange={event => setEditTitle(event.target.value)} /></label>
              <label>Information<textarea required minLength={2} maxLength={5000} rows={5} value={editContent} onChange={event => setEditContent(event.target.value)} /></label>
              <label>Visibility<select value={editVisibility} onChange={event => setEditVisibility(event.target.value as MemoryVisibility)}>
                <option value="private">Private — owner chat only</option><option value="public">Public — approved for visitors</option>
              </select></label>
              {editVisibility === 'public' ? <p className="memory-v8-warning">Changing this memory to public allows it to be used in public ECHO responses.</p> : null}
              <div className="memory-v8-actions"><button className="button small" type="submit" disabled={Boolean(busyId)}>{busyId === memory.id ? 'Saving…' : 'Save changes'}</button><button className="button button-outline small" type="button" disabled={Boolean(busyId)} onClick={() => setEditingId('')}>Cancel</button></div>
            </form> : <>
              <div className="memory-v8-item-top"><strong>{memory.title}</strong><span className={`badge ${memory.visibility === 'public' ? 'badge-public' : 'badge-private'}`}>{memory.visibility}</span></div>
              <p>{memory.content}</p>
              <div className="memory-v8-actions">
                <button className="button button-outline small" type="button" disabled={Boolean(busyId)} onClick={() => beginEdit(memory)}>Edit memory</button>
                <button className="memory-v8-delete" type="button" disabled={Boolean(busyId)} onClick={() => void remove(memory)}>{busyId === memory.id ? 'Deleting…' : 'Delete'}</button>
              </div>
            </>}
          </article>)}
        </div>
      </div>
    </div>
  </section>;
}
