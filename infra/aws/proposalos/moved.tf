moved {
  from = aws_db_instance.staging
  to   = aws_db_instance.staging[0]
}

moved {
  from = aws_elasticache_replication_group.staging
  to   = aws_elasticache_replication_group.staging[0]
}

moved {
  from = aws_lb.staging
  to   = aws_lb.staging[0]
}

moved {
  from = aws_lb_target_group.api
  to   = aws_lb_target_group.api[0]
}

moved {
  from = aws_lb_target_group.web
  to   = aws_lb_target_group.web[0]
}

moved {
  from = aws_lb_listener.http
  to   = aws_lb_listener.http[0]
}
