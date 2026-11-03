import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { createPluginContent } from '../src/lib/core/plugin-content';
import { UI_MESSAGES } from '../src/lib/core/messages';
import {
  DEFAULT_OVERPASS_ENDPOINT,
  OVERPASS_ENDPOINTS_CONFIG,
  resolveOverpassEndpoint,
} from '../src/lib/core/overpass-endpoints';

const endpointById = (id: string) => {
  const endpoint = OVERPASS_ENDPOINTS_CONFIG.endpoints.find((candidate) => candidate.id === id);
  if (!endpoint) throw new Error(`Endpoint ${id} is missing from the config.`);
  return endpoint;
};

describe('Overpass endpoint config', () => {
  it('has unique ids and a valid default endpoint without required fields', () => {
    const ids = OVERPASS_ENDPOINTS_CONFIG.endpoints.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_OVERPASS_ENDPOINT.id).toBe(OVERPASS_ENDPOINTS_CONFIG.defaultEndpointId);
    expect(resolveOverpassEndpoint(DEFAULT_OVERPASS_ENDPOINT)).toEqual({
      url: 'https://overpass-api.de/api/interpreter',
      headers: {},
    });
  });

  it('inserts an encoded API key into the URL template', () => {
    expect(resolveOverpassEndpoint(endpointById('overpass-ch'), { apiKey: ' a/b ' })).toEqual({
      url: 'https://api.overpass.ch/v1/a%2Fb/interpreter',
      headers: {},
    });
  });

  it('requires the API key of a keyed endpoint', () => {
    expect(() => resolveOverpassEndpoint(endpointById('nextgis'), {})).toThrow(
      UI_MESSAGES.endpointFieldRequired('API key'),
    );
  });

  it('uses the custom URL verbatim and sends the optional token as a Bearer header', () => {
    const custom = endpointById('custom');
    expect(resolveOverpassEndpoint(custom, { url: 'https://example.com/api/interpreter' }))
      .toEqual({ url: 'https://example.com/api/interpreter', headers: {} });
    expect(resolveOverpassEndpoint(custom, {
      url: 'https://example.com/api/interpreter',
      token: 'secret',
    })).toEqual({
      url: 'https://example.com/api/interpreter',
      headers: { Authorization: 'Bearer secret' },
    });
    expect(() => resolveOverpassEndpoint(custom, { url: 'ftp://example.com' }))
      .toThrow(UI_MESSAGES.invalidEndpointUrl);
    expect(() => resolveOverpassEndpoint(custom, { url: 'not a url' }))
      .toThrow(UI_MESSAGES.invalidEndpointUrl);
  });
});

describe('Overpass endpoint selector', () => {
  afterEach(() => localStorage.clear());

  const createContent = () => {
    const fetchData = vi.fn(async () => ({ type: 'FeatureCollection' as const, features: [] }));
    const setStatus = vi.fn();
    const map = {
      getBounds: () => ({
        getSouth: () => 1,
        getWest: () => 2,
        getNorth: () => 3,
        getEast: () => 4,
      }),
    } as unknown as MapLibreMap;
    const { content } = createPluginContent({
      getMap: () => map,
      setStatus,
      registerNativeLayer: () => true,
      fetchData,
    });
    const select = content.querySelector<HTMLSelectElement>('.plugin-control-endpoint-select');
    if (!select) throw new Error('Endpoint selector was not created.');
    const choose = (id: string) => {
      select.value = id;
      select.dispatchEvent(new Event('change'));
    };
    const fields = () =>
      [...content.querySelectorAll<HTMLInputElement>('.plugin-control-endpoint-fields input')];
    return { content, fetchData, setStatus, select, choose, fields };
  };

  it('lists every configured endpoint inside Advanced options', () => {
    const { content, select, fields } = createContent();
    expect(select.closest('.plugin-control-advanced-options')).not.toBeNull();
    expect([...select.options].map(({ value }) => value))
      .toEqual(OVERPASS_ENDPOINTS_CONFIG.endpoints.map(({ id }) => id));
    expect(select.value).toBe(DEFAULT_OVERPASS_ENDPOINT.id);
    expect(fields()).toHaveLength(0);
    expect(content.querySelector('.plugin-control-endpoint-info')?.textContent).toBeTruthy();
  });

  it('shows the token field for keyed endpoints and URL plus token for a custom endpoint', () => {
    const { choose, fields } = createContent();
    choose('overspan');
    expect(fields().map(({ name, type }) => [name, type])).toEqual([['apiKey', 'password']]);

    choose('custom');
    expect(fields().map(({ name, type }) => [name, type]))
      .toEqual([['url', 'url'], ['token', 'password']]);
  });

  it('blocks the query until the required key is entered and then sends it', async () => {
    const { content, fetchData, setStatus, choose, fields } = createContent();
    choose('nextgis');
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() =>
      expect(setStatus).toHaveBeenLastCalledWith(UI_MESSAGES.endpointFieldRequired('API key')));
    expect(fetchData).not.toHaveBeenCalled();
    expect(content.querySelector<HTMLDetailsElement>('.plugin-control-advanced-options')?.open)
      .toBe(true);

    const [apiKey] = fields();
    apiKey.value = 'key123';
    apiKey.dispatchEvent(new Event('input'));
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1));
    expect(fetchData.mock.calls[0][3]).toEqual({
      url: 'https://overpass.nextgis.com/key123/api/interpreter',
      headers: {},
    });
  });

  it('remembers the selected endpoint and its fields', () => {
    const first = createContent();
    first.choose('custom');
    const [url] = first.fields();
    url.value = 'https://example.com/api/interpreter';
    url.dispatchEvent(new Event('input'));

    const second = createContent();
    expect(second.select.value).toBe('custom');
    expect(second.fields()[0].value).toBe('https://example.com/api/interpreter');
  });
});
