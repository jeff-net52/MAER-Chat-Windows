# Rapport de livraison MAER Chat Windows 1.0.2

Date de validation : 26 août 2026.

## Correctif livré

La version 1.0.1 utilisait `xmpp.maer.fr` à la fois comme domaine des comptes
et comme hôte réseau. Elle transformait donc l’identifiant local `emilien` en
`emilien@xmpp.maer.fr` et refusait une adresse existante sur
`xmpp.maer.fr`.

La version 1.0.2 sépare désormais explicitement :

- le domaine des comptes existants : `xmpp.maer.fr` ;
- l’hôte public WebSocket, BOSH et association : `xmpp.maer.fr`.

Les URL réseau restent limitées à HTTPS/WSS et à l’hôte
`xmpp.maer.fr`. La correction n’assouplit ni la CSP, ni la validation TLS, ni
les protections Electron.

## Vérifications réalisées

- `npm ci` : réussi ;
- `npm run typecheck` : réussi ;
- `npm test` : 13 fichiers, 55 tests réussis ;
- `npm run build` : réussi ;
- `npm run test:e2e` sur le build : réussi ;
- `npm run dist` : réussi ;
- smoke test sur le binaire empaqueté : réussi ;
- installation silencieuse par-dessus la 1.0.1 : code retour 0 ;
- version du binaire installé : 1.0.2 ;
- smoke test sur le binaire installé : réussi.

Les contrôles réseau sans identifiants ont également obtenu :

- `101 Switching Protocols` sur `wss://xmpp.maer.fr/xmpp-websocket` ;
- sous-protocole WebSocket `xmpp` ;
- ouverture XMPP acceptée avec `from='xmpp.maer.fr'` ;
- HTTP 200 sur `https://xmpp.maer.fr/http-bind`.

## Artefact

- fichier : `Release/MAER-Chat-Setup-1.0.2-x64.exe` ;
- taille : 117473571 octets ;
- SHA-256 : `E7B6174615EBEA5DFDC6227DF155A522BC93A33D1FB900253C55483AA42CB208` ;
- Authenticode : non signé.

## Limites restantes

Le mot de passe du compte n’a pas été lu ni utilisé pendant ces contrôles.
L’authentification doit donc être confirmée par l’utilisateur dans le client
installé. Le parcours QR reste dépendant de l’extension serveur et du client
Android décrits dans `PAIRING_PROTOCOL_V1.md`.
