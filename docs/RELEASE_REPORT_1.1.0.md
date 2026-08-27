# Rapport de livraison MAER Chat Windows 1.1.0

Date de validation : 26 août 2026.

## Interface livrée

La version 1.1.0 remplace la présentation Converse générique par une interface
de bureau inspirée de WhatsApp, sans reprendre son identité verte : toutes les
surfaces et actions utilisent la palette bleue/cyan MAER.

- rail fixe pour Discussions, Appels, Paramètres et compte ;
- colonne « Discussions » avec recherche, filtre des non-lus et ajout de
  contact ;
- liste et zone de conversation redimensionnables, bulles, composeur et en-tête
  rapprochés de l’ergonomie WhatsApp Desktop ;
- thèmes système, clair et sombre ;
- paramètres de notifications, sons, test caméra/microphone et déconnexion ;
- mise en page responsive et focus clavier visible.

Le mode Converse incorrect `fullscreened` a été remplacé par le mode officiel
`fullscreen`. Cette correction permet aux règles de disposition plein écran de
s’appliquer réellement.

## Audio, vidéo et partage d’écran

Chaque conversation dispose maintenant de trois actions : téléphone, caméra et
écran. MAER Chat génère un nom de réunion aléatoire ne contenant ni JID ni nom
de contact, envoie le lien dans la conversation, puis l’ouvre dans le navigateur
système. Pour le partage d’écran, l’utilisateur choisit ensuite « Partager
l’écran » dans la réunion.

Cette première livraison utilise le service public `meet.jit.si`. Un
consentement explicite est demandé à la première utilisation et précise que les
flux audio/vidéo ne transitent pas par le serveur XMPP MAER. La réunion n’est
pas intégrée dans une iframe : la CSP Electron reste limitée aux ressources
MAER. Il ne s’agit pas encore d’un appel Jingle natif avec sonnerie XMPP.

## Vérifications réalisées

- `npm run typecheck` : réussi ;
- `npm test` : 17 fichiers, 66 tests réussis ;
- `npm run build` : réussi ;
- `npm run dist` : réussi ;
- zéro occurrence du domaine obsolète dans les sources actives ;
- zéro occurrence du domaine obsolète dans `out`, dans
  `dist/win-unpacked/resources/app.asar` et dans le nouvel installeur 1.1.0 ;
- présence de `xmpp.maer.fr` vérifiée dans les bundles construits et dans
  `app.asar` ;
- version produit et version fichier de l’installeur : 1.1.0 ;
- smoke test normal sur le binaire empaqueté : réussi ;
- smoke test réseau négatif sur le binaire empaqueté : réussi.

Aucune installation n'a été lancée pendant la revalidation suivant le
réalignement du domaine. Les contrôles ci-dessus portent sur le binaire
`dist/win-unpacked/MAER Chat.exe` et sur l'installeur NSIS nouvellement généré.

Le smoke test réseau utilise uniquement le compte inexistant
`maer-client-smoke-nonexistent@xmpp.maer.fr` et un faux mot de passe.
Les images externes du pied de page Converse restent volontairement bloquées
par la CSP et ne sont pas considérées comme une erreur applicative.

## Artefact

- fichier : `Release/MAER-Chat-Setup-1.1.0-x64.exe` ;
- taille : 117501274 octets ;
- SHA-256 : `8B25EA66E148812AE6E29F25A3E03F95C4E37EAE2C60445FD0676311256D178F` ;
- Authenticode : non signé.

Le blockmap associé `Release/MAER-Chat-Setup-1.1.0-x64.exe.blockmap` mesure
124231 octets et porte le SHA-256
`1853B34226DF9462C88082B94D9B07E470BD2DEDAF0DE20D722040557CE5D482`.

Les copies 1.1.0 présentes dans `dist` et `Release` ont une taille et un hash
strictement identiques, pour l'installeur comme pour le blockmap.

## Audit des sorties et des archives

- `out` : reconstruit, ancien domaine absent, nouveau domaine présent ;
- `dist/win-unpacked` : reconstruit, ancien domaine absent ;
- `dist/MAER-Chat-Setup-1.1.0-x64.exe` : ancien domaine absent ;
- `Release/MAER-Chat-Setup-1.1.0-x64.exe` : copie conforme de `dist`, ancien
  domaine absent.

Les installateurs historiques suivants embarquaient encore le domaine
obsolète dans leur `resources/app.asar` et ne devaient donc plus être
redistribués pour la configuration actuelle :

- `Release/archive/1.0.0/MAER-Chat-Setup-1.0.0-x64.exe` ;
- `dist/MAER-Chat-Setup-1.0.2-x64.exe` ;
- `Release/MAER-Chat-Setup-1.0.2-x64.exe` ;
- `dist/MAER-Chat-Setup-1.0.3-x64.exe` ;
- `Release/MAER-Chat-Setup-1.0.3-x64.exe`.

Ces installateurs historiques ainsi que leurs blockmaps ont été retirés des
répertoires de livraison et placés dans la Corbeille Windows. L'installeur
1.0.1 a également été audité et ne contient pas cette chaîne.

## Limites restantes

- le fournisseur de réunion est public et provisoire ; un Jitsi privé ou des
  appels WebRTC/Jingle adossés au TURN MAER demanderont une infrastructure et
  une implémentation supplémentaires ;
- l’association QR dépend du module serveur `mod_maer_pairing` et ne doit être
  annoncée comme opérationnelle qu’après validation HTTP, IQ XMPP, OAuth et
  révocation de bout en bout.
