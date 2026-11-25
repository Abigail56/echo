import { useEffect, useState, FormEvent } from 'react';
import { studio } from '../lib/api';
export default function MemoryPanel({echoId}:{echoId:string}) {
 const [items,setItems]=useState<any[]>([]); const [title,setTitle]=useState(''); const [content,setContent]=useState(''); const [visibility,setVisibility]=useState('private'); const [error,setError]=useState('');
 const refresh=()=>studio.memories(echoId).then(setItems).catch(e=>setError(e.message));
 useEffect(()=>{refresh();},[echoId]);
 async function add(e:FormEvent){e.preventDefault();setError('');try{await studio.addMemory(echoId,{title,content,visibility});setTitle('');setContent('');refresh();}catch(e){setError((e as Error).message)}}
 return <section className="card section-space"><div className="eyebrow">APPROVED MEMORY</div><h2>Teach your ECHO</h2><p className="muted">Private memories are used only in your owner chat. Public memories may be shared in public conversations. Delete memories at any time.</p>
 {error&&<p className="error">{error}</p>}
 <form className="form" onSubmit={add}><label>Memory title<input required minLength={2} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Information<textarea required minLength={2} maxLength={5000} rows={4} value={content} onChange={e=>setContent(e.target.value)}/></label><label>Visibility<select value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="private">Private</option><option value="public">Public</option></select></label><button className="button">Save approved memory</button></form>
 <div className="stack">{items.map(m=><div className="card compact" key={m.id}><div className="row"><strong>{m.title}</strong><span className="badge">{m.visibility}</span></div><p>{m.content}</p><button className="danger" onClick={async()=>{await studio.removeMemory(echoId,m.id);refresh()}}>Delete memory</button></div>)}</div>
 </section>;
}
