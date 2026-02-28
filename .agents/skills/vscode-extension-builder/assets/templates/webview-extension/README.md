# Webview Extension Template

This is a webview-based VS Code extension template with two-way communication between the extension and webview.

## Features

- **Webview Panel**: Custom UI with HTML/CSS/JavaScript
- **Two-way Communication**: Send messages between extension and webview
- **Singleton Pattern**: Reuses existing panel if already open
- **Secure**: Proper Content Security Policy

## Usage

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Palette
2. Type "Open Webview" and select the command
3. A new panel will open with interactive buttons

## Features Demonstrated

### Send Message to Extension
Click "Send Alert to Extension" to send a message from webview to the extension, which shows an information message.

### Get Data from Extension
Click "Get Data from Extension" to request data from the extension, which responds with data displayed in the webview.

## Customization

### Update Webview Content

Edit the `_getHtmlForWebview` method in `extension.ts` to customize the HTML:

```typescript
private _getHtmlForWebview(webview: vscode.Webview): string {
  return `<!DOCTYPE html>
  <html>
  <body>
    <h1>Your Custom Content</h1>
  </body>
  </html>`;
}
```

### Add Message Handlers

In `extension.ts`, add new message handlers:

```typescript
this._panel.webview.onDidReceiveMessage(
  message => {
    switch (message.command) {
      case 'yourCommand':
        // Handle your command
        return;
    }
  }
);
```

In the webview HTML, send messages:

```javascript
vscode.postMessage({
  command: 'yourCommand',
  data: { /* your data */ }
});
```

### Load External Resources

To load CSS or JS files from your extension:

1. Create a `media` folder in your extension
2. Add files: `media/style.css`, `media/main.js`
3. Load them in the webview:

```typescript
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
);
```

## Development

1. Open this folder in VS Code
2. Press `F5` to open a new Extension Development Host window
3. Run the "Open Webview" command
4. Make changes and reload the window to see updates

## Security

The webview uses Content Security Policy (CSP) to prevent XSS attacks:

- Only scripts with the correct nonce can run
- External resources must be explicitly allowed
- Inline styles are allowed (but can be restricted)

## Structure

```
webview-extension/
├── extension.ts       # Main extension code with WebviewPanel class
├── package.json      # Extension manifest
├── README.md        # This file
└── media/           # (Optional) External CSS/JS files
```

## Best Practices

1. **State Management**: Use `vscode.setState()` and `vscode.getState()` in webview to persist state
2. **Cleanup**: Always dispose webview panels properly
3. **Security**: Use nonces and CSP for script execution
4. **Performance**: Use `retainContextWhenHidden` carefully (uses memory)
5. **Messaging**: Keep messages simple and well-defined

## Advanced Features

### Persist State

In webview JavaScript:

```javascript
// Save state
vscode.setState({ key: 'value' });

// Restore state
const previousState = vscode.getState();
```

### Update Panel Dynamically

```typescript
this._panel.webview.postMessage({
  command: 'update',
  data: newData
});
```

### Handle Panel Events

```typescript
this._panel.onDidChangeViewState(
  e => {
    if (e.webviewPanel.visible) {
      // Panel became visible
    }
  }
);
```

