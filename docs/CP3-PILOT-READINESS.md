# CP3 Pilot Readiness

## Phase 0 Human Checklist

### Claraud DNS

Namecheap -> Advanced DNS -> A record `@` -> `34.160.3.205`, CNAME `www` -> `claraud.com`.

Verify the managed certificate:

```bash
gcloud compute ssl-certificates describe claraud-cert --global \
  --project=proposal-487522 \
  --format="yaml(managed.status,managed.domainStatus)"
```

Expected: `managed.status: ACTIVE`, with both `claraud.com` and `www.claraud.com` active.

```bash
curl -I https://claraud.com
```

Expected: `HTTP/2 200`, valid HTTPS, and the Claraud response, not a default backend.

### Zoho Mailboxes

Add `getclaraud.com` and `tryclaraud.com` to the existing Zoho organization. Create `danish@` on both domains, enable IMAP/SMTP, and generate app passwords.

Copy the exact MX and DKIM values shown by Zoho Admin. Publish:

- SPF: `v=spf1 include:zoho.com ~all`
- DMARC: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:danish@claraud.com`
- DKIM: Zoho-provided selector and value, copied exactly from Zoho Admin

Move DMARC to `p=quarantine` only after authentication headers are verified on owned-inbox tests.

### Warm-up

Connect `danish@getclaraud.com` and `danish@tryclaraud.com` to Instantly.ai, or Snov if selected by the owner, and start warm-up. Record the provider's actual start date here:

`WARMUP_START_DATE = ____________________`

Earliest pilot date is `WARMUP_START_DATE + 28 days`. No real-prospect sending is permitted before that date.

### Secret Manager

Create these secrets in project `proposal-487522`; values must be Zoho app passwords, never committed:

```text
ZOHO_GETCLARAUD_SMTP_USER
ZOHO_GETCLARAUD_SMTP_PASS
ZOHO_TRYCLARAUD_SMTP_USER
ZOHO_TRYCLARAUD_SMTP_PASS
```

The deploy environment should select one mailbox at a time through `ZOHO_SMTP_USER` and `ZOHO_SMTP_PASS`. Do not place secret values in Cloud Run plain environment variables.

## Engineering Gate

Both flags must be explicitly enabled before any provider call:

- `OUTREACH_LIVE_SENDING=true`
- `OUTBOUND_DELIVERY_ENABLED=true`

The provider is selected with `OUTREACH_PROVIDER=resend` or `OUTREACH_PROVIDER=zoho_smtp`. Zoho is capped at 40 messages per mailbox per UTC day, with the recommended operating cap set to 35.

## Evidence Required Before Pilot

- Fresh scan from the deployed Claraud revision reaches `COMPLETE`.
- Email-gate submission is received in an owned test inbox.
- Report and proposal routes return 200.
- Owned-inbox Authentication-Results show SPF, DKIM, and DMARC pass.
- Provider message IDs are recorded for every internal test message.
- Unsubscribe returns 200 and suppresses a subsequent send.
- Bounce/NDR is observed through IMAP and suppresses the bad address.
- Mail-tester score is at least 8/10 for the exact dental Email 1.
- Mailbox governor queues or refuses message 41.
- Certificate is `ACTIVE` and `claraud.com` resolves to `34.160.3.205`.
- Warm-up has completed for both mailboxes.

## Deferred

No real prospect sends, Zoho credentials, Instantly/Snov connection, programmatic SEO, blog, dashboard revival, or provider cutover is performed by code in this change.
