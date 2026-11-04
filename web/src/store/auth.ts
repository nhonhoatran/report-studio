import { create } from 'zustand';
import { api, ApiError } from '@/api/client';
import type { User } from '@/api/types';
import { useTheme } from '@/store/theme';

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
      const { user, preferences } = await api.auth.me();
      useTheme.getState().hydrate(preferences); // the look is applied before the pages render
      set({ user, status: 'ready' });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      set({ user: null, status: 'ready' });
    }
  },
  login: async (username, password) => {
    const { user, preferences } = await api.auth.login(username, password);
    useTheme.getState().hydrate(preferences);
    set({ user, status: 'ready' });
  },
  logout: async () => {
    try { await api.auth.logout(); } finally { set({ user: null }); }
  },
  clear: () => set({ user: null, status: 'ready' }),
}));

export const canEdit = (user: User | null) => !!user && (user.role === 'admin' || user.role === 'editor');
