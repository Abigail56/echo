import { useEffect, useState, type FormEvent } from 'react';
import Voice from './Voice';
import { echoes } from '../lib/api';
import type { Message } from '../types';

type HistoryTurn = { id: string; user_message: string; assistant_message: string; created_at: string };
type KnowledgeSource = { id: string; title: string };
type ChatDisplayMessage = Message & { sources?: KnowledgeSource[] };

function toMessages(turns: HistoryTurn[]): ChatDisplayMessage[] {
  return turns.flatMap(turn => [
    { role: 'user' as const, content: turn.user_message },
    { role: 'assistant' as const, content: turn.assistant_message },
  ]);
}

/** Owner-only chat uses database history; public conversations remain ephemeral. */
export default function Chat({ path, name, echoId }: { path: string; name: string; echoId?: string }) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(echoId));
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!echoId) { setMessages([]); setLoading(false); return; }
    let mounted = true;
    setLoading(true);
    echoes.history(echoId).then(turns => {
      if (mounted) { setMessages(toMessages(turns)); setError(''); }
    }).catch(cause => {
      if (mounted) setError(cause instanceof Error ? cause.message : 'Could not load conversation history.');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [echoId]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy || loading || clearing) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      // Server owns history for signed-in owner chat; public chat remains browser-local.
      const history = echoId ? [] : messages.slice(-8);
      const data = await echoes.chat(path, message, history);
      setMessages(current => [...current,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: data.reply + (data.demo ? ' (Demo mode)' : ''), sources: data.sources || [] },
      ].slice(-200));
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your message. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (!echoId || busy || loading || clearing) return;
    if (!window.confirm('Permanently delete this ECHO conversation history? Saved memories will not be deleted.')) return;
    setClearing(true);
    setError('');
    setNotice('');
    try {
      await echoes.clearHistory(echoId);
      setMessages([]);
      setNotice('Conversation history deleted. Your saved memories are unchanged.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not clear conversation history.');
    } finally {
      setClearing(false);
    }
  }

  return <section className="chat card chat-v9" aria-label={`Chat with ${name}`}>
    <div className="chat-v9-header">
      <div><div className="chat-heading"><span className="online" /> Chat with {name} <span className="muted">· AI, not a human</span></div>
        <p className="chat-v9-description">{echoId ? 'Your latest 100 completed exchanges are saved privately. Knowledge references are shown on new replies only.' : 'This public chat is not saved to the ECHO owner’s chat history.'}</p></div>
      {echoId ? <button className="button button-outline small" type="button" disabled={busy || loading || clearing || !messages.length} onClick={() => void clearHistory()}>{clearing ? 'Deleting…' : 'Clear history'}</button> : null}
    </div>
    <div className="messages" role="log" aria-live="polite" aria-relevant="additions">
      {loading ? <div className="empty-chat" role="status">Loading conversation history…</div> : null}
      {!loading && messages.length === 0 ? <div className="empty-chat">Start a conversation with your ECHO.</div> : null}
      {messages.map((message, index) => <div key={index} className={`chat-v12-message ${message.role}`}>
        <div className={`bubble ${message.role}`}>{message.content}</div>
        {message.role === 'assistant' && message.sources && message.sources.length > 0 ? <details className="chat-v12-knowledge">
          <summary>Saved knowledge considered ({message.sources.length})</summary>
          <ul>{message.sources.map(source => <li key={source.id}>{source.title}</li>)}</ul>
          <p>These memory records were included as context. They are not independently verified citations or proof that every claim is correct.</p>
        </details> : null}
      </div>)}
      {busy ? <div className="bubble assistant">Thinking…</div> : null}
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {notice ? <p className="voice-status" role="status">{notice}</p> : null}
    <Voice onTranscript={setDraft} speakText={[...messages].reverse().find(message => message.role === 'assistant')?.content || ''} />
    <form onSubmit={send} className="chat-form">
      <input aria-label="Message" autoComplete="off" maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask ECHO anything…" />
      <button className="button" type="submit" disabled={busy || loading || clearing || !draft.trim()}>{busy ? 'Sending…' : 'Send ↗'}</button>
    </form>
  </section>;
}
