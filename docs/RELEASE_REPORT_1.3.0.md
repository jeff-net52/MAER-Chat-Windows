# Rapport de validation MAER Chat Windows 1.3.0

Date de validation : 27 août 2026.

## Décision

La version 1.3.0 est une **candidate validée** publiée sous le tag public
`v1.3.0-rc.1`. Elle n’a pas été installée sur le profil utilisateur de la
machine de validation. Ce n’est pas une release de production signée :
l’installateur, l’application et l’hôte Native Messaging sont réellement
`NotSigned` selon `Get-AuthenticodeSignature`.

Les anciennes sorties homonymes 1.2.0 ont été conservées sous le suffixe
`-legacy-obsolete`, avec un marqueur explicite. La seule source de vérité de la
candidate 1.3.0 est `dist/`, référencée par
`Release/CURRENT_DIST_MANIFEST.sha256`.

## Interface et fonctions validées

- interface inspirée d’une messagerie moderne, sans ressource ni identité
  Meta, avec palette MAER et thèmes clair/sombre ;
- appels audio, vidéo et partage d’écran ouverts dans une fenêtre MAER isolée
  utilisant actuellement le service public `meet.jit.si` ;
- invitations entrantes canoniques `MAER-CALL/1` avec mode, émission,
  expiration et salon liés entre eux ; expiration revérifiée au clic ;
- UX d’appel entrant « Rejoindre » / « Refuser » et blocage des liens Jitsi non
  liés à une invitation valide ;
- l’origine complète `https://meet.jit.si` est réservée à l’IPC native de
  réunion : salon d’équipe, URL canonique brute, query, fragment inattendu et
  port explicite sont tous bloqués dans les chemins génériques renderer/main ;
- le contrat refuse CRLF, exige les dates et URL brutes canoniques, puis la
  barrière native revalide mode, salon, hash, TTL et expiration ;
- les invitations refusées ou expirées sont purgées et la rétention est bornée
  à 50 entrées avec éviction de la plus ancienne ;
- consentement Jitsi révocable et redemandé, y compris depuis l’historique ;
- coffre KDBX 4.1 local, sauvegarde chiffrée, import transactionnel et
  extensions Edge/Chrome/Firefox ;
- confirmation native du processus principal avant l’affichage d’un mot de
  passe. Après confirmation, le renderer isolé reçoit temporairement le secret
  demandé pour l’afficher pendant 15 secondes : il fait donc partie du modèle
  de confiance durant cette fenêtre ;
- déduplication des identifiants de coffre côté extension, pont Native
  Messaging authentifié et lié à l’origine Web exacte ;
- navigation clavier, focus, Escape, contrastes, notifications, arrêt des
  pistes média et restauration depuis le tray vérifiés par tests ciblés ;
- contrat interopérable documenté dans `docs/MAER_CALL_PROTOCOL_V1.md`.

Le libellé « via la conversation XMPP » décrit uniquement le transport de
l’invitation. Il ne prétend pas que la réunion Jitsi ou la conversation est
nécessairement chiffrée de bout en bout.

## Vérifications exécutées

- TypeScript : réussi ;
- Vitest : 50 fichiers réussis, 1 ignoré ; **275 tests réussis, 1 ignoré** ;
- extensions navigateur : lint de 31 scripts et 9 fichiers, **21/21 tests**,
  packaging byte-for-byte reproductible ;
- chaque ZIP d’extension contient le texte GPL complet `LICENSE` de 35 149
  octets ;
- régression visuelle : quatre baselines clair/sombre, aperçu coffre et sonde
  structurelle utilisant le vrai bundle Converse.js réussis ;
- la sonde Converse réelle n’est pas authentifiée et ne prouve pas un échange
  XMPP avec un compte réel ;
- smoke test de `dist/win-unpacked/MAER Chat.exe` : renderer, onboarding,
  plateforme de plugins, extensions, Native Messaging et WASM OMEMO réussis ;
- le mode connecté optionnel du smoke test a été ajouté, mais n’a pas été lancé
  faute de compte jetable fourni ; le mode par défaut reste hors réseau ;
- neuf fusibles Electron vérifiés ; licences embarquées vérifiées ;
- audit npm : zéro vulnérabilité connue ;
- installateur NSIS 1.3.0 construit sans être exécuté ;
- SBOM CycloneDX 1.5 et SPDX 2.3 générés ;
- aucune occurrence exacte de l’ancien domaine de contacts dans les sources,
  les audits, l’ASAR, l’installateur ou les ZIP d’extensions.

## Artefacts `dist/`

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| `MAER-Chat-Setup-1.3.0-x64.exe` | 118099181 | `9DDB1F850987C639DF4E20F4B3E93E1F39B94C4EB88B319CB3CF00E75E44E06B` |
| `MAER-Chat-Setup-1.3.0-x64.exe.blockmap` | 124918 | `5ED98C89A030959EE66A33152927E68BA1D2B778246C389E3B3104D12B03286B` |
| `latest.yml` | 355 | `B451D4151609265B365A2F4D79E5471F03B49789D18F33545A5235B0B45B5315` |
| `win-unpacked/MAER Chat.exe` | 235588096 | `BFBFE683C165C1FEFD5A1E10F1B906F72A0333CE8CABA3D56A6765BC5172F9CE` |
| `win-unpacked/resources/app.asar` | 79352921 | `D3F3359CED635F8BACB5CAC7C39BD6DEF9A98D49D0FF58D58D97ED2B18BF89FA` |
| `maer-password-vault-host.exe` | 10240 | `E1F83B444102362FF9DFE3B6AF786FED1FC2337E60F593B7F110169635A6F16C` |
| `sbom/MAER-Chat-1.3.0.cdx.json` | 552454 | `EAC3F8EFA4C9923BF9F2A0C4F74382D642DCA24A3646F6B4831738E4EBB5C43B` |
| `sbom/MAER-Chat-1.3.0.spdx.json` | 533696 | `C999558F8301018E779D009A01378D4F8F4BC701FFBCBFD34DBB6DECDABC2F01` |
| `sbom/SBOM_MANIFEST.json` | 504 | `F1CAE75CE7B8B2BFE31EA669FE507F96522A8B51F081C5BF74CE65436102B38B` |

## Extensions

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| `maer-password-vault-chromium-0.1.0.zip` | 101719 | `96EE5B0675EAF3D1412C8CB633D0DB9E706DDAF793603004D1FA7B6A344A0489` |
| `maer-password-vault-firefox-0.1.0.zip` | 101547 | `CABAD3FE4D490E8194C0CEF7DF5EC5EB8AB6E220CA9C3EE70DD04FC068371430` |

## Licence, marque et limites avant publication

Le code reste sous GPL-3.0-or-later. `TRADEMARK_NOTICE.md` précise séparément
que cette licence ne concède aucun droit sur le nom, le logo ou les éléments
graphiques MAER ; aucune cession de propriété n’est affirmée.

Limites restantes :

- obtenir un certificat de signature de code et signer/horodater les trois
  exécutables ;
- signer et publier les extensions dans les stores correspondants ;
- tester les ZIP dans de vrais profils Edge, Chrome et Firefox propres ;
- exécuter le smoke connecté avec deux comptes jetables et valider le contrat
  MAER-CALL/1 avec Android ;
- déployer et tester le serveur/NAS séparément ;
- remplacer à terme Jitsi public par une infrastructure maîtrisée si une pile
  média MAER/Jingle/TURN est exigée.
