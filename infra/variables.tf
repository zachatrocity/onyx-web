variable "linode_token" {
  description = "Linode API token"
  type        = string
  sensitive   = true
}

variable "gcp_project" {
  description = "GCP project ID for DNS management"
  type        = string
  default = "632186286103"
}

variable "domain" {
  description = "Base domain name"
  type        = string
  default     = "hang.live"
}

variable "relay_subdomain" {
  description = "Subdomain for relay servers"
  type        = string
  default     = "moq"
}

variable "email" {
  description = "Email address for LetsEncrypt notifications"
  type        = string
  default     = "admin@hang.live"
}

variable "ssh_keys" {
  description = "SSH public keys for root access"
  type        = list(string)
  default     = []
}

# Relay node definitions
locals {
  relays = {
    use = {
      region = "us-east"      # Newark, NJ
      type   = "g6-nanode-1"  # 1GB RAM, 1 vCPU, $5/mo
    }
    usw = {
      region = "us-west"      # Fremont, CA
      type   = "g6-nanode-1"
    }
    euc = {
      region = "eu-central"   # Frankfurt, Germany
      type   = "g6-nanode-1"
    }
    sg = {
      region = "ap-south"     # Singapore
      type   = "g6-nanode-1"
    }
  }

  # Path to moq-rs repository (relative to this directory)
  moq_rs_path = "../moq/rs"
}
