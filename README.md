# FlyEnv Mocktoon

Local pretend services for your app to call, powered by **Mockoon CLI**. A community FlyEnv plugin by **mspacemedia**.

Copy an example, change its JSON, and use or abuse it in your own development and tests. The examples are the product: they are ordinary, MIT-licensed Mockoon environment files that also work without FlyEnv. We do not claim compatibility with any commercial provider's API.

## Included examples

| Example          | Default URL             | Routes                                             |
| ---------------- | ----------------------- | -------------------------------------------------- |
| **MockShip**     | `http://127.0.0.1:4010` | `POST /shipments`, `GET /tracking/:trackingNumber` |
| **MockPurchase** | `http://127.0.0.1:4011` | `POST /purchases`, `POST /refunds`                 |
| **MockSend**     | `http://127.0.0.1:4012` | `POST /deliveries`, `POST /webhooks`               |
| **MockStock**    | `http://127.0.0.1:4013` | `GET /products/:sku`, `POST /reservations`         |
| **MockAuth**     | `http://127.0.0.1:4014` | `POST /login`, `GET /me`                           |

These are deliberately **stateless fixtures**. Purchases do not charge money, stock reservations do not change inventory, tracking returns canned events, and auth tokens are example strings rather than signed JWTs. MockSend accepts and records the request body locally; it does not forward it or send email. Use provider sandboxes for testing actual provider integrations.

Every route includes **success**, **rejected** (422), **slow** (2 seconds), **unauthorised** (401), **rate-limited** (429 with Retry-After), and **unavailable** (503) responses. Send `x-mock-scenario: unavailable` to choose a failure, or choose a fixed scenario for a profile in FlyEnv. Success is the default. Fixed scenarios require matching response labels on every route; choose Request rules for independently customised routes.

## Install in FlyEnv

Add this third-party registry in **Settings → Plugin Market**:

```text
https://raw.githubusercontent.com/mspacemedia/flyenv-mocktoon/main/registry.json
```

Install **FlyEnv Mocktoon**, then open **Mocktoon**. FlyEnv's host manages third-party plugin approval and its existing license requirements. This plugin does not modify host licensing or settings.

1. Install/select a **Node.js 18+** runtime in FlyEnv (22 or 24 recommended).
2. Click **Install Mockoon 9.9.0**. The plugin runs `npm ci` in its own data directory with a pinned lockfile and package scripts disabled. Nothing is installed globally.
3. In **Examples & editor**, create editable copies of the examples you want.
4. In **Mock services**, enable the copies, choose distinct ports and scenarios, then **Save settings**.
5. **Start**. All enabled profiles run together in one managed Mockoon process, bound to `127.0.0.1`.
6. Point your app's integration URL at the matching base URL. For example, set your shipping adapter's base URL to `http://127.0.0.1:4010` and call `/shipments` using the contract you choose.
7. Open **Request history** and refresh to inspect requests and responses. Use **Service log** to investigate startup errors.

Edit saved JSON in the plugin or open the profile file directly. Each copy is independent of the bundled example. Save and restart to apply changes; running services use a launch snapshot. Plugin updates do not overwrite your copies. Service start/stop/restart and shutdown use FlyEnv's standard service lifecycle.

This first release supports inline HTTP routes. The plugin rejects proxy mode, callbacks, file-backed bodies, data buckets and folders; you can use Mockoon directly for those advanced features. Ports must be 1024–65535, with at most 16 enabled mocks. Each saved environment is limited to 256 KB; request bodies to 1 MB.

### Try it

```sh
curl -X POST http://127.0.0.1:4010/shipments \
  -H 'Content-Type: application/json' \
  -d '{"order_id":"order_demo","address":"Example Street"}'

curl -X POST http://127.0.0.1:4011/purchases \
  -H 'x-mock-scenario: rejected' \
  -H 'Content-Type: application/json' \
  -d '{"amount":1999,"currency":"GBP"}'

curl -X POST http://127.0.0.1:4012/deliveries \
  -H 'Content-Type: application/json' \
  -d '{"destination":"example-crm","customer_id":"customer_demo"}'
```

On Windows PowerShell, use `curl.exe` for these commands and adapt line continuations, or send requests with Postman/your app. Mocktoon plays the API server; an API client or browser test sends it requests.

## Use the examples without FlyEnv

```sh
npm install --prefix ./mock-runtime --ignore-scripts @mockoon/cli@9.9.0
node ./mock-runtime/node_modules/@mockoon/cli/bin/run.js start \
  --data examples/mockship.json examples/mockpurchase.json examples/mocksend.json \
  --hostname 127.0.0.1 127.0.0.1 127.0.0.1 \
  --disable-admin-api --disable-log-to-file --proxy disabled --log-transaction
```

You can also open the JSON files in a compatible Mockoon desktop application, commit your customised copies into a project, or run them in CI. [Example contracts and adaptation notes](examples/README.md) explain the fixtures. The generator in `scripts/generate-examples.mjs` deterministically regenerates the shipped JSON; do not run it over your project copies.

## Data and privacy

The plugin owns `<FlyEnv data directory>/mocktoon/`: the pinned runtime, `profiles/<id>/environment.json`, launch `sessions/`, PID file and logs. UI choices use `StorageGetAsync`/`StorageSetAsync` under `flyenv-mocktoon-settings-v1`; no module data is added to shared host configuration. Disable/update/uninstall retain user data. Runtime bootstrap staging is removed after its command finishes; an interrupted application can leave an unused `.installing-*` directory.

The admin API, proxying and TLS are disabled by the plugin. Bindings stay on IPv4 loopback. The plugin is not a sandbox: like other FlyEnv plugins it has local file/process/network access. Use test data. Transaction logs can contain complete request/response bodies; common credential headers are redacted in the history view. Starting a new session replaces the previous transaction log; **Clear history** works while stopped. The UI reads only the last 512 KB and shows up to 100 records; logs can grow on disk during a long session. Launch snapshots are retained for inspection.

## Build and test

Use a FlyEnv checkout with dependencies installed (tested against the 4.20.1 plugin API, host base `b32524eec377f20647a977a96b33d0d3497a866c`). The build wrapper stages only this plugin in a unique host directory and reuses FlyEnv's compiler; it does not modify the host registry or application source.

```sh
npm test -- --flyenv-root /path/to/FlyEnv
npm run test:runtime -- --flyenv-root /path/to/FlyEnv
npm run build -- --flyenv-root /path/to/FlyEnv
```

Build tools require Node.js 22+. `test:runtime` downloads the pinned npm runtime into an isolated test directory and makes local HTTP requests; it uses no external accounts or user project files. `build` produces `dist/mocktoon-0.1.0.flyenv-plugin` and its matching checksum registry. Distribute the archive and registry from the same build.

Windows runtime validation is performed locally. macOS/Linux launch and npm-path handling have focused tests; native acceptance on those operating systems remains outstanding. Contributions and better example packs are welcome.
