import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveAvatarSession,
  SessionEvent,
  SessionState,
  VoiceChatState,
} from '@heygen/liveavatar-web-sdk';
import { useDaily, useMeetingState } from '@daily-co/daily-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { echoes, liveAvatars } from '../lib/api';
import { CVIProvider } from '../app/components/cvi/components/cvi-provider';
import { Conversation as TavusConversation } from '../app/components/cvi/components/conversation';
import type {
  LiveAvatarLiteSession,
  LiveAvatarSessionToken,
  TavusFace,
  UnifiedAvatar,
} from '../lib/api';
import { openMicrophone } from '../lib/media';
import type { Echo } from '../types';

type ProviderStatus = {
  primary_provider: string;
  local: { enabled: boolean; configured: boolean; available: boolean; message: string };
  liveavatar: { enabled: boolean; authenticated: boolean; message: string; credits_left?: string | null };
  tavus: {
    enabled: boolean;
    configured: boolean;
    authenticated: boolean;
    pal_accessible: boolean;
    pal_name?: string | null;
    default_face_id?: string | null;
    conferencing_email?: string | null;
    available_faces?: number;
    configured_faces_available?: number;
    configured_face_slots?: Array<{ slot: number; name?: string | null; available: boolean }>;
    message: string;
  };
  capabilities: Record<string, boolean>;
};

type Mode = 'FULL' | 'LITE';
type Provider = 'liveavatar' | 'tavus';
const SANDBOX_AVATAR_ID = 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a';

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The live avatar session failed.';
}

function pcm24kBytes(input: Float32Array, inputRate: number): { bytes: Uint8Array; rms: number } {
  const ratio = inputRate / 24000;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const bytes = new Uint8Array(length * 2);
  const view = new DataView(bytes.buffer);
  let energy = 0;
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const leftIndex = Math.min(input.length - 1, Math.floor(position));
    const rightIndex = Math.min(input.length - 1, leftIndex + 1);
    const fraction = position - leftIndex;
    const sample = input[leftIndex] * (1 - fraction) + input[rightIndex] * fraction;
    energy += sample * sample;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return { bytes, rms: Math.sqrt(energy / length) };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x4000)));
  }
  return btoa(binary);
}

function formatNetworkValue(value: number | null | undefined, multiplier: number, suffix: string): string {
  return value == null ? 'n/a' : `${(value * multiplier).toFixed(1)}${suffix}`;
}

function TavusNetworkDiagnostics({ active }: { active: boolean }) {
  const daily = useDaily();
  const meetingState = useMeetingState();
  const [network, setNetwork] = useState<Awaited<ReturnType<NonNullable<typeof daily>['getNetworkStats']>> | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [lastNetworkEvent, setLastNetworkEvent] = useState('');

  useEffect(() => {
    if (!active || !daily) {
      setLastNetworkEvent('');
      return;
    }

    const handleNetworkConnection = (event: { type: string; event: string }) => {
      setLastNetworkEvent(`${event.type}: ${event.event}`);
    };
    daily.on('network-connection', handleNetworkConnection);
    return () => {
      daily.off('network-connection', handleNetworkConnection);
    };
  }, [active, daily]);

  useEffect(() => {
    if (!active || !daily) {
      setNetwork(null);
      setDiagnosticError('');
      return;
    }

    let disposed = false;
    let requestPending = false;
    const refresh = async () => {
      if (requestPending) return;
      requestPending = true;
      try {
        const result = await daily.getNetworkStats();
        if (!disposed) {
          setNetwork(result);
          setDiagnosticError('');
        }
      } catch {
        if (!disposed) setDiagnosticError('Daily network statistics are currently unavailable.');
      } finally {
        requestPending = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [active, daily]);

  if (!active) return null;
  const latest = network?.stats?.latest;
  return <section className="media-issues tavus-network" aria-label="Tavus media diagnostics" role="status">
    <p><strong>Media connection:</strong> {meetingState || 'connecting'} · network {network?.networkState || 'collecting'}</p>
    {lastNetworkEvent ? <p><strong>Last network event:</strong> {lastNetworkEvent}</p> : null}
    {network?.networkStateReasons?.length ? <p><strong>Quality signals:</strong> {network.networkStateReasons.join(', ')}</p> : null}
    <p><strong>Audio packet loss:</strong> send {formatNetworkValue(latest?.audioSendPacketLoss, 100, '%')} · receive {formatNetworkValue(latest?.audioRecvPacketLoss, 100, '%')}</p>
    <p><strong>Audio jitter:</strong> send {formatNetworkValue(latest?.audioSendJitter, 1000, ' ms')} · receive {formatNetworkValue(latest?.audioRecvJitter, 1000, ' ms')} · RTT {formatNetworkValue(latest?.networkRoundTripTime, 1000, ' ms')}</p>
    {diagnosticError ? <p className="muted">{diagnosticError}</p> : null}
    <p className="muted smallprint">Statistics come from Tavus’s Daily WebRTC transport. Some browsers (including Firefox) do not expose send-side audio loss, jitter or RTT.</p>
  </section>;
}

export default function MeetingAvatar() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fullSessionRef = useRef<LiveAvatarSession | null>(null);
  const roomRef = useRef<Room | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const tavusMicStreamRef = useRef<MediaStream | null>(null);
  const tavusStartedAtRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const zeroGainRef = useRef<GainNode | null>(null);
  const sessionIdRef = useRef('');
  const providerRef = useRef<Provider>('liveavatar');
  const modeRef = useRef<Mode>('FULL');
  const endingRef = useRef(false);
  const socketReadyRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectResetTimerRef = useRef<number | null>(null);
  const keepAliveTimerRef = useRef<number | null>(null);
  const utteranceRef = useRef('');
  const quietMsRef = useRef(0);
  const latencyByUtteranceRef = useRef(new Map<string, number>());
  const audioQueueRef = useRef<Uint8Array[]>([]);
  const queuedAudioBytesRef = useRef(0);
  const firstAudioChunkRef = useRef(true);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [avatarLibrary, setAvatarLibrary] = useState<UnifiedAvatar[]>([]);
  const [echoProfiles, setEchoProfiles] = useState<Echo[]>([]);
  const [tavusFaces, setTavusFaces] = useState<TavusFace[]>([]);
  const [provider, setProvider] = useState<Provider>('liveavatar');
  const [mode, setMode] = useState<Mode>('FULL');
  const [avatarId, setAvatarId] = useState('');
  const [echoId, setEchoId] = useState('');
  const [shareEchoPersona, setShareEchoPersona] = useState(false);
  const [includePrivateKnowledge, setIncludePrivateKnowledge] = useState(false);
  const [faceId, setFaceId] = useState('');
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState('');
  const [status, setStatus] = useState('Checking video avatar provider…');
  const [connectionState, setConnectionState] = useState('Not connected');
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [quality, setQuality] = useState('');
  const [sandbox, setSandbox] = useState(true);
  const [conversationUrl, setConversationUrl] = useState('');
  const [tavusConversationId, setTavusConversationId] = useState('');
  const [error, setError] = useState('');

  const refreshProviderData = useCallback(async () => {
    setError('');
    try {
      const current = await liveAvatars.status() as ProviderStatus;
      setProviderStatus(current);
      setStatus(current.liveavatar.message);
      const available = await liveAvatars.catalog();
      setAvatarLibrary(available.avatars);
      const liveProvider = available.providers.liveavatar;
      const tavusProvider = available.providers.tavus;
      setSandbox(Boolean(liveProvider?.sandbox));
      if (current.liveavatar.authenticated) {
        const [usage, preference] = await Promise.all([
          liveAvatars.usage().catch(() => null),
          liveAvatars.preference(),
        ]);
        const liveFaces = available.avatars.filter(item => item.provider === 'liveavatar' && item.selectable);
        setAvatarId(previous => (
          previous && liveFaces.some(item => item.id === previous)
            ? previous
            : preference.avatar_id && liveFaces.some(item => item.id === preference.avatar_id)
              ? preference.avatar_id
              : liveProvider?.default_avatar_id || liveFaces[0]?.id || ''
        ));
        try {
          const profiles = await echoes.list();
          setEchoProfiles(profiles);
          setEchoId(previous => previous || profiles[0]?.id || '');
        } catch (cause) {
          setError(`Could not load ECHO persona profiles: ${messageFrom(cause)}`);
        }
        if (usage?.credits_left !== undefined && usage?.credits_left !== null) {
          setStatus(`LiveAvatar authenticated · ${usage.credits_left} credits available.`);
        } else if (available.providers.liveavatar.sandbox) {
          setStatus('LiveAvatar authenticated · Sandbox mode (no credits consumed).');
        }
      }
      const tavusFacesInLibrary: TavusFace[] = available.avatars
        .filter(item => item.provider === 'tavus')
        .map(item => ({
          id: item.id,
          name: item.name,
          status: item.status || 'unknown',
          preview_url: item.preview_url,
          thumbnail_url: item.thumbnail_url,
          available_for_plan: item.available_for_plan,
          selectable: item.selectable,
          configured: item.configured,
          slot: item.slot ?? item.configured_slot,
          is_default: item.is_default,
        }));
      setTavusFaces(tavusFacesInLibrary);
      if (current.tavus.enabled && current.tavus.authenticated && current.tavus.pal_accessible) {
        const preference = await liveAvatars.tavusPreference();
        const selectableFaces = tavusFacesInLibrary.filter(face => face.selectable);
        setFaceId(previous => (
          previous && selectableFaces.some(face => face.id === previous)
            ? previous
            : preference.face_id && selectableFaces.some(face => face.id === preference.face_id)
              ? preference.face_id
              : current.tavus.default_face_id || selectableFaces.find(face => face.is_default)?.id || selectableFaces[0]?.id || ''
        ));
      } else {
        setFaceId('');
      }
      if (current.tavus.enabled && tavusProvider?.error) {
        setError(`Tavus catalogue: ${tavusProvider.error}`);
      }
    } catch (cause) {
      setError(messageFrom(cause));
      setStatus('Provider status could not be verified.');
    }
  }, []);

  const refreshMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError('This browser does not support microphone selection.');
      return;
    }
    try {
      setMicrophones((await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput'));
    } catch (cause) {
      setError(`Could not list microphones: ${messageFrom(cause)}`);
    }
  }, []);

  const flushLiteAudio = useCallback((socket: WebSocket, force = false) => {
    let targetBytes = firstAudioChunkRef.current ? 28800 : 48000;
    while (
      queuedAudioBytesRef.current >= targetBytes
      || (force && queuedAudioBytesRef.current > 0)
    ) {
      const chunkLength = Math.min(targetBytes, queuedAudioBytesRef.current);
      const chunk = new Uint8Array(chunkLength);
      let offset = 0;
      while (offset < chunkLength) {
        const first = audioQueueRef.current[0];
        const take = Math.min(first.length, chunkLength - offset);
        chunk.set(first.subarray(0, take), offset);
        offset += take;
        queuedAudioBytesRef.current -= take;
        if (take === first.length) audioQueueRef.current.shift();
        else audioQueueRef.current[0] = first.subarray(take);
      }
      socket.send(JSON.stringify({
        type: 'agent.speak',
        event_id: utteranceRef.current,
        audio: bytesToBase64(chunk),
      }));
      firstAudioChunkRef.current = false;
      targetBytes = 48000;
    }
  }, []);

  const stopLiteAudio = useCallback(async () => {
    processorRef.current?.disconnect();
    audioSourceRef.current?.disconnect();
    zeroGainRef.current?.disconnect();
    processorRef.current = null;
    audioSourceRef.current = null;
    zeroGainRef.current = null;
    micStreamRef.current?.getTracks().forEach(track => {
      track.onended = null;
      track.stop();
    });
    micStreamRef.current = null;
    audioQueueRef.current = [];
    queuedAudioBytesRef.current = 0;
    firstAudioChunkRef.current = true;
    utteranceRef.current = '';
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') await context.close();
  }, []);

  const stopSession = useCallback(async () => {
    endingRef.current = true;
    socketReadyRef.current = false;
    if (utteranceRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
      flushLiteAudio(socketRef.current, true);
      socketRef.current.send(JSON.stringify({ type: 'agent.speak_end', event_id: utteranceRef.current }));
      utteranceRef.current = '';
    }
    if (reconnectResetTimerRef.current !== null) {
      window.clearTimeout(reconnectResetTimerRef.current);
      reconnectResetTimerRef.current = null;
    }
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (keepAliveTimerRef.current !== null) {
      window.clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'ECHO session ended');
    await stopLiteAudio();

    const fullSession = fullSessionRef.current;
    fullSessionRef.current = null;
    if (fullSession) {
      try {
        if (fullSession.state === SessionState.CONNECTED) await fullSession.stop();
        else if (sessionIdRef.current) await liveAvatars.stop(sessionIdRef.current);
      } catch (cause) {
        setError(`LiveAvatar SDK cleanup reported: ${messageFrom(cause)}`);
        if (sessionIdRef.current) {
          try {
            await liveAvatars.stop(sessionIdRef.current);
          } catch (providerError) {
            setError(`LiveAvatar SDK cleanup reported: ${messageFrom(cause)} Provider stop also failed: ${messageFrom(providerError)}`);
          }
        }
      }
    }

    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      room.disconnect();
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (audioRef.current) audioRef.current.srcObject = null;

    const sessionId = sessionIdRef.current;
    sessionIdRef.current = '';
    setConnecting(false);
    if (sessionId) {
      try {
        if (providerRef.current === 'tavus') {
          await liveAvatars.endTavusConversation(sessionId);
        } else if (modeRef.current === 'LITE') {
          await liveAvatars.stop(sessionId);
        } else {
          await liveAvatars.markClosed(sessionId);
        }
      } catch (cause) {
        setError(`Could not confirm provider session termination: ${messageFrom(cause)}`);
      }
    }
    tavusMicStreamRef.current?.getTracks().forEach(track => track.stop());
    tavusMicStreamRef.current = null;
    tavusStartedAtRef.current = null;
    setConversationUrl('');
    setTavusConversationId('');
    setActive(false);
    setMuted(false);
    setStreamReady(false);
    setConnectionState('Not connected');
    setStatus('Session stopped');
  }, [flushLiteAudio, stopLiteAudio]);

  const onTavusConnected = useCallback(() => {
    setConnecting(false);
    setConnectionState('Daily media transport connected');
    setStatus('Tavus conversation joined · waiting for the avatar video track.');
  }, []);

  const onTavusVideoReady = useCallback(() => {
    setStreamReady(true);
    const startedAt = tavusStartedAtRef.current;
    if (startedAt !== null) setLatencyMs(Math.max(0, Math.round(performance.now() - startedAt)));
    setStatus('Live Tavus avatar video track received; audio and video are carried by Daily WebRTC.');
  }, []);

  const onTavusError = useCallback(async (cause: unknown) => {
    if (endingRef.current) return;
    const detail = `Tavus media connection failed: ${messageFrom(cause)}`;
    const sessionId = sessionIdRef.current;
    if (sessionId && providerRef.current === 'tavus') {
      try {
        await liveAvatars.endTavusConversation(sessionId);
      } catch (cleanupError) {
        setError(`${detail} Provider session cleanup also failed: ${messageFrom(cleanupError)}`);
      }
    }
    tavusMicStreamRef.current?.getTracks().forEach(track => track.stop());
    tavusMicStreamRef.current = null;
    sessionIdRef.current = '';
    setConversationUrl('');
    setTavusConversationId('');
    setActive(false);
    setConnecting(false);
    setStreamReady(false);
    setConnectionState('Failed');
    setStatus('Tavus call did not connect. Confirm camera/microphone permissions and retry.');
    setError(previous => previous || detail);
  }, []);

  useEffect(() => {
    void refreshProviderData();
    void refreshMicrophones();
    return () => {
      void stopSession();
    };
  }, [refreshMicrophones, refreshProviderData, stopSession]);

  useEffect(() => {
    if (provider !== 'tavus' || !active || !tavusConversationId) return;
    let disposed = false;
    const checkProviderSession = async () => {
      try {
        const remote = await liveAvatars.tavusConversationStatus(tavusConversationId);
        if (disposed || !['ended', 'failed'].includes(remote.status)) return;
        tavusMicStreamRef.current?.getTracks().forEach(track => track.stop());
        tavusMicStreamRef.current = null;
        sessionIdRef.current = '';
        setConversationUrl('');
        setTavusConversationId('');
        setActive(false);
        setStreamReady(false);
        setConnectionState('Provider session ended');
        setStatus(`Tavus ended the conversation (${remote.status}).`);
        setError('The provider conversation ended. Start a new session to continue.');
      } catch (cause) {
        if (!disposed) setError(`Could not verify Tavus session state: ${messageFrom(cause)}`);
      }
    };
    void checkProviderSession();
    const timer = window.setInterval(() => void checkProviderSession(), 15000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [active, provider, tavusConversationId]);

  async function preflightMicrophone(): Promise<string> {
    const capture = await openMicrophone(microphoneId);
    const selectedDevice = capture.deviceId;
    capture.stream.getTracks().forEach(track => track.stop());
    if (selectedDevice) setMicrophoneId(selectedDevice);
    await refreshMicrophones();
    return selectedDevice;
  }

  async function startFullMode(deviceId: string) {
    const result = await liveAvatars.createSession(
      'FULL',
      avatarId,
      shareEchoPersona
        ? {
            echo_id: echoId,
            share_echo_persona: true,
            include_private_knowledge: includePrivateKnowledge,
          }
        : {},
    ) as LiveAvatarSessionToken;
    sessionIdRef.current = result.session_id;
    setSandbox(result.sandbox);
    providerRef.current = 'liveavatar';
    modeRef.current = 'FULL';
    const session = new LiveAvatarSession(result.session_token, {
      autoKeepAlive: true,
      voiceChat: { ...(deviceId ? { deviceId } : {}) },
    });
    fullSessionRef.current = session;
    session.on(SessionEvent.SESSION_STATE_CHANGED, state => {
      setConnectionState(state);
      if (state === SessionState.CONNECTED) {
        setActive(true);
        setStatus('LiveAvatar FULL session connected · AI-operated conversation is active.');
        void liveAvatars.markStarted(result.session_id).catch(cause => setError(messageFrom(cause)));
      }
    });
    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      if (videoRef.current) {
        videoRef.current.muted = false;
        session.attach(videoRef.current);
        void videoRef.current.play().catch(() => setError('Avatar video is ready, but playback needs a user click.'));
      }
      setStreamReady(true);
    });
    session.on(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED, nextQuality => setQuality(String(nextQuality)));
    session.on(SessionEvent.SESSION_DISCONNECTED, () => {
      if (!endingRef.current) {
        setActive(false);
        setStreamReady(false);
        setConnectionState('Disconnected');
        setStatus('LiveAvatar disconnected. Stop the session and reconnect.');
        void liveAvatars.markClosed(result.session_id).catch(cause => setError(messageFrom(cause)));
      }
    });
    await session.start();
    if (session.voiceChat.state !== VoiceChatState.ACTIVE) {
      throw new Error('LiveAvatar connected, but the microphone could not start. Choose another input and retry.');
    }
    setActive(true);
    setMuted(session.voiceChat.isMuted);
    setConnectionState('Connected');
    setStatus('FULL mode connected · LiveAvatar manages speech recognition, conversation and voice.');
  }

  async function startLiteAudio(stream: MediaStream) {
    if (audioContextRef.current) return;
    const AudioContextConstructor = window.AudioContext;
    const context = new AudioContextConstructor({ sampleRate: 24000 });
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const zeroGain = context.createGain();
    zeroGain.gain.value = 0;
    source.connect(processor);
    processor.connect(zeroGain);
    zeroGain.connect(context.destination);
    processor.onaudioprocess = event => {
      const socket = socketRef.current;
      if (!socketReadyRef.current || !socket || socket.readyState !== WebSocket.OPEN) return;
      const { bytes, rms } = pcm24kBytes(event.inputBuffer.getChannelData(0), context.sampleRate);
      if (rms < 0.007) {
        quietMsRef.current += (event.inputBuffer.length / context.sampleRate) * 1000;
        if (utteranceRef.current && quietMsRef.current >= 420) {
          flushLiteAudio(socket, true);
          socket.send(JSON.stringify({ type: 'agent.speak_end', event_id: utteranceRef.current }));
          socket.send(JSON.stringify({ type: 'agent.start_listening' }));
          latencyByUtteranceRef.current.delete(utteranceRef.current);
          utteranceRef.current = '';
          firstAudioChunkRef.current = true;
          setStatus('Listening · microphone audio drives LiveAvatar video in real time.');
        }
        return;
      }
      quietMsRef.current = 0;
      if (!utteranceRef.current) {
        utteranceRef.current = crypto.randomUUID();
        latencyByUtteranceRef.current.set(utteranceRef.current, performance.now());
        firstAudioChunkRef.current = true;
        socket.send(JSON.stringify({ type: 'agent.stop_listening' }));
      }
      audioQueueRef.current.push(bytes);
      queuedAudioBytesRef.current += bytes.length;
      flushLiteAudio(socket);
    };
    audioContextRef.current = context;
    audioSourceRef.current = source;
    processorRef.current = processor;
    zeroGainRef.current = zeroGain;
  }

  async function startLiteMode() {
    const capture = await openMicrophone(microphoneId);
    micStreamRef.current = capture.stream;
    if (capture.deviceId) setMicrophoneId(capture.deviceId);
    setMicrophones(await navigator.mediaDevices.enumerateDevices().then(devices => devices.filter(device => device.kind === 'audioinput')));
    const result = await liveAvatars.createSession('LITE', avatarId) as LiveAvatarLiteSession;
    sessionIdRef.current = result.session_id;
    setSandbox(result.sandbox);
    providerRef.current = 'liveavatar';
    modeRef.current = 'LITE';
    setStatus('Joining LiveAvatar LITE video room…');
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current);
        videoRef.current.muted = true;
        void videoRef.current.play().catch(() => setError('Avatar video is ready, but playback needs a user click.'));
        setStreamReady(true);
        setStatus(`LiveAvatar video received from ${participant.identity}.`);
      } else if (track.kind === Track.Kind.Audio && audioRef.current) {
        track.attach(audioRef.current);
        audioRef.current.muted = true;
        void audioRef.current.play().catch(() => setError('Avatar audio is ready, but playback needs a user click.'));
      }
    });
    room.on(RoomEvent.Reconnecting, () => {
      setConnectionState('Reconnecting video transport…');
      setStatus('LiveKit is recovering the video connection.');
    });
    room.on(RoomEvent.Reconnected, () => {
      setConnectionState('Connected');
      setStatus('LiveAvatar video connection recovered.');
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!endingRef.current) {
        setConnectionState('Disconnected');
        setStatus('LiveKit disconnected. The avatar video connection was lost.');
      }
    });
    await room.connect(result.livekit_url, result.livekit_client_token);
    setConnectionState('Video transport connected · connecting audio control…');
    if (!result.ws_url || !result.ws_url.startsWith('wss://')) {
      throw new Error('LiveAvatar did not return a secure audio-control WebSocket URL.');
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutId = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timed out waiting for LiveAvatar audio-control connection.'));
        }
      }, 15000);

      const connectSocket = () => {
        const socket = new WebSocket(result.ws_url as string);
        socketRef.current = socket;
        socket.onmessage = event => {
          let message: { type?: string; state?: string; source_event_id?: string; error?: { message?: string }; warning?: { message?: string } };
          try {
            message = JSON.parse(String(event.data));
          } catch {
            setError('LiveAvatar sent an unreadable audio-control event.');
            return;
          }
          if (message.type === 'session.state_updated' && message.state === 'connected') {
            socketReadyRef.current = true;
            if (reconnectResetTimerRef.current !== null) {
              window.clearTimeout(reconnectResetTimerRef.current);
            }
            reconnectResetTimerRef.current = window.setTimeout(() => {
              reconnectAttemptsRef.current = 0;
              reconnectResetTimerRef.current = null;
            }, 30000);
            socket.send(JSON.stringify({ type: 'agent.start_listening' }));
            if (!settled) {
              settled = true;
              window.clearTimeout(timeoutId);
              resolve();
            }
            void startLiteAudio(capture.stream).catch(cause => {
              setError(`Could not start microphone audio processing: ${messageFrom(cause)}`);
              void stopSession();
            });
            if (keepAliveTimerRef.current === null) {
              keepAliveTimerRef.current = window.setInterval(() => {
                if (!endingRef.current && sessionIdRef.current) {
                  void liveAvatars.keepAlive(sessionIdRef.current).catch(cause => setError(messageFrom(cause)));
                }
              }, 60000);
            }
            return;
          }
          if (message.type === 'session.state_updated' && message.state === 'disconnected') {
            socketReadyRef.current = false;
            setConnectionState('Audio control disconnected');
          }
          if (message.type === 'agent.speak_started' && message.source_event_id) {
            const sentAt = latencyByUtteranceRef.current.get(message.source_event_id);
            if (sentAt) {
              setLatencyMs(Math.round(performance.now() - sentAt));
              latencyByUtteranceRef.current.delete(message.source_event_id);
            }
          }
          if (message.type === 'error') setError(message.error?.message || 'LiveAvatar rejected an audio-control event.');
          if (message.type === 'warning') setStatus(message.warning?.message || 'LiveAvatar reported a non-fatal streaming warning.');
        };
        socket.onerror = () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timeoutId);
            reject(new Error('Could not establish the LiveAvatar audio-control WebSocket.'));
          }
        };
        socket.onclose = () => {
          socketReadyRef.current = false;
          if (reconnectResetTimerRef.current !== null) {
            window.clearTimeout(reconnectResetTimerRef.current);
            reconnectResetTimerRef.current = null;
          }
          audioQueueRef.current = [];
          queuedAudioBytesRef.current = 0;
          utteranceRef.current = '';
          firstAudioChunkRef.current = true;
          if (endingRef.current) return;
          setConnectionState('Reconnecting audio control…');
          const attempt = ++reconnectAttemptsRef.current;
          if (attempt > 5) {
            setError('LiveAvatar audio control could not reconnect after five attempts. Stop the session before retrying.');
            return;
          }
          reconnectTimerRef.current = window.setTimeout(connectSocket, Math.min(750 * (2 ** (attempt - 1)), 12000));
        };
      };
      connectSocket();
    });
    setActive(true);
    setMuted(false);
    setConnectionState('Connected');
    setStatus(capture.usedFallback ? `LITE connected · using ${capture.label}; original microphone audio drives lip-synced avatar video.` : 'LITE connected · original microphone audio drives lip-synced avatar video.');
  }

  async function startTavus() {
    if (!providerStatus?.tavus.pal_accessible) {
      throw new Error(providerStatus?.tavus.message || 'Tavus PAL access is unavailable.');
    }
    const capture = await openMicrophone(microphoneId);
    tavusMicStreamRef.current = capture.stream;
    if (capture.deviceId) setMicrophoneId(capture.deviceId);
    tavusStartedAtRef.current = performance.now();
    const response = await liveAvatars.createTavusConversation(faceId || undefined);
    if (!response.conversation_url) throw new Error('Tavus did not return a conversation URL.');
    const url = new URL(response.conversation_url);
    if (url.protocol !== 'https:') throw new Error('Tavus returned an unsupported conversation URL.');
    sessionIdRef.current = response.conversation_id;
    providerRef.current = 'tavus';
    modeRef.current = 'FULL';
    setConversationUrl(url.href);
    setTavusConversationId(response.conversation_id);
    setActive(true);
    setStreamReady(false);
    setConnectionState(response.status || 'Conversation created · connecting media');
    setStatus(`${response.message} Microphone permission is granted; joining Tavus media transport.`);
  }

  async function startSession() {
    if (provider === 'liveavatar' && !providerStatus?.liveavatar.authenticated) {
      setError(providerStatus?.liveavatar.message || 'LiveAvatar API credentials are not configured.');
      return;
    }
    if (provider === 'liveavatar' && !avatarId) {
      setError('Select an active provider avatar before starting a session.');
      return;
    }
    if (provider === 'liveavatar' && sandbox && avatarId !== SANDBOX_AVATAR_ID) {
      setError('LiveAvatar Sandbox only supports the Wayne sandbox avatar. Select Wayne or switch LIVEAVATAR_SANDBOX off to use production avatars.');
      return;
    }
    if (provider === 'liveavatar' && mode === 'FULL' && shareEchoPersona && !echoId) {
      setError('Choose an ECHO profile before authorizing it for this FULL session.');
      return;
    }
    setError('');
    endingRef.current = false;
    setConnecting(true);
    setLatencyMs(null);
    setQuality('');
    setConnectionState('Starting…');
    try {
      if (provider === 'tavus') {
        if (!providerStatus?.tavus.pal_accessible) {
          throw new Error(providerStatus?.tavus.message || 'Tavus PAL access is unavailable.');
        }
        await startTavus();
        return;
      }
      if (mode === 'LITE') await startLiteMode();
      else await startFullMode(await preflightMicrophone());
    } catch (cause) {
      const detail = messageFrom(cause);
      setError(detail);
      setStatus('Avatar session could not be started.');
      setConnectionState('Failed');
      const id = sessionIdRef.current;
      if (id) {
        try {
          if (providerRef.current === 'tavus') await liveAvatars.endTavusConversation(id);
          else if (modeRef.current === 'LITE') await liveAvatars.stop(id);
          else if (providerRef.current === 'liveavatar') await liveAvatars.stop(id);
        } catch (cleanupError) {
          setError(`${detail} Provider cleanup also failed: ${messageFrom(cleanupError)}`);
        }
      }
      await stopLiteAudio();
      tavusMicStreamRef.current?.getTracks().forEach(track => track.stop());
      tavusMicStreamRef.current = null;
      const failedFullSession = fullSessionRef.current;
      if (failedFullSession) {
        try {
          await failedFullSession.stop();
        } catch (cleanupError) {
          setError(`${detail} SDK cleanup also failed: ${messageFrom(cleanupError)}`);
        }
      }
      roomRef.current?.disconnect();
      roomRef.current = null;
      fullSessionRef.current = null;
      sessionIdRef.current = '';
      setActive(false);
      setStreamReady(false);
      setConversationUrl('');
      setTavusConversationId('');
      setConnecting(false);
      endingRef.current = true;
      socketReadyRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (reconnectResetTimerRef.current !== null) {
        window.clearTimeout(reconnectResetTimerRef.current);
        reconnectResetTimerRef.current = null;
      }
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) socketRef.current.close();
      socketRef.current = null;
    }
    if (!active) setConnecting(false);
  }

  async function toggleMute() {
    try {
      if (providerRef.current === 'liveavatar' && modeRef.current === 'FULL' && fullSessionRef.current) {
        if (muted) await fullSessionRef.current.voiceChat.unmute();
        else await fullSessionRef.current.voiceChat.mute();
        setMuted(fullSessionRef.current.voiceChat.isMuted);
      } else {
        const capture = providerRef.current === 'tavus' ? tavusMicStreamRef.current : micStreamRef.current;
        const track = capture?.getAudioTracks()[0];
        if (!track) return;
        track.enabled = muted;
        setMuted(!muted);
      }
    } catch (cause) {
      setError(`Could not change microphone state: ${messageFrom(cause)}`);
    }
  }

  const selectedAvatar = avatarLibrary.find(avatar => avatar.provider === 'liveavatar' && avatar.id === avatarId);
  const selectedTavusFace = tavusFaces.find(face => face.id === faceId);
  const selectedEcho = echoProfiles.find(echo => echo.id === echoId);
  const sandboxAvatarBlocked = Boolean(provider === 'liveavatar' && sandbox && avatarId && avatarId !== SANDBOX_AVATAR_ID);
  const startUnavailableReason = active || connecting ? '' : provider === 'liveavatar'
    ? !providerStatus?.liveavatar.authenticated
      ? 'LiveAvatar is not authenticated. Check the API configuration and refresh status.'
      : !avatarId
        ? 'Choose a supported LiveAvatar face from the avatar library.'
        : sandboxAvatarBlocked
          ? 'Sandbox supports only Wayne. Select Wayne for a sandbox test, or configure a credited production session.'
          : mode === 'FULL' && shareEchoPersona && !echoId
            ? 'Select an ECHO profile, or turn off persona sharing.'
            : ''
    : !providerStatus?.tavus.authenticated || !providerStatus?.tavus.pal_accessible
      ? 'Tavus PAL is unavailable for this account. Check the provider status and plan.'
      : !faceId && !providerStatus?.tavus.default_face_id
        ? 'Select an eligible Tavus face before starting a session.'
        : '';
  const activeMicrophone = microphones.find(device => device.deviceId === microphoneId);
  const tavusAudioTrack = tavusMicStreamRef.current?.getAudioTracks()[0];
  const selectedAvatarKey = `${provider}:${provider === 'tavus' ? faceId : avatarId}`;
  const selectableTavusFaces = tavusFaces.filter(face => face.selectable);

  return <CVIProvider><div className="meeting-grid">
    <section className="meeting-preview card">
      <div className="meeting-preview-head">
        <span className={`badge ${active ? 'badge-ready' : ''}`}>{active ? 'Live avatar session' : 'Provider video preview'}</span>
        {streamReady ? <span className="badge badge-ready">Real provider video</span> : null}
        {active && (provider === 'tavus' || mode === 'FULL') ? <span className="badge">AI-operated</span> : null}
        {active && mode === 'LITE' && muted ? <span className="badge warning-badge">Microphone muted</span> : null}
        {provider === 'liveavatar' && sandbox ? <span className="badge">Sandbox · no credits charged</span> : null}
      </div>
      {provider === 'tavus' && conversationUrl
        && tavusAudioTrack
        ? <TavusConversation
            conversationUrl={conversationUrl}
            audioSource={tavusAudioTrack}
            onConnected={onTavusConnected}
            onError={onTavusError}
            onVideoReady={onTavusVideoReady}
            onLeave={() => void stopSession()}
          />
        : provider === 'tavus' && !conversationUrl && selectedTavusFace?.preview_url
          ? <video className="meeting-video tavus-face-preview" src={selectedTavusFace.preview_url} poster={selectedTavusFace.thumbnail_url || undefined} autoPlay loop muted playsInline controls />
          : provider === 'tavus' && !conversationUrl && selectedTavusFace?.thumbnail_url
            ? <img className="meeting-video tavus-face-preview" src={selectedTavusFace.thumbnail_url} alt={`Provider thumbnail of ${selectedTavusFace.name}`} />
          : provider === 'tavus'
            ? <div className="meeting-video meeting-empty"><strong>{active ? 'Waiting for Tavus media…' : 'Choose a Tavus face to preview'}</strong><span>{selectedTavusFace?.name || 'Tavus provides the live call video after a session starts.'}</span></div>
            : !active && selectedAvatar?.preview_url
              ? <video className="meeting-video" src={selectedAvatar.preview_url} poster={selectedAvatar.thumbnail_url || undefined} autoPlay loop muted playsInline controls />
              : !active && selectedAvatar?.thumbnail_url
                ? <img className="meeting-video" src={selectedAvatar.thumbnail_url} alt={`Provider thumbnail of ${selectedAvatar.name}`} />
                : <video ref={videoRef} autoPlay playsInline className="meeting-video" />}
      <audio ref={audioRef} autoPlay />
      {provider === 'tavus' ? <TavusNetworkDiagnostics active={active && Boolean(conversationUrl)} /> : null}
      {provider === 'tavus' && latencyMs !== null ? <p className="muted smallprint">Tavus join-to-video-ready: {latencyMs} ms. This measures session creation through the first playable remote provider video.</p> : null}
      {!streamReady && provider === 'liveavatar' ? (
        <div className="meeting-empty">
          <strong>{active ? 'Waiting for provider video…' : 'No video avatar session running'}</strong>
          <span>{selectedAvatar ? `Selected provider avatar: ${selectedAvatar.name}.` : 'Configure LiveAvatar and choose an available human avatar to start.'}</span>
        </div>
      ) : null}
      <div className="meeting-actions">
        <label>Unified avatar library
          <select value={selectedAvatarKey} onChange={event => {
            const [nextProvider, nextId] = event.target.value.split(':', 2);
            if (nextProvider !== 'liveavatar' && nextProvider !== 'tavus') return;
            setProvider(nextProvider);
            setMode(nextProvider === 'tavus' ? 'FULL' : mode);
            if (nextProvider === 'liveavatar') {
              setAvatarId(nextId);
              void liveAvatars.setPreference(nextId).catch(cause => setError(messageFrom(cause)));
            } else {
              setFaceId(nextId);
              void liveAvatars.setTavusPreference(nextId).catch(cause => setError(messageFrom(cause)));
            }
            setError('');
          }} disabled={active || !avatarLibrary.length}>
            {!avatarLibrary.length ? <option value="">No provider avatars are available</option> : null}
            <optgroup label="HeyGen LiveAvatar">
              {avatarLibrary.filter(avatar => avatar.provider === 'liveavatar').map(avatar => (
                <option key={`liveavatar:${avatar.id}`} value={`liveavatar:${avatar.id}`} disabled={!avatar.selectable}>
                  {avatar.name}{avatar.configured_slot ? ` · ECHO slot ${avatar.configured_slot}` : ''}{avatar.is_default ? ' · Default' : ''}{avatar.status !== 'ACTIVE' ? ` · ${avatar.status || 'unavailable'}` : ''}
                </option>
              ))}
            </optgroup>
            <optgroup label={providerStatus?.tavus.pal_name || 'Tavus PAL'}>
              {tavusFaces.map(face => (
                <option key={`tavus:${face.id}`} value={`tavus:${face.id}`} disabled={!face.selectable}>
                  {face.name}{face.configured ? ` · ECHO slot ${face.slot}` : ''}{face.is_default ? ' · PAL default' : ''}{!face.selectable ? ` · ${face.status === 'completed' ? 'plan restricted' : face.status || 'unavailable'}` : ''}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
      {provider === 'liveavatar' ? <div className="meeting-actions">
        <label>LiveAvatar session mode
          <select value={mode} onChange={event => setMode(event.target.value as Mode)} disabled={active}>
            <option value="FULL">FULL · autonomous conversational AI (2 credits/minute)</option>
            <option value="LITE">LITE · original microphone passthrough, no AI conversation (1 credit/minute)</option>
          </select>
        </label>
        <label>Microphone
          <select value={microphoneId} onChange={event => setMicrophoneId(event.target.value)} disabled={active}>
            <option value="">Automatic available microphone</option>
            {microphones.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
          </select>
        </label>
      </div> : <div className="meeting-actions">
        <label>Microphone
          <select value={microphoneId} onChange={event => setMicrophoneId(event.target.value)} disabled={active}>
            <option value="">Automatic available microphone</option>
            {microphones.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
          </select>
        </label>
      </div>}
      {provider === 'tavus' ? <div className="avatar-option-panel">
        <h3>AI representative & meeting invitation</h3>
        <p className="muted">Tavus Full Pipeline is independently AI-operated and uses the PAL's configured voice. For Speak as ECHO, select LiveAvatar LITE; it streams your original microphone audio to the avatar. These modes are distinct.</p>
        {providerStatus?.tavus.conferencing_email
          ? <div className="meeting-actions">
              <p><strong>Tavus meeting invite:</strong> {providerStatus.tavus.conferencing_email}</p>
              <button className="button ghost" type="button" onClick={() => {
                void navigator.clipboard.writeText(providerStatus.tavus.conferencing_email || '')
                  .then(() => setStatus('Tavus meeting invite email copied.'))
                  .catch(cause => setError(`Could not copy the meeting invite: ${messageFrom(cause)}`));
              }}>Copy invite email</button>
            </div>
          : <p className="muted">This PAL does not report a configured Tavus conferencing invite address. Direct ECHO browser calls work separately from external meeting attendance.</p>}
        <p className="muted smallprint">The invite address is for Tavus's configured conferencing layer. Invite the AI representative through the meeting platform's own calendar/invitation flow. This does not replace your webcam with an ECHO virtual camera.</p>
      </div> : null}
      {provider === 'liveavatar' && mode === 'FULL' ? <div className="avatar-option-panel">
        <h3>Let ECHO speak</h3>
        <p className="muted">FULL mode is AI-operated by LiveAvatar. Choose whether to share one of your ECHO profiles; nothing is sent unless you authorize it below.</p>
        <label className="avatar-consent">
          <input
            type="checkbox"
            checked={shareEchoPersona}
            onChange={event => {
              setShareEchoPersona(event.target.checked);
              if (!event.target.checked) setIncludePrivateKnowledge(false);
            }}
            disabled={active || !echoProfiles.length}
          />
          I authorize sending the selected ECHO name, persona, and public knowledge to LiveAvatar, where it is stored as a reusable provider context.
        </label>
        {shareEchoPersona ? <>
          <label>ECHO profile
            <select value={echoId} onChange={event => {
              setEchoId(event.target.value);
              setIncludePrivateKnowledge(false);
            }} disabled={active || !echoProfiles.length}>
              {echoProfiles.map(echo => <option key={echo.id} value={echo.id}>{echo.name}</option>)}
            </select>
          </label>
          {selectedEcho?.private_knowledge.trim() ? <label className="avatar-consent">
            <input
              type="checkbox"
              checked={includePrivateKnowledge}
              onChange={event => setIncludePrivateKnowledge(event.target.checked)}
              disabled={active}
            />
            Also authorize sending this ECHO’s private knowledge to LiveAvatar.
          </label> : null}
          <p className="muted smallprint">ECHO profile content is sent to LiveAvatar when the session is created and updates its provider context. Review the provider’s data-retention terms before sharing sensitive information.</p>
        </> : null}
        {!echoProfiles.length ? <p className="muted">Create an ECHO profile in Studio before using a custom persona.</p> : null}
      </div> : null}
      <div className="meeting-actions">
        {!active
          ? <button className="button" type="button" onClick={() => void startSession()} disabled={connecting || (provider === 'liveavatar' ? !providerStatus?.liveavatar.authenticated || !avatarId || sandboxAvatarBlocked || (mode === 'FULL' && shareEchoPersona && !echoId) : !providerStatus?.tavus.authenticated || !providerStatus?.tavus.pal_accessible || (!faceId && !providerStatus.tavus.default_face_id))}>
            {connecting ? 'Connecting…' : `Start ${provider === 'tavus' ? 'Tavus' : mode} video avatar`}
          </button>
          : <button className="button ghost" type="button" onClick={() => void stopSession()}>End avatar session</button>}
        <button className="button ghost" type="button" onClick={() => void toggleMute()} disabled={!active}>{muted ? 'Unmute microphone' : 'Mute microphone'}</button>
        <button className="button ghost" type="button" onClick={() => { void refreshProviderData(); void refreshMicrophones(); }} disabled={active}>Refresh status</button>
      </div>
      {startUnavailableReason ? <p className="warning-badge" role="status">Why Start is unavailable: {startUnavailableReason}</p> : null}
      <div className="media-issues" role="status">
        <p><strong>Session:</strong> {status}</p>
        <p><strong>Transport:</strong> {connectionState}{quality ? ` · quality ${quality}` : ''}</p>
        <p><strong>Microphone:</strong> {activeMicrophone?.label || (microphoneId ? 'Selected input' : 'Choose input before connecting')}</p>
        {sandboxAvatarBlocked ? <p className="warning-badge">Sandbox only supports the Wayne avatar. Disable Sandbox for configured or personalized avatars; production sessions use provider credits.</p> : null}
        {mode === 'LITE' && provider === 'liveavatar' && latencyMs !== null ? <p><strong>Speech-to-avatar response:</strong> {latencyMs} ms (measured from audio submission to provider speaking event)</p> : null}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {provider === 'liveavatar' && mode === 'LITE' ? <p className="muted smallprint">LITE sends captured microphone PCM directly to LiveAvatar for synchronized avatar rendering; this preserves the original voice but does not transcribe, understand, or answer the speaker. Audio is resampled to 24 kHz mono PCM and is not stored by ECHO.</p> : null}
      {provider === 'liveavatar' && mode === 'FULL' ? <p className="muted smallprint">FULL sends microphone audio to LiveAvatar’s managed speech-recognition, AI and voice pipeline. The avatar is AI-operated and speaks with its configured provider voice; this mode does not preserve the user’s original voice. Disclose digital-avatar and AI use to meeting participants.</p> : null}
      {provider === 'tavus' ? <p className="muted smallprint">Tavus runs the configured PAL's AI conversation. ECHO's Speak as ECHO mode is LiveAvatar LITE, which streams your original microphone audio. Tavus's documented Echo mode supports direct text/audio events, but is not used as an unverified continuous microphone passthrough here.</p> : null}
    </section>
    <aside className="diagnostics card">
      <h2>Meeting readiness</h2>
      <div className="diagnostic-list">
        <Diagnostic label="Local 3D avatar engine" ready={Boolean(providerStatus?.local.available)} detail={providerStatus?.local.message || 'Checking local renderer'} />
        <Diagnostic label="LiveAvatar API" ready={Boolean(providerStatus?.liveavatar.authenticated)} detail={providerStatus?.liveavatar.message || 'Checking credentials'} />
        <Diagnostic label="Tavus PAL" ready={Boolean(providerStatus?.tavus.pal_accessible)} detail={providerStatus?.tavus.message || 'Checking credentials'} />
        <Diagnostic label="Real-time video" ready={streamReady} detail={streamReady ? 'Provider video track received' : 'Starts after an authenticated session'} />
        <Diagnostic label="Microphone" ready={microphones.length > 0} detail={microphones.length ? `${microphones.length} input(s) detected` : 'No microphone detected'} />
        <Diagnostic label="WebRTC transport" ready={connectionState.toLowerCase().includes('connected')} detail={connectionState} />
        <Diagnostic label="Session mode" ready={true} detail={provider === 'liveavatar' ? (mode === 'FULL' ? 'Managed autonomous AI conversation' : 'Live microphone audio to avatar video') : 'Tavus managed conversation'} />
        <Diagnostic label="Virtual camera" ready={false} detail="A local Ubuntu desktop bridge is required; this web build does not expose a system camera device." />
        <Diagnostic label="External meeting attendance" ready={false} detail="ECHO does not join Google Meet, Zoom or Teams as an autonomous participant." />
      </div>
      <div className="provider-status">
        <h3>Provider requirements</h3>
        <p className="muted">{providerStatus?.liveavatar.message || 'Set LIVEAVATAR_API_KEY in the backend environment.'}</p>
        <p className="muted">{sandbox ? 'LiveAvatar Sandbox is enabled. It provides only the documented Wayne avatar for short, approximately one-minute tests.' : 'Production sessions consume provider credits: FULL 2/minute, LITE 1/minute.'}</p>
        {providerStatus?.tavus.enabled ? <p className="muted">Tavus: {providerStatus.tavus.message}</p> : null}
        {providerStatus?.tavus.configured_faces_available !== undefined ? <p className="muted">Configured Tavus faces ready for this plan: {providerStatus.tavus.configured_faces_available}/8.</p> : null}
        {providerStatus?.tavus.conferencing_email ? <p className="muted">Tavus conferencing is configured. Invite {providerStatus.tavus.conferencing_email} through the meeting client for an AI representative; it is separate from webcam replacement.</p> : null}
      </div>
      <p className="muted smallprint">Digital-avatar use should be disclosed to meeting participants. ECHO video can be previewed here; a browser page alone cannot create a selectable operating-system camera.</p>
    </aside>
  </div></CVIProvider>;
}

function Diagnostic({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return <div className="diagnostic"><span className={`diagnostic-dot ${ready ? 'ready' : 'warning'}`} /><div><strong>{label}</strong><span>{detail}</span></div></div>;
}
