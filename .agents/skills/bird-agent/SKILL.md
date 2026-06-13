---
name: bird-agent
description: >
  Use this skill whenever the user is working with BIRD (BIRD1/2/3) routing daemon configuration files,
  including bird.conf, bird2.conf, bird3.conf, or bird6.conf. This skill helps AI agents assist users
  across any editor (VSCode, Vim, Neovim, IDEA, OpenCode, Cursor, Windsurf, etc.) by leveraging the
  BIRD-LSP toolchain: linting, formatting, validation with bird -p, cross-file analysis,
  documentation lookup, and source-level debugging. Trigger on any mention of BIRD config,
  BGP/OSPF/RIP/static routing configuration, syntax errors in .conf files, formatting requests,
  CI/CD setup for BIRD configs, questions about BIRD commands and semantics, editor setup for BIRD
  support, BIRDCC projects such as vscode-bird2, BIRD2.nvim, BIRD2.vim, setup-birdcc,
  bird2-autotype, or the BIRD Chinese Community documentation, or when the user shares a BIRD
  configuration snippet. Make sure to use this skill even if the user does not explicitly mention
  BIRD-LSP, @birdcc/cli, or the BIRD Chinese Community.
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
