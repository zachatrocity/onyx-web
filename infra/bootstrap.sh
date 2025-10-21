#!/bin/bash
# <UDF name="hostname" label="Hostname" />
# <UDF name="gcp_account" label="GCP Service Account JSON (base64)" />

set -euo pipefail

echo "Starting bootstrap for moq-relay on Debian..."

# Set hostname
hostnamectl set-hostname "$HOSTNAME"

# Create directories
mkdir -p /var/lib/moq-relay
mkdir -p /etc/moq-relay
chmod 755 /var/lib/moq-relay
chmod 755 /etc/moq-relay

# Write GCP credentials
echo "$GCP_ACCOUNT" | base64 -d > /var/lib/moq-relay/gcp.json
chmod 600 /var/lib/moq-relay/gcp.json

# Extract node name from hostname (e.g., "use" from "use.moq.hang.live")
NODE_NAME=$(echo "$HOSTNAME" | cut -d. -f1)

# Write environment file
cat > /etc/moq-relay/env <<EOF
NODE_NAME=$NODE_NAME
CLUSTER_NODE=$HOSTNAME
EOF

# Install Nix (multi-user installation)
echo "Installing Nix package manager..."
sh <(curl -L https://nixos.org/nix/install) --daemon --yes

# Enable flakes
mkdir -p /etc/nix
cat > /etc/nix/nix.conf <<EOF
experimental-features = nix-command flakes
auto-optimise-store = true
EOF

echo "Bootstrap complete. Deploy via 'just deploy <node>' to install services and credentials."
