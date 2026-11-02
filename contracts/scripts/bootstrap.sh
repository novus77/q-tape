#!/usr/bin/env bash
# Bootstrap the formal Q-Tape contracts package.
#
# Pins every external dependency, builds the test-only Falcon-512 signer and
# creates fresh local test keys. All output stays in git-ignored paths:
#   vendor/, bin/, out/, cache/, fixtures/
#
# The signer and fixtures are laboratory material. Never use these keys for
# real assets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FNDSA_PIN=54a14f251786686c41839c2f0cdb3655ea245ea3
INTERFACE_PIN=6efa8e3eed3d89c301856e3fa8bb74b63eaa9f02
PQCLEAN_PIN=0586a824fc0d49df0b6b6e9179d8d15d06d0974f
FORGE_STD_PIN=f3dae6e6ee381f25eb6a246f7da9b85c91a68219
EXPERIMENT_VENDOR="$ROOT/../experiments/guardian-fork/vendor"

mkdir -p vendor/fndsa vendor/pq-verifier-interface vendor/forge-std bin fixtures

# forge-std: reuse the pinned experiment checkout when available, otherwise
# clone the exact commit. The pin is checked in both cases.
if [[ ! -f vendor/forge-std/src/Test.sol ]]; then
    if [[ -f "$EXPERIMENT_VENDOR/forge-std/src/Test.sol" ]]; then
        cp -R "$EXPERIMENT_VENDOR/forge-std/." vendor/forge-std/
    else
        git clone --filter=blob:none --no-checkout https://github.com/foundry-rs/forge-std.git vendor/forge-std
        git -C vendor/forge-std checkout --detach "$FORGE_STD_PIN"
    fi
fi
if [[ -d vendor/forge-std/.git ]]; then
    [[ "$(git -C vendor/forge-std rev-parse HEAD)" == "$FORGE_STD_PIN" ]]
fi

# fndsa-solidity verifier sources (Falcon / FN-DSA), exact commit files.
for file in FNDSA.sol FNDSAKeccak.sol FNDSAVerifier.sol LICENSE; do
    if [[ ! -f "vendor/fndsa/$file" ]]; then
        if [[ -f "$EXPERIMENT_VENDOR/fndsa/$file" ]]; then
            cp "$EXPERIMENT_VENDOR/fndsa/$file" "vendor/fndsa/$file"
        else
            curl --fail --location --silent --show-error \
                "https://raw.githubusercontent.com/skalenetwork/fndsa-solidity/$FNDSA_PIN/$([[ "$file" == LICENSE ]] && echo LICENSE || echo "src/$file")" \
                -o "vendor/fndsa/$file"
        fi
    fi
done

# pq-verifier-interface sources, exact commit files.
for file in IERC165.sol IPQVerifier.sol PQAlgorithms.sol; do
    if [[ ! -f "vendor/pq-verifier-interface/$file" ]]; then
        if [[ -f "$EXPERIMENT_VENDOR/pq-verifier-interface/$file" ]]; then
            cp "$EXPERIMENT_VENDOR/pq-verifier-interface/$file" "vendor/pq-verifier-interface/$file"
        else
            curl --fail --location --silent --show-error \
                "https://raw.githubusercontent.com/skalenetwork/pq-verifier-interface/$INTERFACE_PIN/src/$file" \
                -o "vendor/pq-verifier-interface/$file"
        fi
    fi
done

# PQClean Falcon-512 reference implementation (sparse: falcon-512/clean + common).
if [[ ! -f vendor/PQClean/crypto_sign/falcon-512/clean/api.h ]]; then
    if [[ -f "$EXPERIMENT_VENDOR/PQClean/crypto_sign/falcon-512/clean/api.h" ]]; then
        cp -R "$EXPERIMENT_VENDOR/PQClean/." vendor/PQClean/
    else
        git clone --filter=blob:none --sparse --no-checkout https://github.com/PQClean/PQClean.git vendor/PQClean
        git -C vendor/PQClean checkout --detach "$PQCLEAN_PIN"
        git -C vendor/PQClean sparse-checkout set crypto_sign/falcon-512/clean common
    fi
fi
if [[ -d vendor/PQClean/.git ]]; then
    [[ "$(git -C vendor/PQClean rev-parse HEAD)" == "$PQCLEAN_PIN" ]]
fi

clang -O2 -Ivendor/PQClean/common -Ivendor/PQClean/crypto_sign/falcon-512/clean \
    tools/falcon_signer.c vendor/PQClean/crypto_sign/falcon-512/clean/*.c \
    vendor/PQClean/common/fips202.c vendor/PQClean/common/randombytes.c -o bin/falcon-signer

if [[ ! -f fixtures/test-secret-key.bin || ! -f fixtures/public-key.hex ]]; then
    bin/falcon-signer keygen fixtures/test-secret-key.bin fixtures/public-key.hex
fi
if [[ ! -f fixtures/test-secret-key-2.bin || ! -f fixtures/public-key-2.hex ]]; then
    bin/falcon-signer keygen fixtures/test-secret-key-2.bin fixtures/public-key-2.hex
fi

printf 'Local test-only Falcon signer ready. Never use these keys for real assets.\n'
