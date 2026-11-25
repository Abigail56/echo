import { useEffect, useState } from 'react';
export default function Voice({ onTranscript, speakText }: {onTranscript:(text:string)=>void;speakText:string}) {
  const [listening,setListening] = useState(false);
  const [supported,setSupported] = useState(false);
  useEffect(()=>{setSupported(typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));},[]);
  function listen() {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if(!Ctor) return;
    const recognition = new Ctor(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false;
    recognition.onresult = (event:any) => onTranscript(event.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true); recognition.start();
  }
  function speak(){ if(!('speechSynthesis' in window))return; window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(speakText); u.rate=1; window.speechSynthesis.speak(u); }
  return <div className="voice-tools"><button type="button" className="button ghost small" onClick={listen} disabled={!supported || listening}>{listening?'Listening…':'Speak'}</button><button type="button" className="button ghost small" onClick={speak} disabled={!speakText}>Read reply</button><span className="muted">Browser speech tools; voices and recognition depend on your browser.</span></div>;
}
