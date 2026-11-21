#!/bin/sh
set -eu

umask 077

require_secret() {
  name="$1"
  value="$(printenv "$name" 2>/dev/null || true)"
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    ""|*changeme*|*change-me*|*replace-me*)
      echo "telesrv: required secret $name is missing or still uses a placeholder" >&2
      exit 64
      ;;
  esac
}

require_value() {
  name="$1"
  value="$(printenv "$name" 2>/dev/null || true)"
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    ""|*changeme*|*change-me*|*replace-me*)
      echo "telesrv: required setting $name is missing or still uses a placeholder" >&2
      exit 64
      ;;
  esac
}

initialize_server_key() {
  private_key="${TELESRV_RSA_KEY:-/var/lib/telesrv/server_rsa.pem}"
  export TELESRV_RSA_KEY="$private_key"
  key_dir="$(dirname -- "$private_key")"
  mkdir -p "$key_dir"

  identity_mode="$(printf '%s' "${TELESRV_RSA_IDENTITY_MODE:-generated}" | tr '[:upper:]' '[:lower:]')"
  case "$identity_mode" in
    generated) ;;
    *)
      echo "telesrv: production identity mode must be generated; the public test key is not safe for production" >&2
      exit 64
      ;;
  esac

  if [ -f "$private_key" ]; then
    if ! openssl rsa -in "$private_key" -check -noout >/dev/null 2>&1; then
      echo "telesrv: $private_key is not a valid RSA private key" >&2
      exit 65
    fi
    chmod 0600 "$private_key"
  fi
}

command_name="${1##*/}"
case "$command_name" in
  telesrv)
    require_value TELESRV_ADVERTISE_IP
    require_value TELESRV_PUBLIC_BASE_URL
    require_value TELESRV_PUBLIC_WEB_BASE_URL
    require_secret TELESRV_POSTGRES_DSN
    require_secret TELESRV_REDIS_PASSWORD
    require_secret TELESRV_ADMIN_API_TOKEN
    require_secret TELESRV_TURN_SECRET

    initialize_server_key

    # A Railway volume is mounted over the image-layer directory and can be root-owned.
    # Repair ownership without changing or removing any user data, then run unprivileged.
    chown -R 10001:10001 /var/lib/telesrv
    exec su-exec 10001:10001 "$@"
    ;;
  *)
    exec su-exec 10001:10001 "$@"
    ;;
esac
