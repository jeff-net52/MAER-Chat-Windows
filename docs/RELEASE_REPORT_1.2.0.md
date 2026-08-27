# Rapport de validation MAER Chat Windows 1.2.0

Date de validation : 27 août 2026.

## Décision

La version 1.2.0 est une **candidate locale validée**, destinée aux essais sur
le poste de développement. Elle n'est pas une release publique : les trois
exécutables contrôlés sont non signés Authenticode et les droits de
redistribution du logo MAER doivent encore être confirmés. La politique
complète est dans `RELEASE_POLICY.md`.

L'installateur final a été construit depuis le commit source `6d3dd24` de la
branche `feature/plugin-platform`. Les documents de livraison modifiés après la
construction ne changent aucun fichier inclus dans l'application.

## Interface et fonctions

- interface de bureau inspirée de WhatsApp, sans ressource ni identité Meta,
  avec palette bleue/cyan MAER ;
- rail Discussions/Appels/Paramètres, recherche, filtres, liste des
  conversations et zone de discussion redimensionnable ;
- thèmes clair et sombre, paramètres audio/vidéo, notifications et sons ;
- appels audio, vidéo et partage d'écran par réunion publique `meet.jit.si`,
  ouverte dans le navigateur système après consentement ;
- coffre KDBX 4.1 local inspiré de Firefox, clé protégée par le Gestionnaire
  d'identifiants Windows et extensions Edge/Chrome/Firefox embarquées avec un
  guide accessible directement depuis le panneau du coffre ;
- pont Native Messaging authentifié, limité à l'origine Web exacte et sans
  secret exposé au renderer ;
- chiffrement OMEMO et moteur XMPP Converse.js 14 empaquetés localement ;
- association QR implémentée dans les sources Windows, Android et serveur,
  mais non déclarée opérationnelle avant le déploiement NAS et l'essai réel de
  bout en bout.

## Vérifications exécutées

- TypeScript : réussi ;
- tests unitaires : 46 fichiers réussis, 1 ignoré ; 235 tests réussis,
  1 ignoré ;
- build Electron et installateur NSIS x64 : réussis ;
- smoke test de l'exécutable réellement empaqueté : renderer, plateforme de
  plugins, ressources d'extensions navigateur, Native Messaging, parcours
  d'identification et WASM OMEMO réussis ;
- régression visuelle : quatre baselines clair/sombre en 1366 et 920 pixels,
  zéro pixel modifié ;
- extensions navigateur : lint, 20 tests, packaging reproductible et contrôle
  des archives réussis ;
- test Native Messaging réel sous Microsoft Edge 151 dans un profil isolé :
  extension chargée et réponse authentifiée du coffre obtenue ;
- licences embarquées et source correspondante : contrôlées ;
- SBOM CycloneDX 1.5 et SPDX 2.3 : générés ;
- audit npm complet : zéro vulnérabilité connue ;
- neuf fusibles Electron : tous explicitement configurés et vérifiés dans
  `MAER Chat.exe` ;
- recherche dans les sources actives et les sorties : aucune référence au
  domaine retiré.

Le fusible `GrantFileProtocolExtraPrivileges` reste activé parce que le
renderer charge le WASM OMEMO audité depuis les ressources `file://` incluses.
Toutes les navigations distantes et les permissions non prévues restent
fermées par défaut.

## Artefacts locaux

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| `MAER-Chat-Setup-1.2.0-x64.exe` | 118066878 | `9A5470EE9B55C2DC22775BD350A9F77FC62B0590E50107607623436D1355DF8B` |
| `MAER-Chat-Setup-1.2.0-x64.exe.blockmap` | 125085 | `EA89766CAC7FC85CF06B6AD87C518CD9A63315949BA6914AFBA41DBA3528F9A2` |
| `win-unpacked/MAER Chat.exe` | 235588096 | `DF3C0B292C16DC8C34DCD18844FE74D80002854A4F8E9831C13747BB5CA06B57` |
| `win-unpacked/resources/app.asar` | 79295613 | `A306FA512DBA427324463CC0F834509BE7383CAECA54C27527F35E65F5F15424` |
| `maer-password-vault-host.exe` | 10240 | `91C5C254EF7A2BC28D3B11EEB0B2822D0B16E04393289348A5EA42CADCAE8BC1` |

Authenticode : **NotSigned** pour l'installateur, `MAER Chat.exe` et l'hôte
Native Messaging. Windows SmartScreen peut donc demander une confirmation.

## SBOM, extensions et source correspondante

| Fichier | SHA-256 |
| --- | --- |
| `MAER-Chat-1.2.0.cdx.json` | `7F1471398D5B9A144CEB2B3D77E58FA9CDB048D2F78A40F6C92D783593B84278` |
| `MAER-Chat-1.2.0.spdx.json` | `7524A389F52887890F1895E64D93F75C44D9861DD822073AE2E4796138878E5F` |
| extension Chromium 0.1.0 | `6E1E597168B5236DADE28875ED020C12907993C77BD847272807CC40AE288018` |
| extension Firefox 0.1.0 | `233F6A3D9BA4DEE3ACDDAE02D9FADA2FC28D659B73803B7F5732A5EC7888E371` |
| `converse.js-14.0.0.tgz` | `634F31FA0F7B0E47F1ABC60D870FF6805C737577399920EBE92DA4C7E5BCAFF0` |
| source libomemo au commit `31b51c5d83d6` | `BEEE3D1BBB1FE59043D10A8EB6EB4C83B5AC330353097B63B2DA01026ECCB318` |
| `libomemo.js-2.0.2.tgz` | `4838F06C90D2E611949FABF3EDD45D2905BDDBD657D36B5A8B9F150A09F6C31B` |

## Limites avant publication

- obtenir un certificat de signature de code et signer/horodater les trois
  exécutables ;
- confirmer la propriété et les droits de redistribution du logo MAER ;
- installer et tester les extensions dans de vrais profils Edge, Chrome et
  Firefox sur une machine propre ;
- déployer MAER XMPP Server sur le NAS puis valider connexion, messages, OMEMO,
  médias et association/révocation QR avec des comptes de test ;
- choisir à terme entre le service Jitsi public actuel et une infrastructure
  d'appel MAER intégrée avec TURN/Jingle.
