variable "aws_region" {
  description = "AWS region for ProposalOS infrastructure."
  type        = string
  default     = "us-east-2"
}

variable "aws_account_id" {
  description = "Expected AWS account ID; protects against provisioning in another account."
  type        = string
  default     = "410432886960"
}

variable "bootstrap_profile" {
  description = "Authenticated non-root AWS CLI profile used only to bootstrap scoped access and state."
  type        = string
  default     = "dealpilot-sso"
}

variable "trusted_provisioner_arn" {
  description = "IAM Identity Center role allowed to assume the ProposalOS-scoped provisioning role."
  type        = string
  default     = "arn:aws:iam::410432886960:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_AdministratorAccess_165b418cfc92f2c4"
}
