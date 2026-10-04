import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoLibreNativeLayerRegistration } from '../geolibre/host-api';
import { MAP_COLOR_TOKENS } from '../styles/map-color-tokens';
import { fetchOverpssData } from './overpass-poi';

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
  placeholder.textContent = 'Add your custom plugin content here.2';

  const customTextarea = document.createElement('textarea');
  customTextarea.className = 'plugin-control-textarea';
  customTextarea.placeholder = 'Type your custom text here...';
  customTextarea.rows = 4;
  customTextarea.setAttribute('aria-label', 'Custom plugin text');

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'plugin-control-action';
  downloadButton.textContent = 'Download Data';
  downloadButton.addEventListener('click', async () => {
    const map = getMap();
    const mapBounds = map?.getBounds();
    if (!mapBounds) {
      setStatus('Map is not available.');
      return;
    }

    downloadButton.disabled = true;
    setStatus('Pobieram POI...');
    try {
      const geojson = await fetchData({
        south: mapBounds.getSouth(),
        west: mapBounds.getWest(),
        north: mapBounds.getNorth(),
        east: mapBounds.getEast(),
      });
      if (geojson.features.length === 0) {
        setStatus('Nie znaleziono POI w widocznym obszarze.');
        return;
      }

      const registered = registerNativeLayer({
        id: 'overpass-poi',
        name: 'Overpass POI',
        geojson,
        nativeLayerIds: ['overpass-poi-layer'],
        sourceIds: ['overpass-poi-source'],
        opacity: 1,
        style: { circleRadius: 6, fillColor: MAP_COLOR_TOKENS.poiFill },
        metadata: { source: 'Overpass API', featureCount: geojson.features.length },
      });
      if (registered) {
        setStatus(`Wyświetlono POI: ${geojson.features.length}.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to download POI.');
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
