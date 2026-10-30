/* global localStorage, window, document */
// No-flash theme init: apply the persisted/system theme before first paint.
// Loaded as a file (index.html), not inline: the CSP allows only same-origin scripts.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    // "system" is stored when the person picks it explicitly; it means the same as nothing stored.
    var dark =
      stored === "dark" ||
      ((!stored || stored === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch {
    /* localStorage unavailable: default to light */
  }
})();
