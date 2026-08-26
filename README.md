# MAER Chat pour Windows

Client de bureau Windows 10/11 x64 pour le service XMPP MAER (`xmpp.maer.fr`). L’interface reprend les repères d’une messagerie de bureau moderne tout en utilisant uniquement la marque et les ressources MAER.

## État du projet

- Client Electron/TypeScript construit localement.
- Interface française claire/sombre et connexion par identifiant/mot de passe.
- Parcours QR préparé côté Windows, mais non opérationnel tant que les
  composants Android et serveur décrits dans `docs/PAIRING_PROTOCOL_V1.md` ne
  sont pas implémentés et déployés.
- Moteur XMPP Converse.js 14 : conversations privées et groupes, MAM, HTTP Upload, réponses, corrections, réactions, retraits, accusés, notifications et OMEMO.
- Secrets enregistrés dans le Gestionnaire d’identifiants Windows (`@napi-rs/keyring`).
- 54 tests automatisés actuellement réussis.

La connexion classique nécessite encore deux prérequis d’exploitation avant
les essais réels :

1. exposer XMPP-over-WebSocket ou BOSH derrière un certificat TLS valide ;
2. déclarer réellement `xmpp.maer.fr` comme virtual host et tester un compte.

L’association QR forme un chantier distinct : extension ejabberd, prise en
charge Android, tests de sécurité et déploiement. Les fichiers
`docs/CODEX_ANDROID_LINKED_DEVICES.md` et `docs/CODEX_PROJECT_HANDOFF.md` sont
des plans de travail conservés pour référence, pas des fonctionnalités livrées.

## Développement

```bash
npm ci
npm test
npm run typecheck
npm run build
```

## Installation Windows

```bash
npm run dist
```

L’installateur NSIS x64 est généré sous `dist/`. La dernière livraison validée est
`Release/MAER-Chat-Setup-1.0.1-x64.exe` ; voir
`docs/RELEASE_REPORT_1.0.1.md`.

## Sécurité

- `contextIsolation`, sandbox Electron et CSP activés ;
- aucun accès Node depuis le renderer ;
- navigation distante interdite ;
- OAuth QR limité au scope `sasl_auth` ;
- aucun secret dans le QR, les fichiers applicatifs ou IndexedDB ;
- mot de passe/jeton transmis au renderer uniquement pendant la connexion XMPP.

## Licence

GPL-3.0-or-later. Voir `LICENSE` et `THIRD_PARTY_NOTICES.md`.
