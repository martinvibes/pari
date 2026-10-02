# Vendored packages

Pari settles through the Canton token standard (CIP-56). These DARs are the
unmodified Splice 0.6.13 releases, Apache-2.0, vendored so the model builds
offline and pins the exact package ids deployed on Canton networks.

| DAR | Used by | SHA-256 |
|---|---|---|
| `splice-api-token-metadata-v1-1.0.0.dar` | model | `455eb160cb5abd4ae9918a6fbb9dad471f721adda39f0e5c76feef08d05637fc` |
| `splice-api-token-holding-v1-1.0.0.dar` | model | `ef75f8eb41a65810221784fdb78bb9dfac7cb22245aba14fa7cb7f69c34e0175` |
| `splice-api-token-allocation-v1-1.0.0.dar` | model | `c3f3b447142577ea4fa7d912ca11cd6821de7588e324e8877425932a02fccaa1` |
| `splice-api-token-allocation-request-v1-1.0.0.dar` | model | `5aed3f7e69a2c84b2be9d2033c07029fcde375d5041db264e58f44c8c7538303` |
| `splice-api-token-allocation-instruction-v1-1.0.0.dar` | tests | `e2607ca3a1d735a82d3066b78132aa8f94b1886c99a5f14148742d252c7220a2` |
| `splice-test-token-v1-1.0.0.dar` | tests | `7596a91db7d8380c778242137f74e047a51e2fc606f1980ab9f90091789f1fd9` |

The test token is a reference CIP-56 registry used only by the test suite. On
DevNet and MainNet, Pari settles in Canton Coin or any other CIP-56 instrument
through the same allocation interfaces.
