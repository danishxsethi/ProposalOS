output "aws_region" {
  value = var.aws_region
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = [for subnet in aws_subnet.public : subnet.id]
}

output "private_subnet_ids" {
  value = [for subnet in aws_subnet.private : subnet.id]
}

output "staging_db_endpoint" {
  value = var.enable_staging_database ? aws_db_instance.staging[0].address : null
}

output "staging_db_master_secret_arn" {
  value     = var.enable_staging_database ? aws_db_instance.staging[0].master_user_secret[0].secret_arn : null
  sensitive = true
}

output "staging_redis_endpoint" {
  value = var.enable_staging_redis ? aws_elasticache_replication_group.staging[0].primary_endpoint_address : null
}

output "staging_redis_url_secret_arn" {
  value     = aws_secretsmanager_secret.redis_url.arn
  sensitive = true
}

output "data_bucket_name" {
  value = aws_s3_bucket.data.bucket
}

output "ecr_repositories" {
  value = { for name, repository in aws_ecr_repository.service : name => repository.repository_url }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.staging.name
}

output "staging_alb_dns_name" {
  value = var.enable_staging_alb ? aws_lb.staging[0].dns_name : null
}

output "staging_app_build_project" {
  value = aws_codebuild_project.app_build.name
}

output "staging_app_image_tag" {
  value = var.app_image_tag
}

output "staging_certificate_arn" {
  value = aws_acm_certificate.staging.arn
}

output "staging_certificate_validation_records" {
  value = [
    for option in aws_acm_certificate.staging.domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ]
}

output "app_task_security_group_id" {
  value = aws_security_group.app_tasks.id
}

output "import_task_security_group_id" {
  value = aws_security_group.import_task.id
}
