# ProposalOS AWS monthly cost estimate

**Estimate date:** 2026-10-03
**Planning region:** `us-east-2` (US East, Ohio)
**Initial monthly planning ceiling:** **$400 USD** for ProposalOS production and low-footprint staging

The user selected US/Canada as the primary user geography and delegated the monthly ceiling. Ohio is a starting region near the current GCP `us-central1` deployment. Confirm latency, data-residency, service availability, and recovery targets before provisioning.

## Planning estimate

| Component                    | Monthly allowance (USD) | Sizing assumption                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production PostgreSQL        |                    $106 | RDS PostgreSQL 15, `db.t4g.medium` equivalent (2 vCPU/4 GiB), Multi-AZ with one standby, 50 GiB gp3. A read-only AWS Price List query returned about $0.129 per DB-instance hour plus $0.23/GB-month for Multi-AZ gp3 storage in Ohio. |
| Production API and web       |                     $72 | Four always-on Linux/x86 Fargate tasks total (two per service across AZs), each 0.5 vCPU/1 GiB. Fargate rate arithmetic uses the published US East example rates; confirm Ohio rates in the AWS Pricing Calculator.                    |
| Production workers           |                     $18 | Two always-on Linux/x86 Fargate worker tasks, each 0.25 vCPU/0.5 GiB.                                                                                                                                                                  |
| Redis                        |                     $25 | Placeholder for one small managed Redis-compatible node. A replica or stronger recovery target will add cost; topology is not selected.                                                                                                |
| Four scheduled batch jobs    |                     $15 | Small on-demand Fargate tasks. Exact schedules, overlap rules, runtime, and payloads remain unknown.                                                                                                                                   |
| Application Load Balancer    |                     $23 | One ALB, hourly charge plus a small LCU allowance.                                                                                                                                                                                     |
| CloudFront and WAF           |                     $15 | One CloudFront Pro flat-rate distribution, using a public ALB origin; this plan includes CDN, WAF, DNS, logging, and usage allowances. Private VPC origins require the $200/month Business plan and would exceed the current ceiling.  |
| Public IPv4                  |                     $29 | Allowance for six production task addresses plus two ALB addresses at $0.005/IP-hour. Public Fargate tasks require a security review; task inbound rules must accept traffic only from the ALB.                                        |
| CloudWatch, ECR, and secrets |                     $25 | Low-volume logs/metrics, image storage, and Secrets Manager allowance. Retention and log volume can change this materially.                                                                                                            |
| Staging database             |                     $35 | Small single-AZ PostgreSQL instance with about 20 GiB storage. Staging recovery and uptime targets are not set.                                                                                                                        |
| Staging Redis                |                     $12 | One `cache.t4g.micro` node running Redis OSS 7.1. The September 2026 Ohio price list is $0.016/node-hour, or about $11.68 over 730 hours.                                                                                              |
| Staging compute              |                     $15 | Low-footprint allowance assuming staging tasks are stopped or scaled to zero when not in use.                                                                                                                                          |
| **Planning total**           |                **$390** | Leaves roughly $10/month against the initial $400 alert target.                                                                                                                                                                        |

The estimate is intentionally a lean starting profile and is not a quote. It relies on the measured baseline of roughly 725,000 API/web requests over 30 days and low average CPU use recorded in the [migration execution tracker](https://app.notion.com/p/3ee262f6072181b2a4fce61197b2d210). Database I/O, storage growth, external API usage, and current schedules still need measurement.

## GCP overlap during migration (not included above)

A read-only recheck on October 3, 2026 found the GCP production database `proposal-db` in `RUNNABLE` state with activation policy `ALWAYS`, configured as regional HA `db-custom-2-4096`. At the previously checked us-central1 rate, its compute is about **$0.2876/hour**, **$6.90/day**, or **$210 per 730-hour month**, before storage, backup, network, and other active GCP services. This is separate from the $400 AWS planning target and is not a full estimate of GCP spend. Keep the source available through a safe cutover/rollback window, and include this overlap in the migration schedule.

## Included and excluded

Included allowances cover core production and low-footprint staging compute, a Multi-AZ production database, a small Redis node, load balancing, private object delivery through CloudFront/S3, basic WAF, observability, and scheduled work. Before committing to the design, confirm whether staging can share the production CloudFront distribution and whether the app can safely use a public ALB origin.

Excluded: taxes, one-time migration or data-transfer charges, unknown database backup/I/O/network use, variable internet egress above the allowance, external services (AI/Maps/PageSpeed/Stripe/SERP/email), added Redis failover capacity, and any paid Marketplace WAF rules. A private CloudFront VPC origin is also excluded because the currently listed Business plan costs $200/month by itself.

The $400 amount is an **alerting budget**, not a hard spend cap. AWS Budgets can notify on actual or forecast spend and can be configured with separate budget actions, but those actions have not been created or tested. Do not treat an alert as preventing charges.

The staging foundation currently being provisioned has no running ECS tasks or NAT Gateway. Its modeled recurring core is approximately $35/month for the staging database allowance plus $12/month for one Redis node, before low-volume storage, logs, backup growth, or data transfer. This is included in the $390 planning total.

## Before provisioning

1. Confirm production and staging RPO/RTO, app task minimums, Redis failover, and staging uptime.
2. Verify the Ohio prices and exact architecture in the [AWS Pricing Calculator](https://calculator.aws/), including the final choice of CloudFront origin and egress/network path.
3. Recalculate if private VPC origins, a Redis replica, NAT Gateway, higher task counts, or larger log retention are required.
4. Set a ProposalOS-scoped monthly budget and alert recipients after the project-scoped AWS provisioning role exists. The shared AWS account currently has no ProposalOS-specific budget.

## Pricing references

- [Amazon RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/)
- [AWS Price List: RDS US East (Ohio)](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-2/index.csv)
- [AWS Price List: ElastiCache US East (Ohio)](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonElastiCache/current/us-east-2/index.csv)
- [ElastiCache engine version support and lifecycle](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html)
- [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/)
- [Elastic Load Balancing pricing](https://aws.amazon.com/elasticloadbalancing/pricing/)
- [CloudFront plans and pricing](https://aws.amazon.com/cloudfront/pricing/)
- [AWS WAF pricing](https://aws.amazon.com/waf/pricing/)
- [Amazon VPC and public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [AWS Budgets actions](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html)
