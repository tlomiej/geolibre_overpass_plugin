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