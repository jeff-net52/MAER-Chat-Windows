# Rapport de livraison — MAER Chat Windows 1.0.1

Date de construction : 26 août 2026.

## Correctif livré

- domaine XMPP canonique : `xmpp.maer.fr` ;
- WebSocket : `wss://xmpp.maer.fr/xmpp-websocket` ;
- BOSH : `https://xmpp.maer.fr/http-bind` ;
- association : `https://xmpp.maer.fr/maer-pairing/v1` ;
- suffixe de connexion, validation des JID, Gestionnaire d’identifiants,
  génération/polling QR côté Windows, tests et documentation alignés ;
- CSP du renderer limitée à `xmpp.maer.fr` et à ses sous-domaines ;
- anciens comptes `@contacts.chaumont.me` masqués dans la liste sans supprimer
  leurs secrets du Gestionnaire d’identifiants Windows.

## Vérifications réussies

- `npm ci` : 457 paquets installés depuis `package-lock.json` ;
- `npm run typecheck` : réussi ;
- Vitest : **13 fichiers, 54 tests, 54 réussis** ;
- build Electron/Vite : main, preload et renderer réussis ;
- smoke test Electron depuis les sources : réussi ;
- smoke test de `dist/win-unpacked/MAER Chat.exe` : réussi ;
- inspection de `app.asar` : 0 ancien domaine, 0 ancienne route ;
- installateur NSIS installé silencieusement dans un dossier temporaire ;
- smoke test de l’exécutable réellement installé : réussi ;
- désinstallation silencieuse : dossier et entrée de registre supprimés.

## Artefact

`Release/MAER-Chat-Setup-1.0.1-x64.exe`

- taille : 117 472 843 octets ;
- SHA-256 : `DCE09D7C7137FE5138E82473A4A151D21CF4D95CF2C70A96E11465A172CE6354` ;
- blockmap : 123 590 octets ;
- architecture : Windows x64 ;
- Authenticode : **NotSigned**.

## Limites réseau restantes

Les sondes HTTPS du 26 août 2026 ont échoué pendant la négociation TLS avant
toute réponse HTTP sur host-meta, WebSocket, BOSH et les deux chemins
d’association sondés. Le serveur présente `CN=chaumont.me`, qui ne couvre pas
`xmpp.maer.fr` ; aucun contournement de certificat n’a été utilisé.

La connexion XMPP, la messagerie, OMEMO et le scénario QR complet ne sont donc
pas déclarés validés. Ils nécessitent un certificat TLS accepté, les endpoints
serveur déployés et des comptes de test dédiés.

En outre, l’association QR n’est pas encore implémentée dans le client Android
ni dans le serveur ejabberd. La présence du parcours et de ses tests unitaires
côté Windows ne signifie donc pas que cette fonction est livrée de bout en
bout.

## Historique

La version 1.0.0 et son rapport sont conservés pour traçabilité sous
`Release/archive/1.0.0/`. Elle ne doit plus être distribuée, car son binaire
cible l’ancien domaine.
