import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { MockoonRuntime } from '../fork/Runtime'
import { ProfileRepository } from '../fork/Repository'
import { prepareLaunch, mockoonArgs, waitForMocks } from '../fork/Launch'
import { readHistory } from '../fork/History'
import { runCommand, runtimeEnvironment } from '../fork/Command'
import { examples, exampleFiles } from '../shared/Examples'
import type { Settings } from '../shared/types'

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
const root = await mkdtemp(join(tmpdir(), 'mocktoon real runtime with spaces '))
try {
  const engine = new MockoonRuntime(root)
  console.log('Installing and verifying the pinned real CLI in an isolated directory…')
  const installing = engine.install(process.execPath, (text) => process.stdout.write(text))
  assert.equal(
    engine.install(process.execPath, () => {}),
    installing,
    'runtime bootstrap is single-flight'
  )
  await installing
  assert.equal(await engine.installed(), true)
  const repo = new ProfileRepository(root)
  const settings: Settings = { nodeBin: process.execPath, profiles: [] }
  const original = JSON.stringify(exampleFiles)
  const selectedPorts = new Set<number>()
  for (const example of examples) {
    const id = randomUUID()
    await repo.create(id, example.id)
    let port = await freePort()
    while (selectedPorts.has(port)) port = await freePort()
    selectedPorts.add(port)
    settings.profiles.push({ id, port, enabled: true, scenario: 'request' })
  }
  const launch = await prepareLaunch(root, settings, repo)
  const env = runtimeEnvironment(process.env, process.execPath)
  await runCommand(process.execPath, [engine.cli, 'validate', '--data', ...launch.files], {
    cwd: root,
    env
  })
  const historyPath = join(root, 'transactions.jsonl'),
    stream = createWriteStream(historyPath)
  const child = spawn(process.execPath, mockoonArgs(engine.cli, launch), {
    cwd: root,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.pipe(stream)
  child.stdout.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-16_000)
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })
  try {
    await waitForMocks(launch, () => child.exitCode === null)
    for (let index = 0; index < examples.length; index++) {
      const example = examples[index],
        port = settings.profiles[index].port
      for (const endpoint of example.endpoints) {
        const [method, raw] = endpoint.split(' ')
        const path = raw.replace(/:[a-zA-Z]+/g, 'example_001')
        const request = (scenario: string) =>
          fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'x-mock-scenario': scenario,
              Authorization: 'Bearer test-secret'
            },
            ...(method === 'GET'
              ? {}
              : { body: JSON.stringify({ marker: 'captured-example-body' }) }),
            signal: AbortSignal.timeout(8000)
          })
        assert.ok((await request('success')).ok, `${example.name} ${endpoint}`)
        for (const [scenario, status] of [
          ['rejected', 422],
          ['unauthorised', 401],
          ['rate-limited', 429],
          ['unavailable', 503]
        ] as const) {
          const response = await request(scenario)
          assert.equal(response.status, status, `${example.name} ${scenario}`)
          if (scenario === 'rate-limited') assert.equal(response.headers.get('retry-after'), '30')
        }
        const start = Date.now()
        assert.ok((await request('slow')).ok)
        assert.ok(Date.now() - start >= 1800, 'slow responses have actual latency')
      }
      console.log(`${example.name}: real HTTP success + five failure/latency scenarios passed.`)
    }
    await delay(250)
    const history = await readHistory(historyPath)
    assert.ok(
      history.some(
        (row) =>
          row.environment === 'MockSend' &&
          JSON.stringify(row.request).includes('captured-example-body')
      )
    )
    assert.ok(!JSON.stringify(history).includes('test-secret'))
    assert.equal(JSON.stringify(exampleFiles), original)
    const text = JSON.parse(await repo.read(settings.profiles[0].id))
    text.routes[0].responses.find((response: any) => response.label === 'success').body =
      '{"customised":true}'
    await repo.save(settings.profiles[0].id, JSON.stringify(text))
    assert.ok(
      (await readFile(launch.files[0], 'utf8')).includes('shipment_id'),
      'running snapshot is independent from edits'
    )
    const changed = await prepareLaunch(
      root,
      {
        ...settings,
        profiles: [{ ...settings.profiles[0], port: await freePort(), scenario: 'unavailable' }]
      },
      repo
    )
    assert.equal(
      JSON.parse(await readFile(changed.files[0], 'utf8')).routes[1].responses[0].statusCode,
      503
    )
    // Start a fixed failure scenario, then prove a conflicting server cannot pass readiness.
    const fixed = spawn(settings.nodeBin, mockoonArgs(engine.cli, changed), {
      cwd: root,
      env,
      shell: false,
      windowsHide: true,
      stdio: 'ignore'
    })
    const fixedClosed = new Promise<void>((done) => fixed.once('close', () => done()))
    try {
      await waitForMocks(changed, () => fixed.exitCode === null && fixed.signalCode === null)
      assert.equal(
        (await fetch(`http://127.0.0.1:${changed.profiles[0].port}/shipments`, { method: 'POST' }))
          .status,
        503
      )
      const conflict = await prepareLaunch(
        root,
        { ...settings, profiles: [{ ...settings.profiles[0], port: changed.profiles[0].port }] },
        repo
      )
      const contender = spawn(settings.nodeBin, mockoonArgs(engine.cli, conflict), {
        cwd: root,
        env,
        shell: false,
        windowsHide: true,
        stdio: 'ignore'
      })
      const contenderClosed = new Promise<void>((done) => contender.once('close', () => done()))
      try {
        await assert.rejects(
          waitForMocks(
            conflict,
            () => contender.exitCode === null && contender.signalCode === null,
            5000
          ),
          /exited|did not become ready/
        )
      } finally {
        if (contender.exitCode === null && contender.signalCode === null) contender.kill()
        await contenderClosed
      }
      assert.equal(
        (await fetch(`http://127.0.0.1:${changed.profiles[0].port}/shipments`, { method: 'POST' }))
          .status,
        503,
        'failed candidate leaves the existing server intact'
      )
    } finally {
      if (fixed.exitCode === null && fixed.signalCode === null) fixed.kill()
      await fixedClosed
    }
    console.log(
      'Local request capture, credential header redaction, editable copies and fixed-scenario snapshots passed.'
    )
  } catch (error) {
    console.error(output)
    throw error
  } finally {
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
    if (child.exitCode === null) {
      child.kill()
      await closed
    }
    await new Promise<void>((resolve) => stream.end(resolve))
  }
  console.log('Real CLI stopped; isolated runtime test passed.')
} finally {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()))
  assert.ok(basename(root).startsWith('mocktoon real runtime with spaces '))
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
