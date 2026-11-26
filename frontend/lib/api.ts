import type { Echo, EchoInput, Message, PublicEcho, User } from '../types';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
export function apiWebSocketUrl(path: string): string {
  const url = new URL(`${API_BASE_URL.replace(/\/$/, '')}${path}`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
export async function uploadAvatarPhoto(photo: File, presentation: 'female' | 'male'): Promise<{ status: string; progress: number; model_available: boolean; source: string }> {
  const bytes = new Uint8Array(await photo.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const response = await fetch(`${API_BASE_URL}/avatar/generation`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photo_base64: btoa(binary),
      content_type: photo.type,
      consent: true,
      presentation,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Avatar generation failed (${response.status})`);
  }
  return response.json();
}

export async function fetchAvatarModel(): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/avatar/model`, { credentials: 'include' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Avatar download failed (${response.status})`);
  }
  return response.blob();
}

export async function importAvatarModel(model: File): Promise<{ status: string; progress: number; model_available: boolean; source: string }> {
  const form = new FormData();
  form.append('model', model);
  const response = await fetch(`${API_BASE_URL}/avatar/model/import`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Avatar import failed (${response.status})`);
  }
  return response.json();
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init, credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const auth = {
  me: () => request<User>('/auth/me'),
  register: (body: { name: string; email: string; password: string }) => request<User>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) => request<User>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/auth/logout', { method: 'POST', body: '{}' }),
};
export const echoes = {
  list: () => request<Echo[]>('/echoes'),
  get: (id: string) => request<Echo>(`/echoes/${id}`),
  create: (body: EchoInput) => request<Echo>('/echoes', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: EchoInput) => request<Echo>(`/echoes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => request<void>(`/echoes/${id}`, { method: 'DELETE', body: '{}' }),
  public: (handle: string) => request<PublicEcho>(`/public/${encodeURIComponent(handle)}`),
  chat: (path: string, message: string, history: Message[], signal?: AbortSignal) => request<{ reply: string; demo: boolean; sources?: Array<{id:string;title:string}> }>(path, { method: 'POST', body: JSON.stringify({ message, history }), signal }),
  history: (id: string) => request<Array<{id:string;user_message:string;assistant_message:string;created_at:string}>>(`/echoes/${encodeURIComponent(id)}/chat/history`),
  clearHistory: (id: string) => request<void>(`/echoes/${encodeURIComponent(id)}/chat/history`, { method: 'DELETE', body: '{}' }),
};

export const world = {
  discover: (q = '') => request<Array<Pick<Echo, 'id' | 'handle' | 'name' | 'tagline' | 'avatar_color' | 'avatar_style'>>>(`/world/discover?q=${encodeURIComponent(q)}`),
  communities: () => request<any[]>('/world/communities'),
  createCommunity: (data: {slug:string;name:string;description:string}) => request<any>('/world/communities', {method:'POST',body:JSON.stringify(data)}),
  join: (id:string) => request<any>(`/world/communities/${id}/join`, {method:'POST',body:'{}'}),
  posts: (id:string) => request<any[]>(`/world/communities/${id}/posts`),
  post: (id:string, content:string) => request<any>(`/world/communities/${id}/posts`, {method:'POST',body:JSON.stringify({content})}),
  connections: () => request<any[]>('/world/connections'),
  connect: (recipient_id:string) => request<any>('/world/connections', {method:'POST',body:JSON.stringify({recipient_id})}),
  accept: (id:string) => request<any>(`/world/connections/${id}/accept`, {method:'POST',body:'{}'}),
  intros: () => request<any[]>('/world/agent-introductions'),
  propose: (requester_echo_id:string, recipient_echo_id:string) => request<any>('/world/agent-introductions', {method:'POST',body:JSON.stringify({requester_echo_id,recipient_echo_id})}),
  approve: (id:string) => request<any>(`/world/agent-introductions/${id}/approve`, {method:'POST',body:'{}'}),
  dialogue: (id:string) => request<any>(`/world/agent-introductions/${id}/dialogue`, {method:'POST',body:'{}'}),
  run: (id:string) => request<any>(`/world/agent-introductions/${id}/run`, {method:'POST',body:'{}'}),
};
export async function importKnowledgeDocument(
  echoId: string, file: File, visibility: 'private' | 'public', confirmPublic: boolean,
): Promise<{memory:{id:string;title:string;content:string;visibility:string};sections:number;truncated:boolean;notice:string}> {
  const body = new FormData();
  body.append('file', file);
  body.append('visibility', visibility);
  body.append('allow_public', String(confirmPublic));
  const response = await fetch(`${API_BASE_URL}/studio/${encodeURIComponent(echoId)}/documents/import`, {
    method: 'POST', credentials: 'include', body,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const detail = result.detail;
    throw new Error(typeof detail === 'string' ? detail : `Import failed (${response.status})`);
  }
  return response.json();
}

export const studio = {
  memories: (id:string) => request<any[]>(`/studio/${id}/memories`),
  addMemory: (id:string, data:{title:string;content:string;visibility:string}) => request<any>(`/studio/${id}/memories`,{method:'POST',body:JSON.stringify(data)}),
  updateMemory: (id:string,memoryId:string,data:{title?:string;content?:string;visibility?:'private'|'public'}) => request<any>(`/studio/${id}/memories/${memoryId}`,{method:'PATCH',body:JSON.stringify(data)}),
  removeMemory: (id:string,memoryId:string) => request<void>(`/studio/${id}/memories/${memoryId}`,{method:'DELETE',body:'{}'}),
  billing: () => request<any>('/billing/overview'),
};

export type LiveAvatar = {
  id: string;
  name: string;
  type: string;
  status: string;
  preview_url?: string | null;
  thumbnail_url?: string | null;
  default_voice_agent_id?: string | null;
  configured_slot?: number;
  configured_voice_id?: string | null;
  configured_model?: string | null;
  configured_model_supported?: boolean;
  is_1080p?: boolean;
  source: string;
};

export type LiveAvatarCatalog = {
  provider: 'liveavatar';
  avatars: LiveAvatar[];
  default_avatar_id: string | null;
  sandbox: boolean;
  configured_slots: { slot: number; configured: boolean; available: boolean; message?: string | null }[];
};

export type LiveAvatarSessionToken = {
  provider: 'liveavatar';
  mode: 'FULL';
  session_id: string;
  session_token: string;
  avatar_id: string;
  sandbox: boolean;
  credits_per_minute: number;
  ai_operated?: boolean;
  echo_id?: string | null;
};

export type LiveAvatarLiteSession = {
  provider: 'liveavatar';
  mode: 'LITE';
  session_id: string;
  avatar_id: string;
  sandbox: boolean;
  credits_per_minute: number;
  livekit_url: string;
  livekit_client_token: string;
  ws_url?: string | null;
  max_session_duration?: number | null;
};

export type TavusFace = {
  id: string;
  name: string;
  preview_url?: string | null;
  thumbnail_url?: string | null;
  status: string;
  face_type?: string;
  available_for_plan?: boolean;
  selectable?: boolean;
  configured?: boolean;
  slot?: number | null;
  is_default?: boolean;
};

export type TavusFacesResponse = {
  faces: TavusFace[];
  default_face_id?: string | null;
  pal_name?: string | null;
  conferencing_email?: string | null;
  configured_face_slots?: Array<{ slot: number; name?: string | null; available: boolean }>;
  configured_faces_missing?: number;
};

export type UnifiedAvatar = {
  provider: 'local' | 'liveavatar' | 'tavus';
  id: string;
  name: string;
  status?: string;
  selectable: boolean;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  configured_slot?: number | null;
  is_default?: boolean;
  available_for_plan?: boolean;
  configured?: boolean;
  slot?: number | null;
};

export type AvatarProviderDescriptor = {
  id: 'local' | 'liveavatar' | 'tavus';
  name: string;
  kind: string;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  billable: boolean;
  credentials_required: boolean;
  capabilities: Record<string, boolean>;
  message: string;
  error: string | null;
  sandbox?: boolean;
  default_avatar_id?: string | null;
  pal_name?: string | null;
  default_face_id?: string | null;
  conferencing_email?: string | null;
};

async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Upload failed (${response.status})`);
  }
  return response.json();
}

export const liveAvatars = {
  status: () => request<any>('/avatar/providers/status'),
  list: () => request<LiveAvatarCatalog>('/avatar/live/avatars'),
  avatarStatus: (avatarId: string) => request<LiveAvatar>(`/avatar/live/avatars/${encodeURIComponent(avatarId)}`),
  preference: () => request<{ avatar_id: string | null }>('/avatar/live/preference'),
  setPreference: (avatar_id: string) => request<{ avatar_id: string }>('/avatar/live/preference', {
    method: 'PUT',
    body: JSON.stringify({ avatar_id }),
  }),
  createImage: (file: File, resolution: 720 | 1080, consent: boolean) => {
    const form = new FormData();
    form.append('file', file);
    form.append('resolution', String(resolution));
    form.append('consent', String(consent));
    return uploadForm<LiveAvatar>('/avatar/live/avatars/image', form);
  },
  createSession: (
    mode: 'FULL' | 'LITE',
    avatar_id: string,
    options: { echo_id?: string; share_echo_persona?: boolean; include_private_knowledge?: boolean } = {},
  ) => request<LiveAvatarSessionToken | LiveAvatarLiteSession>('/avatar/live/sessions', {
    method: 'POST',
    body: JSON.stringify({ mode, avatar_id, ...options }),
  }),
  usage: () => request<any>('/avatar/live/usage'),
  keepAlive: (sessionId: string) => request<{ status: string }>(`/avatar/live/sessions/${encodeURIComponent(sessionId)}/keep-alive`, {
    method: 'POST',
    body: '{}',
  }),
  stop: (sessionId: string) => request<{ status: string }>(`/avatar/live/sessions/${encodeURIComponent(sessionId)}/stop`, {
    method: 'POST',
    body: '{}',
  }),
  markClosed: (sessionId: string) => request<{ status: string }>(`/avatar/live/sessions/${encodeURIComponent(sessionId)}/closed`, {
    method: 'POST',
    body: '{}',
  }),
  markStarted: (sessionId: string) => request<{ status: string }>(`/avatar/live/sessions/${encodeURIComponent(sessionId)}/started`, {
    method: 'POST',
    body: '{}',
  }),
  catalog: () => request<{
    avatars: UnifiedAvatar[];
    providers: Record<'local' | 'liveavatar' | 'tavus', AvatarProviderDescriptor>;
  }>('/avatar/catalog'),
  tavusFaces: () => request<TavusFacesResponse>('/avatar/tavus/faces'),
  tavusPreference: () => request<{ face_id: string | null }>('/avatar/tavus/preference'),
  setTavusPreference: (face_id: string) => request<{ face_id: string }>('/avatar/tavus/preference', {
    method: 'PUT',
    body: JSON.stringify({ face_id }),
  }),
  createTavusFace: (body: {
    face_name: string;
    model_name: 'phoenix-4.5' | 'phoenix-4';
    train_image_url?: string;
    train_video_url?: string;
    voice_name?: string;
    default_voice_id?: string;
    consent: boolean;
  }) => request<{
    face_id: string;
    face_name: string;
    status: string;
    message: string;
  }>('/avatar/tavus/faces', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  tavusFaceStatus: (faceId: string) => request<{
    face_id: string;
    face_name: string;
    status: string;
    finetune_status?: string | null;
    thumbnail_url?: string | null;
    thumbnail_video_url?: string | null;
    available_for_plan?: boolean;
  }>(`/avatar/tavus/faces/${encodeURIComponent(faceId)}`),
  createTavusVoice: (body: {
    voice_name: string;
    training_audio_url: string;
    description?: string;
    consent: boolean;
  }) => request<{
    voice_id: string;
    voice_name: string;
    status: string;
    message: string;
  }>('/avatar/tavus/voices', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  tavusVoiceStatus: (voiceId: string) => request<{
    voice_id: string;
    voice_name: string;
    status: string;
    error_message?: string | null;
  }>(`/avatar/tavus/voices/${encodeURIComponent(voiceId)}`),
  tavusUsage: () => request<{
    session_count: number;
    active_sessions: number;
    tracked_duration_seconds: number;
    provider_credits: number | null;
    billing_note: string;
  }>('/avatar/tavus/usage'),
  tavusConversationStatus: (conversationId: string) => request<{
    conversation_id: string;
    status: string;
    created_at?: string | null;
    updated_at?: string | null;
    source: 'echo' | 'tavus';
  }>(`/avatar/tavus/conversations/${encodeURIComponent(conversationId)}/status`),
  createTavusConversation: (face_id?: string) => request<{
    provider: 'tavus';
    conversation_id: string;
    conversation_url?: string;
    status?: string;
    face_id: string;
    message: string;
  }>('/avatar/tavus/conversations', {
    method: 'POST',
    body: JSON.stringify(face_id ? { face_id } : {}),
  }),
  endTavusConversation: (conversationId: string) => request<{ status: string }>(`/avatar/tavus/conversations/${encodeURIComponent(conversationId)}/end`, {
    method: 'POST',
    body: '{}',
  }),
};
