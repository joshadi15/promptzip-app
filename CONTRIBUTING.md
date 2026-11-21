# Contributing to PromptZip

Thanks for helping improve PromptZip. This repository is currently private, so pull requests require repository access. Once access is available, use an issue or pull request to describe the change.

## Development

1. Install dependencies with `npm install`.
2. Run the app with `npm run dev` and open <http://localhost:3000/>.
3. Keep changes focused and include a short explanation of the user-facing behavior.
4. Run `npm run check` before opening a pull request. Add or update tests for changed compression, token counting, or file processing behavior when appropriate.
5. Include steps to reproduce bugs and, for UI changes, a screenshot or brief description of what changed.

Do not commit API keys, credentials, personal prompts, or uploaded user files. Avoid sending sample prompts containing sensitive data in issues or pull requests.

## Pull requests

- Describe the problem, your approach, and how you verified the change.
- Link a relevant issue if one exists.
- Preserve browser-based processing and explain any new network request or data storage.
- Keep documentation in [English](README.md) and [Bahasa Indonesia](README.id.md) in sync when the documented behavior changes.

Contributions submitted to this repository are licensed under [AGPL-3.0-only](LICENSE). Submit only code and assets you have the right to contribute. For security issues, follow [SECURITY.md](SECURITY.md) instead of opening an issue.
