# moq.dev Linode Infrastructure

This directory contains OpenTofu + Nix configuration for deploying moq-relay to Linode (Akamai Connected Cloud).

## Architecture

- **Provider**: Linode (Akamai Connected Cloud)
- **Regions**: 4 nodes (US East, US West, EU Central, Asia Pacific)
- **Instance Type**: g6-nanode-1 (1GB RAM, 1 vCPU, ~$5/month each)
- **OS**: Debian 12 with Nix package manager
- **DNS**: GCP Cloud DNS with geo routing policies
- **Certificates**: LetsEncrypt via ACME DNS-01 challenge (GCP DNS)
- **Deployment**: Nix flake apps for simple binary deployment

**Estimated cost**: ~$21/month (vs ~$200-240/month on GCP full stack)

## Features

- ✅ UDP/QUIC support
- ✅ GeoDNS routing via GCP Cloud DNS
- ✅ Automatic LetsEncrypt certificate provisioning (wildcard cert via GCP DNS)
- ✅ Infrastructure as code (OpenTofu + Nix flakes)
- ✅ Simple deployments via Nix flake apps
- ✅ No Docker - native Nix-built binaries
- ✅ Mesh clustering with internal TLS
- ✅ Automatic security updates

## Prerequisites

1. **Linode Account**: https://cloud.linode.com
2. **GCP Account** with Cloud DNS API enabled
   - Authenticate via `gcloud auth application-default login`
3. **Nix with flakes enabled**:
   ```bash
   # On macOS/Linux
   sh <(curl -L https://nixos.org/nix/install) --daemon

   # Enable flakes
   mkdir -p ~/.config/nix
   echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
   ```
4. **OpenTofu**: https://opentofu.org/docs/intro/install/
   ```bash
   # On macOS
   brew install opentofu

   # On Linux
   # See: https://opentofu.org/docs/intro/install/
   ```

## Setup

### 1. Copy the JWT keys from existing infrastructure

```bash
# Copy from GCP setup
cp ../root.jwk ./
cp ../cluster.jwt ./
cp ../demo-pub.jwt ./
cp ../demo-sub.jwt ./
```

### 2. Configure variables

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your credentials
```

You'll need:
- **Linode API token**: https://cloud.linode.com/profile/tokens
  - Scopes needed: `Read/Write` for Linodes, Domains, Firewalls, StackScripts
- **GCP Project ID**: Your GCP project for DNS management
  - Enable Cloud DNS API: `gcloud services enable dns.googleapis.com`
  - Authenticate: `gcloud auth application-default login`

### 3. Add your SSH key

```bash
# Add your public SSH key to terraform.tfvars
ssh_keys = [
  "$(cat ~/.ssh/id_ed25519.pub)",
]
```

### 4. Deploy infrastructure

```bash
# Initialize OpenTofu
tofu init

# Review the plan
tofu plan

# Apply (creates Linode instances + DNS + certificates)
tofu apply

# Save the root passwords somewhere secure
tofu output -json root_passwords > passwords.json.secret
chmod 600 passwords.json.secret
```

### 5. Deploy moq-relay to nodes

Wait a few minutes for the instances to boot and Nix to install via the bootstrap script, then:

```bash
# Deploy to all nodes
nix run .#deploy-all

# Or deploy to a specific node
nix run .#deploy-relay-use
nix run .#deploy-relay-usw
nix run .#deploy-relay-euc
nix run .#deploy-relay-sg
```

## Daily Operations

### Update moq-relay version

```bash
# Update the moq-rs flake input
nix flake lock --update-input moq

# Deploy the update
nix run .#deploy-all

# Or update a specific node
nix run .#deploy-relay-use
```

### Check relay status

```bash
# SSH into a node
ssh root@use.moq.hang.live

# Check service status
systemctl status moq-relay

# View logs
journalctl -u moq-relay -f
```

### Add a new region

1. Edit `variables.tf` and add to `locals.relays`:
   ```hcl
   asia-east = {
     region = "ap-northeast"  # Tokyo
     type   = "g6-nanode-1"
   }
   ```

2. Add to `flake.nix`:
   ```nix
   relay-asia-east = nixpkgs.lib.nixosSystem {
     inherit system;
     modules = [
       (relayModule {
         nodeName = "asia-east";
         clusterRoot = "relay-us-east.relay.moq.dev:443";
       })
     ];
   };
   ```

3. Apply:
   ```bash
   tofu apply
   nix run .#deploy-relay-asia-east
   ```

### Certificate renewal

Certificates auto-renew via OpenTofu. To force renewal:

```bash
# Taint the certificate resource
tofu taint acme_certificate.relay

# Apply to get new cert (will update certs on servers via stackscript)
tofu apply

# Restart services to pick up new cert
nix run .#deploy-all
```

## Cost Breakdown

| Item | Quantity | Unit Price | Monthly Cost |
|------|----------|------------|--------------|
| Linode g6-nanode-1 | 4 | $5 | $20 |
| GCP Cloud DNS | 1 zone | $0.20 | $0.20 |
| GCP DNS Queries (geo routing) | ~1M/month | $0.70/M | $0.70 |
| **Total** | | | **~$21/month** |

**Note:** GCP Cloud DNS pricing:
- Hosted zones: $0.20 per zone per month
- Geo routing queries: $0.70 per million queries
- First 1 billion queries included in zone cost at standard rate

## Migration from GCP

### Before migration

1. Lower TTLs on DNS records:
   ```bash
   # In GCP setup, reduce TTL to 60 seconds
   # Wait 24 hours for caches to expire
   ```

2. Test new infrastructure:
   ```bash
   # After tofu apply, test each node
   curl https://us-east.relay.moq.dev/health
   ```

### During migration

1. Update DNS to point to Cloudflare LB:
   ```bash
   # The tofu apply already created the records
   # Just need to verify they're working
   dig relay.moq.dev
   ```

2. Monitor both infrastructures for 24-48 hours

3. Verify no traffic going to GCP nodes:
   ```bash
   # Check GCP relay logs
   gcloud compute ssh relay-us-central -- journalctl -u moq-relay -f
   ```

### After migration

1. Destroy GCP infrastructure:
   ```bash
   cd ../  # back to old infra directory
   tofu destroy
   ```

2. Update application configuration if needed

## Troubleshooting

### Can't SSH into nodes

```bash
# Check Linode console
# Go to: https://cloud.linode.com/linodes

# Use LISH (Linode Shell) for emergency access
```

### Relay not starting

```bash
ssh root@use.moq.hang.live
journalctl -u moq-relay -n 100

# Check certificate paths
ls -la /var/lib/moq-relay/certs/

# Verify moq-relay binary
/var/lib/moq-relay/bin/moq-relay --version
```

### GeoDNS not routing correctly

```bash
# Test DNS resolution from your location
dig moq.hang.live

# Should return 1 IP based on your geographic location
# Test from different locations:
# https://www.whatsmydns.net/#A/moq.hang.live

# Check GCP DNS records
gcloud dns record-sets list --zone=relay

# View routing policy details
gcloud dns record-sets describe moq.hang.live. --zone=relay --type=A
```

## Advantages over GCP Full Stack

1. **90% cost reduction** ($200+/mo → $21/mo)
2. **No Docker** - native Nix-built binaries
3. **Simple deployments** - SSH + systemd, no complexity
4. **Better networking** - Akamai/Linode has excellent peering
5. **Simpler** - Standard Debian + Nix, familiar environment
6. **Reproducible** - Nix ensures identical builds everywhere
7. **Same DNS** - Keep using GCP Cloud DNS you already know

## References

- [Linode Documentation](https://www.linode.com/docs/)
- [Nix Package Manager](https://nixos.org/manual/nix/stable/)
- [Nix Flakes](https://nixos.wiki/wiki/Flakes)
- [GCP Cloud DNS](https://cloud.google.com/dns/docs)
- [moq-relay](https://github.com/kixelated/moq-rs)
