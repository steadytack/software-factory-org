---
group: Map
pages: [/map]
---

## Layers: base map and data {#map-layers}
<!-- keywords: layers, basemap, base map, overlay, geojson, wms, wfs, style, panel, filter, colour, surveys, shapefile, flood, bng -->

The map's panel has three tabs: **Layers**, **Draw** and **Export** (on a phone, the bar at the bottom of the map opens each one; on a computer, the arrow at the top right). In Layers, **Base map → Change** picks the map underneath (OpenStreetMap, Esri and, with a key, Ordnance Survey and MapTiler). Below it, drag Sketches, Sites, Surveys and your data layers to set what draws on top, and hide them with the eye. Expand one to choose what it shows and how: pick what to **Colour by** (one colour, or for sites their type or status), apply a colour scheme or set each value's colour yourself, and tick the values to show (e.g. only *completed* surveys); size and labels are there too. A data layer can be filtered on one of its properties. Surveys are a ring around each site. **Add data** brings in GeoJSON files or zipped shapefiles (several at once, chosen or dropped; British National Grid is converted; up to 75 MB each), a suggested service such as the Environment Agency's flood zones, or any WMS / WFS / OGC API service. For national datasets use the WMS: the server draws it, so it costs nothing to show. WFS and OGC API layers load what's in view (up to 5,000 features) — pan, then **Refresh for this view**. Base-map areas you've viewed stay available offline; others show blank until you have a signal.

## Draw and measure tools {#map-draw}
<!-- keywords: draw, measure, polygon, line, circle, marker, snapping -->

Pick a tool in the **Draw** tab (on a computer, the pencil button under the zoom controls opens it): marker, line, shape, circle, or measure a distance or area. A bar at the bottom says how to use it, switches **snapping**, and **Done** puts the tool away. With snapping on, whatever you place — a marker, a circle centre, each corner of a line or shape — jumps onto a nearby site, survey, sketch, or a corner or edge of your data layers (only what's shown counts). Your sketches are listed in the Draw tab to style, zoom to or delete; click one on the map to move it or drag its corners, and its row opens. To style several at once, tick them in the list and use **Style** (or delete them together). Shapes can have a **Pattern** (hatching, dots) as well as a fill. Your sketches are kept in this browser, so they're still there after a reload; Export saves them as files. Expand one to show its **measurements** or **coordinates** (a marker's position, each point of a line, each corner of a shape and its centre, a circle's centre); **Labels** sets the units and whether coordinates are BNG (e.g. 625597, 245940), an OS grid reference or latitude/longitude. The Export tab saves the map as a PNG or PDF, and sketches as GeoJSON (with their names and styles) or CSV (with positions, lengths and areas).

## Printing a map sheet {#map-export}
<!-- keywords: print, export, pdf, png, sheet, title block, grid reference, legend, locator -->

The **Export** tab makes an A4 or A3 sheet with the map filling most of the page (landscape: details down the right; portrait: along the bottom). A small table gives the NE corner, centre and SW corner as a **grid reference** (e.g. TQ 32700 80399) and BNG easting, northing (e.g. 532700, 180399). It says where the sheet is, sized to the area: a site's address when printed on one, the nearest address under 1 km across, the town up to 15 km, the county or region up to 150 km, and the countries beyond (e.g. England and Wales, United Kingdom). Type your own in Location to override. A locator map shows where the sheet sits, and the legend lists only what's on it, with counts. Fill in drawing no., revision, status and notes for the title block. PDFs are 300 dpi with real, searchable text.

## Location search {#map-search}
<!-- keywords: search, postcode, coordinate, bng, address -->

The search box at the top of the map accepts easting/northing (BNG), latitude/longitude, UK postcodes (with autocomplete) and free-text addresses. Results fly the map to the location. Beside it are zoom, reset view, my location and full page (on a phone, pinch to zoom; reset and my location sit at the bottom right, and ⓘ shows the coordinates and map credits).

## Right-click menu {#map-context}
<!-- keywords: context menu, right click, coordinates, links -->

Right-click anywhere on the map for the coordinates at that point (lat/lng and British National Grid), a postcode/address lookup, and links to open the location in external map services.
