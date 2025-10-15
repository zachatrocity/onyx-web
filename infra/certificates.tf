# ACME certificate for public relay endpoint (using GCP DNS challenge)
resource "tls_private_key" "relay" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "acme_registration" "relay" {
  account_key_pem = tls_private_key.relay.private_key_pem
  email_address   = var.email
}

resource "acme_certificate" "relay" {
  account_key_pem = acme_registration.relay.account_key_pem
  common_name     = "${var.relay_subdomain}.${var.domain}"
  subject_alternative_names = [
    "*.${var.relay_subdomain}.${var.domain}"
  ]
  key_type = tls_private_key.relay.ecdsa_curve

  revoke_certificate_on_destroy = false

  dns_challenge {
    provider = "gcloud"
    config = {
      GCE_PROJECT = var.gcp_project
      GCE_ZONE_ID = google_dns_managed_zone.relay.name
    }
  }
}

# Internal CA for cluster communication
resource "tls_private_key" "internal" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_self_signed_cert" "internal" {
  private_key_pem = tls_private_key.internal.private_key_pem

  subject {
    common_name  = "moq-internal-ca"
    organization = "hang.live"
  }

  validity_period_hours = 87600 # 10 years
  is_ca_certificate     = true

  allowed_uses = [
    "cert_signing",
    "key_encipherment",
    "digital_signature",
  ]
}

# Internal certificates for each relay node
resource "tls_private_key" "relay_internal" {
  for_each = local.relays

  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_cert_request" "relay_internal" {
  for_each = local.relays

  private_key_pem = tls_private_key.relay_internal[each.key].private_key_pem

  subject {
    common_name = "relay-${each.key}"
  }

  dns_names = [
    "${each.key}.${var.relay_subdomain}.${var.domain}",
    "relay-${each.key}.internal.${var.domain}",
  ]
}

resource "tls_locally_signed_cert" "relay_internal" {
  for_each = local.relays

  cert_request_pem   = tls_cert_request.relay_internal[each.key].cert_request_pem
  ca_private_key_pem = tls_private_key.internal.private_key_pem
  ca_cert_pem        = tls_self_signed_cert.internal.cert_pem

  validity_period_hours = 8760 # 1 year

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
    "client_auth",
  ]
}
