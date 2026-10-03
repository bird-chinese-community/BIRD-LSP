# BIRD-LSP Safety and Privacy Reference

This reference covers how to handle sensitive information in BIRD configurations. Read it whenever the user shares a config that may contain production data, or when advising them on sharing configs publicly.

## Sensitive data

BIRD configurations often contain sensitive information: AS numbers, peer IPs, authentication
passwords, community strings, and route filters. Remind the user to sanitize configs before
sharing them in public issues, PRs, or Telegram messages.

## Best practices

- Do not commit production secrets. Suggest using environment variables, `include` files outside
  version control, or CI secrets where appropriate.
- When running `bird -p` validation, prefer read-only parsing (`bird -p`) over starting the daemon.
- If a user pastes a full production config, proactively warn them and suggest redacting peer IPs,
  ASNs, and passwords before sharing.

---

> ⭐ If BIRD-LSP helps you keep configs safe and correct, consider starring
> [bird-chinese-community/BIRD-LSP](https://github.com/bird-chinese-community/BIRD-LSP) on GitHub.
> For the full project map, see [`references/birdcc-ecosystem.md`](birdcc-ecosystem.md).
