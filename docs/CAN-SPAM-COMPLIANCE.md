# CAN-SPAM Compliance Guide

**Last Updated:** March 29, 2026

**Status:** REQUIRED for all outreach campaigns

---

## 1. Overview

The CAN-SPAM Act (Controlling the Assault of Non-Solicited Pornography And Marketing Act) sets rules for commercial email messages. Violations can result in penalties of up to **$51,744 per email**.

## 2. Requirements Checklist

### 2.1 Header Information

- [ ] **From Address**: Must accurately identify the sender
- [ ] **To Address**: Must not be forged
- [ ] **Reply-To**: Must be functional and monitored
- [ ] **Routing Information**: Must not be deceptive

### 2.2 Subject Line

- [ ] **No Deception**: Subject must not mislead recipient
- [ ] **Accurate Content**: Subject must reflect email content
- [ ] **No "Re:" unless actual reply**: Cannot fake thread continuity

### 2.3 Content Requirements

- [ ] **Clear Disclosure**: Must clearly identify as advertisement
- [ ] **Physical Address**: Must include valid postal address
- [ ] **Unsubscribe Link**: Must be clear and conspicuous
- [ ] **Functioning for 30 Days**: Unsubscribe must work 30 days after sending

### 2.4 Unsubscribe Processing

- [ ] **Honor Within 10 Days**: Must process opt-out within 10 business days
- [ ] **No Fees**: Cannot charge for unsubscribe
- [ ] **No Extra Steps**: Cannot require login or additional info beyond email
- [ ] **Permanent**: Once opted out, must remain opted out

---

## 3. Implementation in ProposalOS

### 3.1 Email Template Requirements

All email templates MUST include:

```html
<!-- REQUIRED: Physical Address -->
<div class="footer-address">[Your Company Name] [Street Address] [City, State ZIP] [Country]</div>

<!-- REQUIRED: Unsubscribe Link -->
<div class="unsubscribe"><a href="{{unsubscribe_url}}">Unsubscribe</a> from future emails.</div>
```

### 3.2 Physical Address Options

**Option A: Your Business Address**

```
ProposalOS
123 Business Street
Suite 100
City, ST 12345
United States
```

**Option B: PO Box**

```
ProposalOS
PO Box 12345
City, ST 12345
United States
```

**Option C: Registered Agent**

```
ProposalOS
c/o [Registered Agent Name]
[Agent Address]
```

### 3.3 Unsubscribe URL Format

The unsubscribe URL is automatically generated:

```
https://[your-domain]/api/email/unsubscribe?email={recipient_email}
```

This URL:

- Adds email to blocklist immediately
- Cancels pending follow-ups
- Logs the unsubscribe event
- Displays confirmation page

---

## 4. Prohibited Practices

### 4.1 Never Do These

- ❌ Using deceptive subject lines
- ❌ Hiding your identity
- ❌ Using fake reply-to addresses
- ❌ Making unsubscribe difficult
- ❌ Charging for opt-out
- ❌ Selling opted-out emails
- ❌ Continuing after opt-out

### 4.2 High-Risk Practices

- ⚠️ "Re:" in subject (unless actual reply)
- ⚠️ "Fwd:" without actual forward
- ⚠️ "Urgent" without legitimate urgency
- ⚠️ "Account" references for non-customers
- ⚠️ Addressing as "Valued Customer" when not

---

## 5. Best Practices

### 5.1 Subject Line Guidelines

**Good Examples:**

- "Website Audit Results for [Business Name]"
- "Quick question about [Business] website"
- "[Mutual Connection] suggested I reach out"

**Bad Examples:**

- "Re: Your inquiry" (when no inquiry)
- "Urgent: Account suspended" (false urgency)
- "FW: Proposal for you" (not a forward)

### 5.2 Content Guidelines

- Be honest about who you are
- Be clear about why you're contacting
- Make value proposition clear
- Keep unsubscribe visible (not hidden)

### 5.3 List Hygiene

- Remove hard bounces immediately
- Honor unsubscribes within 10 days
- Don't purchase email lists
- Keep suppression lists permanently

---

## 6. Compliance Verification

### 6.1 Pre-Send Checklist

Before sending any campaign:

- [ ] Physical address included
- [ ] Unsubscribe link present and functional
- [ ] Subject line is accurate
- [ ] From address is legitimate
- [ ] Reply-to is monitored
- [ ] Content is not deceptive

### 6.2 Weekly Audit

- [ ] Review unsubscribe rate
- [ ] Check spam complaint rate
- [ ] Verify blocklist is being honored
- [ ] Confirm address is current

### 6.3 Monthly Review

- [ ] Review complaint logs
- [ ] Check sender reputation
- [ ] Update suppression lists
- [ ] Verify all templates compliant

---

## 7. Penalty Structure

### 7.1 Violation Categories

| Violation Type       | Penalty Per Email |
| -------------------- | ----------------- |
| Header deception     | Up to $51,744     |
| Deceptive subject    | Up to $51,744     |
| Missing address      | Up to $51,744     |
| No unsubscribe       | Up to $51,744     |
| Failed opt-out honor | Up to $51,744     |

### 7.2 Aggravating Factors

Penalties increase for:

- Harvested email addresses
- Dictionary attack patterns
- Ignoring prior complaints
- Multiple violations

---

## 8. State-Specific Requirements

### 8.1 California (CCPA)

- Additional disclosure requirements
- Right to opt-out of sale
- "Do Not Sell My Info" link if applicable

### 8.2 Other States

Some states have stricter laws:

- **Florida**: Additional registration requirements
- **New York**: Specific disclosure language
- **Illinois**: Enhanced consumer protections

---

## 9. International Considerations

### 9.1 Canada (CASL)

- **Express consent required** (not just opt-out)
- Higher penalties (up to CAD $10M)
- Additional identification requirements

### 9.2 EU (GDPR)

- **Explicit consent required**
- Detailed privacy notices
- Right to erasure
- Data processing agreements

### 9.3 Recommendation

For international emails, comply with the **stricter standard** (usually GDPR/CASL).

---

## 10. Emergency Procedures

### 10.1 If You Receive a Complaint

1. **Stop sending immediately** to that recipient
2. **Document the complaint**
3. **Review your practices**
4. **Consult legal counsel** if formal notice received

### 10.2 If You Receive a Legal Notice

1. **Preserve all records**
2. **Do not destroy evidence**
3. **Contact legal counsel immediately**
4. **Cooperate with investigation**

---

## 11. Contact Information

### 11.1 Compliance Questions

Email: compliance@proposalos.com

### 11.2 Legal Resources

- [FTC CAN-SPAM Page](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [FTC Compliance Checklist](https://www.ftc.gov/tips-advice/business-center/advertising-and-marketing/can-spam-act)

---

## 12. Acknowledgment

**All users of ProposalOS outreach features must acknowledge:**

1. I have read and understood CAN-SPAM requirements
2. I will include physical address in all emails
3. I will honor unsubscribe requests within 10 days
4. I will not use deceptive practices
5. I am responsible for my compliance

---

**Last Reviewed:** March 29, 2026

**Next Review:** September 29, 2026

**Owner:** Compliance Team
