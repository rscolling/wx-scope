import { app, BrowserWindow, ipcMain, shell } from 'electron'
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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
