/*
 * Q-Tape native Falcon-512 signer.
 *
 * Production-oriented, deterministic stdio protocol. Secrets are only ever
 * accepted on stdin and never appear in argv, environment variables,
 * temporary files, or diagnostics.
 *
 * Protocol (all integers are unsigned 32-bit big-endian):
 *
 *   keygen
 *     stdin : empty
 *     stdout: u32 pkLen | pk (897) | u32 skLen | sk (1281)
 *
 *   sign
 *     stdin : u32 skLen | sk (1281) | 32-byte digest
 *     stdout: u32 sigLen | signature (<= 752)
 *
 *   verify
 *     stdin : u32 pkLen | pk (897) | u32 msgLen | message |
 *             u32 sigLen | signature
 *     stdout: 0x01 when valid, 0x00 when invalid
 *
 * Exit codes: 0 success/verified, 2 invalid input or verification failure,
 * 1 unexpected internal failure. Every diagnostic is a fixed string; key
 * material is never formatted or printed.
 */

#include "api.h"
#include "inner.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define QT_PK_LEN PQCLEAN_FALCON512_CLEAN_CRYPTO_PUBLICKEYBYTES
#define QT_SK_LEN PQCLEAN_FALCON512_CLEAN_CRYPTO_SECRETKEYBYTES
#define QT_SIG_MAX PQCLEAN_FALCON512_CLEAN_CRYPTO_BYTES
#define QT_DIGEST_LEN 32u
#define QT_MAX_MESSAGE_LEN (16u * 1024u * 1024u)

#define QT_EXIT_FAILURE 1
#define QT_EXIT_INVALID 2

static void fail_invalid(const char *message) {
    fprintf(stderr, "%s\n", message);
    exit(QT_EXIT_INVALID);
}

static void fail_internal(const char *message) {
    fprintf(stderr, "%s\n", message);
    exit(QT_EXIT_FAILURE);
}

static int read_exact(uint8_t *out, size_t length) {
    size_t offset = 0;
    while (offset < length) {
        size_t got = fread(out + offset, 1, length - offset, stdin);
        if (got == 0) return 0;
        offset += got;
    }
    return 1;
}

static int read_u32(uint32_t *value) {
    uint8_t encoded[4];
    if (!read_exact(encoded, sizeof encoded)) return 0;
    *value = ((uint32_t)encoded[0] << 24) |
             ((uint32_t)encoded[1] << 16) |
             ((uint32_t)encoded[2] << 8) |
             (uint32_t)encoded[3];
    return 1;
}

static int require_eof(void) {
    return fgetc(stdin) == EOF;
}

static int write_all(const uint8_t *data, size_t length) {
    size_t offset = 0;
    while (offset < length) {
        size_t written = fwrite(data + offset, 1, length - offset, stdout);
        if (written == 0) return 0;
        offset += written;
    }
    return 1;
}

static int write_u32(uint32_t value) {
    uint8_t encoded[4];
    encoded[0] = (uint8_t)(value >> 24);
    encoded[1] = (uint8_t)(value >> 16);
    encoded[2] = (uint8_t)(value >> 8);
    encoded[3] = (uint8_t)value;
    return write_all(encoded, sizeof encoded);
}

static void clear_bytes(void *data, size_t length) {
    volatile uint8_t *cursor = (volatile uint8_t *)data;
    while (length-- > 0) *cursor++ = 0;
}

typedef union {
    uint8_t bytes[FALCON_KEYGEN_TEMP_9];
    uint64_t align_u64;
    fpr align_fpr;
} qt_falcon_tmp;

/*
 * Decode the private key layout produced by PQClean's Falcon-512 keygen:
 * header byte 0x59, then trimmed f, g and F polynomials.
 */
static int decode_secret_key(int8_t f[512], int8_t g[512], int8_t F[512], const uint8_t *sk) {
    size_t offset = 1;
    size_t length;

    if (sk[0] != 0x50 + 9) return 0;

    length = PQCLEAN_FALCON512_CLEAN_trim_i8_decode(
        f, 9, PQCLEAN_FALCON512_CLEAN_max_fg_bits[9], sk + offset, QT_SK_LEN - offset);
    if (length == 0) return 0;
    offset += length;

    length = PQCLEAN_FALCON512_CLEAN_trim_i8_decode(
        g, 9, PQCLEAN_FALCON512_CLEAN_max_fg_bits[9], sk + offset, QT_SK_LEN - offset);
    if (length == 0) return 0;
    offset += length;

    length = PQCLEAN_FALCON512_CLEAN_trim_i8_decode(
        F, 9, PQCLEAN_FALCON512_CLEAN_max_FG_bits[9], sk + offset, QT_SK_LEN - offset);
    if (length == 0) return 0;
    offset += length;

    return offset == QT_SK_LEN;
}

/*
 * Derive the public key from a private key so signing can self-verify
 * without receiving a second copy of the public key on stdin.
 */
static int derive_public_key(uint8_t *pk, const uint8_t *sk) {
    int8_t f[512], g[512], F[512];
    uint16_t h[512];
    qt_falcon_tmp tmp;

    if (!decode_secret_key(f, g, F, sk)) return 0;
    if (!PQCLEAN_FALCON512_CLEAN_compute_public(h, f, g, 9, tmp.bytes)) return 0;

    pk[0] = 0x00 + 9;
    return PQCLEAN_FALCON512_CLEAN_modq_encode(pk + 1, QT_PK_LEN - 1, h, 9) == QT_PK_LEN - 1;
}

static int command_keygen(void) {
    uint8_t pk[QT_PK_LEN];
    uint8_t sk[QT_SK_LEN];

    if (!require_eof()) fail_invalid("keygen: unexpected stdin input");
    if (PQCLEAN_FALCON512_CLEAN_crypto_sign_keypair(pk, sk) != 0) {
        fail_internal("keygen: key generation failed");
    }
    if (!write_u32((uint32_t)QT_PK_LEN) ||
        !write_all(pk, sizeof pk) ||
        !write_u32((uint32_t)QT_SK_LEN) ||
        !write_all(sk, sizeof sk) ||
        fflush(stdout) != 0) {
        clear_bytes(sk, sizeof sk);
        fail_internal("keygen: stdout write failed");
    }
    clear_bytes(sk, sizeof sk);
    return 0;
}

static int command_sign(void) {
    uint32_t sk_len = 0;
    uint8_t sk[QT_SK_LEN];
    uint8_t digest[QT_DIGEST_LEN];
    uint8_t signature[QT_SIG_MAX];
    uint8_t pk[QT_PK_LEN];
    size_t signature_len = 0;

    if (!read_u32(&sk_len)) fail_invalid("sign: truncated input");
    if (sk_len != QT_SK_LEN) fail_invalid("sign: invalid secret key length");
    if (!read_exact(sk, sizeof sk)) fail_invalid("sign: truncated secret key");
    if (!read_exact(digest, sizeof digest)) {
        clear_bytes(sk, sizeof sk);
        fail_invalid("sign: truncated digest");
    }
    if (!require_eof()) {
        clear_bytes(sk, sizeof sk);
        fail_invalid("sign: trailing input");
    }

    if (!derive_public_key(pk, sk)) {
        clear_bytes(sk, sizeof sk);
        fail_invalid("sign: invalid Falcon-512 secret key");
    }
    if (PQCLEAN_FALCON512_CLEAN_crypto_sign_signature(
            signature, &signature_len, digest, sizeof digest, sk) != 0) {
        clear_bytes(sk, sizeof sk);
        fail_invalid("sign: signing failed");
    }
    if (PQCLEAN_FALCON512_CLEAN_crypto_sign_verify(
            signature, signature_len, digest, sizeof digest, pk) != 0) {
        clear_bytes(sk, sizeof sk);
        fail_invalid("sign: self-verification failed");
    }
    if (!write_u32((uint32_t)signature_len) ||
        !write_all(signature, signature_len) ||
        fflush(stdout) != 0) {
        clear_bytes(sk, sizeof sk);
        fail_internal("sign: stdout write failed");
    }

    clear_bytes(sk, sizeof sk);
    return 0;
}

static int command_verify(void) {
    uint32_t pk_len = 0;
    uint32_t message_len = 0;
    uint32_t signature_len = 0;
    uint8_t pk[QT_PK_LEN];
    uint8_t signature[QT_SIG_MAX];
    uint8_t empty = 0;
    uint8_t *message = NULL;
    int valid = 0;

    if (!read_u32(&pk_len)) fail_invalid("verify: truncated input");
    if (pk_len != QT_PK_LEN) fail_invalid("verify: invalid public key length");
    if (!read_exact(pk, sizeof pk)) fail_invalid("verify: truncated public key");

    if (!read_u32(&message_len)) fail_invalid("verify: truncated input");
    if (message_len > QT_MAX_MESSAGE_LEN) fail_invalid("verify: message too large");
    if (message_len > 0) {
        message = (uint8_t *)malloc(message_len);
        if (message == NULL) fail_internal("verify: allocation failed");
        if (!read_exact(message, message_len)) {
            free(message);
            fail_invalid("verify: truncated message");
        }
    }

    if (!read_u32(&signature_len)) {
        free(message);
        fail_invalid("verify: truncated input");
    }
    if (signature_len == 0 || signature_len > QT_SIG_MAX) {
        free(message);
        fail_invalid("verify: invalid signature length");
    }
    if (!read_exact(signature, signature_len)) {
        free(message);
        fail_invalid("verify: truncated signature");
    }
    if (!require_eof()) {
        free(message);
        fail_invalid("verify: trailing input");
    }

    valid = PQCLEAN_FALCON512_CLEAN_crypto_sign_verify(
                signature, signature_len, message == NULL ? &empty : message,
                message_len, pk) == 0;
    free(message);

    if (fputc(valid ? 0x01 : 0x00, stdout) == EOF || fflush(stdout) != 0) {
        fail_internal("verify: stdout write failed");
    }
    return valid ? 0 : QT_EXIT_INVALID;
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fail_invalid("usage: qtape-falcon keygen|sign|verify");
    }
    if (strcmp(argv[1], "keygen") == 0) return command_keygen();
    if (strcmp(argv[1], "sign") == 0) return command_sign();
    if (strcmp(argv[1], "verify") == 0) return command_verify();
    fail_invalid("usage: qtape-falcon keygen|sign|verify");
    return QT_EXIT_INVALID;
}
