# DNS zone for relay servers
resource "google_dns_managed_zone" "relay" {
  name     = "relay"
  dns_name = "${var.domain}."
}

# Individual DNS records for each relay node (for direct access)
resource "google_dns_record_set" "relay_node" {
  for_each = local.relays

  name         = "${each.key}.${google_dns_managed_zone.relay.dns_name}"
  managed_zone = google_dns_managed_zone.relay.name
  type         = "A"
  ttl          = 300
  rrdatas      = [linode_instance.relay[each.key].ip_address]
}

# Global Geo DNS, routing to the closest region
resource "google_dns_record_set" "relay_global" {
  name         = google_dns_managed_zone.relay.dns_name
  managed_zone = google_dns_managed_zone.relay.name
  type         = "A"
  ttl          = 60

  routing_policy {
    dynamic "geo" {
      for_each = local.relay_gcp_regions

      content {
        location = geo.value
        rrdatas = [
          linode_instance.relay[geo.key].ip_address
        ]
      }
    }
  }
}

# Region mapping for GCP geo routing
# GCP uses region codes like "us-east1", "us-west1", "europe-west3", "asia-southeast1"
locals {
  relay_gcp_regions = {
    use = "us-east1"        # Newark, NJ -> closest GCP region
    usw = "us-west1"        # Fremont, CA -> closest GCP region
    euc = "europe-west3"    # Frankfurt -> closest GCP region
    sg  = "asia-southeast1" # Singapore -> closest GCP region
  }
}

# Service account for DNS certificate management
resource "google_service_account" "moq_cert_dns" {
  account_id   = "moq-cert-dns"
  display_name = "MOQ Certificate DNS Manager"
  description  = "Service account for moq-cert to manage DNS records for ACME DNS-01 challenges"
}

# Grant DNS admin permissions to the service account
resource "google_project_iam_member" "moq_cert_dns_admin" {
  project = var.gcp_project
  role    = "roles/dns.admin"
  member  = "serviceAccount:${google_service_account.moq_cert_dns.email}"
}

# Generate service account key
resource "google_service_account_key" "moq_cert_dns" {
  service_account_id = google_service_account.moq_cert_dns.name
}
