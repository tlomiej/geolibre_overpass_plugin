# Overpass Turbo Plugin for GeoLibre

**Version:** 0.1.4 · **Plugin id:** `overpass-turbo-plugin` · **License:** MIT

Overpass Turbo Plugin lets you download OpenStreetMap (OSM) data from the
[Overpass API](https://overpass-api.de/) straight into GeoLibre. You pick the
objects you want (for example shops, schools or bus stops), the plugin queries
the area currently visible on the map, and adds the results as a layer.

## What the plugin does

- Sends an Overpass query for the **current map view** (the visible area is
  used as the bounding box).
- Converts the result to GeoJSON: nodes become points, ways become lines or
  areas, and multipolygon/boundary relations become polygons.
- Adds the result as a native GeoLibre layer. OSM tags are kept as feature
  attributes, together with `osm_type` and `osm_id`.
- Running more queries with the same layer name **adds** objects to that layer
  instead of replacing it.

## How to use it

1. Open the plugin control on the map (top-right corner by default).
2. Zoom and pan the map to the area you want. Only this area is queried, so
   keep it reasonably small.
3. Choose what to download, in one of two modes:
   - **Picker** – choose a tag from **Filter by tag** (e.g. `amenity=school`),
     or type your own **Tag key** and **Tag value** and click **Add tag**. You
     can add several tags; remove one by clicking its chip.
   - **Advanced** – write your own Overpass QL query in the **Overpass query**
     editor. `{{bbox}}` is replaced with the visible area, and statements
     without an area filter are limited to it automatically. If the query has
     no `out` statement, `out body geom;` is added.
4. Optionally open **Advanced options**:
   - **Timeout (seconds)** – how long Overpass may work on the query
     (default 25).
   - **Layer name** – name of the target layer (default `Overpass data`).
     Use a new name to get a separate layer.
   - **Add only unique objects by ID** – skip objects that are already in
     the layer.
5. Click **Run Query**. While the query runs you can stop it with
   **Cancel query**.
6. When it finishes, the status line shows how many objects are displayed,
   and the layer appears in GeoLibre's layer list.

Tips:

- "The query returned no objects." means nothing matched in the visible area.
  Try a larger area or a different tag.
- If Overpass returns an error (e.g. 429 or 504), wait a moment, make the
  area smaller or raise the timeout.
- An internet connection is required; data comes from
  `https://overpass-api.de/api/interpreter`.

## Data source and attribution

All data comes from [OpenStreetMap](https://www.openstreetmap.org/) and is
downloaded through the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
(public instance at [overpass-api.de](https://overpass-api.de/)).

- OpenStreetMap data is © OpenStreetMap contributors and is available under
  the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
  When you publish maps or data made with this plugin, credit
  "© OpenStreetMap contributors".
- The public Overpass API instance is shared by many users. Keep queries small
  and follow its [usage policy](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
- This plugin is not affiliated with OpenStreetMap, the OpenStreetMap
  Foundation, Overpass API or overpass turbo.

Each layer added by the plugin stores this attribution in its metadata
(`attribution: "© OpenStreetMap contributors (ODbL), via Overpass API"`).