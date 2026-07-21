// Runs inside every page. Sandboxed — keep it tiny and side-effect free.
const { contextBridge, webFrame, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__obsidian', { version: 1 });

// Report scroll position so the session can be restored where you left off.
// Throttled hard — this must never cost anything on a fast page.
let lastSent = 0;
let pending = null;
function reportScroll() {
  const now = Date.now();
  const send = () => { lastSent = Date.now(); ipcRenderer.send('tab:scroll', window.scrollY | 0); };
  if (now - lastSent > 500) send();
  else { clearTimeout(pending); pending = setTimeout(send, 500); }
}
window.addEventListener('scroll', reportScroll, { passive: true });
// Capture the final position when leaving the page.
window.addEventListener('pagehide', () => ipcRenderer.send('tab:scroll', window.scrollY | 0));

// On Google's sign-in hosts the network layer (ua.js) already says Firefox.
// Page JS must agree, or Google's "browser not secure" wall comes back:
// navigator.userAgent must be Firefox and userAgentData must not exist
// (it doesn't in real Firefox). Sandboxed preloads can't require local
// files, so the UA string is duplicated from src/main/ua.js — keep in sync.
const GOOGLE_AUTH_HOSTS = ['accounts.google.com', 'accounts.youtube.com', 'accounts.google.com.ph'];

if (GOOGLE_AUTH_HOSTS.includes(location.hostname)) {
  const FIREFOX_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

  // Preload runs before any page script, so the overrides are in place
  // before Google's first sniff.
  webFrame.executeJavaScript(`(() => {
    const proto = Object.getPrototypeOf(navigator);
    const def = (name, value) =>
      Object.defineProperty(proto, name, { get: () => value, configurable: true });

    def('userAgent', ${JSON.stringify(FIREFOX_UA)});
    def('userAgentData', undefined);
    def('vendor', '');            // Firefox reports an empty vendor
    def('appVersion', ${JSON.stringify(FIREFOX_UA.slice('Mozilla/'.length))});
  })();`);
}
