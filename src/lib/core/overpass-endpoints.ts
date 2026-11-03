import endpointsJson from './overpass-endpoints.json';
import { UI_MESSAGES } from './messages';

export interface OverpassEndpointField {
  /** Placeholder name used as `{name}` in `url` and `headers`. */
  name: string;
  label: string;
  /** `url` values are inserted verbatim; other values are URL-encoded. */
  type?: 'text' | 'password' | 'url';
  required?: boolean;
  placeholder?: string;
}

export interface OverpassEndpointConfig {
  id: string;
  name: string;
  /** Interpreter URL; may contain `{field}` placeholders. */
  url: string;
  website?: string;
  description?: string;
  fields?: OverpassEndpointField[];
  /** Header templates; a header is sent only when all its placeholders have values. */
  headers?: Record<string, string>;
}

export interface OverpassEndpointsConfig {
  defaultEndpointId: string;
  endpoints: OverpassEndpointConfig[];
}

export interface OverpassEndpointRequest {
  url: string;
  headers: Record<string, string>;
}

export const OVERPASS_ENDPOINTS_CONFIG = endpointsJson as OverpassEndpointsConfig;

export const DEFAULT_OVERPASS_ENDPOINT: OverpassEndpointConfig =
  OVERPASS_ENDPOINTS_CONFIG.endpoints.find(
    ({ id }) => id === OVERPASS_ENDPOINTS_CONFIG.defaultEndpointId,
  ) ?? OVERPASS_ENDPOINTS_CONFIG.endpoints[0];

const PLACEHOLDER = /\{(\w+)\}/g;

export function resolveOverpassEndpoint(
  endpoint: OverpassEndpointConfig,
  values: Record<string, string> = {},
): OverpassEndpointRequest {
  const fields = endpoint.fields ?? [];
  const valueOf = (name: string) => values[name]?.trim() ?? '';

  for (const field of fields) {
    if (field.required && !valueOf(field.name)) {
      throw new Error(UI_MESSAGES.endpointFieldRequired(field.label));
    }
  }

  const url = endpoint.url.replace(PLACEHOLDER, (_, name: string) => {
    const field = fields.find((candidate) => candidate.name === name);
    return field?.type === 'url' ? valueOf(name) : encodeURIComponent(valueOf(name));
  });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(UI_MESSAGES.invalidEndpointUrl);
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error(UI_MESSAGES.invalidEndpointUrl);
  }

  const headers: Record<string, string> = {};
  for (const [header, template] of Object.entries(endpoint.headers ?? {})) {
    const names = [...template.matchAll(PLACEHOLDER)].map(([, name]) => name);
    if (names.some((name) => !valueOf(name))) continue;
    headers[header] = template.replace(PLACEHOLDER, (_, name: string) => valueOf(name));
  }

  return { url, headers };
}
