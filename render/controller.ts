import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { forkTerminalRequest } from '@/util/ForkTerminalRequest'
import { MessageError, MessageSuccess } from '@/util/Element'
import { BrewStore } from '@/store/brew'
import { MocktoonController } from './Model'
import type { Settings } from '../shared/types'

const key = 'flyenv-mocktoon-settings-v1'
export default reactiveBind(
  new MocktoonController({
    readSettings: () => StorageGetAsync<Settings>(key),
    writeSettings: (settings) => StorageSetAsync(key, settings),
    newId: () => crypto.randomUUID(),
    notice: (kind, text) => (kind === 'error' ? MessageError(text) : MessageSuccess(text)),
    refreshServices: async () => {
      const module = BrewStore().module('mocktoon')
      module.installedFetched = false
      if (!(await module.fetchInstalled()))
        throw new Error('FlyEnv could not refresh the Mockoon runtime.')
    },
    request: async <T>(method: string, args: unknown[], progress?: (text: string) => void) => {
      const response = await forkTerminalRequest(
        'app-fork:mocktoon',
        [method, ...args],
        'The request timed out. Refresh before retrying a write.',
        method === 'installRuntime' ? 300_000 : 60_000,
        (info) => progress?.(typeof info.msg === 'string' ? info.msg : JSON.stringify(info.msg))
      )
      if (response.code !== 0) throw new Error(response.msg || 'Mocktoon operation failed.')
      return response.data as T
    }
  })
)
