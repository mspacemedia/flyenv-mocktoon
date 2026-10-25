import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { exampleFiles, examples } from '../shared/Examples'
import { validateSettings, profileId } from '../shared/types'
import { validateEnvironment, launchEnvironment } from '../fork/Environment'
import { ProfileRepository } from '../fork/Repository'
import { prepareLaunch, mockoonArgs } from '../fork/Launch'
import { npmCandidates, runtimeEnvironment, runCommand } from '../fork/Command'
import { parseHistory } from '../fork/History'

assert.equal(examples.length, 5)
for (const example of examples) {
  const source = exampleFiles[example.id]
  const before = JSON.stringify(source)
  const env = validateEnvironment(source)
  assert.equal(env.name, example.name)
  assert.equal(env.routes.length, 2)
  for (const scenario of [
    'success',
    'rejected',
    'slow',
    'unauthorised',
    'rate-limited',
    'unavailable'
  ] as const) {
    const launch = launchEnvironment(source, randomUUID(), scenario, 'nonce')
    assert.equal(launch.hostname, '127.0.0.1')
    assert.equal(launch.routes[0].responses[0].latency, 0, 'health is never slow')
    for (const route of launch.routes.slice(1)) assert.equal(route.responses[0].label, scenario)
  }
  assert.equal(JSON.stringify(source), before, 'launching must never modify shipped examples')
}
assert.throws(() => profileId('../../elsewhere'))
assert.throws(
  () => validateEnvironment({ ...(exampleFiles.mockship as object), proxyMode: true }),
  /without proxies/
)
assert.throws(() => validateEnvironment({ ...(exampleFiles.mockship as object), routes: [] }))
const id = randomUUID(),
  other = randomUUID()
const settings = {
  nodeBin: process.execPath,
  profiles: [{ id, port: 4010, enabled: true, scenario: 'request' as const }]
}
assert.equal(validateSettings(settings).profiles[0].port, 4010)
assert.throws(
  () =>
    validateSettings({
      ...settings,
      profiles: [...settings.profiles, { ...settings.profiles[0], id: other }]
    }),
  /different ports/
)
assert.throws(() =>
  validateSettings({ ...settings, profiles: [{ ...settings.profiles[0], port: 80 }] })
)
assert.throws(() =>
  validateSettings({ ...settings, profiles: [{ ...settings.profiles[0], scenario: 'bad' as any }] })
)
assert.equal(
  npmCandidates('C:\\Node with spaces\\node.exe', true)[0],
  'C:\\Node with spaces\\node_modules\\npm\\bin\\npm-cli.js'
)
assert.ok(
  npmCandidates('/opt/homebrew/opt/node/bin/node', false).includes(
    '/opt/homebrew/opt/node/lib/node_modules/npm/bin/npm-cli.js'
  )
)
assert.ok(
  npmCandidates('/usr/local/bin/node', false).includes(
    '/usr/local/lib/node_modules/npm/bin/npm-cli.js'
  )
)
assert.ok(npmCandidates('/usr/bin/node', false).includes('/usr/share/npm/bin/npm-cli.js'))
assert.ok(npmCandidates('/usr/bin/node', false).includes('/usr/share/nodejs/npm/bin/npm-cli.js'))
assert.ok(
  npmCandidates('/opt/homebrew/opt/node/bin/node', false).includes(
    '/opt/homebrew/opt/node/libexec/lib/node_modules/npm/bin/npm-cli.js'
  )
)
const env = runtimeEnvironment(
  {
    PATH: '/bin',
    NODE_OPTIONS: '--require unsafe',
    STRIPE_SECRET_KEY: 'secret',
    MOCKOON_ADMIN_API_TOKEN: 'token'
  },
  process.execPath
)
assert.equal(env.NODE_OPTIONS, undefined)
assert.equal(env.STRIPE_SECRET_KEY, undefined)
assert.equal(env.MOCKOON_ADMIN_API_TOKEN, undefined)

const work = await mkdtemp(join(tmpdir(), 'mocktoon-core-'))
try {
  const repo = new ProfileRepository(work)
  const copy = await repo.create(id, 'mockship')
  assert.equal(copy.name, 'MockShip')
  assert.deepEqual(
    await repo.create(id, 'mockship'),
    copy,
    'duplicate create returns the same copy'
  )
  await mkdir(join(work, 'profiles', 'broken-profile'))
  const listed = await repo.list()
  assert.equal(listed.profiles.length, 1)
  assert.equal(listed.skipped.length, 1, 'invalid candidates do not hide valid profiles')
  const text = await repo.read(id)
  await assert.rejects(repo.save(id, '{bad json'), SyntaxError)
  assert.equal(await repo.read(id), text)
  const modified = JSON.parse(text)
  modified.name = 'My shipping API'
  await repo.save(id, JSON.stringify(modified))
  assert.equal((await repo.describe(id)).name, 'My shipping API')
  const launch = await prepareLaunch(work, settings, repo)
  assert.equal(
    await repo.read(id),
    JSON.stringify(modified),
    'launch snapshots leave project copies unchanged'
  )
  const args = mockoonArgs('C:\\Mockoon Runtime\\bin\\run.js', launch)
  assert.equal(args[0], 'C:\\Mockoon Runtime\\bin\\run.js')
  assert.ok(args.includes('--disable-admin-api'))
  assert.ok(args.includes('127.0.0.1'))
  await assert.rejects(prepareLaunch(work, { ...settings, profiles: [] }, repo), /at least one/)
  await assert.rejects(repo.read('../invalid'))
  const script = join(work, 'echo args.js')
  await writeFile(script, 'console.log(JSON.stringify(process.argv.slice(2)))')
  assert.deepEqual(
    JSON.parse(
      await runCommand(process.execPath, [script, 'space and $() & quotes "'], { cwd: work })
    ),
    ['space and $() & quotes "']
  )
  const timeout = join(work, 'timeout.js')
  await writeFile(timeout, 'setInterval(()=>{},1000)')
  await assert.rejects(
    runCommand(process.execPath, [timeout], { cwd: work, timeout: 100 }),
    /timed out/
  )
  await assert.rejects(runCommand(join(work, 'missing-node'), [], { cwd: work }), /ENOENT/)
  assert.ok((await readFile(launch.files[0], 'utf8')).includes('__mocktoon/health'))
} finally {
  assert.equal(dirname(resolve(work)), resolve(tmpdir()))
  assert.ok(basename(work).startsWith('mocktoon-core-'))
  await rm(work, { recursive: true, force: true })
}
const entry = {
  timestamp: 'now',
  environmentName: 'MockSend',
  requestMethod: 'POST',
  requestPath: '/deliveries',
  responseStatus: 202,
  transaction: {
    request: {
      body: '{"customer_id":"demo"}',
      headers: [{ key: 'Authorization', value: 'Bearer secret' }]
    },
    response: { body: '{}', headers: [] }
  }
}
const rows = parseHistory('diagnostic\n' + JSON.stringify(entry) + '\n{"partial"')
assert.equal(rows.length, 1)
assert.equal((rows[0].request as any).body, '{"customer_id":"demo"}')
assert.ok(!JSON.stringify(rows).includes('Bearer secret'))
console.log(
  'Mocktoon core: five examples, scenarios, copies, invalid candidate isolation, argv, Node layouts, timeout and history passed.'
)
