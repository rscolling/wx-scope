import { spawn } from 'node:child_process'
import http from 'node:http'

process.env.WX_ELECTRON = '1'

function isUp() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5173', (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
  })
}

function waitForVite() {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = async () => {
      if (await isUp()) return resolve()
      if (Date.now() - start > 30_000) return reject(new Error('vite did not start'))
      setTimeout(() => void tick(), 300)
    }
    void tick()
  })
}

let vite = null
if (!(await isUp())) {
  vite = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, WX_ELECTRON: '1' },
  })
  await waitForVite()
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  shell: true,
  env,
})

electron.on('exit', (code) => {
  if (vite) vite.kill()
  process.exit(code ?? 0)
})
