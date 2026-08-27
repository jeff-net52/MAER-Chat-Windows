# Rapport de livraison MAER Chat Windows 1.0.3

Date de validation : 26 août 2026.

## Correctifs livrés

La version 1.0.2 appelait `converse.api.listen` sur l'export public de
Converse.js 14. Cet export ne contient pas l'API privée et provoquait, au clic
sur « Se connecter », l'erreur :

`Cannot read properties of undefined (reading 'listen')`

La version 1.0.3 enregistre un plugin Converse interne avant la connexion. Ce
plugin reçoit l'API de connexion prévue par Converse.js et écoute les
événements `connected` et `disconnected`. Les écouteurs obsolètes sont ignorés
lors d'une nouvelle tentative.

Deux autres problèmes révélés par le test réseau ont été corrigés :

- le mode `singleton` de Converse est désactivé pour ce client multi-conversation ;
- les ressources françaises chargées dynamiquement par Converse et Day.js sont
  désormais copiées dans le paquet de production.

Le mode de test de bout en bout utilise aussi un profil Electron temporaire
isolé. Le comportement mono-instance de l'application normale reste inchangé.

## Vérifications réalisées

- `npm run typecheck` : réussi ;
- `npm test` : 14 fichiers, 56 tests réussis ;
- `npm run build` : réussi ;
- `npm run dist` : réussi ;
- smoke test sur le binaire empaqueté : réussi ;
- tentative réseau sur le binaire empaqueté avec un compte factice : erreur
  d'authentification/connexion gérée par l'interface, sans erreur JavaScript ;
- installation silencieuse par-dessus la 1.0.2 : code retour 0 ;
- version du binaire installé : 1.0.3 ;
- smoke test sur le binaire installé : réussi ;
- tentative réseau sur le binaire installé avec un compte factice : réussie au
  sens du test négatif attendu, sans réapparition de l'erreur `listen`.

La tentative réseau emploie volontairement le compte inexistant
`maer-client-smoke-nonexistent@xmpp.maer.fr` et un faux mot de passe.
Elle valide l'initialisation de Converse, le chargement des ressources
françaises, l'accès au transport public et le traitement propre d'un refus.

## Artefact

- fichier : `Release/MAER-Chat-Setup-1.0.3-x64.exe` ;
- taille : 117490889 octets ;
- SHA-256 : `2A51F55C1932C9377F64CC92D997EFF94D5F49BD94B966EB93C7E09E7F00720D` ;
- Authenticode : non signé.

## Limites restantes

Le mot de passe du compte réel n'a pas été lu ni utilisé pendant ces contrôles.
L'authentification du compte utilisateur doit donc encore être confirmée dans
le client installé. Le parcours QR reste dépendant de l'extension serveur et
du client Android décrits dans `PAIRING_PROTOCOL_V1.md`.
