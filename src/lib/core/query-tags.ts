export interface OverpassTagFilter {
  key: string;
  value: string;
  label: string;
}

export function applyQueryTimeout(query: string, timeoutSeconds: number): string {
  const timeoutDirective = `[timeout:${timeoutSeconds}];`;
  if (/\[timeout:\s*\d+\s*\]\s*;?/i.test(query)) {
    return query.replace(/\[timeout:\s*\d+\s*\]\s*;?/i, timeoutDirective);
  }
  return `${timeoutDirective}\n${query}`;
}

export function applyTagFilters(query: string, tags: OverpassTagFilter[]): string {
  if (tags.length === 0) return query;

  const selectors = tags
    .map(({ key, value }) =>
      key === 'nwr' && value === '*'
        ? 'nwr;'
        : value === '*'
        ? `nwr[${JSON.stringify(key)}];`
        : `nwr[${JSON.stringify(key)}=${JSON.stringify(value)}];`,
    )
    .join('\n  ');
  if (tags.some(({ key, value }) => key === 'nwr' && value === '*')) {
    return query.replace(/\bnwr\s*;/g, 'nwr;');
  }
  return query.replace(/\bnwr\s*;/g, selectors);
}

export interface ParsedPickerQuery {
  tags: OverpassTagFilter[];
  timeoutSeconds: number;
  uniqueById: boolean;
}

const UNIQUE_BY_ID_DIRECTIVE = /^\s*\/\/\s*GeoLibre:\s*unique-by-id=(true|false)\s*$/im;
const TIMEOUT_DIRECTIVE = /^\s*\[timeout:\s*(\d+)\s*\]\s*;?/i;

export function buildPickerQuery(
  tags: OverpassTagFilter[],
  timeoutSeconds: number,
): string {
  const body = applyTagFilters('(\n  nwr;\n);', tags);
  return `[timeout:${timeoutSeconds}];\n${body}\nout body geom;`;
}

export function queryForApi(query: string): string {
  return query.replace(UNIQUE_BY_ID_DIRECTIVE, '').trim();
}

export function parsePickerQuery(query: string, uniqueByIdDefault = true): ParsedPickerQuery | null {
  let source = query.trim();
  let uniqueById = uniqueByIdDefault;
  const uniqueDirective = source.match(UNIQUE_BY_ID_DIRECTIVE);
  if (uniqueDirective) {
    uniqueById = uniqueDirective[1].toLowerCase() === 'true';
    source = source.replace(UNIQUE_BY_ID_DIRECTIVE, '').trim();
  }

  let timeoutSeconds = 25;
  const timeoutDirective = source.match(TIMEOUT_DIRECTIVE);
  if (timeoutDirective) {
    timeoutSeconds = Number(timeoutDirective[1]);
    if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1) return null;
    source = source.replace(TIMEOUT_DIRECTIVE, '').trim();
  }

  source = source.replace(/^\[out:json\]\s*/i, '').trim();
  source = source.replace(/\s*out\s+(?:body\s+)?geom(?:\s+tags)?\s*;\s*$/i, '').trim();
  const groupMatch = source.match(/^\(\s*([\s\S]*?)\s*\)\s*;?$/);
  if (!groupMatch) return null;

  const selectors = groupMatch[1].split(';').map((selector) => selector.trim()).filter(Boolean);
  if (selectors.length === 0) return null;

  const tags: OverpassTagFilter[] = [];
  for (const selector of selectors) {
    if (/^nwr$/i.test(selector)) {
      tags.push({ key: 'nwr', value: '*', label: 'All map objects (nwr)' });
      continue;
    }

    const match = selector.match(/^nwr\s*\[\s*("(?:\\.|[^"\\])*")\s*(?:=\s*("(?:\\.|[^"\\])*"))?\s*\]$/i);
    if (!match) return null;

    try {
      const key = JSON.parse(match[1]) as string;
      const value = match[2] ? JSON.parse(match[2]) as string : '*';
      tags.push({ key, value, label: value === '*' ? key : `${key}=${value}` });
    } catch {
      return null;
    }
  }

  if (tags.some(({ key, value }) => key === 'nwr' && value === '*') && tags.length > 1) {
    return null;
  }
  return { tags, timeoutSeconds, uniqueById };
}