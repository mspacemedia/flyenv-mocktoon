import { Operation } from './Operation'
import {
  validateSettings,
  type Catalog,
  type HistoryRow,
  type Profile,
  type Settings,
  type StartSettings
} from '../shared/types'

export type Dependencies = {
  request: <T>(method: string, args: unknown[], progress?: (text: string) => void) => Promise<T>
  readSettings: () => Promise<Settings>
  writeSettings: (settings: Settings) => Promise<void>
  refreshServices: () => Promise<void>
  newId: () => string
  notice: (kind: 'success' | 'error', text: string) => void
}
export class MocktoonController {
  settings: Settings = { nodeBin: '', profiles: [] }
  profiles: Profile[] = []
  skipped: string[] = []
  source?: { id: string; text: string }
  rows: HistoryRow[] = []
  serviceOutput = ''
  loaded = false
  readonly loading = new Operation()
  readonly catalog = new Operation()
  readonly installation = new Operation()
  readonly mutation = new Operation()
  readonly inspection = new Operation()
  readonly history = new Operation()
  readonly logs = new Operation()
  private createRequest?: { example: string; id: string }
  constructor(private readonly dependencies: Dependencies) {}
  private notice(kind: 'success' | 'error', text: string) {
    try {
      this.dependencies.notice(kind, text)
    } catch {
      /* supplementary notice */
    }
  }
  private async action<T>(
    operation: Operation,
    work: (progress: (text: string) => void) => Promise<T>
  ): Promise<T | undefined> {
    try {
      return await operation.run(work)
    } catch (error) {
      this.notice('error', error instanceof Error ? error.message : String(error))
      return undefined
    }
  }
  load(): Promise<void> {
    return this.action(this.loading, async () => {
      if (!this.loaded) {
        try {
          this.settings = validateSettings(await this.dependencies.readSettings())
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'no found') throw error
        }
        this.loaded = true
      }
      await this.refreshCatalog()
      await this.dependencies.refreshServices()
    }) as Promise<void>
  }
  refreshCatalog(): Promise<Catalog | undefined> {
    return this.action(this.catalog, async () => {
      const result = await this.dependencies.request<Catalog>('profileCatalog', [])
      this.profiles = result.profiles
      this.skipped = result.skipped
      return result
    })
  }
  private upsert(profile: Profile) {
    this.profiles = [...this.profiles.filter((item) => item.id !== profile.id), profile]
  }
  async create(example: string): Promise<Profile | undefined> {
    if (this.mutation.running) return undefined
    const request =
      this.createRequest?.example === example
        ? this.createRequest
        : { example, id: this.dependencies.newId() }
    this.createRequest = request
    return this.action(this.mutation, async () => {
      const result = await this.dependencies.request<Profile>('createExample', [
        request.id,
        example
      ])
      this.createRequest = undefined
      this.upsert(result)
      this.notice('success', 'Created an editable copy.')
      const refreshed = await this.refreshCatalog()
      if (!refreshed)
        this.mutation.warning =
          'The copy was created. Profile refresh failed; try Refresh profiles.'
      return result
    })
  }
  saveProfile(id: string, text: string): Promise<Profile | undefined> {
    if (this.mutation.running) return Promise.resolve(undefined)
    return this.action(this.mutation, async () => {
      const result = await this.dependencies.request<Profile>('saveProfile', [id, text])
      this.upsert(result)
      this.source = { id, text }
      this.notice('success', 'Saved. Restart Mocktoon to apply changes to a running mock.')
      return result
    })
  }
  saveSettings(settings: Settings): Promise<Settings | undefined> {
    if (this.mutation.running) return Promise.resolve(undefined)
    const snapshot = JSON.parse(JSON.stringify(settings)) as Settings
    return this.action(this.mutation, async () => {
      const checked = validateSettings(snapshot)
      await this.dependencies.writeSettings(checked)
      this.settings = checked
      this.loaded = true
      this.notice('success', 'Saved mock settings.')
      return checked
    })
  }
  install(nodeBin: string): Promise<string | undefined> {
    if (this.installation.running) return Promise.resolve(undefined)
    return this.action(this.installation, async (progress) => {
      const result = await this.dependencies.request<string>('installRuntime', [nodeBin], progress)
      this.notice('success', 'Mockoon CLI is installed.')
      try {
        await this.dependencies.refreshServices()
      } catch (error) {
        this.installation.warning = `Installed successfully. Service discovery failed: ${String(error)}`
      }
      return result
    })
  }
  async startParams(): Promise<StartSettings[]> {
    if (!this.loaded) await this.load()
    if (!this.loaded) throw new Error(this.loading.error || 'Mock settings could not be loaded.')
    if (this.mutation.running || this.installation.running)
      throw new Error('Wait for the current mock operation to finish.')
    const settings = validateSettings(this.settings)
    const profiles = settings.profiles.filter((profile) => profile.enabled)
    if (!profiles.length)
      throw new Error('Enable at least one mock and save settings before starting.')
    return [{ nodeBin: settings.nodeBin, profiles }]
  }
  inspect(id: string): Promise<string | undefined> {
    if (this.inspection.running) return Promise.resolve(undefined)
    return this.action(this.inspection, async () => {
      const text = await this.dependencies.request<string>('profileSource', [id])
      this.source = { id, text }
      return text
    })
  }
  refreshHistory(): Promise<HistoryRow[] | undefined> {
    return this.action(this.history, async () => {
      const result = await this.dependencies.request<HistoryRow[]>('history', [])
      this.rows = result
      return result
    })
  }
  refreshLogs(): Promise<string | undefined> {
    return this.action(this.logs, async () => {
      const result = await this.dependencies.request<string>('serviceLog', [])
      this.serviceOutput = result
      return result
    })
  }
  clearHistory(): Promise<boolean | undefined> {
    if (this.mutation.running) return Promise.resolve(undefined)
    return this.action(this.mutation, async () => {
      const result = await this.dependencies.request<boolean>('clearHistory', [])
      this.rows = []
      return result
    })
  }
}
