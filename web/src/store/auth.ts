import { create } from 'zustand';
import { api, ApiError } from '@/api/client';
import type { Permission, User } from '@/api/types';

interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'ready';
  load: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clear: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',
  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const { user } = await api.auth.me();
      set({ user, status: 'ready' });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      set({ user: null, status: 'ready' });
    }
  },
  login: async (username, password) => {
    const { user } = await api.auth.login(username, password);
    set({ user, status: 'ready' });
  },
  logout: async () => {
    try { await api.auth.logout(); } finally { set({ user: null }); }
  },
  clear: () => set({ user: null, status: 'ready' }),
}));

/** Does the signed-in user's role grant any of these permissions? The server is the judge; this only hides what it would refuse. */
export const can = (user: User | null, ...any: Permission[]) => !!user && any.some((p) => user.permissions?.includes(p));
export const canEdit = (user: User | null) => can(user, 'dashboards.edit');
