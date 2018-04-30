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

```

* **TODO:** make this section human readable. *

## Example

Run `eslint --fix` and update the document before saving.

*We have to use [jq](https://stedolan.github.io/jq/) to return the actual fixed document since `eslint` doesn't support it directly.*

```json
	"save-runner": {
		"enabled": true,
		"showOutput": true,
		"commands": [
			{
				"match": "\\.[tj]sx?$",
				"useTempFile": true,
				"before": "eslint --fix ${tmpFile}"
			}
			{
				"match": "\\.something.wicked.this.way.comes",
				"useTempFile": false,
				"before": "openssl base64"
			}
		]
	}
```

## Placeholders in commands

* `${tmpFile}`: temp file path when `useTempFile` is set

* `${workspaceRoot}`: workspace root folder
* `${dirname}`: directory name of saved file

* `${file}`: path to the file
* `${ext}`: file extension

* `${basename}`: saved file's basename
* `${basenameNoExt}`: saved file's basename without extension

* `${cwd}`: current working directory

* `${env.{name}}` match environment variable by name

## Links

* [Marketplace](https://marketplace.visualstudio.com/items?itemName=oneofone.save-runner)
* [Source Code](https://github.com/OneOfOne/vscode-save-runner)

## License

[MIT](https://opensource.org/licenses/MIT)
