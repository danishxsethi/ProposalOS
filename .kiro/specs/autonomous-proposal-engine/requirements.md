# Requirements Document

## Introduction

The Autonomous Proposal Engine transforms ProposalOS from a human-assisted audit-and-proposal tool into a fully autonomous pipeline executing the complete loop: Discover → Audit → Diagnose → Propose → Outreach → Close → Deliver → Learn → Repeat. Sprint 1 (completed) established a bulletproof engine with agency-grade output. This spec covers the full autonomous pipeline starting from Sprint 2 (current) through Sprint 4, targeting zero human touch from prospect to delivery. The system processes prospects at scale across multiple verticals and geographies, with every cycle feeding a compounding intelligence flywheel. Target: 60,000 prospects/day, 100+ agencies, 100+ verticals, 3 countries, $775K MRR, <1% human touch by Sprint 6.

## Glossary

- **Pipeline_Orchestrator**: The top-level autonomous controller coordinating the full Discover → Audit → Diagnose → Propose → Outreach → Close → Deliver → Learn → Repeat loop, managing prospect state transitions and stage execution
- **Prospect_Discovery_Engine**: The subsystem that auto-discovers businesses via Google Maps API, Yelp, and industry directories, then qualifies them through multi-signal auditing and Pain Score gating
- **Audit_Orchestrator**: The existing module orchestration system (lib/orchestrator) running 8+ audit modules (website crawl, GBP, competitor, mobile UX, conversion, tech stack, security, accessibility, keyword gap, citations, paid search) in phased parallel execution
- **Diagnosis_Engine**: The LangGraph-based agentic pipeline that clusters audit findings into Pain_Clusters using vertical-specific playbooks and prioritizes them by business impact
- **Proposal_Generator**: The subsystem producing three-tier proposals (Essentials, Growth, Premium) with executive summaries, ROI projections, competitor comparisons, and agency-grade PDF/web output
- **Outreach_Agent**: The autonomous agent generating and sending personalized, proof-backed cold emails with audit-specific pain language, multi-domain rotation, and behavior-based follow-up branching
- **Email_QA_Scorer**: The quality gate scoring every outreach email for readability (5th grade level), word count (<80 words), jargon avoidance, finding references (≥2 specific findings), and spam risk before sending
- **Deal_Closer**: The subsystem tracking prospect engagement signals (opens, clicks, proposal views, scroll depth, tier selection) and managing the autonomous closing workflow including AI chat, scheduling, and Stripe checkout
- **Delivery_Engine**: The subsystem fulfilling accepted proposals by dispatching AI-powered service agents (speed optimization, SEO fixes, accessibility, security hardening, content generation) and verifying improvements via re-audit
- **Learning_Loop**: The compounding intelligence flywheel tracking win/loss outcomes, email performance, finding effectiveness, prompt quality, and pricing conversion to continuously improve every pipeline stage
- **Pain_Score**: A composite qualification score (0–100) computed from website speed (20), mobile issues (15), GBP neglect (15), no SSL (10), zero review responses (10), social media dormancy (10), competitor outperformance (10), and accessibility violations (10)
- **Waterfall_Enrichment**: Sequential data enrichment querying Apollo → Hunter → LinkedIn/Proxycurl → Clearbit to find decision-maker contact info (owner, marketing director, GM), only triggered after Pain_Score ≥ 60
- **Inbox_Rotation**: Distribution of outreach emails across multiple warm sender domains (max 50 emails/domain/day) with automated warmup and self-healing domain rotation
- **Human_Review_Queue**: A flagging mechanism routing the top 5% of high-value or ambiguous prospects to human operators, targeting <5% human touch overall
- **Tenant**: A white-label agency account operating the platform under its own branding, domains, client lists, and billing
- **Prospect**: A potential business client discovered, audited, and targeted by the pipeline
- **Finding**: A specific issue or opportunity identified during an audit module execution
- **Pain_Cluster**: A group of related findings diagnosed as a coherent business problem with an impact score
- **Tier**: A proposal pricing level (Essentials, Growth, Premium) mapping findings to service packages with delivery timelines
- **Scorecard**: A one-page visual report showing a prospect's Pain_Score versus their top local competitor, delivered as a tracked web link
- **Pre_Warming_Engine**: The subsystem that engages with prospects across GBP, Facebook, and Instagram 3–5 days before the outreach email lands, creating familiarity to boost open rates
- **Signal_Detector**: The subsystem monitoring external signals (bad reviews, competitor redesigns, new business licenses, hiring spikes) that indicate optimal outreach timing
- **AI_Sales_Chat**: The real-time AI assistant embedded on proposal pages that answers prospect questions, handles objections, and guides tier selection
- **Partner_Portal**: The subsystem managing agency partner relationships including lead packaging, delivery, engagement tracking, and per-lead or subscription billing
- **Cross_Tenant_Intelligence**: The anonymized, privacy-preserving learning layer that aggregates patterns across all tenants to improve the shared intelligence model

## Requirements

### Requirement 1: Autonomous Prospect Discovery and Qualification

**User Story:** As an agency operator, I want the system to autonomously discover, audit, and qualify business prospects from target cities and verticals, so that the pipeline has a continuous stream of qualified leads without manual sourcing.

#### Acceptance Criteria

1. WHEN a discovery job is triggered for a city and vertical combination, THE Prospect_Discovery_Engine SHALL query Google Maps API, Yelp, and industry directories to return business records containing at minimum: business name, website URL, city, industry, and listing source
2. WHEN a prospect is discovered, THE Prospect_Discovery_Engine SHALL run a multi-signal qualification audit covering website page speed, mobile responsiveness, SSL/HTTPS status, meta tags, schema markup, accessibility violations, CMS/tech stack detection, GBP claim status, photo count, review count and rating, review response rate, posting frequency, social media presence, last post date, and competitive positioning against the top 3 local competitors
3. WHEN the multi-signal audit completes, THE Prospect_Discovery_Engine SHALL compute a Pain_Score (0–100) using the weighted formula: website speed (20), mobile broken (15), GBP neglected (15), no SSL (10), zero review responses (10), social media dead (10), competitors outperforming (10), accessibility violations (10)
4. WHEN a prospect's Pain_Score is below the configurable qualification threshold (default: 60), THE Prospect_Discovery_Engine SHALL mark the prospect as "unqualified" and exclude the prospect from further pipeline processing
5. WHEN a prospect's Pain_Score meets or exceeds the qualification threshold, THE Prospect_Discovery_Engine SHALL trigger Waterfall_Enrichment querying Apollo, then Hunter, then LinkedIn/Proxycurl, then Clearbit in sequence until a decision-maker contact (owner, marketing director, or GM) with a verified email address is obtained
6. WHEN a prospect already exists in the database for the same Tenant, THE Prospect_Discovery_Engine SHALL skip that prospect and continue processing the remaining results
7. WHEN a discovery job completes, THE Prospect_Discovery_Engine SHALL persist all qualified prospects to the database with status "discovered", Pain_Score, score breakdown, top 3 findings, and decision-maker contact information
8. IF a data provider returns an error or times out during enrichment, THEN THE Prospect_Discovery_Engine SHALL skip that provider and continue with the next provider in the waterfall sequence
9. WHEN discovery is configured for a Tenant, THE Prospect_Discovery_Engine SHALL respect the Tenant's target industries, geographic regions, and daily prospect volume limits

### Requirement 2: Autonomous Audit Pipeline Triggering

**User Story:** As an agency operator, I want full audits to run automatically on qualified prospects, so that every prospect receives a deep multi-module analysis without manual intervention.

#### Acceptance Criteria

1. WHEN a prospect's status transitions to "discovered" with a qualifying Pain_Score, THE Pipeline_Orchestrator SHALL queue a full audit for that prospect using the existing Audit_Orchestrator
2. WHEN an audit is queued, THE Audit_Orchestrator SHALL execute all registered audit modules (website crawl, GBP, GBP deep, competitor, competitor strategy, mobile UX, conversion, tech stack, security, accessibility, keyword gap, citations, paid search, screenshots) in their defined phase order with configurable timeouts per phase
3. WHEN an audit completes with status COMPLETE or PARTIAL, THE Pipeline_Orchestrator SHALL transition the prospect's status to "audited" and store all findings and evidence snapshots
4. IF an audit fails with status FAILED, THEN THE Pipeline_Orchestrator SHALL mark the prospect as "audit_failed", log the failure reason with module-level detail, and exclude the prospect from further pipeline processing
5. WHILE the system is processing a batch of prospects, THE Pipeline_Orchestrator SHALL enforce a configurable concurrency limit to prevent resource exhaustion and downstream service overload
6. WHEN an audit completes, THE Pipeline_Orchestrator SHALL record the audit cost in cents and associate the cost with the originating Tenant

### Requirement 3: Autonomous Diagnosis and Proposal Generation

**User Story:** As an agency operator, I want the system to automatically diagnose audit findings and generate agency-grade tiered proposals, so that every audited prospect receives a professional proposal without human effort.

#### Acceptance Criteria

1. WHEN a prospect's status transitions to "audited", THE Pipeline_Orchestrator SHALL trigger the Diagnosis_Engine to cluster the audit findings into Pain_Clusters ranked by impact score using the appropriate vertical playbook
2. WHEN diagnosis completes, THE Proposal_Generator SHALL produce a proposal containing an executive summary, three pricing tiers (Essentials, Growth, Premium) with mapped finding IDs, ROI projections with best/base/worst scenarios, and a competitor comparison report
3. WHEN a proposal is generated, THE Proposal_Generator SHALL assign a unique web link token for prospect-facing access and generate an agency-grade PDF version
4. WHEN a proposal is generated, THE Pipeline_Orchestrator SHALL transition the prospect's status to "proposed" and send notifications via the existing webhook system
5. IF the Diagnosis_Engine produces zero Pain_Clusters from the audit findings, THEN THE Pipeline_Orchestrator SHALL mark the prospect as "low_value" and skip proposal generation
6. WHEN generating pricing for a proposal, THE Proposal_Generator SHALL use industry-specific benchmarks from the Learning_Loop and the Tenant's pricing multiplier configuration to calibrate tier pricing

### Requirement 4: Autonomous Proof-Backed Outreach

**User Story:** As an agency operator, I want the system to automatically send personalized outreach emails that lead with the prospect's specific pain and include real audit evidence, so that prospects receive compelling first-touch communications with 40%+ open rates.

#### Acceptance Criteria

1. WHEN a prospect's status transitions to "proposed", THE Outreach_Agent SHALL generate a personalized outreach email that leads with the prospect's specific pain derived from the Pain_Score breakdown and references at minimum two specific findings from the prospect's audit
2. WHEN generating outreach email copy, THE Outreach_Agent SHALL translate technical findings into vertical-specific business pain language (e.g., for dentists: "patients bouncing before they book" instead of "Core Web Vitals"; for HVAC: "homeowners can't request a quote from their phone" instead of "mobile responsiveness")
3. WHEN generating an outreach email, THE Outreach_Agent SHALL include a tracked web link to the prospect's Scorecard showing the prospect's Pain_Score versus their top local competitor
4. WHEN an outreach email is generated, THE Email_QA_Scorer SHALL score the email and THE Outreach_Agent SHALL only send emails scoring 90 or above on the quality scale that evaluates: 5th grade reading level, fewer than 80 words, no jargon, at least 2 specific audit finding references, and spam risk below threshold
5. IF an outreach email scores below 90 on the Email_QA_Scorer, THEN THE Outreach_Agent SHALL discard the email and regenerate a new version up to three times before marking the outreach as "generation_failed"
6. WHEN sending outreach emails, THE Outreach_Agent SHALL use Inbox_Rotation to distribute sends across the Tenant's warm sender domains with a maximum of 50 emails per domain per day
7. IF an outreach email fails to send due to a delivery error, THEN THE Outreach_Agent SHALL retry the send up to three times with exponential backoff before marking the outreach as "send_failed"
8. WHEN an outreach email is sent, THE Outreach_Agent SHALL schedule behavior-based follow-up emails using branching logic: opened but did not click triggers a competitor comparison angle; clicked audit link triggers full proposal delivery within 2 hours; viewed proposal for 2+ minutes triggers hot lead escalation; opened but did not reply after 3 attempts triggers a subject line variation; never opened triggers a different send time and subject line with a drop after 3 attempts
9. WHEN a prospect replies to an outreach email, THE Outreach_Agent SHALL pause the follow-up sequence for that prospect and flag the reply for processing

### Requirement 5: Email Quality Assurance and Deliverability

**User Story:** As an agency operator, I want every outreach email to pass a quality gate before sending, so that deliverability stays high and emails are psychologically effective.

#### Acceptance Criteria

1. WHEN the Email_QA_Scorer evaluates an email, THE Email_QA_Scorer SHALL compute a composite quality score (0–100) based on: reading level (target: 5th grade), word count (target: fewer than 80 words), jargon presence (target: zero jargon terms), specific finding references (target: at least 2), and spam trigger word density
2. WHEN the Email_QA_Scorer evaluates an email, THE Email_QA_Scorer SHALL return the composite score along with a breakdown of individual dimension scores and specific improvement suggestions for any dimension scoring below threshold
3. THE Email_QA_Scorer SHALL serialize its scoring configuration (dimension weights, thresholds, jargon word list) to JSON and THE Email_QA_Scorer SHALL deserialize the same configuration from JSON, producing an equivalent configuration object
4. IF an email contains personalization tokens that reference non-existent audit data, THEN THE Email_QA_Scorer SHALL flag the email as invalid and prevent sending

### Requirement 6: Autonomous Deal Closing and Self-Serve Checkout

**User Story:** As an agency operator, I want the system to track prospect engagement and autonomously manage the closing workflow with self-serve checkout, so that interested prospects convert to paying clients without manual sales effort.

#### Acceptance Criteria

1. WHEN a prospect opens an outreach email or clicks the proposal link, THE Deal_Closer SHALL record the engagement event with a timestamp, event type, and source channel
2. WHEN a prospect views the proposal page, THE Deal_Closer SHALL track page view duration, scroll depth, tier hover interactions, and tier selection clicks
3. WHEN a prospect's cumulative engagement score exceeds a configurable threshold, THE Deal_Closer SHALL transition the prospect's status to "hot_lead" and trigger speed-to-lead automation
4. WHEN a prospect selects a tier and initiates checkout on the proposal page, THE Deal_Closer SHALL create a Stripe checkout session using the existing billing integration and transition the prospect's status to "closing"
5. WHEN a Stripe payment succeeds, THE Deal_Closer SHALL transition the prospect's status to "closed_won", create a client record, trigger the auto-onboarding flow (welcome email, client dashboard access), and initiate delivery
6. IF a prospect's engagement score is in the top 5% of all active prospects for the Tenant, THEN THE Pipeline_Orchestrator SHALL route that prospect to the Human_Review_Queue for optional operator intervention
7. IF a Stripe payment fails, THEN THE Deal_Closer SHALL retry the payment and send the prospect a payment recovery email
8. WHEN a prospect clicks an "Interested" CTA, THE Deal_Closer SHALL present an automated scheduling interface and auto-send preparation materials containing the prospect's audit summary

### Requirement 7: Autonomous Service Delivery

**User Story:** As an agency operator, I want the system to automatically fulfill accepted proposals using AI-powered service agents, so that closed deals transition to active delivery without manual handoff.

#### Acceptance Criteria

1. WHEN a prospect's status transitions to "closed_won", THE Delivery_Engine SHALL parse the accepted proposal tier and generate a list of deliverables mapped to the tier's finding IDs with estimated completion dates based on the tier's delivery timeline
2. WHEN deliverables are generated, THE Delivery_Engine SHALL create tasks in the delivery queue and dispatch them to the appropriate AI service agents (speed optimization, SEO fixes, accessibility remediation, security hardening, content generation)
3. WHEN a deliverable task is completed by an AI service agent, THE Delivery_Engine SHALL run a verification re-audit on the affected area to confirm improvement and generate a before/after comparison
4. WHEN a deliverable task is completed and verified, THE Delivery_Engine SHALL notify the client through the existing client portal, update the delivery status, and include the before/after comparison
5. IF a deliverable task exceeds its estimated completion date, THEN THE Delivery_Engine SHALL escalate the task and notify the Tenant operator
6. WHEN all deliverables for a proposal are completed, THE Delivery_Engine SHALL transition the client's status to "delivered" and trigger a satisfaction survey

### Requirement 8: Compounding Intelligence Learning Loop

**User Story:** As an agency operator, I want the system to learn from every pipeline outcome so that audit quality, proposal conversion, outreach effectiveness, and pricing accuracy continuously improve with every cycle.

#### Acceptance Criteria

1. WHEN a proposal is accepted or rejected, THE Learning_Loop SHALL update the Finding effectiveness scores using the existing trackFindingOutcome mechanism, recording which findings resonated and which did not per vertical
2. WHEN an outreach sequence completes (prospect converts or sequence exhausts), THE Learning_Loop SHALL record the outreach template performance including open rate, click rate, reply rate, and conversion rate, and amplify winning patterns while suppressing losing patterns
3. WHEN an audit completes, THE Learning_Loop SHALL update industry benchmark statistics using the existing updateBenchmark mechanism with the audit's metric data
4. WHEN the Learning_Loop accumulates outcome data for a given industry-vertical-city combination, THE Learning_Loop SHALL recalibrate the Proposal_Generator's pricing model based on historical conversion rates at each tier
5. WHEN a prompt used in diagnosis or proposal generation receives a QA score, THE Learning_Loop SHALL update the prompt performance statistics using the existing trackPromptOutcome mechanism
6. WHEN win/loss data is captured, THE Learning_Loop SHALL store reason codes (objections raised, competitor mentioned, price sensitivity) and use the accumulated data to refine vertical playbooks

### Requirement 9: Multi-Tenant White-Label Pipeline

**User Story:** As a platform administrator, I want each agency tenant to operate an independent autonomous pipeline under its own branding, so that the platform scales across 100+ agencies with complete isolation.

#### Acceptance Criteria

1. THE Pipeline_Orchestrator SHALL isolate all pipeline data (prospects, audits, proposals, outreach, deliveries) by Tenant ID, ensuring no data leakage between tenants
2. WHEN a Tenant configures its pipeline, THE Pipeline_Orchestrator SHALL allow the Tenant to set target industries, geographic regions, daily volume limits, outreach schedules, pricing multipliers, and qualification threshold (Pain_Score minimum)
3. WHEN outreach emails are sent on behalf of a Tenant, THE Outreach_Agent SHALL use the Tenant's branding configuration including brand name, logo, contact email, and sender domains
4. WHEN proposals are generated for a Tenant, THE Proposal_Generator SHALL apply the Tenant's white-label branding to the proposal web page and PDF
5. THE Pipeline_Orchestrator SHALL track per-Tenant API costs and enforce configurable spending limits per billing cycle, pausing the pipeline for a Tenant when the limit is reached
6. WHEN a Tenant is onboarded, THE Pipeline_Orchestrator SHALL provision the Tenant's pipeline configuration with sensible defaults and allow the Tenant to begin processing within 24 hours

### Requirement 10: Pipeline Observability and Human Override

**User Story:** As a platform administrator, I want full visibility into the autonomous pipeline's operation and the ability to intervene when needed, so that the system remains reliable and controllable at scale.

#### Acceptance Criteria

1. THE Pipeline_Orchestrator SHALL expose real-time pipeline metrics including: prospects discovered per day, audits completed per day, proposals generated per day, outreach emails sent per day, open rate, reply rate, conversion rate, and per-stage error rate
2. WHEN any pipeline stage fails for a prospect, THE Pipeline_Orchestrator SHALL log the failure with the stage name, error details, prospect identifier, and Tenant ID
3. WHEN a prospect is routed to the Human_Review_Queue, THE Pipeline_Orchestrator SHALL display the prospect in the admin dashboard with full context including audit results, proposal details, engagement history, and Pain_Score breakdown
4. WHEN an operator approves a prospect in the Human_Review_Queue, THE Pipeline_Orchestrator SHALL resume the pipeline for that prospect from the current stage
5. WHEN an operator rejects a prospect in the Human_Review_Queue, THE Pipeline_Orchestrator SHALL terminate the pipeline for that prospect and record the rejection reason
6. IF the pipeline error rate for any stage exceeds 10% over a rolling one-hour window, THEN THE Pipeline_Orchestrator SHALL pause that stage, alert the platform administrator, and continue processing other stages
7. WHEN an operator manually overrides a prospect's pipeline status, THE Pipeline_Orchestrator SHALL log the override action with the operator identity and continue processing from the new status

### Requirement 11: High-Throughput Pipeline Scaling

**User Story:** As a platform administrator, I want the pipeline to handle 60,000 prospects per day across multiple countries and verticals, so that the platform meets its Sprint 6 growth targets.

#### Acceptance Criteria

1. THE Pipeline_Orchestrator SHALL process prospect batches using configurable parallelism with a target throughput of 60,000 prospects per day across all tenants
2. WHEN processing prospects across multiple countries, THE Pipeline_Orchestrator SHALL apply country-specific configurations for language, currency, data provider selection, and compliance requirements
3. WHILE the pipeline is under high load, THE Pipeline_Orchestrator SHALL implement backpressure mechanisms to prevent downstream service overload by throttling intake when queue depth exceeds a configurable threshold
4. WHEN a pipeline stage becomes a bottleneck, THE Pipeline_Orchestrator SHALL queue excess work items and process them in FIFO order as capacity becomes available
5. THE Pipeline_Orchestrator SHALL support horizontal scaling by ensuring all pipeline state is persisted in the database and no stage relies on in-memory state across invocations

### Requirement 12: Prospect State Machine and Pipeline Coordination

**User Story:** As a developer, I want a well-defined state machine governing prospect lifecycle transitions, so that the pipeline stages execute in the correct order and invalid transitions are prevented.

#### Acceptance Criteria

1. THE Pipeline_Orchestrator SHALL manage prospect status through the following ordered states: discovered → audited → proposed → outreach_sent → hot_lead → closing → closed_won → delivering → delivered, with terminal states: unqualified, audit_failed, low_value, closed_lost
2. WHEN a pipeline stage attempts to transition a prospect to a state that is not a valid successor of the current state, THE Pipeline_Orchestrator SHALL reject the transition and log the invalid transition attempt
3. WHEN a prospect's status transitions between any two states, THE Pipeline_Orchestrator SHALL record the transition with a timestamp, the originating stage, and the Tenant ID
4. THE Pipeline_Orchestrator SHALL serialize prospect state transition history to JSON and THE Pipeline_Orchestrator SHALL deserialize the same history from JSON, producing an equivalent transition record

### Requirement 13: Multi-Channel Pre-Warming

**User Story:** As an agency operator, I want the system to engage with prospects across GBP, Facebook, and Instagram before the outreach email lands, so that the prospect recognizes the sender name and open rates increase.

#### Acceptance Criteria

1. WHEN a prospect's status transitions to "proposed" and the prospect has a GBP listing, THE Pre_Warming_Engine SHALL schedule a GBP engagement action (question about services, post interaction, or genuine review engagement) 3–5 days before the outreach email is scheduled to send
2. WHEN a prospect has active social media profiles (Facebook, Instagram), THE Pre_Warming_Engine SHALL schedule cross-platform touchpoints (page like, post comment, follow) within the 3–5 day pre-warming window
3. WHEN all scheduled pre-warming actions for a prospect are completed or the pre-warming window expires, THE Pre_Warming_Engine SHALL transition the prospect to the outreach-ready state and allow the Outreach_Agent to proceed
4. THE Pre_Warming_Engine SHALL enforce per-platform daily action limits to avoid detection and account flagging (configurable per platform, default: 20 GBP actions/day, 15 Facebook actions/day, 15 Instagram actions/day)
5. IF a pre-warming action fails or the platform blocks the action, THEN THE Pre_Warming_Engine SHALL skip that action and continue with remaining scheduled actions without blocking the outreach timeline

### Requirement 14: Signal-Based Selling Triggers

**User Story:** As an agency operator, I want the system to detect real-time business signals that indicate optimal outreach timing, so that prospects are contacted at the moment they are most likely to convert.

#### Acceptance Criteria

1. WHEN the Signal_Detector identifies a new negative Google review (≤3 stars) for a prospect, THE Pipeline_Orchestrator SHALL prioritize that prospect and trigger an outreach email focused on reputation management within 24 hours
2. WHEN the Signal_Detector detects a website change for a prospect (via periodic re-crawl comparison), THE Pipeline_Orchestrator SHALL trigger an outreach email highlighting the prospect's active investment in their online presence and areas still needing improvement
3. WHEN the Signal_Detector identifies a competitor of the prospect that has recently upgraded their website or GBP, THE Pipeline_Orchestrator SHALL trigger an urgency-based outreach email with an updated competitor comparison
4. WHEN the Signal_Detector detects a new business license filing in a target geography, THE Pipeline_Orchestrator SHALL add the new business to the discovery queue as a high-priority prospect
5. WHEN a signal-triggered outreach is generated, THE Outreach_Agent SHALL reference the specific signal event in the email body (e.g., "We noticed a recent review on your Google listing...")
6. THE Signal_Detector SHALL run signal checks on a configurable schedule (default: daily for reviews and competitor changes, weekly for business license filings) and SHALL deduplicate signals to prevent sending multiple outreach emails for the same event

### Requirement 15: AI Sales Chat and Objection Handling

**User Story:** As an agency operator, I want an AI assistant on proposal pages that answers prospect questions and handles objections in real-time, so that interested prospects convert without waiting for a human response.

#### Acceptance Criteria

1. WHEN a prospect views a proposal page, THE AI_Sales_Chat SHALL display a chat interface after a configurable delay (default: 30 seconds or when scroll depth exceeds 50%)
2. WHEN a prospect sends a message through the AI_Sales_Chat, THE AI_Sales_Chat SHALL respond within 5 seconds using context from the prospect's audit findings, proposal details, and the Tenant's configured objection handling playbook
3. WHEN the AI_Sales_Chat receives a pricing objection, THE AI_Sales_Chat SHALL respond with data-backed ROI justification using the prospect's specific audit findings and industry benchmarks
4. WHEN the AI_Sales_Chat detects purchase intent (e.g., "how do I get started", "what's the next step", tier selection questions), THE AI_Sales_Chat SHALL present the self-serve checkout flow and offer to schedule a call
5. IF the AI_Sales_Chat cannot confidently answer a question (confidence below configurable threshold, default: 70%), THEN THE AI_Sales_Chat SHALL escalate to the Human_Review_Queue and inform the prospect that a specialist will follow up
6. WHEN an AI_Sales_Chat conversation completes, THE Learning_Loop SHALL record the conversation outcome (converted, escalated, abandoned) and the objections raised to improve future objection handling

### Requirement 16: Agency Partner Network

**User Story:** As a platform administrator, I want to package and sell qualified leads to agency partners, so that every lead generates revenue even when direct fulfillment is not chosen.

#### Acceptance Criteria

1. WHEN an agency partner is onboarded, THE Partner_Portal SHALL create a partner account with configurable lead delivery preferences (verticals, geographies, volume, pricing model)
2. WHEN a qualified prospect is available and matches a partner's delivery preferences, THE Partner_Portal SHALL package the prospect with full audit results, proposal, Pain_Score breakdown, and decision-maker contact information
3. WHEN a lead is delivered to a partner, THE Partner_Portal SHALL track the lead status (delivered, viewed, contacted, converted, rejected) and display real-time engagement data in the partner dashboard
4. THE Partner_Portal SHALL support two pricing models: per-lead pricing ($200–$500 per warm lead, configurable per vertical) and subscription pricing ($1K–$2K/month for a configurable lead volume)
5. WHEN a partner converts a delivered lead, THE Learning_Loop SHALL record the conversion and use the outcome data to improve lead scoring and matching for future partner deliveries
6. THE Partner_Portal SHALL isolate partner data from direct pipeline data and from other partners, ensuring each partner only sees leads delivered to them

### Requirement 17: Cross-Tenant Intelligence and Predictive Scoring

**User Story:** As a platform administrator, I want the system to learn from anonymized patterns across all tenants and predict lead close probability, so that the platform gets smarter with every cycle and every tenant benefits from the collective intelligence.

#### Acceptance Criteria

1. WHEN the Learning_Loop processes outcome data from any tenant, THE Cross_Tenant_Intelligence SHALL aggregate anonymized patterns (win rates by vertical, effective finding types, optimal pricing ranges, best-performing email patterns) into a shared intelligence model without exposing tenant-specific data
2. WHEN a new prospect enters the pipeline, THE Cross_Tenant_Intelligence SHALL compute a predictive close probability score (0–100) based on the shared intelligence model using the prospect's vertical, Pain_Score, geographic region, and business characteristics
3. WHEN the predictive close probability score is available, THE Pipeline_Orchestrator SHALL use the score to prioritize prospect processing order (higher probability prospects processed first)
4. THE Cross_Tenant_Intelligence SHALL ensure that no tenant-identifiable data (business names, contact information, tenant IDs) is included in the shared intelligence model
5. WHEN the shared intelligence model is updated, THE Cross_Tenant_Intelligence SHALL version the model and allow rollback to a previous version if quality metrics degrade
