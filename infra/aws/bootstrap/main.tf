locals {
  project = "ProposalOS"
  tags = {
    Project    = local.project
    ManagedBy  = "Terraform"
    CostCenter = "proposalos"
  }
  state_bucket_name     = "proposalos-terraform-state-${var.aws_account_id}-${var.aws_region}"
  provisioner_role_name = "ProposalOSMigrationProvisioner"
  service_boundary_name = "ProposalOSServiceRoleBoundary"
}

resource "aws_s3_bucket" "terraform_state" {
  bucket        = local.state_bucket_name
  force_destroy = false
  tags          = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = false
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_policy" "terraform_state_tls_only" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        aws_s3_bucket.terraform_state.arn,
        "${aws_s3_bucket.terraform_state.arn}/*"
      ]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.terraform_state]
}

resource "aws_iam_policy" "service_role_boundary" {
  name        = local.service_boundary_name
  description = "Maximum permissions for ProposalOS ECS task and build roles."
  tags        = local.tags
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "GetECRAuthorizationToken"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "PullAndPushOnlyProposalOSImages"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        Resource = "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/proposalos-*"
      },
      {
        Sid    = "WriteOnlyProposalOSBuildAndRuntimeLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/proposalos-*:*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/codebuild/proposalos-*:*"
        ]
      },
      {
        Sid      = "ReadApplicationSecretsForApplicationRoles"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:proposalos/app/*"
        Condition = {
          StringEquals = {
            "aws:PrincipalTag/Project"  = local.project
            "aws:PrincipalTag/RoleType" = ["api", "worker", "importer"]
          }
        }
      },
      {
        Sid      = "WriteOnlyStagingDatabaseUrlForImporterRole"
        Effect   = "Allow"
        Action   = ["secretsmanager:PutSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:proposalos/app/staging/DATABASE_URL-*"
        Condition = {
          StringEquals = {
            "aws:PrincipalTag/Project"  = local.project
            "aws:PrincipalTag/RoleType" = "importer"
          }
        }
      },
      {
        Sid      = "WriteOnlyProductionDatabaseUrlForProductionImporterRole"
        Effect   = "Allow"
        Action   = ["secretsmanager:PutSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:proposalos/app/production/DATABASE_URL-*"
        Condition = {
          StringEquals = {
            "aws:PrincipalTag/Project"  = local.project
            "aws:PrincipalTag/RoleType" = "importer"
            "aws:PrincipalArn"          = "arn:aws:iam::${var.aws_account_id}:role/ProposalOSProductionImporterTaskRole"
          }
        }
      },
      {
        Sid      = "ReadRDSMasterSecretOnlyForImporterRole"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:rds!db-*"
        Condition = {
          StringEquals = {
            "aws:PrincipalTag/Project"  = local.project
            "aws:PrincipalTag/RoleType" = "importer"
          }
        }
      },
      {
        Sid    = "ProposalOSObjectStorage"
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetObject",
          "s3:PutObject",
          "s3:PutObjectTagging",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = [
          "arn:aws:s3:::proposalos-data-*",
          "arn:aws:s3:::proposalos-data-*/*"
        ]
      },
      {
        Sid    = "ReadMigrationExportOnlyForImporterRole"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:GetObjectAttributes", "s3:GetBucketLocation"]
        Resource = [
          "arn:aws:s3:::proposalos-migration-410432886960-20261003",
          "arn:aws:s3:::proposalos-migration-410432886960-20261003/*"
        ]
        Condition = {
          StringEquals = {
            "aws:PrincipalTag/Project"  = local.project
            "aws:PrincipalTag/RoleType" = "importer"
          }
        }
      },
      {
        Sid    = "InvokeApprovedProposalOSNovaModelsForApiRoles"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = concat(
          [
            "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-micro-v1:0",
            "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-2-lite-v1:0"
          ],
          [for region in ["us-east-1", "us-east-2", "us-west-2"] : "arn:aws:bedrock:${region}::foundation-model/amazon.nova-micro-v1:0"],
          [for region in ["us-east-1", "us-east-2", "us-west-2"] : "arn:aws:bedrock:${region}::foundation-model/amazon.nova-2-lite-v1:0"]
        )
        Condition = {
          StringEquals = {
            "aws:PrincipalTag/Project"  = local.project
            "aws:PrincipalTag/RoleType" = "api"
          }
        }
      },
      {
        Sid    = "ReadApprovedProposalOSNovaInferenceProfileForApiRoles"
        Effect = "Allow"
        Action = ["bedrock:GetInferenceProfile"]
        Resource = [
          "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-micro-v1:0",
          "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-2-lite-v1:0"
        ]
        Condition = {
          StringEquals = {
            "aws:PrincipalTag/Project"  = local.project
            "aws:PrincipalTag/RoleType" = "api"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role" "migration_provisioner" {
  name                 = local.provisioner_role_name
  description          = "Least-scope provisioning role for ProposalOS AWS migration resources."
  max_session_duration = 3600
  tags                 = local.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = var.trusted_provisioner_arn }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "migration_provisioner" {
  name       = "ProposalOSMigrationProvisionerPolicy"
  role       = aws_iam_role.migration_provisioner.id
  depends_on = [aws_iam_role_policy_attachment.migration_provisioner_additions]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadInventory"
        Effect = "Allow"
        Action = [
          "ec2:Describe*",
          "ec2:Get*",
          "rds:Describe*",
          "rds:ListTagsForResource",
          "ecs:Describe*",
          "ecs:List*",
          "elasticache:Describe*",
          "elasticache:List*",
          "ecr:Describe*",
          "ecr:List*",
          "elasticloadbalancing:Describe*",
          "logs:Describe*",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecrets",
          "iam:GetRole",
          "iam:ListRoles",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListAttachedRolePolicies",
          "iam:ListRolePolicies",
          "codebuild:BatchGetProjects",
          "codebuild:BatchGetBuilds",
          "codebuild:ListProjects",
          "events:DescribeRule",
          "events:ListRules",
          "events:ListTargetsByRule"
        ]
        Resource = "*"
      },
      {
        Sid    = "ReadProposalOSECRPolicies"
        Effect = "Allow"
        Action = [
          "ecr:GetLifecyclePolicy",
          "ecr:GetLifecyclePolicyPreview",
          "ecr:GetRepositoryPolicy"
        ]
        Resource = "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/proposalos-*"
      },
      {
        Sid      = "ReadProposalOSSecretResourcePolicies"
        Effect   = "Allow"
        Action   = "secretsmanager:GetResourcePolicy"
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:proposalos/*"
      },
      {
        Sid    = "CreateProposalOSNetworkResources"
        Effect = "Allow"
        Action = [
          "ec2:CreateVpc",
          "ec2:CreateSubnet",
          "ec2:CreateInternetGateway",
          "ec2:CreateRouteTable",
          "ec2:CreateSecurityGroup",
          "ec2:CreateVpcEndpoint"
        ]
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestTag/Project" = local.project } }
      },
      {
        Sid    = "CreateResourcesInsideTaggedProposalOSVpc"
        Effect = "Allow"
        Action = [
          "ec2:CreateSubnet",
          "ec2:CreateRouteTable",
          "ec2:CreateSecurityGroup"
        ]
        Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:vpc/*"
        Condition = { StringEquals = { "aws:ResourceTag/Project" = local.project } }
      },
      {
        Sid    = "CreateS3EndpointForTaggedProposalOSNetwork"
        Effect = "Allow"
        Action = "ec2:CreateVpcEndpoint"
        Resource = [
          "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:route-table/*",
          "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:vpc/*"
        ]
        Condition = { StringEquals = { "aws:ResourceTag/Project" = local.project } }
      },
      {
        Sid      = "TagNewNetworkResourcesOnlyAtCreation"
        Effect   = "Allow"
        Action   = "ec2:CreateTags"
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestTag/Project" = local.project
            "ec2:CreateAction"       = ["CreateVpc", "CreateSubnet", "CreateInternetGateway", "CreateRouteTable", "CreateSecurityGroup", "CreateVpcEndpoint", "AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress"]
          }
        }
      },
      {
        Sid    = "ModifyProposalOSNetworkResources"
        Effect = "Allow"
        Action = [
          "ec2:ModifyVpcAttribute",
          "ec2:ModifySubnetAttribute",
          "ec2:AttachInternetGateway",
          "ec2:DetachInternetGateway",
          "ec2:CreateRoute",
          "ec2:DeleteRoute",
          "ec2:AssociateRouteTable",
          "ec2:DisassociateRouteTable",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:ModifyVpcEndpoint",
          "ec2:DeleteVpcEndpoint",
          "ec2:DeleteSecurityGroup",
          "ec2:DeleteRouteTable",
          "ec2:DeleteSubnet",
          "ec2:DeleteInternetGateway",
          "ec2:DeleteVpc"
        ]
        Resource  = "*"
        Condition = { StringEquals = { "aws:ResourceTag/Project" = local.project } }
      },
      {
        Sid    = "ManageTaggedProposalOSDatabases"
        Effect = "Allow"
        Action = [
          "rds:CreateDBInstance",
          "rds:CreateDBSubnetGroup",
          "rds:CreateDBParameterGroup",
          "rds:AddTagsToResource",
          "rds:RemoveTagsFromResource"
        ]
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestTag/Project" = local.project } }
      },
      {
        Sid    = "ModifyTaggedProposalOSDatabases"
        Effect = "Allow"
        Action = [
          "rds:ModifyDBInstance",
          "rds:DeleteDBInstance",
          "rds:CreateDBSnapshot",
          "rds:ModifyDBSubnetGroup",
          "rds:DeleteDBSubnetGroup",
          "rds:ModifyDBParameterGroup",
          "rds:DeleteDBParameterGroup"
        ]
        Resource  = "arn:aws:rds:${var.aws_region}:${var.aws_account_id}:*proposalos*"
        Condition = { StringEquals = { "aws:ResourceTag/Project" = local.project } }
      },
      {
        Sid    = "CreateTaggedProposalOSRedisResources"
        Effect = "Allow"
        Action = [
          "elasticache:CreateCacheSubnetGroup",
          "elasticache:CreateReplicationGroup",
          "elasticache:AddTagsToResource"
        ]
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestTag/Project" = local.project } }
      },
      {
        Sid    = "ManageTaggedProposalOSRedisResources"
        Effect = "Allow"
        Action = [
          "elasticache:CreateReplicationGroup",
          "elasticache:ModifyReplicationGroup",
          "elasticache:DeleteReplicationGroup",
          "elasticache:ModifyCacheSubnetGroup",
          "elasticache:DeleteCacheSubnetGroup",
          "elasticache:CreateSnapshot",
          "elasticache:DeleteSnapshot",
          "elasticache:AddTagsToResource",
          "elasticache:RemoveTagsFromResource"
        ]
        Resource = [
          "arn:aws:elasticache:${var.aws_region}:${var.aws_account_id}:replicationgroup:proposalos-*",
          "arn:aws:elasticache:${var.aws_region}:${var.aws_account_id}:subnetgroup:proposalos-*",
          "arn:aws:elasticache:${var.aws_region}:${var.aws_account_id}:snapshot:proposalos-*"
        ]
        Condition = { StringEquals = { "aws:ResourceTag/Project" = local.project } }
      },
      {
        Sid    = "CreateProposalOSApplicationResources"
        Effect = "Allow"
        Action = [
          "ecs:CreateCluster",
          "ecs:TagResource",
          "ecr:CreateRepository",
          "ecr:TagResource",
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:AddTags",
          "secretsmanager:CreateSecret",
          "secretsmanager:TagResource",
          "codebuild:CreateProject",
          "codebuild:UpdateProject",
          "codebuild:TagResource",
          "events:PutRule",
          "events:TagResource"
        ]
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestTag/Project" = local.project } }
      },
      {
        Sid    = "CreateTaggedProposalOSECSServices"
        Effect = "Allow"
        Action = ["ecs:CreateService"]
        Resource = [
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:service/proposalos-*/*",
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:cluster/proposalos-*"
        ]
        Condition = { StringEquals = { "aws:RequestTag/Project" = local.project } }
      },
      {
        Sid    = "ManageProposalOSApplicationResources"
        Effect = "Allow"
        Action = [
          "ecs:UpdateCluster",
          "ecs:DeleteCluster",
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:CreateService",
          "ecs:UpdateService",
          "ecs:DeleteService",
          "ecs:RunTask",
          "ecs:StopTask",
          "ecs:ExecuteCommand",
          "ecs:PutClusterCapacityProviders",
          "ecr:PutLifecyclePolicy",
          "ecr:PutImageScanningConfiguration",
          "ecr:DeleteRepository",
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:ModifyListener",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:DeleteTargetGroup",
          "logs:PutRetentionPolicy",
          "logs:DeleteLogGroup",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecret",
          "secretsmanager:DeleteSecret",
          "codebuild:StartBuild",
          "codebuild:DeleteProject",
          "events:PutTargets",
          "events:RemoveTargets",
          "events:DeleteRule",
          "events:EnableRule",
          "events:DisableRule"
        ]
        Resource = [
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:cluster/proposalos-*",
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:service/proposalos-*/*",
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/proposalos-*:*",
          "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/proposalos-*",
          "arn:aws:elasticloadbalancing:${var.aws_region}:${var.aws_account_id}:loadbalancer/app/proposalos-*/*",
          "arn:aws:elasticloadbalancing:${var.aws_region}:${var.aws_account_id}:targetgroup/proposalos-*/*",
          "arn:aws:elasticloadbalancing:${var.aws_region}:${var.aws_account_id}:listener/app/proposalos-*/*/*",
          "arn:aws:elasticloadbalancing:${var.aws_region}:${var.aws_account_id}:listener-rule/app/proposalos-*/*/*/*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/proposalos-*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/codebuild/proposalos-*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/rds/instance/proposalos-*",
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:proposalos/*",
          "arn:aws:codebuild:${var.aws_region}:${var.aws_account_id}:project/proposalos-*",
          "arn:aws:events:${var.aws_region}:${var.aws_account_id}:rule/proposalos-*"
        ]
      },
      {
        Sid    = "UseOnlyTheDedicatedTerraformStateBucket"
        Effect = "Allow"
        Action = [
          "s3:GetBucketLocation",
          "s3:GetBucketVersioning",
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::${local.state_bucket_name}",
          "arn:aws:s3:::${local.state_bucket_name}/*"
        ]
      },
      {
        Sid    = "ManageProposalOSServiceRolesAndPassThemToAWS"
        Effect = "Allow"
        Action = [
          "iam:CreateRole"
        ]
        Resource  = "arn:aws:iam::${var.aws_account_id}:role/ProposalOS*"
        Condition = { StringEquals = { "iam:PermissionsBoundary" = "arn:aws:iam::${var.aws_account_id}:policy/${local.service_boundary_name}" } }
      },
      {
        Sid    = "ManageBoundedProposalOSServiceRoles"
        Effect = "Allow"
        Action = [
          "iam:DeleteRole",
          "iam:UpdateAssumeRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:TagRole",
          "iam:UntagRole"
        ]
        Resource = "arn:aws:iam::${var.aws_account_id}:role/ProposalOS*"
      },
      {
        Sid      = "PassProposalOSRolesToSpecificAWSServices"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = "arn:aws:iam::${var.aws_account_id}:role/ProposalOS*"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = ["ecs-tasks.amazonaws.com", "codebuild.amazonaws.com"]
          }
        }
      },
      {
        Sid      = "ReadProposalOSRoleAndBoundaryMetadata"
        Effect   = "Allow"
        Action   = ["iam:GetRole", "iam:GetRolePolicy", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListAttachedRolePolicies", "iam:ListRolePolicies", "iam:ListInstanceProfilesForRole"]
        Resource = ["arn:aws:iam::${var.aws_account_id}:role/ProposalOS*", "arn:aws:iam::${var.aws_account_id}:policy/${local.service_boundary_name}"]
      },
      {
        Sid       = "AllowECSServiceLinkedRoleCreation"
        Effect    = "Allow"
        Action    = "iam:CreateServiceLinkedRole"
        Resource  = "arn:aws:iam::${var.aws_account_id}:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS"
        Condition = { StringEquals = { "iam:AWSServiceName" = "ecs.amazonaws.com" } }
      },
      {
        Sid       = "AllowELBServiceLinkedRoleCreation"
        Effect    = "Allow"
        Action    = "iam:CreateServiceLinkedRole"
        Resource  = "arn:aws:iam::${var.aws_account_id}:role/aws-service-role/elasticloadbalancing.amazonaws.com/AWSServiceRoleForElasticLoadBalancing"
        Condition = { StringEquals = { "iam:AWSServiceName" = "elasticloadbalancing.amazonaws.com" } }
      },
      {
        Sid    = "AssumeProposalOSProvisionerRole"
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Resource = [
          aws_iam_role.migration_provisioner.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "app_build_context" {
  name = "ProposalOSMigrationAppBuildContext"
  role = aws_iam_role.migration_provisioner.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion"]
      Resource = "arn:aws:s3:::proposalos-data-${var.aws_account_id}-${var.aws_region}/logs/app-build/source-context.zip"
    }]
  })
}

resource "aws_iam_policy" "migration_provisioner_additions" {
  name        = "ProposalOSMigrationProvisionerResourceAdditions"
  description = "Scoped security-group, log-group, S3 configuration, and ElastiCache permissions for ProposalOS migration."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AuthorizeTaggedProposalOSSecurityGroupRules"
        Effect = "Allow"
        Action = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress"
        ]
        Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:security-group-rule/*"
        Condition = { StringEquals = { "aws:RequestTag/Project" = local.project } }
      },
      {
        Sid    = "RevokeTaggedProposalOSSecurityGroupRules"
        Effect = "Allow"
        Action = [
          "ec2:RevokeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupEgress"
        ]
        Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:security-group-rule/*"
        Condition = { StringEquals = { "aws:ResourceTag/Project" = local.project } }
      },
      {
        Sid    = "CreateOnlyProposalOSLogGroups"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:TagResource"
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/proposalos-*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/codebuild/proposalos-*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/rds/instance/proposalos-*"
        ]
        Condition = { StringEquals = { "aws:RequestTag/Project" = local.project } }
      },
      {
        Sid    = "ReadProposalOSLogGroupTags"
        Effect = "Allow"
        Action = "logs:ListTagsForResource"
        Resource = [
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/proposalos-*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/codebuild/proposalos-*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/rds/instance/proposalos-*"
        ]
      },
      {
        Sid      = "UseDefaultRedis7ParameterGroupForProposalOS"
        Effect   = "Allow"
        Action   = "elasticache:CreateReplicationGroup"
        Resource = "arn:aws:elasticache:${var.aws_region}:${var.aws_account_id}:parametergroup:default.redis7"
      },
      {
        Sid      = "UseTaggedProposalOSSubnetGroupForRedisCreation"
        Effect   = "Allow"
        Action   = "elasticache:CreateReplicationGroup"
        Resource = "arn:aws:elasticache:${var.aws_region}:${var.aws_account_id}:subnetgroup:proposalos-*"
        Condition = {
          StringEquals = { "aws:ResourceTag/Project" = local.project }
        }
      },
      {
        Sid    = "ManageProposalOSBuckets"
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:PutBucketTagging",
          "s3:PutBucketPublicAccessBlock",
          "s3:PutBucketOwnershipControls",
          "s3:PutEncryptionConfiguration",
          "s3:PutBucketVersioning",
          "s3:PutLifecycleConfiguration",
          "s3:PutBucketPolicy",
          "s3:PutBucketLogging",
          "s3:GetBucket*",
          "s3:ListBucket",
          "s3:GetReplicationConfiguration",
          "s3:GetAccelerateConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:GetEncryptionConfiguration"
        ]
        Resource = "arn:aws:s3:::proposalos-data-*"
      },
      {
        Sid      = "ManageSingleImporterBuildContextObject"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion"]
        Resource = "arn:aws:s3:::proposalos-data-${var.aws_account_id}-${var.aws_region}/logs/migration-build/importer-context.zip"
      },
      {
        Sid       = "AllowElastiCacheServiceLinkedRoleCreation"
        Effect    = "Allow"
        Action    = "iam:CreateServiceLinkedRole"
        Resource  = "arn:aws:iam::${var.aws_account_id}:role/aws-service-role/elasticache.amazonaws.com/AWSServiceRoleForElastiCache"
        Condition = { StringEquals = { "iam:AWSServiceName" = "elasticache.amazonaws.com" } }
      }
      ,
      {
        Sid      = "RequestOnlyProposalOSStagingDnsCertificate"
        Effect   = "Allow"
        Action   = "acm:RequestCertificate"
        Resource = "arn:aws:acm:${var.aws_region}:${var.aws_account_id}:certificate/*"
        Condition = {
          StringEquals = {
            "aws:RequestTag/Project" = local.project
            "acm:ValidationMethod"   = "DNS"
          }
          "ForAllValues:StringEquals" = {
            "acm:DomainNames" = ["aws-stage.claraud.com"]
          }
        }
      },
      {
        Sid    = "ManageTaggedProposalOSCertificates"
        Effect = "Allow"
        Action = [
          "acm:DescribeCertificate",
          "acm:DeleteCertificate",
          "acm:AddTagsToCertificate",
          "acm:RemoveTagsFromCertificate",
          "acm:ListTagsForCertificate"
        ]
        Resource  = "arn:aws:acm:${var.aws_region}:${var.aws_account_id}:certificate/*"
        Condition = { StringEquals = { "aws:ResourceTag/Project" = local.project } }
      },
      {
        Sid    = "DescribeProposalOSDefaultEncryptionKeys"
        Effect = "Allow"
        Action = "kms:DescribeKey"
        Resource = [
          "arn:aws:kms:${var.aws_region}:${var.aws_account_id}:key/784342cd-ed0a-4ad8-9d3d-3aa47607d287",
          "arn:aws:kms:${var.aws_region}:${var.aws_account_id}:key/567f3cf5-2934-43b2-8b42-817f6a97f085"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "migration_provisioner_additions" {
  role       = aws_iam_role.migration_provisioner.name
  policy_arn = aws_iam_policy.migration_provisioner_additions.arn
}

output "state_bucket" {
  value = aws_s3_bucket.terraform_state.bucket
}

output "migration_provisioner_role_arn" {
  value = aws_iam_role.migration_provisioner.arn
}

output "service_role_permissions_boundary_arn" {
  value = aws_iam_policy.service_role_boundary.arn
}
