// Original, deliberately simple teaching fixtures. No provider SDK or account required.
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const id = (value) => {
  const hex = createHash('sha256').update(value).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
const definitions = [
  {
    id: 'mockship',
    name: 'MockShip',
    port: 4010,
    description: 'A pretend shipping provider: create a shipment and inspect canned tracking.',
    routes: [
      [
        'post',
        'shipments',
        201,
        {
          shipment_id: 'ship_example_001',
          tracking_number: 'MOCK-TRACK-001',
          status: 'accepted',
          mock: true
        }
      ],
      [
        'get',
        'tracking/:trackingNumber',
        200,
        {
          tracking_number: 'MOCK-TRACK-001',
          status: 'delivered',
          events: ['collected', 'in_transit', 'delivered'],
          mock: true
        }
      ]
    ]
  },
  {
    id: 'mockpurchase',
    name: 'MockPurchase',
    port: 4011,
    description:
      'A pretend purchase gateway: approvals, declines and canned refunds. No money moves.',
    routes: [
      [
        'post',
        'purchases',
        201,
        {
          purchase_id: 'purchase_example_001',
          status: 'approved',
          amount: 1999,
          currency: 'GBP',
          mock: true
        }
      ],
      [
        'post',
        'refunds',
        201,
        {
          refund_id: 'refund_example_001',
          purchase_id: 'purchase_example_001',
          status: 'refunded',
          mock: true
        }
      ]
    ]
  },
  {
    id: 'mocksend',
    name: 'MockSend',
    port: 4012,
    description:
      'A pretend CRM, warehouse or notification destination. Captures submitted payloads locally.',
    routes: [
      [
        'post',
        'deliveries',
        202,
        {
          delivery_id: 'delivery_example_001',
          status: 'accepted',
          destination: 'example-system',
          mock: true
        }
      ],
      ['post', 'webhooks', 202, { received: true, mock: true }]
    ]
  },
  {
    id: 'mockstock',
    name: 'MockStock',
    port: 4013,
    description: 'A pretend stock service: availability and canned reservations.',
    routes: [
      [
        'get',
        'products/:sku',
        200,
        { sku: 'DEMO-SKU-001', available: 12, warehouse: 'example-warehouse', mock: true }
      ],
      [
        'post',
        'reservations',
        201,
        {
          reservation_id: 'reservation_example_001',
          sku: 'DEMO-SKU-001',
          quantity: 1,
          status: 'reserved',
          mock: true
        }
      ]
    ]
  },
  {
    id: 'mockauth',
    name: 'MockAuth',
    port: 4014,
    description:
      'A pretend authentication API. Tokens are fixture strings, not real credentials or signed JWTs.',
    routes: [
      [
        'post',
        'login',
        200,
        {
          access_token: 'mocktoon-example-token',
          token_type: 'Bearer',
          expires_in: 3600,
          mock: true
        }
      ],
      [
        'get',
        'me',
        200,
        {
          id: 'user_example_001',
          name: 'Example Developer',
          email: 'developer@example.test',
          roles: ['customer'],
          mock: true
        }
      ]
    ]
  }
]
const variants = ['rejected', 'slow', 'unauthorised', 'rate-limited', 'unavailable', 'success']
const response = (key, scenario, status, body) => ({
  uuid: id(key + scenario),
  body: JSON.stringify(
    scenario === 'slow' || scenario === 'success'
      ? body
      : { error: scenario, message: `Example ${scenario} response`, mock: true },
    null,
    2
  ),
  latency: scenario === 'slow' ? 2000 : 0,
  statusCode:
    { rejected: 422, unauthorised: 401, 'rate-limited': 429, unavailable: 503 }[scenario] ?? status,
  label: scenario,
  headers: [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'X-Mocktoon-Example', value: 'true' },
    ...(scenario === 'rate-limited' ? [{ key: 'Retry-After', value: '30' }] : [])
  ],
  bodyType: 'INLINE',
  filePath: '',
  databucketID: '',
  sendFileAsBody: false,
  rules:
    scenario === 'success'
      ? []
      : [
          {
            target: 'header',
            modifier: 'x-mock-scenario',
            value: scenario,
            invert: false,
            operator: 'equals'
          }
        ],
  rulesOperator: 'AND',
  disableTemplating: false,
  fallbackTo404: false,
  default: scenario === 'success',
  crudKey: 'id',
  callbacks: []
})
const directory = resolve(import.meta.dirname, '../examples')
await mkdir(directory, { recursive: true })
for (const def of definitions) {
  const routes = def.routes.map(([method, endpoint, status, body]) => ({
    uuid: id(def.id + method + endpoint),
    type: 'http',
    documentation: `Editable example. Header x-mock-scenario selects a response; success is the default.`,
    method,
    endpoint,
    responses: variants.map((scenario) => response(def.id + endpoint, scenario, status, body)),
    responseMode: null,
    streamingMode: null,
    streamingInterval: 0
  }))
  const environment = {
    uuid: id(def.id),
    lastMigration: 33,
    name: def.name,
    endpointPrefix: '',
    latency: 0,
    port: def.port,
    hostname: '127.0.0.1',
    folders: [],
    routes,
    rootChildren: routes.map((route) => ({ type: 'route', uuid: route.uuid })),
    proxyMode: false,
    proxyHost: '',
    proxyRemovePrefix: false,
    tlsOptions: {
      enabled: false,
      type: 'CERT',
      pfxPath: '',
      certPath: '',
      keyPath: '',
      caPath: '',
      passphrase: ''
    },
    cors: true,
    headers: [],
    proxyReqHeaders: [],
    proxyResHeaders: [],
    data: [],
    callbacks: []
  }
  await writeFile(resolve(directory, def.id + '.json'), JSON.stringify(environment, null, 2) + '\n')
}
await writeFile(
  resolve(directory, 'catalog.json'),
  JSON.stringify(
    definitions.map(({ routes, ...entry }) => ({
      ...entry,
      endpoints: routes.map(([method, path]) => `${method.toUpperCase()} /${path}`)
    })),
    null,
    2
  ) + '\n'
)
console.log('Generated five editable Mockoon 9.9 examples.')
