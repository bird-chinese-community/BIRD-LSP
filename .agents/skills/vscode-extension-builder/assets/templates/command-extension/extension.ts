import * as vscode from 'vscode';

/**
 * This method is called when the extension is activated.
 * The extension is activated the very first time a command is executed.
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Extension "command-extension" is now active');

	// Register Hello World command
	let helloWorldDisposable = vscode.commands.registerCommand(
		'extension.helloWorld',
		() => {
			vscode.window.showInformationMessage('Hello World from Command Extension!');
		}
	);

	// Register Get User Input command
	let getUserInputDisposable = vscode.commands.registerCommand(
		'extension.getUserInput',
		async () => {
			const name = await vscode.window.showInputBox({
				prompt: 'Enter your name',
				placeHolder: 'John Doe',
				validateInput: (value) => {
					if (value.length < 2) {
						return 'Name must be at least 2 characters';
					}
					return undefined;
				}
			});

			if (name) {
				vscode.window.showInformationMessage(`Hello, ${name}!`);
			}
		}
	);

	// Add disposables to subscriptions for cleanup
	context.subscriptions.push(helloWorldDisposable);
	context.subscriptions.push(getUserInputDisposable);
}

/**
 * This method is called when the extension is deactivated.
 */
export function deactivate() {
	console.log('Extension "command-extension" is now deactivated');
}

