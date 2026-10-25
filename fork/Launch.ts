import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { validateSettings, type StartSettings } from '../shared/types'
import { launchEnvironment } from './Environment'
import type { ProfileRepository } from './Repository'

export async function prepareLaunch(
  root: string,
  input: StartSettings,
  repository: ProfileRepository
) {
  const settings = validateSettings(input)
  const profiles = settings.profiles.filter((profile) => profile.enabled)
  if (!profiles.length) throw new Error('Enable at least one mock profile before starting.')
  const sources = await Promise.all(
    profiles.map(async (profile) => ({
      profile,
      source: JSON.parse(await repository.read(profile.id))
    }))
  )
  const nonce = randomUUID(),
    sessions = join(root, 'sessions')
  await mkdir(sessions, { recursive: true })
  const directory = await mkdtemp(join(sessions, 'run-'))
  const files: string[] = []
  for (const { profile, source } of sources) {
    const file = join(directory, profile.id + '.json')
    await writeFile(
      file,
      JSON.stringify(launchEnvironment(source, profile.id, profile.scenario, nonce)),
      { mode: 0o600 }
    )
    files.push(file)
  }
  return { settings, profiles, files, directory, nonce }
}

export function mockoonArgs(
  cli: string,
  launch: Awaited<ReturnType<typeof prepareLaunch>>
): string[] {
  return [
    cli,
    'start',
    '--data',
    ...launch.files,
    '--port',
    ...launch.profiles.map((profile) => String(profile.port)),
    '--hostname',
    ...launch.profiles.map(() => '127.0.0.1'),
    '--disable-admin-api',
    '--disable-log-to-file',
    '--disable-tls',
    '--proxy',
    'disabled',
    '--log-transaction',
    '--max-request-body-size',
    '1MB',
    '--faker-seed',
    '1234'
  ]
}

export async function waitForMocks(
  launch: Awaited<ReturnType<typeof prepareLaunch>>,
  alive: () => boolean,
  timeout = 15_000
) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (!alive())
      throw new Error('Mockoon exited before its mock APIs became ready. Check the service log.')
    const checks = await Promise.all(
      launch.profiles.map(async (profile) => {
        try {
          const result = await fetch(`http://127.0.0.1:${profile.port}/__mocktoon/health`, {
            signal: AbortSignal.timeout(750),
            redirect: 'error'
          })
          if (!result.ok) return false
          const data = (await result.json()) as any
          return data.id === profile.id && data.nonce === launch.nonce
        } catch {
          return false
        }
      })
    )
    if (checks.every(Boolean)) return
    await delay(150)
  }
  throw new Error(
    'One or more mock APIs did not become ready. Check for occupied ports or invalid JSON in the service log.'
  )
}
