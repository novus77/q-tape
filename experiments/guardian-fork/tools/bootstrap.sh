#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

FNDSA_PIN=54a14f251786686c41839c2f0cdb3655ea245ea3
INTERFACE_PIN=6efa8e3eed3d89c301856e3fa8bb74b63eaa9f02
PQCLEAN_PIN=0586a824fc0d49df0b6b6e9179d8d15d06d0974f
FORGE_STD_PIN=f3dae6e6ee381f25eb6a246f7da9b85c91a68219
mkdir -p vendor/fndsa vendor/pq-verifier-interface bin fixtures results

if [[ ! -d vendor/forge-std/.git ]]; then
    git clone --filter=blob:none --no-checkout https://github.com/foundry-rs/forge-std.git vendor/forge-std
fi
git -C vendor/forge-std checkout --detach "$FORGE_STD_PIN"
[[ "$(git -C vendor/forge-std rev-parse HEAD)" == "$FORGE_STD_PIN" ]]

for file in FNDSA.sol FNDSAKeccak.sol FNDSAVerifier.sol; do
    if [[ ! -f "vendor/fndsa/$file" ]]; then
        curl --fail --location --silent --show-error "https://raw.githubusercontent.com/skalenetwork/fndsa-solidity/$FNDSA_PIN/src/$file" -o "vendor/fndsa/$file"
    fi
done
if [[ ! -f vendor/fndsa/LICENSE ]]; then
    curl --fail --location --silent --show-error "https://raw.githubusercontent.com/skalenetwork/fndsa-solidity/$FNDSA_PIN/LICENSE" -o vendor/fndsa/LICENSE
fi
for file in IERC165.sol IPQVerifier.sol PQAlgorithms.sol; do
    if [[ ! -f "vendor/pq-verifier-interface/$file" ]]; then
        curl --fail --location --silent --show-error "https://raw.githubusercontent.com/skalenetwork/pq-verifier-interface/$INTERFACE_PIN/src/$file" -o "vendor/pq-verifier-interface/$file"
    fi
done
if [[ ! -d vendor/PQClean/.git ]]; then
    git clone --filter=blob:none --sparse --no-checkout https://github.com/PQClean/PQClean.git vendor/PQClean
    git -C vendor/PQClean checkout --detach "$PQCLEAN_PIN"
    git -C vendor/PQClean sparse-checkout set crypto_sign/falcon-512/clean common
fi
[[ "$(git -C vendor/PQClean rev-parse HEAD)" == "$PQCLEAN_PIN" ]]

clang -O2 -Ivendor/PQClean/common -Ivendor/PQClean/crypto_sign/falcon-512/clean \
    tools/falcon_signer.c vendor/PQClean/crypto_sign/falcon-512/clean/*.c \
    vendor/PQClean/common/fips202.c vendor/PQClean/common/randombytes.c -o bin/falcon-signer
if [[ ! -f fixtures/test-secret-key.bin || ! -f fixtures/public-key.hex ]]; then
    bin/falcon-signer keygen fixtures/test-secret-key.bin fixtures/public-key.hex
fi
if [[ ! -f fixtures/test-secret-key-2.bin || ! -f fixtures/public-key-2.hex ]]; then
    bin/falcon-signer keygen fixtures/test-secret-key-2.bin fixtures/public-key-2.hex
fi
printf 'Local test-only signer ready. Never use these keys for real assets.\n'
