import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoLibreNativeLayerRegistration } from '../geolibre/host-api';
import { MAP_COLOR_TOKENS } from '../styles/map-color-tokens';
import { DEFAULT_OVERPASS_QUERY, fetchOverpssData } from './overpass-data';
import { UI_MESSAGES } from './messages';
import { PLUGIN_VERSION } from '../../VERSION';
import type { OverpassFeatureCollection } from './PluginModels';
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

  const scrollArea = document.createElement('div');
  scrollArea.className = 'plugin-control-scroll-area';

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

  const layerNameRow = document.createElement('label');
  layerNameRow.className = 'plugin-control-layer-name-row';
  layerNameRow.textContent = UI_MESSAGES.layerNameLabel;
  const layerNameInput = document.createElement('input');
  layerNameInput.className = 'plugin-control-input plugin-control-layer-name';
  layerNameInput.type = 'text';
  layerNameInput.value = UI_MESSAGES.overpassLayerName;
  layerNameInput.setAttribute('aria-label', UI_MESSAGES.layerNameLabel);
  layerNameRow.appendChild(layerNameInput);

  const selectedTags = new Map<string, OverpassTagFilter>();
  const featuresByLayerName = new Map<
    string,
    OverpassFeatureCollection['features']
  >();
  const layerIdsByName = new Map<
    string,
    { id: string; nativeLayerIds: string[]; sourceIds: string[] }
  >();
  const defaultPickerTag = AVAILABLE_OVERPASS_TAGS.find(
    ({ key, value }) => key === 'nwr' && value === '*',
  );
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
        setStatus('');
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
    if (tag) {
      addTagChip(tag);
      setStatus('');
    }
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
    setStatus('');
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
  advancedOptions.append(
    advancedOptionsSummary,
    timeoutRow,
    layerNameRow,
    customTagRow,
    uniqueByIdRow,
  );

  const about = document.createElement('details');
  about.className = 'plugin-control-about';
  const aboutSummary = document.createElement('summary');
  aboutSummary.textContent = UI_MESSAGES.aboutTitle;
  const aboutDescription = document.createElement('p');
  aboutDescription.textContent = UI_MESSAGES.aboutDescription;
  const aboutSteps = document.createElement('ol');
  for (const step of UI_MESSAGES.aboutSteps) {
    const item = document.createElement('li');
    item.textContent = step;
    aboutSteps.appendChild(item);
  }
  const aboutVersion = document.createElement('p');
  aboutVersion.className = 'plugin-control-about-version';
  aboutVersion.textContent = UI_MESSAGES.aboutVersion(PLUGIN_VERSION);
  about.append(aboutSummary, aboutDescription, aboutSteps, aboutVersion);

  const queryEditor = document.createElement('textarea');
  queryEditor.className = 'plugin-control-input plugin-control-query-editor';
  queryEditor.setAttribute('aria-label', UI_MESSAGES.queryEditorLabel);
  queryEditor.setAttribute('spellcheck', 'false');

  const syncQueryFromPicker = () => {
    queryEditor.value = selectedTags.size === 0
      ? ''
      : buildPickerQuery([...selectedTags.values()], Number(timeoutInput.value) || 25);
    selectorInSync = true;
    if (mode === 'picker') modeNotice.textContent = '';
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
    modeNotice.textContent = advanced || selectorInSync
      ? ''
      : UI_MESSAGES.pickerModeUnavailable;
  };

  pickerModeButton.addEventListener('click', () => {
    const parsed = parsePickerQuery(queryEditor.value, uniqueByIdCheckbox.checked);
    if (!parsed) {
      selectorInSync = false;
      setMode('picker');
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
    if (mode === 'picker' && selectorInSync) syncQueryFromPicker();
    setMode('advanced');
  });

  queryEditor.addEventListener('input', () => {
    selectorInSync = false;
    syncAdvancedOptionsFromQuery();
    modeNotice.textContent = '';
  });

  timeoutInput.addEventListener('input', syncAdvancedOptionsToQuery);
  uniqueByIdCheckbox.addEventListener('change', syncAdvancedOptionsToQuery);

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'plugin-control-action';
  downloadButton.textContent = UI_MESSAGES.runQuery;

  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'plugin-control-loading';
  loadingOverlay.hidden = true;
  loadingOverlay.setAttribute('role', 'alertdialog');
  loadingOverlay.setAttribute('aria-live', 'assertive');
  loadingOverlay.setAttribute('aria-modal', 'true');
  loadingOverlay.setAttribute('aria-label', UI_MESSAGES.queryLoading);

  const loadingPanel = document.createElement('div');
  loadingPanel.className = 'plugin-control-loading-panel';
  const loadingSpinner = document.createElement('div');
  loadingSpinner.className = 'plugin-control-loading-spinner';
  loadingSpinner.setAttribute('aria-hidden', 'true');
  const loadingDescription = document.createElement('p');
  loadingDescription.textContent = UI_MESSAGES.queryLoading;
  const cancelQueryButton = document.createElement('button');
  cancelQueryButton.type = 'button';
  cancelQueryButton.className = 'plugin-control-cancel-query';
  cancelQueryButton.textContent = UI_MESSAGES.cancelQuery;
  loadingPanel.append(loadingSpinner, loadingDescription, cancelQueryButton);
  loadingOverlay.appendChild(loadingPanel);

  let activeQueryController: AbortController | undefined;
  cancelQueryButton.addEventListener('click', () => {
    const controller = activeQueryController;
    if (!controller) return;

    activeQueryController = undefined;
    controller.abort();
    setLoadingState(false);
    setStatus(UI_MESSAGES.queryCancelled);
    downloadButton.focus();
  });

  downloadButton.addEventListener('click', async () => {
    const map = getMap();
    const mapBounds = map?.getBounds();
    if (!mapBounds) {
      setStatus(UI_MESSAGES.mapUnavailable);
      return;
    }

    let queryController: AbortController | undefined;
    try {
      const timeoutSeconds = Number(timeoutInput.value);
      if (mode === 'picker' && (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1)) {
        setStatus(UI_MESSAGES.invalidTimeout);
        return;
      }
      if (mode === 'picker' && selectedTags.size === 0) {
        setStatus(UI_MESSAGES.noPickerFilters);
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

      queryController = new AbortController();
      activeQueryController = queryController;
      setLoadingState(true);
      scrollArea.scrollTop = 0;
      setStatus(UI_MESSAGES.queryRunning);
      cancelQueryButton.focus();

      const geojson = await fetchData({
        south: mapBounds.getSouth(),
        west: mapBounds.getWest(),
        north: mapBounds.getNorth(),
        east: mapBounds.getEast(),
      }, query, queryController.signal);
      if (queryController.signal.aborted) return;
      if (geojson.features.length === 0) {
        setStatus(UI_MESSAGES.noSupportedGeometry);
        return;
      }

      const layerName = layerNameInput.value.trim() || UI_MESSAGES.overpassLayerName;
      let layerIds = layerIdsByName.get(layerName);
      if (!layerIds) {
        const layerId = layerName === UI_MESSAGES.overpassLayerName
          ? 'overpass-data'
          : `overpass-data-${hashLayerName(layerName)}`;
        layerIds = {
          id: layerId,
          nativeLayerIds: [
            `${layerId}-fill-layer`,
            `${layerId}-line-layer`,
            `${layerId}-point-layer`,
          ],
          sourceIds: [`${layerId}-source`],
        };
        layerIdsByName.set(layerName, layerIds);
      }

      const uniqueById = uniqueByIdCheckbox.checked;
      const queryFeatures = uniqueById
        ? geojson.features.filter(
            (feature, index, features) =>
              feature.id === undefined ||
              features.findIndex((candidate) => candidate.id === feature.id) === index,
          )
        : geojson.features;
      const accumulatedFeatures = featuresByLayerName.get(layerName) ?? [];
      const existingFeatureIds = uniqueById
        ? new Set(accumulatedFeatures.flatMap(({ id }) => id === undefined ? [] : [id]))
        : undefined;
      const appendedFeatures = existingFeatureIds
        ? queryFeatures.filter((feature) => {
            if (feature.id === undefined || !existingFeatureIds.has(feature.id)) {
              if (feature.id !== undefined) existingFeatureIds.add(feature.id);
              return true;
            }
            return false;
          })
        : queryFeatures;
      const allFeatures = [...accumulatedFeatures, ...appendedFeatures];
      const layerGeojson = {
        ...geojson,
        features: allFeatures,
      };

      const registered = registerNativeLayer({
        ...layerIds,
        name: layerName,
        geojson: layerGeojson,
        opacity: 1,
        style: {
          circleRadius: 6,
          fillColor: MAP_COLOR_TOKENS.fillSymbol,
          strokeColor: MAP_COLOR_TOKENS.fillSymbol,
          strokeWidth: 2,
          fillOpacity: 0.65,
        },
        metadata: { source: UI_MESSAGES.overpassSourceName, featureCount: allFeatures.length },
      });
      if (registered) {
        featuresByLayerName.set(layerName, allFeatures);
        setStatus(UI_MESSAGES.objectsDisplayed(allFeatures.length));
      }
    } catch (error) {
      if (!queryController?.signal.aborted) {
        setStatus(error instanceof Error ? error.message : UI_MESSAGES.unableToLoadOverpassData);
      }
    } finally {
      if (queryController && activeQueryController === queryController) {
        activeQueryController = undefined;
        setLoadingState(false);
      }
    }
  });

  const status = document.createElement('div');
  status.className = 'plugin-control-status';
  status.textContent = '';

  const footer = document.createElement('div');
  footer.className = 'plugin-control-footer';

  const setLoadingState = (isLoading: boolean) => {
    loadingOverlay.hidden = !isLoading;
    modeSwitch.inert = isLoading;
    modeNotice.inert = isLoading;
    scrollArea.inert = isLoading;
    footer.inert = isLoading;
    downloadButton.disabled = isLoading;
    if (isLoading) {
      content.setAttribute('aria-busy', 'true');
    } else {
      content.removeAttribute('aria-busy');
    }
  };

  if (defaultPickerTag) addTagChip(defaultPickerTag);
  syncQueryFromPicker();
  scrollArea.append(
    tagSelect,
    chips,
    queryEditor,
    advancedOptions,
    about,
  );
  footer.append(status, downloadButton);
  content.append(modeSwitch, modeNotice, scrollArea, footer, loadingOverlay);

  setMode('picker');

  return { content, status };
}

function hashLayerName(layerName: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < layerName.length; index += 1) {
    hash = Math.imul(hash ^ layerName.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
