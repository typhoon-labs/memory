# chain-sts: signing in a KMS

> **Owner:** chain-sts maintainers · **Type:** proposal · **Checked:** 2026-11-03 against chain-sts 0.2.0, Agentgateway 1.7.0

A design, not built: the demo signs with a key in a Secret. Production needs
this ([`docs/production-design.md`](../../../docs/production-design.md), section 5).

## Signing in a KMS

Signing is behind `Signer` in [`keys.py`](../src/chain_sts/keys.py): `kid`,
`alg`, `public_jwk()` and `sign(message) -> signature`. The service builds the
token itself (the JWS header `alg`, `typ`, `kid`, and the claims, each
base64url-encoded) and asks the signer for the signature over
`<header>.<claims>`. At start, `KeySet` asks each key once for its public
JWK, checks that its `kid` is the thumbprint and its `alg` RS256, and
publishes it. The file key (`FileSigner`) is the only implementation; the
demo has no KMS. One for a KMS would:

- **Hold no private key.** At start it fetches the key version's public key
  once, computes the `kid` from it, and keeps the JWK: AWS KMS `GetPublicKey`
  (DER SubjectPublicKeyInfo), Cloud KMS `getPublicKey` (PEM), Vault Transit
  `GET /transit/keys/:name`.
- **Sign with the KMS's asymmetric sign call**, over the SHA-256 of the
  message: AWS KMS `Sign` with `SigningAlgorithm` `RSASSA_PKCS1_V1_5_SHA_256`
  and `MessageType` `DIGEST` (a key of spec `RSA_2048`, usage `SIGN_VERIFY`);
  Cloud KMS `asymmetricSign` on a version of algorithm
  `RSA_SIGN_PKCS1_2048_SHA256`, with `digest.sha256`; Vault Transit `POST
  /transit/sign/:name/sha2-256` with `signature_algorithm: pkcs1v15` (the
  default is PSS), `prehashed: true` and `key_version` set, then the
  signature without its `vault:v<n>:` prefix, from standard base64.
- **Stay RS256.** `delivery-mcp` and the agents accept RS256 only, and so does
  the service for its own tokens. ES256 would mean changing every verifier,
  and all three APIs return an ECDSA signature DER-encoded, which JWS needs
  as R‖S (RFC 7518, section 3.4).
- **Be named in the configuration** as a key version beside `files`; the
  roles `sign`, `next` and `previous` stay as they are.
- **Be called off the event loop.** `sign` is synchronous; a network call
  belongs in a worker thread (`asyncio.to_thread`), as the subject's key
  lookup does, and a KMS that does not answer is then `temporarily_unavailable`.
- **Run with the pod's own cloud identity** (EKS Pod Identity or IRSA, GKE
  Workload Identity, Vault's Kubernetes auth), allowed only to sign with and
  read the public key of these keys.

With a KMS a rotation is the same three steps, with key versions instead of
Secrets: the key never leaves the KMS, so there is no Secret to create or
delete. Cloud KMS: a new version of the same key; Vault Transit: `POST
/transit/keys/:name/rotate`; AWS KMS: no rotation of asymmetric keys at all,
so a new key, with an alias moved by hand. The service must sign with a
version named in its configuration, never "the latest": a rotation in the
KMS would otherwise make it sign with a key no verifier has. Sources:
<https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html>,
<https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html>,
<https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html>,
<https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/asymmetricSign>,
<https://docs.cloud.google.com/kms/docs/key-rotation>,
<https://developer.hashicorp.com/vault/api-docs/secret/transit>.
