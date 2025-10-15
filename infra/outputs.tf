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
    name => "${name}.${var.relay_subdomain}.${var.domain}"
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
  value       = "https://${var.relay_subdomain}.${var.domain}"
}

output "certificate_expiry" {
  description = "LetsEncrypt certificate expiry date"
  value       = acme_certificate.relay.certificate_not_after
}
