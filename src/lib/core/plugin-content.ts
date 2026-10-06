import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoLibreNativeLayerRegistration } from '../geolibre/host-api';
import { MAP_COLOR_TOKENS } from '../styles/map-color-tokens';
import { DEFAULT_OVERPASS_QUERY, fetchOverpssData } from './overpass-poi';
import { UI_MESSAGES } from './messages';

export interface PluginContentContext {
  getMap: () => MapLibreMap | undefined;
  setStatus: (message: string) => void;
  registerNativeLayer: (layer: GeoLibreNativeLayerRegistration) => boolean;
  fetchData?: typeof fetchOverpssData;
}

export function createPluginContent({
  getMap,
  setStatus,
  registerNativeLayer,
  fetchData = fetchOverpssData,
}: PluginContentContext): { content: HTMLElement; status: HTMLElement } {
  const content = document.createElement('div');
  content.className = 'plugin-control-content';

  const placeholder = document.createElement('p');
  placeholder.className = 'plugin-control-placeholder';
  placeholder.textContent = UI_MESSAGES.queryLabel;

  const customTextarea = document.createElement('textarea');
  customTextarea.className = 'plugin-control-textarea';
  customTextarea.value = DEFAULT_OVERPASS_QUERY;
  customTextarea.rows = 10;
  customTextarea.setAttribute('aria-label', UI_MESSAGES.queryLabel);

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'plugin-control-action';
  downloadButton.textContent = UI_MESSAGES.runQuery;
  downloadButton.addEventListener('click', async () => {
    const map = getMap();
    const mapBounds = map?.getBounds();
    if (!mapBounds) {
      setStatus(UI_MESSAGES.mapUnavailable);
      return;
    }

    downloadButton.disabled = true;
    setStatus(UI_MESSAGES.queryRunning);
    try {
      const geojson = await fetchData({
        south: mapBounds.getSouth(),
        west: mapBounds.getWest(),
        north: mapBounds.getNorth(),
        east: mapBounds.getEast(),
      }, customTextarea.value);
      if (geojson.features.length === 0) {
        setStatus(UI_MESSAGES.noSupportedGeometry);
        return;
      }

      const registered = registerNativeLayer({
        id: 'overpass-data',
        name: UI_MESSAGES.overpassLayerName,
        geojson,
        nativeLayerIds: [
          'overpass-data-fill-layer',
          'overpass-data-line-layer',
          'overpass-data-point-layer',
        ],
        sourceIds: ['overpass-data-source'],
        opacity: 1,
        style: { circleRadius: 6, fillColor: MAP_COLOR_TOKENS.poiFill, fillOpacity: 0.65 },
        metadata: { source: UI_MESSAGES.overpassSourceName, featureCount: geojson.features.length },
      });
      if (registered) {
        setStatus(UI_MESSAGES.objectsDisplayed(geojson.features.length));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : UI_MESSAGES.unableToLoadOverpassData);
    } finally {
      downloadButton.disabled = false;
    }
  });

  const status = document.createElement('div');
  status.className = 'plugin-control-status';
  status.textContent = '';

  content.appendChild(placeholder);
  content.appendChild(customTextarea);
  content.appendChild(downloadButton);
  content.appendChild(status);

  return { content, status };
}
