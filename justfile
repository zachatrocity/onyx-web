#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation


# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	#!/usr/bin/env bash
	set -euo pipefail
	bun install --frozen-lockfile
	if tty -s; then
		bun run --filter='*' check
	else
		bun run --filter='*' check
	fi
	just --justfile native/justfile check

# Automatically fix some issues.
fix:
	bun install
	bun run --filter='*' fix
	just --justfile native/justfile fix

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	bun update
	bun outdated

# Build the packages
build:
	bun install --frozen-lockfile
	bun run --filter='*' build

prod: build
	bun run --filter='*' prod

deploy env="staging":
	just --justfile api/justfile deploy "{{env}}"
	just --justfile app/justfile deploy "{{env}}"

dev:
	bun install
	@just --justfile dev/justfile auth-token
	bun concurrently --kill-others --names api,app,relay --prefix-colors auto \
		"just --justfile api/justfile dev" \
		"just --justfile app/justfile dev" \
		"just --justfile dev/justfile root"

# Run the native app in development mode
native:
	just --justfile native/justfile dev

# Run the Android build, using --open to open Android Studio
android *args:
	just --justfile native/justfile android {{args}}

# Run the iOS build, using --open to open Xcode
ios *args:
	just --justfile native/justfile ios {{args}}

# Release the app for the given platform
release platform:
	just --justfile native/justfile release "{{platform}}"
