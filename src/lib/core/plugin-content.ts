import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoLibreNativeLayerRegistration } from '../geolibre/host-api';
import { MAP_COLOR_TOKENS } from '../styles/map-color-tokens';
import { DEFAULT_OVERPASS_QUERY, fetchOverpssData } from './overpass-poi';
import { UI_MESSAGES } from './messages';
import tagCatalogJson from './available-tags.jsonc?raw';
import { applyTagFilters, type OverpassTagFilter } from './query-tags';

interface AvailableOverpassTag extends OverpassTagFilter {
  group: string;
}

const OVERPASS_TAGS = tagCatalogJson.matchAll(
  /^\s*\{\s*"group"\s*:\s*"([^"]+)"\s*,\s*"key"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]+)"\s*,\s*"label"\s*:\s*"([^"]+)"\s*\}\s*,?\s*$/gm,
);
const AVAILABLE_OVERPASS_TAGS: AvailableOverpassTag[] = [...OVERPASS_TAGS].map(
  ([, group, key, value, label]) => ({ group, key, value, label }),
);

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

  const selectedTags = new Map<string, OverpassTagFilter>();
  const tagSelect = document.createElement('select');
  tagSelect.className = 'plugin-control-input plugin-control-select';
  tagSelect.setAttribute('aria-label', UI_MESSAGES.tagFilterLabel);
  const chooseTag = document.createElement('option');
  chooseTag.value = '';
  chooseTag.textContent = UI_MESSAGES.chooseTag;
  tagSelect.appendChild(chooseTag);

  const tagsByGroup = new Map<string, AvailableOverpassTag[]>();
  for (const tag of AVAILABLE_OVERPASS_TAGS) {
    const groupTags = tagsByGroup.get(tag.group) ?? [];
    groupTags.push(tag);
    tagsByGroup.set(tag.group, groupTags);
  }

  for (const [groupName, tags] of tagsByGroup) {
    const optionGroup = document.createElement('optgroup');
    optionGroup.label = groupName;
    for (const tag of tags) {
      const option = document.createElement('option');
      option.value = `${tag.key}=${tag.value}`;
      option.textContent = tag.label;
      optionGroup.appendChild(option);
    }
    tagSelect.appendChild(optionGroup);
  }

  const chips = document.createElement('div');
  chips.className = 'plugin-control-chips';
  chips.setAttribute('aria-label', UI_MESSAGES.tagFilterLabel);

  const customTagRow = document.createElement('div');
  customTagRow.className = 'plugin-control-custom-tag';
  const customTagKey = document.createElement('input');
  customTagKey.className = 'plugin-control-input';
  customTagKey.type = 'text';
  customTagKey.placeholder = UI_MESSAGES.customTagKey;
  customTagKey.setAttribute('aria-label', UI_MESSAGES.customTagKey);
  const customTagValue = document.createElement('input');
  customTagValue.className = 'plugin-control-input';
  customTagValue.type = 'text';
  customTagValue.placeholder = UI_MESSAGES.customTagValue;
  customTagValue.setAttribute('aria-label', UI_MESSAGES.customTagValue);
  const addCustomTag = document.createElement('button');
  addCustomTag.type = 'button';
  addCustomTag.className = 'plugin-control-add-tag';
  addCustomTag.textContent = UI_MESSAGES.addTag;

  const addTagChip = (tag: OverpassTagFilter) => {
    const id = `${tag.key}=${tag.value}`;
    if (selectedTags.has(id)) return;
    selectedTags.set(id, tag);
    const option = [...tagSelect.options].find(({ value }) => value === id);
    if (option) option.disabled = true;
    renderTagChips();
  };

  const renderTagChips = () => {
    chips.replaceChildren();
    for (const [id, tag] of selectedTags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'plugin-control-chip';
      chip.textContent = tag.label;
      chip.title = `${tag.key}=${tag.value}`;
      chip.setAttribute('aria-label', UI_MESSAGES.removeTagFilter(tag.label));
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        selectedTags.delete(id);
        const option = [...tagSelect.options].find(({ value }) => value === id);
        if (option) option.disabled = false;
        renderTagChips();
      });
      chips.appendChild(chip);
    }
  };

  tagSelect.addEventListener('change', () => {
    const option = tagSelect.selectedOptions[0];
    if (!option?.value) return;

    const [key, value] = option.value.split('=');
    const tag = AVAILABLE_OVERPASS_TAGS.find(
      (candidate) => candidate.key === key && candidate.value === value,
    );
    if (tag) addTagChip(tag);
    tagSelect.value = '';
  });

  addCustomTag.addEventListener('click', () => {
    const key = customTagKey.value.trim();
    const value = customTagValue.value.trim();
    if (!key || !value) {
      setStatus(UI_MESSAGES.tagRequired);
      return;
    }

    addTagChip({ key, value, label: `${key}=${value}` });
    customTagKey.value = '';
    customTagValue.value = '';
  });
  customTagRow.append(customTagKey, customTagValue, addCustomTag);

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
      }, applyTagFilters(customTextarea.value, [...selectedTags.values()]));
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
  content.appendChild(tagSelect);
  content.appendChild(customTagRow);
  content.appendChild(chips);
  content.appendChild(customTextarea);
  content.appendChild(downloadButton);
  content.appendChild(status);

  return { content, status };
}
