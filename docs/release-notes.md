First community preview of FlyEnv Mocktoon, powered by Mockoon CLI 9.9.0.

- Five editable, MIT-licensed example packs: MockShip, MockPurchase, MockSend, MockStock and MockAuth.
- Normal and failure scenarios, including slow responses, rejection, authentication errors, rate limiting and service outages.
- Copy/edit Mockoon JSON inside FlyEnv; run enabled profiles together on separate localhost ports using standard service controls.
- Inspect captured HTTP requests and responses, with common credential headers redacted in the history view.
- Plugin-owned, pinned npm runtime installation using an integrity lockfile; no global installation or host patches.

Add this source in FlyEnv Settings → Plugin Market:

https://raw.githubusercontent.com/mspacemedia/flyenv-mocktoon/main/registry.json

Requires a compatible FlyEnv plugin host and an installed Node.js 18+ runtime. FlyEnv retains its existing plugin installation/license requirements.

Examples are simple stateless fixtures, with generic contracts. They do not process payments, send messages, maintain stock or provide real authentication. The example JSON also works directly with Mockoon CLI and can be adapted for CI.

Validation: real Windows CLI bootstrap and HTTP tests for all example endpoints/scenarios; fixed scenarios, request capture, custom copies and occupied-port failure; controller lifecycle and architecture tests; lint and plugin build/import checks. macOS/Linux path handling is tested; native runtime acceptance on those platforms remains outstanding. This preview has not yet had a manual in-app acceptance pass.

Install the attached `.flyenv-plugin` through its matching HTTPS registry rather than copying unpacked files into FlyEnv's plugin directory. Both assets belong to the same build and the registry carries the archive SHA-256.
