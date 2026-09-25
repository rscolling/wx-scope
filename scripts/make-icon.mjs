import { spawn } from 'node:child_process'
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
const html = pathToFileURL(path.join(buildDir, 'icon.html')).href
const pngPath = path.join(buildDir, 'icon.png')
const icoPath = path.join(buildDir, 'icon.ico')
const publicPng = path.join(root, 'public', 'icon-256.png')

const chrome =
  process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe'
const edge =
  process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe'

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit' })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} ${code}`))))
    child.on('error', reject)
  })
}

function pngToIco(png) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header.writeUInt8(0, 6)
  header.writeUInt8(0, 7)
  header.writeUInt8(0, 8)
  header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18)
  return Buffer.concat([header, png])
}

await mkdir(buildDir, { recursive: true })
const bins = [chrome, edge]
let shot = false
for (const bin of bins) {
  try {
    await run(bin, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=256,256',
      `--screenshot=${pngPath}`,
      html,
    ])
    shot = true
    break
  } catch {
    /* try next browser */
  }
}
if (!shot) throw new Error('no Chrome/Edge to rasterize icon')

const png = await readFile(pngPath)
await writeFile(icoPath, pngToIco(png))
await copyFile(pngPath, publicPng)
console.log('wrote', icoPath, publicPng)
