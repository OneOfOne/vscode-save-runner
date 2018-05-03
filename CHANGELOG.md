# Change Log

## v1.2.0 - 2018-05-03

### New Features and Enhancements

* Complete rewrite.
* It now uses diffs for pre-save commands to handle partial updates (for example running a custom linter) more efficently.
* Renamed before/after to pre.
* Config is name in the form of `save-runner.xxx` rather than a sub-object.
* Each command has an `enabled` option to easily toggle them.
