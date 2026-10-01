# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release | ✅ |
| Older releases | ❌ — please update first |

## Reporting a vulnerability

Please **do not** report security problems in public issues, discussions or
pull requests, and do not publish exploit details before a fix is available.

Report privately:

- GitHub: **Security → Report a vulnerability** in this repository (private advisory), or
- e-mail: **satyrdigital@gmail.com** with the subject "MDVibe security".

Please include:

- MDVibe version and Windows version;
- what an attacker can achieve and the steps to reproduce;
- a minimal Markdown file or proof of concept, if possible.

I aim to acknowledge reports within 5 working days and to agree on a
disclosure date once a fix is ready. Thank you for helping keep MDVibe users safe.

## Scope

In scope: anything that lets an opened document run code, read or send data,
launch programs, navigate the app or bypass the privacy defaults (for example,
loading remote content without consent), as well as installer and
file-association issues.

MDVibe treats every opened document as untrusted: embedded HTML is sanitized,
scripts are blocked by a strict Content Security Policy, only web and e-mail
links are handed to the system, and local files other than Markdown are never
executed.
