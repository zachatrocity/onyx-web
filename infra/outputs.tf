output "relay_ips" {
  description = "IP addresses of relay nodes"
  value = {
    for name, instance in linode_instance.relay : name => {
      ipv4 = instance.ip_address
      ipv6 = instance.ipv6
    }
  }
}

output "relay_hostnames" {
  description = "Hostnames of relay nodes"
  value = {
    for name, _ in local.relays :
    name => "${name}.${var.domain}"
  }
}

output "root_passwords" {
  description = "Root passwords for instances (sensitive)"
  value = {
    for name, pass in random_password.root :
    name => pass.result
  }
  sensitive = true
}

output "relay_url" {
  description = "Main relay URL for clients"
  value       = "https://${var.domain}"
}

output "relay_zone_nameservers" {
  description = "Nameservers for the relay DNS zone"
  value       = google_dns_managed_zone.relay.name_servers
}

output "gcp_credentials" {
  description = "GCP service account credentials for DNS management (base64 encoded)"
  value       = google_service_account_key.relay.private_key
  sensitive   = true
}
