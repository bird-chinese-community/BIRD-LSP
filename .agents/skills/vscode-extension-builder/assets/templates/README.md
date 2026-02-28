# VS Code Extension Templates

This directory contains starter templates for common VS Code extension patterns.

## Available Templates

### 1. Command Extension (`command-extension/`)

A simple command-based extension demonstrating:
- Command registration
- User input with validation
- Basic extension lifecycle

**Use when:**
- Building command-based extensions
- Need simple user interactions
- Want a minimal starting point

**Files:**
- `package.json` - Extension manifest
- `extension.ts` - Main extension code
- `README.md` - Template documentation

### 2. Webview Extension (`webview-extension/`)

A webview-based extension demonstrating:
- Webview panel creation
- Two-way messaging between extension and webview
- Singleton pattern for panel management
- Content Security Policy setup

**Use when:**
- Need custom UI beyond VS Code's built-in components
- Building dashboards or visualizations
- Requiring rich HTML/CSS/JS interactions

**Files:**
- `package.json` - Extension manifest
- `extension.ts` - Main extension code with WebviewPanel class
- `README.md` - Template documentation

## Usage

### Option 1: Copy Template Manually

```bash
cp -r command-extension/ ~/my-new-extension/
cd ~/my-new-extension/
npm install
```

### Option 2: Let Claude Copy for You

Just tell Claude which template you want:
- "Use the command extension template"
- "Start with the webview template"

Claude will copy the appropriate template files to your project.

## Customizing Templates

Each template includes:
- ✅ Working code ready to run
- ✅ Comments explaining key concepts
- ✅ README with customization guidance
- ✅ Basic TypeScript configuration

To customize:
1. Update `package.json` with your extension name and details
2. Modify `extension.ts` to implement your features
3. Add additional files as needed
4. Update README with your extension's documentation

## Development Workflow

After copying a template:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Open in VS Code**
   ```bash
   code .
   ```

3. **Start Debugging**
   - Press `F5` to launch Extension Development Host
   - Test your extension in the new window

4. **Make Changes**
   - Edit TypeScript files
   - Reload window to see changes (`Ctrl+R` in Extension Development Host)

5. **Package Extension**
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```

## Template Structure

Each template follows VS Code extension best practices:

```
template-name/
├── extension.ts       # Main entry point (activate/deactivate)
├── package.json      # Extension manifest (metadata, contributions)
└── README.md        # Documentation and usage guide
```

## Adding New Templates

To add a new template:

1. Create new directory: `templates/new-template-name/`
2. Add required files: `package.json`, `extension.ts`, `README.md`
3. Include working, tested code
4. Document the template purpose and usage
5. Update this README with template description

## Notes

- Templates use TypeScript (recommended for VS Code extensions)
- Minimal dependencies (only `@types/vscode` and TypeScript)
- Follow VS Code extension best practices
- Include helpful comments for learning

## Related Documentation

See the skill's reference files for more details:
- `references/extension-anatomy.md` - Complete extension structure
- `references/common-apis.md` - VS Code API examples
- `references/best-practices.md` - Quality and UX guidelines

