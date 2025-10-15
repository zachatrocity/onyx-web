#!/bin/bash
# <UDF name="hostname" label="Hostname" />
# <UDF name="node_name" label="Node Name" />
# <UDF name="cluster_root" label="Cluster Root" />
# <UDF name="public_cert" label="Public Certificate (base64)" />
# <UDF name="public_key" label="Public Key (base64)" />
# <UDF name="internal_cert" label="Internal Certificate (base64)" />
# <UDF name="internal_key" label="Internal Key (base64)" />
# <UDF name="internal_ca" label="Internal CA (base64)" />
# <UDF name="root_key" label="Root Key (base64)" />
# <UDF name="cluster_token" label="Cluster Token (base64)" />

set -euo pipefail

echo "Starting Nix bootstrap for moq-relay on Debian..."

# Set hostname immediately
hostnamectl set-hostname "$HOSTNAME"

# Create directories for certificates and keys
CERT_DIR="/var/lib/moq-relay/certs"
mkdir -p "$CERT_DIR"
mkdir -p /var/lib/moq-relay
chmod 755 /var/lib/moq-relay
chmod 750 "$CERT_DIR"

# Decode and write certificates
echo "$PUBLIC_CERT" | base64 -d > "$CERT_DIR/public.crt"
echo "$PUBLIC_KEY" | base64 -d > "$CERT_DIR/public.key"
echo "$INTERNAL_CERT" | base64 -d > "$CERT_DIR/internal.crt"
echo "$INTERNAL_KEY" | base64 -d > "$CERT_DIR/internal.key"
echo "$INTERNAL_CA" | base64 -d > "$CERT_DIR/internal-ca.crt"

chmod 644 "$CERT_DIR"/*.crt
chmod 600 "$CERT_DIR"/*.key

# Write auth keys
echo "$ROOT_KEY" | base64 -d > /var/lib/moq-relay/root.jwk
echo "$CLUSTER_TOKEN" | base64 -d > /var/lib/moq-relay/cluster.jwt

chmod 600 /var/lib/moq-relay/root.jwk
chmod 644 /var/lib/moq-relay/cluster.jwt

# Install Nix (multi-user installation)
echo "Installing Nix package manager..."
sh <(curl -L https://nixos.org/nix/install) --daemon --yes

# Enable flakes
mkdir -p /etc/nix
cat > /etc/nix/nix.conf <<EOF
experimental-features = nix-command flakes
auto-optimise-store = true
EOF

# Source Nix for current session
. /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh

echo "Nix installation complete. Ready for deployment via Nix flake."
echo "Run: nix run .#deploy-relay-$NODE_NAME"
