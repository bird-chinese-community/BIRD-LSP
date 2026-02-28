import * as vscode from 'vscode';

/**
 * This method is called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Extension "webview-extension" is now active');

	// Register command to open webview
	let disposable = vscode.commands.registerCommand(
		'extension.openWebview',
		() => {
			WebviewPanel.createOrShow(context.extensionUri);
		}
	);

	context.subscriptions.push(disposable);
}

/**
 * Manages webview panels
 */
class WebviewPanel {
	public static currentPanel: WebviewPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it
		if (WebviewPanel.currentPanel) {
			WebviewPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel
		const panel = vscode.window.createWebviewPanel(
			'myWebview',
			'My Webview',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);

		WebviewPanel.currentPanel = new WebviewPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'alert':
						vscode.window.showInformationMessage(message.text);
						return;
					case 'getData':
						// Send data back to webview
						this._panel.webview.postMessage({
							command: 'updateData',
							data: { message: 'Hello from extension!' }
						});
						return;
				}
			},
			null,
			this._disposables
		);
	}

	public dispose() {
		WebviewPanel.currentPanel = undefined;

		// Clean up resources
		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		// Get the local path to scripts and css
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
		);

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" 
		  content="default-src 'none'; 
				   style-src ${webview.cspSource} 'unsafe-inline'; 
				   script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>My Webview</title>
</head>
<body>
	<h1>Hello from Webview!</h1>
	<p>This is a webview panel with two-way communication.</p>
	
	<button id="alertBtn">Send Alert to Extension</button>
	<button id="getDataBtn">Get Data from Extension</button>
	
	<div id="data-display"></div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();

		// Send message to extension
		document.getElementById('alertBtn').addEventListener('click', () => {
			vscode.postMessage({
				command: 'alert',
				text: 'Hello from webview!'
			});
		});

		document.getElementById('getDataBtn').addEventListener('click', () => {
			vscode.postMessage({
				command: 'getData'
			});
		});

		// Receive messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.command) {
				case 'updateData':
					document.getElementById('data-display').innerHTML = 
						'<p>Received: ' + JSON.stringify(message.data) + '</p>';
					break;
			}
		});
	</script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * This method is called when the extension is deactivated.
 */
export function deactivate() {
	console.log('Extension "webview-extension" is now deactivated');
}

