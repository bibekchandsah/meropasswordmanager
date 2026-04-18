import { VaultItem } from '@/types/vault';

export type ImportTargetField = 'siteName' | 'username' | 'password' | 'url' | 'notes' | 'favorite';

export type CsvParseResult = {
  headers: string[];
  rows: string[][];
};

const COLUMN_ALIASES: Record<ImportTargetField, string[]> = {
  siteName: ['site', 'site_name', 'site name', 'app', 'application', 'service', 'title', 'name', 'website', 'domain'],
  username: ['username', 'user', 'email', 'login', 'account', 'userid', 'user id', 'id'],
  password: ['password', 'pass', 'pwd', 'secret', 'passcode'],
  url: ['url', 'link', 'website', 'website_url', 'site_url', 'domain', 'homepage'],
  notes: ['notes', 'note', 'comment', 'comments', 'remark', 'remarks', 'description', 'memo'],
  favorite: ['favorite', 'favourite', 'star', 'starred', 'is_favorite', 'is favourite']
};

const normalizeHeader = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const parseBoolean = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'starred', 'favorite', 'favourite'].includes(normalized);
};

export const parseCsv = (text: string): CsvParseResult => {
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }

      currentRow.push(currentField);
      currentField = '';

      const hasMeaningfulValues = currentRow.some((value) => value.trim().length > 0);
      if (hasMeaningfulValues) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  const hasTrailingValues = currentRow.some((value) => value.trim().length > 0);
  if (hasTrailingValues) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headers, ...dataRows] = rows;
  return {
    headers: headers.map((header) => header.trim()),
    rows: dataRows
  };
};

const escapeCell = (value: string): string => {
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const vaultItemsToCsv = (items: VaultItem[]): string => {
  const headers = ['siteName', 'username', 'password', 'url', 'notes', 'favorite', 'createdAt', 'updatedAt'];

  const csvRows = items.map((item) => {
    const row = [
      item.siteName ?? '',
      item.username ?? '',
      item.password ?? '',
      item.url ?? '',
      item.notes ?? '',
      item.favorite ? 'true' : 'false',
      item.createdAt ? String(item.createdAt) : '',
      item.updatedAt ? String(item.updatedAt) : ''
    ];

    return row.map((cell) => escapeCell(cell)).join(',');
  });

  return [headers.join(','), ...csvRows].join('\n');
};

const scoreHeaderMatch = (header: string, target: ImportTargetField): number => {
  const normalized = normalizeHeader(header);
  const targetNormalized = normalizeHeader(target);

  if (normalized === targetNormalized) return 100;
  if (normalized.replace(/ /g, '') === targetNormalized.replace(/ /g, '')) return 95;

  const aliases = COLUMN_ALIASES[target];
  if (aliases.includes(normalized)) return 90;

  for (const alias of aliases) {
    if (normalized.includes(alias) || alias.includes(normalized)) return 70;
  }

  return 0;
};

export const suggestColumnMapping = (headers: string[]): Record<ImportTargetField, string | null> => {
  const mapping: Record<ImportTargetField, string | null> = {
    siteName: null,
    username: null,
    password: null,
    url: null,
    notes: null,
    favorite: null
  };

  const usedHeaders = new Set<string>();

  (Object.keys(mapping) as ImportTargetField[]).forEach((target) => {
    let bestHeader: string | null = null;
    let bestScore = 0;

    headers.forEach((header) => {
      if (usedHeaders.has(header)) return;
      const score = scoreHeaderMatch(header, target);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    });

    if (bestHeader && bestScore >= 70) {
      mapping[target] = bestHeader;
      usedHeaders.add(bestHeader);
    }
  });

  return mapping;
};

export const mapCsvRowsToVaultItems = (
  rows: string[][],
  headers: string[],
  mapping: Record<ImportTargetField, string | null>
): { items: Omit<VaultItem, 'id'>[]; skippedRows: number } => {
  const getIndexForTarget = (target: ImportTargetField): number => {
    const header = mapping[target];
    if (!header) return -1;
    return headers.indexOf(header);
  };

  const idxSite = getIndexForTarget('siteName');
  const idxUser = getIndexForTarget('username');
  const idxPass = getIndexForTarget('password');
  const idxUrl = getIndexForTarget('url');
  const idxNotes = getIndexForTarget('notes');
  const idxFavorite = getIndexForTarget('favorite');

  const now = Date.now();
  const items: Omit<VaultItem, 'id'>[] = [];
  let skippedRows = 0;

  rows.forEach((row) => {
    const siteName = idxSite >= 0 ? (row[idxSite] ?? '').trim() : '';
    const username = idxUser >= 0 ? (row[idxUser] ?? '').trim() : '';
    const password = idxPass >= 0 ? (row[idxPass] ?? '').trim() : '';

    if (!siteName || !username || !password) {
      skippedRows += 1;
      return;
    }

    const urlValue = idxUrl >= 0 ? (row[idxUrl] ?? '').trim() : '';
    const notesValue = idxNotes >= 0 ? (row[idxNotes] ?? '').trim() : '';
    const favoriteValue = idxFavorite >= 0 ? (row[idxFavorite] ?? '').trim() : '';

    items.push({
      siteName,
      username,
      password,
      url: urlValue || undefined,
      notes: notesValue || undefined,
      favorite: parseBoolean(favoriteValue),
      createdAt: now,
      updatedAt: now
    });
  });

  return { items, skippedRows };
};
