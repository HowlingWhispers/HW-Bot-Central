# Changelog

All notable changes are documented here. Version numbers follow Semantic Versioning (`MAJOR.MINOR.PATCH`) while the project remains pre-1.0.

## [0.2.0] - 2026-10-13
### Added
- Character Studio backend and GUI for names, species, personalities, greetings, speaking styles and memory policy labels.
- Server Access backend and GUI supporting Discord guild IDs, channel allowlists, channel denylists and DM policy flags.
- Explicit API acknowledgement that access policies are not enforced in the Discord Gateway yet.
- Versioning and release classification guide.
### Notes
- No live Discord server/channel discovery yet; Discord IDs must be entered manually.
- Character profiles are stored but not yet injected into a running AI provider.
- Existing bots, scripts, connection profiles and secrets remain intact.

## [0.1.0] - 2026-10-13
### Added
- First Bot Central React dashboard and backend API.
- Bot configuration and script source registry.
- Encrypted connection-secret storage and audit events.
- SQLite persistence and development administrator authentication.
