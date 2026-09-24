# External Integrations

| Provider/integration | Source evidence | Runtime truth | Risk |
| --- | --- | --- | --- |
| Google Places | GBP/competitor modules, env examples | NOT_EVIDENCED | identity mismatch and quota/provider failure semantics |
| Google PageSpeed | website/Core Web Vitals/mobile modules | NOT_EVIDENCED | zero fallback can create negative claims |
| SerpAPI | competitor/SEO/citations/keyword/video modules | NOT_EVIDENCED | rate limits and no-result ambiguity |
| Vertex/Gemini | diagnosis/reputation/content/proposal/QA paths | NOT_EVIDENCED | credentials/model/prompt/cost/PII unknown |
| OpenAI | dependency/source references | NOT_EVIDENCED | actual production model path unclear |
| Resend | email provider boundary | NOT_EVIDENCED | live-send gate and multiple sender implementations |
| Zoho SMTP | recent gated provider commit | NOT_EVIDENCED | sandbox/domain/deliverability not verified |
| Stripe | checkout, webhook, portal, reconciliation | NOT_EVIDENCED | payment/acceptance/fulfillment discontinuity |
| GCS | PDF/proposal/artifact source and Terraform | NOT_EVIDENCED | bucket policy, tenant paths, retention unknown |
| Redis/Upstash | cache/rate limit dependencies | local build says disabled | fallback semantics and distributed limits unknown |
| LangSmith | package and tracing source | local build/test says disabled | no privacy/trace/eval evidence |
| CRM/Slack/n8n/Dify | code/docs references vary | NOT_EVIDENCED | no production boundary proven |

No real outreach, charges, customer communication, or provider mutation was performed. Provider inventory is source-derived, not a credential validation result.
