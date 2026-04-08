# Incident Response Runbook

**Document Classification:** Internal Use Only

**Last Updated:** March 29, 2026

**Version:** 1.0

---

## 1. Overview

### 1.1 Purpose

This runbook defines the procedures for detecting, responding to, and recovering from security incidents affecting ProposalOS systems and data.

### 1.2 Scope

This runbook applies to:

- All ProposalOS employees and contractors
- All systems, applications, and data owned or operated by ProposalOS
- All security incidents regardless of severity

### 1.3 Definitions

| Term           | Definition                                                          |
| -------------- | ------------------------------------------------------------------- |
| **Incident**   | Any violation of security policies or attempted unauthorized access |
| **Breach**     | Confirmed unauthorized access to or disclosure of data              |
| **Severity 1** | Critical - Active breach, data exfiltration in progress             |
| **Severity 2** | High - Confirmed breach, potential data exposure                    |
| **Severity 3** | Medium - Suspicious activity, requires investigation                |
| **Severity 4** | Low - Policy violation, no immediate threat                         |

---

## 2. Incident Response Team

### 2.1 Core Team

| Role                | Primary | Backup | Contact       |
| ------------------- | ------- | ------ | ------------- |
| Incident Commander  | [Name]  | [Name] | [Phone/Email] |
| Technical Lead      | [Name]  | [Name] | [Phone/Email] |
| Communications Lead | [Name]  | [Name] | [Phone/Email] |
| Legal Counsel       | [Name]  | [Name] | [Phone/Email] |

### 2.2 Responsibilities

**Incident Commander:**

- Overall incident management
- Decision authority
- Resource allocation
- Escalation decisions

**Technical Lead:**

- Technical investigation
- Containment strategy
- Evidence preservation
- Remediation implementation

**Communications Lead:**

- Internal communications
- External notifications
- Media relations
- Customer communications

**Legal Counsel:**

- Regulatory compliance
- Law enforcement liaison
- Contract review
- Liability assessment

---

## 3. Incident Classification

### 3.1 Severity Levels

#### Severity 1 - Critical

- Active data breach with exfiltration
- Ransomware attack
- Complete system compromise
- Critical infrastructure failure

**Response Time:** Immediate (within 15 minutes)

#### Severity 2 - High

- Confirmed unauthorized access
- Data exposure without confirmed exfiltration
- Partial system compromise
- DDoS attack affecting service

**Response Time:** Within 1 hour

#### Severity 3 - Medium

- Suspicious activity requiring investigation
- Failed attack attempts
- Policy violations
- Minor service disruption

**Response Time:** Within 4 hours

#### Severity 4 - Low

- Security policy violations (unintentional)
- Reconnaissance activity
- Minor anomalies

**Response Time:** Within 24 hours

---

## 4. Incident Response Process

### Phase 1: Detection and Reporting

#### 4.1 Detection Sources

- Automated monitoring (alerts from security tools)
- User reports (employees, customers)
- External notifications (law enforcement, partners)
- Threat intelligence feeds

#### 4.2 Reporting Procedure

**All employees must report suspected incidents immediately:**

1. **During Business Hours:**
   - Contact Security Team: security@proposalos.com
   - Slack: #security-incidents
   - Phone: [Security Hotline]

2. **After Hours:**
   - On-call Security: [Phone Number]
   - Incident Commander: [Phone Number]

#### 4.3 Initial Information to Collect

- Date and time of discovery
- Discoverer name and contact
- Systems/data affected
- Current status (ongoing, contained)
- Initial severity assessment

---

### Phase 2: Triage and Assessment

#### 4.4 Triage Checklist

- [ ] Verify the incident is real (not false positive)
- [ ] Determine scope and impact
- [ ] Assign severity level
- [ ] Identify affected systems/data
- [ ] Notify appropriate team members

#### 4.5 Severity Decision Matrix

| Factor            | Sev 1                   | Sev 2                | Sev 3                | Sev 4           |
| ----------------- | ----------------------- | -------------------- | -------------------- | --------------- |
| Data Exposure     | Confirmed exfiltration  | Confirmed access     | Potential access     | No exposure     |
| Systems Affected  | Critical infrastructure | Production systems   | Non-critical systems | Single endpoint |
| Business Impact   | Severe disruption       | Significant impact   | Moderate impact      | Minimal impact  |
| Regulatory Impact | Reportable breach       | Potential reportable | Internal only        | No reporting    |

---

### Phase 3: Containment

#### 4.6 Immediate Containment Actions

**For Active Attacks:**

- [ ] Isolate affected systems from network
- [ ] Disable compromised accounts
- [ ] Block malicious IP addresses
- [ ] Preserve evidence before changes

**For Data Breaches:**

- [ ] Revoke access tokens
- [ ] Rotate compromised credentials
- [ ] Enable additional logging
- [ ] Preserve audit logs

**For Malware:**

- [ ] Disconnect infected systems
- [ ] Block C2 communications
- [ ] Preserve malware samples
- [ ] Scan related systems

#### 4.7 Containment Verification

- [ ] Confirm attack vector is blocked
- [ ] Verify no lateral movement
- [ ] Document all containment actions
- [ ] Obtain stakeholder approval for next phase

---

### Phase 4: Eradication

#### 4.8 Eradication Steps

- [ ] Identify root cause
- [ ] Remove malware/backdoors
- [ ] Patch vulnerabilities
- [ ] Update security controls
- [ ] Verify removal completeness

#### 4.9 System Hardening

- [ ] Apply all security patches
- [ ] Update firewall rules
- [ ] Strengthen access controls
- [ ] Enable additional monitoring

---

### Phase 5: Recovery

#### 4.10 Recovery Procedure

- [ ] Restore systems from clean backups
- [ ] Verify system integrity
- [ ] Gradually restore services
- [ ] Monitor for reinfection
- [ ] Document recovery steps

#### 4.11 Service Restoration Priority

| Priority | Systems                  | RTO      |
| -------- | ------------------------ | -------- |
| 1        | Authentication, Database | 4 hours  |
| 2        | API Services, Frontend   | 8 hours  |
| 3        | Analytics, Reporting     | 24 hours |
| 4        | Admin Tools, Internal    | 48 hours |

---

### Phase 6: Post-Incident

#### 4.12 Lessons Learned

**Meeting within 5 business days:**

- [ ] What happened and how?
- [ ] What was done well?
- [ ] What could be improved?
- [ ] What preventive measures are needed?

#### 4.13 Incident Report

**Required elements:**

- Executive summary
- Timeline of events
- Root cause analysis
- Impact assessment
- Remediation actions
- Recommendations

#### 4.14 Documentation Retention

- Incident reports: 7 years
- Evidence: Until legal hold lifted
- Communications: 3 years
- Action items: Until completed

---

## 5. Specific Incident Playbooks

### 5.1 Data Breach Playbook

**Trigger:** Confirmed unauthorized data access

| Step | Action                                | Owner              | Timeline  |
| ---- | ------------------------------------- | ------------------ | --------- |
| 1    | Confirm breach scope                  | Technical Lead     | 1 hour    |
| 2    | Contain affected systems              | Technical Team     | Immediate |
| 3    | Preserve evidence                     | Technical Lead     | 2 hours   |
| 4    | Legal assessment                      | Legal Counsel      | 4 hours   |
| 5    | Regulatory notification determination | Legal Counsel      | 24 hours  |
| 6    | Customer notification (if required)   | Communications     | 72 hours  |
| 7    | Remediation                           | Technical Team     | 1 week    |
| 8    | Post-incident review                  | Incident Commander | 2 weeks   |

### 5.2 Ransomware Playbook

**Trigger:** Ransomware detection

| Step | Action                         | Owner              | Timeline   |
| ---- | ------------------------------ | ------------------ | ---------- |
| 1    | Isolate infected systems       | Technical Team     | Immediate  |
| 2    | Identify ransomware variant    | Technical Lead     | 1 hour     |
| 3    | Assess backup integrity        | Technical Team     | 2 hours    |
| 4    | DO NOT pay ransom              | Incident Commander | N/A        |
| 5    | Law enforcement notification   | Legal Counsel      | 24 hours   |
| 6    | System restoration from backup | Technical Team     | 4-24 hours |
| 7    | Security control updates       | Technical Team     | 1 week     |

### 5.3 DDoS Attack Playbook

**Trigger:** Service disruption from DDoS

| Step | Action                  | Owner          | Timeline   |
| ---- | ----------------------- | -------------- | ---------- |
| 1    | Confirm DDoS attack     | Technical Team | 15 minutes |
| 2    | Enable DDoS protection  | Technical Team | Immediate  |
| 3    | Contact CDN/ISP         | Technical Lead | 30 minutes |
| 4    | Implement rate limiting | Technical Team | 1 hour     |
| 5    | Monitor and adjust      | Technical Team | Ongoing    |
| 6    | Post-attack analysis    | Technical Lead | 1 week     |

### 5.4 Insider Threat Playbook

**Trigger:** Suspicious employee activity

| Step | Action                             | Owner          | Timeline    |
| ---- | ---------------------------------- | -------------- | ----------- |
| 1    | Document suspicious activity       | Security Team  | Immediate   |
| 2    | HR and Legal consultation          | Legal Counsel  | 4 hours     |
| 3    | Enhanced monitoring                | Technical Lead | Immediate   |
| 4    | Access review                      | Technical Team | 24 hours    |
| 5    | Disciplinary action (if warranted) | HR             | As needed   |
| 6    | Access revocation                  | Technical Team | As directed |

---

## 6. Communication Templates

### 6.1 Internal Notification

```
SECURITY INCIDENT NOTIFICATION

Incident ID: [ID]
Severity: [1-4]
Status: [Investigating/Contained/Resolved]

Summary:
[Brief description]

Impact:
[Systems/data affected]

Actions Taken:
[List of actions]

Next Update: [Time]

Contact: Security Team (security@proposalos.com)
```

### 6.2 Customer Notification (Data Breach)

```
IMPORTANT SECURITY NOTICE

Dear [Customer],

We are writing to inform you of a security incident that may have affected your data.

What Happened:
[Description]

What Information Was Involved:
[Data types]

What We Are Doing:
[Remediation steps]

What You Can Do:
[Recommended actions]

For More Information:
[Contact details]

We sincerely apologize for any inconvenience.

Sincerely,
ProposalOS Security Team
```

### 6.3 Regulatory Notification (GDPR)

```
DATA BREACH NOTIFICATION

To: [Supervisory Authority]

Controller: ProposalOS
Contact: [DPO Contact]

Description of Breach:
[Nature and categories of data]

Approximate Number of Data Subjects: [Count]

Likely Consequences:
[Impact assessment]

Measures Taken/Proposed:
[Remediation steps]

Contact for Further Information:
[Contact details]
```

---

## 7. Escalation Matrix

### 7.1 Internal Escalation

| Severity | Initial Contact  | Escalate To      | Timeline  |
| -------- | ---------------- | ---------------- | --------- |
| 4        | Security Team    | Security Manager | 24 hours  |
| 3        | Security Manager | Director         | 4 hours   |
| 2        | Director         | VP/CTO           | 1 hour    |
| 1        | VP/CTO           | CEO/Board        | Immediate |

### 7.2 External Escalation

| Situation          | Contact               | Timeline    |
| ------------------ | --------------------- | ----------- |
| Data Breach (GDPR) | Supervisory Authority | 72 hours    |
| Data Breach (CCPA) | California AG         | As required |
| Criminal Activity  | FBI/Law Enforcement   | Immediate   |
| Media Inquiry      | PR Firm               | As directed |

---

## 8. Tools and Resources

### 8.1 Security Tools

| Tool             | Purpose            | Access            |
| ---------------- | ------------------ | ----------------- |
| [SIEM Tool]      | Log analysis       | Security Team     |
| [EDR Tool]       | Endpoint detection | Security Team     |
| [Cloud Security] | Cloud monitoring   | DevOps + Security |
| [Communication]  | Incident comms     | All Team          |

### 8.2 Evidence Preservation

- Use write-blockers for disk imaging
- Document chain of custody
- Store evidence in secure location
- Maintain evidence log

### 8.3 External Resources

| Resource        | Contact                  | Purpose            |
| --------------- | ------------------------ | ------------------ |
| Law Enforcement | [Local FBI Field Office] | Criminal incidents |
| Forensics Firm  | [Vendor Contact]         | Advanced forensics |
| Legal Counsel   | [Law Firm Contact]       | Legal guidance     |
| PR Firm         | [PR Contact]             | Media management   |

---

## 9. Testing and Maintenance

### 9.1 Tabletop Exercises

- **Frequency:** Quarterly
- **Participants:** All IR team members
- **Scenarios:** Varying severity levels
- **Documentation:** After-action reports

### 9.2 Runbook Review

- **Frequency:** Semi-annually
- **Reviewers:** Security Team, Legal, Management
- **Updates:** As needed based on lessons learned

### 9.3 Contact Information Updates

- **Frequency:** Monthly verification
- **Owner:** Security Manager
- **Distribution:** All team members

---

## Appendix A: Contact List

### Emergency Contacts

| Name   | Role               | Phone   | Email   |
| ------ | ------------------ | ------- | ------- |
| [Name] | Incident Commander | [Phone] | [Email] |
| [Name] | Technical Lead     | [Phone] | [Email] |
| [Name] | Legal Counsel      | [Phone] | [Email] |

### External Contacts

| Organization          | Contact   | Phone   |
| --------------------- | --------- | ------- |
| FBI Cyber Division    | [Contact] | [Phone] |
| Local Law Enforcement | [Contact] | [Phone] |
| Forensics Vendor      | [Contact] | [Phone] |

---

## Appendix B: Regulatory Requirements

### GDPR Breach Notification

- **Timeline:** 72 hours to supervisory authority
- **Content:** Nature, categories, approximate numbers, consequences, measures
- **Data Subject Notification:** Without undue delay if high risk

### CCPA Breach Notification

- **Timeline:** As required based on harm
- **Threshold:** 500+ California residents (AG notification)
- **Content:** Specific elements as defined by law

---

**Document Owner:** Security Team

**Review Cycle:** Semi-annual

**Next Review Date:** [Date]
