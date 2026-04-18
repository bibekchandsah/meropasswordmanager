'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useStore } from '@/store/useStore';
import { encryptData, decryptData, deriveKey } from '@/lib/crypto';
import { VaultItem } from '@/types/vault';
import { Plus, Search, Loader2, Lock, KeyRound, ChevronDown, Eye, EyeOff, Copy, Check } from 'lucide-react';
import VaultItemCard from '@/components/VaultItemCard';
import AddEditItemModal from '@/components/AddEditItemModal';
import Favicon from '@/components/Favicon';
import { motion, AnimatePresence } from 'framer-motion';

export default function Dashboard() {
  const router = useRouter();
  const { user, masterKey, setMasterKey, logout } = useStore();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'none' | 'favorite' | 'strongest' | 'medium' | 'normal' | 'weak'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
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

    try {
      const derivedKey = deriveKey(unlockPassword, user.email);
      setMasterKey(derivedKey);
      setUnlockPassword('');
      setLoading(true);
    } catch {
      setUnlockError('Unable to unlock vault. Check your master password.');
    } finally {
      setUnlockLoading(false);
    }
  };

  if (!user) {
    router.push('/auth');
    return null;
  }

  if (!masterKey) {
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
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-slate-200 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Enter master password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={unlockLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {unlockLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
              Unlock Vault
            </button>

            <button
              type="button"
              onClick={() => {
                logout();
                router.push('/auth');
              }}
              className="w-full text-sm text-zinc-400 transition hover:text-zinc-200"
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
    return 'border-b-green-500';
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
      if (score >= 4) {
        acc.strongest += 1;
      } else if (score === 3) {
        acc.medium += 1;
      } else if (score === 2) {
        acc.normal += 1;
      } else {
        acc.weak += 1;
      }
      acc.scoreTotal += score;
      return acc;
    },
    { strongest: 0, medium: 0, normal: 0, weak: 0, scoreTotal: 0 }
  );

  const strengthData = [
    { key: 'Strongest', count: strengthStats.strongest, colorClass: 'bg-emerald-500', colorHex: '#10b981' },
    { key: 'Medium', count: strengthStats.medium, colorClass: 'bg-blue-500', colorHex: '#3b82f6' },
    { key: 'Normal', count: strengthStats.normal, colorClass: 'bg-yellow-400', colorHex: '#facc15' },
    { key: 'Weak', count: strengthStats.weak, colorClass: 'bg-red-500', colorHex: '#ef4444' }
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
    <div className="flex flex-col h-full gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-indigo-400 bg-clip-text text-transparent">Mero Password Manager</h1>
          <p className="text-zinc-400 text-sm mt-1">End-to-End Encrypted Client-side Storage</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDashboardContainers((prev) => !prev)}
            className="h-10 w-10 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-slate-100 transition-colors flex items-center justify-center cursor-pointer"
            title={showDashboardContainers ? 'Hide dashboard containers' : 'Show dashboard containers'}
            aria-label={showDashboardContainers ? 'Hide dashboard containers' : 'Show dashboard containers'}
          >
            {showDashboardContainers ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>

          <button
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            Add Password
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input 
            type="text" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vault..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-slate-200"
          />
        </div>

        <div className="relative">
          <button 
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl py-4 sm:py-2.5 px-4 text-sm font-medium text-slate-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <span>
              {sortBy === 'none' && `Default (${sortOrder === 'asc' ? 'A-Z' : 'Z-A'})`}
              {sortBy === 'favorite' && `Favorite (${sortOrder === 'asc' ? 'A-Z' : 'Z-A'})`}
              {sortBy === 'strongest' && `Strongest (${sortOrder === 'asc' ? 'A-Z' : 'Z-A'})`}
              {sortBy === 'medium' && `Medium (${sortOrder === 'asc' ? 'A-Z' : 'Z-A'})`}
              {sortBy === 'normal' && `Normal (${sortOrder === 'asc' ? 'A-Z' : 'Z-A'})`}
              {sortBy === 'weak' && `Weak (${sortOrder === 'asc' ? 'A-Z' : 'Z-A'})`}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
          </button>

          {showSortMenu && (
            <>
              <div 
                className="fixed inset-0 z-40"
                onClick={() => setShowSortMenu(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-800 rounded-xl shadow-xl z-50 border border-zinc-700 overflow-hidden">
                <div className="grid grid-cols-2 gap-2 p-2 border-b border-zinc-700 bg-zinc-900/60">
                  <button
                    onClick={() => setSortOrder('asc')}
                    className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${sortOrder === 'asc' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    Asc (A-Z)
                  </button>
                  <button
                    onClick={() => setSortOrder('desc')}
                    className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${sortOrder === 'desc' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    Desc (Z-A)
                  </button>
                </div>
                <button
                  onClick={() => {
                    setSortBy('none');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${sortBy === 'none' ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Default
                </button>
                <div className="h-px bg-zinc-700" />
                <button
                  onClick={() => {
                    setSortBy('favorite');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${sortBy === 'favorite' ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Favorite
                </button>
                <div className="h-px bg-zinc-700" />
                <button
                  onClick={() => {
                    setSortBy('strongest');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${sortBy === 'strongest' ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Strongest
                </button>
                <div className="h-px bg-zinc-700" />
                <button
                  onClick={() => {
                    setSortBy('medium');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${sortBy === 'medium' ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Medium
                </button>
                <div className="h-px bg-zinc-700" />
                <button
                  onClick={() => {
                    setSortBy('normal');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${sortBy === 'normal' ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Normal
                </button>
                <div className="h-px bg-zinc-700" />
                <button
                  onClick={() => {
                    setSortBy('weak');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${sortBy === 'weak' ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Weak
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showDashboardContainers && !isSearching ? (
          <motion.div
            key="dashboard-analytics"
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Total Passwords</p>
                <p className="mt-2 text-3xl font-bold text-slate-100">{totalPasswords}</p>
                <p className="mt-2 text-xs text-zinc-400">All saved credentials in your encrypted vault.</p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Security Health</p>
                <p className="mt-2 text-3xl font-bold text-emerald-400">{securityHealth}%</p>
                <p className="mt-2 text-xs text-zinc-400">Calculated from average password strength across all entries.</p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Needs Attention</p>
                <p className="mt-2 text-3xl font-bold text-red-400">{strengthStats.weak}</p>
                <p className="mt-2 text-xs text-zinc-400">Weak passwords should be rotated first.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <h2 className="text-lg font-semibold text-slate-100">Password Strength Distribution</h2>
                <p className="mt-1 text-sm text-zinc-400">Visual breakdown of strongest, medium, normal, and weak passwords.</p>

                <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="space-y-6">
                    {strengthWithPercentages.map((item) => {
                      return (
                        <div key={item.key}>
                          <div className="mb-1 flex items-center justify-between text-sm text-zinc-300">
                            <span>{item.key}</span>
                            <span>{item.count} ({item.percentage}%)</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={`h-full transition-all duration-300 ${item.colorClass}`}
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-center gap-8 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 lg:gap-10">
                    <div
                      className="relative h-40 w-40 rounded-full"
                      style={{ background: doughnutGradient }}
                      aria-label="Password strength doughnut chart"
                    >
                      <div className="absolute inset-5 flex items-center justify-center rounded-full bg-zinc-950">
                        <div className="text-center">
                          <p className="text-xs text-zinc-500">Total</p>
                          <p className="text-2xl font-bold text-slate-100">{totalPasswords}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-[140px] flex-col gap-3 border-l border-zinc-800 pl-5 text-xs">
                      {strengthWithPercentages.map((item) => (
                        <div key={`${item.key}-legend`} className="flex items-center gap-2 text-zinc-300">
                          <span className={`h-2.5 w-2.5 rounded-full ${item.colorClass}`} />
                          <span className="truncate">{item.key}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <h2 className="text-lg font-semibold text-slate-100">Recent Passwords Added</h2>
                <p className="mt-1 text-sm text-zinc-400">Latest entries based on most recent vault update.</p>

                <div className="mt-4 space-y-3">
                  {recentItems.length === 0 ? (
                    <p className="text-sm text-zinc-500">No passwords added yet.</p>
                  ) : (
                    recentItems.map((item) => {
                      const normalizedUrl = getNormalizedUrl(item.url);
                      const passwordStrengthBorder = getPasswordStrengthBorder(item.password || '');

                      return (
                      <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                          {normalizedUrl ? (
                            <a
                              href={normalizedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex min-w-0 items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer"
                              title={`Open ${item.siteName}`}
                            >
                              <div className="h-9 w-9 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                                <Favicon url={item.url} alt={`${item.siteName} icon`} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-200 underline-offset-2 hover:underline">{item.siteName}</p>
                                <p className="truncate text-xs text-zinc-400">{item.username}</p>
                              </div>
                            </a>
                          ) : (
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="h-9 w-9 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                                <Favicon url={item.url} alt={`${item.siteName} icon`} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-200">{item.siteName}</p>
                                <p className="truncate text-xs text-zinc-400">{item.username}</p>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleRecentTogglePassword(item.id)}
                              className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-slate-200 cursor-pointer"
                              title={recentVisiblePasswords[item.id] ? 'Hide password' : 'Show password'}
                            >
                              {recentVisiblePasswords[item.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => void handleRecentCopyPassword(item.id, item.password)}
                              className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-slate-200 cursor-pointer"
                              title="Copy password"
                            >
                              {recentCopiedPasswords[item.id] ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div className={`mt-3 rounded-lg border border-zinc-800 border-b-2 ${passwordStrengthBorder} bg-zinc-900/70 px-3 py-2`}>
                          <p className="font-mono text-xs text-slate-200">
                            {recentVisiblePasswords[item.id] ? (item.password || '-') : '••••••••••••'}
                          </p>
                        </div>

                        <p className="mt-2 text-[11px] text-zinc-500">{formatRecentTime(item.updatedAt)}</p>
                      </div>
                    );
                  })
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex-1 w-full bg-zinc-950/50 rounded-2xl">
        {loading ? (
          <div className="flex justify-center items-center h-64">
             <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8"
          >
            <AnimatePresence>
              {sortedItems.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full text-center py-20 text-zinc-500"
                >
                  {search ? 'No matches found.' : 'Your vault is empty. Add a new password!'}
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
