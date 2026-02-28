# VS Code Common APIs Reference

Comprehensive guide to frequently used VS Code Extension APIs with examples.

## Table of Contents

- Window & Editor APIs
- Workspace APIs
- Language Features
- Webview APIs
- Tree View APIs
- File System APIs
- Terminal APIs
- Status Bar & UI Elements

## Window & Editor APIs

### Show Messages

```typescript
// Information message
vscode.window.showInformationMessage('Operation completed');

// Warning message
vscode.window.showWarningMessage('Check your settings');

// Error message
vscode.window.showErrorMessage('Operation failed');

// Message with actions
vscode.window.showInformationMessage(
  'Delete this file?',
  'Yes',
  'No'
).then(selection => {
  if (selection === 'Yes') {
    // Delete file
  }
});
```

### Input Dialogs

```typescript
// Simple text input
const name = await vscode.window.showInputBox({
  prompt: 'Enter your name',
  placeHolder: 'John Doe',
  validateInput: (value) => {
    return value.length < 3 ? 'Name too short' : undefined;
  }
});

// Quick pick (dropdown)
const choice = await vscode.window.showQuickPick(
  ['Option 1', 'Option 2', 'Option 3'],
  {
    placeHolder: 'Select an option',
    canPickMany: false
  }
);

// Quick pick with objects
interface MyItem extends vscode.QuickPickItem {
  id: string;
}

const items: MyItem[] = [
  { label: 'First', description: 'First option', id: '1' },
  { label: 'Second', description: 'Second option', id: '2' }
];

const selected = await vscode.window.showQuickPick(items);
if (selected) {
  console.log(selected.id);
}

// File/folder picker
const files = await vscode.window.showOpenDialog({
  canSelectFiles: true,
  canSelectFolders: false,
  canSelectMany: true,
  filters: {
    'Images': ['png', 'jpg'],
    'All files': ['*']
  }
});
```

### Progress Indication

```typescript
// Simple progress
await vscode.window.withProgress(
  {
    location: vscode.ProgressLocation.Notification,
    title: 'Processing...',
    cancellable: true
  },
  async (progress, token) => {
    token.onCancellationRequested(() => {
      console.log('User canceled');
    });

    progress.report({ increment: 0, message: 'Starting...' });
    await someOperation();
    
    progress.report({ increment: 50, message: 'Half done...' });
    await anotherOperation();
    
    progress.report({ increment: 50, message: 'Completing...' });
  }
);

// Window status bar progress
vscode.window.withProgress(
  { location: vscode.ProgressLocation.Window },
  async () => {
    await longRunningTask();
  }
);
```

### Active Editor

```typescript
// Get active editor
const editor = vscode.window.activeTextEditor;
if (!editor) {
  vscode.window.showErrorMessage('No active editor');
  return;
}

// Get document
const document = editor.document;
const text = document.getText();
const fileName = document.fileName;
const languageId = document.languageId;

// Get selection
const selection = editor.selection;
const selectedText = document.getText(selection);

// Get cursor position
const position = selection.active;
const line = position.line;
const character = position.character;
```

### Edit Document

```typescript
// Simple edit
await editor.edit(editBuilder => {
  // Insert text
  editBuilder.insert(position, 'Hello World');
  
  // Replace text
  const range = new vscode.Range(0, 0, 0, 10);
  editBuilder.replace(range, 'New text');
  
  // Delete text
  editBuilder.delete(range);
});

// Workspace edit (multiple files)
const workspaceEdit = new vscode.WorkspaceEdit();

// Edit file 1
const uri1 = vscode.Uri.file('/path/to/file1.ts');
workspaceEdit.insert(uri1, new vscode.Position(0, 0), 'Header\n');

// Edit file 2
const uri2 = vscode.Uri.file('/path/to/file2.ts');
workspaceEdit.replace(
  uri2,
  new vscode.Range(1, 0, 1, 10),
  'replacement'
);

await vscode.workspace.applyEdit(workspaceEdit);
```

### Decorations

```typescript
// Create decoration type
const decorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255, 0, 0, 0.3)',
  border: '1px solid red',
  borderRadius: '3px',
  after: {
    contentText: ' ⚠️',
    color: 'red'
  }
});

// Apply decorations
const ranges = [new vscode.Range(0, 0, 0, 10)];
editor.setDecorations(decorationType, ranges);

// Clear decorations
editor.setDecorations(decorationType, []);

// Dispose when done
decorationType.dispose();
```

## Workspace APIs

### Workspace Folders

```typescript
// Get workspace folders
const folders = vscode.workspace.workspaceFolders;
if (!folders) {
  vscode.window.showErrorMessage('No workspace opened');
  return;
}

const rootPath = folders[0].uri.fsPath;

// Watch workspace folder changes
vscode.workspace.onDidChangeWorkspaceFolders(event => {
  event.added.forEach(folder => {
    console.log('Added:', folder.uri.fsPath);
  });
  event.removed.forEach(folder => {
    console.log('Removed:', folder.uri.fsPath);
  });
});
```

### Find Files

```typescript
// Find files matching pattern
const files = await vscode.workspace.findFiles(
  '**/*.ts',           // Include pattern
  '**/node_modules/**' // Exclude pattern
);

files.forEach(file => {
  console.log(file.fsPath);
});
```

### Configuration

```typescript
// Get configuration
const config = vscode.workspace.getConfiguration('myExtension');

// Read values with defaults
const enabled = config.get<boolean>('enable', true);
const maxItems = config.get<number>('maxItems', 10);

// Update configuration
await config.update('enable', false, vscode.ConfigurationTarget.Global);

// Watch configuration changes
vscode.workspace.onDidChangeConfiguration(event => {
  if (event.affectsConfiguration('myExtension.enable')) {
    const newValue = config.get<boolean>('enable');
    console.log('Enabled changed to:', newValue);
  }
});
```

### Text Documents

```typescript
// Get all open documents
const documents = vscode.workspace.textDocuments;

// Open document
const document = await vscode.workspace.openTextDocument(uri);

// Open text
const doc = await vscode.workspace.openTextDocument({
  content: 'Hello World',
  language: 'javascript'
});

// Show document in editor
await vscode.window.showTextDocument(doc);

// Watch document changes
vscode.workspace.onDidOpenTextDocument(doc => {
  console.log('Opened:', doc.fileName);
});

vscode.workspace.onDidChangeTextDocument(event => {
  console.log('Changed:', event.document.fileName);
  event.contentChanges.forEach(change => {
    console.log('Change:', change.text);
  });
});

vscode.workspace.onDidSaveTextDocument(doc => {
  console.log('Saved:', doc.fileName);
});

vscode.workspace.onDidCloseTextDocument(doc => {
  console.log('Closed:', doc.fileName);
});
```

## Language Features

### Hover Provider

```typescript
class MyHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const wordRange = document.getWordRangeAtPosition(position);
    const word = document.getText(wordRange);
    
    return new vscode.Hover([
      `**${word}**`,
      'Detailed information about ' + word
    ]);
  }
}

// Register provider
context.subscriptions.push(
  vscode.languages.registerHoverProvider('javascript', new MyHoverProvider())
);
```

### Completion Provider

```typescript
class MyCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    // Simple completion
    const item1 = new vscode.CompletionItem(
      'myFunction',
      vscode.CompletionItemKind.Function
    );
    item1.detail = 'My custom function';
    item1.documentation = 'Does something useful';
    
    // Snippet completion
    const item2 = new vscode.CompletionItem(
      'mySnippet',
      vscode.CompletionItemKind.Snippet
    );
    item2.insertText = new vscode.SnippetString(
      'function ${1:name}(${2:params}) {\n\t$0\n}'
    );
    
    return [item1, item2];
  }
}

context.subscriptions.push(
  vscode.languages.registerCompletionItemProvider(
    'javascript',
    new MyCompletionProvider(),
    '.', // Trigger characters
    '('
  )
);
```

### Diagnostics (Errors/Warnings)

```typescript
// Create diagnostic collection
const diagnostics = vscode.languages.createDiagnosticCollection('myLinter');
context.subscriptions.push(diagnostics);

// Add diagnostics to a file
function updateDiagnostics(document: vscode.TextDocument) {
  const diags: vscode.Diagnostic[] = [];
  
  const text = document.getText();
  const regex = /TODO:/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const line = document.positionAt(match.index).line;
    const range = new vscode.Range(line, 0, line, 1000);
    
    const diagnostic = new vscode.Diagnostic(
      range,
      'TODO comment found',
      vscode.DiagnosticSeverity.Information
    );
    diagnostic.code = 'TODO001';
    diagnostic.source = 'myLinter';
    
    diags.push(diagnostic);
  }
  
  diagnostics.set(document.uri, diags);
}

// Clear diagnostics
diagnostics.clear();
```

### Code Actions

```typescript
class MyCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection
  ): vscode.CodeAction[] {
    const fix = new vscode.CodeAction(
      'Fix this issue',
      vscode.CodeActionKind.QuickFix
    );
    
    fix.edit = new vscode.WorkspaceEdit();
    fix.edit.replace(document.uri, range, 'fixed text');
    
    return [fix];
  }
}

context.subscriptions.push(
  vscode.languages.registerCodeActionsProvider(
    'javascript',
    new MyCodeActionProvider()
  )
);
```

### Definition Provider

```typescript
class MyDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Definition> {
    const word = document.getText(
      document.getWordRangeAtPosition(position)
    );
    
    // Find definition location
    const definitionUri = vscode.Uri.file('/path/to/definition.ts');
    const definitionPos = new vscode.Position(10, 0);
    
    return new vscode.Location(definitionUri, definitionPos);
  }
}

context.subscriptions.push(
  vscode.languages.registerDefinitionProvider(
    'javascript',
    new MyDefinitionProvider()
  )
);
```

## Webview APIs

### Create Webview Panel

```typescript
// Create webview
const panel = vscode.window.createWebviewPanel(
  'myWebview',           // View type
  'My Webview',          // Title
  vscode.ViewColumn.One, // Column
  {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, 'media')
    ]
  }
);

// Set HTML content
panel.webview.html = getWebviewContent();

// Handle messages from webview
panel.webview.onDidReceiveMessage(
  message => {
    switch (message.command) {
      case 'alert':
        vscode.window.showInformationMessage(message.text);
        break;
    }
  },
  undefined,
  context.subscriptions
);

// Send message to webview
panel.webview.postMessage({ command: 'update', data: 'New data' });
```

### Webview HTML

```typescript
function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Webview</title>
</head>
<body>
    <h1>Hello from Webview</h1>
    <button onclick="sendMessage()">Send Message</button>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function sendMessage() {
            vscode.postMessage({
                command: 'alert',
                text: 'Hello from webview'
            });
        }
        
        // Receive messages
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('Received:', message);
        });
    </script>
</body>
</html>`;
}
```

### Load Resources in Webview

```typescript
// Get URI for resource
const scriptUri = panel.webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'media', 'script.js')
);

const styleUri = panel.webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'media', 'style.css')
);

// Use in HTML
const html = `
  <link href="${styleUri}" rel="stylesheet">
  <script src="${scriptUri}"></script>
`;
```

## Tree View APIs

### Tree Data Provider

```typescript
class MyTreeDataProvider implements vscode.TreeDataProvider<MyItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MyItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: MyItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MyItem): MyItem[] {
    if (!element) {
      // Root items
      return [
        new MyItem('Item 1', vscode.TreeItemCollapsibleState.Collapsed),
        new MyItem('Item 2', vscode.TreeItemCollapsibleState.None)
      ];
    }
    
    // Child items
    return [
      new MyItem('Child 1', vscode.TreeItemCollapsibleState.None),
      new MyItem('Child 2', vscode.TreeItemCollapsibleState.None)
    ];
  }
}

class MyItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = `Tooltip for ${label}`;
    this.iconPath = new vscode.ThemeIcon('file');
    
    // Add command on click
    this.command = {
      command: 'extension.itemClicked',
      title: 'Item Clicked',
      arguments: [this]
    };
  }
}

// Register tree view
const treeDataProvider = new MyTreeDataProvider();
const treeView = vscode.window.createTreeView('myView', {
  treeDataProvider
});

context.subscriptions.push(treeView);
```

## File System APIs

### Read/Write Files

```typescript
// Read file
const fileUri = vscode.Uri.file('/path/to/file.txt');
const fileData = await vscode.workspace.fs.readFile(fileUri);
const text = Buffer.from(fileData).toString('utf8');

// Write file
const content = Buffer.from('Hello World', 'utf8');
await vscode.workspace.fs.writeFile(fileUri, content);

// Check if exists
try {
  await vscode.workspace.fs.stat(fileUri);
  console.log('File exists');
} catch {
  console.log('File does not exist');
}

// Create directory
await vscode.workspace.fs.createDirectory(
  vscode.Uri.file('/path/to/dir')
);

// Delete file
await vscode.workspace.fs.delete(fileUri);

// Rename/move
await vscode.workspace.fs.rename(oldUri, newUri);

// Copy
await vscode.workspace.fs.copy(sourceUri, destUri);
```

### File Watcher

```typescript
// Watch files
const watcher = vscode.workspace.createFileSystemWatcher(
  '**/*.{js,ts}'
);

watcher.onDidCreate(uri => {
  console.log('Created:', uri.fsPath);
});

watcher.onDidChange(uri => {
  console.log('Changed:', uri.fsPath);
});

watcher.onDidDelete(uri => {
  console.log('Deleted:', uri.fsPath);
});

context.subscriptions.push(watcher);
```

## Terminal APIs

```typescript
// Create terminal
const terminal = vscode.window.createTerminal('My Terminal');

// Show terminal
terminal.show();

// Send commands
terminal.sendText('echo "Hello World"');
terminal.sendText('npm install', true); // Add newline

// Dispose terminal
terminal.dispose();

// Watch terminal events
vscode.window.onDidOpenTerminal(terminal => {
  console.log('Terminal opened:', terminal.name);
});

vscode.window.onDidCloseTerminal(terminal => {
  console.log('Terminal closed:', terminal.name);
});
```

## Status Bar APIs

```typescript
// Create status bar item
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100 // Priority
);

// Configure
statusBarItem.text = '$(check) Ready';
statusBarItem.tooltip = 'Extension is ready';
statusBarItem.command = 'extension.statusClicked';
statusBarItem.backgroundColor = new vscode.ThemeColor(
  'statusBarItem.warningBackground'
);

// Show
statusBarItem.show();

// Update
statusBarItem.text = '$(sync~spin) Processing...';

// Hide
statusBarItem.hide();

// Cleanup
context.subscriptions.push(statusBarItem);
```

## Output Channel

```typescript
// Create output channel
const outputChannel = vscode.window.createOutputChannel('My Extension');

// Write output
outputChannel.appendLine('Extension activated');
outputChannel.append('Progress: ');
outputChannel.appendLine('50%');

// Show output panel
outputChannel.show();

// Clear
outputChannel.clear();

// Cleanup
context.subscriptions.push(outputChannel);
```

This reference covers the most commonly used VS Code APIs. Use it when implementing specific extension features.

