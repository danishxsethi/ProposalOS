import { create } from 'zustand';

interface AuthState {
  user: any | null;
  setUser: (user: any | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
