# @birdcc/parser

`@birdcc/parser` provides Tree-sitter based parsing for BIRD2 configuration files.

## Highlights

- Tree-sitter grammar + WASM runtime (`web-tree-sitter`)
- Async parse API
- Top-level declaration extraction:
  - `include`, `define`, `protocol`, `template`, `filter`, `function`
- Protocol common statement extraction:
  - `local as`, `neighbor ... as ...`, `import ...`, `export ...`
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
# regenerate parser.c / grammar.json / node-types.json
pnpm --filter @birdcc/parser run build:grammar

# rebuild wasm (requires emscripten toolchain or docker-enabled tree-sitter build env)
pnpm --filter @birdcc/parser run build:wasm
```

Generated assets:

- `src/parser.c`
- `src/grammar.json`
- `src/node-types.json`
- `src/tree_sitter/*.h`
- `src/tree-sitter-birdcc.wasm`

## Development

```bash
pnpm --filter @birdcc/parser lint
pnpm --filter @birdcc/parser test
pnpm --filter @birdcc/parser build
pnpm --filter @birdcc/parser typecheck
pnpm --filter @birdcc/parser format
```
