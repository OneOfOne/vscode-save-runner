import * as vscode from 'vscode';
import * as path from 'path';
import * as tmp from 'tmp';
import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { getEdits } from './diffutils';

interface Command {
	enabled?: boolean; // default false
	include?: string; // regexp to match the file names
	exclude?: string; // regexp to exclude file names

	// use a tempfile on pre-save, pass ${tmpFile} to the commands.
	useTempFile?: boolean; // default true

	// run post-save commands async.
	isAsync?: boolean; // default false

	// commands to run before the document is saved, the documen will be replaced with the stdout of the command chain.
	// if useTempFile is false, the document will be piped to the commands.
	pre: string | string[];

	// commands to run after the file is successfully saved to disk.
	post: string | string[];
}

interface Config extends vscode.WorkspaceConfiguration {
	enabled: boolean; // default false

	// show the output panel on updates
	showOutput: boolean; // default false

	// execute pre/post commands under the specified shell.
	shell: string; // default ''

	// auto clear the output channel before running commands.
	autoClearOutput: boolean;

	// commands to run
	commands: Command[];
}

/* eslint no-await-in-loop:0 */

export default class SaveRunner {
	private chan: vscode.OutputChannel;
	private cfg!: Config;
	private running = false;

	constructor(private ctx: vscode.ExtensionContext) {
		this.ctx = ctx;
		this.chan = vscode.window.createOutputChannel('Save Runner');

		this.loadConfig();
	}

	start() {
		const disposables = [
			vscode.workspace.onWillSaveTextDocument(this.runPreSave),
			vscode.workspace.onDidSaveTextDocument(this.runPostSave),
			vscode.workspace.onDidChangeConfiguration(() => this.loadConfig()),
			this.chan,
		];

		this.ctx.subscriptions.push(...disposables);
	}

	runPreSave = async (e: vscode.TextDocumentWillSaveEvent) => {
		if (!this.cfg.enabled) return;

		const { document: doc } = e,
			cmds = this.getCommands(doc, true);

		if (!cmds.length) return;

		this.doPanelStuff();

		this.log('Running pre-save commands...');
		const edits = await this.getEdits(doc, cmds);
		vscode.workspace.applyEdit(edits);
		this.log('Done.\n');
		this.running = false;
	}

	runPostSave = async (doc: vscode.TextDocument) => {
		if (!this.cfg.enabled) return;

		const cmds = this.getCommands(doc),
			{ isAsync } = this.cfg;

		if (!cmds.length) return;

		this.doPanelStuff();

		this.log('Running post-save commands...');

		for (const cmd of cmds) {
			let cps = cmd.post;
			if (!Array.isArray(cps)) cps = [cps];

			for (let cp of cps) {
				cp = this.expandVars(doc.fileName, cp);

				const p = this.exec(cp);

				if (isAsync) {
					p.then((output) => {
						this.log(`- ${cp}`);
						this.log(output);
					}).catch((err) => this.log(`! ${cp} ${err}`));
					continue;
				}

				try {
					this.log(`- ${cp}`);
					this.log(await p);
				} catch (err) {
					this.log(`! ${cp} ${err}`);
				}
			}
		}

		this.log('Done.\n');
		this.running = false;
	}

	log(line: string | Object) {
		if (typeof line === 'string') {
			this.chan.appendLine(line.trim());
			return;
		}

		this.chan.appendLine(JSON.stringify(line, null, '\t'));
	}

	private loadConfig() {
		const cfg = vscode.workspace.getConfiguration('save-runner') as Config;
		// cfg = vscode.workspace.getConfiguration('save-runner') as Config;
		const commands = (cfg.commands || []).map((cmd: Command) => ({
			...cmd,
			useTempFile: cmd.useTempFile == null ? true : cmd.useTempFile,
			isAsync: cmd.isAsync == null ? false : cmd.isAsync,
		}));

		this.cfg = {
			...cfg,
			commands,
		};

		this.log(`Using: ${JSON.stringify(this.cfg, null, '\t')}`);
	}

	private getCommands(doc: vscode.TextDocument, pre?: boolean): Command[] {
		const match = (pattern: string) => !!pattern && new RegExp(pattern).test(doc.fileName);

		return this.cfg.commands
			.filter((cmd) => {
				const isNeg = cmd.exclude && match(cmd.exclude);
				if (isNeg) return false;

				return !cmd.include || match(cmd.include);
			})
			.filter((cmd) => {
				if (!cmd.enabled) return false;
				return pre ? !!cmd.pre : !!cmd.post;
			});
	}

	// shamelessly copied from https://github.com/emeraldwalk/vscode-runonsave/blob/master/src/extension.ts
	private expandVars(file: string, cmd: string, tmpFile: string = '') {
		const ext = path.extname(file),
			wsRoot = vscode.workspace.rootPath || '';

		const replaces: {[k: string]: string} = {
			file,
			ext,
			tmpFile,
			workspaceRoot: wsRoot,
			basename: path.basename(file),
			dirname: path.dirname(file),
			relname: '.' + file.replace(wsRoot, ''),
			basenameNoExt: path.basename(file, ext),
			cwd: process.cwd(),
		};

		let expanded = cmd;

		for (const k of Object.keys(replaces)) {
			expanded = expanded.replace(new RegExp('\\${' + k + '}', 'g'), replaces[k]);
		}

		// replace environment variables ${env.Name}
		expanded = expanded.replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => process.env[envName]);

		return expanded;
	}

	private async exec(cmd: string, text?: string): Promise<string> {
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
		if (this.cfg.autoClearOutput && !this.running) this.chan.clear();
		if (this.cfg.showOutput) this.chan.show(true);
		this.running = true;
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

	private async getEdits(doc: vscode.TextDocument, cmds: Command[]): Promise<vscode.WorkspaceEdit> {
		let out = doc.getText(),
			tempFile!: tmp.SynchrounousResult;

		const origText = out;

		for (const cmd of cmds) {
			if (cmd.useTempFile && tempFile == null) tempFile = this.makeTempFile(out, doc.fileName);
			const tmpFile = tempFile ? tempFile.name : '';

			let cps = cmd.pre;
			if (!Array.isArray(cps)) cps = [cps];

			for (let cp of cps) {
				cp = this.expandVars(doc.fileName, cp, tmpFile);

				this.log(`- ${cp}`);

				if (!cmd.useTempFile) {
					out = await this.exec(cp, out);
				} else {
					await this.exec(cp);
				}
			}
		}

		if (tempFile) {
			out = readFileSync(tempFile.name).toString();
			tempFile.removeCallback();
		}

		const results = new vscode.WorkspaceEdit(),
			{ edits } = getEdits(doc.fileName, origText, out);

		for (const e of edits) {
			e.applyUsingWorkspaceEdit(results, doc.uri);
		}

		return results;
	}
}
