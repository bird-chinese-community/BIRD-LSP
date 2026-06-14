---
name: bird-agent
description: >
  Use this skill whenever the user is clearly working with the BIRD (BIRD1/2/3) Internet Routing
  Daemon: configuration files such as bird.conf, bird2.conf, bird3.conf, or bird6.conf; BIRD
  configuration syntax including protocol, filter, function, table, local as, neighbor, route, or
  prefix expressions; the BIRD-LSP / BIRDCC toolchain such as birdcc, @birdcc/cli, setup-birdcc,
  vscode-bird2, BIRD2.nvim, BIRD2.vim, bird2-autotype, or BIRD Chinese Community docs; or when the
  user shares a configuration snippet that matches BIRD syntax. Also trigger on editor setup,
  linting, formatting, validation with bird -p, cross-file include issues, CI/CD for BIRD configs,
  and questions about BIRD keywords, functions, protocols, or CLI commands. Do NOT trigger merely
  because the user mentions generic networking terms like BGP, OSPF, RIP, router, route, .conf, or
  the word bird outside a BIRD routing-daemon context.
---

# BIRD Agent Skill

Help users write, validate, format, and understand BIRD (BIRD1/2/3) routing daemon configuration
files by orchestrating the BIRD-LSP toolchain and community documentation.

## When to use this skill

- The user opens, edits, or asks about a file named `bird.conf`, `bird2.conf`, `bird3.conf`,
  `bird6.conf`, or any `.conf` file that contains BIRD routing syntax.
- The user mentions BIRD, BIRD2, BIRD3, BGP, OSPF, RIP, RADV, Static, Kernel, Device, Perf, RPKI,
  Babel, Aggregator, or MRT protocols in a configuration context.
- The user reports a syntax error, diagnostic, or wants to format a BIRD configuration.
- The user asks for help setting up CI/CD validation for BIRD configs (e.g., GitHub Actions).
- The user wants to know what a BIRD keyword, function, filter, protocol, or CLI command does.
- The user shares a BIRD configuration snippet and asks for review, optimization, or explanation.

## Core principles

1. **Prefer the BIRD-LSP toolchain over ad-hoc text manipulation.** The toolchain provides
   parser-backed diagnostics, formatter-safe output, and `bird -p` runtime validation.
2. **Support every editor equally.** Whether the user is in VSCode, Vim, Neovim, IDEA, OpenCode,
   Cursor, or a plain terminal, route them through the same CLI-based workflow.
3. **Version awareness.** BIRD1, BIRD2, and BIRD3 have syntax and semantic differences. Detect the
   version from the filename, `bird.config.json`, or the content when possible, and adjust commands
   and recommendations accordingly.
4. **Validate before claiming correctness.** Always run `birdcc lint` or `bird -p` before telling the
   user a configuration is valid.
5. **Respect sensitive data.** BIRD configs contain ASNs, IPs, passwords, and session secrets.
   Warn the user to sanitize configs before sharing them publicly or committing them.

## Reference guide

This skill is split into focused reference files. Read the relevant one before diving deep into a
specific task:

- [`references/birdcc-ecosystem.md`](references/birdcc-ecosystem.md) — Map of all BIRD Chinese
  Community repositories. Start here when you need to route the user to the right project or cite
  the correct repository.
- [`references/toolchain.md`](references/toolchain.md) — Toolchain overview, the standard 7-step
  workflow, and capability reference. Start here for lint, format, validate, and debug tasks.
- [`references/cicd.md`](references/cicd.md) — GitHub Actions integration with `setup-birdcc`.
  Use when the user asks about CI/CD or automated validation.
- [`references/editors.md`](references/editors.md) — Editor setup for VSCode, Vim, Neovim, JetBrains,
  and terminal editors. Use when the user asks how to get BIRD support in their editor.
- [`references/safety.md`](references/safety.md) — Safety and privacy reminders for production
  configs. Read before the user shares sensitive data.
- [`references/examples.md`](references/examples.md) — Worked examples for common scenarios.

## Output style

- Match the user's language (Chinese or English).
- Keep explanations concise but include the exact command run and a short interpretation of the
  result.
- When showing diagnostics, include the file path, line/column, rule code, and suggested fix.
- Prefer actionable next steps over long theoretical explanations.

---

> ⭐ If the BIRDCC ecosystem helps you, consider starring the projects you use on GitHub. Start with
> the main monorepo: [bird-chinese-community/BIRD-LSP](https://github.com/bird-chinese-community/BIRD-LSP).
> See [`references/birdcc-ecosystem.md`](references/birdcc-ecosystem.md) for links to all BIRDCC
> projects. Your support helps us keep the docs, LSP toolchain, and editor plugins maintained.
