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
  viewMode?: 'grid' | 'list';
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

export default function VaultItemCard({ item, onEdit, onDelete, onToggleFavorite, viewMode = 'grid' }: VaultItemCardProps) {
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

  const capitalizedSiteName = item.siteName 
    ? item.siteName.charAt(0).toUpperCase() + item.siteName.slice(1) 
    : "";

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
      style={
        viewMode === 'grid'
          ? { borderBottomColor: strength.bottomColor, borderBottomWidth: '4px', '--strength-color': strength.bottomColor } as any
          : { borderLeftColor: strength.bottomColor, borderLeftWidth: '4px', '--strength-color': strength.bottomColor } as any
      }
      className={`group relative transition-all duration-200 border border-zinc-800 bg-zinc-900 shadow-sm hover:border-zinc-700 hover:shadow-lg hover:shadow-black/20 strength-indicator ${
        showMenu ? "z-50" : "z-0"
      } ${
        viewMode === 'grid' 
          ? "flex flex-col rounded-2xl p-5 h-full" 
          : "grid grid-cols-[minmax(0,1fr)_44px] sm:grid-cols-[minmax(0,1fr)_180px_44px] md:grid-cols-[minmax(0,1fr)_200px_90px_44px] lg:grid-cols-[minmax(0,1fr)_220px_100px_44px] items-center gap-2 sm:gap-4 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5"
      }`}
      onMouseLeave={() => setShowMenu(false)}
    >

      {/* Header/Main Info Section */}
      <div className={`flex items-center gap-3 min-w-0 ${viewMode === 'grid' ? "mb-4 justify-between w-full" : "flex-1"}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className={`${viewMode === 'grid' ? "w-10 h-10" : "w-8 h-8"} transition-all rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden`}>
              <Favicon url={item.url} alt={`${item.siteName} icon`} />
            </div>
            {item.favorite && (
              <div className={`absolute -top-1 -right-1 rounded-full bg-yellow-500 flex items-center justify-center ${viewMode === 'grid' ? "w-4 h-4" : "w-3 h-3"}`}>
                <Star className={`${viewMode === 'grid' ? "w-2.5 h-2.5" : "w-2 h-2"} fill-zinc-950 text-zinc-950`} />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className={`flex items-baseline gap-x-2 ${viewMode === 'grid' ? "flex-col" : "flex-col sm:flex-row sm:items-baseline"}`}>
              {normalizedUrl ? (
                <a
                  href={normalizedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link flex items-center gap-1"
                  title={`Open ${capitalizedSiteName}`}
                >
                  <span className={`font-semibold text-slate-100 truncate group-hover/link:text-emerald-400 transition-colors ${viewMode === 'grid' ? "max-w-[160px] text-sm" : "max-w-[120px] sm:max-w-[160px] md:max-w-[200px] text-xs"}`}>
                    {capitalizedSiteName}
                  </span>
                  <ExternalLink className="w-3 h-3 text-zinc-600 group-hover/link:text-emerald-400 transition-colors flex-shrink-0" />
                </a>
              ) : (
                <p className={`font-semibold text-slate-100 truncate ${viewMode === 'grid' ? "max-w-[160px] text-sm" : "max-w-[120px] sm:max-w-[160px] md:max-w-[200px] text-xs"}`}>{capitalizedSiteName}</p>
              )}
              <p className={`text-zinc-500 truncate transition-all ${viewMode === 'grid' ? "text-xs mt-0.5 max-w-[160px]" : "text-[10px] sm:text-[11px] max-w-[100px] sm:max-w-[120px]"}`}>
                {viewMode === 'list' && <span className="hidden sm:inline text-zinc-700 mr-1.5">•</span>}
                {item.username}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons in Grid Mode or Hidden in List Mode (moved to end) */}
        {viewMode === 'grid' && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer ${isTouchDevice ? 'touch-manipulation' : ''}`}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Context menu reuse */}
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.1 }}
                  className="absolute right-0 top-8 w-48 bg-zinc-950 rounded-xl shadow-2xl z-20 border border-zinc-800 overflow-hidden"
                >
                  <div className="py-1.5">
                    <div className="sm:hidden">
                      <button
                        onClick={() => { handleCopy(item.password); setShowMenu(false); }}
                        className="dropdown-item w-full text-left px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                      >
                        <Copy className="w-4 h-4 text-emerald-400" /> Copy Password
                      </button>
                      <div className="h-px bg-zinc-800 my-1" />
                    </div>

                    <button
                      onClick={() => { onToggleFavorite(); setShowMenu(false); }}
                      className="dropdown-item w-full text-left px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      {item.favorite
                        ? <><StarOff className="w-4 h-4 text-yellow-400" /> Remove Favorite</>
                        : <><Star className="w-4 h-4 text-yellow-400" /> Add Favorite</>}
                    </button>
                    <div className="h-px bg-zinc-800 my-1" />
                    <button
                      onClick={() => { onEdit(); setShowMenu(false); }}
                      className="dropdown-item w-full text-left px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-blue-400" /> Edit
                    </button>
                    <div className="h-px bg-zinc-800 my-1" />
                    <button
                      onClick={() => { onDelete(); setShowMenu(false); }}
                      className="dropdown-item-danger w-full text-left px-3 py-2.5 text-sm text-red-500 flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Center/End Content: Password Row */}
      <div className={`flex items-center gap-1.5 rounded-xl bg-zinc-950 border border-zinc-800 transition-all ${
        viewMode === 'grid' ? "px-3 py-2 mt-auto" : "px-2 py-1 hidden sm:flex"
      }`}>
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

      {/* Right Section in List Mode: Strength + Menu */}
      {viewMode === 'list' && (
        <>
          <div className="hidden md:flex items-center justify-center">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${strength.bottomColor}18`, color: strength.bottomColor }}
            >
              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: strength.bottomColor }} />
              {strength.label}
            </span>
          </div>

          <div className="relative flex justify-end">
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
                  className="absolute right-0 top-8 w-48 bg-zinc-950 rounded-xl shadow-2xl z-20 border border-zinc-800 overflow-hidden"
                >
                  <div className="py-1.5">
                    <div className="sm:hidden">
                      <button
                        onClick={() => { handleCopy(item.password); setShowMenu(false); }}
                        className="dropdown-item w-full text-left px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                      >
                        <Copy className="w-4 h-4 text-emerald-400" /> Copy Password
                      </button>
                      <div className="h-px bg-zinc-800 my-1" />
                    </div>

                    <button
                      onClick={() => { onToggleFavorite(); setShowMenu(false); }}
                      className="dropdown-item w-full text-left px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      {item.favorite
                        ? <><StarOff className="w-4 h-4 text-yellow-400" /> Remove Favorite</>
                        : <><Star className="w-4 h-4 text-yellow-400" /> Add Favorite</>}
                    </button>
                    <div className="h-px bg-zinc-800 my-1" />
                    <button
                      onClick={() => { onEdit(); setShowMenu(false); }}
                      className="dropdown-item w-full text-left px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-blue-400" /> Edit
                    </button>
                    <div className="h-px bg-zinc-800 my-1" />
                    <button
                      onClick={() => { onDelete(); setShowMenu(false); }}
                      className="dropdown-item-danger w-full text-left px-3 py-2.5 text-sm text-red-500 flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Footer in Grid Mode */}
      {viewMode === 'grid' && (
        <div className="flex items-center justify-between mt-3 mb-1">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${strength.bottomColor}18`, color: strength.bottomColor }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: strength.bottomColor }} />
            {strength.label}
          </span>
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
      )}
    </motion.div>
  );
}
