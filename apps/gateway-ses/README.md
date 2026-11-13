# metis-ses-mail — Amazon SES backend for Metis Suite

A gateway per domain that runs as an AWS Lambda function. Amazon SES receives
mail for the domain, writes each raw message to an S3 bucket and invokes the
function, which indexes the message in a libSQL database. The same function
serves the `/v1/*` API Metis Suite's gateway client speaks through a Lambda
function URL, and sends through the SESv2 API. Metis talks to this gateway,
never to AWS.

**One deployment serves many mailboxes.** A receipt rule for the domain
delivers every address to the function. The gateway keeps a message only for
envelope recipients that have a token, storing one row per recipient that all
point at the one raw object in S3; the object is deleted with its last row.
Mail for addresses with no token is deleted from the bucket. Every API token is
scoped to one address; the `API_TOKEN` environment variable is the **admin
token**, which can mint and revoke mailbox tokens (`/v1/tokens`) but never read
mail.

**Spam and virus verdicts.** A message SES marks `FAIL` for spam or viruses is
stored in the Spam folder.

**Sending.** `/v1/send` builds the MIME message and sends it with SESv2
`SendEmail` from the token's own address. SES assigns the `Message-ID`
(`MESSAGE_ID@email.amazonses.com` in us-east-1,
`MESSAGE_ID@REGION.amazonses.com` elsewhere), and the gateway threads the Sent
copy on it.

Like the other gateways, search is SQL `LIKE` (case-insensitive for ASCII
only), threading is synthesized from `References`, folders are app-level
state, and only mail received after setup exists.

## What a deployment needs

Receipt rule sets and rules exist only in the SES v1 API (`aws ses`); the
domain identity, sending and account details use SESv2 (`aws sesv2`).

- **Region:** one of the SES receiving regions: us-east-1, us-east-2,
  us-west-1, us-west-2, ca-central-1, eu-central-1, eu-west-1, eu-west-2,
  eu-west-3, eu-south-1, eu-north-1, ap-south-1, ap-southeast-1,
  ap-southeast-2, ap-southeast-3, ap-northeast-1, ap-northeast-2,
  ap-northeast-3, af-south-1, il-central-1, me-south-1, sa-east-1. The rule
  set, the function and its role live there; the bucket may be in another
  receiving region.
- **Artifact:** `https://sh.trymetis.email/gateway-ses/vVERSION/gateway-ses.zip`,
  listed in that folder's `SHA256SUMS`, where `VERSION` is a `gateway-ses-v`
  release (`gateway-ses/version.txt` names the newest; any release works with
  any Metis server) (or built from this directory with `bun run build`
  and `bun run package`). Handler `index.handler`, runtime `nodejs22.x` or
  `nodejs24.x`, architecture `arm64` or `x86_64` (the zip is plain JavaScript
  and runs on both; `arm64` costs less per GB-second). Timeout 60 seconds,
  memory 1024 MB.
- **Domain:** the domain identity in SESv2 with its three DKIM `CNAME`
  records, and an `MX` record pointing at `inbound-smtp.REGION.amazonaws.com`.
  Write the domain in lowercase everywhere.
- **Production access:** a new account's SES is in the sandbox in each region:
  it sends only to verified addresses, at most 200 messages per 24 hours and 1
  per second. `aws sesv2 get-account` shows `ProductionAccessEnabled`;
  `aws sesv2 put-account-details` requests access, which AWS reviews per
  region. Receiving works in the sandbox.
- **Database:** a libSQL database reachable over HTTP or WebSockets (a `sqld`
  server or Turso), its URL and token, and `bun run db:apply` run against it
  once, and again after an upgrade whose `schema.sql` changed.
- **Bucket:** one S3 bucket for raw mail and attachments, with a bucket policy
  that lets `ses.amazonaws.com` put objects for this account's receipt rule.
- **Function environment variables:**

  | Variable              | Value                                    |
  | --------------------- | ---------------------------------------- |
  | `MAIL_DOMAIN`         | The domain, for example `example.com`    |
  | `API_TOKEN`           | The admin token, `openssl rand -hex 32`  |
  | `DATABASE_URL`        | The libSQL URL (`libsql://`, `https://`) |
  | `DATABASE_AUTH_TOKEN` | The libSQL token                         |
  | `MAIL_BUCKET`         | The bucket name                          |

  `AWS_REGION` comes from the Lambda runtime.

- **Execution role:** `lambda.amazonaws.com` may assume it; it may read,
  write, delete and list objects in the bucket, send as any address on the
  domain, and write its logs (the policy is in step 4 below).
- **Function resource policy:** `ses.amazonaws.com` may invoke the function
  for this account's receipt rule only.
- **Function URL:** auth type `NONE` and invoke mode `RESPONSE_STREAM`, plus
  the public permissions a `NONE` URL needs. The gateway checks its own bearer
  tokens. Streaming lets raw messages and attachments over 6 MB download from
  the same address.
- **Asynchronous invocation:** a retry count and a failure destination for
  receipt events that keep failing; the raw message stays in the bucket
  either way.
- **Rule set:** only one rule set is active per account and region, and
  deactivating it stops all receiving there. The gateway's rule goes into the
  active set; only when none is active is a new one created and activated.
  Removing the gateway deletes its rule and leaves the set alone.
- **Receipt rule:** recipients the domain, enabled, spam and virus scanning
  on, and two actions in order: an S3 action (the bucket, no object key
  prefix), then a Lambda action (the function, invocation type `Event`).
- **Tokens:** minted through `/v1/tokens` on the function URL with
  `API_TOKEN`.
- **Limits:** the S3 action stores messages up to 40 MB. A function URL
  request is at most 6 MB, so the attachments of one sent message, which travel
  base64-encoded in the request, total at most about 4.5 MB. The SNS-content
  action is not used, because it bounces mail over 150 KB.

## Setup with the metis CLI

With AWS credentials in the environment (`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`,
and so on), one command creates everything listed above, from the domain
identity to the receipt rule, applies the schema to the database and registers
the gateway in Metis:

```sh
sudo metis add gateway-ses --domain example.com --region eu-west-1 \
  --database-url libsql://... --database-token ...
```

It puts its rule into the active rule set and creates a set only when none is
active. It deploys the gateway's newest release; `--version 0.2.0` picks
another. From any other machine, add `--remote`: it prints the admin token and
the server entry instead.
`metis remove gateway-ses --domain example.com` deletes only this gateway's
rule and resources; `--purge` also deletes the bucket and its objects. Mint
mailbox tokens with `metis gateway token create alice@example.com`.

The steps below do the same by hand.

## Setup with the AWS CLI

The commands below use these shell variables; replace the values with your
own.

```sh
REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
DOMAIN=example.com
BUCKET=example-com-metis-mail
FUNCTION=metis-ses-mail
RULE=metis-ses-mail
VERSION=$(curl -fsSL https://sh.trymetis.email/gateway-ses/version.txt)   # the newest gateway release
```

### 1. Verify the domain

```sh
aws sesv2 create-email-identity --region "$REGION" --email-identity "$DOMAIN"
```

The output lists three DKIM tokens. For each token add a `CNAME` record
`TOKEN._domainkey.example.com` → `TOKEN.dkim.amazonses.com`. Then add the
`MX` record `10 inbound-smtp.us-east-1.amazonaws.com` (with your region) on
the domain. A domain that already has `MX` records for another mail service
should use a subdomain.

Check production access, and request it when it is `false`:

```sh
aws sesv2 get-account --region "$REGION" --query ProductionAccessEnabled
aws sesv2 put-account-details --region "$REGION" \
  --production-access-enabled --mail-type TRANSACTIONAL \
  --website-url https://example.com --contact-language EN \
  --use-case-description "Personal and team mailboxes on example.com"
```

### 2. Create the bucket

```sh
aws s3api create-bucket --region "$REGION" --bucket "$BUCKET"

aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSESPuts",
    "Effect": "Allow",
    "Principal": { "Service": "ses.amazonaws.com" },
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::$BUCKET/*",
    "Condition": {
      "StringEquals": { "AWS:SourceAccount": "$ACCOUNT" },
      "ArnLike": { "AWS:SourceArn": "arn:aws:ses:$REGION:$ACCOUNT:receipt-rule-set/*:receipt-rule/$RULE" }
    }
  }]
}
EOF
)"
```

Outside us-east-1, add `--create-bucket-configuration LocationConstraint=$REGION`
to `create-bucket`.

### 3. Prepare the database

Create a libSQL database (a `sqld` server or a Turso database) and apply the
schema from this directory:

```sh
bun install                  # from the repository root
cd apps/gateway-ses
DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... bun run db:apply
```

### 4. Create the execution role

```sh
aws iam create-role --role-name "$FUNCTION" --assume-role-policy-document '{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}'

aws iam put-role-policy --role-name "$FUNCTION" --policy-name gateway \
  --policy-document "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::$BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::$BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": [
        "arn:aws:ses:$REGION:$ACCOUNT:identity/$DOMAIN",
        "arn:aws:ses:$REGION:$ACCOUNT:identity/*@$DOMAIN"
      ],
      "Condition": { "StringLike": { "ses:FromAddress": "*@$DOMAIN" } }
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "*"
    }
  ]
}
EOF
)"
```

The SES statement lists both the domain identity and single-address
identities on the domain, and its `StringLike` condition is case-sensitive,
which is why the domain is lowercase. A new mailbox needs no IAM change.

### 5. Create the function

Download the release's zip, check it, and create the function from it:

```sh
curl -fsSLO "https://sh.trymetis.email/gateway-ses/v$VERSION/gateway-ses.zip"
curl -fsSL "https://sh.trymetis.email/gateway-ses/v$VERSION/SHA256SUMS" | grep ' gateway-ses.zip$' | sha256sum -c -

aws lambda create-function --region "$REGION" --function-name "$FUNCTION" \
  --runtime nodejs24.x --architectures arm64 --handler index.handler \
  --role "arn:aws:iam::$ACCOUNT:role/$FUNCTION" \
  --zip-file fileb://gateway-ses.zip --timeout 60 --memory-size 1024 \
  --environment "Variables={MAIL_DOMAIN=$DOMAIN,API_TOKEN=$(openssl rand -hex 32),DATABASE_URL=libsql://...,DATABASE_AUTH_TOKEN=...,MAIL_BUCKET=$BUCKET}"
```

Keep the `API_TOKEN` value; it is the admin token for minting mailbox tokens.

Give it a function URL with response streaming, and the two public
permissions a `NONE` URL needs:

```sh
aws lambda create-function-url-config --region "$REGION" --function-name "$FUNCTION" \
  --auth-type NONE --invoke-mode RESPONSE_STREAM

aws lambda add-permission --region "$REGION" --function-name "$FUNCTION" \
  --statement-id function-url-public --action lambda:InvokeFunctionUrl \
  --principal '*' --function-url-auth-type NONE

aws lambda add-permission --region "$REGION" --function-name "$FUNCTION" \
  --statement-id function-url-invoke --action lambda:InvokeFunction \
  --principal '*' --invoked-via-function-url
```

Let SES invoke it for this rule only:

```sh
SET=$(aws ses describe-active-receipt-rule-set --region "$REGION" --query Metadata.Name --output text)

aws lambda add-permission --region "$REGION" --function-name "$FUNCTION" \
  --statement-id ses-receipt --action lambda:InvokeFunction \
  --principal ses.amazonaws.com --source-account "$ACCOUNT" \
  --source-arn "arn:aws:ses:$REGION:$ACCOUNT:receipt-rule-set/$SET:receipt-rule/$RULE"
```

When `SET` is `None`, no rule set is active yet: create and activate one
first, then run the `add-permission` above with its name:

```sh
SET=metis
aws ses create-receipt-rule-set --region "$REGION" --rule-set-name "$SET"
aws ses set-active-receipt-rule-set --region "$REGION" --rule-set-name "$SET"
```

Set the retry count and, optionally, a failure destination (an SQS queue or
SNS topic the role may write to) for receipt events:

```sh
aws lambda put-function-event-invoke-config --region "$REGION" --function-name "$FUNCTION" \
  --maximum-retry-attempts 2
```

### 6. Add the receipt rule

```sh
aws ses create-receipt-rule --region "$REGION" --rule-set-name "$SET" --rule "$(cat <<EOF
{
  "Name": "$RULE",
  "Enabled": true,
  "ScanEnabled": true,
  "TlsPolicy": "Optional",
  "Recipients": ["$DOMAIN"],
  "Actions": [
    { "S3Action": { "BucketName": "$BUCKET" } },
    { "LambdaAction": {
        "FunctionArn": "arn:aws:lambda:$REGION:$ACCOUNT:function:$FUNCTION",
        "InvocationType": "Event" } }
  ]
}
EOF
)"
```

SES writes an `AMAZON_SES_SETUP_NOTIFICATION` object to the bucket when it
checks the rule's permissions.

To remove the gateway later, delete only its rule:
`aws ses delete-receipt-rule --rule-set-name "$SET" --rule-name "$RULE"`.

### 7. Register it in Metis Suite

The function URL (`aws lambda get-function-url-config --function-name
"$FUNCTION" --query FunctionUrl`) is the gateway endpoint. Add it under
Dashboard → System → Amazon SES, or set the starting list before the first
start:

```sh
METIS_SES_SERVERS=[{"name":"Example Mail","domain":"example.com","endpoint":"https://abcdefghijklmnopqrstuvwxyz012345.lambda-url.us-east-1.on.aws"}]
```

## Minting a mailbox token

```sh
ADMIN_TOKEN=... bun run token https://abcdefghijklmnopqrstuvwxyz012345.lambda-url.us-east-1.on.aws create you@example.com
ADMIN_TOKEN=... bun run token https://... list
ADMIN_TOKEN=... bun run token https://... revoke you@example.com
```

The token is shown once. Hand it to the person who owns that address; they
paste it into Metis when connecting the mailbox. Until an address has a token,
its mail is deleted from the bucket.

## Building

```sh
bun run build     # dist/index.mjs, one ESM bundle with no native modules
bun run package   # dist/gateway-ses.zip, index.mjs at the zip's root
```

## API

`/v1/*` is the contract `apps/web/src/mail/providers/gateway-client.ts`
speaks, shared with the other gateways through `packages/gateway-contract`;
this service supplies the libSQL and S3 store behind it, SES sending and the
receipt ingest. `GET /v1/health` echoes `{ ok, backend: "ses", domain,
address }`; Metis's `verify()` cross-checks the echoed domain and token
address against the configured server entry and the address being connected.
