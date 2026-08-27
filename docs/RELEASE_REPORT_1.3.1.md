# Rapport de validation MAER Chat Windows 1.3.1

Date de validation : 27 août 2026.

## Décision

La version 1.3.1 est une **candidate locale validée**. Elle corrige le blocage
de l’onboarding après une authentification XMPP en échec et remplace l’origine
générique `file://` du renderer Electron par l’origine privilégiée dédiée
`maer-chat://app`.

Cette candidate reste non signée (`NotSigned`) et ne constitue donc pas une
release publique de production. Les autres conditions de publication restent
décrites dans `RELEASE_POLICY.md`.

## Correctifs validés

- le renderer packagé est servi par un protocole Electron standard, sécurisé,
  limité à l’hôte `app` et à des fichiers situés sous le bundle renderer ;
- les traversées de chemin, autorités, ports et schémas inattendus sont
  refusés avant toute lecture de fichier ;
- l’IPC, les permissions média/notifications et la navigation restent liés à
  l’URL exacte `maer-chat://app/` ;
- un échec ou un délai de connexion masque l’ancien DOM Converse, invalide les
  callbacks tardifs et rend immédiatement le formulaire accessible ;
- une seconde tentative peut réussir dans le même processus, sans redémarrage
  de MAER Chat ;
- l’arrêt d’une session à demi ouverte est borné et ne bloque pas le renderer ;
- la saisie courte `edouard` est normalisée en
  `edouard@xmpp.maer.fr` avant l’authentification.

Le serveur XMPP doit autoriser exactement l’Origin WebSocket
`maer-chat://app`. Au moment de la construction de cette candidate, le serveur
de production non encore mis à niveau renvoie encore 403 pour cet Origin ; le
smoke connecté doit donc être rejoué après installation du paquet serveur qui
porte cette autorisation.

## Vérifications exécutées

- TypeScript : réussi ;
- Vitest mono-worker : **51 fichiers réussis, 1 ignoré ; 291 tests réussis,
  1 ignoré** ;
- smoke Electron hors réseau depuis les sources : réussi ;
- smoke du binaire packagé : origine, onboarding, plugins, extensions,
  Native Messaging et WASM OMEMO réussis ;
- smoke de panne réseau du binaire packagé : message d’erreur, formulaire au
  premier plan et DOM Converse caché réussis ;
- licences du paquet : réussies ;
- neuf fusibles Electron : vérifiés ;
- SBOM CycloneDX 1.5 et SPDX 2.3 : générés ;
- signature Authenticode : absente sur l’installateur, l’application et l’hôte
  Native Messaging, conformément à l’état déclaré de cette candidate.

## Artefacts `dist/`

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| `MAER-Chat-Setup-1.3.1-x64.exe` | 118100837 | `44E0C8AD8E95FFE43C0081E4C45A7623BA3F87ED0C0E79EE8F3FF8F2E9E9DA3D` |
| `MAER-Chat-Setup-1.3.1-x64.exe.blockmap` | 125146 | `6426F1BFCA963A265346D9130ABADD5FB38C9FC344BAF2855DBF8E88D3B55AEF` |
| `latest.yml` | 355 | `0FB1755414F4F979526AB8173BB9884997514CADF181A7BCE59A4ABB4B6EB1A8` |
| `win-unpacked/MAER Chat.exe` | 235588096 | `99A65CADE09C5CBAD6F39C715D99F8CA8A9EE89B146134FB840FDB737DC7921D` |
| `win-unpacked/resources/app.asar` | 79356449 | `BC84CD45871C33A71653F203A2D2E085841529757DA05C20CEF90A498CE2C16C` |
| `maer-password-vault-host.exe` | 10240 | `D3DCF1612C5A3C36024C9787018D2A6C96111259F7662B57181D435CC12A8793` |
| `sbom/MAER-Chat-1.3.1.cdx.json` | 552454 | `21EF8766D599A98BB285C7F2C776077E74DD6D4BEFA0B81FADD4457E41E90F36` |
| `sbom/MAER-Chat-1.3.1.spdx.json` | 533696 | `606892CD571FB0C524F881350C2599146768CE2124CD6A6329A3EB863C843F8E` |
| `sbom/SBOM_MANIFEST.json` | 504 | `917EDD2DF7CB57288138422DC3EAAC02B951F47708450721B2CCADB7E134DA1E` |
