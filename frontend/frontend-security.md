# Frontend security

App-wide view: [docs/06-security.md](../docs/06-security.md).

## Seed phrase (the most sensitive thing on the device)

| ✓ | Rule |
|---|---|
| ☐ | Generate with `@scure/bip39` using `crypto.getRandomValues` (128 bits → 12 words); import accepts 12 or 24 words and checks the checksum |
| ☐ | Words are shown only after "Tap to reveal", and hidden again when the app goes to the background (`visibilitychange`) |
| ☐ | Stored only as ciphertext in IndexedDB: AES-GCM with a key from a **passkey (WebAuthn PRF)** where supported; otherwise from an app PIN of at least 6 digits (PBKDF2-SHA256, 600 000 iterations, random salt). Never in localStorage, cookies or the service worker cache (A10) |
| ☐ | Decrypted only inside `signAction` and "Reveal seed phrase"; the decrypted value is dropped right after use |
| ☐ | Never sent over the network. A test checks the request log during sign-up and import for any word (R1) |
| ☐ | Never logged and never in error reports. Seed screens have no analytics |
| ☐ | `autocomplete="off"`, `spellcheck="false"`, `autocapitalize="none"` on the import field; no paste-to-clipboard of the phrase |
| ☐ | 5 wrong PINs → 30 s lockout, doubling each time. The user can always re-import with the words |

## Circle (Google users)

- `encryptionKey` and `userToken` are kept in memory only (with a sessionStorage fallback for reloads) and never sent anywhere except Circle's SDK and our `/api/auth/google`.
- Every approval is shown by Circle's own sheet. Never imitate it.
- Before opening it, `verifyAction` decodes what will be signed and compares it with the screen (A5).

## Page hardening

| ✓ | Item |
|---|---|
| ☐ | CSP: `default-src 'self'`; `script-src 'self'` plus Circle SDK origins; `connect-src` for our API, Circle, RPCs, Jupiter; `img-src 'self' data: blob:`; `frame-ancestors 'none'` |
| ☐ | No `dangerouslySetInnerHTML`. Receipt text, shop names and email summaries are rendered as text only |
| ☐ | External links (explorers) use `rel="noopener noreferrer"`, and their URLs are built only from tx hashes we validated |
| ☐ | `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` allowing only camera and microphone (on Add) |
| ☐ | No secrets in the bundle. Only `NEXT_PUBLIC_CIRCLE_APP_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_VAPID_PUBLIC` are public |
| ☐ | Third-party scripts: only the Circle SDK. No analytics in the hackathon build |

## Privacy on screen

- Share card: amounts hidden by default, and never an address.
- The shared landing `/r/[code]` shows the inviter's first name only.
- Copy-to-clipboard for addresses shows a toast. Never auto-copy.
- Pages with balances set `Cache-Control: no-store` for HTML.
