import { FLOATING_PANEL_ID } from "./floating-panel";
import type { GeoLibreAppAPI, GeoLibreControl } from "./host-api";

/**
 * Demonstration of the GeoLibre top toolbar menu host API.
 *
 * A plugin can add its own top-level menu button to the GeoLibre banner (beside
 * Project / Edit / View / Plugins), with nested submenus and action items. Menu
 * items typically open one of the plugin's panels; here one opens the
 * template's floating panel and another closes it.
 *
 * Self-contained so it is easy to copy, adapt, or delete. Wire it from the
 * plugin's `activate`/`deactivate` hooks (see `src/geolibre.ts`).
 */

/** Stable id for this plugin's toolbar menu. Replace with your own. */
export const TOOLBAR_MENU_ID = "geolibre-plugin-template-menu";

/**
 * Register the template's top toolbar menu.
 *
 * @param app - The GeoLibre host API passed to the plugin's `activate` hook.
 * @returns A disposer that unregisters the menu, or `null` when the host has no
 *   top toolbar.
 */
export function registerTemplateToolbarMenu<TControl extends GeoLibreControl>(
  app: GeoLibreAppAPI<TControl>,
): (() => void) | null {
  if (!app.registerToolbarMenu) return null;

  return app.registerToolbarMenu({
    id: TOOLBAR_MENU_ID,
    label: "Template",
    items: [
      {
        type: "submenu",
        id: "tools",
        label: "Tools",
        items: [
          {
            id: "open-floating",
            label: "Open floating tools",
            // Disable the item on hosts that lack the capability, so it is not
            // a clickable no-op.
            disabled: !app.openFloatingPanel,
            onSelect: () => app.openFloatingPanel?.(FLOATING_PANEL_ID),
          },
        ],
      },
      { type: "separator" },
      {
        id: "close-panels",
        label: "Close panels",
        disabled: !app.closeFloatingPanel,
        onSelect: () => {
          app.closeFloatingPanel?.(FLOATING_PANEL_ID);
        },
      },
    ],
  });
}
