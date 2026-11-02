#!/usr/bin/env bash
# Build the Q-Tape native Falcon-512 signer from pinned PQClean sources.
#
# The checkout is intentionally vendored inside packages/signer/vendor and
# ignored by git. Running this script repeatedly is safe: it reuses the
# existing checkout and only recompiles when sources are newer than the
# binary.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PACKAGE_DIR"

PQCLEAN_PIN=0586a824fc0d49df0b6b6e9179d8d15d06d0974f
PQCLEAN_REPO=https://github.com/PQClean/PQClean.git
VENDOR_DIR="$PACKAGE_DIR/vendor"
PQCLEAN_DIR="$VENDOR_DIR/PQClean"
BIN_DIR="$PACKAGE_DIR/bin"
BINARY="$BIN_DIR/qtape-falcon"
CC="${CC:-clang}"

mkdir -p "$VENDOR_DIR" "$BIN_DIR"

if [[ ! -d "$PQCLEAN_DIR/.git" ]]; then
    if [[ -e "$PQCLEAN_DIR" ]]; then
        echo "error: $PQCLEAN_DIR exists but is not a git checkout; remove it and rerun" >&2
        exit 1
    fi
    git clone --filter=blob:none --sparse --no-checkout "$PQCLEAN_REPO" "$PQCLEAN_DIR"
fi

current_pin="$(git -C "$PQCLEAN_DIR" rev-parse HEAD 2>/dev/null || true)"
if [[ "$current_pin" != "$PQCLEAN_PIN" ]]; then
    git -C "$PQCLEAN_DIR" fetch --quiet origin "$PQCLEAN_PIN"
    git -C "$PQCLEAN_DIR" checkout --detach "$PQCLEAN_PIN" >/dev/null
fi
if [[ "$(git -C "$PQCLEAN_DIR" rev-parse HEAD)" != "$PQCLEAN_PIN" ]]; then
    echo "error: PQClean checkout is not at pinned commit $PQCLEAN_PIN" >&2
    exit 1
fi

git -C "$PQCLEAN_DIR" sparse-checkout set crypto_sign/falcon-512/clean common >/dev/null
git -C "$PQCLEAN_DIR" read-tree -mu HEAD

if [[ ! -f "$PQCLEAN_DIR/crypto_sign/falcon-512/clean/api.h" || ! -f "$PQCLEAN_DIR/common/randombytes.c" ]]; then
    echo "error: PQClean checkout is missing Falcon-512/clean or common sources" >&2
    exit 1
fi

sources=(
    "$PACKAGE_DIR/native/falcon_signer.c"
    "$PQCLEAN_DIR/crypto_sign/falcon-512/clean"/*.c
    "$PQCLEAN_DIR/common/fips202.c"
    "$PQCLEAN_DIR/common/randombytes.c"
)

needs_build=1
if [[ -x "$BINARY" ]]; then
    needs_build=0
    for source in "${sources[@]}"; do
        if [[ "$source" -nt "$BINARY" ]]; then
            needs_build=1
            break
        fi
    done
fi

if (( needs_build )); then
    echo "building $BINARY with $CC"
    "$CC" -O2 \
        -I"$PQCLEAN_DIR/common" \
        -I"$PQCLEAN_DIR/crypto_sign/falcon-512/clean" \
        "$PACKAGE_DIR/native/falcon_signer.c" \
        "$PQCLEAN_DIR"/crypto_sign/falcon-512/clean/*.c \
        "$PQCLEAN_DIR/common/fips202.c" \
        "$PQCLEAN_DIR/common/randombytes.c" \
        -o "$BINARY"
    chmod 0755 "$BINARY"
else
    echo "$BINARY is up to date"
fi

printf 'PQClean Falcon-512 signer ready (PQClean %s).\n' "$PQCLEAN_PIN"
