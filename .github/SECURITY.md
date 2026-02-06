# Security Policy

## Reporting a Vulnerability

BotID is a cryptographic identity SDK — we take security seriously.

If you discover a security vulnerability, **please do not open a public issue.** Instead, report it privately:

**Email:** security@botid.net

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (if known)
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Scope

Security issues we care about:
- Signature forgery or bypass
- Private key exposure
- Replay attacks bypassing the timestamp window
- Authentication bypass in the device flow
- Command injection or code execution
- Credential storage vulnerabilities

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Responsible Disclosure

We follow responsible disclosure. If you report a vulnerability, we will:
1. Confirm the issue and determine its severity
2. Develop and test a fix
3. Release a patched version
4. Credit you in the release notes (unless you prefer anonymity)
