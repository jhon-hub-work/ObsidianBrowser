const { ipcMain } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const path = require('path');
const fs = require('fs');

// Brave-grade blocking: EasyList + EasyPrivacy + uBlock's own lists,
// compiled to a binary engine and cached on disk so boot stays fast.
// One engine instance serves every session — a second instance would try to
// re-register the blocker's ipcMain handlers and throw.
async function enableAdblock(sessions, userDataPath) {
  const cache = path.join(userDataPath, 'adblock-engine.bin');

  const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
    path: cache,
    read: fs.promises.readFile,
    write: fs.promises.writeFile
  });

  // Upstream bug: BlockingContext.enable() calls ipcMain.handle() with
  // GLOBAL channel names, so enabling a second session throws "second
  // handler". The handlers are identical across sessions (they delegate to
  // the same blocker), so dropping them before each enable is lossless.
  for (const ses of sessions) {
    ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters');
    ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled');
    blocker.enableBlockingInSession(ses);
  }

  const stats = { blocked: 0 };
  blocker.on('request-blocked', () => { stats.blocked++; });

  return {
    stats,
    disable: () => sessions.forEach(s => blocker.disableBlockingInSession(s)),
    enable: () => sessions.forEach(s => blocker.enableBlockingInSession(s))
  };
}

module.exports = { enableAdblock };
