import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MocktoonController, type Dependencies } from '../render/Model'
import { Operation } from '../render/Operation'
import type { Settings } from '../shared/types'

const deferred = () => {
  let resolve!: (value: any) => void, reject!: (error: Error) => void
  const promise = new Promise<any>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const task = deferred(),
  operation = new Operation()
let progress!: (text: string) => void
const running = operation.run((on) => {
  progress = on
  return task.promise
})
assert.equal(
  operation.run(async () => 'duplicate'),
  running
)
await Promise.resolve()
progress('downloading')
assert.equal(operation.running, true)
assert.equal(operation.log, 'downloading')
task.reject(new Error('network failed'))
await assert.rejects(running, /network failed/)
assert.equal(operation.running, false)
assert.equal(await operation.run(async () => 'retried'), 'retried')
assert.equal(operation.error, '')

const requests: { method: string; args: unknown[] }[] = []
let saved: Settings | undefined
const id = randomUUID()
const profile = { id, name: 'MockShip', port: 4010, file: '/mock/profiles/environment.json' }
let createTimes = 0,
  failCreate = true,
  refreshFailure = false,
  settingsReads = 0
const dependencies: Dependencies = {
  readSettings: async () => {
    settingsReads++
    throw new Error('no found')
  },
  writeSettings: async (value) => {
    saved = value
  },
  newId: () => id,
  refreshServices: async () => {
    if (refreshFailure) throw new Error('discovery failed')
  },
  notice: () => {
    throw new Error('notice error must be supplementary')
  },
  request: async <T>(method: string, args: unknown[], on?: (text: string) => void): Promise<T> => {
    requests.push({ method, args })
    if (method === 'profileCatalog') {
      if (createTimes) throw new Error('refresh failed')
      return { profiles: [], skipped: [] } as T
    }
    if (method === 'createExample') {
      createTimes++
      if (failCreate) throw new Error('Timed out; result unknown')
      return profile as T
    }
    if (method === 'installRuntime') {
      on?.('install progress')
      return '/mock/cli.js' as T
    }
    if (method === 'saveProfile') return { ...profile, name: 'Edited' } as T
    if (method === 'history') throw new Error('history failed')
    return 'source JSON' as T
  }
}
const controller = new MocktoonController(dependencies)
await Promise.all([controller.load(), controller.load()])
assert.equal(settingsReads, 1, 'page re-entry shares pending load')
assert.equal(controller.loaded, true)
await controller.create('mockship')
assert.match(controller.mutation.error, /unknown/)
failCreate = false
await controller.create('mockship')
const creates = requests.filter((request) => request.method === 'createExample')
assert.equal(
  creates[0].args[0],
  creates[1].args[0],
  'uncertain create retries reuse their request ID'
)
assert.equal(
  controller.profiles.length,
  1,
  'completed copy survives a failed supplementary refresh'
)
assert.match(controller.mutation.warning, /copy was created/)
refreshFailure = true
await controller.install(process.execPath)
assert.equal(controller.installation.error, '')
assert.match(controller.installation.warning, /Installed successfully/)
assert.match(controller.installation.log, /progress/)
const settings: Settings = {
  nodeBin: process.execPath,
  profiles: [{ id, port: 4010, enabled: true, scenario: 'request' }]
}
await controller.saveSettings(settings)
settings.profiles[0].port = 9999
assert.equal(saved?.profiles[0].port, 4010, 'persistence owns a request snapshot')
const start = await controller.startParams()
start[0].profiles[0].port = 8080
assert.equal(controller.settings.profiles[0].port, 4010, 'service start gets its own snapshot')
controller.rows = [
  {
    time: '',
    environment: 'MockSend',
    method: 'POST',
    path: '/deliveries',
    status: 202,
    request: {},
    response: {}
  }
]
await controller.refreshHistory()
assert.equal(controller.rows.length, 1, 'history failure retains completed data')
const source = readFileSync(resolve(import.meta.dirname, '../render/Index.vue'), 'utf8')
assert.doesNotMatch(source, /IPC\.send|forkTerminalRequest|defineStore/)
assert.match(source, /service\?\.serviceDo\('start'\)/)
assert.match(
  readFileSync(resolve(import.meta.dirname, '../render/aside.vue'), 'utf8'),
  /startExtParam/
)
assert.match(
  readFileSync(resolve(import.meta.dirname, '../render/controller.ts'), 'utf8'),
  /reactiveBind\(\s*new MocktoonController/
)
console.log(
  'Mocktoon controller: progress, duplicate requests, page re-entry, retry IDs, partial completion, snapshots and operation boundaries passed.'
)
