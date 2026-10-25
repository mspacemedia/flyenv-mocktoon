import { randomUUID } from 'node:crypto'
import type { Scenario } from '../shared/types'

export function validateEnvironment(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a Mockoon environment object.')
  const env = value as Record<string, any>
  if (
    !Number.isInteger(env.port) ||
    env.port < 1024 ||
    env.port > 65535 ||
    !env.tlsOptions ||
    typeof env.tlsOptions !== 'object'
  )
    throw new Error(
      'The environment needs a port between 1024 and 65535 and a TLS settings object.'
    )
  if (
    typeof env.name !== 'string' ||
    !env.name.trim() ||
    env.name.length > 120 ||
    !Array.isArray(env.routes) ||
    !env.routes.length ||
    env.routes.length > 200
  )
    throw new Error('A mock needs a name and at most 200 routes.')
  if (env.lastMigration !== 33 || typeof env.uuid !== 'string' || !Array.isArray(env.rootChildren))
    throw new Error('Use a Mockoon 9.9 environment (schema migration 33).')
  if (
    env.proxyMode ||
    env.proxyHost ||
    (env.callbacks?.length ?? 0) > 0 ||
    (env.data?.length ?? 0) > 0 ||
    (env.folders?.length ?? 0) > 0
  )
    throw new Error(
      'This first release supports inline HTTP examples without proxies, callbacks, data buckets or folders.'
    )
  for (const route of env.routes) {
    if (
      route.type !== 'http' ||
      typeof route.endpoint !== 'string' ||
      !Array.isArray(route.responses) ||
      !route.responses.length
    )
      throw new Error('Each route must be an HTTP route with responses.')
    if (route.endpoint.startsWith('__mocktoon/'))
      throw new Error('The __mocktoon path is reserved for service readiness.')
    if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(route.method))
      throw new Error('Unsupported HTTP method.')
    for (const response of route.responses) {
      if (
        response.bodyType !== 'INLINE' ||
        response.filePath ||
        response.sendFileAsBody ||
        response.databucketID ||
        response.callbacks?.length
      )
        throw new Error('Example responses must use inline bodies without files or callbacks.')
      if (
        typeof response.body !== 'string' ||
        response.body.length > 128_000 ||
        !Number.isInteger(response.statusCode) ||
        response.statusCode < 100 ||
        response.statusCode > 599 ||
        !Number.isFinite(response.latency) ||
        response.latency < 0 ||
        response.latency > 30_000
      )
        throw new Error('Invalid response body, status or latency (maximum 30 seconds).')
    }
  }
  return env
}

export function launchEnvironment(source: unknown, id: string, scenario: Scenario, nonce: string) {
  const env = structuredClone(validateEnvironment(source))
  env.uuid = id
  env.hostname = '127.0.0.1'
  env.endpointPrefix = ''
  env.latency = 0
  env.proxyMode = false
  env.proxyHost = ''
  env.tlsOptions.enabled = false
  if (scenario !== 'request') {
    for (const route of env.routes) {
      const chosen = route.responses.find((response: any) => response.label === scenario)
      if (!chosen)
        throw new Error(
          `Route ${route.endpoint} has no '${scenario}' response. Choose request rules for custom examples.`
        )
      route.responses = [{ ...chosen, rules: [], default: true }]
    }
  }
  const health = {
    uuid: randomUUID(),
    type: 'http',
    method: 'get',
    endpoint: '__mocktoon/health',
    documentation: '',
    responses: [
      {
        ...env.routes[0]?.responses[0],
        uuid: randomUUID(),
        body: JSON.stringify({ id, nonce }),
        statusCode: 200,
        latency: 0,
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        rules: [],
        default: true,
        label: 'health',
        disableTemplating: true
      }
    ],
    responseMode: null,
    streamingMode: null,
    streamingInterval: 0
  }
  env.routes.unshift(health)
  env.rootChildren.unshift({ type: 'route', uuid: health.uuid })
  return env
}
