# Save Runner for Visual Studio Code

This extension allows configuring commands that get run whenever a file is about to be saved or after it gets saved to disk.

This extension is heavily inspired by [emeraldwalk.runonsave](https://marketplace.visualstudio.com/items?itemName=emeraldwalk.RunOnSave) and
eslint extension's lack of proper fixing on save.

## Features

* Preprocess the document and save the processed results.
* Pipe the document to multiple preprocessors.
* Use a temp file for before-save commands that doesn't support pipes.
* Regex pattern matching for files that trigger commands running.
* Sync and async support for after save commands.

## Configuration

```ts
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
```

* **TODO:** make this section human readable. *

## Example

Run `eslint_d --fix` and update the document before saving.

```json
	"save-runner.enabled": true,
	"save-runner.commands": [
		{
			"enabled": true,

			"include": "\\.[tj]sx?$",
			"exclude": "/node_modules/",

			"useTempFile": true,
			"isAsync": false,

			"pre": "eslint_d --fix ${tmpFile}",
			"post": "echo saved ${relname}"
		}
	]
```

## Placeholders in commands

* `${tmpFile}`: temp file path when `useTempFile` is set

* `${workspaceRoot}`: workspace root folder

* `${file}`: full path to the file
* `${relname}`: path to the file without the workspace path.
* `${ext}`: file extension

* `${dirname}`: directory name of saved file
* `${basename}`: saved file's basename
* `${basenameNoExt}`: saved file's basename without extension

* `${cwd}`: current working directory

* `${env.**name**}` match environment variable by name

## Links

* [Marketplace](https://marketplace.visualstudio.com/items?itemName=oneofone.save-runner)
* [Source Code](https://github.com/OneOfOne/vscode-save-runner)

## License

[MIT](https://opensource.org/licenses/MIT)
