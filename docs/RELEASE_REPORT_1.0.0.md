# Rapport de livraison — MAER Chat Windows 1.0.0

> Rapport historique. Cette version cible l’ancien service et est supersédée
> par la version 1.0.1 documentée dans `RELEASE_REPORT_1.0.1.md`.
> Son installateur est archivé sous `Release/archive/1.0.0/` pour éviter toute
> distribution accidentelle.

Date de construction : 25 août 2026.

## Vérifications réussies

- `npm run typecheck` : réussi.
- Vitest : **12 fichiers, 52 tests, 52 réussis**.
- Build Electron/Vite : réussi pour main, preload CommonJS sandboxé et renderer.
- Smoke test Electron depuis les sources : réussi.
- Smoke test de `dist/win-unpacked/MAER Chat.exe` : réussi.
- Installation silencieuse de l’installateur NSIS dans un dossier temporaire : réussie.
- Smoke test de l’exécutable réellement installé : réussi.
- Désinstallation silencieuse et suppression complète du dossier de test : réussies.
- Intégration réelle au Gestionnaire d’identifiants Windows : écriture, lecture et suppression d’un secret temporaire réussies.

Le smoke test vérifie le chargement du wordmark MAER, la navigation accueil → choix → identifiants, les attributs d’accessibilité/autocomplétion, l’affichage avancé du JID et le bouton de visibilité du mot de passe.

## Artefact

`MAER-Chat-Setup-1.0.0-x64.exe`

- Taille : 117 472 959 octets.
- SHA-256 : `b9450d40abfe5ace1292f626455ab932b372467caeeedc32c8266fa5d8296b27`
- Architecture : Windows x64.
- Installation : NSIS assisté, par utilisateur, choix du dossier et raccourci bureau.
- Authenticode : **NotSigned**. Aucun certificat de signature n’a été fourni ; Windows SmartScreen peut donc afficher un avertissement.

## Limites bloquant les tests XMPP réels

Les sondes publiques ont retourné HTTP 404 sur :

- `https://contacts.chaumont.me/xmpp-websocket`
- `https://contacts.chaumont.me/http-bind`
- `https://contacts.chaumont.me/maer-pairing/v1`

Le port 5443 n’était pas joignable publiquement. Le client est construit, mais la connexion réelle et le QR ne peuvent pas être déclarés fonctionnels avant déploiement des endpoints et essais avec les deux comptes dédiés.

Voir :

- `docs/SERVER_DEPLOYMENT.md`
- `docs/PAIRING_PROTOCOL_V1.md`
- `docs/CODEX_ANDROID_LINKED_DEVICES.md`

## Intégrité de portée

Le client Android du NAS n’a pas été modifié. Les éléments graphiques utilisés sont les ressources MAER du fork Android. Aucun logo, code ou ressource WhatsApp/Meta n’est distribué.
