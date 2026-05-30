sed -i '' '/model ProcessedWebhookEvent {/a\
  @@map("processed_webhook_events")
' baseline.prisma

sed -i '' '/model FailedWebhookEvent {/a\
  @@map("failed_webhook_events")
' baseline.prisma

sed -i '' '/model CartAbandonmentEvent {/a\
  @@map("cart_abandonment_events")
' baseline.prisma

sed -i '' '/model PricingPlan {/a\
  @@map("pricing_plans")
' baseline.prisma

sed -i '' '/model Subscription {/a\
  @@map("subscriptions")
' baseline.prisma

sed -i '' '/model Payment {/a\
  @@map("payments")
' baseline.prisma

sed -i '' '/model CheckoutAttempt {/a\
  @@map("checkout_attempts")
' baseline.prisma
