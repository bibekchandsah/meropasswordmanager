'use client';

import { useEffect, useState } from 'react';
import { VaultItem } from '@/types/vault';
import { Copy, Check, MoreVertical, Edit2, Trash2, EyeOff, Eye, Star, StarOff, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Favicon from './Favicon';

interface VaultItemCardProps {
  item: VaultItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

function getStrengthMeta(password: string): { score: number; label: string; color: string; bg: string; bar: string; bottomColor: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak',     color: 'text-red-400',    bg: 'bg-red-500/10',    bar: 'bg-red-500',    bottomColor: '#ef4444' };
  if (score === 2) return { score, label: 'Fair',     color: 'text-yellow-400', bg: 'bg-yellow-500/10', bar: 'bg-yellow-400', bottomColor: '#facc15' };
  if (score === 3) return { score, label: 'Good',     color: 'text-blue-400',   bg: 'bg-blue-500/10',   bar: 'bg-blue-500',   bottomColor: '#3b82f6' };
  if (score === 4) return { score, label: 'Strong',   color: 'text-emerald-400',bg: 'bg-emerald-500/10',bar: 'bg-emerald-500',bottomColor: '#10b981' };
  return              { score, label: 'Excellent', color: 'text-emerald-300', bg: 'bg-emerald-500/15',bar: 'bg-emerald-400',bottomColor: '#34d399' };
}

export default function VaultItemCard({ item, onEdit, onDelete, onToggleFavorite }: VaultItemCardProps) {
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const strength = getStrengthMeta(item.password || '');

  const normalizedUrl = (() => {
    if (!item.url) return null;
    const trimmed = item.url.trim();
    if (!trimmed) return null;
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try { return new URL(withProtocol).toString(); } catch { return null; }
  })();

  useEffect(() => {
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches);
    const handler = (e: PointerEvent) => setIsTouchDevice(e.pointerType === 'touch');
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setTimeout(async () => {
        const current = await navigator.clipboard.readText();
        if (current === text) navigator.clipboard.writeText('');
      }, 30000);
    }, 2000);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      className="group relative flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm transition-all duration-200 hover:border-zinc-700 hover:shadow-lg hover:shadow-black/20 overflow-hidden"
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Solid bottom border — color reflects password strength, inline style avoids Tailwind JIT purging */}
      <div
        className="absolute inset-x-0 bottom-0 h-[3px] rounded-b-2xl"
        style={{ backgroundColor: strength.bottomColor }}
      />

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
              <Favicon url={item.url} alt={`${item.siteName} icon`} />
            </div>
            {item.favorite && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center">
                <Star className="w-2.5 h-2.5 fill-zinc-950 text-zinc-950" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            {normalizedUrl ? (
              <a
                href={normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link flex items-center gap-1"
                title={`Open ${item.siteName}`}
              >
                <span className="font-semibold text-slate-100 text-sm truncate max-w-[160px] group-hover/link:text-emerald-400 transition-colors">
                  {item.siteName}
                </span>
                <ExternalLink className="w-3 h-3 text-zinc-600 group-hover/link:text-emerald-400 transition-colors flex-shrink-0" />
              </a>
            ) : (
              <p className="font-semibold text-slate-100 text-sm truncate max-w-[160px]">{item.siteName}</p>
            )}
            <p className="text-zinc-500 text-xs truncate max-w-[160px] mt-0.5">{item.username}</p>
          </div>
        </div>

        {/* Context menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={`p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer ${isTouchDevice ? 'touch-manipulation' : ''}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-8 w-44 bg-zinc-950 rounded-xl shadow-2xl z-20 border border-zinc-800 overflow-hidden"
              >
                <button
                  onClick={() => { onToggleFavorite(); setShowMenu(false); }}
                  className="dropdown-item w-full text-left px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  {item.favorite
                    ? <><StarOff className="w-4 h-4 text-yellow-400" /> Remove Favorite</>
                    : <><Star className="w-4 h-4 text-yellow-400" /> Add Favorite</>}
                </button>
                <div className="h-px bg-zinc-800" />
                <button
                  onClick={() => { onEdit(); setShowMenu(false); }}
                  className="dropdown-item w-full text-left px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Edit2 className="w-4 h-4 text-blue-400" /> Edit
                </button>
                <div className="h-px bg-zinc-800" />
                <button
                  onClick={() => { onDelete(); setShowMenu(false); }}
                  className="dropdown-item-danger w-full text-left px-3 py-2.5 text-sm text-red-400 flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Password row */}
      <div className="flex items-center gap-1.5 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 mt-auto">
        <p className="flex-1 font-mono text-xs text-zinc-300 truncate select-none">
          {showPassword ? (item.password || '—') : '••••••••••••••'}
        </p>
        <button
          onClick={() => setShowPassword(!showPassword)}
          className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer flex-shrink-0"
          title={showPassword ? 'Hide' : 'Show'}
        >
          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => handleCopy(item.password)}
          className={`p-1.5 rounded-lg transition-all cursor-pointer flex-shrink-0 ${
            copied
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
          }`}
          title="Copy password"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Strength badge */}
      <div className="flex items-center justify-between mt-3 mb-1">
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${strength.bottomColor}18`, color: strength.bottomColor }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: strength.bottomColor }} />
          {strength.label}
        </span>
        {/* Strength segments */}
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-1 w-4 rounded-full transition-colors"
              style={{ backgroundColor: i <= strength.score ? strength.bottomColor : '#27272a' }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
