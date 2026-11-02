// Test-only local laboratory signer for the Q-Tape formal Guardian test suite.
//
// This tool reads an unencrypted secret key from a local file and prints a
// signature. It is NOT a product key store and must never be used for real
// assets. Production key handling and encrypted backups live in packages/signer.
//
// Uses unmodified PQClean Falcon-512 (round 3, v1.2) for key generation and
// every signature; the signer verifies its own output before printing it.
#include "api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static void fail(const char *message) {
    fprintf(stderr, "%s\n", message);
    exit(1);
}

static void write_hex(FILE *file, const unsigned char *bytes, size_t length) {
    fputs("0x", file);
    for (size_t i = 0; i < length; i++) fprintf(file, "%02x", bytes[i]);
}

static int nibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    fail("non-hex digest");
    return 0;
}

int main(int argc, char **argv) {
    unsigned char pk[PQCLEAN_FALCON512_CLEAN_CRYPTO_PUBLICKEYBYTES];
    unsigned char sk[PQCLEAN_FALCON512_CLEAN_CRYPTO_SECRETKEYBYTES];

    if (argc == 4 && strcmp(argv[1], "keygen") == 0) {
        if (PQCLEAN_FALCON512_CLEAN_crypto_sign_keypair(pk, sk) != 0) fail("keygen failed");
        FILE *secret = fopen(argv[2], "wb");
        if (!secret) fail("cannot write test key");
        if (chmod(argv[2], 0600) != 0) fail("cannot set test-key permissions");
        if (fwrite(sk, 1, sizeof sk, secret) != sizeof sk || fwrite(pk, 1, sizeof pk, secret) != sizeof pk) {
            fail("key write failed");
        }
        fclose(secret);
        FILE *public = fopen(argv[3], "w");
        if (!public) fail("cannot write test public key");
        write_hex(public, pk, sizeof pk);
        fputc('\n', public);
        fclose(public);
        puts("test keypair generated locally");
        return 0;
    }

    if (argc != 4 || strcmp(argv[1], "sign") != 0) {
        fail("usage: keygen SECRET PUBLIC_HEX | sign SECRET DIGEST_HEX");
    }

    FILE *secret = fopen(argv[2], "rb");
    if (!secret) fail("cannot read local test key");
    if (fread(sk, 1, sizeof sk, secret) != sizeof sk || fread(pk, 1, sizeof pk, secret) != sizeof pk
        || fgetc(secret) != EOF) {
        fail("invalid test-key file");
    }
    fclose(secret);

    const char *encoded = argv[3];
    if (encoded[0] == '0' && encoded[1] == 'x') encoded += 2;
    if (strlen(encoded) != 64) fail("expected a 32-byte digest");
    unsigned char message[32];
    for (size_t i = 0; i < sizeof message; i++) {
        message[i] = (unsigned char)((nibble(encoded[2 * i]) << 4) | nibble(encoded[2 * i + 1]));
    }

    unsigned char signature[PQCLEAN_FALCON512_CLEAN_CRYPTO_BYTES];
    size_t length = 0;
    if (PQCLEAN_FALCON512_CLEAN_crypto_sign_signature(signature, &length, message, sizeof message, sk) != 0) {
        fail("signing failed");
    }
    if (PQCLEAN_FALCON512_CLEAN_crypto_sign_verify(signature, length, message, sizeof message, pk) != 0) {
        fail("reference self-verification failed");
    }
    write_hex(stdout, signature, length);
    fputc('\n', stdout);
    return 0;
}
