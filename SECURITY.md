**English** | [Italiano](./SECURITY.it.md)

# Security Policy

## Supported Versions

This project is in active development. Security updates are applied to the latest commit on `master`.

## Reporting a Vulnerability

To report a security vulnerability, open a private issue or contact the maintainer directly.

<!-- TODO: replace with GitHub Security Advisories URL once a remote is configured -->
<!-- https://github.com/OWNER/REPO/security/advisories/new -->

Please include:
- Description of the vulnerability
- Steps to reproduce
- Expected vs actual behavior
- Impact assessment (what an attacker could achieve)

**Response timeline:**
- Acknowledgment: within 72 hours
- Fix for critical issues: within 30 days
- Coordinated public disclosure after the fix is released

## Security Measures Implemented

- **XSS prevention**: all user-visible text is escaped through `escapeHtml()` before rendering (`src/search-utils.js:16`)
- **DOM isolation**: the UI runs inside a closed Shadow DOM, preventing style and script interference from the host page (`content/launcher.js:33`)
- **No global leaks**: the content script is wrapped in an IIFE, exposing no variables to the page scope (`content/launcher.js:3`)
- **Input escaping in regex**: `escapeRegExp()` sanitizes query strings before use in `RegExp` constructors (`src/search-utils.js:28`)
- **Dependency pinning**: `package-lock.json` is committed and `npm ci` is used in CI

## Out of Scope

The following are not considered vulnerabilities for this project:

- Self-XSS (attacks requiring the victim to paste code in their own console)
- Social engineering attacks
- Vulnerabilities in third-party dependencies already publicly disclosed (report these to the upstream maintainer)
- Browser-level security issues (report these to Mozilla)
- Access to data already available through Firefox's built-in UI (tabs, bookmarks, history)

## Acknowledgments

Security researchers who have responsibly disclosed vulnerabilities will be listed here.

---

[Back to README](./README.md)
