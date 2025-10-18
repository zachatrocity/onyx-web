# Secrets Directory

This directory contains sensitive credentials used by moq-relay for DNS certificate management.

## Required Files

- `root.jwk` - Root JWK for MOQ relay authentication (must be created manually)
- `cluster.jwt` - Cluster JWT token for relay communication (must be created manually)
- `gcp-dns.json` - GCP service account credentials for DNS-01 challenge (auto-generated from Terraform)

## Setup

### 1. Create JWT Credentials

You need to manually create the `root.jwk` and `cluster.jwt` files for MOQ relay authentication.

Place them in this `secrets/` directory.

### 2. GCP DNS Credentials (Automatic via Bootstrap)

The `gcp-dns.json` file is **automatically provisioned and deployed** during instance creation.

When you run:

```bash
tofu apply
```

Terraform:
1. Creates a GCP service account named `moq-cert-dns`
2. Grants DNS admin permissions to the service account
3. Generates a service account key
4. Passes the key (base64 encoded) to the bootstrap script via the `GCP_ACCOUNT` variable

The bootstrap script (bootstrap.sh:18-20) automatically:
- Decodes the base64 credentials
- Writes them to `/var/lib/moq-relay/gcp-dns.json`
- Sets permissions to 600

No manual steps required! The credentials are available immediately after instance creation.

## Security Notes

- **Never commit these files to git** - They're already in `.gitignore`
- The `root.jwk` and `gcp-dns.json` files are set to mode 600 (owner read/write only) on deployment
- The `cluster.jwt` file is set to mode 644 (world-readable) as it's used for inter-relay communication
- Keep backups of these credentials in a secure location (e.g., 1Password, Google Secret Manager)

## Deployment

Once all files are in place, deploy with:

```bash
just deploy <node>   # Deploy to specific node (use, usw, euc, sg)
just deploy-all      # Deploy to all nodes
```
