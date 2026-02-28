---
name: vscode-extension-builder
description: Comprehensive guide for creating VS Code extensions from scratch, including project scaffolding, API usage, activation events, and packaging. Use when user wants to create/build/generate/develop a VS Code extension or plugin, asks about VS Code extension development, needs help with VS Code Extension API, discusses extension architecture, wants to add commands/webviews/language support, or mentions scaffolding a VS Code project.
---

# VS Code Extension Builder

Build professional VS Code extensions with proper architecture, best practices, and complete tooling support.

## Quick Start

For immediate extension creation:

1. **Initialize**: Run `npx --package yo --package generator-code -- yo code`
2. **Choose type**: New Extension (TypeScript)
3. **Fill details**: Name, identifier, description
4. **Develop**: Open in VS Code, press F5 to debug
5. **Test**: Run commands in Extension Development Host
6. **Package**: Run `vsce package` when ready

For detailed guidance, follow the workflow below.

## Extension Types

Choose the type that matches your needs:

- **Command Extension**: Add commands to Command Palette (simplest, most common)
- **Language Support**: Syntax highlighting, IntelliSense, formatting
- **Webview Extension**: Custom UI panels with HTML/CSS/JS
- **Tree View**: Custom sidebar views with hierarchical data
- **Debugger**: Add debugging support for languages
- **Theme**: Color themes, file icon themes
- **Snippet Provider**: Code snippets for languages

## Core Workflow

### 1. Gather Requirements

Ask user about:
- **Purpose**: What should the extension do?
- **Type**: Which extension type? (command, language, webview, etc.)
- **Features**: Specific functionality needed
- **UI**: Commands, views, panels, status bar items?
- **Activation**: When should it activate?

### 2. Choose Extension Type & Architecture

Based on requirements, select appropriate pattern:

**Simple Command Extension** (most common):
- Single responsibility
- Command Palette integration
- Quick to build

**Language Extension**:
- Syntax highlighting (TextMate grammar)
- Language server for IntelliSense
- Complex but powerful

**Webview Extension**:
- Custom UI needed
- Rich interactions
- More complex state management

See [extension-anatomy.md](references/extension-anatomy.md) for detailed structure.

### 3. Initialize Project

**Option A: Use Yeoman Generator (Recommended)**
```bash
npx --package yo --package generator-code -- yo code
```

Fill in:
- Type: New Extension (TypeScript)
- Name: User-friendly name
- Identifier: lowercase-with-hyphens
- Description: Clear purpose
- Git: Yes
- Bundler: esbuild (recommended) or webpack
- Package manager: npm

**Option B: Use Templates**

For specific patterns, copy from `assets/templates/`:
- `command-extension/` - Command-based extension
- `language-support/` - Language extension starter
- `webview-extension/` - Webview-based extension

### 4. Implement Core Functionality

**For Command Extensions:**

1. Define command in `package.json`:
```json
{
  "contributes": {
    "commands": [{
      "command": "extension.commandId",
      "title": "Command Title"
    }]
  }
}
```

2. Register command in `extension.ts`:
```typescript
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('extension.commandId', () => {
    vscode.window.showInformationMessage('Hello from Extension!');
  });
  context.subscriptions.push(disposable);
}
```

**For Language Extensions:**
See [common-apis.md](references/common-apis.md) for language features APIs.

**For Webview Extensions:**
See [common-apis.md](references/common-apis.md) for webview creation patterns.

### 5. Configure Activation & Contributions

**Activation Events** determine when your extension loads:
- `onCommand`: When command is invoked
- `onLanguage`: When file type opens
- `onView`: When tree view becomes visible
- `*`: On startup (avoid if possible)

See [activation-events.md](references/activation-events.md) for complete reference.

**Contributions** declare extension capabilities in `package.json`:
- `commands`: Command Palette entries
- `menus`: Context menu items
- `keybindings`: Keyboard shortcuts
- `languages`: Language support
- `views`: Tree views
- `configuration`: Settings

### 6. Test & Debug

**Local Testing:**
1. Press `F5` in VS Code to launch Extension Development Host
2. Test commands and features
3. Check Debug Console for logs
4. Set breakpoints for debugging

**Automated Testing:**
- Unit tests: Test business logic
- Integration tests: Test VS Code API interactions
- Use `@vscode/test-electron` for testing

**Common Issues:**
- Command not appearing: Check `contributes.commands` and activation events
- Extension not activating: Verify activation events in `package.json`
- API errors: Check VS Code API version compatibility

### 7. Package & Distribute

**Prepare for Publishing:**
1. Update README.md with features and usage
2. Add extension icon (128x128 PNG)
3. Set repository URL in package.json
4. Add LICENSE file
5. Test thoroughly

**Package Extension:**
```bash
npm install -g @vscode/vsce
vsce package
```

Creates `.vsix` file for distribution.

**Publish to Marketplace:**
```bash
vsce publish
```

Requires Azure DevOps personal access token.

## Common Patterns

### Pattern 1: Simple Command

Quick command that shows information:

```typescript
vscode.commands.registerCommand('extension.showInfo', () => {
  vscode.window.showInformationMessage('Information message');
});
```

### Pattern 2: Command with User Input

Get input before executing:

```typescript
vscode.commands.registerCommand('extension.greet', async () => {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter your name'
  });
  if (name) {
    vscode.window.showInformationMessage(`Hello, ${name}!`);
  }
});
```

### Pattern 3: File Operation Command

Work with active editor:

```typescript
vscode.commands.registerCommand('extension.processFile', () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }
  
  const document = editor.document;
  const text = document.getText();
  // Process text...
});
```

### Pattern 4: Status Bar Item

Show persistent status:

```typescript
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100
);
statusBarItem.text = "$(check) Ready";
statusBarItem.show();
context.subscriptions.push(statusBarItem);
```

## Reference Navigation

Load these references as needed:

- **[extension-anatomy.md](references/extension-anatomy.md)**: When you need details about:
  - Extension structure and file organization
  - `package.json` manifest fields
  - Entry point and lifecycle hooks
  - Extension context and disposables

- **[common-apis.md](references/common-apis.md)**: When implementing:
  - Window and editor operations
  - Workspace and file system access
  - Language features (IntelliSense, diagnostics)
  - Webview creation and messaging
  - Tree views and custom UI

- **[activation-events.md](references/activation-events.md)**: When configuring:
  - When extension should load
  - Performance optimization
  - Lazy loading strategies

- **[best-practices.md](references/best-practices.md)**: When considering:
  - UX guidelines and design patterns
  - Performance optimization
  - Security considerations
  - Testing strategies
  - Publishing guidelines

## Key Principles

### Performance
- **Lazy load**: Use specific activation events, not `*`
- **Async operations**: Use async/await for I/O
- **Dispose resources**: Clean up subscriptions
- **Minimize startup**: Defer heavy operations

### User Experience
- **Clear commands**: Descriptive titles and categories
- **Feedback**: Show progress for long operations
- **Error handling**: Helpful error messages
- **Consistent UI**: Follow VS Code conventions

### Code Quality
- **TypeScript**: Use strict mode for type safety
- **Error handling**: Try-catch for all operations
- **Logging**: Use console.log for debugging
- **Testing**: Write tests for critical functionality

## Troubleshooting

### Extension Not Appearing
- Verify `package.json` syntax (valid JSON)
- Check `main` field points to compiled output
- Ensure activation events are correct
- Reload window: `Developer: Reload Window`

### Command Not Working
- Check command ID matches in `package.json` and code
- Verify activation event includes the command
- Check Debug Console for errors
- Ensure command is registered in `activate()`

### Build Errors
- Run `npm install` to install dependencies
- Check TypeScript configuration
- Verify VS Code API version compatibility
- Update `@types/vscode` if needed

## Examples by Use Case

### Add Command to Format Code
1. Type: Command extension
2. Activation: `onCommand`
3. Implementation: Get editor text, format, replace
4. UI: Command Palette entry

### Add Syntax Highlighting
1. Type: Language extension
2. Activation: `onLanguage:mylang`
3. Implementation: TextMate grammar in JSON
4. UI: Automatic on file open

### Add Custom Sidebar View
1. Type: Tree view extension
2. Activation: `onView:myView`
3. Implementation: TreeDataProvider interface
4. UI: Activity bar icon + sidebar panel

### Add Quick Pick Menu
1. Type: Command extension with UI
2. Activation: `onCommand`
3. Implementation: `showQuickPick` with items
4. UI: Searchable dropdown menu

## Resources in This Skill

- **references/**: Detailed documentation (load as needed)
- **assets/templates/**: Starting templates for common patterns
- **Official docs**: https://code.visualstudio.com/api

## Related Skills

For code quality and architecture review of your extension code:
- `detect-code-smells`: Check extension code quality
- `security-pattern-check`: Security review for extensions
- `suggest-performance-fix`: Optimize extension performance

## Notes

This skill provides the complete workflow for VS Code extension development, from initial concept to published extension. Use progressive disclosure: start with Quick Start for simple cases, dive into references for complex requirements. Templates in `assets/` provide copy-paste starting points for common patterns.

