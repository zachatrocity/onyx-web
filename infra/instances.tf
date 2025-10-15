# Create Linode instances
resource "linode_instance" "relay" {
  for_each = local.relays

  label  = "relay-${each.key}"
  region = each.value.region
  type   = each.value.type

  # Use Debian 12 as base, will be converted to NixOS via bootstrap
  image           = "linode/debian12"
  root_pass       = random_password.root[each.key].result
  authorized_keys = var.ssh_keys

  # Open firewall for QUIC/WebTransport
  firewall_id = linode_firewall.relay.id

  # Bootstrap script to apply NixOS configuration
  stackscript_id = linode_stackscript.nixos_bootstrap.id
  stackscript_data = {
    hostname      = "relay-${each.key}.${var.relay_subdomain}.${var.domain}"
    node_name     = each.key
    cluster_root  = "relay-us-east.${var.relay_subdomain}.${var.domain}"
    public_cert   = base64encode("${acme_certificate.relay.certificate_pem}${acme_certificate.relay.issuer_pem}")
    public_key    = base64encode(acme_certificate.relay.private_key_pem)
    internal_cert = base64encode("${tls_locally_signed_cert.relay_internal[each.key].cert_pem}${tls_self_signed_cert.internal.cert_pem}")
    internal_key  = base64encode(tls_private_key.relay_internal[each.key].private_key_pem)
    internal_ca   = base64encode(tls_self_signed_cert.internal.cert_pem)
    root_key      = base64encode(file("../root.jwk"))
    cluster_token = base64encode(file("../cluster.jwt"))
  }

  tags = ["relay", "moq"]
}

# Generate random root passwords (store these securely!)
resource "random_password" "root" {
  for_each = local.relays

  length  = 32
  special = true
}

# Firewall rules for relay servers
resource "linode_firewall" "relay" {
  label = "relay-firewall"

  inbound {
    label    = "allow-ssh"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "22"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-quic-udp"
    action   = "ACCEPT"
    protocol = "UDP"
    ports    = "443"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-quic-tcp"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "443"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound_policy  = "DROP"
  outbound_policy = "ACCEPT"

  tags = ["relay"]
}

# Bootstrap script to configure NixOS on first boot
resource "linode_stackscript" "nixos_bootstrap" {
  label       = "nixos-moq-relay-bootstrap"
  description = "Bootstrap NixOS with moq-relay configuration"
  script      = file("${path.module}/nixos-bootstrap.sh")
  images      = ["linode/debian12"]
}
