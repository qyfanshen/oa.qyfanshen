# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. Please **do not** open a public issue for security
vulnerabilities.

Instead, report vulnerabilities privately via:

- **Email**: <admin@qyfanshen.com>
- **WeChat**: scan the QR code in the README

Please include:

1. A description of the vulnerability and its impact
2. Steps to reproduce
3. Affected versions
4. Any suggested fixes (optional)

We will respond within **48 hours** and work with you to resolve the issue.
Thank you for helping to keep this project secure.

## Security Best Practices

This project follows these security practices:

- HTTPS is enforced (301 redirect)
- Security headers: CSP / X-Frame-Options / Referrer-Policy / Permissions-Policy
- Sensitive files (`.env`, `*.bak.*`, `storage/`, `.user.ini`) are excluded from
  the repository via `.gitignore` and denied at the web-server level
- API rate limiting and CSRF token validation
- Dependencies are kept up to date via CI
