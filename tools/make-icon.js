// Rasterize assets/icon.svg -> assets/icon.png at 1024x1024.
// electron-builder and the Windows taskbar can't read SVG; this uses the
// Chromium we already ship instead of pulling in a native image dependency.
//   npm run icon
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SIZE = 1024;
const ASSETS = path.join(__dirname, '..', 'assets');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(ASSETS, 'icon.svg'), 'utf8');

  const html = `<!doctype html><meta charset="utf-8">
    <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`;

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 400)); // let gradients settle

  const image = await win.webContents.capturePage();
  const out = path.join(ASSETS, 'icon.png');
  fs.writeFileSync(out, image.toPNG());

  console.log(`wrote ${out} (${image.getSize().width}x${image.getSize().height})`);
  app.quit();
});
