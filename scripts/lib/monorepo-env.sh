# monorepo-env.sh — sourceable path exports for this clone (no ~/Trading required).
# Usage:
#   source scripts/lib/monorepo-env.sh
#   # or from any script:  . "$(dirname "$0")/lib/monorepo-env.sh"
#
# Idempotent. Does not invent research content.

_cockpit_env_root() {
  # Prefer caller-provided COCKPIT_REPO; else walk up from this file to monorepo root
  if [ -n "${COCKPIT_REPO:-}" ] && [ -f "$COCKPIT_REPO/AGENTS.md" ]; then
    printf '%s' "$(cd "$COCKPIT_REPO" && pwd)"
    return
  fi
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." && pwd)"
  if [ -f "$here/AGENTS.md" ] && [ -d "$here/memory-cockpit-v2" ]; then
    printf '%s' "$here"
    return
  fi
  # fallback: cwd if it looks like monorepo
  if [ -f "./AGENTS.md" ] && [ -d "./memory-cockpit-v2" ]; then
    pwd
    return
  fi
  printf '%s' "$here"
}

export COCKPIT_REPO="${COCKPIT_REPO:-$(_cockpit_env_root)}"
export COCKPIT_VAULT="${COCKPIT_VAULT:-$COCKPIT_REPO/research-wiki}"
export ONTOLOGY_WIKI="${ONTOLOGY_WIKI:-$COCKPIT_VAULT}"
export ONTOLOGY_STORE="${ONTOLOGY_STORE:-$COCKPIT_REPO/ontology/store/by_ticker}"
export ONTOLOGY_ROOT="${ONTOLOGY_ROOT:-$COCKPIT_REPO/ontology}"
export PORT="${PORT:-4681}"
export HOST="${HOST:-127.0.0.1}"

# Print resolved paths when COCKPIT_ENV_QUIET is unset
if [ -z "${COCKPIT_ENV_QUIET:-}" ]; then
  echo "COCKPIT_REPO=$COCKPIT_REPO"
  echo "COCKPIT_VAULT=$COCKPIT_VAULT"
  echo "ONTOLOGY_STORE=$ONTOLOGY_STORE"
  echo "ONTOLOGY_ROOT=$ONTOLOGY_ROOT"
  echo "PORT=$PORT HOST=$HOST"
fi
