# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release | ✅ |
| Older releases | ❌ — please update first |

## Reporting a vulnerability

Please do not report security vulnerabilities in public issues, discussions or
pull requests, and do not publish exploit details before a fix is available.

Report privately through GitHub: **Security → Report a vulnerability** in this
repository.

Please include:

- MDVibe version;
- operating system and version;
- impact — what an attacker can achieve;
- reproduction steps;
- a minimal Markdown file or proof of concept, if applicable.

Reports are reviewed as time permits. Thank you for helping keep MDVibe users safe.

## Scope

In scope: anything that lets an opened document run code, read or send data,
launch programs, navigate the app or bypass the privacy defaults (for example,
loading remote content without consent), as well as installer and
file-association issues.

MDVibe treats every opened document as untrusted: embedded HTML is sanitized,
scripts are blocked by a strict Content Security Policy, only web and e-mail
links are handed to the system, and local files other than Markdown are never
executed.
