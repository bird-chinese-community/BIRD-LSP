# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **BIRD2 LSP + Formatter toolchain** project - a developer tool suite for the BIRD2 (BIRD Internet Routing Daemon) configuration language. The project is currently in the planning/design phase.

**Target deliverables:**

- `@birdcc/parser` - Tree-sitter based parser with WASM adapter
- `@birdcc/core` - AST, Symbol Table, Type Checker
- `@birdcc/linter` - Rules and diagnostics engine
- `@birdcc/lsp` - LSP server implementation
- `@birdcc/formatter` - dprint plugin for formatting
- `@birdcc/cli` - Aggregated CLI (`birdcc lint/fmt/lsp`)

## Repository Structure

```
├── refer/                          # Reference code as git submodules
│   ├── BIRD-source-code/           # BIRD official C source (gitlab.nic.cz/labs/bird.git)
│   ├── BIRD-tm-language-grammar/   # TextMate grammar for BIRD2
│   └── BIRD2-vim-grammar/          # Vim syntax highlighting
├── vibe-coding-github-sop/         # Vibe Coding SOP documentation
│   └── SKILL.md                    # Standardized workflow for GitHub Projects
└── TASKLIST.md                     # Main implementation report (read this first)
```

## Key Documents

- **TASKLIST.md** - Primary technical specification containing:
  - Technology selection (Tree-sitter, dprint, vscode-languageserver-node)
  - Architecture design and package structure
  - Milestone planning (MVP 16-20 weeks, Full 24-30 weeks)
  - Linter rule system design
  - BIRD integration strategy (`bird -p` / `birdc`)

- **vibe-coding-github-sop/SKILL.md** - Project management SOP:
  - GitHub Projects v2 workflow
  - Issue/PR labeling conventions
  - Conventional Commits format
  - Agent collaboration guidelines

## Git Submodules

This repository uses git submodules for reference code:

```bash
# Initialize submodules
git submodule update --init --recursive

# Update submodules to latest
git submodule update --remote
```

**Submodules:**

- `refer/BIRD-source-code` - BIRD daemon source for parser reference
- `refer/BIRD-tm-language-grammar` - TextMate grammar (has its own pre-commit hooks)
- `refer/BIRD2-vim-grammar` - Vim syntax files

## Development Commands

**Currently, the main project has no build commands** (planning phase). The submodules have their own workflows:

### BIRD-tm-language-grammar submodule

Uses `prek` (pre-commit runner):

```bash
cd refer/BIRD-tm-language-grammar

# Install hooks
prek install --install-hooks --hook-type pre-commit --hook-type pre-push --hook-type commit-msg

# Run checks
prek run --files grammars/bird2.tmLanguage.json
prek run --all-files

# Version bump
node scripts/bump-version.js --dry-run
node scripts/bump-version.js
```

### BIRD-source-code submodule

Standard autotools C project:

```bash
cd refer/BIRD-source-code
./configure
make
make install
```

## Architecture

**Parser Layer:** Tree-sitter handles incremental parsing and error recovery
**Semantic Layer:** Custom Symbol Table + Type Checker in TypeScript
**LSP Layer:** vscode-languageserver-node for editor integration
**Formatter:** dprint plugin (WASM-based for distribution)
**BIRD Integration:** Progressive - `bird -p` (MVP) → `birdc` readonly (M4) → Socket (future)

## BIRD2 Language Characteristics

BIRD2 config has a **dual-layer language model**:

1. **Config DSL layer** - `protocol/template/filter/function` structures
2. **Filter expression layer** - Complex type system (15+ types), control flow, operator overloading, method calls

Key syntax elements:

- `router id`, `log syslog`
- `define` for constants
- `protocol bgp/ospf/static` blocks
- `filter` blocks with complex expressions
- `include` for file inclusion
- Template inheritance

## Planned Package Structure

```
packages/
  @birdcc/parser/      # Tree-sitter grammar + WASM + JS adapter
  @birdcc/core/        # AST / Symbol / Type Checker
  @birdcc/linter/      # Rules / Diagnostics
  @birdcc/lsp/         # LSP server
  @birdcc/formatter/   # dprint plugin
  @birdcc/cli/         # birdcc lint/fmt/lsp commands
shared/
  config/
tests/
  fixtures/
  snapshots/
```

## CLI Design (Planned)

```bash
birdcc lint sample/basic.conf --format json --max-warnings 0
birdcc fmt sample/basic.conf --check
birdcc fmt sample/basic.conf --write
birdcc lsp --stdio
```

## Milestones

| Phase | Timeline   | Key Goals                                                  |
| ----- | ---------- | ---------------------------------------------------------- |
| M1    | 4-5 weeks  | Tree-sitter grammar (config DSL) + fixtures                |
| M2    | 6-7 weeks  | LSP basics + error recovery + `bird -p` PoC                |
| M3    | 6-8 weeks  | Symbol/Type Checker + include support + `bird -p` blocking |
| M4    | 8-10 weeks | Protocol rules + dprint stable + `birdc` readonly          |

## Technology Preferences

- **Parser:** Tree-sitter (incremental parsing, error recovery)
- **LSP:** vscode-languageserver-node
- **Formatter:** dprint (performance, WASM distribution)
- **Language:** TypeScript with ESM modules
- **Icons:** lucide (if UI needed)
- **Animation:** motion or gsap
- **Validation:** zod (avoid regex)

## Notes

- Project is in planning phase - no active code yet
- Tree-sitter grammar development is the first priority
- BIRD2 Filter expressions are complex - treat as a programming language, not simple config
- BIRD integration starts with `bird -p` subprocess, not direct parser reuse
- npm scope and CLI name: `birdcc`
