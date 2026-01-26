# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously at Smuppy. If you discover a security vulnerability, please follow these steps:

### Do NOT

- Open a public GitHub issue
- Disclose the vulnerability publicly before it's fixed
- Test vulnerabilities on production systems

### Do

1. **Email us** at security@smuppy.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

2. **Wait for acknowledgment** - We'll respond within 48 hours

3. **Allow time for fix** - We aim to fix critical issues within 7 days

### What to Expect

- Acknowledgment within 48 hours
- Regular updates on progress
- Credit in our security acknowledgments (if desired)
- No legal action for responsible disclosure

## Security Measures

### Authentication
- AWS Cognito with MFA support
- Secure token storage (expo-secure-store)
- Password policy: 10+ chars, symbols required

### Data Protection
- TLS 1.2+ for all connections
- Data encrypted at rest (AES-256)
- PII automatically masked in logs

### Infrastructure
- AWS WAF with 8 security rules
- Rate limiting (10,000 req/5min)
- VPC isolation with private subnets
- Secrets Manager for credentials

### Code Security
- Parameterized SQL queries
- Input validation and sanitization
- SAST scanning in pre-commit hooks
- Dependabot for dependency updates

## Bug Bounty

We currently do not have a formal bug bounty program, but we appreciate and acknowledge security researchers who help us improve.
