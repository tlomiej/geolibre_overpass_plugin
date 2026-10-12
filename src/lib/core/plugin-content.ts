import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoLibreNativeLayerRegistration } from '../geolibre/host-api';
import { MAP_COLOR_TOKENS } from '../styles/map-color-tokens';
import { DEFAULT_OVERPASS_QUERY, fetchOverpssData } from './overpass-poi';
import { UI_MESSAGES } from './messages';
import tagCatalogJson from './available-tags.jsonc?raw';
import {
  applyQueryTimeout,
  applyTagFilters,
  buildPickerQuery,
  parsePickerQuery,
  queryForApi,
  type OverpassTagFilter,
} from './query-tags';

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

  let mode: 'picker' | 'advanced' = 'picker';

  const modeSwitch = document.createElement('div');
  modeSwitch.className = 'plugin-control-mode-switch';
  modeSwitch.setAttribute('role', 'group');
  modeSwitch.setAttribute('aria-label', 'Query mode');
  const pickerModeButton = document.createElement('button');
  pickerModeButton.type = 'button';
  pickerModeButton.textContent = UI_MESSAGES.pickerMode;
  pickerModeButton.setAttribute('aria-pressed', 'true');
  const advancedModeButton = document.createElement('button');
  advancedModeButton.type = 'button';
  advancedModeButton.textContent = UI_MESSAGES.advancedMode;
  advancedModeButton.setAttribute('aria-pressed', 'false');
  modeSwitch.append(pickerModeButton, advancedModeButton);

  const modeNotice = document.createElement('div');
  modeNotice.className = 'plugin-control-mode-notice';
  modeNotice.setAttribute('role', 'status');

  const timeoutRow = document.createElement('label');
  timeoutRow.className = 'plugin-control-timeout-row';
  timeoutRow.textContent = UI_MESSAGES.timeoutLabel;
  const timeoutInput = document.createElement('input');
  timeoutInput.className = 'plugin-control-input plugin-control-timeout';
  timeoutInput.id = 'overpass-query-timeout';
  timeoutInput.type = 'number';
  timeoutInput.min = '1';
  timeoutInput.step = '1';
  timeoutInput.value = '25';
  timeoutInput.setAttribute('aria-label', UI_MESSAGES.timeoutLabel);
  timeoutRow.htmlFor = timeoutInput.id;
  timeoutRow.appendChild(timeoutInput);

  const selectedTags = new Map<string, OverpassTagFilter>();
  let selectorInSync = true;
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

    const selectsAllObjects = tag.key === 'nwr' && tag.value === '*';
    const selectedAllObjects = selectedTags.has('nwr=*');
    if (selectsAllObjects || selectedAllObjects) {
      for (const selectedId of selectedTags.keys()) {
        const option = [...tagSelect.options].find(({ value }) => value === selectedId);
        if (option) option.disabled = false;
      }
      selectedTags.clear();
    }

    selectedTags.set(id, tag);
    const option = [...tagSelect.options].find(({ value }) => value === id);
    if (option) option.disabled = true;
    renderTagChips();
    syncQueryFromPicker();
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
        syncQueryFromPicker();
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

  const advancedOptions = document.createElement('details');
  advancedOptions.className = 'plugin-control-advanced-options';
  const advancedOptionsSummary = document.createElement('summary');
  advancedOptionsSummary.textContent = UI_MESSAGES.advancedOptions;

  const uniqueByIdRow = document.createElement('label');
  uniqueByIdRow.className = 'plugin-control-unique-by-id-row';
  const uniqueByIdCheckbox = document.createElement('input');
  uniqueByIdCheckbox.className = 'plugin-control-unique-by-id';
  uniqueByIdCheckbox.type = 'checkbox';
  uniqueByIdCheckbox.checked = true;
  uniqueByIdCheckbox.setAttribute('aria-label', UI_MESSAGES.uniqueByIdLabel);
  uniqueByIdRow.append(uniqueByIdCheckbox, document.createTextNode(UI_MESSAGES.uniqueByIdLabel));
  advancedOptions.append(advancedOptionsSummary, timeoutRow, customTagRow, uniqueByIdRow);

  const queryEditor = document.createElement('textarea');
  queryEditor.className = 'plugin-control-input plugin-control-query-editor';
  queryEditor.setAttribute('aria-label', UI_MESSAGES.queryEditorLabel);
  queryEditor.setAttribute('spellcheck', 'false');

  const syncQueryFromPicker = () => {
    queryEditor.value = buildPickerQuery(
      [...selectedTags.values()],
      Number(timeoutInput.value) || 25,
      uniqueByIdCheckbox.checked,
    );
    selectorInSync = true;
  };

  const syncAdvancedOptionsToQuery = () => {
    if (mode === 'picker') {
      syncQueryFromPicker();
      return;
    }

    let query = queryEditor.value;
    const timeoutSeconds = Number(timeoutInput.value);
    if (Number.isInteger(timeoutSeconds) && timeoutSeconds >= 1) {
      const timeoutDirective = `[timeout:${timeoutSeconds}];`;
      if (/^\s*\[timeout:\s*\d+\s*\]\s*;?/i.test(query)) {
        query = query.replace(/^\s*\[timeout:\s*\d+\s*\]\s*;?/i, timeoutDirective);
      } else {
        query = `${timeoutDirective}\n${query}`;
      }
    }

    const uniqueDirective = `// GeoLibre: unique-by-id=${uniqueByIdCheckbox.checked}`;
    if (/^\s*\/\/\s*GeoLibre:\s*unique-by-id=(true|false)\s*$/im.test(query)) {
      query = query.replace(/^\s*\/\/\s*GeoLibre:\s*unique-by-id=(true|false)\s*$/im, uniqueDirective);
    } else {
      query = `${uniqueDirective}\n${query}`;
    }
    queryEditor.value = query;
  };

  const syncAdvancedOptionsFromQuery = () => {
    const timeout = queryEditor.value.match(/^\s*\[timeout:\s*(\d+)\s*\]\s*;?/i);
    if (timeout) timeoutInput.value = timeout[1];
    const uniqueById = queryEditor.value.match(
      /^\s*\/\/\s*GeoLibre:\s*unique-by-id=(true|false)\s*$/im,
    );
    if (uniqueById) uniqueByIdCheckbox.checked = uniqueById[1].toLowerCase() === 'true';
  };

  const setMode = (nextMode: 'picker' | 'advanced') => {
    mode = nextMode;
    const advanced = mode === 'advanced';
    pickerModeButton.setAttribute('aria-pressed', String(!advanced));
    advancedModeButton.setAttribute('aria-pressed', String(advanced));
    tagSelect.hidden = advanced;
    chips.hidden = advanced;
    customTagRow.hidden = advanced;
    queryEditor.hidden = !advanced;
    modeNotice.textContent = advanced
      ? UI_MESSAGES.pickerModeHint
      : selectorInSync
        ? ''
        : UI_MESSAGES.pickerModeUnavailable;
  };

  pickerModeButton.addEventListener('click', () => {
    const parsed = parsePickerQuery(queryEditor.value);
    if (!parsed) {
      selectorInSync = false;
      setMode('advanced');
      modeNotice.textContent = UI_MESSAGES.pickerModeUnavailable;
      return;
    }

    selectedTags.clear();
    for (const tag of parsed.tags) {
      selectedTags.set(`${tag.key}=${tag.value}`, tag);
    }
    for (const option of tagSelect.options) {
      option.disabled = selectedTags.has(option.value);
    }
    renderTagChips();
    timeoutInput.value = String(parsed.timeoutSeconds);
    uniqueByIdCheckbox.checked = parsed.uniqueById;
    selectorInSync = true;
    setMode('picker');
  });

  advancedModeButton.addEventListener('click', () => {
    if (mode === 'picker') syncQueryFromPicker();
    setMode('advanced');
  });

  queryEditor.addEventListener('input', () => {
    selectorInSync = false;
    syncAdvancedOptionsFromQuery();
    modeNotice.textContent = UI_MESSAGES.pickerModeHint;
  });

  timeoutInput.addEventListener('input', syncAdvancedOptionsToQuery);
  uniqueByIdCheckbox.addEventListener('change', syncAdvancedOptionsToQuery);

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
      const timeoutSeconds = Number(timeoutInput.value);
      if (mode === 'picker' && (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1)) {
        setStatus(UI_MESSAGES.invalidTimeout);
        return;
      }

      let query: string;
      if (mode === 'advanced') {
        query = queryForApi(queryEditor.value);
        if (!query) {
          setStatus(UI_MESSAGES.emptyQuery);
          return;
        }
      } else {
        query = applyQueryTimeout(
          applyTagFilters(DEFAULT_OVERPASS_QUERY, [...selectedTags.values()]),
          timeoutSeconds,
        );
      }

      const geojson = await fetchData({
        south: mapBounds.getSouth(),
        west: mapBounds.getWest(),
        north: mapBounds.getNorth(),
        east: mapBounds.getEast(),
      }, query);
      if (geojson.features.length === 0) {
        setStatus(UI_MESSAGES.noSupportedGeometry);
        return;
      }

      const uniqueById = mode === 'advanced'
        ? !/^\s*\/\/\s*GeoLibre:\s*unique-by-id=false\s*$/im.test(queryEditor.value)
        : uniqueByIdCheckbox.checked;
      const uniqueFeatures = uniqueById
        ? geojson.features.filter(
            (feature, index, features) =>
              feature.id === undefined ||
              features.findIndex((candidate) => candidate.id === feature.id) === index,
          )
        : geojson.features;
      const layerGeojson = {
        ...geojson,
        features: uniqueFeatures,
      };

      const registered = registerNativeLayer({
        id: 'overpass-data',
        name: UI_MESSAGES.overpassLayerName,
        geojson: layerGeojson,
        nativeLayerIds: [
          'overpass-data-fill-layer',
          'overpass-data-line-layer',
          'overpass-data-point-layer',
        ],
        sourceIds: ['overpass-data-source'],
        opacity: 1,
        style: { circleRadius: 6, fillColor: MAP_COLOR_TOKENS.fillSymbol, fillOpacity: 0.65 },
        metadata: { source: UI_MESSAGES.overpassSourceName, featureCount: uniqueFeatures.length },
      });
      if (registered) {
        setStatus(UI_MESSAGES.objectsDisplayed(uniqueFeatures.length));
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

  syncQueryFromPicker();
  content.appendChild(modeSwitch);
  content.appendChild(modeNotice);
  content.appendChild(tagSelect);
  content.appendChild(chips);
  content.appendChild(queryEditor);
  content.appendChild(advancedOptions);
  content.appendChild(status);
  content.appendChild(downloadButton);

  setMode('picker');

  return { content, status };
}
