export interface OverpassBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface OverpassPoiFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: Record<string, unknown>;
  }>;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

const POI_TAGS = [
  'amenity',
//   'shop',
//   'tourism',
//   'leisure',
//   'healthcare',
//   'historic',
//   'office',
//   'craft',
//   'emergency',
//   'public_transport',
];

export function buildOverpassPoiQuery(bounds: OverpassBounds): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const selectors = POI_TAGS.map(
    (tag) => `  nwr["${tag}"](${bbox});`,
  ).join('\n');

  return `[out:json][timeout:25];\n(\n${selectors}\n);\nout center tags;`;
}

export function overpassResponseToGeoJSON(
  data: unknown,
): OverpassPoiFeatureCollection {
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

export async function fetchOverpassPois(
  bounds: OverpassBounds,
): Promise<OverpassPoiFeatureCollection> {
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: buildOverpassPoiQuery(bounds) }),
  });

  if (!response.ok) {
    throw new Error(`Overpass API request failed (${response.status}).`);
  }

  const data: unknown = await response.json();
  return overpassResponseToGeoJSON(data);
}