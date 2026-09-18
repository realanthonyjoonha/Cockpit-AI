# shellcheck shell=bash
# Shared dest / live-tree guards for dogfood-up/e2e/down. Source me.
# Decision-support only.

dogfood_default_dest() {
  local root="${1:?}"
  echo "${COCKPIT_DOGFOOD:-$root/.cockpit-dogfood}"
}

# Books clone for --slugs. Cloud VM path first; Mac Desktop still works.
# Never return the kernel research-wiki stub (no houses).
dogfood_resolve_vault() {
  local root="${1:-}"
  local cand
  if [ -n "${COCKPIT_VAULT:-}" ] && [ -d "$COCKPIT_VAULT" ]; then
    printf '%s' "$COCKPIT_VAULT"
    return 0
  fi
  for cand in \
    /home/ubuntu/cockpit-vault \
    "$HOME/cockpit-vault" \
    "$HOME/Desktop/cockpit-vault"
  do
    if [ -d "$cand" ] && { [ -d "$cand/wiki" ] || [ -d "$cand/cockpit" ] || [ -f "$cand/house-view-nvda.md" ]; }; then
      printf '%s' "$cand"
      return 0
    fi
  done
  if [ -n "$root" ]; then
    cand="$(cd "$root/.." 2>/dev/null && pwd)/cockpit-vault"
    if [ -d "$cand" ] && { [ -d "$cand/wiki" ] || [ -d "$cand/cockpit" ] || [ -f "$cand/house-view-nvda.md" ]; }; then
      printf '%s' "$cand"
      return 0
    fi
  fi
  return 1
}

# True if p is a live operate tree we must not rsync-into / wipe.
# Testing-cockpit seals (.cockpit-dogfood) are never live.
is_live_tree() {
  local p="${1:-}"
  [ -n "$p" ] || return 1
  [ -d "$p" ] || [ -L "$p" ] || return 1
  local abs physp cand candp
  abs="$(cd "$p" 2>/dev/null && pwd)" || return 1
  physp="$(cd "$p" 2>/dev/null && pwd -P)" || physp="$abs"
  case "$abs" in
    */.cockpit-dogfood|*/.cockpit-dogfood/) return 1 ;;
  esac
  case "$physp" in
    */.cockpit-dogfood|*/.cockpit-dogfood/) return 1 ;;
  esac
  if [ -f "$abs/.cockpit-dogfood.json" ] || [ -f "$physp/.cockpit-dogfood.json" ]; then
    return 1
  fi
  for cand in \
    "${COCKPIT_KERNEL:-$HOME/Desktop/cockpit-kernel}" \
    "${COCKPIT_PRODUCT:-$HOME/Desktop/cockpit-product}" \
    "$HOME/Desktop/cockpit-kernel" \
    "$HOME/Desktop/cockpit-product" \
    "$HOME/Desktop/cockpit-vault" \
    /home/ubuntu/cockpit-vault \
    "$HOME/cockpit-vault" \
    "$HOME/cockpit-personal/repo"
  do
    [ -e "$cand" ] || [ -L "$cand" ] || continue
    candp="$(cd "$cand" 2>/dev/null && pwd -P || true)"
    if [ -n "$candp" ] && [ "$physp" = "$candp" ]; then
      return 0
    fi
  done
  case "$physp" in
    *"/cockpit-vault"|*"/cockpit-personal"|*"/cockpit-personal/repo") return 0 ;;
  esac
  if [ -L "$abs/research-wiki" ] || [ -L "$physp/research-wiki" ]; then
    return 0
  fi
  local vault_cand vault_real wiki_real
  for vault_cand in "$HOME/Desktop/cockpit-vault" /home/ubuntu/cockpit-vault "$HOME/cockpit-vault"; do
    if [ -d "$vault_cand" ]; then
      vault_real="$(cd "$vault_cand" 2>/dev/null && pwd -P || true)"
      wiki_real="$(cd "$abs/research-wiki" 2>/dev/null && pwd -P || true)"
      if [ -n "$vault_real" ] && [ -n "$wiki_real" ] && [ "$vault_real" = "$wiki_real" ]; then
        return 0
      fi
    fi
  done
  return 1
}
