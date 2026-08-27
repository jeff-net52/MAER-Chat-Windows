# Mentions relatives aux composants tiers

MAER Chat pour Windows est distribué sous **GPL-3.0-or-later**. Le texte
complet de cette licence se trouve dans `LICENSE`. Cette licence ne remplace
pas les licences des composants tiers décrits ci-dessous.

## Composants principaux distribués

| Composant | Version livrée | Licence | Copyright / provenance | Texte et source |
|---|---:|---|---|---|
| Converse.js | 14.0.0 | MPL-2.0 | Copyright JC Brand 2013-2025 et contributeurs Converse.js | `THIRD_PARTY_LICENSES/converse-MPL-2.0.txt`, `THIRD_PARTY_LICENSES/CORRESPONDING_SOURCE.md` |
| libomemo.js | 2.0.2, rebundle par Converse.js 14.0.0 | GPL-3.0-only | Copyright 2015-2018 Open Whisper Systems; Copyright 2022-2026 JC Brand | `THIRD_PARTY_LICENSES/libomemo-NOTICE.txt`, texte GPL dans `LICENSE`, source épinglée dans `THIRD_PARTY_LICENSES/corresponding-sources.lock.json` |
| Electron | 43.4.1 | MIT | Copyright Electron contributors; Copyright 2013-2020 GitHub Inc. | `THIRD_PARTY_LICENSES/electron-MIT.txt` |
| Chromium et Node.js | versions embarquées par Electron 43.4.1 | licences multiples | projets Chromium, Node.js et leurs contributeurs | les fichiers Electron `LICENSE.electron.txt` et `LICENSES.chromium.html` doivent rester dans toute distribution Windows |
| @napi-rs/keyring | 1.3.0 | MIT | Copyright 2020 N-API for Rust | `THIRD_PARTY_LICENSES/keyring-MIT.txt` |
| qrcode (node-qrcode) | 1.5.4 | MIT | Copyright 2012 Ryan Day | `THIRD_PARTY_LICENSES/qrcode-MIT.txt` |
| kdbxweb | 2.1.1 | MIT | auteurs et contributeurs KeeWeb | `THIRD_PARTY_LICENSES/kdbxweb-MIT.txt` |
| hash-wasm | 4.12.0 | MIT et composants permissifs indiqués par l'amont | auteurs et contributeurs hash-wasm | `THIRD_PARTY_LICENSES/hash-wasm-MIT.txt` |
| @xmldom/xmldom | 0.8.15 | MIT | contributeurs xmldom | `THIRD_PARTY_LICENSES/xmldom-MIT.txt` |
| fflate | 0.7.5 | MIT | Copyright 2020 Arjun Barrett | `THIRD_PARTY_LICENSES/fflate-MIT.txt` |

L'inventaire versionné de toutes les dépendances runtime Windows x64 résolues
par `package-lock.json` se trouve dans
`THIRD_PARTY_LICENSES/runtime-components.md`. Il inclut les dépendances
transitives de Converse.js, qrcode et du coffre, y compris les composants sous
Apache-2.0, BSD-3-Clause, ISC et doubles licences. Les avis et textes originaux
contenus dans les paquets npm ne doivent pas être supprimés par le processus de
packaging.

## Converse.js et libomemo.js

Converse.js est chargé depuis les fichiers locaux de l'application et thémé par
les styles MAER. Aucun fichier Converse.js ou libomemo.js n'est chargé depuis
un CDN.

OMEMO charge dynamiquement le rebundle GPLv3 `libomemo.esm.min.js` et le module
`curve25519_compiled.wasm` distribués par Converse.js 14.0.0. Le changelog
Converse.js identifie cette version comme libomemo.js 2.0.2. La provenance est
verrouillée sans lien flottant :

- paquet npm Converse.js 14.0.0, URL, intégrité SRI et commit npm épinglés ;
- paquet npm libomemo.js 2.0.2, URL, intégrité SRI et commit npm épinglés ;
- archive de source complète libomemo produite depuis le commit exact, avec
  sources TypeScript, sources natives, scripts de compilation et lockfile ;
- empreintes SHA-256 des deux fichiers libomemo effectivement contenus dans le
  paquet Converse.js.

La procédure reproductible et les obligations de publication sont décrites
dans `THIRD_PARTY_LICENSES/CORRESPONDING_SOURCE.md`. Une release binaire
publique doit publier les archives produites par
`scripts/prepare-corresponding-sources.mjs` au même endroit que l'installateur.
Un simple lien vers une branche Git ne satisfait pas cette politique.

## Electron, Chromium et notices runtime

Electron embarque Chromium et Node.js. Electron-builder fournit normalement
`LICENSE.electron.txt` et `LICENSES.chromium.html` à côté de l'exécutable. La
release doit vérifier leur présence après packaging ; ils ne doivent pas être
remplacés par le seul texte MIT d'Electron.

## Service de visioconference

Le client ouvre actuellement des liens HTTPS vers le service public Jitsi Meet
dans le navigateur système. Aucun code Jitsi n'est embarqué dans l'application
Electron ; Jitsi n'apparaît donc pas dans l'inventaire des binaires distribués.
L'interface informe l'utilisateur que la réunion utilise ce service tiers.

## Marques et éléments graphiques

Le projet n'embarque aucun élément graphique WhatsApp ou Meta. Les droits de
copyright et de redistribution du logo MAER utilisé par les clients restent à
documenter avant toute publication binaire. La GPL du code ne constitue pas
une autorisation d'utiliser une marque ou un logo.
