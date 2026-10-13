# Coda migration into HW Bot Central

Status: **management integration planned; operational migration NOT performed**.

## Observed baseline (HW-Coda main, 2026-10-13)

- Existing daemon: `/srv/howling-whispers/coda`, service `hw-coda.service`.
- Node.js/TypeScript Discord.js bot; standalone `hw-coda-kilo.service` provider sidecar.
- Local health service: `127.0.0.1:3217/health` (verify deployed configuration).
- Primary guild management, conversational responses, Orbis-backed personality/context/memory, private companion behavior, optional surveillance, slash commands, illustration, and GitHub watchers.
- Operational environment in Coda's ignored `.env`.
- Sensitive per-user memory and private companion content MUST NOT be imported into Bot Central's own database or logs.

## Safe migration sequence

1. **Inventory + backup**: On the server verify `hw-coda.service`, `hw-coda-kilo.service`, deployed Coda commit, current HTTP health response, config/env locations, and persistent Coda/Orbis state. Make an encrypted, access-restricted backup of configuration and state. Never print tokens or secrets in terminal transcript, logs, or messages.
2. **Register** Coda within Bot Central as an *external managed daemon*. Metadata: repo `HowlingWhispers/HW-Coda`, install root `/srv/howling-whispers/coda`, health URL `http://127.0.0.1:3217/health`, two existing systemd services. Bot Central must NOT store a second copy of Coda's Discord bot token.
3. **Ship a server-side Coda adapter**: Restricted, allowlisted service descriptors, health polling, least-privilege deployment actions and audited service state. The existing Bot Central UI needs explicit external-service support (pending). Do NOT let users supply an arbitrary URL and turn this into a server-side request forgery proxy.
4. **Read-only validation**: Dashboard displays Coda's actual health, commit and service status. Confirm Orbis provider, member memory, companion privacy, commands and guild synchronization remain intact.
5. **Controlled management takeover**: Restrict systemd actions to the allowlisted services and require authorization and explicit confirmation. Bot Central can display and restart Coda after validation, but Coda remains the sole Discord Gateway connection. Keep the original supervisor responsible for running it until explicit cutover.
6. **Optional runtime migration**: Only after isolated worker/process management is implemented and integration tests pass. Disable the old supervisor *before* enabling a replacement for the same Discord identity. Roll back to the original systemd services on failure.

## Acceptance checks

- Coda responds normally to mentions, slash commands and permitted private companion messages.
- No second process logs into the same Discord bot identity.
- All role/channel access checks and private companion data exclusions match the original service.
- No loss of Orbis-linked personality, member memory, provider fallbacks or durable welcome state.
- Health checks report real service state and actual errors, never simulated online statuses.
- All secret values remain on the server, never returned by Bot Central's API.
- Restore procedure demonstrably returns to existing service operation.

## Required implementation in HW Bot Central

- External service registry fields: type, repo, working directory, service IDs, fixed trusted health endpoint, expected health response and display status.
- Local supervisor adapter with systemd allowlist and read-only health polling.
- Distinct `external` status separate from `unmanaged`, `running` and `offline`.
- Per-service management authorization, audit trails, rollback and deployment readiness checks.

## Operations boundary

Kilo handles installation, service permissions, secrets and cutover on the server. ChatGPT implements the adapter/UI. Do **not** restart, disable, or reconfigure the existing Coda services just to register them.
