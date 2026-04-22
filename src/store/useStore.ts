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
  twoFAStatus: 'loading' | 'disabled' | 'setup' | 'enabled';
  setUser: (user: AuthUser | null) => void;
  setMasterKey: (key: string | null) => void;
  setMasterPassword: (password: string | null) => void;
  setTwoFAStatus: (status: 'loading' | 'disabled' | 'setup' | 'enabled') => void;
  logout: () => void;
};

export const useStore = create<StoreState>((set) => ({
  user: null,
  masterKey: null,
  masterPassword: null,
  isAuthenticated: false,
  twoFAStatus: 'loading',
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setMasterKey: (key) => set({ masterKey: key }),
  setMasterPassword: (password) => set({ masterPassword: password }),
  setTwoFAStatus: (status) => set({ twoFAStatus: status }),
  logout: () => set({ user: null, masterKey: null, masterPassword: null, isAuthenticated: false, twoFAStatus: 'loading' }),
}));
