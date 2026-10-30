/** The settings-page layout (Profile, Admin): the cards flow down one column on a phone, two from `lg` and three from
 *  `2xl`, balanced by height, so a wide monitor is used rather than left empty. Put the cards directly in this
 *  container. Record pages use `DetailLayout` (main column plus a side panel from `xl`). Both use the page-gap token,
 *  so the gutters match the rest of the app. */
export const SETTINGS_COLUMNS =
  "columns-1 gap-x-(--page-gap) lg:columns-2 2xl:columns-3 [&>*]:mb-(--page-gap) [&>*]:break-inside-avoid";
