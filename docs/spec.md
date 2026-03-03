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

```
bird.config.json
├── $schema              # Schema URL for IDE validation
├── main                 # Entry point file
├── workspaces           # Monorepo sub-projects (optional)
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
**Default:** `"bird.conf"`

Specifies the entry point configuration file for the project.

```json
{
  "main": "bird.conf"
}
```

**Notes:**

- Path is relative to the `bird.config.json` location
- Ignored when `workspaces` is set (each workspace uses its own entry file)
- Supports absolute paths for system-wide configurations

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

| Pattern                            | Description             |
| ---------------------------------- | ----------------------- |
| `["*/"]`                           | All subdirectories      |
| `["sites/*", "!sites/legacy"]`     | All sites except legacy |
| `["pop-*/**"]`                     | All PoP directories     |
| `["routers/eu-*", "routers/us-*"]` | Regional filtering      |

**Workspace Discovery:**

- Each matched directory should contain its own `bird.conf` or entry file
- Tooling processes each workspace independently
- Shared configurations can be placed in parent directories with `includePaths`

---

### `includePaths`

**Type:** `string[]`

Additional directories for resolving `include` directives, equivalent to BIRD's `-I` flag.

```json
{
  "includePaths": ["./filters", "./peers", "../shared/templates"]
}
```

**Resolution Order:**

1. Current file's directory
2. Config file's directory (default)
3. Paths specified in `includePaths` (in order)

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

Version constraint for compatibility checking.

```json
{
  "bird": {
    "version": ">=2.0"
  }
}
```

**Supported Syntax:**

- `">=2.0"` - BIRD 2.0 and later
- `"^3.0"` - BIRD 3.x only
- `"2.15.x"` - Specific minor version range

#### `bird.binaryPath`

**Type:** `string`

Path to the BIRD binary. Used as fallback when `validateCommand` is not specified.

**Priority Order:**

1. `bird.validateCommand`
2. `bird.binaryPath`
3. `BIRD_BIN` environment variable
4. System `PATH`

#### `bird.validateCommand`

**Type:** `string`  
**Default:** `"bird -p -c {file}"`

Command template for syntax validation. The toolchain substitutes `{file}` with the path to a temporary file containing the bundled configuration.

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

#### `bird.socketPath`

**Type:** `string`  
**Default:** `"/run/bird/bird.ctl"`

Path to the BIRD control socket for `birdc` integration and runtime introspection.

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

Maximum nesting depth for include expansion. Prevents infinite recursion from circular includes.

#### `crossFile.maxFiles`

**Type:** `integer`  
**Default:** `256`

Maximum number of files to analyze. Limits resource usage for large projects.

#### `crossFile.externalIncludes`

**Type:** `boolean`  
**Default:** `false`

Allow includes outside the workspace root. Enable with caution for security.

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

Also run BIRD validation (`bird -p`) in addition to static analysis. Uses `bird.validateCommand` if set, otherwise falls back to `bird.binaryPath` or `BIRD_BIN`.

#### `linter.extends`

**Type:** `string[]`

Inherit rule configurations from presets.

```json
{
  "linter": {
    "extends": ["bird-recommended", "@myorg/bird-strict", "./local-rules.json"]
  }
}
```

#### `linter.rules`

**Type:** `object`

Per-rule severity overrides. Supports wildcard patterns.

**Rule Categories:**

| Prefix   | Description                              |
| -------- | ---------------------------------------- |
| `sym/*`  | Symbol validation (undefined, duplicate) |
| `cfg/*`  | Configuration errors                     |
| `net/*`  | Network/prefix validation                |
| `type/*` | Type checking                            |
| `bgp/*`  | BGP-specific rules                       |
| `ospf/*` | OSPF-specific rules                      |

**Severity Levels:**

| Level       | Behavior                  |
| ----------- | ------------------------- |
| `"error"`   | Fails CI, blocks commit   |
| `"warning"` | Reported but non-blocking |
| `"info"`    | Informational only        |
| `"off"`     | Disabled                  |

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

- `dprint` - Full-featured formatter with configurable rules
- `builtin` - Lightweight built-in formatter (fallback)

#### `formatter.indentSize`

**Type:** `integer` (1-16)  
**Default:** `2`

Number of spaces per indentation level.

#### `formatter.lineWidth`

**Type:** `integer` (20-1000)  
**Default:** `80`

Maximum line width before wrapping.

#### `formatter.safeMode`

**Type:** `boolean`  
**Default:** `true`

Prevent formatting if syntax errors are detected. Recommended for production use.

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
  "includePaths": ["../shared/filters", "../shared/templates"],
  "bird": {
    "version": ">=3.0",
    "binaryPath": "/usr/sbin/bird",
    "validateCommand": "sudo bird -p -c {file}",
    "socketPath": "/run/bird/bird.ctl"
  },
  "crossFile": {
    "maxDepth": 10,
    "maxFiles": 512,
    "externalIncludes": false
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

For offline development, use a local path:

```json
{
  "$schema": "./node_modules/@birdcc/cli/schemas/bird.config.schema.json"
}
```

### 3. Environment-Specific Overrides

Use environment variables for machine-specific paths:

```json
{
  "bird": {
    "binaryPath": "${BIRD_BIN}"
  }
}
```

### 4. Workspace Organization

For monorepos, organize by function or region:

```
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

Use strict severity levels in CI/CD:

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

Rename the file and update the schema reference:

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

For BIRD 1.x compatibility, set appropriate version constraints:

```json
{
  "bird": {
    "version": "1.x",
    "validateCommand": "bird -p -c {file}"
  }
}
```

Note: Some features may not be available for BIRD 1.x configurations.

---

## Troubleshooting

### "Entry file not found"

Ensure `main` points to an existing file relative to `bird.config.json`:

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

Check that the command template includes `{file}`:

```json
{
  "bird": {
    "validateCommand": "bird -p -c {file}"
  }
}
```

### Workspace not discovered

Verify glob patterns match your directory structure:

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

_Last updated: 2026-03-03_
