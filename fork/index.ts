import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Base } from '@fork/module/Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import EnvSync from '@shared/EnvSync'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { CLI_VERSION, type StartSettings } from '../shared/types'
import { ProfileRepository } from './Repository'
import { MockoonRuntime } from './Runtime'
import { runCommand, runtimeEnvironment } from './Command'
import { prepareLaunch, mockoonArgs, waitForMocks } from './Launch'
import { readHistory, readLogTail } from './History'

class Mocktoon extends Base {
  private runtimeOwner?: MockoonRuntime
  constructor() {
    super()
    this.type = 'mocktoon'
  }
  private root() {
    return join(global.Server.BaseDir!, 'mocktoon')
  }
  private runtime() {
    return (this.runtimeOwner ??= new MockoonRuntime(this.root()))
  }
  private repository() {
    return new ProfileRepository(this.root())
  }
  init() {
    this.pidPath = join(this.root(), 'mocktoon.pid')
  }
  protected _stopSearchName() {
    return 'mockoon'
  }
  _linkVersion() {
    return new ForkPromise<boolean>((resolve) => resolve(true))
  }

  allInstalledVersions() {
    return new ForkPromise<SoftInstalled[]>(async (resolve) => {
      const runtime = this.runtime()
      resolve(
        (await runtime.installed())
          ? [
              {
                typeFlag: 'mocktoon',
                bin: runtime.cli,
                path: runtime.directory,
                version: CLI_VERSION,
                num: 0,
                enable: true,
                run: false,
                running: false
              }
            ]
          : []
      )
    })
  }
  installRuntime(nodeBin: string) {
    return new ForkPromise<string>(async (resolve, _reject, on) =>
      resolve(await this.runtime().install(nodeBin, (text) => on(text)))
    )
  }
  profileCatalog() {
    return new ForkPromise(async (resolve) => resolve(await this.repository().list()))
  }
  createExample(id: string, example: string) {
    return new ForkPromise(async (resolve) => resolve(await this.repository().create(id, example)))
  }
  profileSource(id: string) {
    return new ForkPromise<string>(async (resolve) => resolve(await this.repository().read(id)))
  }
  saveProfile(id: string, text: string) {
    return new ForkPromise(async (resolve) => resolve(await this.repository().save(id, text)))
  }
  history() {
    return new ForkPromise(async (resolve) =>
      resolve(await readHistory(join(this.root(), 'transactions.jsonl')))
    )
  }
  clearHistory() {
    return new ForkPromise<boolean>(async (resolve) => {
      const pid = await this.readPidFromFile()
      if (pid) {
        try {
          process.kill(Number(pid), 0)
          throw new Error('Stop Mocktoon before clearing request history.')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
      }
      await mkdir(this.root(), { recursive: true })
      await writeFile(join(this.root(), 'transactions.jsonl'), '', { mode: 0o600 })
      resolve(true)
    })
  }
  _startServer(version: SoftInstalled, settings: StartSettings) {
    return new ForkPromise(async (resolve, _reject, on) => {
      const runtime = this.runtime()
      if (version.bin !== runtime.cli || !(await runtime.installed()))
        throw new Error('Install the pinned Mockoon runtime first.')
      await runtime.verifyNode(settings?.nodeBin)
      const launch = await prepareLaunch(this.root(), settings, this.repository())
      const env = runtimeEnvironment(await EnvSync.sync(), settings.nodeBin) as Record<
        string,
        string
      >
      await runCommand(settings.nodeBin, [runtime.cli, 'validate', '--data', ...launch.files], {
        cwd: launch.directory,
        env
      })
      const outFile = join(this.root(), 'transactions.jsonl'),
        errFile = join(this.root(), 'service.stderr.log')
      await Promise.all([outFile, errFile].map((file) => writeFile(file, '', { mode: 0o600 })))
      const started: any = await serviceStartSpawn({
        version,
        pidPath: this.pidPath,
        baseDir: this.root(),
        bin: settings.nodeBin,
        cwd: launch.directory,
        execArgs: mockoonArgs(runtime.cli, launch),
        execEnv: env,
        outFile,
        errFile,
        on,
        waitTime: 500,
        sensitive: true
      })
      const pid = String(started['APP-Service-Start-PID'])
      try {
        await waitForMocks(launch, () => {
          try {
            process.kill(Number(pid), 0)
            return true
          } catch {
            return false
          }
        })
      } catch (error) {
        try {
          await this._stopServer({ ...version, pid }).on(on)
        } catch (cleanup) {
          throw new Error(`${String(error)} Cleanup also failed: ${String(cleanup)}`)
        }
        throw error
      }
      resolve(started)
    })
  }
  serviceLog() {
    return new ForkPromise<string>(async (resolve) => {
      const rows: string[] = []
      for (const name of ['service.stderr.log', 'transactions.jsonl']) {
        rows.push((await readLogTail(join(this.root(), name), 32_000)).text)
      }
      resolve(rows.join('\n'))
    })
  }
}
export default new Mocktoon()
