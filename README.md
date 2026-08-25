# MAER Chat pour Windows

Client de bureau Windows 10/11 x64 pour le service XMPP MAER (`contacts.chaumont.me`). L’interface reprend les repères d’une messagerie de bureau moderne tout en utilisant uniquement la marque et les ressources MAER.

## État du projet

- Client Electron/TypeScript construit localement.
- Interface française claire/sombre, connexion QR ou identifiant/mot de passe.
- Moteur XMPP Converse.js 14 : conversations privées et groupes, MAM, HTTP Upload, réponses, corrections, réactions, retraits, accusés, notifications et OMEMO.
- Secrets enregistrés dans le Gestionnaire d’identifiants Windows (`@napi-rs/keyring`).
- 52 tests automatisés actuellement réussis.

Deux prérequis serveur restent nécessaires avant les essais réels :

1. exposer XMPP-over-WebSocket et BOSH en TLS ;
2. déployer l’extension d’association décrite dans `docs/PAIRING_PROTOCOL_V1.md`.

Le client Android n’est pas modifié dans ce dépôt. Les instructions destinées à Codex seront livrées dans `docs/CODEX_ANDROID_LINKED_DEVICES.md`.

## Développement

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Installation Windows

```bash
npm run dist
```

L’installateur NSIS x64 est généré sous `dist/`.

## Sécurité

- `contextIsolation`, sandbox Electron et CSP activés ;
- aucun accès Node depuis le renderer ;
- navigation distante interdite ;
- OAuth QR limité au scope `sasl_auth` ;
- aucun secret dans le QR, les fichiers applicatifs ou IndexedDB ;
- mot de passe/jeton transmis au renderer uniquement pendant la connexion XMPP.

## Licence

GPL-3.0-or-later. Voir `LICENSE` et `THIRD_PARTY_NOTICES.md`.
