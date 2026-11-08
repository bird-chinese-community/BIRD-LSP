# BIRD Configuration File Specification

> Version: 1.0.0  
> Schema: `bird.config.schema.json`

The `bird.config.json` file serves as the project entry point for BIRD routing daemon configurations, similar to `package.json` for Node.js or `Cargo.toml` for Rust. It provides a centralized configuration for the BIRD-LSP toolchain, CLI tools, and editor integrations.

---

## Quick Start

Create a `bird.config.json` in your project root:

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "main": "bird.conf",
  "bird": {
    "validateCommand": "bird -p -c {file}"
  }
}
```

---

## Configuration Structure

```text
bird.config.json
├── $schema              # Schema URL for IDE validation
├── main                 # Entry point file
├── workspaces           # Monorepo sub-projects (optional)
├── roles                # Accepted by the schema; not read
├── includePaths         # Additional include search paths
├── bird                 # BIRD daemon settings
├── crossFile            # Cross-file analysis settings
├── linter               # Static analysis configuration
└── formatter            # Code formatting settings
```

---

## Core Configuration

### `main`

**Type:** `string`  
**Default:** none

Specifies the entry point configuration file for the project. Without `main` and `workspaces`, `birdcc lint` and `birdcc fmt` without a file argument use `bird.conf` in the config file's directory, and the language server analyzes each open document as its own entry.

```json
{
  "main": "bird.conf"
}
```

**Notes:**

- Path is relative to the `bird.config.json` location
- Ignored when `workspaces` is set (each workspace uses its own entry file)
- Supports absolute paths for system-wide configurations
- When the file does not exist, `birdcc lint` and `birdcc fmt` fail and the language server analyzes the open document as its own entry

---

### `workspaces`

**Type:** `string[]`

Defines glob patterns for monorepo setups with multiple routers or PoPs.

```json
{
  "workspaces": ["*/"]
}
```

**Common Patterns:**

| Pattern                            | Description                                                               |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `["*/"]`                           | The config file's directory and its direct subdirectories                 |
| `["sites/*", "!sites/legacy"]`     | All sites except legacy                                                   |
| `["pop-*/**"]`                     | Directories at any depth below each `pop-*` directory, not `pop-*` itself |
| `["routers/eu-*", "routers/us-*"]` | Regional filtering                                                        |

**Workspace Discovery:**

- Patterns match directory paths relative to the config file. `*` and `?` match within one path segment, `**` matches across segments, a leading `!` excludes, and a later pattern overrides an earlier one
- The entry file of a workspace is always `bird.conf`; `birdcc lint` skips matched directories without one, along with hidden directories, symbolic links, and `node_modules`, `dist`, `build`, `target`, `coverage`, `.turbo`, and `.pnpm`
- `birdcc lint` without a file argument lints the `bird.conf` of every matched directory; `birdcc fmt` requires a file argument; the language server uses the `bird.conf` of the deepest matched directory that contains the open document
- Shared configurations outside the workspace directories need an `includePaths` entry and `crossFile.externalIncludes: true`; otherwise `birdcc lint` and the language server skip includes that resolve outside a workspace directory

---

### `includePaths`

**Type:** `string[]`

Additional directories for resolving `include` directives. Relative paths resolve against the config file's directory.

```json
{
  "includePaths": ["./filters", "./peers", "../shared/templates"]
}
```

**Resolution Order:**

1. Directory of the file that contains the `include`
2. Default search paths:
   - Language server: the config file's directory
   - `birdcc lint`: the linted file's directory when it contains an `include`; otherwise the project directory found by entry detection and the directory of the detected entry
3. Paths specified in `includePaths` (in order)

Each search path is tried with the full include path and then with leading directories removed (`a/b/c.conf`, `b/c.conf`, `c.conf`).

`birdcc lint` and the language server skip include targets outside the workspace root unless [`crossFile.externalIncludes`](#crossfileexternalincludes) is `true`.

---

## BIRD Daemon Settings

### `bird`

Configuration for interacting with the BIRD routing daemon.

```json
{
  "bird": {
    "version": ">=2.0",
    "binaryPath": "/usr/sbin/bird",
    "validateCommand": "sudo bird -p -c {file}",
    "socketPath": "/run/bird/bird.ctl"
  }
}
```

#### `bird.version`

**Type:** `string`

Free-form version note. The schema accepts the field; `birdcc` and the language server do not read it.

```json
{
  "bird": {
    "version": ">=2.0"
  }
}
```

#### `bird.binaryPath`

**Type:** `string`

Path to the BIRD binary. Used as fallback when `validateCommand` is not specified: `birdcc lint --bird` runs `<binaryPath> -p -c {file}`.

**Priority Order:**

1. `--validate-command` option of `birdcc lint`
2. `bird.validateCommand`
3. `bird.binaryPath`
4. `BIRD_BIN` environment variable
5. `bird` from the system `PATH`

#### `bird.validateCommand`

**Type:** `string`  
**Default:** `"bird -p -c {file}"`

Command template for syntax validation with `birdcc lint --bird` or `linter.withBird`. `birdcc` replaces `{file}` with the absolute path of the linted file and appends the path when the template has no `{file}`. The command runs without a shell, in the directory of the linted file, with a 10-second timeout. The language server does not run validation.

```json
{
  "bird": {
    "validateCommand": "docker exec bird bird -p -c {file}"
  }
}
```

**Common Variations:**

| Environment | Command                                |
| ----------- | -------------------------------------- |
| Local       | `"bird -p -c {file}"`                  |
| With sudo   | `"sudo bird -p -c {file}"`             |
| IPv6        | `"bird6 -p -c {file}"`                 |
| Docker      | `"docker exec bird bird -p -c {file}"` |
| Remote      | `"ssh router bird -p -c {file}"`       |

The path passed to the command is a path on the local file system. Docker and remote commands need the file at the same path inside the container or on the remote host.

#### `bird.socketPath`

**Type:** `string`

Path to the BIRD control socket. The schema accepts the field; `birdcc` and the language server do not read it.

---

## Cross-File Analysis

### `crossFile`

Settings for analyzing `include` directives across multiple files.

```json
{
  "crossFile": {
    "enabled": true,
    "maxDepth": 16,
    "maxFiles": 256,
    "externalIncludes": false
  }
}
```

#### `crossFile.enabled`

**Type:** `boolean`  
**Default:** `true`

Enable cross-file include analysis.

#### `crossFile.maxDepth`

**Type:** `integer`  
**Default:** `16`

Maximum nesting depth for include expansion. Includes nested deeper are skipped and reported. Each file is analyzed once, so circular includes terminate independently of this limit.

#### `crossFile.maxFiles`

**Type:** `integer`  
**Default:** `256`

Maximum number of files to analyze. Limits resource usage for large projects.

#### `crossFile.externalIncludes`

**Type:** `boolean`  
**Default:** `false`

Allow includes outside the workspace root. Without it, `birdcc lint` and the language server skip include targets outside the root and report them as `sym/undefined` diagnostics. Enable with caution for security.

The workspace root is:

- `birdcc lint`: the directory of the linted file when it contains an `include`; otherwise the project directory found by entry detection
- Language server: the matched workspace directory with `workspaces`, otherwise the config file's directory

#### `crossFile.maxDocumentBytes`

**Type:** `integer`  
**Default:** `2097152` (2 MiB)

Maximum size of one document. `birdcc lint` fails when the target file is larger; the language server reports a larger open document with an `analysis/size-limit` diagnostic. See [Analysis budgets](./analysis-budgets.md).

#### `crossFile.maxTotalBytes`

**Type:** `integer`  
**Default:** `16777216` (16 MiB)

Maximum total size of all documents in one include graph. See [Analysis budgets](./analysis-budgets.md).

---

## Linter Configuration

### `linter`

Static analysis settings for BIRD configuration files.

```json
{
  "linter": {
    "enabled": true,
    "withBird": false,
    "extends": ["bird-recommended"],
    "rules": {
      "sym/*": "error",
      "cfg/*": "error",
      "bgp/*": "warning",
      "ospf/*": "info"
    }
  }
}
```

#### `linter.enabled`

**Type:** `boolean`  
**Default:** `true`

Enable static analysis.

#### `linter.withBird`

**Type:** `boolean`  
**Default:** `false`

Also run BIRD validation (`bird -p`) in addition to static analysis in `birdcc lint`. Uses `bird.validateCommand` if set, otherwise falls back to `bird.binaryPath` or `BIRD_BIN`. The language server does not run BIRD validation.

#### `linter.extends`

**Type:** `string[]`

Reserved for inheriting rule configurations from presets. The field is accepted, but presets are not applied yet; configure `linter.rules` directly.

```json
{
  "linter": {
    "extends": ["bird-recommended", "@myorg/bird-strict", "./local-rules.json"]
  }
}
```

#### `linter.rules`

**Type:** `object`

Per-rule severity overrides. Keys are rule codes or `<group>/*` patterns. An exact rule code wins over a pattern, and a longer pattern wins over a shorter one.

**Rule Categories:**

| Prefix   | Description                              | Default severity |
| -------- | ---------------------------------------- | ---------------- |
| `sym/*`  | Symbol validation (undefined, duplicate) | `warning`        |
| `cfg/*`  | Configuration errors                     | `warning`        |
| `net/*`  | Network/prefix validation                | `warning`        |
| `type/*` | Type checking                            | `warning`        |
| `bgp/*`  | BGP-specific rules                       | `info`           |
| `ospf/*` | OSPF-specific rules                      | `info`           |

**Severity Levels:**

| Level       | Behavior                                    |
| ----------- | ------------------------------------------- |
| `"error"`   | Reported; `birdcc lint` exits with status 1 |
| `"warning"` | Reported; exit status 0                     |
| `"info"`    | Reported; exit status 0                     |
| `"off"`     | Disabled                                    |

**Example Configuration:**

```json
{
  "linter": {
    "rules": {
      "sym/*": "error",
      "cfg/*": "error",
      "net/*": "error",
      "type/*": "error",
      "bgp/*": "warning",
      "ospf/*": "warning",
      "bgp/missing-local-as": "error"
    }
  }
}
```

---

## Formatter Configuration

### `formatter`

Code formatting settings.

```json
{
  "formatter": {
    "engine": "dprint",
    "indentSize": 2,
    "lineWidth": 100,
    "safeMode": true
  }
}
```

#### `formatter.engine`

**Type:** `"dprint" | "builtin"`  
**Default:** `"dprint"`

Formatter engine selection:

- `dprint` - The `@birdcc/dprint-plugin-bird` WebAssembly plugin, configured with `indentSize`, `lineWidth`, `useTabs`, and `safeMode`
- `builtin` - Lightweight built-in formatter (fallback)

When `engine` is not set and the `dprint` engine fails, the formatter uses `builtin`. An engine set explicitly reports its failure.

#### `formatter.indentSize`

**Type:** `integer` (1-16)  
**Default:** `2`

Number of spaces per indentation level.

#### `formatter.useTabs`

**Type:** `boolean`  
**Default:** `false`

Indent with one tab per level instead of spaces.

#### `formatter.lineWidth`

**Type:** `integer` (20-1000)  
**Default:** `80`

Line width limit. The formatter does not wrap lines; the `builtin` engine leaves lines longer than this value unchanged apart from indentation.

#### `formatter.safeMode`

**Type:** `boolean`  
**Default:** `true`

Reject the formatted output when its semantic fingerprint differs from the input. The fingerprint covers the parsed declarations without positions and the codes and messages of parser errors, so a file with syntax errors is formatted as long as its errors stay the same. Recommended for production use.

---

## Complete Examples

### Basic Single Router

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "main": "bird.conf",
  "includePaths": ["./filters", "./peers"],
  "bird": {
    "validateCommand": "bird -p -c {file}"
  },
  "linter": {
    "rules": {
      "sym/*": "error",
      "bgp/*": "warning"
    }
  }
}
```

### Monorepo with Multiple PoPs

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "workspaces": ["*/"],
  "includePaths": ["./shared/filters", "./shared/templates"],
  "bird": {
    "version": ">=3.0",
    "binaryPath": "/usr/sbin/bird",
    "validateCommand": "sudo bird -p -c {file}",
    "socketPath": "/run/bird/bird.ctl"
  },
  "crossFile": {
    "maxDepth": 10,
    "maxFiles": 512,
    "externalIncludes": true
  },
  "linter": {
    "enabled": true,
    "withBird": true,
    "extends": ["bird-recommended"],
    "rules": {
      "sym/*": "error",
      "cfg/*": "error",
      "net/*": "error",
      "type/*": "error",
      "bgp/*": "warning",
      "ospf/*": "warning"
    }
  },
  "formatter": {
    "engine": "dprint",
    "indentSize": 2,
    "lineWidth": 100,
    "safeMode": true
  }
}
```

### CI/CD Strict Mode

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "main": "bird.conf",
  "linter": {
    "enabled": true,
    "withBird": true,
    "rules": {
      "sym/*": "error",
      "cfg/*": "error",
      "net/*": "error",
      "type/*": "error",
      "bgp/*": "error",
      "ospf/*": "error"
    }
  },
  "formatter": {
    "engine": "dprint",
    "safeMode": true
  }
}
```

### IPv6 Only Environment

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "main": "bird6.conf",
  "bird": {
    "binaryPath": "/usr/sbin/bird6",
    "validateCommand": "bird6 -p -c {file}",
    "socketPath": "/run/bird/bird6.ctl"
  },
  "includePaths": ["./filters-v6", "./peers-v6"]
}
```

### Docker-based Validation

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "main": "bird.conf",
  "bird": {
    "validateCommand": "docker exec bird-router bird -p -c {file}"
  },
  "crossFile": {
    "externalIncludes": false
  }
}
```

---

## Best Practices

### 1. Version Control

Always commit `bird.config.json` to version control. It serves as the source of truth for your project's BIRD configuration structure.

### 2. Schema Validation

Include the `$schema` field for IDE autocomplete and validation:

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json"
}
```

The npm packages do not include the schema file. For offline development, save a copy of the schema next to the config file and use a relative path:

```json
{
  "$schema": "./bird.config.schema.json"
}
```

### 3. Environment-Specific Overrides

`bird.config.json` values are used literally; `birdcc` does not expand environment variables in them. For machine-specific binary paths, leave `bird.binaryPath` and `bird.validateCommand` unset and set the `BIRD_BIN` environment variable:

```bash
BIRD_BIN=/usr/sbin/bird birdcc lint --bird
```

### 4. Workspace Organization

For monorepos, organize by function or region:

```text
project/
├── bird.config.json      # Root config with workspaces
├── shared/
│   ├── filters/
│   └── templates/
├── sites/
│   ├── site-a/
│   │   └── bird.conf
│   └── site-b/
│       └── bird.conf
└── peers/
    ├── upstreams/
    └── downstreams/
```

### 5. Lint Severity in CI

With the default severities, rule diagnostics do not change the exit status of `birdcc lint`. Raise the rule groups to `error` so that CI fails on them:

```json
{
  "linter": {
    "rules": {
      "sym/*": "error",
      "cfg/*": "error",
      "net/*": "error",
      "type/*": "error"
    }
  }
}
```

### 6. Safe Formatting

Always enable `safeMode` for production formatting to prevent corruption of complex configurations.

---

## Migration Guide

### From `birdcc.config.json`

`birdcc.config.json` is read as an alias; when both files exist in one directory, `bird.config.json` takes precedence. To migrate, rename the file and update the schema reference:

```bash
mv birdcc.config.json bird.config.json
```

Update the `$schema` field if present:

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json"
}
```

### Legacy BIRD 1.x Projects

The parser and lint rules follow BIRD 2 and BIRD 3 syntax, and `bird.version` does not change them. To check a BIRD 1.x configuration with BIRD itself, point the validation command at the BIRD 1.x binary:

```json
{
  "bird": {
    "validateCommand": "bird -p -c {file}"
  }
}
```

Note: Some features may not be available for BIRD 1.x configurations.

---

## Troubleshooting

### Entry file not found

When `main` points to a missing file, `birdcc lint` reports `ENOENT: no such file or directory` and `birdcc fmt` reports `Failed to read file '<path>'`; the language server analyzes the open document on its own. Ensure `main` points to an existing file relative to `bird.config.json`:

```json
{
  "main": "bird.conf"
}
```

### "Include file not found"

Add the include directories to `includePaths`:

```json
{
  "includePaths": ["./includes", "./templates"]
}
```

### Validation command fails

`birdcc` replaces `{file}` with the absolute path of the linted file, or appends the path when the template has no `{file}`. A command that cannot start, runs longer than 10 seconds, or exits non-zero without stderr output produces a `bird/runner-error` diagnostic. Check that the command runs by hand with the file path:

```json
{
  "bird": {
    "validateCommand": "bird -p -c {file}"
  }
}
```

### Workspace not discovered

Verify glob patterns match your directory structure. `*` matches one directory level, and each workspace directory needs a `bird.conf`:

```json
{
  "workspaces": ["*/"]
}
```

---

## See Also

- [BIRD Documentation](https://bird.network.cz/)
- [BIRD-LSP GitHub](https://github.com/bird-chinese-community/BIRD-LSP)
- [JSON Schema Reference](https://json-schema.org/)

---

_Last updated: 2026-11-08_
