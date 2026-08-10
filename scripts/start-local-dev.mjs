import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const engineRoot = resolve(projectRoot, 'workflow-engine')
const nestCli = resolve(projectRoot, 'node_modules/@nestjs/cli/bin/nest.js')

const processes = [
  spawn(process.execPath, ['--watch', 'src/server.mjs'], {
    cwd: engineRoot,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [nestCli, 'start', '--watch'], {
    cwd: projectRoot,
    stdio: 'inherit',
  }),
]

let shuttingDown = false

function stop(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of processes) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exitCode = exitCode
}

for (const child of processes) {
  child.once('error', (error) => {
    console.error(`Could not start local development services: ${error.message}`)
    stop(1)
  })
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`A local development service stopped unexpectedly (${signal ?? `exit ${code ?? 0}`}).`)
      stop(code ?? 1)
    }
  })
}

process.once('SIGINT', () => stop())
process.once('SIGTERM', () => stop())
