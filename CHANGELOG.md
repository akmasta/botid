# Changelog

## 0.1.0

Initial release.

- Ed25519 identity signing for AI agents (`BotIDClient`, `BotID.init()`)
- Express middleware for verifying incoming bot requests (`verifyBotID`)
- CLI for GitHub-authenticated registration (`botid login`, `botid init`)
- Revocation support — middleware detects and blocks revoked bots
- Replay protection — 5-minute timestamp window enforced in middleware
- Credential storage in `~/.botid/` with restrictive file permissions
- Dual CJS/ESM build via tsup
