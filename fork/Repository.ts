import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exampleFiles } from '../shared/Examples'
import { profileId, type Catalog, type Profile } from '../shared/types'
import { validateEnvironment } from './Environment'

export class ProfileRepository {
  constructor(readonly root: string) {}
  file(id: string): string {
    return join(this.root, 'profiles', profileId(id), 'environment.json')
  }
  async read(id: string): Promise<string> {
    const file = this.file(id)
    const info = await stat(file)
    if (!info.isFile() || info.size > 256_000)
      throw new Error('Mock configuration must be a JSON file under 256 KB.')
    return readFile(file, 'utf8')
  }
  async describe(id: string): Promise<Profile> {
    const env = validateEnvironment(JSON.parse(await this.read(id)))
    return { id, name: env.name, port: Number(env.port), file: this.file(id) }
  }
  async list(): Promise<Catalog> {
    const directory = join(this.root, 'profiles')
    await mkdir(directory, { recursive: true })
    const profiles: Profile[] = [],
      skipped: string[] = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      try {
        profiles.push(await this.describe(entry.name))
      } catch (error) {
        skipped.push(`${entry.name}: ${String(error)}`)
      }
    }
    return { profiles: profiles.sort((a, b) => a.name.localeCompare(b.name)), skipped }
  }
  async create(id: string, example: string): Promise<Profile> {
    profileId(id)
    const source = exampleFiles[example]
    if (!source) throw new Error('Choose a bundled mock example.')
    const env = structuredClone(source) as any
    env.uuid = id
    const file = this.file(id)
    await mkdir(join(this.root, 'profiles', id), { recursive: true })
    try {
      await writeFile(file, JSON.stringify(env, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    return this.describe(id)
  }
  async save(id: string, text: string): Promise<Profile> {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 256_000)
      throw new Error('Mock JSON must be under 256 KB.')
    validateEnvironment(JSON.parse(text))
    // Require an existing owned profile; edit is never an arbitrary file write.
    await this.read(id)
    const file = this.file(id),
      temp = file + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(temp, text, { flag: 'wx', mode: 0o600 })
      await rename(temp, file)
    } finally {
      await rm(temp, { force: true }).catch(() => {})
    }
    return this.describe(id)
  }
}
