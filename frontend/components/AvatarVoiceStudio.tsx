import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { Echo, Message } from '../types';
import { API_BASE_URL, echoes } from '../lib/api';
import { openMicrophone } from '../lib/media';
import Human3D from './Human3D';
import AvatarCreator from './AvatarCreator';

type Mode = 'human' | 'echo';
type ChatTurn = Message;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export default function AvatarVoiceStudio() {
  const [mode, setMode] = useState<Mode>('human');
  const [echoList, setEchoList] = useState<Echo[]>([]);
  const [echoLoaded, setEchoLoaded] = useState(false);
  const [loadingEcho, setLoadingEcho] = useState(false);
  const [echoId, setEchoId] = useState('');
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState('');
  const [micActive, setMicActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [voice, setVoice] = useState('en-us');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [status, setStatus] = useState('Microphone off');
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [avatarModelUrl, setAvatarModelUrl] = useState<string>();

  const streamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micFrameRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const updateAvatarModelUrl = useCallback((url: string | undefined) => setAvatarModelUrl(url), []);

  const stopMicrophone = useCallback(async (nextStatus = 'Microphone off') => {
    if (micFrameRef.current !== null) cancelAnimationFrame(micFrameRef.current);
    micFrameRef.current = null;
    streamRef.current?.getTracks().forEach(track => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    const context = micContextRef.current;
    micContextRef.current = null;
    if (context && context.state !== 'closed') await context.close();
    setMicActive(false);
    setMuted(false);
    setLevel(0);
    setStatus(nextStatus);
  }, []);

  const refreshMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError('This browser does not support microphone selection.');
      return;
    }
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices())
        .filter(device => device.kind === 'audioinput');
      setMicrophones(inputs);
    } catch (err) {
      setError(`Could not list microphones: ${messageFrom(err)}`);
    }
  }, []);

  const startMicrophone = useCallback(async (deviceId = microphoneId) => {
    setError('');
    await stopMicrophone('Requesting microphone permission…');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone capture is not supported by this browser. Use a secure context such as localhost or HTTPS.');
      setStatus('Microphone unavailable');
      return;
    }
    try {
      const capture = await openMicrophone(deviceId);
      const stream = capture.stream;
      if (capture.deviceId) setMicrophoneId(capture.deviceId);
      streamRef.current = stream;
      const context = new AudioContext();
      micContextRef.current = context;
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let lastPaint = 0;
      const sample = (now: number) => {
        if (streamRef.current !== stream) return;
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const value of samples) {
          const amplitude = (value - 128) / 128;
          energy += amplitude * amplitude;
        }
        const rms = Math.sqrt(energy / samples.length);
        if (now - lastPaint > 75) {
          setLevel(stream.getAudioTracks()[0]?.enabled ? Math.min(1, rms * 7) : 0);
          lastPaint = now;
        }
        micFrameRef.current = requestAnimationFrame(sample);
      };
      micFrameRef.current = requestAnimationFrame(sample);
      stream.getAudioTracks().forEach(track => {
        track.onended = () => { void stopMicrophone('Microphone disconnected'); };
      });
      setMuted(false);
      setMicActive(true);
      setStatus(capture.usedFallback
        ? `Microphone active · using ${capture.label} · volume-driven lip-sync`
        : 'Microphone active · volume-driven lip-sync');
      await refreshMicrophones();
    } catch (err) {
      await stopMicrophone('Microphone off');
      const name = err instanceof DOMException ? err.name : '';
      setError(name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Microphone permission was denied. Allow microphone access in browser settings and try again.'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'No microphone was found. Connect a microphone and try again.'
          : `Could not start microphone: ${messageFrom(err)}`);
    }
  }, [microphoneId, refreshMicrophones, stopMicrophone]);

  const stopAiSpeech = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    if (audioFrameRef.current !== null) cancelAnimationFrame(audioFrameRef.current);
    audioFrameRef.current = null;
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAiBusy(false);
    setAiSpeaking(false);
    setLevel(0);
    setStatus('AI speech stopped');
  }, []);

  const stopAll = useCallback(() => {
    stopAiSpeech();
    void stopMicrophone();
  }, [stopAiSpeech, stopMicrophone]);

  useEffect(() => {
    const onDeviceChange = () => { void refreshMicrophones(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      if (micFrameRef.current !== null) cancelAnimationFrame(micFrameRef.current);
      streamRef.current?.getTracks().forEach(track => {
        track.onended = null;
        track.stop();
      });
      if (micContextRef.current && micContextRef.current.state !== 'closed') {
        void micContextRef.current.close();
      }
      requestRef.current?.abort();
      audioRef.current?.pause();
      if (audioFrameRef.current !== null) cancelAnimationFrame(audioFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close();
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  async function changeMode(next: Mode) {
    if (next === mode) return;
    stopAll();
    setError('');
    setMode(next);
    setStatus(next === 'human' ? 'Microphone off' : 'AI ready');
    if (next === 'echo' && !echoLoaded) {
      setLoadingEcho(true);
      try {
        const items = await echoes.list();
        setEchoList(items);
        setEchoId(items[0]?.id || '');
        setEchoLoaded(true);
        setStatus(items.length ? 'AI ready' : 'Create an ECHO before using AI speech');
      } catch (err) {
        setError(messageFrom(err));
      } finally {
        setLoadingEcho(false);
      }
    }
  }

  async function toggleMute() {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
    setLevel(0);
    setStatus(track.enabled ? 'Microphone active · volume-driven lip-sync' : 'Microphone muted');
  }

  async function askEcho(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!echoId || !question.trim() || aiBusy) return;
    setError('');
    const prompt = question.trim();
    setQuestion('');
    const controller = new AbortController();
    requestRef.current = controller;
    setAiBusy(true);
    setStatus('AI responding…');
    try {
      const result = await echoes.chat(
        `/echoes/${encodeURIComponent(echoId)}/chat`,
        prompt,
        history,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const userTurn: ChatTurn = { role: 'user', content: prompt };
      const assistantTurn: ChatTurn = { role: 'assistant', content: result.reply };
      const nextHistory: ChatTurn[] = [...history, userTurn, assistantTurn].slice(-12);
      setHistory(nextHistory);
      const response = await fetch(`${API_BASE_URL}/avatar/speech`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.reply, voice }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Speech request failed (${response.status})`);
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      const context = new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaElementSource(audio).connect(analyser);
      analyser.connect(context.destination);
      const samples = new Uint8Array(analyser.fftSize);
      const animate = () => {
        if (audioRef.current !== audio) return;
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const value of samples) {
          const amplitude = (value - 128) / 128;
          energy += amplitude * amplitude;
        }
        setLevel(Math.min(1, Math.sqrt(energy / samples.length) * 7));
        audioFrameRef.current = requestAnimationFrame(animate);
      };
      audio.onended = () => {
        stopAiSpeech();
        setStatus('AI response finished');
      };
      audio.onerror = () => {
        stopAiSpeech();
        setError('The generated speech could not be played.');
      };
      await audio.play();
      setAiBusy(false);
      setAiSpeaking(true);
      setStatus('AI speaking · synthetic voice');
      audioFrameRef.current = requestAnimationFrame(animate);
    } catch (err) {
      if (!controller.signal.aborted) {
        stopAiSpeech();
        setError(messageFrom(err));
        setStatus('AI speech unavailable');
        setAiBusy(false);
        setAiSpeaking(false);
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  const mouthOpen = ((micActive && !muted) || aiSpeaking) ? level : 0;
  const visibleStatus = micActive && !muted
    ? level > 0.035 ? 'Listening · microphone active' : 'Microphone active · waiting for speech'
    : status;

  return <section className="voice-studio" aria-label="Avatar voice studio">
    <div className="voice-mode-switch" role="group" aria-label="Speaking mode">
      <button type="button" className={mode === 'human' ? 'button' : 'button ghost'} onClick={() => void changeMode('human')}>Speak as Avatar</button>
      <button type="button" className={mode === 'echo' ? 'button' : 'button ghost'} onClick={() => void changeMode('echo')}>Let ECHO Speak</button>
    </div>
    <Human3D talking={mouthOpen > 0.035} mouthOpen={mouthOpen} color="#4dd9ec" modelUrl={avatarModelUrl}/>
    <div className="voice-status" role="status" aria-live="polite">
      <span className={micActive && !muted || aiSpeaking ? 'voice-indicator active' : 'voice-indicator'} />
      {visibleStatus}
    </div>

    {mode === 'human' ? <div className="voice-controls">
      <p className="muted">Live microphone mode only analyzes volume in this browser to animate the avatar. Your audio is not uploaded, transmitted, or recorded. This is not phoneme-accurate lip-sync.</p>
      <label>Microphone
        <select value={microphoneId} onChange={event => {
          const id = event.target.value;
          setMicrophoneId(id);
          if (micActive) void startMicrophone(id);
        }} disabled={microphones.length === 0}>
          <option value="">Default microphone</option>
          {microphones.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
        </select>
      </label>
      <div className="voice-actions">
        {!micActive
          ? <button className="button" type="button" onClick={() => void startMicrophone()}>Start microphone</button>
          : <button className="button" type="button" onClick={() => void stopMicrophone()}>Stop microphone</button>}
        <button className="button ghost" type="button" onClick={() => void toggleMute()} disabled={!micActive}>{muted ? 'Unmute' : 'Mute'}</button>
        <button className="button ghost" type="button" onClick={() => void refreshMicrophones()}>Refresh devices</button>
      </div>
      <div className="audio-meter" aria-label="Microphone activity"><span style={{ width: `${Math.round(level * 100)}%` }} /></div>
      <p className="muted smallprint">Audio quality: {micActive ? (level > 0.03 ? 'voice detected' : 'connected · waiting for voice') : 'not connected'}</p>
    </div> : <div className="voice-controls">
      <p className="muted">AI-generated speech is clearly labeled. Replies use this ECHO’s approved knowledge and memories through the configured AI provider. This conversation stays in page memory only and is not saved by this feature.</p>
      <label>ECHO identity
        <select value={echoId} onChange={event => { setEchoId(event.target.value); setHistory([]); }} disabled={!echoList.length}>
          {echoList.map(echo => <option key={echo.id} value={echo.id}>{echo.name}</option>)}
        </select>
      </label>
      <label>AI voice
        <select value={voice} onChange={event => setVoice(event.target.value)}>
          <option value="en-us">English · US</option>
          <option value="en-gb">English · UK</option>
          <option value="en-sc">English · Scottish</option>
        </select>
      </label>
      {history.map((item, index) => <p className={`voice-chat ${item.role}`} key={`${index}-${item.role}`}><strong>{item.role === 'user' ? 'You' : 'ECHO (AI)'}:</strong> {item.content}</p>)}
      <form className="voice-prompt" onSubmit={event => void askEcho(event)}>
        <input aria-label="Ask ECHO" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask your ECHO a question…" maxLength={2000} disabled={!echoId || aiBusy || aiSpeaking}/>
        <button className="button" type="submit" disabled={!echoId || !question.trim() || aiBusy || aiSpeaking || loadingEcho}>{loadingEcho ? 'Loading ECHOs…' : aiBusy ? 'Responding…' : 'Ask and speak'}</button>
      </form>
      <div className="voice-actions">
        {aiSpeaking || aiBusy ? <button type="button" className="button ghost" onClick={stopAiSpeech}>Stop speaking</button> : null}
        <button type="button" className="button ghost" onClick={() => { stopAiSpeech(); setHistory([]); setStatus('AI ready'); }}>Clear conversation</button>
      </div>
      <p className="muted smallprint">The synthetic voice is generated by the app’s local speech engine. It does not imitate a user or custom voice.</p>
    </div>}
    <AvatarCreator onModelUrl={updateAvatarModelUrl} />
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
