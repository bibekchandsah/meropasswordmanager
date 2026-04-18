import { NextRequest, NextResponse } from 'next/server';

const normalizeTargetUrl = (value: string | null): URL | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
};

/** Check if a URL returns a valid image response (server-side HEAD probe). */
const probeImageUrl = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MeroPasswordManager/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    // Accept image/* or application/octet-stream (some servers serve .ico with this type)
    return ct.startsWith('image/') || ct === 'application/octet-stream';
  } catch {
    return false;
  }
};

export async function GET(request: NextRequest) {
  const target = normalizeTargetUrl(request.nextUrl.searchParams.get('url'));
  if (!target) {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
  }

  const host = target.hostname;
  const origin = target.origin;
  const encoded = encodeURIComponent(target.toString());

  // Probe in order of reliability. We do HEAD requests server-side to avoid
  // CORS issues on the client. HTML scraping was removed because it fails for
  // SPAs (GitHub Pages, Netlify, Vercel, Render) that render icons via JS.
  const probes: string[] = [
    `https://www.google.com/s2/favicons?sz=64&domain_url=${encoded}`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://icon.horse/icon/${host}`,
    `${origin}/favicon.ico`,
    `${origin}/favicon.png`,
  ];

  for (const url of probes) {
    const ok = await probeImageUrl(url);
    if (ok) {
      return NextResponse.json(
        { iconUrl: url },
        {
          headers: {
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          },
        }
      );
    }
  }

  return NextResponse.json({ iconUrl: null }, { status: 404 });
}
