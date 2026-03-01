# @birdcc/parser

`@birdcc/parser` provides Tree-sitter based parsing for BIRD2 configuration files.

## Highlights

- Tree-sitter grammar + WASM runtime (`web-tree-sitter`)
- Async parse API
- Top-level declaration extraction:
  - `include`, `define`, `router id`, `table`, `protocol`, `template`, `filter`, `function`
- Protocol common statement extraction:
  - `local as`, `neighbor ... as ...`, `import ...`, `export ...`, `ipv4/ipv6/... channel`
- Channel statement extraction:
  - `table`, `import/export all|none|filter|where`, `import/receive/export limit`, `debug`, `import keep filtered`
- Filter/function lightweight statement skeleton extraction:
  - `if`, `accept`, `reject`, `return`, `case`
  - extracted `ip` / `prefix` literals and `~` match expressions for semantic validation
- Error recovery diagnostics from Tree-sitter (`ERROR` / `MISSING`) with source ranges

## Usage

```ts
import { parseBirdConfig } from "@birdcc/parser";

const text = `
protocol bgp edge {
  local as 65001;
  neighbor 192.0.2.1 as 65002;
  import all;
  export filter policy_out;
}
`;

const parsed = await parseBirdConfig(text);

console.log(parsed.program.declarations);
console.log(parsed.issues);
```

## Public API

```ts
parseBirdConfig(input: string): Promise<ParsedBirdDocument>
```

Key types:

- `ParsedBirdDocument`
- `BirdDeclaration`
- `ProtocolDeclaration`
- `ProtocolStatement`
- `ParseIssue`

## Grammar workflow

```bash
# regenerate tree-sitter generated artifacts locally
pnpm --filter @birdcc/parser run build:grammar

# rebuild wasm (requires emscripten toolchain or docker-enabled tree-sitter build env)
pnpm --filter @birdcc/parser run build:wasm
```

Source-of-truth grammar files (tracked):

- `grammar.js`
- `tree-sitter.json`
- parser runtime and TS source files under `src/` (except generated C artifacts)

Generated artifacts (not tracked by Git):

- `src/parser.c`
- `src/grammar.json`
- `src/node-types.json`
- `src/tree_sitter/*.h`

Tracked runtime artifact:

- `src/tree-sitter-birdcc.wasm`  
  Kept in Git so parser runtime and tests work in environments without Docker / emscripten.

Local validation after grammar changes:

```bash
pnpm --filter @birdcc/parser run build:grammar
pnpm --filter @birdcc/parser run test
pnpm --filter @birdcc/parser run build
```

## Development

```bash
pnpm --filter @birdcc/parser lint
pnpm --filter @birdcc/parser test
pnpm --filter @birdcc/parser build
pnpm --filter @birdcc/parser typecheck
pnpm --filter @birdcc/parser format
```
