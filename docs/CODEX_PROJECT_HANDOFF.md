# Prompt de reprise pour Codex

Copier le bloc ci-dessous dans Codex après avoir extrait l’archive complète.

---

Tu reprends le projet **MAER Chat**. Travaille de façon autonome, vérifie réellement chaque résultat et ne prétends jamais qu’une fonction réseau marche sans test réel.

## Arborescence

- `MAER Chat Windows/` : client Electron/TypeScript Windows, dépôt Git principal.
- `Android et server/MAER Chat/MaerChat/` : fork Android de Conversations, package `fr.maer.chat`.
- `Android et server/MAER Chat/MAER-XMPP-Server/` : fork serveur ejabberd 26.07.
- `Capture Whatsapp/` : références visuelles uniquement. Ne copie aucun logo, code ou ressource WhatsApp/Meta.

Commence par lire, dans cet ordre :

1. `MAER Chat Windows/README.md`
2. `MAER Chat Windows/docs/RELEASE_REPORT_1.0.0.md`
3. `MAER Chat Windows/docs/PAIRING_PROTOCOL_V1.md`
4. `MAER Chat Windows/docs/SERVER_DEPLOYMENT.md`
5. `MAER Chat Windows/docs/CODEX_ANDROID_LINKED_DEVICES.md`
6. les `README`, instructions de build et fichiers de configuration des dépôts Android/ejabberd.

## État vérifié

Le client Windows 1.0.0 est construit. Le dernier commit attendu est `8fada1e` ou un descendant propre. Les vérifications déjà obtenues sont :

- TypeScript propre ;
- 12 fichiers Vitest, 52 tests réussis ;
- smoke test Electron réussi ;
- stockage temporaire Windows Credential Manager testé puis nettoyé ;
- installateur NSIS réellement installé, lancé, testé et désinstallé ;
- installateur final : `MAER Chat Windows/Release/MAER-Chat-Setup-1.0.0-x64.exe` ;
- SHA-256 attendu : `b9450d40abfe5ace1292f626455ab932b372467caeeedc32c8266fa5d8296b27` ;
- l’installateur n’est pas signé Authenticode.

Les endpoints publics suivants renvoyaient HTTP 404 lors du dernier contrôle :

- `https://contacts.chaumont.me/xmpp-websocket`
- `https://contacts.chaumont.me/http-bind`
- `https://contacts.chaumont.me/maer-pairing/v1`

Ne considère donc pas la connexion XMPP ou le QR comme validés tant que les endpoints ne sont pas déployés et testés.

## Mission restante, par ordre

### 1. Préserver et revalider le client Windows

Dans `MAER Chat Windows/` :

```bash
npm install
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Ne lance pas Node/npm directement depuis un chemin UNC : copie le dépôt localement, construis localement, puis resynchronise uniquement sources et livrables. N’ajoute jamais `node_modules`, `out` ou `dist/win-unpacked` à l’archive/source.

Conserve :

- `contextIsolation`, sandbox, CSP et blocage de navigation Electron ;
- stockage des secrets par `@napi-rs/keyring` ;
- absence de secret dans IndexedDB, logs et QR ;
- Converse.js 14 et sa compatibilité OMEMO legacy Conversations ;
- thème et ressources MAER uniquement.

### 2. Implémenter l’extension ejabberd d’association

Dans le dépôt serveur, crée une branche dédiée et implémente `mod_maer_pairing` conformément à `PAIRING_PROTOCOL_V1.md` :

- HTTP : création, poll, annulation et OPTIONS sous `/maer-pairing/v1` ;
- clé Ed25519 SPKI DER strictement validée ;
- signatures Ed25519, dérive d’horloge maximale 30 s ;
- sessions ETS de 5 minutes, limites par IP/globales, réponses JSON `no-store` ;
- IQ authentifiées `urn:maer:pairing:1` sur `ejabberd_sm` pour approve/list/revoke ;
- émission OAuth limitée à `[<<"sasl_auth">>]` ;
- appareils persistants en Mnesia ;
- révocation réelle du jeton et fermeture de session si possible ;
- aucun jeton dans une IQ ou un log.

Inspecte les APIs exactes de ce fork (`ejabberd_oauth`, `gen_mod`, `gen_iq_handler`, `xmpp`, `ejabberd_mnesia`) au lieu de deviner. Écris les EUnit avant le code. Compile et teste dans le vrai dépôt ejabberd. Si le toolchain manque, crée un environnement reproductible Docker/WSL et donne les sorties réelles. Ne déploie pas en production sans accès explicite et procédure de rollback.

### 3. Adapter le client Android

Suis exactement `CODEX_ANDROID_LINKED_DEVICES.md`. Codex est autorisé à modifier le client Android pour cette mission, mais doit :

- créer une branche séparée ;
- réutiliser `ScanQrCodeActivity` et `ScanQrCode` ;
- ajouter Paramètres > Appareils liés ;
- approuver exclusivement par IQ XMPP authentifiée ;
- lister et révoquer les appareils ;
- ne jamais mettre mot de passe, OAuth ou nonce Windows dans le QR/logs/stockage ;
- écrire tests unitaires/Robolectric avant le code ;
- construire réellement l’APK du flavor MAER.

Ne modifie pas OMEMO, l’identifiant de package, le fonctionnement des QR XMPP existants ni les comptes des utilisateurs.

### 4. Déploiement et tests réels

Demande uniquement ce qui est indispensable :

- accès sécurisé au serveur de test/production ;
- deux JID de test ;
- ne demande jamais de mot de passe dans le chat.

Après déploiement :

1. vérifier host-meta, WebSocket, BOSH et pairing avec réponses attendues ;
2. connecter le client Windows par identifiant/mot de passe ;
3. tester messages privés, groupe, MAM, média, notification, accusés et OMEMO dans les deux sens avec Android ;
4. tester QR complet, comparaison du code, reconnexion OAuth, liste et révocation ;
5. tester signatures/nonce/timestamp/code faux, expiration et double approbation ;
6. confirmer qu’aucun secret n’apparaît dans QR, logs, fichiers ou rapports de crash.

### 5. Nouvelle livraison

Après réussite réelle :

- incrémenter la version si le binaire change ;
- exécuter tous les tests Windows, Android et serveur ;
- construire l’installateur x64 ;
- installer/lancer/smoke-tester/désinstaller le binaire final ;
- calculer son SHA-256 avec un outil ;
- mettre à jour le rapport de livraison ;
- synchroniser sur le NAS et vérifier les empreintes ;
- conserver un Git propre avec commits ciblés.

## Règles de conduite

- TDD obligatoire pour toute logique ou correction.
- Valeur inconnue : ne rien inventer.
- Ne contourne pas TLS, la validation de certificat, la CSP ou les contrôles d’authentification.
- Ne désactive pas un test/lint pour rendre le build vert.
- Ne modifie pas les captures de référence.
- Ne fournis pas de faux résultat réseau.
- En cas de blocage d’accès ou d’identifiants, arrête-toi avec un diagnostic précis et la seule demande nécessaire.
- À la fin, donne : fichiers modifiés, commits, commandes et sorties de tests, artefacts, empreintes et limites restantes.

Commence maintenant par auditer les trois dépôts et vérifier l’état Git/build réel avant toute modification.

---
