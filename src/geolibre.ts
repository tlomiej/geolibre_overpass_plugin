import { PluginControl } from "./lib/core/PluginControl";
import { PLUGIN_VERSION } from "./VERSION";
import type { PluginState } from "./lib/core/types";
import type {
  GeoLibreAppAPI,
  GeoLibreMapControlPosition,
  GeoLibrePlugin,
} from "./lib/geolibre/host-api";
import { registerTemplateFloatingPanel } from "./lib/geolibre/floating-panel";
import { registerTemplateToolbarMenu } from "./lib/geolibre/toolbar-menu";
import { PLUGIN_DATA_PARAM, maybeHandleDeepLink } from "./lib/utils/deep-link";
import "./lib/styles/plugin-control.css";

// The host API is generic over the control type; bind it to this plugin's
// concrete control so the wired callbacks are fully typed.
type AppAPI = GeoLibreAppAPI<PluginControl>;

let control: PluginControl | null = null;
let position: GeoLibreMapControlPosition = "top-right";
let pendingState: Partial<PluginState> | null = null;
// Disposers for the demo UI surfaces; each is null when the host does not
// provide that surface. See ./lib/geolibre/{floating-panel,toolbar-menu}.ts.
let disposeFloatingPanel: (() => void) | null = null;
let disposeToolbarMenu: (() => void) | null = null;

function createControl(app: AppAPI): PluginControl {
  const nextControl = new PluginControl({
    collapsed: pendingState?.collapsed ?? true,
    panelWidth: pendingState?.panelWidth ?? 300,
    title: 'GeoLibre Plugin Template',
    // Bind optional host capabilities; each falls back to a no-op on hosts (or
    // standalone usage) that do not provide them.
    pickFiles: () => app.pickLocalDirectoryFiles?.() ?? Promise.resolve(null),
    registerNativeLayer: (layer) => {
      if (!app.registerExternalNativeLayer) return false;
      app.registerExternalNativeLayer(layer);
      return true;
    },
    unregisterNativeLayer: (id) => app.unregisterExternalNativeLayer?.(id),
  });

  if (pendingState) {
    nextControl.setState(pendingState);
  }

  return nextControl;
}

function isPluginState(value: unknown): value is Partial<PluginState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if ("collapsed" in candidate && typeof candidate.collapsed !== "boolean") {
    return false;
  }
  if ("panelWidth" in candidate && typeof candidate.panelWidth !== "number") {
    return false;
  }
  if (
    "data" in candidate &&
    (typeof candidate.data !== "object" ||
      candidate.data === null ||
      Array.isArray(candidate.data))
  ) {
    return false;
  }

  return true;
}

export const plugin: GeoLibrePlugin<PluginControl> = {
  id: "overpass-turbo-plugin",
  name: "Overpass Turbo Plugin",
  version: PLUGIN_VERSION,
  urlParameterNames: [PLUGIN_DATA_PARAM],
  activate(app) {
    control = control ?? createControl(app);
    const added = app.addMapControl(control, position);
    if (!added) {
      control = null;
      return false;
    }
    // Demonstrate the native plugin UI surfaces. The template right panel is
    // disabled; the floating panel is registered and opened on demand from the
    // toolbar menu.
    disposeFloatingPanel = registerTemplateFloatingPanel(app);
    disposeToolbarMenu = registerTemplateToolbarMenu(app);
  },
  // Deep link: GeoLibre auto-activates this plugin when a URL carries a
  // parameter it owns and dispatches the parsed parameters here, e.g.
  // ?plugin-data=https://example.com/dataset.zip
  handleUrlParameters(_app, params) {
    if (control) return maybeHandleDeepLink(control, params);
  },
  deactivate(app) {
    disposeToolbarMenu?.();
    disposeToolbarMenu = null;
    disposeFloatingPanel?.();
    disposeFloatingPanel = null;
    if (!control) return;
    pendingState = control.getState();
    app.removeMapControl(control);
    control = null;
  },
  getMapControlPosition() {
    return position;
  },
  setMapControlPosition(app, nextPosition) {
    position = nextPosition;
    if (!control) return;

    app.removeMapControl(control);
    const added = app.addMapControl(control, position);
    if (!added) {
      pendingState = control.getState();
      control = null;
      return false;
    }
  },
  getProjectState() {
    return control?.getState() ?? pendingState ?? undefined;
  },
  applyProjectState(_app, state) {
    if (!isPluginState(state)) return false;
    pendingState = state;
    control?.setState(state);
  },
};

export default plugin;
