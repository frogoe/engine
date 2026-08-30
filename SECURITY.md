# Security Policy

## Reporting a vulnerability

Email: security@frogoe.com (or open a private security advisory:
**Security → Report a vulnerability** on this repo).

Please do not open public issues for suspected vulnerabilities. We respond
within 72 hours and credit reporters in the advisory.

## Scope

- The `frogoe` CLI and everything in this repository
- The npm package `frogoe` (supply chain: report suspected typosquats or
  compromised versions immediately)

## Posture

- npm publishes only from CI, via **trusted publishing (OIDC)** — no
  tokens exist to leak; every release is provenance-signed
- Every workflow action is pinned to a full commit SHA
- Stable releases ship only from reviewed release PRs; tags are verified
  against the release commit before publish
