export const CLI_VERSION = '9.9.0'
export const scenarios = [
  'request',
  'success',
  'rejected',
  'slow',
  'unauthorised',
  'rate-limited',
  'unavailable'
] as const
export type Scenario = (typeof scenarios)[number]
export type Profile = { id: string; name: string; port: number; file: string }
export type ProfileChoice = { id: string; port: number; enabled: boolean; scenario: Scenario }
export type Settings = { nodeBin: string; profiles: ProfileChoice[] }
export type StartSettings = { nodeBin: string; profiles: ProfileChoice[] }
export type Example = {
  id: string
  name: string
  description: string
  port: number
  endpoints: string[]
}
export type HistoryRow = {
  time: string
  environment: string
  method: string
  path: string
  status: number
  request: unknown
  response: unknown
}
export type Catalog = { profiles: Profile[]; skipped: string[] }

export function profileId(value: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))
    throw new Error('Invalid mock profile ID.')
  return value
}

export function validateSettings(value: Settings): Settings {
  if (
    !value ||
    typeof value.nodeBin !== 'string' ||
    !/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(value.nodeBin)
  )
    throw new Error('Select an installed Node.js runtime first.')
  if (!Array.isArray(value.profiles) || value.profiles.length > 50)
    throw new Error('Invalid mock profile selection.')
  const ids = new Set<string>(),
    ports = new Set<number>()
  const profiles = value.profiles.map((profile) => {
    profileId(profile.id)
    if (ids.has(profile.id)) throw new Error('A mock profile was selected twice.')
    ids.add(profile.id)
    if (!Number.isInteger(profile.port) || profile.port < 1024 || profile.port > 65535)
      throw new Error('Mock ports must be between 1024 and 65535.')
    if (!scenarios.includes(profile.scenario)) throw new Error('Unknown mock scenario.')
    if (typeof profile.enabled !== 'boolean') throw new Error('Invalid enabled flag.')
    if (profile.enabled && ports.has(profile.port))
      throw new Error('Enabled mocks must use different ports.')
    if (profile.enabled) ports.add(profile.port)
    return {
      id: profile.id,
      port: profile.port,
      enabled: profile.enabled,
      scenario: profile.scenario
    }
  })
  if (ports.size > 16) throw new Error('Enable at most 16 mocks at once.')
  return { nodeBin: value.nodeBin.trim(), profiles }
}
