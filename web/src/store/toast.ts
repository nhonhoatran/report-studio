import { create } from 'zustand';

/** A toast carries either ready text or the thrown error, which `Toasts` translates when it renders. */
export interface Toast { id: number; kind: 'success' | 'error' | 'info'; message?: string; error?: unknown }
interface ToastState { toasts: Toast[]; push: (kind: Toast['kind'], body: { message?: string; error?: unknown }) => void; dismiss: (id: number) => void }

let seq = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, body) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, kind, ...body }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToasts.getState().push('success', { message: m }),
  info: (m: string) => useToasts.getState().push('info', { message: m }),
  /** Pass the error itself (not `e.message`) so a coded server error shows in the user's language. */
  error: (e: unknown) => useToasts.getState().push('error', typeof e === 'string' ? { message: e } : { error: e }),
};
