import type {
  OverpassBounds,
  OverpassElement,
  OverpassFeatureCollection,
  OverpassGeoJSONGeometry,
  OverpassPosition,
} from "./PluginModels";
import { UI_MESSAGES } from "./messages";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

export const DEFAULT_OVERPASS_QUERY =
  '[timeout:25];\n(\n  nwr;\n);';

export function buildOverpassQuery(
  query: string,
  bounds: OverpassBounds,
): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const queryBody = query
    .trim()
    .replace(/^\[out:json\]\s*/i, "")
    .replace(/\{\{bbox\}\}/g, bbox);
  const boundedQuery = queryBody.replace(
    /\b(node|way|relation|area|nwr)((?:\s*\[[^\]]*\])*)\s*;/g,
    `$1$2(${bbox});`,
  );
  const outputQuery = /\bout\s+(?:ids|skel|body|tags|meta|geom|center|count|asc|qt|bb)\b[^;]*;/i.test(
    boundedQuery,
  )
    ? boundedQuery
    : `${boundedQuery}\nout geom tags;`;
  return `[out:json]${outputQuery}`;
}

export function overpassResponseToGeoJSON(
  data: unknown,
): OverpassFeatureCollection {
  if (
    !data ||
    typeof data !== "object" ||
    !("elements" in data) ||
    !Array.isArray(data.elements)
  ) {
    throw new Error(UI_MESSAGES.invalidOverpassResponse);
  }

  const features = (data.elements as OverpassElement[]).flatMap((element) => {
    const geometry = overpassElementToGeometry(element);
    if (!geometry) return [];

    return [
      {
        type: "Feature" as const,
        id: `${element.type}/${element.id}`,
        geometry,
        properties: {
          ...element.tags,
          osm_type: element.type,
          osm_id: element.id,
        },
      },
    ];
  });

  return { type: "FeatureCollection", features };
}

function overpassElementToGeometry(
  element: OverpassElement,
): OverpassGeoJSONGeometry | null {
  if (
    element.type === "node" &&
    typeof element.lat === "number" &&
    Number.isFinite(element.lat) &&
    typeof element.lon === "number" &&
    Number.isFinite(element.lon)
  ) {
    return { type: "Point", coordinates: [element.lon, element.lat] };
  }

  if (element.type === "way" && element.geometry) {
    const coordinates = toPositions(element.geometry);
    if (coordinates.length >= 2) {
      if (isAreaWay(element, coordinates)) {
        return { type: "Polygon", coordinates: [coordinates] };
      }
      return { type: "LineString", coordinates };
    }
  }

  if (
    element.type === "relation" &&
    (element.tags?.type === "multipolygon" || element.tags?.type === "boundary")
  ) {
    const polygons = relationToPolygons(element);
    if (polygons.length > 0)
      return { type: "MultiPolygon", coordinates: polygons };
  }

  if (element.type === "relation" && element.members) {
    const lines = element.members
      .filter((member) => member.type === "way" && member.geometry)
      .map((member) => toPositions(member.geometry ?? []))
      .filter((coordinates) => coordinates.length >= 2);
    if (lines.length > 0)
      return { type: "MultiLineString", coordinates: lines };
  }

  if (
    typeof element.center?.lat === "number" &&
    Number.isFinite(element.center.lat) &&
    typeof element.center.lon === "number" &&
    Number.isFinite(element.center.lon)
  ) {
    return {
      type: "Point",
      coordinates: [element.center.lon, element.center.lat],
    };
  }

  return null;
}

function toPositions(
  coordinates: Array<{ lat: number; lon: number }>,
): OverpassPosition[] {
  return coordinates
    .filter(({ lat, lon }) => isCoordinate(lat, lon))
    .map(({ lat, lon }) => [lon, lat]);
}

function isCoordinate(
  latitude: unknown,
  longitude: unknown,
): latitude is number {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude)
  );
}

function isAreaWay(
  element: OverpassElement,
  coordinates: OverpassPosition[],
): boolean {
  if (!isClosedRing(coordinates) || element.tags?.area === "no") return false;
  if (element.tags?.area === "yes") return true;

  const tags = element.tags ?? {};
  if (tags.natural === "coastline" || tags.waterway) return false;
  return [
    "amenity",
    "building",
    "landuse",
    "leisure",
    "military",
    "natural",
    "place",
    "shop",
    "tourism",
  ].some((key) => key in tags);
}

function relationToPolygons(element: OverpassElement): OverpassPosition[][][] {
  const members = element.members ?? [];
  const outerRings = stitchRings(
    members
      .filter(
        (member) =>
          member.type === "way" && (member.role ?? "outer") === "outer",
      )
      .map((member) => toPositions(member.geometry ?? [])),
  );
  const innerRings = stitchRings(
    members
      .filter((member) => member.type === "way" && member.role === "inner")
      .map((member) => toPositions(member.geometry ?? [])),
  );

  const polygons = outerRings.map((outer) => [outer]);
  for (const inner of innerRings) {
    const polygonIndex = outerRings.findIndex((outer) =>
      pointInRing(inner[0], outer),
    );
    if (polygonIndex >= 0) polygons[polygonIndex].push(inner);
  }
  return polygons;
}

function stitchRings(lines: OverpassPosition[][]): OverpassPosition[][] {
  const pending = lines
    .filter((line) => line.length >= 2)
    .map((line) => [...line]);
  const rings: OverpassPosition[][] = [];

  while (pending.length > 0) {
    const ring = pending.shift()!;
    while (!samePosition(ring[0], ring[ring.length - 1])) {
      const endpoint = ring[ring.length - 1];
      const nextIndex = pending.findIndex(
        (line) =>
          samePosition(line[0], endpoint) ||
          samePosition(line[line.length - 1], endpoint),
      );
      if (nextIndex < 0) break;

      let next = pending.splice(nextIndex, 1)[0];
      if (samePosition(next[next.length - 1], endpoint)) next = next.reverse();
      ring.push(...next.slice(1));
    }

    if (isClosedRing(ring)) rings.push(ring);
  }

  return rings;
}

function isClosedRing(coordinates: OverpassPosition[]): boolean {
  return (
    coordinates.length >= 4 &&
    samePosition(coordinates[0], coordinates[coordinates.length - 1])
  );
}

function samePosition(
  first: OverpassPosition,
  second: OverpassPosition,
): boolean {
  return first[0] === second[0] && first[1] === second[1];
}

function pointInRing(
  point: OverpassPosition,
  ring: OverpassPosition[],
): boolean {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses =
      y > point[1] !== previousY > point[1] &&
      point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export async function fetchOverpssData(
  bounds: OverpassBounds,
  query: string,
): Promise<OverpassFeatureCollection> {
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: buildOverpassQuery(query, bounds) }),
  });

  if (!response.ok) {
    throw new Error(UI_MESSAGES.overpassRequestFailed(response.status));
  }

  const data: unknown = await response.json();
  return overpassResponseToGeoJSON(data);
}
