# Proposal OS SSRF egress isolation plan

Date: 2026-10-09
Status: source-only plan; no AWS resources or Terraform state changed.

## Source behavior qualified locally

`safeFetch` now validates all DNS answers using Node's OS resolver, rejects any non-public IPv4/IPv6 answer, and gives each request hop an Undici dispatcher that returns only the exact validated address set. Redirects remain manual; every redirect is revalidated and receives a fresh pinned dispatcher. The original hostname remains in the URL, so default TLS SNI and certificate hostname checks remain in effect. Request credentials and query strings are omitted from SSRF log fields.

The per-request dispatcher intentionally overrides caller/global dispatchers and does not inherit `HTTP_PROXY`/`HTTPS_PROXY`. No proxy environment variables are declared in tracked app or Terraform configuration. The local shell's proxy values and any AWS task's runtime environment were not read.

Deterministic tests cover mixed public/private DNS answers, special-use address ranges, redirect-to-private rejection, and a `.invalid` hostname connected through the locally pinned test address without a second DNS lookup. No metadata endpoint was probed.

## Remaining browser boundary

`guardBrowserPage()` intercepts and validates each Chromium request, including subresources, but Chromium performs its own DNS lookup after that validation. A rebinding DNS answer can therefore differ at connect time. The browser is not protected by the Node `safeFetch` dispatcher.

The staging and production app-task security groups in `infra/aws/proposalos/network.tf` and `infra/aws/proposalos-production/network.tf` currently permit outbound TCP 443 to `0.0.0.0/0`. The one-shot importer security groups also have broad HTTPS egress. This task changes none of those rules.

**Until browser egress is independently isolated and tested, keep arbitrary public-site auditing that can use Chromium disabled.** Continue only the Node fetch path for targets covered by `safeFetch` pinning and the separately reviewed fixed-host provider calls.

## Proposed implementation sequence

1. **Separate the browser worker.** Run Chromium in a dedicated ECS task/service with no application database credentials, no broad application secrets, and no powerful task role. Use the existing internal job/result boundary only after its production isolation and tenant scope are independently verified.
2. **Require a controlled egress proxy.** Configure Chromium to use a proxy that resolves every requested hostname once, rejects every non-public IPv4/IPv6 result, and connects only to that validated address while preserving browser TLS hostname checks. The proxy must validate each CONNECT/request hop and fail closed on resolution or policy errors.
3. **Make proxy bypass fail closed.** Give the browser task an egress security group that permits only the proxy service and required internal queue/result traffic. Do not give that task general outbound HTTPS. Account separately for ECS task-credential endpoints; keep the browser task role absent or restricted to the minimum queue/result operations.
4. **Add network-layer denial.** Evaluate AWS Network Firewall or equivalent subnet egress controls to deny private, link-local, loopback, carrier-grade NAT, multicast, documentation, reserved, IPv6 unique-local, IPv6 link-local, and metadata ranges. Keep public HTTP/S crawling available through the proxy. Do not rely on a security group allow to `0.0.0.0/0` as the non-public-address filter.
5. **Preserve application-provider access.** Keep Bedrock, storage, email, payment, and other fixed-provider calls on the application path. Restrict only the browser worker first; do not remove required egress from the entire app service without mapping the provider destinations and AWS endpoints.
6. **Prove before enabling.** In an isolated test VPC, verify public HTTP/S sites, multiple A/AAAA answers, changing DNS answers, redirects to private addresses, IPv4/IPv6 special ranges, subresources, WebSockets, and proxy bypass attempts. Use local controlled DNS/server fixtures; never probe cloud metadata. Confirm no direct browser socket can bypass the proxy and that required public crawling still works.
7. **Review cost and reliability.** Compare an on-demand proxy task with a small continuously available service and the selected network-firewall option. Include NAT/data processing, availability-zone dependency, latency, and cold-start effects. Obtain the current AWS price estimate before proposing any apply.

The plan requires a source design review and an owner-approved infrastructure change in a later task. Nothing here authorizes `terraform plan` against live state or `apply`.
