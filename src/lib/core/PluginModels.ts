export interface OverpassBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface OverpassCoordinate {
  lat: number;
  lon: number;
}

export interface OverpassFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: OverpassGeoJSONGeometry;
    properties: Record<string, unknown>;
  }>;
}

export type OverpassPosition = [number, number];

export type OverpassGeoJSONGeometry =
  | { type: 'Point'; coordinates: OverpassPosition }
  | { type: 'LineString'; coordinates: OverpassPosition[] }
  | { type: 'MultiLineString'; coordinates: OverpassPosition[][] }
  | { type: 'Polygon'; coordinates: OverpassPosition[][] }
  | { type: 'MultiPolygon'; coordinates: OverpassPosition[][][] };

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: OverpassCoordinate;
  tags?: Record<string, string>;
  geometry?: OverpassCoordinate[];
  members?: Array<{
    type: string;
    ref: number;
    role?: string;
    geometry?: OverpassCoordinate[];
  }>;
}