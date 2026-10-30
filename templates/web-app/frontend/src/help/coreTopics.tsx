import type { HelpTopic } from "./types";

/** Core help topics available on every page. Pages add their own via
 *  useRegisterHelpTopics. */
export const CORE_HELP_TOPICS: HelpTopic[] = [
  {
    id: "help-navigation",
    title: "Navigating the app",
    group: "Getting started",
    order: 1,
    keywords: ["sidebar", "navigation", "pages", "menu", "phone", "tab bar", "plus"],
    body: (
      <>
        Use the <strong>sidebar</strong> to switch between Dashboard, Sites,
        Surveys and Map; Profile and Admin sit below. The
        collapse button at the bottom (or <kbd>Ctrl B</kbd>) shrinks it to an
        icon rail. On a phone, the bottom bar holds your main pages,{" "}
        <strong>More</strong> holds the rest, and the round{" "}
        <strong>+</strong> button adds a survey or site from anywhere. Choose which pages the bar shows under Profile → Phone tab
        bar. The <strong>share</strong> button in the header sends a link to
        the page you&apos;re on (a record, a filtered table or a map view)
        through your device&apos;s share menu, or lets you copy or email it.
      </>
    ),
  },
  {
    id: "help-search",
    title: "Global search (Ctrl+K)",
    group: "Getting started",
    order: 2,
    keywords: ["search", "jump to", "cmd+k", "shortcut", "find", "command", "palette", "theme"],
    body: (
      <>
        Press <kbd>Ctrl K</kbd> (or ⌘K on Mac) anywhere to open the search
        palette. Type to find sites and surveys, jump to a page, or run a
        command: <strong>New site</strong>, New survey, switch the theme, or (on a table page) export it
        as CSV. Use ↑↓ to move and ↵ to choose. Recent
        searches are remembered.
      </>
    ),
  },
  {
    id: "help-shortcuts",
    title: "Keyboard shortcuts",
    group: "Getting started",
    order: 3,
    keywords: ["keyboard", "shortcuts", "hotkeys", "keys", "?"],
    body: (
      <>
        Press <kbd>?</kbd> anywhere (outside a text field) for the full list.{" "}
        <kbd>G</kbd> then <kbd>D</kbd>, <kbd>S</kbd>, <kbd>V</kbd>,{" "}
        <kbd>M</kbd> or <kbd>P</kbd> jumps to Dashboard, Sites, Surveys, Map
        or Profile. In a
        table, <kbd>/</kbd> focuses the search, ↑↓ move between rows,{" "}
        <kbd>Enter</kbd> opens the side panel, <kbd>Shift Enter</kbd> the full
        page, <kbd>Space</kbd> selects, and <kbd>N</kbd> adds a record. In the
        side panel, ↑↓ step through records and <kbd>Esc</kbd> closes it.
      </>
    ),
  },
  {
    id: "help-table",
    title: "Working with tables",
    group: "Data",
    order: 1,
    keywords: [
      "table", "filter", "sort", "columns", "csv", "export", "views", "density",
      "wrap", "freeze", "resize", "bulk", "select", "side panel",
    ],
    body: (
      <>
        Click a row to open it: Sites open in a{" "}
        <strong>side panel</strong> (with a link to the full page), Surveys
        open their page. Click a header to{" "}
        <strong>sort</strong>, drag its edge to <strong>resize</strong>, and
        use search and <strong>filters</strong> (a status filter
        can match several values). The bookmark saves the arrangement as a
        named view, and the export button downloads the filtered rows as{" "}
        <strong>CSV</strong>. The <strong>gear</strong> sets row spacing, text
        wrap and a frozen first column for every table (also under Profile).
        Tick rows (on a phone, press and hold a card) to{" "}
        <strong>set a field</strong> on all of them at once or delete them. In{" "}
        <strong>edit mode</strong>, click a cell to change it: Enter saves, Esc
        cancels.
      </>
    ),
  },
  {
    id: "help-records",
    title: "Record pages",
    group: "Data",
    order: 2,
    keywords: ["record", "detail", "page", "site", "survey", "history", "save"],
    body: (
      <>
        Every site and survey has its own page: a{" "}
        <strong>Details</strong> card with its facts and links to the records
        above it, the main buttons in the header, and more (reopen, delete) in
        the <strong>⋯</strong> menu. Tabs hold its related records,{" "}
        <strong>comments</strong>, <strong>attachments</strong> and{" "}
        <strong>history</strong> (who changed what, and when). On a site&apos;s
        Overview you edit in place: a <strong>Save bar</strong> appears once
        you change something, and leaving with unsaved changes asks first.
        A deleted survey goes to the recycle bin, where an
        admin can restore it; sites are archived instead.
      </>
    ),
  },
  {
    id: "help-files",
    title: "Photos and files",
    group: "Data",
    order: 3,
    keywords: ["photo", "file", "upload", "attachment", "camera", "drag", "drop", "multiple", "gps"],
    body: (
      <>
        On a record&apos;s <strong>Attachments</strong> tab, choose several
        files at once or <strong>drag and drop</strong> them anywhere on the
        tab; they upload one after another (up to 10 MB each; a larger one is
        skipped and named). On a phone, <strong>Take photo</strong> opens the
        camera. The map&apos;s Layers panel also accepts several GeoJSON
        files, dropped or chosen.
      </>
    ),
  },
  {
    id: "help-feedback",
    title: "Sending feedback",
    group: "Getting started",
    order: 4,
    keywords: ["bug", "report", "problem", "feedback", "feature", "idea", "suggest", "support", "contact"],
    body: (
      <>
        Open <strong>Help &amp; feedback</strong> from the account menu (or the
        More sheet on a phone) and choose the <strong>Feedback</strong> tab.
        Pick Problem, Suggestion or Question, write a summary and the details,
        and send. A screenshot of the page behind
        the panel is included (switch it off if you&apos;d rather not), along
        with details that help fix things: the page, your role, browser and
        device, and any recent errors. <strong>What&apos;s sent with it</strong>{" "}
        lists everything. Offline, it sends when you&apos;re back online.
        Admins choose where reports go under Admin → Feedback.
      </>
    ),
  },
  {
    id: "help-offline",
    title: "Working offline",
    group: "Data",
    order: 4,
    keywords: ["offline", "signal", "no connection", "sync", "upload", "waiting", "outbox", "phone", "update", "new version", "reload"],
    body: (
      <>
        Sign in once with a signal and the app keeps working without one: it
        opens signed in, and every site and survey is kept
        on the device (refreshed every 10 minutes while online). You can add
        and edit records, comments and photos offline, even a new site with
        its surveys. They show{" "}
        <strong>Waiting to upload</strong> and are sent, in order, as soon as
        the connection returns. The cloud icon in the header shows what&apos;s
        waiting, with <strong>Send now</strong> and <strong>Discard</strong>.
        Anything the server refused stays there until you choose Send now or
        Discard it. Needs a signal first: comments, files and
        history of records you haven&apos;t opened, map areas you
        haven&apos;t viewed, search, and admin tasks. Logging out clears the
        records kept on the device; changes still waiting stay, and are sent
        the next time you sign in. When a new version of the app is out, a
        <strong> New version is ready</strong> message offers{" "}
        <strong>Reload</strong>; use it when you&apos;re at a good stopping
        point. If a page ever says it can&apos;t load after an update, reload
        the tab.
      </>
    ),
  },
  {
    id: "help-map",
    title: "Using the map",
    group: "Map",
    order: 1,
    keywords: ["map", "markers", "popups", "location", "offline"],
    body: (
      <>
        Every site appears as a marker, and each site's latest survey can be
        shown as a ring around it. Click a marker for a popup with a link to its page. Map areas
        you&apos;ve viewed stay available offline for 30 days.
      </>
    ),
  },
];
