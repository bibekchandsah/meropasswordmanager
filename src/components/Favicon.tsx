'use client';

import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';

interface FaviconProps {
  url?: string;
  alt: string;
}

interface CacheEntry {
  iconUrl: string | null;
  timestamp: number;
}

type FaviconCache = Record<string, CacheEntry>;

const CACHE_KEY = 'favicon_cache_v2';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

const getCacheMap = (): FaviconCache => {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setCacheMap = (cache: FaviconCache) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
};

const getCachedFaviconUrl = (url: string): string | null | undefined => {
  const cache = getCacheMap();
  const entry = cache[url];
  if (!entry) return undefined;

  const isExpired = Date.now() - entry.timestamp > CACHE_DURATION;
  if (isExpired) return undefined;

  return entry.iconUrl;
};

const setCachedFaviconUrl = (url: string, iconUrl: string | null) => {
  const cache = getCacheMap();
  cache[url] = {
    iconUrl,
    timestamp: Date.now(),
  };
  setCacheMap(cache);
};

const normalizeUrl = (value?: string): string | null => {
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

const getCandidates = (value?: string): string[] => {
  const normalized = normalizeUrl(value);
  if (!normalized) return [];
  const parsed = new URL(normalized);
  const host = parsed.hostname;
  const origin = parsed.origin;
  const fullNoTrailingSlash = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  const pathNoTrailingSlash = parsed.pathname.endsWith('/')
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname;

  const pathCandidates = pathNoTrailingSlash
    ? [
        `${origin}${pathNoTrailingSlash}/favicon.ico`,
        `${origin}${pathNoTrailingSlash}/favicon.png`,
        `${origin}${pathNoTrailingSlash}/apple-touch-icon.png`
      ]
    : [];

  const githubPageOwner = host.endsWith('.github.io') ? host.split('.')[0] : '';
  const githubRepo = pathNoTrailingSlash ? pathNoTrailingSlash.split('/').filter(Boolean)[0] ?? '' : '';

  const githubCandidates = githubPageOwner
    ? [
        ...(githubRepo
          ? [
              `https://raw.githubusercontent.com/${githubPageOwner}/${githubRepo}/refs/heads/main/favicon.ico`,
              `https://raw.githubusercontent.com/${githubPageOwner}/${githubRepo}/refs/heads/main/favicon.png`,
              `https://raw.githubusercontent.com/${githubPageOwner}/${githubRepo}/refs/heads/master/favicon.ico`,
              `https://raw.githubusercontent.com/${githubPageOwner}/${githubRepo}/refs/heads/master/favicon.png`
            ]
          : []),
        `https://github.com/${githubPageOwner}.png`,
        `https://avatars.githubusercontent.com/${githubPageOwner}`
      ]
    : [];

  const candidates = [
    `${fullNoTrailingSlash}/favicon.ico`,
    `${fullNoTrailingSlash}/favicon.png`,
    `${fullNoTrailingSlash}/apple-touch-icon.png`,
    ...pathCandidates,
    `${origin}/favicon.ico`,
    `${origin}/favicon.png`,
    `${origin}/apple-touch-icon.png`,
    `https://icon.horse/icon/${host}`,
    `https://unavatar.io/${host}?fallback=false`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(normalized)}`,
    ...githubCandidates
  ];

  return Array.from(new Set(candidates));
};

export default function Favicon({ url, alt }: FaviconProps) {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const normalized = normalizeUrl(url);
      const localCandidates = getCandidates(url);

      if (!normalized) {
        setCandidates(localCandidates);
        setIndex(0);
        return;
      }

      // Check cache first
      const cached = getCachedFaviconUrl(normalized);
      if (cached !== undefined) {
        if (!cancelled) {
          if (cached) {
            setCandidates([cached, ...localCandidates]);
          } else {
            setCandidates(localCandidates);
          }
          setIndex(0);
        }
        return;
      }

      try {
        const response = await fetch(`/api/favicon?url=${encodeURIComponent(normalized)}`);
        const data = (await response.json()) as { iconUrl?: string | null };
        const resolved = data?.iconUrl ?? null;

        if (!cancelled) {
          setCachedFaviconUrl(normalized, resolved);
          if (resolved) {
            setCandidates([resolved, ...localCandidates]);
          } else {
            setCandidates(localCandidates);
          }
        }
      } catch {
        if (!cancelled) {
          setCachedFaviconUrl(normalized, null);
          setCandidates(localCandidates);
        }
      }

      if (!cancelled) {
        setIndex(0);
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleError = () => {
    setIndex((prev) => prev + 1);
  };

  const src = candidates[index];

  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800">
        <Globe className="w-5 h-5 text-zinc-500" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={handleError}
    />
  );
}
