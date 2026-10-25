# Examples to use, abuse and replace

These original fixtures are MIT licensed. Copy any JSON file into your project and adapt its routes, status codes, JSON bodies, response headers and latency. They are not API implementations or provider contracts.

- **MockShip** illustrates accepting a shipment and reading a fixed tracking result.
- **MockPurchase** illustrates purchase approval/decline and a fixed refund response. It does not model balances, payment authentication or settlement.
- **MockSend** is a local sink for outbound data. The request history is where you inspect what your app sent; a 202 response only means the mock accepted it.
- **MockStock** returns a fixed SKU/quantity and reservation; there is no persistent inventory.
- **MockAuth** issues an obvious example token and profile; it does not check passwords or cryptographically validate tokens.

All JSON response bodies use deterministic sample IDs. POST request bodies are recorded but do not change the canned response. Start by modifying these bodies to match the contract your application expects. The `x-mock-scenario` header selects a named response using Mockoon's response rules; without it the response marked `default: true` is used.

Do not use production account data in examples. Do not commit captured user payloads or secrets. Test names/emails use the reserved `example.test` domain.

To add a pack, edit `scripts/generate-examples.mjs`, regenerate, and add real CLI tests for its endpoints. Keep the existing names/ports stable, document the request and response contract, and describe which behavior is simulated rather than implemented.
