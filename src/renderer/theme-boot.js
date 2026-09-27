/* Applies the theme to <html> BEFORE first style resolution.
 *
 * This must be a render-blocking classic <script> in <head>, ahead of the
 * stylesheet link. Doing it at DOMContentLoaded instead produces a visible
 * flash of the default theme on every new tab. It is external rather than
 * inline because shell.html's CSP is script-src 'self'.
 *
 * Main passes an ALREADY-RESOLVED mode on the window/tab query string, so
 * "system" never reaches here — the main process owns that resolution via
 * nativeTheme and pushes an update when the OS flips.
 *
 * A private surface gets data-private and is deliberately given neither
 * data-theme nor data-ambience, so nothing in tokens.css can compete with the
 * fixed private palette. Private-mode identifiability is a guarantee, not a
 * preference (ADR-0002, ADR-0008).
 */
(function () {
  var p = new URLSearchParams(location.search);
  var el = document.documentElement;

  if (p.get('private') === '1' || el.hasAttribute('data-private')) {
    el.setAttribute('data-private', '');
    return;
  }

  var theme = p.get('theme');
  var amb = p.get('amb');

  // Only 'light' is an override; dark is the bare :root default, so a missing
  // or malformed value degrades to the default theme rather than no theme.
  if (theme === 'light') el.setAttribute('data-theme', 'light');
  if (amb && amb !== 'none') el.setAttribute('data-ambience', amb);
})();
