# ProposalOS AWS bootstrap

This isolated bootstrap creates only the private, versioned S3 bucket for AWS Terraform state, an IAM permissions boundary for ProposalOS runtime roles, and a migration provisioning role trusted by the verified non-root IAM Identity Center role. It does not create application or database resources.

The bootstrap state is local because the remote state bucket does not exist until the first apply. Keep the generated `terraform.tfstate` private and import the bucket into the main S3-backed stack after bootstrap. The repository ignores local Terraform state files.

```powershell
cd infra/aws/bootstrap
terraform init
terraform fmt -check
terraform validate
terraform plan -out=bootstrap.tfplan
terraform apply bootstrap.tfplan
Copy-Item backend.tf.example backend.tf
terraform init -migrate-state -force-copy
```

The bootstrap starts with local state because the S3 state bucket does not exist yet. After the first apply creates the bucket, copy the backend example and migrate the state into S3. Subsequent Terraform runs use the remote backend. The AWS provider is restricted to account `410432886960`, region `us-east-2`, and the explicit `dealpilot-sso` profile for this one-time bootstrap. Do not use the AWS default profile; it resolves to root.

The provisioning role is intentionally limited to ProposalOS-named/tagged network, database, ECS, ECR, load-balancer, logs, secret, and build resources. CloudFront, WAF, DNS, and billing-budget permissions are deferred until those production changes are concretely ready. Runtime roles must carry the ProposalOS permissions boundary. The role does not read or print secret values.
