export type User = { id: string; email: string; name: string };
export type Echo = {
  id: string; owner_id: string; handle: string; name: string; tagline: string;
  personality: string; private_knowledge: string; public_knowledge: string;
  avatar_color: string; avatar_style: string; is_public: boolean;
};
export type EchoInput = Omit<Echo, 'id' | 'owner_id'>;
export type PublicEcho = Pick<Echo, 'handle' | 'name' | 'tagline' | 'avatar_color' | 'avatar_style'>;
export type Message = { role: 'user' | 'assistant'; content: string };
