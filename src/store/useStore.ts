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
  masterPassword: string | null; // kept in memory for passkey update & email recovery
  isAuthenticated: boolean;
  setUser: (user: AuthUser | null) => void;
  setMasterKey: (key: string | null) => void;
  setMasterPassword: (password: string | null) => void;
  logout: () => void;
};

export const useStore = create<StoreState>((set) => ({
  user: null,
  masterKey: null,
  masterPassword: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setMasterKey: (key) => set({ masterKey: key }),
  setMasterPassword: (password) => set({ masterPassword: password }),
  logout: () => set({ user: null, masterKey: null, masterPassword: null, isAuthenticated: false }),
}));
