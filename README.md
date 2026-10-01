<p align="center">
  <img src="dev/assets/brand/svg/mdvibe-icon.svg" width="80" height="80" alt="MDVibe">
</p>

<h1 align="center">MDVibe</h1>

<p align="center"><strong>Markdown, made calm.</strong></p>

<p align="center">
  A lightweight, fast Markdown viewer for Windows.<br>
  Double-click a <code>.md</code> file and read it — clean, safe, private. Every document opens in its own window.
</p>

<p align="center">
  <a href="https://github.com/satyrdigital/mdvibe/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/satyrdigital/mdvibe?label=release&color=3B5BDB"></a>
  <img alt="Windows 10 | 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-3B5BDB">
  <a href="https://github.com/satyrdigital/mdvibe/actions/workflows/ci.yml"><img alt="Build" src="https://github.com/satyrdigital/mdvibe/actions/workflows/ci.yml/badge.svg"></a>
</p>

<!-- Hero screenshot goes here once available: docs/site/assets/hero-light.png -->

## Features

- **GitHub Flavored Markdown** — tables, task lists, footnotes, alerts, autolinks
- **Readable code** — syntax highlighting, language labels, one-click **Copy**, optional line numbers
- **One window per document** — opening another file never replaces the one you are reading
- **Live reload** — keeps your place while an editor or an AI agent rewrites the file
- **Outline and Recent** in a sidebar that hides completely
- **Find** in the document with match count
- **Reading layouts** — Comfortable, Compact, Wide, Book; font, size, width, margins
- **Page view, Print and Save as PDF** — A4, Letter, Legal or custom, portrait or landscape
- **Light, dark or system theme** — one click in the toolbar or Ctrl+Shift+T
- **English, Ukrainian and Russian interface** — follows the Windows language, switchable any time
- **Private and safe** — works offline, no telemetry, scripts never run, remote images only when you allow them

## Download

Get the latest version from **[Releases](https://github.com/satyrdigital/mdvibe/releases/latest)**:

| File | What it is |
| --- | --- |
| `MDVibe-Setup-x.y.z.exe` | Installer (recommended) |
| `MDVibe-x.y.z-win-x64.zip` | Portable version, no installation |
| `SHA256SUMS.txt` | Checksums |

## Installation

1. Run `MDVibe-Setup-x.y.z.exe`. It installs for the current user — no administrator rights needed.
2. Start MDVibe from the Start menu, or open any `.md` file with it.

Requirements: Windows 10 or 11 with the Microsoft Edge WebView2 Runtime (built into
Windows 11; the installer adds it if missing).

Builds are not code-signed yet, so Windows SmartScreen may show *"Windows protected your PC"*.
Choose **More info → Run anyway** if you downloaded the file from this repository.

## Open With and default app

The installer adds MDVibe to **Open with** for `.md` and `.markdown` files. It never changes
your current default app — you decide:

1. Right-click a `.md` file → **Open with** → **Choose another app**.
2. Pick **MDVibe**, tick **Always use this app to open .md files**, press **OK**.

Uninstalling removes these registrations and leaves your documents untouched.

## Supported Markdown

CommonMark plus the GitHub extensions people actually use:

- headings, emphasis, ~~strikethrough~~, links, autolinks, images
- ordered, unordered and nested lists, task lists `- [x]`
- tables with column alignment
- fenced code blocks with syntax highlighting (35+ languages)
- block quotes and GitHub alerts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`)
- footnotes, horizontal rules, escaping
- embedded HTML such as `<details>`, `<kbd>`, `<sub>`, `<p align="center">` — sanitized

Local links to other Markdown files open in a new window. Links to other local files are
never run.

## Keyboard shortcuts

| Action | Keys |
| --- | --- |
| Open file | Ctrl+O |
| New window | Ctrl+N |
| Find | Ctrl+F · Enter / Shift+Enter |
| Sidebar | Ctrl+Shift+B |
| Reading layout | Ctrl+Shift+L |
| Switch theme | Ctrl+Shift+T |
| Markdown source | Ctrl+U |
| Zoom in / out / reset | Ctrl+= · Ctrl+- · Ctrl+0 |
| Print / Save as PDF | Ctrl+P · Ctrl+Shift+S |
| Reload | F5 |
| Full screen | F11 |
| Settings | Ctrl+, |
| All shortcuts | F1 |

## Privacy

- No telemetry, analytics, ads, accounts or cloud.
- Your documents never leave your computer.
- Remote images are blocked until you allow them, because loading them reveals your IP
  address to the image host.
- Settings and the recent-files list stay on your PC; history can be turned off or cleared.

Found a security problem? Please see [SECURITY.md](SECURITY.md).

## License

The license has not been chosen yet — see [LICENSING.md](LICENSING.md).
Third-party components: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Author

**Andrii Shumak** · [satyr.digital](https://satyr.digital) · satyrdigital@gmail.com

Published by **Satyr Digital**.

Copyright © 2026 Andrii Shumak
