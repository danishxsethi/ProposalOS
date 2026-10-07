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

output "production_db_endpoint" {
  value = aws_db_instance.production.address
}

output "production_db_master_secret_arn" {
  value     = aws_db_instance.production.master_user_secret[0].secret_arn
  sensitive = true
}

output "production_redis_endpoint" {
  value = aws_elasticache_replication_group.production.primary_endpoint_address
}

output "production_redis_url_secret_arn" {
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
  value = aws_ecs_cluster.production.name
}

output "production_alb_dns_name" {
  value = aws_lb.production.dns_name
}

output "production_app_build_project" {
  value = aws_codebuild_project.app_build.name
}

output "production_app_image_tag" {
  value = var.app_image_tag
}

output "production_certificate_arn" {
  value = aws_acm_certificate.production.arn
}

output "production_certificate_validation_records" {
  value = [
    for option in aws_acm_certificate.production.domain_validation_options : {
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
