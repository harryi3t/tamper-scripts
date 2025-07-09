# Tamper Scripts

A collection of Tampermonkey userscripts and remote loaders for customizing and automating web-based workflows.

## Introduction

This repository contains a set of Tampermonkey userscripts to enhance various web-based tooling. Each script has two components:

1. `src/<slug>.js` – The actual userscript code.
2. `<slug>-remote.js` – A remote loader that `@require`s the script from `src/` for live-reload development.

Available scripts:

- **buildkite-first-run-report** – Generates a report for the first Buildkite run of a pipeline.
- **github-pr-first-run-report** – Adds a summary report on the first load of a GitHub Pull Request.
- **sentry-copy-on-call** – Provides a one-click copy button for event contexts in Sentry.

## Directory Structure

```bash
.
├── src
│   ├── some-script.js
│   some-script-remote.js
```

## Usage

1. Install Tampermonkey in your browser.
2. Create a new script in Tampermonkey and replace its content with the remote loader file for your desired script.
3. Refresh the target page to see the script in action. Any edits to `src/<slug>.js` will be reflected on reload.

## Development

- Modify the code in `src/<slug>.js`.
- Reload the script in Tampermonkey to apply changes immediately.

## Contributing

Contributions are welcome! Feel free to open issues, feature requests, or pull requests.
