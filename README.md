# HW Bot Central

Self-hosted visual management studio for Discord bots within Howling Whispers.

## v0.2.0 foundation

- Responsive React bot registry and configuration editor
- Script source workspace (storage only; **scripts cannot execute yet**)
- Encrypted-at-rest connection secrets (AES-256-GCM)
- SQLite persistence and admin-protected Fastify JSON API
- Connection profiles for PostgreSQL, MySQL, SQLite, Redis, Discord, HTTP and AI providers (**profiles only**, no live database/Discord connections yet)
- Basic audit events and CRUD API
- Character Studio: persistent character profiles, personality, speech, greeting and memory policy fields
- Discord Access Manager: saved per-guild channel allowlists, denylists and DM policy settings (**not yet enforced by running bots**)

**Not production ready:** Character and access policy records are stored but not enforced until the Discord runtime adapter is implemented.  This version does not launch Discord bots, execute user scripts, test remote SQL connections, provide a visual node editor, offer multi-user login or deploy containers. Status is explicitly 'unmanaged'. Use it only in a private development environment.

## Start locally

Requires Node.js 22+ and an npm installation capable of compiling better-sqlite3.

```bash
npm install
cp .env.example .env
# Edit .env: set ADMIN_API_TOKEN to a long random value and SECRETS_KEY_HEX to a 64-char hex key
# Load the variables into your shell or use: node --env-file=.env ./node_modules/tsx/dist/cli.mjs server/index.ts
npm run dev
```

For the development server, first load environment variables in the process environment (for example via `set -a; source .env; set +a` on bash). The UI runs at http://127.0.0.1:5173 and the API listens only on 127.0.0.1:3001 by default.

```bash
npm test
npm run build
```

## Security constraints

- Do not expose the API publicly. For remote access add HTTPS, proper session/OAuth2 identity management, role-based authorization, rate limiting and CSRF strategy before deployment.
- Secrets use an operator-managed encryption key. Store that key outside the database and back it up separately. API responses never return connection secrets.
- Saved scripts are data and are never executed. A separate locked-down worker service is required before implementing script execution.
- Current config JSON is **not encrypted**: never enter tokens, passwords, or API keys there. Use the encrypted connection-secret field.
- A compromised host or an operator with the master key could access credentials. Use restricted service accounts and rotate credentials after incidents.

## Roadmap

1. Discord application onboarding, gateway workers, slash command management and permission diagnostics.
2. Isolated script runners, explicit capabilities, and approved packages.
3. Real SQL drivers, connection validation, schema browser, migrations and backups.
4. Visual workflow nodes, dry-run tests and robust deployment orchestration.
5. Discord OAuth login, organizations/roles, audited deployments and GitHub releases.
