import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { fetchAvatarModel, importAvatarModel, liveAvatars, request, uploadAvatarPhoto } from '../lib/api';
import type { LiveAvatar } from '../lib/api';

type AvatarGeneration = {
  status: string;
  progress: number;
  model_available: boolean;
  source: string;
};

type CreatorOption = 'video-create' | 'video-select' | '3d';
type TavusTrainingTask = {
  id: string;
  name: string;
  status: string;
  error?: string | null;
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Avatar request failed.';
}

function isVideoPreview(url: string): boolean {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(url);
}

export default function AvatarCreator({ onModelUrl }: { onModelUrl: (url: string | undefined) => void }) {
  const [option, setOption] = useState<CreatorOption>('video-create');
  const [providerMessage, setProviderMessage] = useState('Checking LiveAvatar configuration…');
  const [videoProviderReady, setVideoProviderReady] = useState(false);
  const [avatars, setAvatars] = useState<LiveAvatar[]>([]);
  const [configuredSlots, setConfiguredSlots] = useState<{ slot: number; available: boolean; message?: string | null }[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState('');
  const [personalAvatar, setPersonalAvatar] = useState<LiveAvatar | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [resolution, setResolution] = useState<720 | 1080>(720);
  const [consent, setConsent] = useState(false);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [generation, setGeneration] = useState<AvatarGeneration | null>(null);
  const [avatarSdkEnabled, setAvatarSdkEnabled] = useState(false);
  const [avatarSdkConfigured, setAvatarSdkConfigured] = useState(false);
  const [tavusReady, setTavusReady] = useState(false);
  const [tavusFaceTask, setTavusFaceTask] = useState<TavusTrainingTask | null>(null);
  const [tavusVoiceTask, setTavusVoiceTask] = useState<TavusTrainingTask | null>(null);
  const [tavusFaceName, setTavusFaceName] = useState('');
  const [tavusTrainingKind, setTavusTrainingKind] = useState<'image' | 'video'>('image');
  const [tavusImageUrl, setTavusImageUrl] = useState('');
  const [tavusVideoUrl, setTavusVideoUrl] = useState('');
  const [tavusVoiceName, setTavusVoiceName] = useState('');
  const [tavusCustomVoiceId, setTavusCustomVoiceId] = useState('');
  const [tavusModel, setTavusModel] = useState<'phoenix-4.5' | 'phoenix-4'>('phoenix-4.5');
  const [tavusFaceConsent, setTavusFaceConsent] = useState(false);
  const [tavusVoiceConsent, setTavusVoiceConsent] = useState(false);
  const [tavusVoiceAudioUrl, setTavusVoiceAudioUrl] = useState('');
  const [tavusVoiceDescription, setTavusVoiceDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const refreshGeneration = useCallback(async () => {
    try {
      const current = await request<AvatarGeneration>('/avatar/generation');
      setGeneration(current);
    } catch (cause) {
      if (messageFrom(cause) === 'No generated avatar exists yet.') {
        setGeneration(null);
        return;
      }
      setError(messageFrom(cause));
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      const catalog = await liveAvatars.list();
      setAvatars(catalog.avatars);
      setConfiguredSlots(catalog.configured_slots || []);
      setSelectedAvatarId(previous => previous || catalog.default_avatar_id || '');
    } catch (cause) {
      setError(messageFrom(cause));
    }
  }, []);

  useEffect(() => {
    let active = true;
    liveAvatars.status()
      .then(async status => {
        if (!active) return;
        const live = status.liveavatar;
        setVideoProviderReady(Boolean(live?.authenticated));
        setProviderMessage(live?.message || 'LiveAvatar status unavailable.');
        setAvatarSdkEnabled(Boolean(status.avatar_sdk?.enabled));
        setAvatarSdkConfigured(Boolean(status.avatar_sdk?.enabled && status.avatar_sdk?.configured));
        setTavusReady(Boolean(status.tavus?.enabled && status.tavus?.authenticated && status.tavus?.pal_accessible));
        if (live?.authenticated) await refreshCatalog();
      })
      .catch(cause => { if (active) setProviderMessage(messageFrom(cause)); });
    void refreshGeneration();
    return () => {
      active = false;
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      onModelUrl(undefined);
    };
  }, [onModelUrl, refreshCatalog, refreshGeneration]);

  useEffect(() => {
    if (!tavusFaceTask || ['completed', 'active', 'ready', 'failed', 'error'].includes(tavusFaceTask.status.toLowerCase())) return;
    const timer = window.setInterval(() => {
      liveAvatars.tavusFaceStatus(tavusFaceTask.id)
        .then(face => setTavusFaceTask({
          id: face.face_id,
          name: face.face_name,
          status: face.status,
        }))
        .catch(cause => setError(messageFrom(cause)));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [tavusFaceTask]);

  useEffect(() => {
    if (!tavusVoiceTask || ['completed', 'active', 'ready', 'failed', 'error'].includes(tavusVoiceTask.status.toLowerCase())) return;
    const timer = window.setInterval(() => {
      liveAvatars.tavusVoiceStatus(tavusVoiceTask.id)
        .then(voice => setTavusVoiceTask({
          id: voice.voice_id,
          name: voice.voice_name,
          status: voice.status,
          error: voice.error_message,
        }))
        .catch(cause => setError(messageFrom(cause)));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [tavusVoiceTask]);

  useEffect(() => {
    if (!personalAvatar || ['ACTIVE', 'FAILED', 'DELETED', 'DEACTIVATED'].includes(personalAvatar.status)) return;
    const timer = window.setInterval(() => {
      liveAvatars.avatarStatus(personalAvatar.id)
        .then(setPersonalAvatar)
        .catch(cause => setError(messageFrom(cause)));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [personalAvatar]);

  useEffect(() => {
    if (!generation?.model_available) return;
    let active = true;
    let objectUrl: string | undefined;
    fetchAvatarModel()
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        onModelUrl(objectUrl);
      })
      .catch(cause => { if (active) setError(messageFrom(cause)); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      onModelUrl(undefined);
    };
  }, [generation?.model_available, onModelUrl]);

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Webcam capture requires HTTPS or localhost and a supported browser.');
      return;
    }
    try {
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1920 }, height: { ideal: 1080 } } });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (cause) {
      setError(`Could not open the webcam: ${messageFrom(cause)}`);
    }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('Wait for a live webcam preview before capturing a frame.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Could not capture a webcam frame in this browser.');
      return;
    }
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
    if (!blob) {
      setError('The webcam frame could not be encoded.');
      return;
    }
    setPhoto(new File([blob], 'webcam-avatar.jpg', { type: 'image/jpeg' }));
    setNotice('Webcam frame captured. Review it and submit with consent to create the avatar.');
    stopCamera();
  }

  async function createVideoAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || !consent) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const avatar = await liveAvatars.createImage(photo, resolution, consent);
      setPersonalAvatar(avatar);
      setPhoto(null);
      setConsent(false);
      setNotice(`LiveAvatar accepted the image. Training status: ${avatar.status}.`);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }

  }

  async function createTavusFace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tavusFaceConsent || !tavusFaceName.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const face = await liveAvatars.createTavusFace({
        face_name: tavusFaceName.trim(),
        model_name: tavusModel,
        ...(tavusTrainingKind === 'image'
          ? {
              train_image_url: tavusImageUrl.trim(),
              ...(tavusCustomVoiceId.trim()
                ? { default_voice_id: tavusCustomVoiceId.trim() }
                : { voice_name: tavusVoiceName.trim() }),
            }
          : { train_video_url: tavusVideoUrl.trim() }),
        consent: true,
      });
      setTavusFaceTask({ id: face.face_id, name: face.face_name, status: face.status });
      setTavusFaceConsent(false);
      setNotice(face.message);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function createTavusVoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tavusVoiceConsent || !tavusVoiceName.trim() || !tavusVoiceAudioUrl.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const voice = await liveAvatars.createTavusVoice({
        voice_name: tavusVoiceName.trim(),
        training_audio_url: tavusVoiceAudioUrl.trim(),
        description: tavusVoiceDescription.trim() || undefined,
        consent: true,
      });
      setTavusVoiceTask({ id: voice.voice_id, name: voice.voice_name, status: voice.status });
      setTavusCustomVoiceId(voice.voice_id);
      setTavusVoiceConsent(false);
      setNotice(voice.message);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function selectAvatar(avatarId: string) {
    setSelectedAvatarId(avatarId);
    setError('');
    try {
      await liveAvatars.setPreference(avatarId);
      setNotice('LiveAvatar selection saved. It will be used by the meeting preview.');
    } catch (cause) {
      setError(messageFrom(cause));
    }
  }

  async function importModel() {
    if (!modelFile) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await importAvatarModel(modelFile);
      setGeneration(result);
      setModelFile(null);
      setNotice('GLB model imported into your private ECHO storage.');
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function create3dAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || !consent) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await uploadAvatarPhoto(photo, 'female');
      setGeneration(result);
      setPhoto(null);
      setConsent(false);
      setNotice('Photo submitted to the optional Avatar SDK 3D service.');
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove3dAvatar() {
    setError('');
    try {
      await request<void>('/avatar/generation', { method: 'DELETE', body: '{}' });
      setGeneration(null);
      setNotice('The generated 3D model was deleted from ECHO storage.');
    } catch (cause) {
      setError(messageFrom(cause));
    }
  }

  return <section className="voice-controls avatar-creator" aria-label="Create or choose an avatar">
    <h2>Choose your ECHO representation</h2>
    <p className="muted">Photorealistic LiveAvatar video is the primary meeting experience. Three-dimensional GLB models remain optional for ECHO World.</p>
    <div className="avatar-choice-grid" role="group" aria-label="Avatar creation options">
      <button type="button" className={`avatar-choice ${option === 'video-create' ? 'selected' : ''}`} aria-pressed={option === 'video-create'} onClick={() => setOption('video-create')}>
        <strong>Create Photorealistic Video Avatar</strong><span>Use an authorized photo or capture a webcam frame.</span><small>Recommended · LiveAvatar</small>
      </button>
      <button type="button" className={`avatar-choice ${option === 'video-select' ? 'selected' : ''}`} aria-pressed={option === 'video-select'} onClick={() => setOption('video-select')}>
        <strong>Choose a Realistic Human Avatar</strong><span>Select an available LiveAvatar provider avatar.</span><small>Ready to use</small>
      </button>
      <button type="button" className={`avatar-choice ${option === '3d' ? 'selected' : ''}`} aria-pressed={option === '3d'} onClick={() => setOption('3d')}>
        <strong>Create or Import 3D Avatar</strong><span>Optional skinned GLB for ECHO World.</span><small>WebGL viewer required for 3D preview</small>
      </button>
    </div>

    {option === 'video-create' ? <div className="avatar-option-panel">
      <h3>Create a photorealistic LiveAvatar</h3>
      <p className="muted">{providerMessage}</p>
      <p className="muted smallprint">LiveAvatar currently documents an alpha image-avatar creation API. It accepts a single JPEG/PNG (16:9 or 9:16, short side at least 1080 px); video-recording upload and provider identity verification are not available through this endpoint. You must have the likeness rights and provide consent.</p>
      <div className="avatar-webcam">
        <video ref={videoRef} className="meeting-video" muted playsInline />
        {!cameraActive ? <div className="avatar-webcam-empty">Webcam preview is stopped.</div> : null}
      </div>
      <div className="meeting-actions">
        {!cameraActive
          ? <button className="button ghost" type="button" onClick={() => void startCamera()}>Start webcam capture</button>
          : <button className="button ghost" type="button" onClick={() => void captureFrame()}>Capture frame</button>}
        {cameraActive ? <button className="button ghost" type="button" onClick={stopCamera}>Stop webcam</button> : null}
      </div>
      <form onSubmit={event => void createVideoAvatar(event)}>
        <label>Photo (JPEG or PNG)
          <input type="file" accept="image/jpeg,image/png" onChange={event => setPhoto(event.target.files?.[0] || null)} disabled={busy || !videoProviderReady} />
        </label>
        {photo ? <p className="muted" role="status">Selected: {photo.name} ({Math.round(photo.size / 1024)} KB)</p> : null}
        <label>Training resolution
          <select value={resolution} onChange={event => setResolution(Number(event.target.value) as 720 | 1080)}>
            <option value={720}>720p</option><option value={1080}>1080p (Business/Enterprise plan required)</option>
          </select>
        </label>
        <label className="avatar-consent">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy || !videoProviderReady} />
          I own or have permission to use this person’s likeness, and consent to sending this image to LiveAvatar for avatar training.
        </label>
        <button className="button" type="submit" disabled={!photo || !consent || busy || !videoProviderReady}>
          {busy ? 'Submitting image…' : 'Create video avatar'}
        </button>
      </form>
      {personalAvatar ? <p className="voice-status" role="status">Provider avatar training: {personalAvatar.status}{personalAvatar.status === 'ACTIVE' ? ' · ready for meetings' : ''}</p> : null}
      <div className="provider-status">
        <h3>Optional Tavus personalized human</h3>
        <p className="muted">Tavus accepts publicly reachable HTTPS media URLs for training. This form does not upload local files or capture identity documents; the provider enforces any account-specific eligibility and verification requirements.</p>
        {!tavusReady ? <p className="muted" role="status">Tavus PAL is not ready. Configure and enable Tavus, then confirm PAL access in provider status before training.</p> : null}
        <form onSubmit={event => void createTavusFace(event)}>
          <label>Avatar name
            <input value={tavusFaceName} onChange={event => setTavusFaceName(event.target.value)} maxLength={255} required disabled={!tavusReady || busy} />
          </label>
          <label>Training source
            <select value={tavusTrainingKind} onChange={event => setTavusTrainingKind(event.target.value as 'image' | 'video')} disabled={!tavusReady || busy}>
              <option value="image">Photo</option>
              <option value="video">Video recording</option>
            </select>
          </label>
          {tavusTrainingKind === 'image' ? <>
            <label>Public HTTPS photo URL
              <input type="url" inputMode="url" placeholder="https://…" value={tavusImageUrl} onChange={event => setTavusImageUrl(event.target.value)} required disabled={!tavusReady || busy} />
            </label>
            <label>Provider voice for this face
              <input value={tavusCustomVoiceId ? `Your voice: ${tavusCustomVoiceId}` : tavusVoiceName} onChange={event => { setTavusCustomVoiceId(''); setTavusVoiceName(event.target.value); }} placeholder="Tavus stock voice name" required={!tavusCustomVoiceId} disabled={!tavusReady || busy || Boolean(tavusCustomVoiceId)} />
            </label>
            {tavusCustomVoiceId ? <button className="button ghost" type="button" onClick={() => setTavusCustomVoiceId('')}>Use a stock voice instead</button> : null}
          </> : <>
            <label>Public HTTPS training video URL
              <input type="url" inputMode="url" placeholder="https://…" value={tavusVideoUrl} onChange={event => setTavusVideoUrl(event.target.value)} required disabled={!tavusReady || busy} />
            </label>
            <p className="muted smallprint">Tavus uses the video’s audio for the trained face; do not select a separate voice.</p>
          </>}
          <label>Avatar model
            <select value={tavusModel} onChange={event => setTavusModel(event.target.value as 'phoenix-4.5' | 'phoenix-4')} disabled={!tavusReady || busy}>
              <option value="phoenix-4.5">Phoenix 4.5</option>
              <option value="phoenix-4">Phoenix 4</option>
            </select>
          </label>
          <label className="avatar-consent">
            <input type="checkbox" checked={tavusFaceConsent} onChange={event => setTavusFaceConsent(event.target.checked)} disabled={!tavusReady || busy} />
            I own or have permission to use this person’s likeness and authorize Tavus to process this training media.
          </label>
          <button className="button" type="submit" disabled={!tavusReady || !tavusFaceConsent || !tavusFaceName.trim() || busy}>
            {busy ? 'Submitting…' : 'Create Tavus avatar'}
          </button>
        </form>
        {tavusFaceTask ? <p className="voice-status" role="status">Tavus face “{tavusFaceTask.name}”: {tavusFaceTask.status}{tavusFaceTask.id ? ` · ${tavusFaceTask.id}` : ''}</p> : null}
        <details>
          <summary>Create an authorized Tavus voice (optional)</summary>
          <p className="muted smallprint">Tavus needs a publicly reachable HTTPS audio URL. Image-trained faces may then use the returned ECHO-owned voice ID. Provider access, plan limits and consent requirements apply.</p>
          <form onSubmit={event => void createTavusVoice(event)}>
            <label>Voice name
              <input value={tavusVoiceName} onChange={event => setTavusVoiceName(event.target.value)} maxLength={255} required disabled={!tavusReady || busy || Boolean(tavusCustomVoiceId)} />
            </label>
            <label>Public HTTPS audio URL
              <input type="url" inputMode="url" placeholder="https://…" value={tavusVoiceAudioUrl} onChange={event => setTavusVoiceAudioUrl(event.target.value)} required disabled={!tavusReady || busy} />
            </label>
            <label>Optional description
              <input value={tavusVoiceDescription} onChange={event => setTavusVoiceDescription(event.target.value)} maxLength={1000} disabled={!tavusReady || busy} />
            </label>
            <label className="avatar-consent">
              <input type="checkbox" checked={tavusVoiceConsent} onChange={event => setTavusVoiceConsent(event.target.checked)} disabled={!tavusReady || busy} />
              I own or have permission to use this voice recording and authorize Tavus to process it.
            </label>
            <button className="button ghost" type="submit" disabled={!tavusReady || !tavusVoiceConsent || !tavusVoiceName.trim() || !tavusVoiceAudioUrl.trim() || busy}>
              {busy ? 'Submitting…' : 'Create Tavus voice'}
            </button>
          </form>
          {tavusVoiceTask ? <p className="voice-status" role="status">Tavus voice “{tavusVoiceTask.name}”: {tavusVoiceTask.status}{tavusVoiceTask.error ? ` · ${tavusVoiceTask.error}` : ''}</p> : null}
        </details>
      </div>
    </div> : null}

    {option === 'video-select' ? <div className="avatar-option-panel">
      <h3>Available LiveAvatar humans</h3>
      <p className="muted">This catalogue is retrieved from your configured provider account; ECHO does not substitute stock images or sample videos.</p>
      {videoProviderReady ? <button className="button ghost" type="button" onClick={() => void refreshCatalog()}>Refresh provider avatars</button> : <p className="muted">{providerMessage}</p>}
      <div className="provider-avatar-grid">
        {avatars.map(avatar => <article className={`provider-avatar-card ${selectedAvatarId === avatar.id ? 'selected' : ''}`} key={avatar.id}>
          {avatar.preview_url && isVideoPreview(avatar.preview_url)
            ? <video src={avatar.preview_url} poster={avatar.thumbnail_url || undefined} controls muted playsInline preload="none" />
            : avatar.thumbnail_url || avatar.preview_url
              ? <img src={avatar.thumbnail_url || avatar.preview_url || ''} alt="" loading="lazy" />
              : <div className="provider-avatar-no-preview">Preview unavailable from provider</div>}
          <strong>{avatar.name}</strong><span>{avatar.type} · {avatar.status}{avatar.configured_slot ? ` · ECHO slot ${avatar.configured_slot}` : ''}</span>
          {avatar.configured_model ? <small>Model: {avatar.configured_model}</small> : null}
          {avatar.configured_model_supported === false ? <small role="alert">This model is not supported by LiveAvatar.</small> : null}
          {avatar.configured_voice_id ? <small>Configured LiveAvatar voice</small> : null}
          <button type="button" className="button ghost" onClick={() => void selectAvatar(avatar.id)}>{selectedAvatarId === avatar.id ? 'Selected' : 'Use this avatar'}</button>
        </article>)}
      </div>
      {configuredSlots.some(slot => !slot.available) ? <div className="voice-status" role="status">
        {configuredSlots.filter(slot => !slot.available).map(slot => <p key={slot.slot}>Configured avatar {slot.slot} is unavailable: {slot.message}</p>)}
      </div> : null}
      {videoProviderReady && avatars.length === 0 ? <p className="muted">No active avatars were returned by LiveAvatar. Check the provider account, avatar availability and plan.</p> : null}
    </div> : null}

    {option === '3d' ? <div className="avatar-option-panel">
      <h3>Optional 3D avatar for ECHO World</h3>
      {generation ? <p className="voice-status" role="status">{generation.source === 'imported' ? '3D model' : '3D generation'}: {generation.status}{generation.model_available ? ' · model ready' : generation.source === 'avatarsdk' ? ` · ${generation.progress}%` : ''}</p> : null}
      {generation?.source === 'avatarsdk' && !generation.model_available && !['failed', 'timed out', 'timeout'].includes(generation.status.toLowerCase())
        ? <progress aria-label="3D avatar generation progress" value={generation.progress} max={100} />
        : null}
      {generation?.model_available ? <button className="button ghost" type="button" onClick={() => void remove3dAvatar()}>Delete 3D avatar from ECHO</button> : null}
      <div>
        <label>Import a compatible GLB model (up to 50 MB)
          <input type="file" accept=".glb,model/gltf-binary" onChange={event => setModelFile(event.target.files?.[0] || null)} disabled={busy} />
        </label>
        <button className="button ghost" type="button" onClick={() => void importModel()} disabled={!modelFile || busy}>
          {busy ? 'Importing model…' : 'Import GLB model'}
        </button>
      </div>
      <form onSubmit={event => void create3dAvatar(event)}>
        <label>Photo for optional Avatar SDK 3D generation
          <input type="file" accept="image/jpeg,image/png" onChange={event => setPhoto(event.target.files?.[0] || null)} disabled={busy || !avatarSdkConfigured} />
        </label>
        {!avatarSdkEnabled ? <p className="muted">Avatar SDK is optional and disabled. GLB import remains available without it.</p> : null}
        {avatarSdkEnabled && !avatarSdkConfigured ? <p className="muted">Set AVATAR_SDK_CLIENT_ID and AVATAR_SDK_CLIENT_SECRET to use optional 3D generation.</p> : null}
        <label className="avatar-consent">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy || !avatarSdkConfigured} />
          I have permission to use this photo and consent to its processing by Avatar SDK.
        </label>
        <button className="button" type="submit" disabled={!photo || !consent || busy || !avatarSdkConfigured}>
          {busy ? 'Submitting photo…' : 'Create optional 3D avatar'}
        </button>
      </form>
    </div> : null}
    {notice && <p className="muted" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
