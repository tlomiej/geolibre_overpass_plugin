export interface OverpassTagFilter {
  key: string;
  value: string;
  label: string;
}

export function applyTagFilters(query: string, tags: OverpassTagFilter[]): string {
  if (tags.length === 0) return query;

  const selectors = tags
    .map(({ key, value }) =>
      value === '*'
        ? `nwr[${JSON.stringify(key)}];`
        : `nwr[${JSON.stringify(key)}=${JSON.stringify(value)}];`,
    )
    .join('\n  ');
  return query.replace(/\bnwr\s*;/g, selectors);
}