import * as vscode from 'vscode';

interface Command {
	match?: string | RegExp;
	notMatch?: string | RegExp;
	before: string;
	after: string;
}

interface Config extends vscode.WorkspaceConfiguration {
	enabled: boolean;
	shell?: string;
	autoClearConsole?: boolean;
	commands?: Command[];
}

export default class SaveRunner {
	private ds: vscode.Disposable[] = [];
	private cfg: Config;

	constructor(private ctx: vscode.ExtensionContext) {
		this.ctx = ctx;

		this.cfg = vscode.workspace.getConfiguration('save-runner') as Config;

		console.log(this.cfg);
	}

	start() {
		const disposables = [
			vscode.workspace.onWillSaveTextDocument(this.runBeforeSave),
			vscode.workspace.onDidSaveTextDocument(this.runAfterSave),
		];

		this.ctx.subscriptions.push(...disposables);

		this.ds = disposables;
	}

	runBeforeSave = async (e: vscode.TextDocumentWillSaveEvent) => {
		if (!this.cfg.enabled) return null;
		return null;
	}

	runAfterSave = async (e: vscode.TextDocument) => {

	}

	dispose = () => {
		for (const d of this.ds) {
			d.dispose();
		}
	}
}
