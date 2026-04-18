'use client';

import { useEffect, useState } from 'react';
import { VaultItem } from '@/types/vault';
import { Copy, Check, MoreVertical, Edit2, Trash2, EyeOff, Eye, Star, StarOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Favicon from './Favicon';

interface VaultItemCardProps {
  item: VaultItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

export default function VaultItemCard({ item, onEdit, onDelete, onToggleFavorite }: VaultItemCardProps) {
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const getPasswordStrengthBorder = (value: string) => {
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    if (score <= 1) return 'border-b-red-500';
    if (score === 2) return 'border-b-yellow-400';
    if (score === 3) return 'border-b-blue-500';
    return 'border-b-green-500';
  };

  const passwordStrengthBorder = getPasswordStrengthBorder(item.password || '');

  const normalizedUrl = (() => {
    if (!item.url) return null;
    const trimmed = item.url.trim();
    if (!trimmed) return null;
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      return new URL(withProtocol).toString();
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    const updatePointerType = (pointerType: string) => {
      setIsTouchDevice(pointerType === 'touch');
    };

    const handlePointerDown = (event: PointerEvent) => {
      updatePointerType(event.pointerType);
    };

    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches);
    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      // Auto-clear clipboard after 30 seconds for security
      setTimeout(async () => {
        const current = await navigator.clipboard.readText();
        if (current === text) {
          navigator.clipboard.writeText('');
        }
      }, 30000);
    }, 2000);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg relative group transition-all hover:border-emerald-500/50"
      onMouseLeave={() => setShowMenu(false)}
    >
      <div className="flex justify-between items-start mb-4">
        {normalizedUrl ? (
          <a
            href={normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity cursor-pointer"
            title={`Open ${item.siteName}`}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 overflow-hidden">
              <Favicon url={item.url} alt={`${item.siteName} icon`} />
            </div>
            <div>
              <h3 className="font-bold text-slate-200 text-lg truncate w-40 sm:w-48 underline-offset-2 hover:underline">{item.siteName}</h3>
              <p className="text-zinc-500 text-xs truncate w-40 sm:w-48">{item.username}</p>
            </div>
          </a>
        ) : (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 overflow-hidden">
              <Favicon url={item.url} alt={`${item.siteName} icon`} />
            </div>
            <div>
              <h3 className="font-bold text-slate-200 text-lg truncate w-40 sm:w-48">{item.siteName}</h3>
              <p className="text-zinc-500 text-xs truncate w-40 sm:w-48">{item.username}</p>
            </div>
          </div>
        )}

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={`relative z-10 text-zinc-500 hover:text-emerald-400 opacity-100 transition-colors p-1 rounded-md hover:bg-zinc-800 cursor-pointer ${isTouchDevice ? 'touch-manipulation' : ''}`}
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute right-0 top-8 w-40 bg-zinc-800 rounded-xl shadow-xl z-10 border border-zinc-700 overflow-hidden"
              >
                <button
                  onClick={() => {
                    onToggleFavorite();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 cursor-pointer"
                >
                  {item.favorite ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />} 
                  {item.favorite ? 'Unmark Favorite' : 'Mark Favorite'}
                </button>
                <div className="h-px bg-zinc-700 w-full" />
                <button
                  onClick={() => {
                    onEdit();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" /> Edit
                </button>
                <div className="h-px bg-zinc-700 w-full" />
                <button
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-700 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {item.favorite ? (
        <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-400">
          <Star className="w-3.5 h-3.5 fill-current" /> Favorite
        </div>
      ) : null}

      <div className={`flex items-center gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800 border-b-2 ${passwordStrengthBorder} group-hover:border-zinc-700 transition-colors`}>
        <div className="flex-1 text-sm font-mono text-zinc-300 overflow-hidden overflow-ellipsis px-2 h-6 flex items-center">
          {showPassword ? item.password : '****************'}
        </div>

        <button
          onClick={() => setShowPassword(!showPassword)}
          className="text-zinc-500 hover:text-emerald-400 transition-colors p-1 cursor-pointer"
          title={showPassword ? 'Hide Password' : 'Show Password'}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        <button
          onClick={() => handleCopy(item.password)}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${copied ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-700'}`}
          title="Copy to clipboard"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </motion.div>
  );
}
