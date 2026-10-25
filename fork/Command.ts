import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, posix, win32 } from 'node:path'

const children = new Set<ChildProcess>()
for (const event of ['disconnect', 'exit'] as const)
  process.once(event, () => {
    for (const child of children) child.kill()
  })

export function npmCandidates(nodeBin: string, windows = process.platform === 'win32'): string[] {
  const path = windows ? win32 : posix
  const bin = path.dirname(nodeBin)
  return [
    path.join(bin, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(bin, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(bin, '../libexec/lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(bin, '../share/nodejs/npm/bin/npm-cli.js'),
    path.resolve(bin, '../share/npm/bin/npm-cli.js')
  ]
}

export function runtimeEnvironment(source: NodeJS.ProcessEnv, nodeBin: string): NodeJS.ProcessEnv {
  const allowed =
    /^(path|systemroot|windir|comspec|pathext|home|userprofile|appdata|localappdata|tmp|temp|tmpdir|lang|lc_all|https?_proxy|no_proxy)$/i
  const env = Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key)))
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  env[pathKey] =
    dirname(nodeBin) + (process.platform === 'win32' ? ';' : ':') + (env[pathKey] ?? '')
  return env
}

export function runCommand(
  bin: string,
  args: string[],
  options: {
    cwd: string
    env?: NodeJS.ProcessEnv
    timeout?: number
    progress?: (text: string) => void
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    children.add(child)
    let output = '',
      timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, options.timeout ?? 30_000)
    const chunk = (data: Buffer) => {
      const text = data.toString()
      output = (output + text).slice(-64_000)
      // A progress observer cannot interrupt command completion or child cleanup.
      try {
        options.progress?.(text)
      } catch {
        /* supplementary observer */
      }
    }
    child.stdout.on('data', chunk)
    child.stderr.on('data', chunk)
    child.once('error', (error) => {
      clearTimeout(timer)
      children.delete(child)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      children.delete(child)
      if (timedOut) reject(new Error('The command timed out and was stopped.'))
      else if (code !== 0) reject(new Error(output.trim() || `Command exited with code ${code}.`))
      else resolve(output.trim())
    })
  })
}
