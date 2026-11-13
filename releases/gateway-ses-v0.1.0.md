---
date: 2026-11-13
---

### Added

- The Amazon SES gateway: a Lambda function that receives mail for a domain through SES and an S3 bucket, keeps it in a libSQL database and sends through SES. Its addresses connect to Metis with mailbox tokens, like the Cloudflare Email and Resend gateways.
- Each release is published as `gateway-ses.zip` under `https://sh.trymetis.email/gateway-ses/vVERSION/`, listed in that folder's `SHA256SUMS`, and `metis add gateway-ses` deploys the newest release.
