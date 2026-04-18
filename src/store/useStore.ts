import { create } from 'zustand';

// Store decrypted master key inside memory to preserve Zero-Knowledge Architecture
type AuthUser = {
  uid: string;
  email: string;
  photoURL?: string | null;
};

type StoreState = {
  user: AuthUser | null;
  masterKey: string | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser | null) => void;
  setMasterKey: (key: string | null) => void;
  logout: () => void;
};

export const useStore = create<StoreState>((set) => ({
  user: null,
  masterKey: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setMasterKey: (key) => set({ masterKey: key }),
  logout: () => set({ user: null, masterKey: null, isAuthenticated: false }),
}));
