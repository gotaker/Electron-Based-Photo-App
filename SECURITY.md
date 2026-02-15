# Security Policy

## Supported Versions

We take security seriously and actively maintain the following versions of PhotoVault:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Updates

We regularly update dependencies to address security vulnerabilities. Our commitment includes:

- **Monthly dependency audits** to identify and patch security issues
- **Immediate response** to critical security vulnerabilities
- **Transparent communication** about security updates through release notes

### Recent Security Improvements

- **February 2026**: Updated multer from 1.4.5 to 2.0.x to address known vulnerabilities
- **February 2026**: Updated Express to 4.22.x for latest security patches
- **February 2026**: Updated electron-store to 10.x for improved security

## Reporting a Vulnerability

We appreciate responsible disclosure of security vulnerabilities. If you discover a security issue, please follow these steps:

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Email security reports to: **security@photovault.example.com** (replace with your actual security contact)
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Suggested fix (if available)

### What to Expect

- **Acknowledgment**: Within 48 hours of your report
- **Initial Assessment**: Within 5 business days
- **Status Updates**: Every 7 days until resolution
- **Resolution Timeline**: Critical issues within 30 days, others within 90 days

### Response Process

1. We will acknowledge receipt of your vulnerability report
2. We will investigate and validate the issue
3. We will develop and test a fix
4. We will release a security update
5. We will publicly acknowledge your responsible disclosure (with your permission)

## Security Best Practices

### For Users

- **Keep PhotoVault Updated**: Always use the latest version
- **Enable Auto-Updates**: Ensure automatic updates are enabled
- **Secure Your Files**: Use strong passwords for encrypted storage
- **Review Permissions**: Only grant necessary file system permissions
- **Backup Regularly**: Maintain regular backups of your photo library

### For Developers

- **Dependency Management**: Run `npm audit` regularly
- **Secure Coding**: Follow OWASP guidelines for secure development
- **Code Review**: All code changes require security review
- **Input Validation**: Validate and sanitize all user inputs
- **Authentication**: Use secure authentication mechanisms for Azure integration

## Known Security Considerations

### File Upload Security

PhotoVault uses multer 2.x for file uploads with the following protections:

- File type validation
- File size limits
- Sanitized file names
- Secure temporary storage

### Data Storage

- Local data stored using electron-store with encryption support
- Azure Blob Storage integration uses secure HTTPS connections
- No sensitive credentials stored in plain text

### Network Security

- All Azure API calls use HTTPS
- TLS 1.2 or higher required for all connections
- API keys and secrets stored securely in environment variables

## Security Checklist for Releases

Before each release, we verify:

- [ ] All dependencies are up to date
- [ ] `npm audit` shows zero high/critical vulnerabilities
- [ ] Security tests pass
- [ ] Code has been reviewed for security issues
- [ ] Secure configuration defaults are in place
- [ ] Documentation includes security guidance

## Security Tools We Use

- **npm audit**: Automated dependency vulnerability scanning
- **Dependabot**: Automated dependency updates
- **GitHub Security Advisories**: Monitoring for known vulnerabilities
- **OWASP ZAP**: Security testing for web components

## Third-Party Security

We rely on the following third-party services and maintain their security:

- **Electron**: Cross-platform desktop framework
- **Azure Blob Storage**: Cloud storage provider
- **Express**: Web application framework
- **Node.js**: Runtime environment

We monitor security advisories for all third-party dependencies and apply updates promptly.

## Compliance

PhotoVault is designed with privacy and security in mind:

- **Data Ownership**: Users maintain full control of their data
- **Privacy**: No analytics or tracking without explicit consent
- **Transparency**: Open-source codebase for security review

## Security Contact

For security-related questions or concerns:

- **Email**: security@photovault.example.com
- **PGP Key**: [Link to PGP public key if applicable]
- **Response Time**: Within 48 hours

## Updates to This Policy

This security policy is reviewed and updated quarterly. Last updated: February 2026

---

## Acknowledgments

We thank the security research community for helping keep PhotoVault secure. Contributors who responsibly disclose vulnerabilities will be acknowledged in our Hall of Fame (with permission).

### Security Hall of Fame

Contributors who have helped improve PhotoVault's security:

- [Future contributors will be listed here]

---

**Remember**: Security is a shared responsibility. If you see something, say something.
