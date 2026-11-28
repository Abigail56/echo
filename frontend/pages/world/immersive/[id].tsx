import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../../components/Layout';
import { API_BASE_URL, apiResponseError, apiWebSocketUrl, echoes } from '../../../lib/api';
import { openMicrophone } from '../../../lib/media';
import type { Echo, Message } from '../../../types';
import type { Person } from '../../../components/WorldScene';

const WorldScene = dynamic(() => import('../../../components/WorldScene'), { ssr: false });

type PeerState = {
  connection: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
};

type RoomSignal =
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | RTCSessionDescriptionInit;

const rtcConfiguration: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function getWebSocketUrl(roomId: string): string {
  return apiWebSocketUrl(`/world/rooms/${roomId}/live`);
}

export default function Immersive() {
  const router = useRouter();
  const { id } = router.query;
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Voice off');
  const [micActive, setMicActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState('');
  const [echoMode, setEchoMode] = useState(false);
  const [echoesList, setEchoesList] = useState<Echo[]>([]);
  const [echoId, setEchoId] = useState('');
  const [question, setQuestion] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [error, setError] = useState('');

  const socket = useRef<WebSocket | null>(null);
  const self = useRef('');
  const pos = useRef({ x: 0, z: 0 });
  const peers = useRef(new Map<string, PeerState>());
  const micStream = useRef<MediaStream | null>(null);
  const aiStream = useRef<MediaStream | null>(null);
  const micContext = useRef<AudioContext | null>(null);
  const micFrame = useRef<number | null>(null);
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const audioContainer = useRef<HTMLDivElement>(null);
  const aiAudio = useRef<HTMLAudioElement | null>(null);
  const aiUrl = useRef<string | null>(null);
  const aiRequest = useRef<AbortController | null>(null);
  const voiceState = useRef({ speaking: false, muted: false });

  const send = useCallback((payload: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(payload));
    }
  }, []);

  const publishVoiceState = useCallback((speaking: boolean, isMuted: boolean) => {
    if (voiceState.current.speaking === speaking && voiceState.current.muted === isMuted) return;
    voiceState.current = { speaking, muted: isMuted };
    send({ type: 'voice-state', speaking, muted: isMuted });
  }, [send]);

  const addLocalTracks = useCallback((peer: PeerState) => {
    const streams = [micStream.current, aiStream.current].filter((stream): stream is MediaStream => stream !== null);
    for (const stream of streams) {
      for (const track of stream.getAudioTracks()) {
        const senders = peer.connection.getSenders();
        if (senders.some(sender => sender.track?.id === track.id)) continue;
        const endedSender = senders.find(sender => sender.track?.kind === 'audio' && sender.track.readyState === 'ended');
        if (endedSender) {
          void endedSender.replaceTrack(track).catch(cause => {
            setError(`Could not switch outgoing audio track: ${cause instanceof Error ? cause.message : 'unknown error'}`);
          });
        } else {
          peer.connection.addTrack(track, stream);
        }
      }
    }
  }, []);

  const createPeer = useCallback((participantId: string): PeerState => {
    const existing = peers.current.get(participantId);
    if (existing) return existing;

    const connection = new RTCPeerConnection(rtcConfiguration);
    const state: PeerState = {
      connection,
      polite: self.current.localeCompare(participantId) > 0,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
    };
    peers.current.set(participantId, state);
    addLocalTracks(state);

    connection.onicecandidate = event => {
      if (event.candidate) {
        send({
          type: 'voice-signal',
          target: participantId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() },
        });
      }
    };
    connection.ontrack = event => {
      let audio = audioElements.current.get(participantId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.dataset.participant = participantId;
        audioContainer.current?.appendChild(audio);
        audioElements.current.set(participantId, audio);
      }
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      void audio.play().catch(() => setVoiceStatus('Voice connected · click the page to enable remote audio'));
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        connection.close();
        peers.current.delete(participantId);
        const audio = audioElements.current.get(participantId);
        audio?.remove();
        audioElements.current.delete(participantId);
      }
      setVoiceConnected([...peers.current.values()].some(peer => peer.connection.connectionState === 'connected'));
    };
    connection.onnegotiationneeded = async () => {
      try {
        state.makingOffer = true;
        await connection.setLocalDescription();
        send({ type: 'voice-signal', target: participantId, signal: connection.localDescription });
      } catch (cause) {
        setError(`Could not establish voice connection: ${cause instanceof Error ? cause.message : 'negotiation failed'}`);
      } finally {
        state.makingOffer = false;
      }
    };
    return state;
  }, [addLocalTracks, send]);

  const closePeers = useCallback(() => {
    peers.current.forEach(peer => peer.connection.close());
    peers.current.clear();
    audioElements.current.forEach(audio => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    audioElements.current.clear();
    setVoiceConnected(false);
  }, []);

  const stopMicrophone = useCallback(async (status = 'Voice off') => {
    if (micFrame.current !== null) cancelAnimationFrame(micFrame.current);
    micFrame.current = null;
    micStream.current?.getTracks().forEach(track => {
      track.onended = null;
      track.stop();
    });
    micStream.current = null;
    if (micContext.current && micContext.current.state !== 'closed') await micContext.current.close();
    micContext.current = null;
    setMicActive(false);
    setMuted(false);
    setMicLevel(0);
    if (!aiSpeaking) publishVoiceState(false, false);
    setVoiceStatus(status);
  }, [aiSpeaking, publishVoiceState]);

  const stopAi = useCallback(() => {
    aiRequest.current?.abort();
    aiRequest.current = null;
    aiAudio.current?.pause();
    aiAudio.current = null;
    aiStream.current?.getTracks().forEach(track => track.stop());
    aiStream.current = null;
    if (aiUrl.current) URL.revokeObjectURL(aiUrl.current);
    aiUrl.current = null;
    setAiBusy(false);
    setAiSpeaking(false);
    publishVoiceState(false, voiceState.current.muted);
    setVoiceStatus('AI speech stopped');
  }, [publishVoiceState]);

  const closeVoice = useCallback(() => {
    stopAi();
    void stopMicrophone();
    closePeers();
  }, [closePeers, stopAi, stopMicrophone]);

  const listMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      setMicrophones((await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput'));
    } catch (cause) {
      setError(`Unable to list audio devices: ${cause instanceof Error ? cause.message : 'unknown error'}`);
    }
  }, []);

  const startMicrophone = useCallback(async (deviceId = microphoneId) => {
    setError('');
    if (echoMode) {
      setError('Switch to live voice mode before starting the microphone.');
      return;
    }
    await stopMicrophone('Requesting microphone permission…');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone capture requires a supported browser and a secure context (HTTPS or localhost).');
      setVoiceStatus('Microphone unavailable');
      return;
    }
    try {
      const capture = await openMicrophone(deviceId);
      const stream = capture.stream;
      if (capture.deviceId) setMicrophoneId(capture.deviceId);
      micStream.current = stream;
      const context = new AudioContext();
      micContext.current = context;
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let lastSent = 0;
      const update = (now: number) => {
        if (micStream.current !== stream) return;
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        const level = Math.min(1, rms * 7);
        setMicLevel(stream.getAudioTracks()[0]?.enabled ? level : 0);
        if (now - lastSent > 250) {
          const speaking = level > 0.035 && Boolean(stream.getAudioTracks()[0]?.enabled);
          publishVoiceState(speaking, !stream.getAudioTracks()[0]?.enabled);
          lastSent = now;
        }
        micFrame.current = requestAnimationFrame(update);
      };
      micFrame.current = requestAnimationFrame(update);
      stream.getAudioTracks().forEach(track => {
        track.onended = () => { void stopMicrophone('Microphone disconnected'); };
      });
      peers.current.forEach(addLocalTracks);
      setMicActive(true);
      setMuted(false);
      setVoiceStatus(capture.usedFallback
        ? `Microphone active · using ${capture.label} · direct peer-to-peer voice`
        : 'Microphone active · direct peer-to-peer voice');
      await listMicrophones();
    } catch (cause) {
      await stopMicrophone();
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError'
        ? 'Microphone permission denied. Allow access in browser settings and retry.'
        : name === 'NotFoundError'
          ? 'No microphone found. Connect a microphone and retry.'
          : `Could not start microphone: ${cause instanceof Error ? cause.message : 'unknown error'}`);
    }
  }, [addLocalTracks, echoMode, listMicrophones, microphoneId, publishVoiceState, stopMicrophone]);

  useEffect(() => {
    if (typeof id !== 'string') return;
    const ws = new WebSocket(getWebSocketUrl(id));
    socket.current = ws;
    ws.onopen = () => { setConnected(true); setConnectionStatus('connected'); setError(''); };
    ws.onclose = () => {
      setConnected(false);
      setConnectionStatus('disconnected');
      closeVoice();
      setPeople([]);
      setVoiceStatus('Room connection lost · reload to reconnect');
    };
    ws.onerror = () => setError('Unable to connect to the authorized room signaling service.');
    ws.onmessage = event => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        setError('Received invalid room data.');
        return;
      }
      if (message.type === 'welcome' && typeof message.participant_id === 'string') {
        self.current = message.participant_id;
        const participants = Array.isArray(message.participants) ? message.participants as Person[] : [];
        setPeople(participants);
        participants.filter(person => person.id !== self.current).forEach(person => createPeer(person.id));
      } else if (message.type === 'join') {
        const participant = message.participant as Person;
        if (participant?.id && participant.id !== self.current) {
          setPeople(current => [...current.filter(person => person.id !== participant.id), participant]);
          createPeer(participant.id);
        }
      } else if (message.type === 'leave' && typeof message.id === 'string') {
        setPeople(current => current.filter(person => person.id !== message.id));
        const peer = peers.current.get(message.id);
        peer?.connection.close();
        peers.current.delete(message.id);
        audioElements.current.get(message.id)?.remove();
        audioElements.current.delete(message.id);
      } else if (message.type === 'move' && typeof message.id === 'string') {
        setPeople(current => current.map(person => person.id === message.id
          ? { ...person, x: Number(message.x), z: Number(message.z) }
          : person));
      } else if (message.type === 'voice-state' && typeof message.id === 'string') {
        setPeople(current => current.map(person => person.id === message.id
          ? { ...person, speaking: message.speaking === true, muted: message.muted === true }
          : person));
      } else if (message.type === 'voice-signal' && typeof message.from === 'string') {
        const peer = createPeer(message.from);
        const signal = message.signal as RoomSignal;
        void (async () => {
          try {
            if (signal.type === 'candidate') {
              await peer.connection.addIceCandidate(signal.candidate);
              return;
            }
            const description = signal as RTCSessionDescriptionInit;
            const collision = description.type === 'offer'
              && (peer.makingOffer || peer.connection.signalingState !== 'stable');
            peer.ignoreOffer = !peer.polite && collision;
            if (peer.ignoreOffer) return;
            peer.settingRemoteAnswer = description.type === 'answer';
            await peer.connection.setRemoteDescription(description);
            peer.settingRemoteAnswer = false;
            if (description.type === 'offer') {
              addLocalTracks(peer);
              await peer.connection.setLocalDescription();
              send({ type: 'voice-signal', target: message.from, signal: peer.connection.localDescription });
            }
          } catch (cause) {
            if (!peer.ignoreOffer) setError(`Voice signaling failed: ${cause instanceof Error ? cause.message : 'unknown error'}`);
          }
        })();
      } else if (message.type === 'chat') {
        setMessages(current => [...current.slice(-59), `${String(message.name || 'Participant')}: ${String(message.message || '')}`]);
      }
    };
    return () => {
      ws.close();
      socket.current = null;
      closeVoice();
    };
  }, [id, addLocalTracks, closeVoice, createPeer, send]);

  useEffect(() => {
    if (!echoMode) return;
    let active = true;
    echoes.list().then(items => {
      if (!active) return;
      setEchoesList(items);
      setEchoId(items[0]?.id || '');
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load ECHOs'));
    return () => { active = false; };
  }, [echoMode]);

  async function toggleMute() {
    const track = micStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
    publishVoiceState(false, !track.enabled);
    setVoiceStatus(track.enabled ? 'Microphone active' : 'Microphone muted');
  }

  async function askEcho(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!echoId || !question.trim() || aiBusy || aiSpeaking) return;
    const prompt = question.trim();
    setQuestion('');
    const controller = new AbortController();
    aiRequest.current = controller;
    setAiBusy(true);
    setError('');
    setVoiceStatus('AI responding…');
    try {
      const result = await echoes.chat(`/echoes/${encodeURIComponent(echoId)}/chat`, prompt, [], controller.signal);
      if (controller.signal.aborted) return;
      const response = await fetch(`${API_BASE_URL}/avatar/speech`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.reply, voice: 'en-us' }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await apiResponseError(response, 'Speech request failed');
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      aiUrl.current = url;
      const audio = new Audio(url);
      aiAudio.current = audio;
      const captureAudio = audio as HTMLAudioElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const captureStream = captureAudio.captureStream || captureAudio.mozCaptureStream;
      if (!captureStream) {
        throw new Error('This browser cannot share AI-generated audio with other room participants.');
      }
      const stream = captureStream.call(audio);
      aiStream.current = stream;
      peers.current.forEach(addLocalTracks);
      audio.onended = () => {
        publishVoiceState(false, muted);
        setAiSpeaking(false);
        setVoiceStatus('AI speech finished');
        stream.getTracks().forEach(track => track.stop());
        aiStream.current = null;
        if (aiUrl.current) URL.revokeObjectURL(aiUrl.current);
        aiUrl.current = null;
      };
      await audio.play();
      setAiBusy(false);
      setAiSpeaking(true);
      publishVoiceState(true, false);
      setVoiceStatus('AI speaking · transmitted to room participants');
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'AI speech unavailable');
        setVoiceStatus('AI speech unavailable');
      }
      setAiBusy(false);
      setAiSpeaking(false);
    } finally {
      if (aiRequest.current === controller) aiRequest.current = null;
    }
  }

  function move(dx: number, dz: number) {
    pos.current = {
      x: Math.max(-20, Math.min(20, pos.current.x + dx)),
      z: Math.max(-20, Math.min(20, pos.current.z + dz)),
    };
    send({ type: 'move', ...pos.current });
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected || !text.trim()) return;
    send({ type: 'chat', message: text.slice(0, 500) });
    setText('');
  }

  return <Layout loggedIn>
    <Head><title>Live Room | ECHO World</title><meta name="description" content="Join an ECHO World room for live conversation, optional peer voice and an accessible 3D scene." /></Head>
    <main className="container immersive-room immersive-v6">
      <header className="immersive-v6-hero">
        <div><span className="section-kicker">ECHO WORLD / LIVE ROOM</span><h1>Make room for<br /><em>conversation.</em></h1>
          <p>Chat, connect by voice and explore a shared 3D space together.</p>
          <Link className="button button-outline small" href="/world/rooms">← All rooms</Link>
        </div>
        <div className={`immersive-v6-connection ${connectionStatus === 'connected' ? 'is-online' : ''}`} role="status" aria-live="polite">
          <span className="immersive-v6-connection-dot" /> {connectionStatus === 'connected' ? 'Room connected' : connectionStatus === 'connecting' ? 'Connecting to room…' : 'Connection lost'}
        </div>
      </header>
      {connectionStatus === 'disconnected' ? <div className="immersive-v6-disconnected" role="alert">
        <div><strong>Room connection ended.</strong><p>The live signal was interrupted. Your microphone and peer connections have been stopped.</p></div>
        <button className="button" type="button" onClick={() => window.location.reload()}>Reconnect to room ↻</button>
      </div> : null}
      <div className="immersive-v6-main-grid">
        <section className="immersive-v6-stage" aria-label="Room stage">
          <div className="immersive-v6-stage-top"><span>THE SHARED SPACE</span><span>{people.length + (connected ? 1 : 0)} {people.length + (connected ? 1 : 0) === 1 ? 'participant' : 'participants'} online</span></div>
          <WorldScene people={people}/>
          <div className="immersive-v6-stage-bottom"><span>Drag to orbit · Scroll to zoom</span><span>3D is optional for joining the conversation</span></div>
        </section>
        <aside className="immersive-v6-participants" aria-label="Room participants">
          <div className="immersive-v6-aside-head"><span className="section-kicker">PEOPLE HERE</span><strong>{people.length + (connected ? 1 : 0)}</strong></div>
          <div className="immersive-v6-participant-list">
            {connected ? <div className="immersive-v6-person"><span className="immersive-v6-person-avatar">Y</span><div><strong>You</strong><small>{micActive ? muted ? 'Microphone muted' : 'Microphone on' : 'Microphone off'}</small></div><span className="immersive-v6-presence-dot" /></div> : null}
            {people.map(person => <div className="immersive-v6-person" key={person.id}>
              <span className="immersive-v6-person-avatar">{person.name.trim().charAt(0).toUpperCase() || 'E'}</span>
              <div><strong>{person.name}</strong><small>{person.muted ? 'Muted' : person.speaking ? 'Speaking' : 'In the room'}</small></div>
              <span className={`immersive-v6-presence-dot ${person.speaking ? 'is-speaking' : ''}`} />
            </div>)}
            {!connected && !people.length ? <p className="muted">Waiting for room participants…</p> : null}
          </div>
          <div className="immersive-v6-movement">
            <span className="section-kicker">MOVE IN WORLD</span>
            <div className="immersive-v6-pad">
              <button type="button" onClick={() => move(0, -1)} disabled={!connected} aria-label="Move forward">↑</button>
              <div><button type="button" onClick={() => move(-1, 0)} disabled={!connected} aria-label="Move left">←</button><button type="button" onClick={() => move(0, 1)} disabled={!connected} aria-label="Move backward">↓</button><button type="button" onClick={() => move(1, 0)} disabled={!connected} aria-label="Move right">→</button></div>
            </div>
            <p>Movement changes your presence position for other room participants.</p>
          </div>
        </aside>
      </div>

      <section className="card voice-controls immersive-v6-voice" aria-label="Room voice controls">
        <h2>Voice communication</h2>
        <p className="muted">Audio is sent peer-to-peer to authorized participants in this room. It is not recorded or stored. Mic level drives only speaking presence; the current model has no phoneme/viseme blendshapes.</p>
        <p role="status" aria-live="polite">{voiceStatus} · {voiceConnected ? 'Peer audio connected' : 'Waiting for voice peers'}</p>
        <label>Microphone
          <select value={microphoneId} onChange={event => {
            setMicrophoneId(event.target.value);
            if (micActive) void startMicrophone(event.target.value);
          }}>
            <option value="">Default microphone</option>
            {microphones.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
          </select>
        </label>
        <div className="voice-actions">
          {!micActive
            ? <button className="button" type="button" disabled={!connected} onClick={() => void startMicrophone()}>Speak as Avatar</button>
            : <button className="button" type="button" onClick={() => void stopMicrophone()}>Stop microphone</button>}
          <button className="button ghost" type="button" disabled={!micActive} onClick={() => void toggleMute()}>{muted ? 'Unmute' : 'Mute'}</button>
          <button className="button ghost" type="button" onClick={() => {
            const enableEcho = !echoMode;
            setEchoMode(enableEcho);
            if (enableEcho) {
              void stopMicrophone('AI mode selected');
            } else {
              stopAi();
            }
          }}>{echoMode ? 'Switch to live voice' : 'Let ECHO Speak'}</button>
          {(aiSpeaking || aiBusy) && <button className="button ghost" type="button" onClick={stopAi}>Stop AI speech</button>}
        </div>
        <div className="audio-meter" aria-label="Microphone activity"><span style={{ width: `${Math.round(micLevel * 100)}%` }}/></div>
        {echoMode && <>
          <label>ECHO identity
            <select value={echoId} onChange={event => setEchoId(event.target.value)}>
              {echoesList.map(echo => <option key={echo.id} value={echo.id}>{echo.name}</option>)}
            </select>
          </label>
          <form className="voice-prompt" onSubmit={event => void askEcho(event)}>
            <input aria-label="Ask ECHO" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask your ECHO…" maxLength={2000}/>
            <button className="button" type="submit" disabled={!echoId || !question.trim() || aiBusy || aiSpeaking}>{aiBusy ? 'Responding…' : 'Ask and speak'}</button>
          </form>
          <p className="muted smallprint">AI-generated speech is disclosed, provider-backed, and not saved as chat history in this room.</p>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className="immersive-v6-chat" aria-label="Room text conversation">
        <div className="immersive-v6-chat-head"><div><span className="section-kicker">LIVE CONVERSATION</span><h2>Room chat</h2></div><span>{connected ? "Connected" : "Offline"}</span></div>
        <div className="room-messages" aria-label="Room messages" role="log" aria-live="polite" aria-relevant="additions">{messages.length ? messages.map((message, index) => <p key={index}>{message}</p>) : <p className="muted">Messages will appear here when someone starts a conversation.</p>}</div>
      <form className="actions immersive-v6-chat-form" onSubmit={sendMessage}>
        <input value={text} maxLength={500} onChange={event => setText(event.target.value)} aria-label="Room message" placeholder="Write a message…"/>
        <button className="button" type="submit" disabled={!connected || !text.trim()}>Send message ↗</button>
      </form>
      </section>
      <div ref={audioContainer} aria-hidden="true" style={{ display: 'none' }}/>
      <p className="muted smallprint">Room access is checked by the API before signaling. WebRTC uses a public STUN server; networks requiring TURN relay may not connect. This is not a virtual camera or conferencing integration.</p>
    </main>
  </Layout>;
}
