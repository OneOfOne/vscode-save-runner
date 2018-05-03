import * as vscode from 'vscode';
import * as path from 'path';
import * as tmp from 'tmp';
import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { getEdits } from './diffutils';

interface Command {
	// regexp match, example: "\\.[tj]sx?$"
	match?: string;

	// regexp negative match, example: "do-not-lint-this.ts"
	notMatch?: string;

	// useTempFile instead of pipes, defaults to the global useTempFile
	useTempFile?: boolean;

	// command(s) to run before the document is saved to disk
	before: string | string[];

	// command(s) to run after the document is saved to disk
	after: string | string[];
	// run after commands async, defaults to global isAsync;
	isAsync?: boolean;
}

interface Config extends vscode.WorkspaceConfiguration {
	enabled?: boolean;
	showOutput?: boolean;
	shell?: string;
	autoClearConsole?: boolean;
	useTempFile?: boolean;
	isAsync?: boolean;

	commands?: Command[];
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

	runBeforeSave = async (e: vscode.TextDocumentWillSaveEvent) => {
		if (!this.cfg.enabled) return;

		const { document: doc } = e,
			cmds = this.getCommands(doc, true);

		if (!cmds.length) return;

		this.doPanelStuff();

		this.log('Running before-save commands...');

		const edits = await this.getEdits(doc, cmds);
		const applied = await vscode.workspace.applyEdit(edits);

		this.log(`${applied}: ${JSON.stringify(edits, null, '\t')}`);

		// let out = doc.getText(),
		// 	tempFile!: tmp.SynchrounousResult;

		// const len = out.length;

		// for (const cmd of cmds) {
		// 	if (cmd.useTempFile && tempFile == null) tempFile = this.makeTempFile(out, doc.fileName);
		// 	const tmpFile = tempFile ? tempFile.name : '';

		// 	let cps = cmd.before;
		// 	if (!Array.isArray(cps)) cps = [cps];

		// 	for (let cp of cps) {
		// 		cp = this.expandVars(doc, cp, tmpFile);

		// 		this.log(`\n- ${cp}`);

		// 		try {
		// 			if (cmd.useTempFile) {
		// 				out = this.exec(cp, out);
		// 			} else {
		// 				this.exec(cp);
		// 			}
		// 		} catch (err) {
		// 			this.log(`! ${cp} ${err}`);
		// 			break;
		// 		}
		// 	}
		// }

		// if (tempFile) {
		// 	out = readFileSync(tempFile.name).toString();
		// 	tempFile.removeCallback();
		// }

		// const range = new vscode.Range(0, 0, doc.lineCount, len);

		// const editor = vscode.window.visibleTextEditors.find((te) => {
		// 	const d = e.document;
		// 	this.log(`${d.fileName} : ${doc.fileName}`);
		// 	return d.fileName === doc.fileName;
		// });

		// const edits = getEdits(doc.fileName, doc.getText(), out);
		// this.log(JSON.stringify(edits, null, '\t'));

		// if (!editor) {
		// 	this.log('could not get an active editor, refusing to run commands.');
		// } else {
		// 	e.waitUntil(editor.edit((te) => te.replace(range, out)));
		// }

		this.log('\nDone running.\n');
	}

	private async getEdits(doc: vscode.TextDocument, cmds: Command[]): Promise<vscode.WorkspaceEdit> {
		let out = doc.getText(),
			tempFile!: tmp.SynchrounousResult;

		for (const cmd of cmds) {
			if (cmd.useTempFile && tempFile == null) tempFile = this.makeTempFile(out, doc.fileName);
			const tmpFile = tempFile ? tempFile.name : '';

			let cps = cmd.before;
			if (!Array.isArray(cps)) cps = [cps];

			for (let cp of cps) {
				cp = this.expandVars(doc, cp, tmpFile);

				this.log(`\n- ${cp}`);

				try {
					if (cmd.useTempFile) {
						out = this.exec(cp, out);
					} else {
						this.exec(cp);
					}
				} catch (err) {
					this.log(`! ${cp} ${err}`);
					break;
				}
			}
		}

		if (tempFile) {
			out = readFileSync(tempFile.name).toString();
			tempFile.removeCallback();
		}

		const results = new vscode.WorkspaceEdit(),
			fileUri = vscode.Uri.file(doc.fileName),
			{ edits } = getEdits(doc.fileName, doc.getText(), out);

		for (const e of edits) {
			e.applyUsingWorkspaceEdit(results, fileUri);
		}

		return results;
	}

	runAfterSave = (doc: vscode.TextDocument) => {
		if (!this.cfg.enabled) return;

		const cmds = this.getCommands(doc),
			{ isAsync } = this.cfg;

		if (!cmds.length) return;

		this.doPanelStuff();

		this.log('Running after-save commands...');

		for (const cmd of cmds) {
			let cps = cmd.before;
			if (!Array.isArray(cps)) cps = [cps];

			for (const cp of cps) {
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
		this.cfg = {
			...cfg,
			commands: cfg.commands || [],
			enabled: cfg.enabled == null ? true : cfg.enabled,
			isAsync: cfg.isAsync == null ? true : cfg.isAsync,
			useTempFile: cfg.useTempFile == null ? true : cfg.useTempFile,
		};

		this.log(`Current Config: \n${JSON.stringify(this.cfg, null, '\t')}`);
	}

	private getCommands(doc: vscode.TextDocument, before?: boolean) {
		const { isAsync, useTempFile } = this.cfg;
		let cmds = this.cfg.commands!.filter((cmd) => {
			if (before) return !!cmd.before;
			return !!cmd.after;
		});

		const match = (pattern: string) => !!pattern && new RegExp(pattern).test(doc.fileName);

		cmds = cmds.filter((cmd) => {
			const isMatch = !cmd.match || match(cmd.match);
			const isNeg = cmd.notMatch && match(cmd.notMatch);

			return !isNeg && isMatch;
		});

		return cmds.map((cmd) => ({
			...cmd,
			useTempFile: cmd.useTempFile == null ? useTempFile : cmd.useTempFile,
			isAsync: cmd.isAsync == null ? isAsync : cmd.isAsync,
		}));
	}

	// shamelessly copied from https://github.com/emeraldwalk/vscode-runonsave/blob/master/src/extension.ts
	private expandVars(doc: vscode.TextDocument, cmd: string, tmpFile: string = '') {
		const extName = path.extname(doc.fileName);

		let fixed = cmd.replace(/\${file}/g, `${doc.fileName}`);
		fixed = fixed.replace(/\${ext}/g, `${extName}`);
		fixed = fixed.replace(/\${tmpFile}/g, `${tmpFile}`);
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

	private makeTempFile(text: string, fn: string): tmp.SynchrounousResult {
		const ext = path.extname(fn);
		const f = tmp.fileSync({
			discardDescriptor: true,
			mode: 0o644,
			postfix: ext,
		});
		writeFileSync(f.name, text);
		return f;
	}
}
