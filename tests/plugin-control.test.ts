import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { PluginControl } from '../src/lib/core/PluginControl';
import { DEFAULT_OVERPASS_QUERY, fetchOverpssData } from '../src/lib/core/overpass-poi';
import { createPluginContent } from '../src/lib/core/plugin-content';
import { applyTagFilters } from '../src/lib/core/query-tags';

vi.mock('../src/lib/core/overpass-poi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/core/overpass-poi')>(),
  fetchOverpssData: vi.fn(),
}));

describe('PluginControl native layer fallback', () => {
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
    expect(tagSelect.querySelector<HTMLOptionElement>('option[value="amenity=cafe"]')?.disabled)
      .toBe(false);
    content.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(2));
    expect(fetchData.mock.calls[1][1]).toContain(DEFAULT_OVERPASS_QUERY);
  });

  it('runs the edited Overpass query and removes returned data with the control', async () => {
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

    const query = '[timeout:25]; nwr["building"]({{bbox}}); out center tags;';
    const queryEditor = mapContainer.querySelector<HTMLTextAreaElement>('.plugin-control-textarea');
    if (!queryEditor) throw new Error('Overpass query editor was not created.');
    queryEditor.value = query;

    mapContainer.querySelector<HTMLButtonElement>('.plugin-control-action')?.click();
    await vi.waitFor(() => expect(map.addLayer).toHaveBeenCalledTimes(3));

    expect(fetchOverpssData).toHaveBeenCalledWith(
      { south: 1, west: 2, north: 3, east: 4 },
      query,
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
        paint: expect.objectContaining({ 'line-opacity': 0.65 }),
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
});