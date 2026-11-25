import { useState, FormEvent } from 'react';
import type { EchoInput } from '../types';
import Avatar from './Avatar';
export const emptyEcho: EchoInput = { handle: '', name: '', tagline: '', personality: 'Friendly, helpful and professional', private_knowledge: '', public_knowledge: '', avatar_color: 'cyan', avatar_style: 'orb', is_public: false };
export default function EchoForm({ initial = emptyEcho, onSave, busy }: { initial?: EchoInput; onSave: (data: EchoInput) => Promise<void>; busy: boolean }) {
  const [form, setForm] = useState<EchoInput>(initial);
  const [error, setError] = useState('');
  function update<K extends keyof EchoInput>(key: K, value: EchoInput[K]) { setForm(v => ({ ...v, [key]: value })); }
  async function submit(e: FormEvent) { e.preventDefault(); setError(''); try { await onSave(form); } catch (err) { setError((err as Error).message); } }
  return <form className="form card" onSubmit={submit}>
    <div className="form-preview"><Avatar name={form.name || 'Your ECHO'} color={form.avatar_color} style={form.avatar_style} /><div><h2>{form.name || 'Your ECHO'}</h2><p className="muted">AI-powered digital identity</p></div></div>
    <div className="grid-two"><label>ECHO name<input required minLength={2} maxLength={80} value={form.name} onChange={e => update('name', e.target.value)} placeholder="Nova" /></label>
      <label>Unique handle<input required minLength={3} maxLength={40} pattern="[a-z0-9-]+" value={form.handle} onChange={e => update('handle', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="my-nova" /></label></div>
    <label>Tagline<input maxLength={180} value={form.tagline} onChange={e => update('tagline', e.target.value)} placeholder="My interactive professional twin" /></label>
    <label>Personality<textarea maxLength={500} rows={3} value={form.personality} onChange={e => update('personality', e.target.value)} /></label>
    <div className="grid-two"><label>Avatar color<select value={form.avatar_color} onChange={e => update('avatar_color', e.target.value)}><option value="cyan">Electric blue</option><option value="violet">Royal purple</option><option value="pink">Electric magenta</option><option value="emerald">Soft jade</option></select></label>
      <label>Presence mark<select value={form.avatar_style} onChange={e => update('avatar_style', e.target.value)}><option value="orb">Initial portrait</option><option value="robot">Signal mark</option><option value="star">Aperture mark</option></select></label></div>
    <label>Private knowledge <span className="muted">(only available in your dashboard chat)</span><textarea rows={5} maxLength={12000} value={form.private_knowledge} onChange={e => update('private_knowledge', e.target.value)} placeholder="Private context for your ECHO..." /></label>
    <label>Public-approved knowledge <span className="muted">(visitors may ask about this)</span><textarea rows={5} maxLength={12000} value={form.public_knowledge} onChange={e => update('public_knowledge', e.target.value)} placeholder="Approved bio, projects, skills, contact preferences..." /></label>
    <label className="check"><input type="checkbox" checked={form.is_public} onChange={e => update('is_public', e.target.checked)} /><span>Publish public ECHO profile. Visitors can chat using only public-approved knowledge.</span></label>
    {error && <p className="error">{error}</p>}<button disabled={busy} className="button">{busy ? 'Saving…' : 'Save ECHO →'}</button>
  </form>;
}
