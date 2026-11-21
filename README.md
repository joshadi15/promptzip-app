# PromptZip

[Open PromptZip website](https://promptzip-web.pages.dev/) · [Website source](https://github.com/joshadi15/promptzip-web)


[English](README.md) · [Bahasa Indonesia](README.id.md)

PromptZip helps you shorten prompts and inspect the token difference before sending them. The app opens directly on **Compressor** and runs its compression and instant checks in your browser.

## Features

- **Compressor:** compare the original and compressed text, inspect changes, and copy the result.
- **Algorithms:** compare six compression approaches on your current prompt.
- **Prompt Review:** check wording and constraints; optionally review text with a local Qwen model through Ollama.
- **CLI & Formats:** format prompts and copy commands for tools you already have installed. This does not install or download a CLI.
- **Files:** process supported spreadsheets, PDFs, and images in your browser.

Token savings are estimates using the selected GPT tokenizer. Check the compressed result before using it; a lower token count does not guarantee the same meaning or the same token count in every model.

## Run locally

Requires a recent Node.js release compatible with Vite 8 and npm.

```sh
npm install
npm run dev
```

Open <http://localhost:3000/>. To check or build the app:

```sh
npm run check
npm run build
```

The production build is a static site in `dist/`.

## Optional local model

Instant checks work without a model. For Qwen review, install [Ollama](https://ollama.com/download), run `ollama pull qwen3.5:4b`, then use the review control in Prompt Review. A hosted HTTPS page may be unable to contact Ollama on your device because of browser origin or local network restrictions; the local build is an alternative.

## Data

Compression and file processing run in the browser. Your prompt, saved snapshots, theme, and tokenizer preference use browser local storage. Some drafts and uploaded instruction text use session storage; uploaded file content is processed in memory. Optional Qwen review sends selected text to Ollama at `localhost` when you run it. The interface also loads Google Fonts. Clear browser data to remove local drafts and saved prompts.

## Contribute and report issues

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull requests. Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 joshadi15. Licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). You may use, modify, and share the app under that license. When you distribute a modified version, provide its corresponding source under the same license; when you run a modified version for users over a network, offer those users its corresponding source. See the full license for the precise terms.
