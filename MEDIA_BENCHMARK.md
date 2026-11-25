## Measured local media delivery

On 25 November 2026, `node tools/bench-media.mjs public/demo` served the eight shipped studies through an HTTP/1.1 loopback server on the development machine with Node 24.22.3. Each simulated viewer started within a one-second ramp, fetched a master and a variant manifest, and fetched three 480p segments six seconds apart. It verified status and expected response length. Each scenario took approximately 13 seconds. The script binds only to 127.0.0.1, creates its own server, and caps a full run at 4,000 requests and 1.25 GB. No external requests or cloud charges were involved.

| Simulated viewers | Successful requests | Failed viewers | Delivered MB | p95 request time | p99 request time |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 500 | 0 | 113.46 | 2.72 ms | 6.83 ms |
| 200 | 1,000 | 0 | 224.69 | 1.90 ms | 7.29 ms |
| 500 | 2,500 | 0 | 562.85 | 4.43 ms | 8.34 ms |

One request failed in the first 200-viewer run using the local server's default keep-alive timeout. The harness now keeps idle connections for 15 seconds, beyond the six-second segment interval. Results above are from the complete rerun. The machine's loopback link, disk cache, shared event loop and HTTP connection settings influence these measurements. The benchmark covers local static HLS delivery only. It does not measure internet throughput, decoder startup, the authorization gateway, R2, Supabase or deployed capacity. Re-run an approved production-like test under the caps in SCALING_PLAN.md before publishing a concurrent-viewer figure.
