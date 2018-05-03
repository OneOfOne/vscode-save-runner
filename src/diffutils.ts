// based on vscode-go code, formatted better (tm).

import { Position, Range, TextEdit, Uri, WorkspaceEdit, TextEditorEdit } from 'vscode';

import jsDiff = require('diff');

export enum EditTypes { EDIT_DELETE, EDIT_INSERT, EDIT_REPLACE }

export class Edit {
	action: number;
	start: Position;
	end?: Position;
	text: string;

	constructor(action: number, start: Position) {
		this.action = action;
		this.start = start;
		this.text = '';
	}

	// Creates TextEdit for current Edit
	apply(): TextEdit | null {
		switch (this.action) {
			case EditTypes.EDIT_INSERT:
				return TextEdit.insert(this.start, this.text);

			case EditTypes.EDIT_DELETE:
				return TextEdit.delete(new Range(this.start, this.end!));

			case EditTypes.EDIT_REPLACE:
				return TextEdit.replace(new Range(this.start, this.end!), this.text);
		}
		return null;
	}

	// Applies Edit using given TextEditorEdit
	applyUsingTextEditorEdit(editBuilder: TextEditorEdit): void {
		switch (this.action) {
			case EditTypes.EDIT_INSERT:
				editBuilder.insert(this.start, this.text);
				break;

			case EditTypes.EDIT_DELETE:
				editBuilder.delete(new Range(this.start, this.end!));
				break;

			case EditTypes.EDIT_REPLACE:
				editBuilder.replace(new Range(this.start, this.end!), this.text);
				break;
		}
	}

	// Applies Edits to given WorkspaceEdit
	applyUsingWorkspaceEdit(workspaceEdit: WorkspaceEdit, fileUri: Uri): void {
		switch (this.action) {
			case EditTypes.EDIT_INSERT:
				workspaceEdit.insert(fileUri, this.start, this.text);
				break;

			case EditTypes.EDIT_DELETE:
				workspaceEdit.delete(fileUri, new Range(this.start, this.end!));
				break;

			case EditTypes.EDIT_REPLACE:
				workspaceEdit.replace(fileUri, new Range(this.start, this.end!), this.text);
				break;
		}
	}
}

export interface FilePatch {
	fileName: string;
	edits: Edit[];
}

/**
 * Uses diff module to parse given array of IUniDiff objects and returns edits for files
 *
 * @param diffOutput jsDiff.IUniDiff[]
 *
 * @returns Array of FilePatch objects, one for each file
 */
function parseUniDiffs(diffOutput: jsDiff.IUniDiff[]): FilePatch[] {
	const filePatches: FilePatch[] = [];
	diffOutput.forEach((uniDiff: jsDiff.IUniDiff) => {
		const edits: Edit[] = [];
		let edit: Edit;

		uniDiff.hunks.forEach((hunk: jsDiff.IHunk) => {
			let startLine = hunk.oldStart;
			hunk.lines.forEach((line) => {
				switch (line.substr(0, 1)) {
					case '-':
						edit = new Edit(EditTypes.EDIT_DELETE, new Position(startLine - 1, 0));
						edit.end = new Position(startLine, 0);
						edits.push(edit);
						startLine++;
						break;
					case '+':
						edit = new Edit(EditTypes.EDIT_INSERT, new Position(startLine - 1, 0));
						edit.text += line.substr(1) + '\n';
						edits.push(edit);
						break;
					case ' ':
						startLine++;
						break;
				}
			});
		});

		const fileName = uniDiff.oldFileName;
		filePatches.push({ fileName, edits });
	});

	return filePatches;
}

/**
 * Returns a FilePatch object by generating diffs between given oldStr and newStr using the diff module
 *
 * @param fileName string: Name of the file to which edits should be applied
 * @param oldStr string
 * @param newStr string
 *
 * @returns A single FilePatch object
 */
export function getEdits(fileName: string, oldStr: string, newStr: string): FilePatch {
	let o = oldStr,
		n = newStr;

	if (process.platform === 'win32') {
		o = o.split('\r\n').join('\n');
		n = n.split('\r\n').join('\n');
	}

	const unifiedDiffs = jsDiff.structuredPatch(fileName, fileName, o, n, '', '');
	const filePatches = parseUniDiffs([unifiedDiffs]);

	return filePatches[0];
}

/**
 * Uses diff module to parse given diff string and returns edits for files
 *
 * @param diffStr : Diff string in unified format. http://www.gnu.org/software/diffutils/manual/diffutils.html#Unified-Format
 *
 * @returns Array of FilePatch objects, one for each file
 */
export function getEditsFromUnifiedDiffStr(diffstr: string): FilePatch[] {
	const unifiedDiffs: jsDiff.IUniDiff[] = jsDiff.parsePatch(diffstr);
	const filePatches: FilePatch[] = parseUniDiffs(unifiedDiffs);
	return filePatches;
}
