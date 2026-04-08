# Email Domain Setup for Cold Outreach

**Document Version:** 1.0  
**Last Updated:** 2026-03-22  
**Priority:** P1 - High

---

## Overview

This document provides step-by-step instructions for configuring email authentication (SPF, DKIM, DMARC) for cold outreach. **Critical:** Use a separate sending domain to protect your main domain's deliverability.

---

## Why Separate Sending Domains?

| Main Domain (claraud.com)        | Sending Domain (getclaraud.com)      |
| -------------------------------- | ------------------------------------ |
| Corporate website                | Cold outreach only                   |
| Primary email (user@claraud.com) | Sending email (audit@getclaraud.com) |
| Protected reputation             | Can be warmed up independently       |
| SPF/DKIM strict                  | More flexible policies               |

**Best Practice:** Never send cold outreach from your main corporate domain.

---

## Step 1: Register Sending Domain

### Recommended Domain Patterns

```
Primary Domain          Sending Domain Options
-------------------     ------------------------------------
claraud.com             getclaraud.com
                        tryclaraud.com
                        claraud.io
                        withclaraud.com
                        claraudhq.com
```

### Domain Selection Criteria

- ✅ Different TLD from main domain (.com vs .io, .co, .hq)
- ✅ No brand confusion (avoid claraud-email.com)
- ✅ Similar enough to be recognizable
- ✅ Available on Namecheap/GoDaddy

---

## Step 2: Configure DNS Records

### For Resend.com (Recommended Email Provider)

#### 1. Add Domain to Resend

```bash
# In Resend Dashboard:
# Settings → Domains → Add Domain
# Enter: getclaraud.com
```

#### 2. Add DNS Records (Namecheap Example)

Log in to Namecheap → Domain List → Manage → Advanced DNS

**SPF Record (TXT):**

```
Type: TXT
Host: @
Value: v=spf1 include:sendgrid.net include:resend.com ~all
TTL: 1800
```

**DKIM Record (CNAME or TXT):**

```
# Resend will provide these values after domain verification
Type: CNAME
Host: resend._domainkey
Value: resend._domainkey.getclaraud.com.resend.dev
TTL: 1800
```

**DMARC Record (TXT):**

```
Type: TXT
Host: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@getclaraud.com; ruf=mailto:dmarc-forensics@getclaraud.com; sp=quarantine; adkim=s; aspf=s
TTL: 1800
```

**Domain Verification (TXT):**

```
Type: TXT
Host: @
Value: resend-verification=YOUR_VERIFICATION_CODE
TTL: 1800
```

### For Google Workspace (Alternative)

**SPF Record:**

```
Type: TXT
Host: @
Value: v=spf1 include:_spf.google.com ~all
TTL: 1800
```

**DKIM Record:**

```
# Generate in Google Admin Console:
# Apps → Google Workspace → Gmail → Authenticate email address
Type: TXT
Host: google._domainkey
Value: v=DKIM1; k=rsa; p=MIIBIjANBgkq...
TTL: 1800
```

**DMARC Record:**

```
Type: TXT
Host: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@getclaraud.com
TTL: 1800
```

---

## Step 3: Verify DNS Propagation

### Check SPF

```bash
dig getclaraud.com TXT +short
# Expected: "v=spf1 include:sendgrid.net include:resend.com ~all"
```

### Check DKIM

```bash
dig resend._domainkey.getclaraud.com TXT +short
# Expected: DKIM public key
```

### Check DMARC

```bash
dig _dmarc.getclaraud.com TXT +short
# Expected: "v=DMARC1; p=quarantine; ..."
```

### Online Tools

- [MXToolbox](https://mxtoolbox.com/)
- [Google Admin Toolbox](https://toolbox.googleapps.com/apps/checkmx/)
- [Mail-Tester](https://www.mail-tester.com/)

---

## Step 4: Domain Warm-up

### Week 1-2: Low Volume

| Day  | Daily Limit | Total Sent |
| ---- | ----------- | ---------- |
| 1-3  | 20 emails   | 60         |
| 4-7  | 50 emails   | 200        |
| 8-14 | 100 emails  | 700        |

### Week 3-4: Ramp Up

| Day   | Daily Limit | Total Sent |
| ----- | ----------- | ---------- |
| 15-21 | 200 emails  | 1,400      |
| 22-28 | 300 emails  | 2,100      |

### Month 2+: Full Volume

| Day | Daily Limit | Total Sent |
| --- | ----------- | ---------- |
| 29+ | 500 emails  | -          |

### Warm-up Best Practices

1. **Start with engaged recipients** (known contacts, warm leads)
2. **Monitor bounce rates** (keep < 2%)
3. **Track spam complaints** (keep < 0.1%)
4. **Maintain consistent sending patterns**
5. **Remove hard bounces immediately**

---

## Step 5: Configure in Application

### Environment Variables

```bash
# .env.local / Cloud Run secrets
OUTREACH_SENDING_DOMAINS="getclaraud.com,tryclaraud.com"
OUTREACH_SENDING_EMAILS="audit@getclaraud.com,outreach@tryclaraud.com"
OUTREACH_SENDER_NAME="ProposalOS Team"
OUTREACH_DOMAIN_DAILY_LIMIT="50"
RESEND_API_KEY="re_xxxxxx"
```

### Terraform Configuration

```hcl
# In terraform.tfvars
dns = {
  domain            = "getclaraud.com"
  sending_subdomain = "mail"
  managed_zone      = "getclaraud-com"
  spf_include       = ["_spf.google.com", "sendgrid.net", "resend.com"]
  dmarc_policy      = "quarantine"
  dmarc_rua_email   = "dmarc-reports@getclaraud.com"
}
```

---

## Step 6: Monitoring & Maintenance

### Daily Checks

- [ ] Bounce rate < 2%
- [ ] Spam complaints < 0.1%
- [ ] Open rate > 15%
- [ ] Click rate > 2%

### Weekly Checks

- [ ] DMARC reports (rua emails)
- [ ] Domain reputation score
- [ ] Blacklist status

### Monthly Checks

- [ ] Rotate DKIM keys (if needed)
- [ ] Review SPF includes
- [ ] Update blocklist

### Tools

| Tool               | Purpose            | URL                                      |
| ------------------ | ------------------ | ---------------------------------------- |
| Google Postmaster  | Domain reputation  | postmaster.google.com                    |
| Microsoft SNDS     | Outlook reputation | sendersupport.olc.protection.outlook.com |
| Talos Intelligence | Blacklist check    | talosintelligence.com                    |
| MxToolbox          | DNS + blacklist    | mxtoolbox.com                            |

---

## Troubleshooting

### Issue: Emails Going to Spam

1. **Check SPF alignment:**

   ```bash
   dig yourdomain.com TXT
   # Ensure all sending IPs are included
   ```

2. **Verify DKIM signing:**

   ```bash
   # In Resend/Google dashboard, check DKIM status
   ```

3. **Review DMARC policy:**
   - Start with `p=none` for monitoring
   - Move to `p=quarantine` after 2 weeks
   - Consider `p=reject` for strict enforcement

### Issue: Domain Blacklisted

1. **Identify blacklist:**

   ```bash
   # Check multiple blacklists
   mxtoolbox.com/blacklists.aspx
   ```

2. **Request delisting:**
   - Follow each blacklist's delisting process
   - Fix root cause (spam, high bounce rate)
   - Wait 24-48 hours for propagation

3. **Prevent future blacklisting:**
   - Implement double opt-in
   - Add unsubscribe links
   - Honor opt-outs immediately

---

## Compliance Checklist

- [ ] SPF record configured and validated
- [ ] DKIM record configured and validated
- [ ] DMARC record configured (p=quarantine minimum)
- [ ] Unsubscribe mechanism in all emails
- [ ] Physical address in email footer (CAN-SPAM)
- [ ] No misleading subject lines
- [ ] Honor opt-outs within 10 business days

---

## Quick Reference

### DNS Record Template

```
# SPF
@ TXT "v=spf1 include:resend.com ~all"

# DKIM (Resend example)
resend._domainkey CNAME resend._domainkey.getclaraud.com.resend.dev

# DMARC
_dmarc TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@getclaraud.com"
```

### Environment Variables

```bash
OUTREACH_SENDING_DOMAINS="getclaraud.com"
OUTREACH_SENDING_EMAILS="audit@getclaraud.com"
OUTREACH_SENDER_NAME="ProposalOS Team"
OUTREACH_DOMAIN_DAILY_LIMIT="50"
```

### Verification Commands

```bash
# SPF
dig getclaraud.com TXT +short

# DKIM
dig resend._domainkey.getclaraud.com TXT +short

# DMARC
dig _dmarc.getclaraud.com TXT +short
```

---

## Related Documents

- [DNS Setup](./dns-setup.md)
- [Secret Rotation](./SECRET_ROTATION.md)
- [Backup & Restore](./backup-restore.md)
