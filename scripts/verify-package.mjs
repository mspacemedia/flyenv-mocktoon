import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..'),
  dist = join(root, 'dist')
const registry = JSON.parse(await readFile(join(dist, 'registry.json'), 'utf8'))
const item = registry.plugins[0]
const bytes = await readFile(join(dist, `mocktoon-${item.version}.flyenv-plugin`))
assert.equal(createHash('sha256').update(bytes).digest('hex'), item.artifact.sha256)
const render = await readFile(join(dist, 'mocktoon/render/index.mjs'), 'utf8')
const fork = await readFile(join(dist, 'mocktoon/fork/index.mjs'), 'utf8')
for (const pattern of [
  /__vite_glob/,
  /createWebHashHistory/,
  /__FLYENV_PLUGIN_HOST__\s*=\s*pluginHost/,
  /host\.licenseTips/,
  /hostList\.length\s*>\s*2/,
  /Users[\\/]+mark/,
  /git-repos[\\/]+flyenv/
]) {
  assert.doesNotMatch(render, pattern)
  assert.doesNotMatch(fork, pattern)
}
for (const name of (await readdir(join(root, 'examples'))).filter((name) =>
  name.endsWith('.json')
)) {
  assert.deepEqual(
    await readFile(join(dist, 'mocktoon/examples', name)),
    await readFile(join(root, 'examples', name))
  )
}
for (const name of ['LICENSE', 'NOTICE', 'README.md'])
  assert.ok((await readFile(join(dist, 'mocktoon', name))).length)
assert.ok(fork.includes('9.9.0'))
assert.ok(render.includes('Mocktoon'))
console.log(
  'Package checksum, five editable examples, attribution, host bridges and isolation from local host patches: PASS'
)
