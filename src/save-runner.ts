import * as vscode from 'vscode';
import * as path from 'path';
import { spawnSync } from 'child_process';

interface Command {
	match?: string;
	notMatch?: string;
	before: string | string[];
	after: string;
}

interface Config extends vscode.WorkspaceConfiguration {
	enabled?: boolean;
	showOutput?: boolean;
	shell?: string;
	autoClearConsole?: boolean;
	commands?: Command[];
	isAsync?: boolean;
}

export default class SaveRunner {
	private ds: vscode.Disposable[] = [];
	private chan: vscode.OutputChannel;
	private cfg!: Config;

	constructor(private ctx: vscode.ExtensionContext) {
		this.ctx = ctx;
		this.chan = vscode.window.createOutputChannel('Save Runner');

		this.loadConfig();
	}

	start() {
		const disposables = [
			vscode.workspace.onWillSaveTextDocument(this.runBeforeSave),
			vscode.workspace.onDidSaveTextDocument(this.runAfterSave),
			vscode.workspace.onDidChangeConfiguration(() => this.loadConfig()),
			this.chan,
		];

		this.ctx.subscriptions.push(...disposables);

		this.ds = disposables;
	}

	runBeforeSave = (e: vscode.TextDocumentWillSaveEvent) => {
		if (!this.cfg.enabled) return;

		const { document: doc } = e,
			{ activeTextEditor: editor } = vscode.window,
			cmds = this.getCommands(doc, true);

		if (!cmds.length) return;

		if (!editor) {
			this.log('could not get an active editor, refusing to run commands.');
			return;
		}

		this.doPanelStuff();

		this.log('Running before-save commands...');

		let out = doc.getText();
		const len = out.length;

		for (const cmd of cmds) {
			let cp = cmd.before;
			if (Array.isArray(cp)) cp = cp.join(' | ');

			cp = this.expandVars(doc, cp);

			this.log(`\n- piping document to: ${cp}`);

			try {
				out = this.exec(cp, out);
			} catch (err) {
				this.log(`! ${cp} ${err}`);
				break;
			}
		}

		const range = new vscode.Range(0, 0, doc.lineCount, len);

		e.waitUntil(editor.edit((te) => te.replace(range, out)));

		this.log('\nDone running.\n');
	}

	runAfterSave = (doc: vscode.TextDocument) => {
		if (!this.cfg.enabled) return;

		const cmds = this.getCommands(doc),
			{ isAsync } = this.cfg;

		if (!cmds.length) return;

		this.doPanelStuff();

		this.log('Running after-save commands...');

		for (const cmd of cmds) {
			const cp = this.expandVars(doc, cmd.after);
			if (!isAsync) {
				this.log(`\n- running: ${cp}\n`);
				try {
					this.chan.append(this.exec(cp));
				} catch (err) {
					this.log(`! ${cp} ${err}`);
				}
				continue;
			}

			setTimeout(() => {
				this.log(`\n- running: ${cp}\n`);
				try {
					this.chan.append(this.exec(cp));
				} catch (err) {
					this.log(`! ${cp} ${err}`);
				}
			}, 1);
		}

		this.log('Done running.\n');
	}

	log(line: string) {
		return this.chan.appendLine(line);
	}

	dispose = () => {
		for (const d of this.ds) {
			d.dispose();
		}
	}

	private loadConfig() {
		const cfg = vscode.workspace.getConfiguration('save-runner') as Config;
		if (!cfg.commands) cfg.commands = [];
		this.cfg = cfg;
	}

	private getCommands(doc: vscode.TextDocument, before?: boolean) {
		const cmds = this.cfg.commands!.filter((cmd) => {
			if (before) return !!cmd.before;
			return !!cmd.after;
		});

		const match = (pattern: string) => !!pattern && new RegExp(pattern).test(doc.fileName);

		return cmds.filter((cmd) => {
			const isMatch = !cmd.match || match(cmd.match);
			const isNeg = cmd.notMatch && match(cmd.notMatch);

			return !isNeg && isMatch;
		});
	}

	// shamelessly copied from https://github.com/emeraldwalk/vscode-runonsave/blob/master/src/extension.ts
	private expandVars(doc: vscode.TextDocument, cmd: string) {
		const extName = path.extname(doc.fileName);

		let fixed = cmd.replace(/\${file}/g, `${doc.fileName}`);
		fixed = fixed.replace(/\${ext}/g, `${extName}`);
		fixed = fixed.replace(/\${workspaceRoot}/g, `${vscode.workspace.rootPath}`);
		fixed = fixed.replace(/\${basename}/g, `${path.basename(doc.fileName)}`);
		fixed = fixed.replace(/\${dirname}/g, `${path.dirname(doc.fileName)}`);
		fixed = fixed.replace(/\${basenameNoExt}/g, `${path.basename(doc.fileName, extName)}`);
		fixed = fixed.replace(/\${cwd}/g, `${process.cwd()}`);

		// replace environment variables ${env.Name}
		fixed = fixed.replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => process.env[envName]);

		return fixed;
	}

	private exec(cmd: string, text?: string): string {
		const res = spawnSync(cmd, {
			env: process.env,
			cwd: vscode.workspace.rootPath,
			shell: this.cfg.shell || true,
			input: text,
		});
		if (res.stderr.length) {
			throw new Error(res.stderr.toString());
		}

		return res.stdout.toString();
	}

	private doPanelStuff() { // I'm the best with names
		if (this.cfg.autoClearConsole) this.chan.clear();
		if (this.cfg.showOutput) this.chan.show(true);
	}
}
