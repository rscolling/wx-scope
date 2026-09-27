import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.WX_DEV_URL || 'http://127.0.0.1:5173'
const PIP_PX = Math.round((5 / 2.54) * 96)

function iconPath() {
  const ico = path.join(__dirname, '..', 'build', 'icon.ico')
  const png = path.join(__dirname, '..', 'build', 'icon.png')
  if (fs.existsSync(ico)) return ico
  if (fs.existsSync(png)) return png
  return undefined
}

function preloadPath() {
  return path.join(__dirname, 'preload.cjs')
}

/** @type {BrowserWindow | null} */
let mainWin = null
/** @type {BrowserWindow | null} */
let pipWin = null

function loadApp(win, pip) {
  if (app.isPackaged) {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      query: pip ? { pip: '1' } : {},
    })
    return
  }
  const url = pip ? `${DEV_URL}/?pip=1` : DEV_URL
  void win.loadURL(url)
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#05070a',
    autoHideMenuBar: true,
    title: 'WX-SCOPE',
    icon: iconPath(),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: preloadPath(),
    },
  })

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  loadApp(mainWin, false)
  mainWin.on('closed', () => {
    mainWin = null
    if (pipWin && !pipWin.isDestroyed()) pipWin.close()
  })
}

function createPip() {
  if (pipWin && !pipWin.isDestroyed()) {
    pipWin.show()
    pipWin.focus()
    return
  }
  pipWin = new BrowserWindow({
    width: PIP_PX,
    height: PIP_PX,
    minWidth: PIP_PX,
    minHeight: PIP_PX,
    maxWidth: PIP_PX,
    maxHeight: PIP_PX,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    title: 'WX-SCOPE',
    icon: iconPath(),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: preloadPath(),
    },
  })
  pipWin.setAlwaysOnTop(true, 'screen-saver')
  loadApp(pipWin, true)
  pipWin.on('closed', () => {
    pipWin = null
  })
}

ipcMain.handle('open-pip', () => {
  createPip()
})

ipcMain.handle('close-pip', () => {
  if (pipWin && !pipWin.isDestroyed()) pipWin.close()
})

const GEO_PS = [
  'Add-Type -AssemblyName System.Device',
  '$w = New-Object System.Device.Location.GeoCoordinateWatcher High',
  '$w.Start()',
  'try {',
  '  for ($i = 0; $i -lt 40; $i++) {',
  '    Start-Sleep -Milliseconds 250',
  '    $c = $w.Position.Location',
  '    if (-not $c.IsUnknown) {',
  '      @{ ok = $true; lat = $c.Latitude; lon = $c.Longitude; acc = $c.HorizontalAccuracy } | ConvertTo-Json -Compress',
  '      return',
  '    }',
  '  }',
  '  @{ ok = $false } | ConvertTo-Json -Compress',
  '} finally { $w.Stop() }',
].join('\n')

function parseGeoOut(stdout) {
  const line = String(stdout)
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((row) => row.startsWith('{'))
  if (!line) return { ok: false }
  try {
    const json = JSON.parse(line)
    if (!json.ok || !Number.isFinite(json.lat) || !Number.isFinite(json.lon)) return { ok: false }
    if (json.lat < -90 || json.lat > 90 || json.lon < -180 || json.lon > 180) return { ok: false }
    return { ok: true, lat: json.lat, lon: json.lon, acc: Number.isFinite(json.acc) ? json.acc : undefined }
  } catch {
    return { ok: false }
  }
}

function windowsLocation() {
  return new Promise((resolve) => {
    const encoded = Buffer.from(GEO_PS, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: 15000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false })
          return
        }
        resolve(parseGeoOut(stdout))
      },
    )
  })
}

ipcMain.handle('get-location', () => windowsLocation())

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'geolocation' || permission === 'geolocation-approximate' || true)
  })
  session.defaultSession.setPermissionCheckHandler(() => true)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
