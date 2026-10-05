import type {
  OverpassBounds,
  OverpassElement,
  OverpassFeatureCollection,
} from './PluginModels';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export const DEFAULT_OVERPASS_QUERY =
  '[out:json][timeout:25];\n(\n  nwr["amenity"]({{bbox}});\n);\nout center tags;';

export function buildOverpassQuery(query: string, bounds: OverpassBounds): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return query.split('{{bbox}}').join(bbox);
}

export function overpassResponseToGeoJSON(
  data: unknown,
): OverpassFeatureCollection {
  if (
    !data ||
    typeof data !== 'object' ||
    !('elements' in data) ||
    !Array.isArray(data.elements)
  ) {
    throw new Error('Overpass API returned an invalid response.');
  }

  const features = (data.elements as OverpassElement[]).flatMap((element) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude)
    ) {
      return [];
    }

    return [{
      type: 'Feature' as const,
      id: `${element.type}/${element.id}`,
      geometry: {
        type: 'Point' as const,
        coordinates: [longitude, latitude] as [number, number],
      },
      properties: {
        ...element.tags,
        osm_type: element.type,
        osm_id: element.id,
      },
    }];
  });

  return { type: 'FeatureCollection', features };
}

export async function fetchOverpssData(
  bounds: OverpassBounds,
  query: string,
): Promise<OverpassFeatureCollection> {
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: buildOverpassQuery(query, bounds) }),
  });

  if (!response.ok) {
    throw new Error(`Overpass API request failed (${response.status}).`);
  }

  const data: unknown = await response.json();
  return overpassResponseToGeoJSON(data);
}