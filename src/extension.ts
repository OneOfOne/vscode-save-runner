import * as vscode from 'vscode';
import SaveRunner from './save-runner';

export function activate(context: vscode.ExtensionContext) {
	const sr = new SaveRunner(context);

	sr.start();
}
