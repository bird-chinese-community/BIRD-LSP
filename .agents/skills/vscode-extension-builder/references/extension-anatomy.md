# VS Code Extension Anatomy

Complete reference for VS Code extension structure, manifest configuration, and lifecycle.

## Project Structure

Standard TypeScript extension structure:

```
my-extension/
├── .vscode/
│   ├── launch.json          # Debug configuration
│   ├── tasks.json           # Build tasks
│   └── extensions.json      # Recommended extensions
├── src/
│   ├── extension.ts         # Extension entry point
│   ├── commands/            # Command implementations
│   ├── providers/           # Language providers, tree views
│   └── utils/               # Utility functions
├── test/
│   └── suite/
│       ├── extension.test.ts
│       └── index.ts
├── out/                     # Compiled JavaScript (gitignored)
├── node_modules/            # Dependencies (gitignored)
├── .gitignore
├── .eslintrc.json          # ESLint configuration
├── .vscodeignore           # Files to exclude from package
├── package.json            # Extension manifest
├── tsconfig.json           # TypeScript configuration
├── README.md               # Extension documentation
├── CHANGELOG.md            # Version history
└── LICENSE                 # License file
```

## package.json Manifest

The extension manifest defines metadata, capabilities, and contributions.

### Required Fields

```json
{
  "name": "my-extension",
  "displayName": "My Extension",
  "description": "Brief description",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "main": "./out/extension.js",
  "activationEvents": [],
  "contributes": {}
}
```

### Field Descriptions

**Identity:**
- `name`: Unique identifier (lowercase, no spaces)
- `displayName`: Human-readable name shown in marketplace
- `description`: Brief explanation of functionality
- `version`: Semantic version (major.minor.patch)
- `publisher`: Marketplace publisher ID

**Engine:**
- `engines.vscode`: Minimum VS Code version
- Example: `"^1.85.0"` means 1.85.0 or higher

**Categories** (choose relevant ones):
- `Programming Languages`
- `Snippets`
- `Linters`
- `Themes`
- `Debuggers`
- `Formatters`
- `Keymaps`
- `SCM Providers`
- `Other`
- `Extension Packs`
- `Language Packs`
- `Data Science`
- `Machine Learning`
- `Visualization`
- `Notebooks`
- `Testing`

**Entry Point:**
- `main`: Path to compiled JavaScript entry file
- Usually `./out/extension.js` or `./dist/extension.js`

### Activation Events

Determines when extension loads:

```json
{
  "activationEvents": [
    "onCommand:extension.myCommand",
    "onLanguage:javascript",
    "onView:myCustomView",
    "onStartupFinished"
  ]
}
```

See [activation-events.md](activation-events.md) for complete reference.

### Contribution Points

Declare extension capabilities:

#### Commands

```json
{
  "contributes": {
    "commands": [
      {
        "command": "extension.myCommand",
        "title": "My Command",
        "category": "MyExtension",
        "icon": "$(check)"
      }
    ]
  }
}
```

**Fields:**
- `command`: Unique identifier (use prefix)
- `title`: Display name in Command Palette
- `category`: Group commands together (optional)
- `icon`: Icon from codicons or custom path (optional)
- `enablement`: When clause for availability (optional)

#### Menus

Add commands to context menus:

```json
{
  "contributes": {
    "menus": {
      "editor/context": [
        {
          "command": "extension.myCommand",
          "when": "editorTextFocus",
          "group": "navigation"
        }
      ],
      "explorer/context": [
        {
          "command": "extension.processFile",
          "when": "resourceExtname == .json"
        }
      ]
    }
  }
}
```

**Menu locations:**
- `editor/context`: Right-click in editor
- `editor/title`: Top-right toolbar
- `explorer/context`: Right-click in file explorer
- `view/title`: View toolbar
- `view/item/context`: Right-click on tree item

#### Keybindings

```json
{
  "contributes": {
    "keybindings": [
      {
        "command": "extension.myCommand",
        "key": "ctrl+shift+r",
        "mac": "cmd+shift+r",
        "when": "editorTextFocus"
      }
    ]
  }
}
```

#### Configuration

User settings for extension:

```json
{
  "contributes": {
    "configuration": {
      "title": "My Extension",
      "properties": {
        "myExtension.enable": {
          "type": "boolean",
          "default": true,
          "description": "Enable the extension"
        },
        "myExtension.maxItems": {
          "type": "number",
          "default": 10,
          "minimum": 1,
          "maximum": 100
        }
      }
    }
  }
}
```

Read settings in code:
```typescript
const config = vscode.workspace.getConfiguration('myExtension');
const enabled = config.get<boolean>('enable');
```

#### Views

Custom sidebar views:

```json
{
  "contributes": {
    "views": {
      "explorer": [
        {
          "id": "myCustomView",
          "name": "My View",
          "icon": "resources/icon.svg"
        }
      ]
    },
    "viewsContainers": {
      "activitybar": [
        {
          "id": "myContainer",
          "title": "My Container",
          "icon": "resources/icon.svg"
        }
      ]
    }
  }
}
```

#### Languages

Language support:

```json
{
  "contributes": {
    "languages": [
      {
        "id": "mylang",
        "extensions": [".ml"],
        "aliases": ["MyLang"],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "mylang",
        "scopeName": "source.mylang",
        "path": "./syntaxes/mylang.tmLanguage.json"
      }
    ]
  }
}
```

## Extension Entry Point

The `src/extension.ts` file is the main entry point.

### Basic Structure

```typescript
import * as vscode from 'vscode';

// Called when extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('Extension activated');

  // Register commands, providers, etc.
  let disposable = vscode.commands.registerCommand(
    'extension.myCommand',
    () => {
      vscode.window.showInformationMessage('Hello World!');
    }
  );

  // Add to subscriptions for cleanup
  context.subscriptions.push(disposable);
}

// Called when extension is deactivated
export function deactivate() {
  console.log('Extension deactivated');
  // Cleanup if needed
}
```

### Extension Context

The `ExtensionContext` provides:

**Storage:**
```typescript
// Global state (persists across workspaces)
context.globalState.update('key', value);
const value = context.globalState.get('key');

// Workspace state (per workspace)
context.workspaceState.update('key', value);

// Secrets (encrypted storage)
await context.secrets.store('token', 'secret-value');
const token = await context.secrets.get('token');
```

**Paths:**
```typescript
// Extension installation directory
context.extensionPath

// Global storage path
context.globalStorageUri

// Workspace storage path
context.storageUri

// Log directory
context.logUri
```

**Subscriptions:**
```typescript
// Auto-disposed when extension deactivates
context.subscriptions.push(disposable);
```

**Extension Info:**
```typescript
// Extension's package.json
context.extension.packageJSON

// Extension ID
context.extension.id
```

### Disposables

Resources that need cleanup must implement `Disposable`:

```typescript
class MyService implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher;

  constructor() {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.txt');
    // Setup...
  }

  dispose() {
    this.watcher.dispose();
  }
}

const service = new MyService();
context.subscriptions.push(service);
```

**Common disposables:**
- Command registrations
- Event listeners
- File watchers
- Status bar items
- Webviews
- Terminal instances

## Extension Lifecycle

### Activation

1. VS Code loads extension metadata from `package.json`
2. Activation event occurs (command invoked, file opened, etc.)
3. `activate()` function is called
4. Extension registers commands, providers, listeners
5. Extension is ready to use

### Deactivation

1. VS Code is closing or extension is disabled
2. `deactivate()` function is called
3. Disposables in `context.subscriptions` are disposed automatically
4. Extension cleans up resources

### Lazy Loading Best Practice

Only activate when needed:

```json
{
  "activationEvents": [
    "onCommand:extension.myCommand"
  ]
}
```

Avoid `*` (activate on startup) unless necessary.

## TypeScript Configuration

Standard `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", ".vscode-test"]
}
```

Key settings:
- `module: "commonjs"`: Node.js compatibility
- `target: "ES2020"`: Modern JavaScript features
- `strict: true`: Enable all strict checks
- `sourceMap: true`: Enable debugging

## Debug Configuration

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ],
      "preLaunchTask": "${defaultBuildTask}"
    },
    {
      "name": "Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
      ],
      "outFiles": [
        "${workspaceFolder}/out/test/**/*.js"
      ],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

## Build Tasks

`.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "watch",
      "problemMatcher": "$tsc-watch",
      "isBackground": true,
      "presentation": {
        "reveal": "never"
      },
      "group": {
        "kind": "build",
        "isDefault": true
      }
    }
  ]
}
```

## Dependencies

Essential dependencies:

```json
{
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "20.x",
    "@typescript-eslint/eslint-plugin": "^6.13.0",
    "@typescript-eslint/parser": "^6.13.0",
    "eslint": "^8.54.0",
    "typescript": "^5.3.0",
    "@vscode/test-electron": "^2.3.8"
  }
}
```

**Key packages:**
- `@types/vscode`: VS Code API type definitions
- `@types/node`: Node.js type definitions
- `typescript`: TypeScript compiler
- `@vscode/test-electron`: Testing framework

## Packaging Configuration

`.vscodeignore` - files to exclude from package:

```
.vscode/**
.vscode-test/**
src/**
.gitignore
.yarnrc
**/*.map
**/*.ts
**/tsconfig.json
.eslintrc.json
```

Only include:
- Compiled JavaScript (`out/` or `dist/`)
- README, CHANGELOG, LICENSE
- Assets (icons, images)
- Language files (grammars, snippets)

## Publishing Preparation

Before publishing:

1. **README.md**: Clear documentation
2. **Icon**: 128x128 PNG image
3. **Repository**: Link to source code
4. **License**: Add LICENSE file
5. **Categories**: Accurate categorization
6. **Keywords**: Searchable tags

```json
{
  "icon": "images/icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/username/extension"
  },
  "license": "MIT",
  "keywords": ["productivity", "tools"]
}
```

## File Organization Patterns

### Small Extensions (< 500 lines)

```
src/
├── extension.ts    # Everything in one file
└── test/
```

### Medium Extensions (500-2000 lines)

```
src/
├── extension.ts        # Entry point
├── commands/          # Command handlers
├── providers/         # Language providers
└── utils/            # Helper functions
```

### Large Extensions (> 2000 lines)

```
src/
├── extension.ts          # Entry point
├── commands/            # Commands
├── providers/           # Providers
├── services/            # Business logic
├── models/              # Data models
├── views/               # Tree views
├── webviews/            # Webview code
├── utils/               # Utilities
└── test/                # Tests
```

## Common Patterns

### Singleton Service

```typescript
class MyService {
  private static instance: MyService;

  private constructor() {}

  static getInstance(): MyService {
    if (!MyService.instance) {
      MyService.instance = new MyService();
    }
    return MyService.instance;
  }
}
```

### Configuration Watcher

```typescript
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('myExtension')) {
      // Reload configuration
    }
  })
);
```

### Error Handling

```typescript
try {
  // Extension logic
} catch (error) {
  vscode.window.showErrorMessage(
    `Extension error: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
  console.error(error);
}
```

This reference covers the complete anatomy of VS Code extensions. Use it when setting up project structure, configuring the manifest, or understanding the extension lifecycle.

