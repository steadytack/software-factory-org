import type { HelpTopic } from "./types";

/** Per-page help topics. Each page registers its own via useRegisterHelpTopics
 *  so the drawer only shows topics relevant to what's on screen. */

export const DASHBOARD_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-dashboard-kpis",
    title: "Understanding the KPI cards",
    group: "Dashboard",
    order: 1,
    keywords: ["kpi", "dashboard", "draft", "surveys", "stats"],
    body: (
      <>
        The four cards summarise live data: <strong>draft surveys</strong> (not
        yet completed), <strong>surveys this week</strong> with the change vs
        the prior week, and <strong>total sites</strong>. The draft-surveys
        card opens the matching surveys; the total-sites card opens the sites
        table.
      </>
    ),
  },
  {
    id: "help-dashboard-charts",
    title: "Reading the charts",
    group: "Dashboard",
    order: 2,
    keywords: ["chart", "trend", "category", "graph"],
    body: (
      <>
        The line chart shows surveys per day over the last 7 days; the bar
        chart breaks surveys down by status. Hover for exact values.
      </>
    ),
  },
];

export const SITES_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-sites-add",
    title: "Adding a site",
    group: "Sites",
    order: 1,
    keywords: ["add", "create", "new site", "dialog"],
    body: (
      <>
        Click <strong>Add site</strong> (or press <kbd>N</kbd>). A name and a
        location are required: click the map or drag the pin, or type an
        easting and northing; the address and postcode follow the pin. New
        sites appear in the table straight away, even offline.
      </>
    ),
  },
  {
    id: "help-sites-views",
    title: "Saved views",
    group: "Sites",
    order: 2,
    keywords: ["views", "bookmark", "filter", "save", "layout"],
    body: (
      <>
        The bookmark button saves the current filter, sorting, column
        visibility, column order and widths under a name. Views are stored in
        this browser and can be applied or deleted from the same menu.
      </>
    ),
  },
  {
    id: "help-sites-csv",
    title: "CSV export",
    group: "Sites",
    order: 3,
    keywords: ["csv", "export", "download", "excel"],
    body: (
      <>
        The export button (or &ldquo;Export … as CSV&rdquo; in the Ctrl K
        palette) downloads the <em>filtered</em> rows as CSV — apply a filter
        first to export a subset.
      </>
    ),
  },
];

export const SITE_DETAIL_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-detail-tabs",
    title: "Record tabs",
    group: "Site detail",
    order: 1,
    keywords: ["tabs", "overview", "surveys", "comments", "attachments", "changelog"],
    body: (
      <>
        A site has five tabs: <strong>Overview</strong> (an at-a-glance
        summary, then its details to edit in place),{" "}
        <strong>Surveys</strong> (every visit to the site — add, edit, filter
        and change status in place),{" "}
        <strong>Comments</strong>, <strong>Attachments</strong> (several files
        at once, or drag and drop; max 10 MB each) and{" "}
        <strong>History</strong> (every change and who made it). Add survey is
        in the header; archive and delete are in the <strong>⋯</strong>{" "}
        menu.
      </>
    ),
  },
  {
    id: "help-detail-dirty",
    title: "Unsaved changes",
    group: "Site detail",
    order: 2,
    keywords: ["save", "discard", "dirty", "changes"],
    body: (
      <>
        Changing any field on the Overview brings up a{" "}
        <strong>Save bar</strong> with <strong>Save</strong> and{" "}
        <strong>Discard</strong>. Discard goes back to the last saved version;
        leaving the page with unsaved changes asks first.
      </>
    ),
  },
];

export const SURVEY_DETAIL_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-survey-detail",
    title: "A survey's page",
    group: "Survey",
    order: 1,
    keywords: ["survey", "visit", "inspection", "comment"],
    body: (
      <>
        One visit to a site: its <strong>comments</strong>,{" "}
        <strong>attachments</strong> and <strong>history</strong>. Edit the
        date, surveyor, status or summary with Edit survey.
      </>
    ),
  },
];

export const SURVEYS_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-surveys-table",
    title: "Working with surveys",
    group: "Surveys",
    order: 1,
    keywords: ["survey", "visit", "status", "draft", "completed"],
    body: (
      <>
        Every survey across all sites. Click a row to open the survey&apos;s
        page. Switch on edit mode to change status, surveyor or summary
        inline, or click the site to open it.
      </>
    ),
  },
];

export const MAP_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-map-layers",
    title: "Layers: base map and data",
    group: "Map",
    order: 1,
    keywords: ["layers", "basemap", "base map", "overlay", "geojson", "wms", "wfs", "style", "panel", "filter", "colour", "surveys", "shapefile", "flood", "bng"],
    body: (
      <>
        The map&apos;s panel has three tabs: <strong>Layers</strong>,{" "}
        <strong>Draw</strong> and <strong>Export</strong> (on a phone, the
        bar at the bottom of the map opens each one; on a computer, the arrow
        at the top right). In Layers, <strong>Base map → Change</strong> picks
        the map underneath (OpenStreetMap, Esri and, with a key, Ordnance
        Survey and MapTiler). Below it, drag Sketches,
        Sites, Surveys and your data layers to set what draws on top, and
        hide them with the eye. Expand one to choose what it shows and how:
        pick what to <strong>Colour by</strong> (one colour, or for sites
        their type or status), apply a colour scheme or set each
        value&apos;s colour yourself, and tick the values to show (e.g. only{" "}
        <em>completed</em> surveys); size and labels are there too. A data
        layer can be filtered on one of its properties. Surveys are a ring
        around each site. <strong>Add data</strong> brings in
        GeoJSON files or zipped shapefiles (several at once, chosen or
        dropped; British National Grid is converted; up to 75 MB each), a
        suggested service such as the Environment Agency&apos;s flood zones,
        or any WMS / WFS / OGC API service. For national datasets use the
        WMS: the server draws it, so it costs nothing to show. WFS and OGC
        API layers load what&apos;s in view (up to 5,000 features) — pan,
        then <strong>Refresh for this view</strong>. Base-map areas
        you&apos;ve viewed stay available offline; others show blank until
        you have a signal.
      </>
    ),
  },
  {
    id: "help-map-draw",
    title: "Draw and measure tools",
    group: "Map",
    order: 2,
    keywords: ["draw", "measure", "polygon", "line", "circle", "marker", "snapping"],
    body: (
      <>
        Pick a tool in the <strong>Draw</strong> tab (on a computer, the
        pencil button under the zoom controls opens it): marker, line, shape, circle, or
        measure a distance or area. A bar at the bottom says how to use it,
        switches <strong>snapping</strong>, and <strong>Done</strong> puts the
        tool away. With snapping on, whatever you place — a marker, a circle
        centre, each corner of a line or shape — jumps onto a nearby site,
        survey, sketch, or a corner or edge of your data
        layers (only what&apos;s shown counts). Your sketches are listed in the Draw tab to style, zoom to
        or delete; click one on the map to move it or drag its corners, and its row opens. To style several
        at once, tick them in the list and use <strong>Style</strong> (or delete them together). Shapes can have a <strong>Pattern</strong> (hatching, dots) as well as a fill. Your sketches are kept in this browser, so they&apos;re still there after a reload; Export saves them as files. Expand one to show its <strong>measurements</strong> or{" "}
        <strong>coordinates</strong> (a marker&apos;s position, each point of a
        line, each corner of a shape and its centre, a circle&apos;s centre);{" "}
        <strong>Labels</strong> sets the units and whether coordinates are BNG
        (e.g. 625597, 245940), an OS grid reference or latitude/longitude. The Export tab saves
        the map as a PNG or PDF, and sketches as GeoJSON (with their names and styles) or CSV (with positions, lengths and areas).
      </>
    ),
  },
  {
    id: "help-map-export",
    title: "Printing a map sheet",
    group: "Map",
    order: 3,
    keywords: ["print", "export", "pdf", "png", "sheet", "title block", "grid reference", "legend", "locator"],
    body: (
      <>
        The <strong>Export</strong> tab makes an A4 or A3 sheet with the map
        filling most of the page (landscape: details down the right; portrait:
        along the bottom). A small table gives the NE corner, centre and SW
        corner as a <strong>grid reference</strong> (e.g. TQ 32700 80399) and
        BNG easting, northing (e.g. 532700, 180399). It says where the sheet
        is, sized to the area: a site&apos;s address when printed on one, the
        nearest address under 1 km across, the town up to 15 km, the county
        or region up to 150 km, and the countries beyond (e.g. England and
        Wales, United Kingdom). Type your own in Location to override. A locator map shows where the sheet
        sits, and the legend lists only what&apos;s on it, with counts. Fill
        in drawing no., revision, status and notes for the title block. PDFs
        are 300 dpi with real, searchable text.
      </>
    ),
  },
  {
    id: "help-map-search",
    title: "Location search",
    group: "Map",
    order: 4,
    keywords: ["search", "postcode", "coordinate", "bng", "address"],
    body: (
      <>
        The search box at the top of the map accepts easting/northing (BNG),
        latitude/longitude, UK postcodes (with autocomplete) and free-text
        addresses. Results fly the map to the location. Beside it are zoom,
        reset view, my location and full page (on a phone, pinch to zoom;
        reset and my location sit at the bottom right, and ⓘ shows the
        coordinates and map credits).
      </>
    ),
  },
  {
    id: "help-map-context",
    title: "Right-click menu",
    group: "Map",
    order: 5,
    keywords: ["context menu", "right click", "coordinates", "links"],
    body: (
      <>
        Right-click anywhere on the map for the coordinates at that point
        (lat/lng and British National Grid), a postcode/address lookup, and
        links to open the location in external map services.
      </>
    ),
  },
];

export const PROFILE_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-profile-prefs",
    title: "Preferences",
    group: "Profile",
    order: 1,
    keywords: [
      "profile", "display name", "landing page", "preferences", "density",
      "table", "rows", "wrap", "freeze", "password",
    ],
    body: (
      <>
        Set a <strong>display name</strong> (shown in the header instead of
        your email) and a <strong>landing page</strong> (where you land after
        signing in). Under <strong>Display</strong>: interface density
        (Compact for mouse and keyboard, Comfortable for touch); table rows (Dense, Standard or Roomy),
        wrap text and freeze first column, used by every table (the gear on a
        table changes the same settings). With several users, you can also
        change your password here.
        Preferences are stored in this browser.
      </>
    ),
  },
];

export const ADMIN_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-admin-maintenance",
    title: "Maintenance actions",
    group: "Admin",
    order: 1,
    keywords: ["admin", "reseed", "orphans", "maintenance", "stats"],
    body: (
      <>
        <strong>Re-seed demo data</strong> runs the idempotent seeder (no-ops
        when sites exist). <strong>Clean orphaned records</strong> removes
        comments/attachments whose record was deleted. The{" "}
        <strong>Recycle bin</strong> restores or permanently removes deleted
        surveys, <strong>Users</strong> manages who can
        sign in and their roles, and <strong>Export</strong> downloads all the
        data. Changelog entries are always kept as the audit trail.
      </>
    ),
  },
];
