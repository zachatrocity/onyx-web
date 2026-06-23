#!/bin/sh
set -eu

json_escape() {
	printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

api_url="$(json_escape "${API_URL:-/api}")"
app_url="$(json_escape "${APP_URL:-/}")"

cat > /usr/share/nginx/html/config.js <<EOF
window.ONYX_CONFIG = {
	API_URL: "$api_url",
	APP_URL: "$app_url"
};
EOF
