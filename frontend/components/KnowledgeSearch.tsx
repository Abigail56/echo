import { useEffect, useState } from 'react';
import { studio, type KnowledgeSearchHit } from '../lib/api';

type Visibility = 'all' | 'private' | 'public';
type Origin = 'all' | 'document' | 'manual';

export default function KnowledgeSearch({ echoId, revision, onSelect }: {
  echoId: string; revision: number; onSelect: (memoryId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('all');
  const [origin, setOrigin] = useState<Origin>('all');
  const [results, setResults] = useState<KnowledgeSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(''); setLoading(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      studio.searchKnowledge(echoId, query.trim(), visibility, origin).then(data => {
        if (active) { setResults(data); setError(''); }
      }).catch(cause => {
        if (active) { setResults([]); setError(cause instanceof Error ? cause.message : 'Search failed.'); }
      }).finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [echoId, query, visibility, origin, revision]);

  return <section className="knowledge-search-v15" aria-labelledby="knowledge-search-heading">
    <div className="knowledge-search-v15-heading">
      <span className="section-kicker">FIND SAVED INFORMATION</span>
      <h3 id="knowledge-search-heading">Search your knowledge.</h3>
      <p>Search titles and content in this ECHO's private and public memories. Only the owner can use this search.</p>
    </div>
    <div className="knowledge-search-v15-fields">
      <label>Search memories
        <input type="search" maxLength={120} placeholder="e.g. RouteBridge dispatch" value={query}
          onChange={event => setQuery(event.target.value)} autoComplete="off" />
      </label>
      <label>Visibility
        <select value={visibility} onChange={event => setVisibility(event.target.value as Visibility)}>
          <option value="all">All visibility</option><option value="private">Private</option><option value="public">Public</option>
        </select>
      </label>
      <label>Source
        <select value={origin} onChange={event => setOrigin(event.target.value as Origin)}>
          <option value="all">All knowledge</option><option value="document">Imported documents</option><option value="manual">Standalone memories</option>
        </select>
      </label>
    </div>
    {error ? <p role="alert" className="error">{error}</p> : null}
    {query.trim() ? <div className="knowledge-search-v15-results" aria-label="Matching memories">
      <div className="knowledge-search-v15-results-heading" role="status">{loading ? 'Searching…' : `${results.length} matching ${results.length === 1 ? 'memory' : 'memories'}`}</div>
      {!loading && !results.length && !error ? <p className="muted">No matching memories. Try different words or filters.</p> : null}
      {!loading && results.map(result => <button type="button" className="knowledge-search-v15-hit" key={result.id} onClick={() => onSelect(result.id)}>
        <span className="knowledge-search-v15-hit-top"><strong>{result.title}</strong><span>{result.visibility} · {result.document_id ? 'document section' : 'standalone memory'}</span></span>
        <span className="knowledge-search-v15-snippet">{result.snippet}</span>
        <span className="knowledge-search-v15-action">View in Memory Library ↗</span>
      </button>)}
    </div> : <p className="knowledge-search-v15-hint">Enter a keyword to search your saved knowledge. Results are limited to 30 matching memories.</p>}
  </section>;
}
