import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

const source = resolve(import.meta.dirname, '..')
const [action, option, argument] = process.argv.slice(2)
if (!['build', 'test', 'runtime'].includes(action) || option !== '--flyenv-root' || !argument)
  throw new Error('Usage: npm run build|test|test:runtime -- --flyenv-root /path/to/FlyEnv')
const host = resolve(argument)
if (JSON.parse(await readFile(join(host, 'package.json'), 'utf8')).name !== 'FlyEnv')
  throw new Error('Expected a FlyEnv checkout.')
const tsx = join(host, 'node_modules/tsx/dist/cli.mjs')
await readFile(tsx)
const manifest = JSON.parse(await readFile(join(source, 'plugin.json'), 'utf8'))
if (manifest.id !== 'mocktoon' || !/^\d+\.\d+\.\d+$/.test(manifest.version))
  throw new Error('Unexpected plugin identity.')
const plugins = join(host, 'plugins')
const staging = await mkdtemp(join(plugins, 'mocktoon-build-'))
const owned = relative(plugins, staging)
if (!owned.startsWith('mocktoon-build-') || owned.includes(sep))
  throw new Error('Unexpected staging directory.')
const run = (script) =>
  new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [tsx, '--tsconfig', join(host, 'tsconfig.json'), ...script],
      { cwd: host, stdio: 'inherit', shell: false, windowsHide: true }
    )
    child.once('error', fail)
    child.once('close', (code) =>
      code === 0 ? done() : fail(new Error(`Validation/build exited with code ${code}.`))
    )
  })
try {
  for (const path of [
    'assets',
    'examples',
    'fork',
    'lang',
    'render',
    'shared',
    'tests',
    'docs',
    'plugin.json',
    'README.md',
    'LICENSE',
    'NOTICE'
  ])
    await cp(join(source, path), join(staging, path), { recursive: true })
  await mkdir(join(staging, 'runtime'))
  for (const file of ['package.json', 'package-lock.json'])
    await cp(join(source, 'runtime', file), join(staging, 'runtime', file))
  if (action === 'runtime') await run([join(staging, 'tests/runtime.test.ts')])
  else if (action === 'test') {
    for (const file of ['core.test.ts', 'controller.test.ts'])
      await run([join(staging, 'tests', file)])
    await run([join(host, 'scripts/plugin-test.ts'), basename(staging)])
  } else {
    const dist = join(source, 'dist'),
      output = join(dist, 'mocktoon')
    const archive = join(dist, `mocktoon-${manifest.version}.flyenv-plugin`)
    await mkdir(dist, { recursive: true })
    await rm(archive, { force: true })
    if (resolve(output) !== resolve(source, 'dist/mocktoon'))
      throw new Error('Unexpected package output.')
    const helper = join(staging, 'build-package.ts')
    await writeFile(
      helper,
      [
        "import {buildPlugin, packPlugin} from '../../scripts/plugin-builder'",
        "import {cp, copyFile} from 'node:fs/promises'",
        `await buildPlugin(${JSON.stringify(basename(staging))}, {outputRoot:${JSON.stringify(output)},minify:true,archive:false})`,
        `await cp(${JSON.stringify(join(staging, 'examples'))}, ${JSON.stringify(join(output, 'examples'))}, {recursive:true})`,
        `await copyFile(${JSON.stringify(join(staging, 'NOTICE'))}, ${JSON.stringify(join(output, 'NOTICE'))})`,
        `await packPlugin(${JSON.stringify(output)}, ${JSON.stringify(archive)})`
      ].join('\n')
    )
    await run([helper])
    const sha256 = createHash('sha256')
      .update(await readFile(archive))
      .digest('hex')
    const registry = {
      schemaVersion: 1,
      plugins: [
        {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          homepage: manifest.homepage,
          module: manifest.module,
          platforms: manifest.module.platform,
          artifact: {
            url: `https://github.com/mspacemedia/flyenv-mocktoon/releases/download/v${manifest.version}/${basename(archive)}`,
            sha256
          },
          official: false
        }
      ]
    }
    await writeFile(join(dist, 'registry.json'), JSON.stringify(registry, null, 2) + '\n')
    console.log(`Built ${archive}\nSHA-256: ${sha256}`)
  }
} finally {
  if (dirname(staging) === plugins && basename(staging).startsWith('mocktoon-build-'))
    await rm(staging, { recursive: true, force: true }).catch((error) =>
      console.warn(`Staging cleanup failed: ${error.message}`)
    )
}
