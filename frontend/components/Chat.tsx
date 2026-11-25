import { useState, FormEvent } from 'react';
import Voice from './Voice';
import { echoes } from '../lib/api';
import type { Message } from '../types';
export default function Chat({ path, name }: { path: string; name: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(e: FormEvent) {
    e.preventDefault(); const message = draft.trim(); if (!message || busy) return;
    const history = messages.slice(-8); setDraft(''); setError(''); setBusy(true);
    setMessages(v => [...v, { role: 'user', content: message }]);
    try { const data = await echoes.chat(path, message, history); setMessages(v => [...v, { role: 'assistant', content: data.reply + (data.demo ? ' (Demo mode)' : '') }]); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="chat card"><div className="chat-heading"><span className="online" /> Chat with {name} <span className="muted">· AI, not a human</span></div>
    <div className="messages" aria-live="polite">{messages.length === 0 && <div className="empty-chat">Ask me about my projects, skills, or background.</div>}
      {messages.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}{busy && <div className="bubble assistant">Thinking…</div>}</div>
    {error && <p className="error">{error}</p>}
    <Voice onTranscript={setDraft} speakText={[...messages].reverse().find(m=>m.role==='assistant')?.content || ''}/>
    <form onSubmit={send} className="chat-form"><input aria-label="Message" maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask ECHO anything…" /><button className="button" disabled={busy || !draft.trim()}>Send ↗</button></form>
  </section>;
}
