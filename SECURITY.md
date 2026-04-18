# Security Policy

## Supported versions

| Version / branch                                                  | Supported | Notes                                                       |
| ----------------------------------------------------------------- | --------- | ----------------------------------------------------------- |
| `main`                                                            | ✅        | Active development line and first target for fixes          |
| latest published packages / extension in the current release line | ✅        | Supported on a best-effort basis after fixes land on `main` |
| older prereleases, stale tags, or archived builds                 | ❌        | Please upgrade before requesting a security fix             |

## Scope

This policy covers vulnerabilities introduced by BIRD-LSP components maintained in this repository, including:

- `@birdcc/parser`, `@birdcc/core`, `@birdcc/linter`, `@birdcc/formatter`, `@birdcc/lsp`, `@birdcc/cli`;
- the VS Code extension and packaged artifacts under `packages/@birdcc/vscode*`;
- schemas, release automation, workspace scripts, and repository-owned CI workflows.

Out of scope unless this repository directly introduces the issue:

- upstream BIRD daemon source code and binaries;
- third-party reference repositories under `refer/`;
- vulnerabilities in external package registries or GitHub-hosted runners;
- private user configurations that were exposed outside our software.

## Reporting a vulnerability

Please **do not** disclose suspected vulnerabilities in public issues, pull requests, discussions, screenshots, or example configs.

Preferred reporting path:

1. Use GitHub private vulnerability reporting when available: <https://github.com/bird-chinese-community/BIRD-LSP/security/advisories/new>
2. If private reporting is unavailable, email `npm-dev@birdcc.link` with a subject like `[SECURITY][BIRD-LSP] short summary`

Please include:

- affected package(s), command(s), extension version, or commit SHA;
- platform details (OS, Node.js, VS Code version, runner environment if relevant);
- the security impact (for example: command execution, workspace escape, secret exposure, path traversal, denial of service);
- a minimal reproduction or proof of concept;
- sanitized logs or sample configs with secrets, private addresses, and topology details removed.

## Response targets

We will make a good-faith effort to:

- acknowledge reports within 3 business days;
- provide an initial triage update within 7 business days;
- coordinate disclosure after a fix or mitigation is available.

## Coordinated disclosure

Please keep technical details private until maintainers confirm a public disclosure window. This helps protect users who may still be running vulnerable builds.

## Non-security reports

For normal bugs, feature requests, and questions, please use public GitHub Issues or Discussions instead of the private security channel.
