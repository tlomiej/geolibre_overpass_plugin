import { describe, expect, it } from 'vitest';
import {
  buildOverpassQuery,
  DEFAULT_OVERPASS_QUERY,
  overpassResponseToGeoJSON,
} from '../src/lib/core/overpass-poi';

describe('buildOverpassQuery', () => {
  it('inserts map bounds into an editable query without restricting its filters', () => {
    const query = buildOverpassQuery(
      '[timeout:25]; nwr["building"]({{bbox}}); out center tags;',
      {
      south: 51.4,
      west: -0.2,
      north: 51.6,
      east: 0.1,
      },
    );

    expect(query).toBe('[out:json][timeout:25]; nwr["building"](51.4,-0.2,51.6,0.1); out center tags;');
    expect(DEFAULT_OVERPASS_QUERY).not.toContain('{{bbox}}');
    const defaultQuery = buildOverpassQuery(DEFAULT_OVERPASS_QUERY, {
      south: 51.4,
      west: -0.2,
      north: 51.6,
      east: 0.1,
    });
    expect(defaultQuery).toContain('nwr(51.4,-0.2,51.6,0.1);');
    expect(defaultQuery).toContain('out geom tags;');
    expect(DEFAULT_OVERPASS_QUERY).not.toContain('out geom tags;');
    expect(DEFAULT_OVERPASS_QUERY).not.toContain('[out:json]');
  });
});

describe('overpassResponseToGeoJSON', () => {
  it('converts nodes and centered ways into point features', () => {
    expect(
      overpassResponseToGeoJSON({
        elements: [
          { type: 'node', id: 12, lat: 51.5, lon: -0.1, tags: { amenity: 'cafe' } },
          {
            type: 'way',
            id: 34,
            center: { lat: 51.6, lon: -0.2 },
            tags: { shop: 'bakery' },
          },
        ],
      }),
    ).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'node/12',
          geometry: { type: 'Point', coordinates: [-0.1, 51.5] },
          properties: { amenity: 'cafe', osm_type: 'node', osm_id: 12 },
        },
        {
          type: 'Feature',
          id: 'way/34',
          geometry: { type: 'Point', coordinates: [-0.2, 51.6] },
          properties: { shop: 'bakery', osm_type: 'way', osm_id: 34 },
        },
      ],
    });
  });

  it('converts way geometry into lines and polygons', () => {
    const result = overpassResponseToGeoJSON({
      elements: [
        {
          type: 'way',
          id: 10,
          geometry: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
          tags: { highway: 'path' },
        },
        {
          type: 'way',
          id: 11,
          geometry: [
            { lat: 0, lon: 0 },
            { lat: 0, lon: 2 },
            { lat: 2, lon: 2 },
            { lat: 0, lon: 0 },
          ],
          tags: { building: 'yes' },
        },
      ],
    });

    expect(result.features.map((feature) => feature.geometry)).toEqual([
      { type: 'LineString', coordinates: [[2, 1], [4, 3]] },
      { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] },
    ]);
  });

  it('converts multipolygon relations and retains inner rings', () => {
    const result = overpassResponseToGeoJSON({
      elements: [
        {
          type: 'relation',
          id: 20,
          tags: { type: 'multipolygon', landuse: 'forest' },
          members: [
            { type: 'way', ref: 1, role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 2 }] },
            { type: 'way', ref: 2, role: 'outer', geometry: [{ lat: 0, lon: 2 }, { lat: 2, lon: 2 }] },
            { type: 'way', ref: 3, role: 'outer', geometry: [{ lat: 2, lon: 2 }, { lat: 2, lon: 0 }, { lat: 0, lon: 0 }] },
            { type: 'way', ref: 4, role: 'inner', geometry: [{ lat: 0.5, lon: 0.5 }, { lat: 0.5, lon: 1 }, { lat: 1, lon: 1 }, { lat: 0.5, lon: 0.5 }] },
          ],
        },
      ],
    });

    expect(result.features[0].geometry.type).toBe('MultiPolygon');
    if (result.features[0].geometry.type !== 'MultiPolygon') {
      throw new Error('Expected multipolygon geometry.');
    }
    expect(result.features[0].geometry.coordinates).toHaveLength(1);
    expect(result.features[0].geometry.coordinates[0]).toHaveLength(2);
  });

  it('rejects malformed Overpass responses', () => {
    expect(() => overpassResponseToGeoJSON({})).toThrow(
      'Overpass API returned an invalid response.',
    );
  });
});