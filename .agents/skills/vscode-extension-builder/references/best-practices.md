# VS Code Extension Best Practices

Comprehensive guide to building high-quality VS Code extensions with excellent UX, performance, and maintainability.

## User Experience Guidelines

### Command Design

**Clear Names:**
```json
// ❌ BAD: Vague names
"commands": [{
  "command": "extension.do",
  "title": "Do Thing"
}]

// ✅ GOOD: Descriptive names
"commands": [{
  "command": "extension.formatJsonDocument",
  "title": "Format JSON Document"
}]
```

**Use Categories:**
```json
"commands": [{
  "command": "extension.formatJson",
  "title": "Format JSON",
  "category": "JSON Tools"
}]
```

Shows as "JSON Tools: Format JSON" in Command Palette.

**Command Naming Convention:**
- Format: `publisher.commandName`
- Example: `myPublisher.formatJson`
- Prevents conflicts with other extensions

### Progress Feedback

**Always show progress for long operations:**

```typescript
// ❌ BAD: No feedback
async function processFiles() {
  for (const file of files) {
    await process(file);
  }
}

// ✅ GOOD: Shows progress
async function processFiles() {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Processing files',
    cancellable: true
  }, async (progress, token) => {
    for (let i = 0; i < files.length; i++) {
      if (token.isCancellationRequested) {
        break;
      }
      progress.report({
        increment: (100 / files.length),
        message: `${i + 1}/${files.length}: ${files[i]}`
      });
      await process(files[i]);
    }
  });
}
```

### Error Handling

**Helpful error messages:**

```typescript
// ❌ BAD: Generic error
vscode.window.showErrorMessage('Error');

// ✅ GOOD: Specific, actionable
vscode.window.showErrorMessage(
  'Failed to format JSON: Invalid syntax on line 42. ' +
  'Please check the syntax and try again.'
);

// ✅ EVEN BETTER: With actions
vscode.window.showErrorMessage(
  'Failed to parse JSON',
  'Open File',
  'View Logs'
).then(selection => {
  if (selection === 'Open File') {
    vscode.window.showTextDocument(uri);
  } else if (selection === 'View Logs') {
    outputChannel.show();
  }
});
```

### Input Validation

**Validate user input:**

```typescript
const value = await vscode.window.showInputBox({
  prompt: 'Enter port number',
  validateInput: (value) => {
    const port = parseInt(value);
    if (isNaN(port)) {
      return 'Please enter a valid number';
    }
    if (port < 1 || port > 65535) {
      return 'Port must be between 1 and 65535';
    }
    return undefined; // Valid
  }
});
```

### Consistent Icons

Use Codicons for consistency:

```json
"commands": [{
  "command": "extension.refresh",
  "title": "Refresh",
  "icon": "$(refresh)"
}]
```

**Common icons:**
- `$(add)` - Add/create
- `$(remove)` - Delete/remove
- `$(refresh)` - Refresh/reload
- `$(edit)` - Edit
- `$(search)` - Search
- `$(gear)` - Settings
- `$(check)` - Success/complete
- `$(error)` - Error
- `$(warning)` - Warning
- `$(info)` - Information

Full list: https://microsoft.github.io/vscode-codicons/dist/codicon.html

### Configuration Defaults

**Sensible defaults:**

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "myExtension.autoSave": {
          "type": "boolean",
          "default": true,
          "description": "Automatically save changes"
        },
        "myExtension.timeout": {
          "type": "number",
          "default": 5000,
          "minimum": 1000,
          "maximum": 60000,
          "description": "Timeout in milliseconds"
        }
      }
    }
  }
}
```

**Respect user settings:**

```typescript
const config = vscode.workspace.getConfiguration('myExtension');
const timeout = config.get<number>('timeout', 5000);
```

## Performance Best Practices

### Lazy Loading

**Use specific activation events:**

```json
// ❌ BAD: Loads on startup
{
  "activationEvents": ["*"]
}

// ✅ GOOD: Loads when needed
{
  "activationEvents": [
    "onCommand:extension.myCommand",
    "onLanguage:javascript"
  ]
}
```

### Async Operations

**Never block the UI:**

```typescript
// ❌ BAD: Synchronous heavy operation
function processLargeFile(file: string) {
  const data = fs.readFileSync(file); // Blocks!
  // Process data...
}

// ✅ GOOD: Async operation
async function processLargeFile(file: string) {
  const uri = vscode.Uri.file(file);
  const data = await vscode.workspace.fs.readFile(uri);
  // Process data...
}
```

### Debounce Frequent Events

**Avoid processing every keystroke:**

```typescript
// ❌ BAD: Updates on every change
vscode.workspace.onDidChangeTextDocument(event => {
  updateDiagnostics(event.document); // Called on every keystroke!
});

// ✅ GOOD: Debounced updates
let timeout: NodeJS.Timeout | undefined;

vscode.workspace.onDidChangeTextDocument(event => {
  if (timeout) {
    clearTimeout(timeout);
  }
  timeout = setTimeout(() => {
    updateDiagnostics(event.document);
  }, 500); // Wait 500ms after typing stops
});
```

### Dispose Resources

**Clean up properly:**

```typescript
export function activate(context: vscode.ExtensionContext) {
  // File watcher
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.ts');
  context.subscriptions.push(watcher);
  
  // Status bar item
  const statusBar = vscode.window.createStatusBarItem();
  context.subscriptions.push(statusBar);
  
  // Event listener
  const disposable = vscode.workspace.onDidSaveTextDocument(() => {
    // Handle save
  });
  context.subscriptions.push(disposable);
}
```

### Cache Expensive Operations

**Avoid recomputing:**

```typescript
class MyProvider {
  private cache = new Map<string, any>();
  
  async getData(key: string) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    const data = await expensiveOperation(key);
    this.cache.set(key, data);
    return data;
  }
  
  clearCache() {
    this.cache.clear();
  }
}
```

### Bundle Extension

**Reduce load time:**

Use esbuild or webpack:

```json
{
  "scripts": {
    "vscode:prepublish": "npm run package",
    "compile": "tsc -p ./",
    "package": "esbuild ./src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node"
  }
}
```

Benefits:
- Smaller package size
- Faster activation
- Better startup performance

## Security Best Practices

### Input Sanitization

**Never trust user input:**

```typescript
// ❌ BAD: Direct execution
const command = await vscode.window.showInputBox({
  prompt: 'Enter command'
});
exec(command); // Dangerous!

// ✅ GOOD: Validate and sanitize
const command = await vscode.window.showInputBox({
  prompt: 'Enter command',
  validateInput: (value) => {
    // Whitelist approach
    if (!['build', 'test', 'deploy'].includes(value)) {
      return 'Invalid command';
    }
    return undefined;
  }
});
```

### Secure Storage

**Use secrets API for sensitive data:**

```typescript
// ❌ BAD: Plain text storage
context.globalState.update('apiKey', 'secret-key-123');

// ✅ GOOD: Encrypted storage
await context.secrets.store('apiKey', 'secret-key-123');
const apiKey = await context.secrets.get('apiKey');
```

### HTTPS Only

**Always use secure connections:**

```typescript
// ❌ BAD: Insecure connection
fetch('http://api.example.com/data');

// ✅ GOOD: Secure connection
fetch('https://api.example.com/data');
```

### Validate External Content

**Check webview content:**

```typescript
// Content Security Policy for webview
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" 
        content="default-src 'none'; 
                 script-src ${webview.cspSource} 'unsafe-inline'; 
                 style-src ${webview.cspSource} 'unsafe-inline';">
</head>
<body>
  <h1>Secure Webview</h1>
</body>
</html>
`;
```

## Code Quality

### TypeScript Strict Mode

**Enable strict checks:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

### Error Handling

**Handle all errors:**

```typescript
// ❌ BAD: Unhandled promise
async function doSomething() {
  await riskyOperation(); // Might fail
}

// ✅ GOOD: Proper error handling
async function doSomething() {
  try {
    await riskyOperation();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    console.error(error);
  }
}
```

### Logging

**Proper logging for debugging:**

```typescript
// Create output channel
const outputChannel = vscode.window.createOutputChannel('My Extension');

// Log levels
outputChannel.appendLine('[INFO] Extension activated');
outputChannel.appendLine('[DEBUG] Processing file: ' + fileName);
outputChannel.appendLine('[ERROR] Failed to process: ' + error.message);

// Show channel for errors
outputChannel.show();
```

### Testing

**Write tests:**

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('Command is registered', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('extension.myCommand'));
  });
  
  test('Command executes', async () => {
    await vscode.commands.executeCommand('extension.myCommand');
    // Assert expected behavior
  });
});
```

## Documentation

### README Requirements

Include:

1. **Features**: What does extension do?
2. **Requirements**: Dependencies, VS Code version
3. **Usage**: How to use commands/features
4. **Settings**: Available configuration options
5. **Known Issues**: Current limitations
6. **Release Notes**: What's new

**Example structure:**

```markdown
# Extension Name

Brief description

## Features

- Feature 1
- Feature 2

## Requirements

- VS Code 1.85.0 or higher
- Node.js 18+ (if required)

## Extension Settings

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable extension
* `myExtension.timeout`: Timeout in milliseconds

## Known Issues

- Issue 1
- Issue 2

## Release Notes

### 1.0.0

Initial release
```

### In-Code Documentation

**Document public APIs:**

```typescript
/**
 * Formats a JSON string with proper indentation.
 * 
 * @param json - The JSON string to format
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns Formatted JSON string
 * @throws Error if JSON is invalid
 */
export function formatJson(json: string, indent: number = 2): string {
  return JSON.stringify(JSON.parse(json), null, indent);
}
```

## Publishing Guidelines

### Pre-Publishing Checklist

- [ ] README is complete and accurate
- [ ] CHANGELOG documents all versions
- [ ] LICENSE file included
- [ ] Extension icon (128x128 PNG)
- [ ] All features tested
- [ ] No console.log in production code
- [ ] Proper error handling
- [ ] Repository URL in package.json
- [ ] Keywords for discoverability
- [ ] Proper categories

### Package.json Metadata

```json
{
  "name": "my-extension",
  "displayName": "My Extension",
  "description": "Clear, concise description",
  "version": "1.0.0",
  "publisher": "publisher-id",
  "icon": "images/icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/username/extension"
  },
  "keywords": [
    "json",
    "formatter",
    "tools"
  ],
  "categories": [
    "Formatters"
  ],
  "license": "MIT"
}
```

### Versioning

Follow Semantic Versioning (semver):

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes

### Publishing Process

```bash
# Install vsce
npm install -g @vscode/vsce

# Login (first time)
vsce login <publisher>

# Package (test locally)
vsce package

# Publish
vsce publish
```

## Accessibility

### Keyboard Navigation

**Support keyboard-only users:**

```json
"commands": [{
  "command": "extension.action",
  "title": "Perform Action",
  "keybinding": {
    "key": "ctrl+shift+a",
    "mac": "cmd+shift+a"
  }
}]
```

### Screen Reader Support

**Use descriptive labels:**

```typescript
// Status bar with accessible text
const statusBar = vscode.window.createStatusBarItem();
statusBar.text = "$(check) Build successful";
statusBar.tooltip = "Build completed successfully at " + new Date().toLocaleTimeString();
statusBar.accessibilityInformation = {
  label: "Build status: successful",
  role: "status"
};
```

### Color Contrast

**Use theme colors:**

```typescript
// ✅ Respects user theme
const decorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
  borderColor: new vscode.ThemeColor('editor.findMatchHighlightBorder')
});
```

## Cross-Platform Considerations

### Path Handling

```typescript
// ❌ BAD: Windows-specific
const path = 'C:\\Users\\file.txt';

// ✅ GOOD: Cross-platform
import * as path from 'path';
const filePath = path.join(workspaceRoot, 'file.txt');

// ✅ Use VS Code URIs
const uri = vscode.Uri.joinPath(workspaceUri, 'file.txt');
```

### Line Endings

```typescript
// Get document line ending
const eol = document.eol === vscode.EndOfLine.LF ? '\n' : '\r\n';

// Or use document.eol directly when editing
```

### Commands

```typescript
// ❌ BAD: Platform-specific command
exec('ls -la'); // Unix only

// ✅ GOOD: Cross-platform
const files = await vscode.workspace.fs.readDirectory(uri);
```

## Common Pitfalls

### 1. Blocking Operations

Don't use synchronous Node.js APIs:
- `fs.readFileSync` → Use `vscode.workspace.fs.readFile`
- `child_process.execSync` → Use async variant

### 2. Memory Leaks

Always dispose resources:
- Webviews
- File watchers
- Event listeners
- Status bar items

### 3. Activation on Startup

Avoid `"activationEvents": ["*"]` unless absolutely necessary.

### 4. Ignoring Errors

Always handle promise rejections and errors.

### 5. Hard-Coded Paths

Use workspace URIs and relative paths.

## Quick Reference

### Good Practices Checklist

- ✅ Use specific activation events
- ✅ Show progress for long operations
- ✅ Provide helpful error messages
- ✅ Dispose all resources
- ✅ Use async operations
- ✅ Bundle extension for production
- ✅ Write tests
- ✅ Document features in README
- ✅ Use secrets API for sensitive data
- ✅ Support keyboard navigation
- ✅ Use theme colors
- ✅ Handle errors gracefully
- ✅ Validate user input
- ✅ Use descriptive command names
- ✅ Follow semver for versioning

This guide covers essential best practices for building professional VS Code extensions. Follow these guidelines to create extensions that are performant, secure, accessible, and provide excellent user experience.

