import { cp, mkdir, rm, rename, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'release', 'WX-SCOPE')
const electronDist = path.join(root, 'node_modules', 'electron', 'dist')

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit', shell: false })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} ${code}`))))
    child.on('error', reject)
  })
}

if (!existsSync(electronDist)) throw new Error('electron dist missing — run npm install')
await rm(path.join(root, 'release'), { recursive: true, force: true })
await mkdir(out, { recursive: true })
await cp(electronDist, out, { recursive: true })

const appDir = path.join(out, 'resources', 'app')
await mkdir(path.join(appDir, 'electron'), { recursive: true })
await mkdir(path.join(appDir, 'dist'), { recursive: true })
await mkdir(path.join(appDir, 'build'), { recursive: true })
await cp(path.join(root, 'dist'), path.join(appDir, 'dist'), { recursive: true })
await copyFile(path.join(root, 'electron', 'main.mjs'), path.join(appDir, 'electron', 'main.mjs'))
await copyFile(path.join(root, 'electron', 'preload.cjs'), path.join(appDir, 'electron', 'preload.cjs'))
await copyFile(path.join(root, 'package.json'), path.join(appDir, 'package.json'))
await copyFile(path.join(root, 'build', 'icon.ico'), path.join(appDir, 'build', 'icon.ico'))
await copyFile(path.join(root, 'build', 'icon.png'), path.join(appDir, 'build', 'icon.png'))

const exe = path.join(out, 'electron.exe')
const named = path.join(out, 'WX-SCOPE.exe')
if (existsSync(exe)) await rename(exe, named)

const ico = path.join(root, 'build', 'icon.ico')
const rcedit = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')
if (existsSync(rcedit) && existsSync(named)) {
  await run(rcedit, [named, '--set-icon', ico])
}

console.log('packed', named)
