'use client';

import { useState, useEffect } from 'react';
import { VaultItem } from '@/types/vault';
import { generatePassword, generateSmartSuggestions } from '@/lib/passwordGen';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCcw, Save, Loader2, Link2, KeyRound, Type, AlignLeft, Globe } from 'lucide-react';
import Favicon from './Favicon';

interface AddEditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<VaultItem, 'id'>) => Promise<void>;
  initialData?: VaultItem | null;
}

export default function AddEditItemModal({ isOpen, onClose, onSave, initialData }: AddEditItemModalProps) {
  const [siteName, setSiteName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const getPasswordStrength = (
    value: string
  ): { label: string; score: number; colorClass: string; borderClass: string; barClass: string } | null => {
    if (!value) return null;

    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    if (score <= 1) return { label: 'Weak',      score: 1, colorClass: 'text-red-400',    borderClass: 'border-b-red-500',     barClass: 'bg-red-500' };
    if (score === 2) return { label: 'Fair',      score: 2, colorClass: 'text-yellow-400', borderClass: 'border-b-yellow-400',  barClass: 'bg-yellow-400' };
    if (score === 3) return { label: 'Good',      score: 3, colorClass: 'text-blue-400',   borderClass: 'border-b-blue-500',    barClass: 'bg-blue-500' };
    if (score === 4) return { label: 'Strong',    score: 4, colorClass: 'text-emerald-400',borderClass: 'border-b-emerald-500', barClass: 'bg-emerald-500' };
    return              { label: 'Excellent', score: 5, colorClass: 'text-emerald-300', borderClass: 'border-b-emerald-400', barClass: 'bg-emerald-400' };
  };

  const passwordStrength = getPasswordStrength(password);

  useEffect(() => {
    if (initialData && isOpen) {
      setSiteName(initialData.siteName || '');
      setUsername(initialData.username || '');
      setPassword(initialData.password || '');
      setUrl(initialData.url || '');
      setNotes(initialData.notes || '');
    } else if (!isOpen) {
      // Reset form on close
      setSiteName('');
      setUsername('');
      setPassword('');
      setUrl('');
      setNotes('');
      setLoading(false);
      setSuggestions([]);
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName || !username || !password) return;
    
    setLoading(true);
    await onSave({
      siteName,
      username,
      password,
      url: url || undefined,
      notes: notes || undefined
    });
    setLoading(false);
  };

  const handleGenPwd = () => {
    if (password.trim().length > 0) {
      setSuggestions(generateSmartSuggestions(password));
    } else {
      setPassword(generatePassword(20, true, true));
      setSuggestions([]);
    }
  };

  const formatTimestamp = (value?: number) => {
    if (!value) return 'Not available';
    return new Date(value).toLocaleString();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-emerald-500/10 sm:max-h-[calc(100vh-2rem)]"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 p-4 sm:p-6">
              <h2 className="text-xl font-bold text-slate-100">
                {initialData ? 'Edit Password' : 'Add New Password'}
              </h2>
              <button 
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-2 hover:bg-zinc-800 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-400 mb-1 flex items-center gap-2">
                    <Type className="w-4 h-4" /> Site / App Name *
                  </label>
                  <input 
                    type="text" 
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    required
                    placeholder="e.g. Google, GitHub, Netflix"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-emerald-500 text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1 flex items-center gap-2">
                    <Link2 className="w-4 h-4" /> URL (Optional)
                  </label>
                  <div className="relative group">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none transition-all group-focus-within:scale-110">
                      <div className="w-6 h-6 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 flex items-center justify-center shadow-sm">
                        {url.trim() ? (
                          <Favicon url={url} alt={siteName || 'Site Preview'} />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-zinc-600" />
                        )}
                      </div>
                    </div>
                    <input 
                      type="url" 
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-amber-500 text-slate-200 outline-none transition-all focus:border-amber-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1 flex items-center gap-2">
                    <Type className="w-4 h-4" /> Username / Email *
                  </label>
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="user@example.com"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-emerald-500 text-slate-200 outline-none"
                  />
                </div>

                <div className="md:col-span-2 relative">
                  <label className="block text-sm font-medium text-zinc-400 mb-1 flex items-center gap-2">
                    <KeyRound className="w-4 h-4" /> Password *
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter or generate..."
                      className={`w-full bg-zinc-950 border border-zinc-800 border-b-2 rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-emerald-500 text-slate-200 outline-none font-mono ${passwordStrength?.borderClass ?? 'border-b-zinc-800'}`}
                    />
                    <button 
                      type="button"
                      onClick={handleGenPwd}
                      className="absolute right-2 top-[34px] px-3 py-1.5 text-xs bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500/20 transition-colors flex items-center gap-1 font-medium cursor-pointer"
                      title="Generate Secure Password"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                      Gen
                    </button>
                  </div>
                  {passwordStrength ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Strength</span>
                        <span className={`font-semibold ${passwordStrength.colorClass}`}>{passwordStrength.label}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-5 gap-1">
                        {[1, 2, 3, 4, 5].map((segment) => (
                          <div
                            key={segment}
                            className={`h-1.5 rounded-full ${segment <= passwordStrength.score ? passwordStrength.barClass : 'bg-zinc-800'}`}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Smart Suggestions */}
                  <AnimatePresence>
                    {suggestions.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 space-y-2 overflow-hidden"
                      >
                        <div className="flex items-center justify-between h-5">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Pick an Excellent upgrade</span>
                          <button 
                            type="button" 
                            onClick={() => setSuggestions([])}
                            className="text-[10px] text-zinc-500 hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {suggestions.map((s, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => { setPassword(s); setSuggestions([]); }}
                              className="flex items-center justify-between w-full bg-zinc-950/40 border border-zinc-800 p-3 rounded-xl hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] transition-all text-left group cursor-pointer"
                            >
                              <span className="text-xs font-mono text-zinc-400 group-hover:text-emerald-300 truncate pr-4">{s}</span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">EXCELLENT</span>
                                <div className="p-1 rounded-lg bg-zinc-800 text-zinc-500 group-hover:bg-emerald-500 group-hover:text-zinc-950 transition-colors">
                                  <Save className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-400 mb-1 flex items-center gap-2">
                    <AlignLeft className="w-4 h-4" /> Secure Notes (Optional)
                  </label>
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Enter any additional secure info..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-200 outline-none resize-none"
                  />

                  {initialData ? (
                    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400">
                      <p>
                        <span className="text-zinc-500">Created:</span>{' '}
                        <span className="text-zinc-300">{formatTimestamp(initialData.createdAt ?? initialData.updatedAt)}</span>
                      </p>
                      <p className="mt-1">
                        <span className="text-zinc-500">Last Modified:</span>{' '}
                        <span className="text-zinc-300">{formatTimestamp(initialData.updatedAt)}</span>
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4">
                <button 
                  type="button" 
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl font-semibold bg-emerald-500 hover:bg-emerald-600 text-zinc-950 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {initialData ? 'Update Vault' : 'Save to Vault'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
