'use client';

import { useEffect, useState } from 'react';
import { MoonStar, SunMedium } from 'lucide-react';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'meropasswordmanager-theme';

const getPreferredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';

  const currentTheme = document.documentElement.dataset.theme as ThemeMode | undefined;
  if (currentTheme === 'light' || currentTheme === 'dark') return currentTheme;

  const storedTheme = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export default function ThemeToggle({ className = '', iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>(() => getPreferredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-slate-200 transition hover:bg-zinc-800 hover:text-white cursor-pointer ${className}`}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        aria-pressed={theme === 'light'}
      >
        {theme === 'dark' ? <MoonStar className="h-4 w-4 text-indigo-300" /> : <SunMedium className="h-4 w-4 text-amber-400" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-zinc-800 hover:text-white cursor-pointer ${className}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      aria-pressed={theme === 'light'}
    >
      <span className="inline-flex items-center gap-2">
        {theme === 'dark' ? <MoonStar className="h-4 w-4 text-indigo-300" /> : <SunMedium className="h-4 w-4 text-amber-400" />}
        <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
      </span>

      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${theme === 'dark' ? 'bg-zinc-700' : 'bg-emerald-500/80'}`}
        aria-hidden="true"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${theme === 'dark' ? 'translate-x-0.5' : 'translate-x-5'}`}
        />
      </span>
    </button>
  );
}