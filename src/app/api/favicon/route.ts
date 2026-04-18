import { NextRequest, NextResponse } from 'next/server';

const ICON_LINK_REGEX = /<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
const MANIFEST_LINK_REGEX = /<link[^>]*rel=["'][^"']*manifest[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i;
const MANIFEST_ICON_REGEX = /"icons"\s*:\s*\[(.*?)\]/is;
const ICON_SRC_REGEX = /"src"\s*:\s*"([^"]+)"/gi;

const normalizeTargetUrl = (value: string | null): URL | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const firstResolvedIconFromHtml = (html: string, baseUrl: URL): string | null => {
  let match: RegExpExecArray | null;
  while ((match = ICON_LINK_REGEX.exec(html)) !== null) {
    const href = match[1]?.trim();
    if (!href) continue;
    if (href.startsWith('data:')) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
};

const firstResolvedIconFromManifest = (manifestText: string, manifestUrl: URL): string | null => {
  const iconBlock = MANIFEST_ICON_REGEX.exec(manifestText);
  if (!iconBlock?.[1]) return null;

  let iconMatch: RegExpExecArray | null;
  while ((iconMatch = ICON_SRC_REGEX.exec(iconBlock[1])) !== null) {
    const src = iconMatch[1]?.trim();
    if (!src) continue;
    try {
      return new URL(src, manifestUrl).toString();
    } catch {
      continue;
    }
  }

  return null;
};

export async function GET(request: NextRequest) {
  const target = normalizeTargetUrl(request.nextUrl.searchParams.get('url'));
  if (!target) {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
  }

  try {
    const pageResponse = await fetch(target.toString(), {
      headers: {
        'user-agent': 'meropasswordmanager-Favicon-Resolver/1.0'
      },
      cache: 'no-store'
    });

    if (!pageResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch target page' }, { status: 404 });
    }

    const html = await pageResponse.text();

    const directIcon = firstResolvedIconFromHtml(html, target);
    if (directIcon) {
      return NextResponse.json({ iconUrl: directIcon });
    }

    const manifestMatch = MANIFEST_LINK_REGEX.exec(html);
    const manifestHref = manifestMatch?.[1]?.trim();
    if (manifestHref) {
      try {
        const manifestUrl = new URL(manifestHref, target);
        const manifestResponse = await fetch(manifestUrl.toString(), {
          headers: {
            'user-agent': 'meropasswordmanager-Favicon-Resolver/1.0'
          },
          cache: 'no-store'
        });

        if (manifestResponse.ok) {
          const manifestText = await manifestResponse.text();
          const manifestIcon = firstResolvedIconFromManifest(manifestText, manifestUrl);
          if (manifestIcon) {
            return NextResponse.json({ iconUrl: manifestIcon });
          }
        }
      } catch {
        // Ignore manifest parse failures and continue fallback.
      }
    }

    return NextResponse.json({ iconUrl: null }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Resolver request failed' }, { status: 502 });
  }
}
