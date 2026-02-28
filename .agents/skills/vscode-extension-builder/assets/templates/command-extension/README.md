# Command Extension Template

This is a simple command-based VS Code extension template.

## Features

- **Hello World**: Shows a simple information message
- **Get User Input**: Demonstrates input validation and user interaction

## Usage

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Palette
2. Type "MyExtension" to see available commands:
   - `MyExtension: Hello World`
   - `MyExtension: Get User Input`

## Customization

### Add More Commands

1. Register the command in `package.json`:
```json
{
  "contributes": {
    "commands": [
      {
        "command": "extension.myNewCommand",
        "title": "My New Command",
        "category": "MyExtension"
      }
    ]
  }
}
```

2. Implement the command in `extension.ts`:
```typescript
let myCommandDisposable = vscode.commands.registerCommand(
  'extension.myNewCommand',
  () => {
    // Your command logic here
  }
);
context.subscriptions.push(myCommandDisposable);
```

### Add Keyboard Shortcuts

In `package.json`:
```json
{
  "contributes": {
    "keybindings": [
      {
        "command": "extension.helloWorld",
        "key": "ctrl+shift+h",
        "mac": "cmd+shift+h"
      }
    ]
  }
}
```

## Development

1. Open this folder in VS Code
2. Press `F5` to open a new Extension Development Host window
3. Test your commands in the new window

## Building

```bash
npm run compile
```

## Structure

```
command-extension/
├── extension.ts       # Main extension code
├── package.json      # Extension manifest
└── README.md        # This file
```

