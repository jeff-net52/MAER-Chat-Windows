# MAER Chat pour Windows

Client de bureau Windows 10/11 x64 pour les comptes XMPP MAER existants (`@xmpp.maer.fr`), transportés par le service public sécurisé `xmpp.maer.fr`. L’interface reprend les repères d’une messagerie de bureau moderne tout en utilisant uniquement la marque et les ressources MAER.

## État du projet

- Client Electron/TypeScript construit localement.
- Interface française inspirée de WhatsApp Desktop, avec la palette bleue/cyan
  MAER, thèmes clair/sombre/système et connexion par identifiant/mot de passe.
- La connexion classique demande uniquement la partie locale de l’identifiant
  (par exemple `emilien`) et construit exclusivement
  `emilien@xmpp.maer.fr`. Les JID complets, ressources XMPP et autres domaines
  sont refusés.
- Rail Discussions/Appels/Paramètres, recherche et filtre des contacts, test
  caméra/microphone, notifications et sons configurables.
- Appels audio/vidéo et partage d’écran par lien de réunion Jitsi aléatoire,
  envoyé dans la conversation puis ouvert dans le navigateur système après
  consentement explicite lors de la première utilisation.
- Parcours QR préparé côté Windows, mais non opérationnel tant que les
  composants Android et serveur décrits dans `docs/PAIRING_PROTOCOL_V1.md` ne
  sont pas implémentés et déployés.
- Moteur XMPP Converse.js 14 : conversations privées et groupes, MAM, HTTP Upload, réponses, corrections, réactions, retraits, accusés, notifications et OMEMO.
- Secrets d’authentification XMPP enregistrés dans le Gestionnaire
  d’identifiants Windows (`@napi-rs/keyring`).
- Plateforme interne de plugins first-party compilés avec l’application :
  contrats versionnés, capacités déclarées, IPC cloisonné par plugin,
  activation idempotente et isolation des pannes. La validation est fermée par
  défaut : tout manifeste, capacité ou contribution inconnu ou incohérent
  empêche l’activation du plugin concerné. Aucun chargement de plugin tiers
  arbitraire n’est pris en charge.
- Le plugin « MAER Password Vault » est uniquement un placeholder technique :
  il expose un statut de disponibilité pour valider la plateforme, mais ne
  stocke, ne génère, n’importe et n’affiche encore aucun mot de passe.
- **101 tests automatisés** actuellement réussis, complétés par un smoke test
  Electron et le harnais de régression visuelle de `tests/visual/`.

Le transport de la connexion classique a été vérifié le 26 août 2026 :
WebSocket public en `101 Switching Protocols`, flux XMPP accepté pour
`xmpp.maer.fr` et BOSH en HTTP 200. L’authentification réelle a été
validée dans le client installé avec le compte mémorisé par l’application,
sans lire, afficher ni enregistrer son secret dans le dépôt ou les rapports.

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
npm run test:e2e
npm run test:visual
```

`npm run test:visual` démarre un serveur Vite local sur un port disponible,
ouvre le harnais `tests/visual/shell.html` dans Chromium headless, contrôle la
géométrie du rail, de la liste et de la conversation, les trois actions
d’appel ainsi que les couleurs MAER, puis écrit une capture dans le dossier
temporaire du système. Le chemin et les mesures contrôlées sont affichés en
JSON. La variable facultative `MAER_VISUAL_OUTPUT` permet de choisir un autre
emplacement pour la capture.

## Installation Windows

```bash
npm run dist
```

L’installateur NSIS x64 est généré sous `dist/`. La dernière livraison validée est
`Release/MAER-Chat-Setup-1.1.0-x64.exe` ; voir
`docs/RELEASE_REPORT_1.1.0.md`.

## Sécurité

- `contextIsolation`, sandbox Electron et CSP activés ;
- aucun accès Node depuis le renderer ;
- chaque appel IPC est accepté uniquement depuis le `webContents` attendu, sa
  frame principale et l’URL/origine locale exacte ; aucun pont IPC générique
  n’est exposé au renderer ;
- politique de permissions Electron fermée par défaut : seules les
  permissions `media` et `notifications` sont admissibles depuis cette même
  frame de confiance ;
- navigation distante interdite ;
- réunions ouvertes uniquement dans le navigateur système, sans iframe ni
  extension de la politique CSP de l’application ;
- OAuth QR limité au scope `sasl_auth` ;
- aucun secret dans le QR, les fichiers applicatifs ou IndexedDB ;
- mot de passe/jeton transmis au renderer uniquement pendant la connexion XMPP.

## Licence

GPL-3.0-or-later. Voir `LICENSE` et `THIRD_PARTY_NOTICES.md`.
