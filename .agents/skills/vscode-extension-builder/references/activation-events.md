# VS Code Activation Events Reference

Complete guide to activation events that control when extensions load.

## Overview

Activation events determine when your extension is loaded and its `activate()` function is called. Choosing the right activation events is critical for:

- **Performance**: Lazy loading extensions improves VS Code startup time
- **User Experience**: Extensions load exactly when needed
- **Resource Efficiency**: Avoid unnecessary memory usage

## Common Activation Events

### onCommand

Activates when a command is invoked.

```json
{
  "activationEvents": [
    "onCommand:extension.myCommand"
  ]
}
```

**Use when:**
- Extension provides commands
- No need for background processing
- Simple command-based extensions

**Best for:** Most command-based extensions

### onLanguage

Activates when a file of a specific language is opened.

```json
{
  "activationEvents": [
    "onLanguage:javascript",
    "onLanguage:typescript"
  ]
}
```

**Language identifiers:**
- `javascript`, `typescript`
- `python`, `java`, `csharp`, `go`, `rust`
- `html`, `css`, `scss`, `json`, `yaml`
- `markdown`, `plaintext`
- Custom language IDs

**Use when:**
- Providing language-specific features
- Syntax highlighting, IntelliSense
- Language diagnostics

**Best for:** Language extensions

### onView

Activates when a custom view is expanded.

```json
{
  "activationEvents": [
    "onView:myCustomView"
  ]
}
```

**Use when:**
- Extension provides tree views
- Data needed only when view is visible
- Custom sidebar panels

**Best for:** Tree view providers

### onFileSystem

Activates when a file/folder from a specific file system scheme is opened.

```json
{
  "activationEvents": [
    "onFileSystem:ftp",
    "onFileSystem:sftp"
  ]
}
```

**Common schemes:**
- `file`: Local file system (default)
- `untitled`: New unsaved files
- `vscode-remote`: Remote files
- Custom schemes

**Use when:**
- Implementing custom file system providers
- Virtual file systems
- Remote file access

**Best for:** File system providers

### onStartupFinished

Activates after VS Code finishes loading, similar to `*` but with less startup impact.

```json
{
  "activationEvents": [
    "onStartupFinished"
  ]
}
```

**Use when:**
- Need to run on startup but not critical
- Background initialization acceptable
- Can wait until VS Code fully loads

**Best for:** Background services, status monitoring

**Introduced in:** VS Code 1.74.0

### workspaceContains

Activates when a workspace contains files matching a glob pattern.

```json
{
  "activationEvents": [
    "workspaceContains:**/.eslintrc.*",
    "workspaceContains:**/package.json"
  ]
}
```

**Use when:**
- Extension relevant for specific project types
- Detecting configuration files
- Project-specific tooling

**Best for:** Project-specific tools (linters, formatters, build tools)

**Performance note:** Can slow startup if pattern matches many files.

### onUri

Activates when a URI with the extension's scheme is opened.

```json
{
  "activationEvents": [
    "onUri"
  ]
}
```

**Example URIs:**
- `vscode://publisher.extension/path`
- Used for OAuth callbacks
- Deep linking into extension

**Use when:**
- Handling deep links
- OAuth authentication flows
- External protocol handlers

**Best for:** Authentication, external integrations

### onWebviewPanel

Activates when a webview of a specific type is restored.

```json
{
  "activationEvents": [
    "onWebviewPanel:myWebview"
  ]
}
```

**Use when:**
- Extension creates persistent webviews
- Restoring webview state after reload
- Custom editors

**Best for:** Webview-based extensions, custom editors

### onDebug

Activates when a debug session starts.

```json
{
  "activationEvents": [
    "onDebug",
    "onDebugInitialConfigurations",
    "onDebugResolve:node"
  ]
}
```

**Variants:**
- `onDebug`: Any debug session
- `onDebugInitialConfigurations`: Providing launch.json defaults
- `onDebugResolve:type`: Resolving debug config for specific type

**Use when:**
- Implementing debugger extensions
- Debug configuration providers
- Debug adapters

**Best for:** Debugger extensions

### onTaskType

Activates when a task of a specific type is executed.

```json
{
  "activationEvents": [
    "onTaskType:npm",
    "onTaskType:gulp"
  ]
}
```

**Use when:**
- Providing custom task providers
- Task detection
- Build system integration

**Best for:** Task providers, build tools

### onCustomEditor

Activates when a custom editor is needed for a file.

```json
{
  "activationEvents": [
    "onCustomEditor:myCustomEditor"
  ]
}
```

**Use when:**
- Implementing custom editors
- Special file type viewers
- Binary file editors

**Best for:** Custom editor implementations

### onAuthenticationRequest

Activates when authentication is requested.

```json
{
  "activationEvents": [
    "onAuthenticationRequest:github"
  ]
}
```

**Use when:**
- Providing authentication providers
- OAuth flows
- Custom login systems

**Best for:** Authentication providers

## Special Activation Events

### * (Star)

Activates on VS Code startup.

```json
{
  "activationEvents": [
    "*"
  ]
}
```

**⚠️ Warning:** Avoid unless absolutely necessary!

**Impact:**
- Slows VS Code startup
- Uses memory even if extension not used
- Poor user experience

**Only use when:**
- Extension must run immediately
- Background services absolutely required
- No other activation event works

**Better alternative:** Use `onStartupFinished` instead.

## Multiple Activation Events

Extensions can have multiple activation events:

```json
{
  "activationEvents": [
    "onCommand:extension.command1",
    "onCommand:extension.command2",
    "onLanguage:javascript",
    "workspaceContains:**/package.json"
  ]
}
```

Extension activates when **any** event occurs (OR logic).

## Activation Event Patterns

### Pattern 1: Command-Only Extension

```json
{
  "activationEvents": [
    "onCommand:extension.formatJson",
    "onCommand:extension.validateJson"
  ]
}
```

Simplest pattern. Extension loads when command invoked.

### Pattern 2: Language Extension

```json
{
  "activationEvents": [
    "onLanguage:javascript",
    "onLanguage:typescript"
  ]
}
```

Loads when JavaScript/TypeScript file opens.

### Pattern 3: Project-Specific Tool

```json
{
  "activationEvents": [
    "workspaceContains:**/package.json",
    "onCommand:extension.npmInstall"
  ]
}
```

Activates for Node.js projects or when command used.

### Pattern 4: Background Service

```json
{
  "activationEvents": [
    "onStartupFinished"
  ]
}
```

Loads after startup, runs in background.

### Pattern 5: View Provider

```json
{
  "activationEvents": [
    "onView:myTreeView",
    "onCommand:extension.refreshView"
  ]
}
```

Loads when view opened or refresh command invoked.

## Performance Optimization

### Best Practices

1. **Be Specific:** Use specific events instead of `*`
   - ❌ `"activationEvents": ["*"]`
   - ✅ `"activationEvents": ["onCommand:extension.myCommand"]`

2. **Defer Loading:** Use `onStartupFinished` instead of `*`
   - ❌ `"activationEvents": ["*"]`
   - ✅ `"activationEvents": ["onStartupFinished"]`

3. **Lazy Commands:** Don't use `*` for command registration
   - Commands can be invoked without activation
   - Extension activates when command runs

4. **Workspace Context:** Be specific with glob patterns
   - ❌ `"workspaceContains:**/*"` (too broad)
   - ✅ `"workspaceContains:**/.eslintrc.json"`

5. **Language Specific:** Target specific languages
   - ❌ `"activationEvents": ["*"]` for language features
   - ✅ `"activationEvents": ["onLanguage:python"]`

### Performance Testing

Test extension activation impact:

```typescript
export function activate(context: vscode.ExtensionContext) {
  console.time('Extension Activation');
  
  // Extension initialization
  
  console.timeEnd('Extension Activation');
}
```

Target: < 100ms activation time.

## Debugging Activation

### Check When Extension Activates

Add logging:

```typescript
export function activate(context: vscode.ExtensionContext) {
  console.log('Extension activated at:', new Date().toISOString());
}
```

### View Activation Events

Developer: Show Running Extensions
- Shows all active extensions
- Displays activation time
- Identifies slow activations

### Test Different Scenarios

1. Start VS Code: Tests `*` and `onStartupFinished`
2. Open file: Tests `onLanguage`
3. Run command: Tests `onCommand`
4. Open folder: Tests `workspaceContains`

## Common Mistakes

### Mistake 1: Using `*` Unnecessarily

```json
// ❌ BAD
{
  "activationEvents": ["*"]
}
```

```json
// ✅ GOOD
{
  "activationEvents": [
    "onCommand:extension.myCommand"
  ]
}
```

### Mistake 2: Missing Activation Event

```json
// ❌ Command not executable
{
  "contributes": {
    "commands": [{
      "command": "extension.myCommand",
      "title": "My Command"
    }]
  }
  // Missing activation event!
}
```

```json
// ✅ Command will work
{
  "activationEvents": [
    "onCommand:extension.myCommand"
  ],
  "contributes": {
    "commands": [{
      "command": "extension.myCommand",
      "title": "My Command"
    }]
  }
}
```

### Mistake 3: Too Broad Pattern

```json
// ❌ Matches too many files
{
  "activationEvents": [
    "workspaceContains:**/*.json"
  ]
}
```

```json
// ✅ Specific file
{
  "activationEvents": [
    "workspaceContains:**/tsconfig.json"
  ]
}
```

## Conditional Activation

Some extensions need conditional logic:

```typescript
export function activate(context: vscode.ExtensionContext) {
  // Check if extension should actually do anything
  const config = vscode.workspace.getConfiguration('myExtension');
  if (!config.get<boolean>('enabled')) {
    return; // Don't initialize
  }
  
  // Initialize extension
}
```

**Note:** Extension still activates (activation event fired), but immediately returns without doing work.

## Migration Guide

### From `*` to Specific Events

**Before:**
```json
{
  "activationEvents": ["*"]
}
```

**After:**
```json
{
  "activationEvents": [
    "onStartupFinished"
  ]
}
```

Or even better, identify specific triggers:

```json
{
  "activationEvents": [
    "onCommand:extension.myCommand",
    "onLanguage:javascript"
  ]
}
```

### From `onLanguage:*` to Specific Languages

**Before:**
```json
{
  "activationEvents": ["onLanguage:*"]
}
```

**After:**
```json
{
  "activationEvents": [
    "onLanguage:javascript",
    "onLanguage:typescript",
    "onLanguage:python"
  ]
}
```

## Decision Tree

**Does extension provide commands?**
- Yes → Use `onCommand:command.id`

**Does extension work with specific languages?**
- Yes → Use `onLanguage:languageId`

**Does extension provide a view?**
- Yes → Use `onView:viewId`

**Does extension need to run on startup?**
- Critical → Consider `*` (but avoid if possible)
- Can wait → Use `onStartupFinished`
- No → Use specific event

**Does extension work with specific project types?**
- Yes → Use `workspaceContains:pattern`

**None of above?**
- Review available activation events
- Consider if extension should lazy load
- Use `onStartupFinished` as last resort

## Summary

- **Default choice:** `onCommand` for command-based extensions
- **Language features:** `onLanguage`
- **Views:** `onView`
- **Background services:** `onStartupFinished`
- **Avoid:** `*` (impacts performance)
- **Test:** Verify extension activates at right time

Choose the most specific activation event possible for best performance and user experience.

