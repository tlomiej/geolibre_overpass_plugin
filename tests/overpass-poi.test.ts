import { describe, expect, it } from 'vitest';
import {
  buildOverpassPoiQuery,
  overpassResponseToGeoJSON,
} from '../src/lib/utils/overpass-poi';

describe('buildOverpassPoiQuery', () => {
  it('queries POI categories inside the provided map bounds', () => {
    const query = buildOverpassPoiQuery({
      south: 51.4,
      west: -0.2,
      north: 51.6,
      east: 0.1,
    });

    expect(query).toContain('nwr["amenity"](51.4,-0.2,51.6,0.1);');
    expect(query).toContain('nwr["shop"](51.4,-0.2,51.6,0.1);');
    expect(query).toContain('nwr["tourism"](51.4,-0.2,51.6,0.1);');
    expect(query).toContain('out center tags;');
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

  it('rejects malformed Overpass responses', () => {
    expect(() => overpassResponseToGeoJSON({})).toThrow(
      'Overpass API returned an invalid response.',
    );
  });
});