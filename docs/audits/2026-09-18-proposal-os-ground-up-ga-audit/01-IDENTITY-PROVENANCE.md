# Identity & Provenance

| Layer | Claimed identity | Observed identity | Evidence | Match |
| --- | --- | --- | --- | --- |
| Repository | `danishxsethi/ProposalOS` | Remote points to `https://github.com/danishxsethi/ProposalOS.git` | `git remote -v` | YES |
| Source | Current release | Branch `remediation/proposalos-e2e`, HEAD `88967f1`, tree `6183935` | Git direct observation | YES for local source |
| Worktree | clean | Clean at freeze; audit artifacts were added afterward and are uncommitted | Git status | YES at freeze |
| Build | CI/deploy build | Node 20 Docker build; local Next 16.2.1 build succeeds | `Dockerfile`, `cloudbuild.yaml`, `npm run build` | PARTIAL |
| Image | commit-tagged Artifact Registry image | No registry object or digest observed | GCP auth refresh blocked | NOT_EVIDENCED |
| Deployment | Cloud Run `proposal-engine` / staging variant | No service/revision/traffic observed | GCP auth refresh blocked | BLOCKED |
| Runtime | production service | No endpoint or runtime trace authorized/available | No live URL established | BLOCKED |
| Database schema | Prisma schema and migrations | Source schema validates; live schema unknown | `npx prisma validate` | PARTIAL |
| Temporal workers | not claimed by current graph comment | No Temporal SDK/dependency/source worker found | `package.json`, graph source inventory | NOT_IMPLEMENTED |
| Evidence/report | generated audit/proposal | No real authorized runtime trace | No live DB/provider/runtime access | NOT_EVIDENCED |

Cloud Build deploys a commit tag but also pushes a mutable environment `latest` tag for caching. `deploy.sh` builds locally and deploys a short SHA, with secrets and runtime settings assembled by script. Immutable digest provenance, reproducible build attestations, and CI-only deployment were not proven.

Notion authority was not accessible in this workspace. Historical repository reports were read as historical claims only and were not treated as current truth.
