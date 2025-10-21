# Service account for relay instances
resource "google_service_account" "relay" {
  account_id   = "moq-relay"
  display_name = "MoQ Relay"
  description  = "Service account for MoQ relay instances"
}

# Generate service account key
resource "google_service_account_key" "relay" {
  service_account_id = google_service_account.relay.name
}
