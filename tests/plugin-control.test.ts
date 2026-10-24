import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { PluginControl } from '../src/lib/core/PluginControl';
import { DEFAULT_OVERPASS_QUERY, fetchOverpssData } from '../src/lib/core/overpass-data';
import { UI_MESSAGES } from '../src/lib/core/messages';
import { MAP_COLOR_TOKENS } from '../src/lib/styles/map-color-tokens';
import { createPluginContent } from '../src/lib/core/plugin-content';
import { PLUGIN_VERSION } from '../src/VERSION';
import {
  applyQueryTimeout,
  applyTagFilters,
  buildPickerQuery,
  parsePickerQuery,
  queryForApi,
} from '../src/lib/core/query-tags';

vi.mock('../src/lib/core/overpass-data', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/core/overpass-data')>(),
  fetchOverpssData: vi.fn(),
}));

describe('PluginControl native layer fallback', () => {
  it('places the full-width query action after the status message', () => {
    const { content } = createPluginContent({
      getMap: () => undefined,
      setStatus: vi.fn(),
      registerNativeLayer: () => true,
    });

    const footer = content.querySelector('.plugin-control-footer');
    expect(footer?.lastElementChild?.classList.contains('plugin-control-action')).toBe(true);
    expect(content.querySelector('.plugin-control-status')?.nextElementSibling)
      .toBe(footer?.lastElementChild);
  });

  it('keeps mode tabs and query action outside the scrolling area', () => {
    const { content } = createPluginContent({
      getMap: () => undefined,
      setStatus: vi.fn(),
      registerNativeLayer: () => true,
    });
    const scrollArea = content.querySelector('.plugin-control-scroll-area');
    const modeNotice = content.querySelector('.plugin-control-mode-notice');
    const loadingOverlay = content.querySelector('.plugin-control-loading');

    expect(content.firstElementChild?.classList.contains('plugin-control-mode-switch')).toBe(true);
    expect(modeNotice?.parentElement).toBe(content);
    expect(modeNotice?.nextElementSibling).toBe(scrollArea);
    expect(scrollArea?.contains(content.querySelector('.plugin-control-select'))).toBe(true);
    expect(scrollArea?.contains(content.querySelector('.plugin-control-query-editor'))).toBe(true);
    expect(scrollArea?.contains(content.querySelector('.plugin-control-advanced-options'))).toBe(true);
    expect(scrollArea?.contains(content.querySelector('.plugin-control-action'))).toBe(false);
    expect(loadingOverlay?.parentElement).toBe(content);
    expect(content.lastElementChild).toBe(loadingOverlay);
    expect(scrollArea?.contains(loadingOverlay)).toBe(false);
    expect(loadingOverlay?.getAttribute('aria-modal')).toBe('true');
  });

  it('places timeout and custom tag controls inside collapsed advanced options', () => {
    const { content } = createPluginContent({
      getMap: () => undefined,
      setStatus: vi.fn(),
      registerNativeLayer: () => true,
    });
    const advancedOptions = content.querySelector<HTMLDetailsElement>(
      '.plugin-control-advanced-options',
    );

    expect(advancedOptions?.open).toBe(false);
    expect(advancedOptions?.querySelector('.plugin-control-timeout-row')).not.toBeNull();
    expect(advancedOptions?.querySelector('.plugin-control-layer-name-row')).not.toBeNull();
    expect(advancedOptions?.querySelector('.plugin-control-custom-tag')).not.toBeNull();
    expect(advancedOptions?.querySelector('.plugin-control-unique-by-id-row')).not.toBeNull();
    expect(content.querySelector('.plugin-control-select')).not.toBeNull();
  });

  it('shows collapsed plugin info with the current version', () => {
    const { content } = createPluginContent({
      getMap: () => undefined,
      setStatus: vi.fn(),
      registerNativeLayer: () => true,
    });
    const about = content.querySelector<HTMLDetailsElement>('.plugin-control-about');

    expect(about?.open).toBe(false);
    expect(content.querySelector('.plugin-control-scroll-area')?.contains(about)).toBe(true);
    expect(about?.querySelector('.plugin-control-about-version')?.textContent).toBe(
      `Version ${PLUGIN_VERSION}`,
    );
  });

  it('adds or replaces the query timeout from the numeric setting', () => {
    expect(applyQueryTimeout('( nwr; );', 30)).toBe('[timeout:30];\n( nwr; );');
    expect(applyQueryTimeout('[timeout:25]; ( nwr; );', 45)).toBe(
      '[timeout:45]; ( nwr; );',
    );
  });

  it('builds existence selectors for wildcard feature categories', () => {
    const query = applyTagFilters('[out:json]; ( nwr; ); out geom tags;', [
      { key: 'highway', value: '*', label: 'All roads and paths' },
      { key: 'building', value: '*', label: 'All buildings' },
      { key: 'waterway', value: 'river', label: 'Rivers' },
    ]);

    expect(query).toContain('nwr["highway"];');
    expect(query).toContain('nwr["building"];');
    expect(query).toContain('nwr["waterway"="river"];');
    expect(query).not.toContain('"*"');
  });

  it('keeps the all-objects nwr selector exclusive with tag filters', () => {
    expect(applyTagFilters('[out:json]; ( nwr; );', [
      { key: 'nwr', value: '*', label: 'All map objects (nwr)' },
    ])).toBe('[out:json]; ( nwr; );');
  });

  it('round-trips picker queries and strips plugin metadata before API requests', () => {
    const query = buildPickerQuery(
      [{ key: 'amenity', value: 'cafe', label: 'Cafe' }],
      40,
    );

    expect(parsePickerQuery(query)).toEqual({
      tags: [{ key: 'amenity', value: 'cafe', label: 'amenity=cafe' }],
      timeoutSeconds: 40,
      uniqueById: true,
    });
    expect(query).toContain('out body geom;');
    expect(query).not.toContain('GeoLibre:');
    expect(queryForApi(query)).toContain('[timeout:40]');
  });

  it('rejects picker conversion when query meaning cannot be represented', () => {
    expect(parsePickerQuery('way[highway]; out geom;')).toBeNull();
    expect(parsePickerQuery('( nwr["amenity"="cafe"]; way[highway]; );')).toBeNull();
  });

  it('switches to picker without losing an unsupported advanced query', () => {
    const { content } = createPluginContent({
      getMap: () => undefined,
      setStatus: vi.fn(),
      registerNativeLayer: () => true,
    });
    const advancedButton = [...content.querySelectorAll('button')]
      .find((button) => button.textContent === 'Advanced');
    const pickerButton = [...content.querySelectorAll('button')]
      .find((button) => button.textContent === 'Picker');
    const editor = content.querySelector<HTMLTextAreaElement>('.plugin-control-query-editor');

    expect(pickerButton?.getAttribute('aria-pressed')).toBe('true');
    expect(content.querySelector('.plugin-control-select')?.hidden).toBe(false);
    expect(editor?.hidden).toBe(true);

    const tagSelect = content.querySelector<HTMLSelectElement>('.plugin-control-select');
    tagSelect!.value = 'amenity=cafe';
    tagSelect!.dispatchEvent(new Event('change'));
    advancedButton?.click();
    expect(editor?.hidden).toBe(false);
    expect(editor?.value).toContain('[timeout:25]');
    expect(editor?.value).toContain('nwr["amenity"="cafe"];');
    expect(editor?.value).not.toContain('GeoLibre: unique-by-id');

    editor!.value = 'way[highway]; out geom;';
    editor!.dispatchEvent(new Event('input'));
    pickerButton?.click();

    expect(pickerButton?.getAttribute('aria-pressed')).toBe('true');
    expect(advancedButton?.getAttribute('aria-pressed')).toBe('false');
    expect(editor?.hidden).toBe(true);
    expect(editor?.value).toBe('way[highway]; out geom;');
    expect(content.querySelector('.plugin-control-mode-notice')?.textContent)
      .toContain('Run Query will use the selected Picker filters');

    advancedButton?.click();
    expect(editor?.hidden).toBe(false);
    expect(editor?.value).toBe('way[highway]; out geom;');

    pickerButton?.click();
    content.querySelector<HTMLButtonElement>('.plugin-control-chip')?.click();
    expect(content.querySelector('.plugin-control-mode-notice')?.textContent).toBe('');
  });

  it('keeps advanced settings visible without custom tag entry in advanced mode', () => {
    const { content } = createPluginContent({
      getMap: () => undefined,
      setStatus: vi.fn(),
      registerNativeLayer: () => true,
    });
    const advancedButton = [...content.querySelectorAll('button')]
      .find((button) => button.textContent === 'Advanced');
    const editor = content.querySelector<HTMLTextAreaElement>('.plugin-control-query-editor');
    const options = content.querySelector<HTMLDetailsElement>('.plugin-control-advanced-options');
    const timeoutInput = content.querySelector<HTMLInputElement>('.plugin-control-timeout');
    const uniqueById = content.querySelector<HTMLInputElement>('.plugin-control-unique-by-id');

    advancedButton?.click();
    expect(options?.hidden).toBe(false);
    expect(editor?.compareDocumentPosition(options!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(options?.querySelector('.plugin-control-custom-tag')?.hidden).toBe(true);

    timeoutInput!.value = '45';
    timeoutInput!.dispatchEvent(new Event('input'));
    expect(editor?.value).toContain('[timeout:45]');

    uniqueById!.checked = false;
    uniqueById!.dispatchEvent(new Event('change'));
    expect(editor?.value).not.toContain('GeoLibre: unique-by-id');
    expect(editor?.value).toContain('nwr;');
    expect(uniqueById?.checked).toBe(false);
  });

  it('shows the default all-objects query as the selected picker filter', () => {
    const { content } = createPluginContent({
      getMap: () => undefined,
      setStatus: vi.fn(),
      registerNativeLayer: () => true,
    });
    const tagSelect = content.querySelector<HTMLSelectElement>('.plugin-control-select');
    const defaultChip = content.querySelector<HTMLButtonElement>('.plugin-control-chip');
    const queryEditor = content.querySelector<HTMLTextAreaElement>('.plugin-control-query-editor');

    expect(defaultChip?.textContent).toBe('All map objects (nwr)');
    expect(defaultChip?.getAttribute('aria-label')).toBe('Remove All map objects (nwr) filter');
    expect(tagSelect?.querySelector<HTMLOptionElement>('option[value="nwr=*"]')?.disabled)
      .toBe(true);
    expect(queryEditor?.value).toContain('nwr;');
    defaultChip?.click();
    expect(content.querySelector('.plugin-control-chip')).toBeNull();
    expect(queryEditor?.value).toBe('');
  });

  it('uses the configured layer name when registering query results', async () => {
    const fetchData = vi.fn(async () => ({
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        id: 'node/1',
        geometry: { type: 'Point' as const, coordinates: [1, 2] as [number, number] },
        properties: {},
      }],
    }));
    const registerNativeLayer = vi.fn(() => true);
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
      setStatus: vi.fn(),
      registerNativeLayer,
      fetchData,
    });

    const layerName = content.querySelector<HTMLInputElement>('.plugin-control-layer-name');
    layerName!.value = 'My custom layer';
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(registerNativeLayer).toHaveBeenCalledTimes(1));
    expect(registerNativeLayer.mock.calls[0][0].name).toBe('My custom layer');
  });

  it('adds arbitrary key-value filters as removable chips and applies them to the query', async () => {
    const fetchData = vi.fn(async () => ({ type: 'FeatureCollection' as const, features: [] }));
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
      setStatus: vi.fn(),
      registerNativeLayer: () => true,
      fetchData,
    });

    const keyInput = content.querySelector<HTMLInputElement>('[aria-label="Tag key"]');
    const valueInput = content.querySelector<HTMLInputElement>('[aria-label="Tag value"]');
    if (!keyInput || !valueInput) throw new Error('Custom tag fields were not created.');
    keyInput.value = 'highway';
    valueInput.value = 'path';
    content.querySelector<HTMLButtonElement>('.plugin-control-add-tag')?.click();

    const chip = content.querySelector<HTMLButtonElement>('.plugin-control-chip');
    expect(chip?.textContent).toBe('highway=path');
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1));
    expect(fetchData.mock.calls[0][1]).toContain('nwr["highway"="path"];');

    const documentClick = vi.fn();
    document.addEventListener('click', documentClick);
    chip?.click();
    document.removeEventListener('click', documentClick);
    expect(documentClick).not.toHaveBeenCalled();
    expect(content.querySelector('.plugin-control-chip')).toBeNull();
  });

  it('adds and removes tag chips and applies selected tags to the query', async () => {
    const features = { type: 'FeatureCollection' as const, features: [] };
    const fetchData = vi.fn(async () => features);
    const setStatus = vi.fn();
    const contextMap = {
      getBounds: () => ({
        getSouth: () => 1,
        getWest: () => 2,
        getNorth: () => 3,
        getEast: () => 4,
      }),
    } as unknown as MapLibreMap;
    const { content } = createPluginContent({
      getMap: () => contextMap,
      setStatus,
      registerNativeLayer: () => true,
      fetchData,
    });

    const tagSelect = content.querySelector<HTMLSelectElement>('.plugin-control-select');
    if (!tagSelect) throw new Error('Tag filter selector was not created.');
    tagSelect.value = 'amenity=cafe';
    tagSelect.dispatchEvent(new Event('change'));

    const chip = content.querySelector<HTMLButtonElement>('.plugin-control-chip');
    expect(chip?.textContent).toBe('Cafe');
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1));
    expect(fetchData.mock.calls[0][1]).toContain('nwr["amenity"="cafe"];');
    expect(fetchData.mock.calls[0][1]).not.toContain('nwr;');

    chip?.click();
    expect(content.querySelector('.plugin-control-chip')).toBeNull();
    expect(content.querySelector<HTMLTextAreaElement>('.plugin-control-query-editor')?.value)
      .toBe('');
    expect(tagSelect.querySelector<HTMLOptionElement>('option[value="amenity=cafe"]')?.disabled)
      .toBe(false);
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    expect(setStatus).toHaveBeenLastCalledWith(UI_MESSAGES.noPickerFilters);
    expect(fetchData).toHaveBeenCalledTimes(1);

    tagSelect.value = 'nwr=*';
    tagSelect.dispatchEvent(new Event('change'));
    expect(content.querySelector('.plugin-control-chip')?.textContent)
      .toBe('All map objects (nwr)');
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(2));
    expect(fetchData.mock.calls[1][1]).toContain(DEFAULT_OVERPASS_QUERY);
  });

  it('runs the selected Overpass filter and removes returned data with the control', async () => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          id: 'node/1',
          geometry: { type: 'Point' as const, coordinates: [2, 3] as [number, number] },
          properties: { amenity: 'cafe' },
        },
        {
          type: 'Feature' as const,
          id: 'way/2',
          geometry: { type: 'LineString' as const, coordinates: [[2, 3], [4, 5]] },
          properties: { highway: 'path' },
        },
        {
          type: 'Feature' as const,
          id: 'way/3',
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[2, 3], [4, 3], [4, 5], [2, 3]]],
          },
          properties: { building: 'yes' },
        },
      ],
    };
    vi.mocked(fetchOverpssData).mockResolvedValueOnce(geojson);

    const mapContainer = document.createElement('div');
    document.body.appendChild(mapContainer);
    const map = {
      getContainer: () => mapContainer,
      getBounds: () => ({
        getSouth: () => 1,
        getWest: () => 2,
        getNorth: () => 3,
        getEast: () => 4,
      }),
      on: vi.fn(),
      off: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(() => ({})),
      removeLayer: vi.fn(),
      getSource: vi.fn(() => ({})),
      removeSource: vi.fn(),
    };
    const control = new PluginControl();
    mapContainer.appendChild(control.onAdd(map as unknown as MapLibreMap));

    const tagSelect = mapContainer.querySelector<HTMLSelectElement>('.plugin-control-select');
    if (!tagSelect) throw new Error('Overpass tag selector was not created.');
    tagSelect.value = 'building=*';
    tagSelect.dispatchEvent(new Event('change'));

    mapContainer.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(map.addLayer).toHaveBeenCalledTimes(3));

    expect(fetchOverpssData).toHaveBeenCalledWith(
      { south: 1, west: 2, north: 3, east: 4 },
      '[timeout:25];\n(\n  nwr["building"];\n);',
      expect.any(AbortSignal),
    );
    expect(map.addSource).toHaveBeenCalledWith('overpass-data-source', {
      type: 'geojson',
      data: geojson,
    });
    expect(map.addLayer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'overpass-data-fill-layer',
        type: 'fill',
        source: 'overpass-data-source',
        paint: expect.objectContaining({ 'fill-opacity': 0.65 }),
      }),
    );
    expect(map.addLayer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'overpass-data-line-layer',
        type: 'line',
        source: 'overpass-data-source',
        paint: expect.objectContaining({
          'line-opacity': 0.65,
          'line-color': MAP_COLOR_TOKENS.fillSymbol,
        }),
      }),
    );
    expect(map.addLayer).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: 'overpass-data-point-layer',
        type: 'circle',
        source: 'overpass-data-source',
        paint: expect.objectContaining({ 'circle-opacity': 0.65 }),
      }),
    );
    expect(mapContainer.querySelector('.plugin-control-status')?.textContent)
      .toContain('Displayed objects: 3.');

    control.onRemove();

    expect(map.removeLayer).toHaveBeenCalledWith('overpass-data-fill-layer');
    expect(map.removeLayer).toHaveBeenCalledWith('overpass-data-line-layer');
    expect(map.removeLayer).toHaveBeenCalledWith('overpass-data-point-layer');
    expect(map.removeSource).toHaveBeenCalledWith('overpass-data-source');
    mapContainer.remove();
  });

  it('accumulates same-name query results and honors ID deduplication', async () => {
    const features = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          id: 'node/1',
          geometry: { type: 'Point' as const, coordinates: [1, 2] as [number, number] },
          properties: {},
        },
        {
          type: 'Feature' as const,
          id: 'node/1',
          geometry: { type: 'Point' as const, coordinates: [3, 4] as [number, number] },
          properties: {},
        },
        {
          type: 'Feature' as const,
          id: undefined,
          geometry: { type: 'Point' as const, coordinates: [5, 6] as [number, number] },
          properties: {},
        },
      ],
    };
    const fetchData = vi.fn(async () => features);
    const registerNativeLayer = vi.fn(() => true);
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
      setStatus: vi.fn(),
      registerNativeLayer,
      fetchData,
    });

    const uniqueCheckbox = content.querySelector<HTMLInputElement>(
      '.plugin-control-unique-by-id',
    );
    const layerNameInput = content.querySelector<HTMLInputElement>(
      '.plugin-control-layer-name',
    );
    layerNameInput!.value = 'Combined results';
    expect(uniqueCheckbox).not.toBeNull();
    expect(uniqueCheckbox?.closest('.plugin-control-advanced-options')).not.toBeNull();
    expect(uniqueCheckbox?.checked).toBe(true);

    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(registerNativeLayer).toHaveBeenCalledTimes(1));
    expect(registerNativeLayer.mock.calls[0][0].geojson?.features).toHaveLength(2);
    expect(registerNativeLayer.mock.calls[0][0].metadata?.featureCount).toBe(2);
    expect(registerNativeLayer.mock.calls[0][0].name).toBe('Combined results');

    uniqueCheckbox!.checked = false;
    uniqueCheckbox!.dispatchEvent(new Event('change'));
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(registerNativeLayer).toHaveBeenCalledTimes(2));
    expect(registerNativeLayer.mock.calls[1][0].geojson?.features).toHaveLength(5);
    expect(registerNativeLayer.mock.calls[1][0].metadata?.featureCount).toBe(5);
    expect(registerNativeLayer.mock.calls[1][0].id).toBe(registerNativeLayer.mock.calls[0][0].id);
    expect(registerNativeLayer.mock.calls[1][0].sourceIds).toEqual(
      registerNativeLayer.mock.calls[0][0].sourceIds,
    );

    layerNameInput!.value = 'Other results';
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(registerNativeLayer).toHaveBeenCalledTimes(3));
    expect(registerNativeLayer.mock.calls[2][0].name).toBe('Other results');
    expect(registerNativeLayer.mock.calls[2][0].geojson?.features).toHaveLength(3);
    expect(registerNativeLayer.mock.calls[2][0].id)
      .not.toBe(registerNativeLayer.mock.calls[1][0].id);
  });
});