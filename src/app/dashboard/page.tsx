'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useStore } from '@/store/useStore';
import { encryptData, decryptData, deriveKey } from '@/lib/crypto';
import { isPasskeySupported, isPasskeyRegistered, authenticateWithPasskey } from '@/lib/passkey';
import { VaultItem } from '@/types/vault';
import { Plus, Search, Loader2, Lock, KeyRound, ChevronDown, Eye, EyeOff, Copy, Check, Fingerprint } from 'lucide-react';
import VaultItemCard from '@/components/VaultItemCard';
import AddEditItemModal from '@/components/AddEditItemModal';
import Favicon from '@/components/Favicon';
import { motion, AnimatePresence } from 'framer-motion';

export default function Dashboard() {
  const router = useRouter();
  const { user, masterKey, setMasterKey, setMasterPassword, logout } = useStore();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'none' | 'favorite' | 'strongest' | 'medium' | 'normal' | 'weak'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [passkeyUnlockLoading, setPasskeyUnlockLoading] = useState(false);
  const [recentVisiblePasswords, setRecentVisiblePasswords] = useState<Record<string, boolean>>({});
  const [recentCopiedPasswords, setRecentCopiedPasswords] = useState<Record<string, boolean>>({});
  const [showDashboardContainers, setShowDashboardContainers] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);

  useEffect(() => {
    if (!user || !masterKey) {
      setItems([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, `users/${user.uid}/vault`));
    
    // Live stream encrypted data from Firestore
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const decryptedItems: VaultItem[] = [];
      
      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        if (data.encryptedData) {
          // Zero-knowledge decryption on the client side
          const decryptedJson = decryptData(data.encryptedData, masterKey);
          if (decryptedJson) {
            try {
              const parsed: VaultItem = JSON.parse(decryptedJson);
              const updatedAt =
                typeof data.updatedAt?.toMillis === 'function'
                  ? data.updatedAt.toMillis()
                  : typeof parsed.updatedAt === 'number'
                    ? parsed.updatedAt
                    : 0;
              const createdAt =
                typeof parsed.createdAt === 'number'
                  ? parsed.createdAt
                  : updatedAt;

              decryptedItems.push({ ...parsed, id: docSnapshot.id, createdAt, updatedAt });
            } catch {
              // Ignore malformed entries for this key and continue loading others.
            }
          }
        }
      });
      
      setItems(decryptedItems);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, masterKey]);

  const handleUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setUnlockLoading(true);
    setUnlockError('');

    // Yield to the browser first so the loading state renders before
    // PBKDF2 (100k iterations) blocks the main thread for ~3-4 seconds.
    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      const derivedKey = deriveKey(unlockPassword, user.email);
      setMasterKey(derivedKey);
      setMasterPassword(unlockPassword);
      setUnlockPassword('');
      setLoading(true);
    } catch {
      setUnlockError('Unable to unlock vault. Check your master password.');
      setUnlockLoading(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    if (!user) return;

    if (!isPasskeyRegistered(user.uid)) {
      setUnlockError('No passkey found on this device. Enter your master password instead.');
      return;
    }

    setPasskeyUnlockLoading(true);
    setUnlockError('');

    try {
      const { masterPassword: decryptedMasterPassword } = await authenticateWithPasskey(user.uid);
      const derivedKey = deriveKey(decryptedMasterPassword, user.email);
      setMasterKey(derivedKey);
      setMasterPassword(decryptedMasterPassword);
      setLoading(true);
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) {
        setUnlockError('Passkey authentication was cancelled.');
      } else {
        setUnlockError('Passkey authentication failed. Try entering your master password.');
      }
    } finally {
      setPasskeyUnlockLoading(false);
    }
  };

  if (!user) {
    router.push('/auth');
    return null;
  }

  if (!masterKey) {
    const anyUnlockLoading = unlockLoading || passkeyUnlockLoading;
    const passkeyAvailable = isPasskeySupported() && isPasskeyRegistered(user.uid);

    return (
      <div className="min-h-[calc(100vh-2rem)] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl shadow-black/40"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Vault locked</h1>
              <p className="text-sm text-zinc-400">Enter your master password to unlock this session.</p>
            </div>
          </div>

          {unlockError ? (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {unlockError}
            </div>
          ) : null}

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-400">Master Password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  required
                  disabled={anyUnlockLoading}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-slate-200 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
                  placeholder="Enter master password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={anyUnlockLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {unlockLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
              {unlockLoading ? 'Unlocking...' : 'Unlock Vault'}
            </button>

            {passkeyAvailable ? (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-zinc-900 px-3 text-xs text-zinc-500">or</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePasskeyUnlock}
                  disabled={anyUnlockLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  {passkeyUnlockLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Fingerprint className="h-5 w-5" />
                  )}
                  {passkeyUnlockLoading ? 'Verifying...' : 'Unlock with Passkey'}
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={() => {
                logout();
                router.push('/auth');
              }}
              disabled={anyUnlockLoading}
              className="w-full text-sm text-zinc-400 transition hover:text-zinc-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Use a different account
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const handleSaveItem = async (item: Omit<VaultItem, 'id'>) => {
    if (!user || !masterKey) return;
    
    // Use existing ID if editing, otherwise create a new one
    const id = editingItem?.id || crypto.randomUUID();
    const now = Date.now();
    const vaultItem: VaultItem = {
      ...item,
      id,
      favorite: editingItem?.favorite ?? item.favorite ?? false,
      createdAt: editingItem?.createdAt ?? item.createdAt ?? now,
      updatedAt: now
    };
    
    // Encrypt the entire object locally before sending to Firebase
    const jsonString = JSON.stringify(vaultItem);
    const encryptedData = encryptData(jsonString, masterKey);
    
    try {
      const docRef = doc(db, `users/${user.uid}/vault`, id);
      await setDoc(docRef, {
        encryptedData,
        updatedAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (e) {
      console.error('Failed to save to vault', e);
      // Handle error (e.g., show toast)
    }
  };

  const handleToggleFavorite = async (item: VaultItem) => {
    if (!user || !masterKey) return;

    const updatedItem: VaultItem = {
      ...item,
      favorite: !item.favorite,
      createdAt: item.createdAt ?? item.updatedAt ?? Date.now(),
      updatedAt: Date.now()
    };
    const encryptedData = encryptData(JSON.stringify(updatedItem), masterKey);

    try {
      const docRef = doc(db, `users/${user.uid}/vault`, item.id);
      await setDoc(docRef, {
        encryptedData,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to update favorite state', e);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this vault item?')) return;
    
    try {
      const docRef = doc(db, `users/${user.uid}/vault`, id);
      await deleteDoc(docRef);
    } catch (e) {
      console.error('Failed to delete vault item', e);
    }
  };

  const filteredItems = items.filter(item => 
    item.siteName.toLowerCase().includes(search.toLowerCase()) || 
    item.username.toLowerCase().includes(search.toLowerCase()) ||
    (item.url && item.url.toLowerCase().includes(search.toLowerCase()))
  );

  const getPasswordStrengthScore = (password: string): number => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  };

  const getPasswordStrengthBorder = (value: string) => {
    const score = getPasswordStrengthScore(value);
    if (score <= 1) return 'border-b-red-500';
    if (score === 2) return 'border-b-yellow-400';
    if (score === 3) return 'border-b-blue-500';
    if (score === 4) return 'border-b-emerald-500';
    return 'border-b-emerald-400';
  };

  const getNormalizedUrl = (value?: string): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      return new URL(withProtocol).toString();
    } catch {
      return null;
    }
  };

  const totalPasswords = items.length;
  const strengthStats = items.reduce(
    (acc, item) => {
      const score = getPasswordStrengthScore(item.password || '');
      if (score === 5)      acc.excellent += 1;
      else if (score === 4) acc.strong += 1;
      else if (score === 3) acc.good += 1;
      else if (score === 2) acc.fair += 1;
      else                  acc.weak += 1;
      acc.scoreTotal += score;
      return acc;
    },
    { excellent: 0, strong: 0, good: 0, fair: 0, weak: 0, scoreTotal: 0 }
  );

  const strengthData = [
    { key: 'Excellent', count: strengthStats.excellent, colorClass: 'bg-emerald-400', colorHex: '#34d399' },
    { key: 'Strong',    count: strengthStats.strong,    colorClass: 'bg-emerald-500', colorHex: '#10b981' },
    { key: 'Good',      count: strengthStats.good,      colorClass: 'bg-blue-500',    colorHex: '#3b82f6' },
    { key: 'Fair',      count: strengthStats.fair,      colorClass: 'bg-yellow-400',  colorHex: '#facc15' },
    { key: 'Weak',      count: strengthStats.weak,      colorClass: 'bg-red-500',     colorHex: '#ef4444' },
  ];

  const strengthWithPercentages = strengthData.map((item) => ({
    ...item,
    percentage: totalPasswords ? Math.round((item.count / totalPasswords) * 100) : 0
  }));

  const doughnutGradient = (() => {
    if (!totalPasswords) return 'conic-gradient(#3f3f46 0deg 360deg)';

    let start = 0;
    const segments = strengthWithPercentages.map((item) => {
      const sweep = (item.percentage / 100) * 360;
      const end = start + sweep;
      const segment = `${item.colorHex} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      start = end;
      return segment;
    });

    return `conic-gradient(${segments.join(', ')})`;
  })();

  const securityHealth = totalPasswords
    ? Math.round((strengthStats.scoreTotal / (totalPasswords * 5)) * 100)
    : 0;

  const recentItems = [...items]
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 5);

  const formatRecentTime = (timestamp?: number) => {
    if (!timestamp) return 'No timestamp';
    return new Date(timestamp).toLocaleString();
  };

  const handleRecentTogglePassword = (id: string) => {
    setRecentVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleRecentCopyPassword = async (id: string, password: string) => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setRecentCopiedPasswords((prev) => ({
      ...prev,
      [id]: true
    }));
    setTimeout(() => {
      setRecentCopiedPasswords((prev) => ({
        ...prev,
        [id]: false
      }));
    }, 1500);
  };

  const sortByName = (itemsToSort: VaultItem[]) => {
    return [...itemsToSort].sort((a, b) => {
      const result = (a.siteName || '').localeCompare(b.siteName || '', undefined, { sensitivity: 'base' });
      return sortOrder === 'asc' ? result : -result;
    });
  };

  const getSortedItems = (itemsToSort: VaultItem[]) => {
    if (sortBy === 'favorite') {
      return sortByName(itemsToSort.filter((item) => Boolean(item.favorite)));
    } else if (sortBy === 'strongest') {
      return sortByName(itemsToSort.filter((item) => getPasswordStrengthScore(item.password || '') >= 4));
    } else if (sortBy === 'medium') {
      return sortByName(itemsToSort.filter((item) => {
        const score = getPasswordStrengthScore(item.password || '');
        return score === 3;
      }));
    } else if (sortBy === 'normal') {
      return sortByName(itemsToSort.filter((item) => {
        const score = getPasswordStrengthScore(item.password || '');
        return score === 2;
      }));
    } else if (sortBy === 'weak') {
      return sortByName(itemsToSort.filter((item) => {
        const score = getPasswordStrengthScore(item.password || '');
        return score <= 1;
      }));
    }
    return sortByName(itemsToSort);
  };

  const sortedItems = getSortedItems(filteredItems);
  const isSearching = search.trim().length > 0;

  return (
    <div className="flex flex-col h-full gap-5">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 tracking-tight bg-gradient-to-r from-emerald-400 to-indigo-400 bg-clip-text text-transparent">Mero Password Manager</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {totalPasswords} {totalPasswords === 1 ? 'credential' : 'credentials'} · End-to-End Encrypted . Client-side Storage
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDashboardContainers((prev) => !prev)}
            className="h-9 w-9 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors flex items-center justify-center cursor-pointer"
            title={showDashboardContainers ? 'Hide analytics' : 'Show analytics'}
          >
            {showDashboardContainers ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          <button
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-2 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Password
          </button>
        </div>
      </div>

      {/* ── Search + Sort ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by site, username or URL…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="w-full sm:w-auto flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer min-w-[160px]"
          >
            <span className="truncate">
              {sortBy === 'none'     && `Default (${sortOrder === 'asc' ? 'A–Z' : 'Z–A'})`}
              {sortBy === 'favorite' && `Favorites`}
              {sortBy === 'strongest'&& `Strongest`}
              {sortBy === 'medium'   && `Medium`}
              {sortBy === 'normal'   && `Normal`}
              {sortBy === 'weak'     && `Weak`}
            </span>
            <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
          </button>

          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-zinc-950 rounded-xl shadow-2xl z-50 border border-zinc-800 overflow-hidden">
                <div className="grid grid-cols-2 gap-1.5 p-2 border-b border-zinc-800">
                {(['asc', 'desc'] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => setSortOrder(o)}
                      className={`dropdown-item rounded-lg px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-zinc-800 hover:text-zinc-100 ${
                        sortOrder === o ? '!bg-emerald-500/20 !text-emerald-300' : 'text-zinc-400'
                      }`}
                    >
                      {o === 'asc' ? 'A → Z' : 'Z → A'}
                    </button>
                  ))}
                </div>
                {(['none', 'favorite', 'strongest', 'medium', 'normal', 'weak'] as const).map((opt, i, arr) => (
                  <div key={opt}>
                    <button
                      onClick={() => { setSortBy(opt); setShowSortMenu(false); }}
                      className={`dropdown-item w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer capitalize hover:bg-zinc-800 hover:text-zinc-100 ${
                        sortBy === opt ? '!bg-emerald-500/10 !text-emerald-400 font-medium' : 'text-zinc-400'
                      }`}
                    >
                      {opt === 'none' ? 'Default' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                    {i < arr.length - 1 && <div className="h-px bg-zinc-800" />}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Analytics (collapsible) ──────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {showDashboardContainers && !isSearching ? (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="space-y-4"
          >
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Total Passwords</p>
                <p className="mt-2 text-3xl font-bold text-slate-100 tabular-nums">{totalPasswords}</p>
                <p className="mt-1 text-xs text-zinc-600">Encrypted credentials in vault</p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Security Health</p>
                <div className="mt-2 flex items-end gap-2">
                  <p className={`text-3xl font-bold tabular-nums ${securityHealth >= 70 ? 'text-emerald-400' : securityHealth >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {securityHealth}%
                  </p>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${securityHealth >= 70 ? 'bg-emerald-500' : securityHealth >= 40 ? 'bg-yellow-400' : 'bg-red-500'}`}
                    style={{ width: `${securityHealth}%` }}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Needs Attention</p>
                <p className={`mt-2 text-3xl font-bold tabular-nums ${strengthStats.weak > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {strengthStats.weak}
                </p>
                <p className="mt-1 text-xs text-zinc-600">Weak passwords to rotate</p>
              </div>
            </div>

            {/* Strength + Recents row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
              {/* Strength distribution */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col">
                <p className="text-sm font-semibold text-slate-100 mb-4">Strength Distribution</p>

                <div className="flex-1 flex flex-col gap-4 min-h-0">
                  {/* Doughnut — grows to fill available space, capped so it doesn't get huge */}
                  <div className="flex justify-center items-center flex-1 min-h-0">
                    <div
                      className="relative rounded-full w-full"
                      style={{
                        background: doughnutGradient,
                        aspectRatio: '1 / 1',
                        maxWidth: '160px',
                        maxHeight: '160px',
                      }}
                    >
                      <div className="absolute inset-[18%] flex items-center justify-center rounded-full bg-zinc-900">
                        <div className="text-center">
                          <p className="text-[10px] text-zinc-600">Total</p>
                          <p className="text-xl font-bold text-slate-100 tabular-nums">{totalPasswords}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bars — always at the bottom, spread evenly */}
                  <div className="flex flex-col justify-between gap-2">
                    {strengthWithPercentages.map((s) => (
                      <div key={s.key}>
                        <div className="flex justify-between text-xs text-zinc-400 mb-1">
                          <span>{s.key}</span>
                          <span className="tabular-nums">{s.count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                          <div className={`h-full rounded-full ${s.colorClass}`} style={{ width: `${s.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent passwords */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col">
                <p className="text-sm font-semibold text-slate-100 mb-4">Recently Updated</p>

                {recentItems.length === 0 ? (
                  <p className="text-sm text-zinc-600">No passwords yet.</p>
                ) : (
                  <div className="flex flex-col gap-2 flex-1 flex-start">
                    {recentItems.map((item) => {
                      const normalizedUrl = getNormalizedUrl(item.url);
                      const strengthBorder = getPasswordStrengthBorder(item.password || '');
                      return (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2">
                          <div className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden flex-shrink-0">
                            <Favicon url={item.url} alt={item.siteName} />
                          </div>
                          <div className="flex-1 min-w-0">
                            {normalizedUrl ? (
                              <a href={normalizedUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-medium text-slate-200 hover:text-emerald-400 transition-colors truncate block">
                                {item.siteName}
                              </a>
                            ) : (
                              <p className="text-xs font-medium text-slate-200 truncate">{item.siteName}</p>
                            )}
                            <div className={`mt-1 rounded bg-zinc-900 border border-zinc-800 border-b-2 ${strengthBorder} px-2 py-0.5 font-mono text-[10px] text-zinc-400`}>
                              {recentVisiblePasswords[item.id] ? (item.password || '—') : '••••••••••'}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={() => handleRecentTogglePassword(item.id)}
                              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer rounded">
                              {recentVisiblePasswords[item.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => void handleRecentCopyPassword(item.id, item.password)}
                              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer rounded">
                              {recentCopiedPasswords[item.id] ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Vault grid ───────────────────────────────────────────────── */}
      <div className="flex-1">
        {loading ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-8">
            <AnimatePresence>
              {sortedItems.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                    <Search className="w-6 h-6 text-zinc-600" />
                  </div>
                  <p className="text-zinc-400 font-medium">
                    {search ? 'No matches found' : 'Your vault is empty'}
                  </p>
                  <p className="text-zinc-600 text-sm mt-1">
                    {search ? `No results for "${search}"` : 'Add your first password to get started'}
                  </p>
                  {!search && (
                    <button
                      onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
                      className="mt-4 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-2 px-4 rounded-xl transition-all text-sm cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Add Password
                    </button>
                  )}
                </motion.div>
              ) : (
                sortedItems.map((item) => (
                  <VaultItemCard
                    key={item.id}
                    item={item}
                    onEdit={() => { setEditingItem(item); setIsModalOpen(true); }}
                    onDelete={() => handleDeleteItem(item.id)}
                    onToggleFavorite={() => handleToggleFavorite(item)}
                  />
                ))
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <AddEditItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveItem}
        initialData={editingItem}
      />
    </div>
  );
}
