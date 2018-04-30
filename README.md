# Save Runner for Visual Studio Code

This extension allows configuring commands that get run whenever a file is about to be saved or after it gets saved to disk.

This extension is heavily inspired by [emeraldwalk.runonsave](https://marketplace.visualstudio.com/items?itemName=emeraldwalk.RunOnSave) and
eslint extension's lack of proper fixing on save.

## Features

* Preprocess the document and save the processed results.
* Pipe the document to multiple preprocessors.
* Regex pattern matching for files that trigger commands running.
* Sync and async support for after save commands.

## Configuration

```ts
interface Command {
	match?: string;
	notMatch?: string;
	// each command's output will be piped to the next one,
	// the final result will replace the current editor.
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
```

* **TODO:** make this section human readable. *

## Example

Run `eslint --fix` and update the document before saving.

*We have to use [jq](https://stedolan.github.io/jq/) to return the actual fixed document since `eslint` doesn't support it directly.*

```json
save-runner": {
	"enabled": true,
	"showOutput": true,
	"commands": [
		{
			// match ts, js, tsx, jsx files.
			"match": "\.[tj]sx?$",
			"before": [
				"eslint --stdin --ext ${ext} --fix-dry-run --format=json",
				"jq -r '.[0].output'"
			],
		}
	]
}
```

## Placeholders in commands

* `${workspaceRoot}`: workspace root folder
* `${file}`: path of saved file
* `${ext}`: file extension
* `${basename}`: saved file's basename
* `${basenameNoExt}`: saved file's basename without extension
* `${dirname}`: directory name of saved file
* `${cwd}`: current working directory

### Environment Variable Tokens

* `${env.Name}`

## Links

* [Marketplace](https://marketplace.visualstudio.com/items?itemName=oneofone.save-runner)
* [Source Code](https://github.com/OneOfOne/vscode-save-runner)

## License

[MIT](https://opensource.org/licenses/MIT)
