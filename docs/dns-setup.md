# DNS Setup for claraud.com

## Prerequisites

- claraud.com registered on Namecheap (already done)
- GCP project with Cloud Run service deployed
- GCP project ID: `proposal-487522`

## Step 1: Reserve a Static IP

```bash
gcloud compute addresses create claraud-ip --global

gcloud compute addresses describe claraud-ip --global --format='value(address)'
```

Save the static IP address for use in Step 6.

## Step 2: Create Cloud Run NEG (Network Endpoint Group)

```bash
gcloud compute network-endpoint-groups create claraud-neg \
  --region=us-central1 \
  --network-endpoint-type=serverless \
  --cloud-run-service=claraud-web \
  --cloud-run-service-region=us-central1
```

## Step 3: Create Backend Service

```bash
gcloud compute backend-services create claraud-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED

gcloud compute backend-services add-backend claraud-backend \
  --global \
  --network-endpoint-group=claraud-neg \
  --network-endpoint-group-region=us-central1
```

## Step 4: Create URL Map + HTTPS Proxy

```bash
# Create URL map
gcloud compute url-maps create claraud-urlmap --default-service=claraud-backend

# Create SSL certificate (auto-provisions with Let's Encrypt)
gcloud compute ssl-certificates create claraud-cert \
  --domains=claraud.com,www.claraud.com \
  --global

# Create HTTPS proxy
gcloud compute target-https-proxies create claraud-https-proxy \
  --url-map=claraud-urlmap \
  --ssl-certificates=claraud-cert
```

## Step 5: Create Forwarding Rules

```bash
gcloud compute forwarding-rules create claraud-https-rule \
  --global \
  --target-https-proxy=claraud-https-proxy \
  --address=claraud-ip \
  --ports=443
```

## Step 6: Set DNS on Namecheap

1. Log in to Namecheap
2. Navigate to **Domain List** → **Manage** for claraud.com
3. Go to **Advanced DNS** tab

### Add These Records:

| Type  | Host | Value                   | TTL |
| ----- | ---- | ----------------------- | --- |
| A     | @    | [Static IP from Step 1] | 120 |
| CNAME | www  | claraud.com             | 120 |

### Optional: SSL Certificate Provisioning

After creating the forwarding rule, wait for the SSL certificate to provision:

- Usually completes in **15-60 minutes**
- Maximum wait time: **24 hours**
- Check status: `gcloud compute ssl-certificates describe claraud-cert --global`

## Step 7: Enable Cloud CDN (Optional but Recommended)

```bash
gcloud compute backend-services update claraud-backend \
  --global \
  --enable-cdn \
  --cache-mode=USE_ORIGIN_HEADERS \
  --default-ttl=3600 \
  --max-ttl=86400
```

## Verification

After DNS propagates (can take up to 48 hours, usually much faster):

1. Visit `https://claraud.com` - should load the app
2. Visit `https://www.claraud.com` - should redirect to claraud.com
3. Check SSL certificate: `openssl s_client -connect claraud.com:443`

## Troubleshooting

### SSL Certificate Not Provisioning

```bash
# Check certificate status
gcloud compute ssl-certificates describe claraud-cert --global

# If pending, check for errors
gcloud compute ssl-certificates list --filter="name:claraud-cert"
```

### DNS Not Propagating

```bash
# Check DNS propagation
dig claraud.com
nslookup claraud.com

# Verify A record points to correct IP
```

### Cloud Run 404 Errors

```bash
# Verify service is running
gcloud run services describe claraud-web --region=us-central1

# Check logs
gcloud run services logs read claraud-web --region=us-central1
```

## Cost Considerations

- **Static IP**: ~$3-5/month when attached to a forwarding rule
- **Cloud CDN**: Free for first 10GB/month, then ~$0.12/GB
- **SSL Certificate**: Free (Let's Encrypt via GCP)

## Maintenance

### Renewing SSL Certificate

GCP automatically renews Let's Encrypt certificates. No action needed.

### Updating DNS

If you need to change the IP address:

1. Reserve new IP
2. Update forwarding rule: `gcloud compute forwarding-rules update claraud-https-rule --address=new-ip --global`
3. Update Namecheap A record
4. Delete old IP: `gcloud compute addresses delete claraud-ip --global`
