locals {
  # GitHub OIDC trust for the transferred repository, using GitHub's immutable
  # identifier claims per AWS's documented guidance (IAM condition keys
  # `repository_owner_id` / `repository_id` — names on GitHub are mutable; IDs
  # are not). The earlier subject string "repo:Danish-Sethi@324834111/ProposalOS@1158247398:..."
  # was malformed: GitHub never issues a `sub` in that shape, so a role trusting
  # only that value would reject every legitimate workflow token.
  github_actions_main_subjects = [
    "repo:Danish-Sethi/ProposalOS:ref:refs/heads/main"
  ]
  github_repository_owner_id = "324834111"
  github_repository_id       = "1158247398"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags = merge(local.common_tags, { Name = "proposalos-github-actions" })
}

resource "aws_iam_role" "github_actions_production_deploy" {
  name                 = "ProposalOSGitHubActionsProductionDeploy"
  description          = "GitHub main can publish immutable ProposalOS images and deploy the production ECS services."
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github_actions.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = local.github_actions_main_subjects
          # Immutable identity of the transferred repository (owner + repo IDs):
          # survives renames and cannot be claimed by a different account.
          "token.actions.githubusercontent.com:repository_owner_id" = local.github_repository_owner_id
          "token.actions.githubusercontent.com:repository_id"       = local.github_repository_id
          "token.actions.githubusercontent.com:ref"                 = "refs/heads/main"
        }
      }
    }]
  })
  tags = merge(local.common_tags, { Name = "proposalos-github-actions-production-deploy" })
}
