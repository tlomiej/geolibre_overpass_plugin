import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { PluginControl } from '../src/lib/core/PluginControl';
import { fetchOverpssData } from '../src/lib/core/overpass-poi';

vi.mock('../src/lib/core/overpass-poi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/core/overpass-poi')>(),
  fetchOverpssData: vi.fn(),
}));

describe('PluginControl native layer fallback', () => {
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
    await vi.waitFor(() => expect(map.addLayer).toHaveBeenCalledOnce());

    expect(fetchOverpssData).toHaveBeenCalledWith(
      { south: 1, west: 2, north: 3, east: 4 },
      query,
    );
    expect(map.addSource).toHaveBeenCalledWith('overpass-data-source', {
      type: 'geojson',
      data: geojson,
    });
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'overpass-data-layer',
        type: 'circle',
        source: 'overpass-data-source',
      }),
    );
    expect(mapContainer.querySelector('.plugin-control-status')?.textContent)
      .toContain('Wyświetlono obiekty: 1.');

    control.onRemove();

    expect(map.removeLayer).toHaveBeenCalledWith('overpass-data-layer');
    expect(map.removeSource).toHaveBeenCalledWith('overpass-data-source');
    mapContainer.remove();
  });
});