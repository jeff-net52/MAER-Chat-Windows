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
- Appels audio/vidéo et partage d’écran par invitation `MAER-CALL/1` envoyée
  via la conversation XMPP. Le salon Jitsi aléatoire s’ouvre dans une fenêtre
  MAER isolée après consentement explicite. Les invitations entrantes sont
  liées au salon et à une échéance contrôlée à nouveau au clic ; les liens
  Jitsi non liés à une invitation valide ne sont pas délégués au navigateur.
- Parcours QR implémenté dans les sources Windows, Android et MAER XMPP Server,
  avec approbation XMPP, jeton OAuth limité et révocation par appareil. Il ne
  sera déclaré opérationnel qu'après le déploiement du nouveau serveur sur le
  NAS et un essai de bout en bout avec les clients réellement installés.
- Moteur XMPP Converse.js 14 : conversations privées et groupes, MAM, HTTP Upload, réponses, corrections, réactions, retraits, accusés, notifications et OMEMO.
- Secrets d’authentification XMPP enregistrés dans le Gestionnaire
  d’identifiants Windows (`@napi-rs/keyring`).
- Plateforme interne de plugins first-party compilés avec l’application :
  contrats versionnés, capacités déclarées, IPC cloisonné par plugin,
  activation idempotente et isolation des pannes. La validation est fermée par
  défaut : tout manifeste, capacité ou contribution inconnu ou incohérent
  empêche l’activation du plugin concerné. Aucun chargement de plugin tiers
  arbitraire n’est pris en charge.
- Le plugin « MAER Password Vault » fournit un coffre KDBX 4.1 chiffré local,
  une interface inspirée de Firefox, génération/copie temporaire, verrouillage
  automatique et extensions Edge/Chrome/Firefox. Le pont Native Messaging reste
  strictement main-only, authentifie un pipe local et lie chaque révélation à
  l’origine Web exacte. Une révélation demandée depuis l’interface exige aussi
  une confirmation native du processus principal ; le secret est ensuite
  transmis au renderer isolé uniquement pour l’affichage demandé et effacé de
  l’interface après 15 secondes. Le renderer fait donc partie du modèle de
  confiance pendant cette courte fenêtre, contrairement aux listes du coffre
  qui ne contiennent jamais les mots de passe.
- La suite de tests automatisés est complétée par un smoke test
  Electron et le harnais de régression visuelle de `tests/visual/`.

Le transport de la connexion classique a été vérifié le 26 août 2026 :
WebSocket public en `101 Switching Protocols`, flux XMPP accepté pour
`xmpp.maer.fr` et BOSH en HTTP 200. L’authentification réelle a été
validée dans le client installé avec le compte mémorisé par l’application,
sans lire, afficher ni enregistrer son secret dans le dépôt ou les rapports.

Le contrat d'association QR est défini dans `docs/PAIRING_PROTOCOL_V1.md`. Son
implémentation a passé les tests unitaires croisés Windows, Android et serveur,
mais le déploiement NAS et la validation réelle restent obligatoires avant de
présenter la fonction comme livrée. Les fichiers
`docs/CODEX_ANDROID_LINKED_DEVICES.md` et `docs/CODEX_PROJECT_HANDOFF.md` sont
des archives de conception conservées pour traçabilité.

Le contrat d’appel entrant interopérable est défini, avec vecteurs exacts, dans
`docs/MAER_CALL_PROTOCOL_V1.md`. Les clients Android et Windows doivent utiliser
la forme canonique riche `mode + issued + expires + room` ; l’ancienne forme
réduite n’est pas considérée compatible.

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
emplacement pour la capture. Une seconde sonde initialise le vrai bundle
Converse.js sans compte XMPP et vérifie son DOM ainsi que l’injection MAER ;
elle ne remplace pas une capture du binaire authentifié.

## Installation Windows

```bash
npm run dist
```

L’installateur NSIS x64 est généré sous `dist/`. La candidate locale 1.3.2 a
été construite et validée à partir des sources actuelles ; voir
`docs/RELEASE_REPORT_1.3.2.md`. Elle n'est pas une release publique signée :
les conditions restantes sont détaillées dans `docs/RELEASE_POLICY.md`.

## Sécurité

- `contextIsolation`, sandbox Electron et CSP activés ;
- aucun accès Node depuis le renderer ;
- chaque appel IPC est accepté uniquement depuis le `webContents` attendu, sa
  frame principale et l’origine privilégiée exacte `maer-chat://app` ; aucun
  pont IPC générique n’est exposé au renderer ;
- politique de permissions Electron fermée par défaut : seules les
  permissions `media` et `notifications` sont admissibles depuis cette même
  frame de confiance ;
- navigation distante interdite dans la fenêtre principale ;
- réunions ouvertes uniquement dans une fenêtre MAER isolée et éphémère,
  limitée à `https://meet.jit.si/MAER-*` ; ces réunions utilisent actuellement
  le service Jitsi public et ne constituent pas une pile Jingle/TURN MAER ;
- les neuf fusibles de sécurité Electron sont déclarés explicitement et leur
  état est contrôlé sur l'exécutable empaqueté ;
- OAuth QR limité au scope `sasl_auth` ;
- aucun secret dans le QR, les fichiers applicatifs ou IndexedDB ;
- mot de passe/jeton transmis au renderer uniquement pendant la connexion XMPP.

## Licence

GPL-3.0-or-later pour le code. Voir `LICENSE`, `THIRD_PARTY_NOTICES.md` et
`TRADEMARK_NOTICE.md` pour le statut séparé du nom, du logo et des éléments
graphiques MAER.
