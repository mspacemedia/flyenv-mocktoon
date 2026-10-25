import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import runtimePackage from '../runtime/package.json'
import runtimeLock from '../runtime/package-lock.json'
import { CLI_VERSION } from '../shared/types'
import { npmCandidates, runCommand, runtimeEnvironment } from './Command'

export class MockoonRuntime {
  private installing?: Promise<string>
  constructor(readonly root: string) {}
  get directory() {
    return join(this.root, 'runtime', CLI_VERSION)
  }
  get cli() {
    return join(this.directory, 'node_modules/@mockoon/cli/bin/run.js')
  }
  async installed(): Promise<boolean> {
    try {
      const pkg = JSON.parse(
        await readFile(join(this.directory, 'node_modules/@mockoon/cli/package.json'), 'utf8')
      )
      return pkg.version === CLI_VERSION && existsSync(this.cli)
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false
      throw error
    }
  }
  async verifyNode(nodeBin: string): Promise<void> {
    if (!nodeBin || !/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(nodeBin))
      throw new Error('Select an absolute Node.js executable path.')
    const output = await runCommand(nodeBin, ['--version'], {
      cwd: this.root,
      env: runtimeEnvironment(process.env, nodeBin)
    })
    const major = Number(output.match(/^v(\d+)\./)?.[1])
    if (!major || major < 18) throw new Error('Mockoon requires Node.js 18 or newer.')
  }
  install(nodeBin: string, progress: (text: string) => void): Promise<string> {
    if (this.installing) return this.installing
    const observer = (text: string) => {
      try {
        progress(text)
      } catch {
        /* supplementary observer */
      }
    }
    const flight = this.installInternal(nodeBin, observer).finally(() => {
      this.installing = undefined
    })
    this.installing = flight
    return flight
  }
  private async installInternal(nodeBin: string, progress: (text: string) => void) {
    await mkdir(this.root, { recursive: true })
    await this.verifyNode(nodeBin)
    if (await this.installed()) return this.cli
    const npm = npmCandidates(nodeBin).find(existsSync)
    if (!npm)
      throw new Error(
        'The selected Node installation has no npm-cli.js. Install a complete Node.js runtime in FlyEnv.'
      )
    const parent = join(this.root, 'runtime')
    await mkdir(parent, { recursive: true })
    const staging = await mkdtemp(join(parent, '.installing-'))
    try {
      await writeFile(join(staging, 'package.json'), JSON.stringify(runtimePackage))
      await writeFile(join(staging, 'package-lock.json'), JSON.stringify(runtimeLock))
      await writeFile(join(staging, 'empty.npmrc'), '')
      await writeFile(join(staging, 'global.npmrc'), '')
      progress(`Installing pinned Mockoon CLI ${CLI_VERSION} into the plugin data directory…\n`)
      await runCommand(
        nodeBin,
        [
          npm,
          'ci',
          '--prefix',
          staging,
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--registry=https://registry.npmjs.org',
          '--userconfig',
          join(staging, 'empty.npmrc'),
          '--globalconfig',
          join(staging, 'global.npmrc')
        ],
        {
          cwd: staging,
          env: runtimeEnvironment(process.env, nodeBin),
          timeout: 240_000,
          progress
        }
      )
      const output = await runCommand(
        nodeBin,
        [join(staging, 'node_modules/@mockoon/cli/bin/run.js'), '--version'],
        { cwd: staging, env: runtimeEnvironment(process.env, nodeBin) }
      )
      if (!output.includes(`@mockoon/cli/${CLI_VERSION}`))
        throw new Error('The installed Mockoon CLI version could not be verified.')
      try {
        await rename(staging, this.directory)
      } catch (error) {
        if (!(await this.installed())) throw error
      }
      return this.cli
    } finally {
      // Only remove this invocation's newly-created staging directory after its child closes.
      if (
        resolve(staging).startsWith(resolve(parent) + (process.platform === 'win32' ? '\\' : '/'))
      ) {
        await rm(staging, { recursive: true, force: true }).catch((error) => {
          progress(`Staging cleanup: ${String(error)}\n`)
        })
      }
    }
  }
}
