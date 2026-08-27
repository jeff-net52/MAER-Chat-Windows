# Audit interactif exhaustif de MAER Chat Windows 1.2.0

Date : **27 août 2026**
Fenêtre principale d'essai : **05:10–05:27 CEST**
Cible installée : `C:\Users\Emili\AppData\Local\Programs\MAER Chat\MAER Chat.exe`
Mode : lecture et interaction avec des profils temporaires ; aucun compte ni secret réel n'a été lu.

## Verdict

Le binaire réellement installé est bien MAER Chat **1.2.0** et correspond octet
pour octet au candidat validé dans `dist/win-unpacked`. Il démarre, le parcours
d'identification ne produit plus l'ancienne exception JavaScript `reading
'listen'`, le coffre KDBX et le Gestionnaire d'identifiants Windows fonctionnent
sur un cycle réel isolé, et la caméra ainsi que le microphone physiques ont été
ouverts puis arrêtés correctement. L'interface WhatsApp/MAER n'a pas régressé :
les quatre références visuelles restent à **0 pixel modifié**.

La suite complète n'est toutefois **pas validable de bout en bout** contre le
serveur actuellement exposé. Le pairing renvoie 404 et l'inscription de deux
comptes jetables a été refusée par la politique du serveur. Sans deux comptes
administratifs temporaires, il est impossible de conclure honnêtement sur les
messages authentifiés, la présence, les contacts réels, les pièces jointes,
OMEMO, MAM et l'envoi des liens d'appel depuis une vraie conversation.

Décision :

- **GO** pour la stabilité visuelle, l'onboarding hors pairing, le coffre local,
  les ressources d'extension, les thèmes, les réglages et l'accès matériel ;
- **NO-GO** pour déclarer la suite unifiée terminée avant la bascule serveur et
  un nouvel essai avec deux comptes jetables administratifs ;
- **NO-GO** pour une distribution Windows publique tant que les exécutables ne
  sont pas signés Authenticode.

## Échelle

| Niveau | Sens |
| --- | --- |
| P0 | perte de données, compromission ou panne générale immédiate |
| P1 | fonction essentielle bloquée ou exigence majeure non satisfaite |
| P2 | défaut significatif de fonctionnement, accessibilité ou sécurité |
| P3 | qualité, cohérence ou ergonomie à améliorer |

## Problèmes constatés

### P0 — aucun

Aucune fuite de secret, corruption de coffre, fermeture brutale, navigation
distante non autorisée ou erreur renderer fatale n'a été observée.

### P1-01 — connexion complète et pairing bloqués par le serveur actuel

**Constat.** Dans l'exécutable installé :

1. `Commencer` ;
2. `Associer avec un QR code` ;
3. l'écran d'erreur apparaît avec
   `Le service d'association a répondu 404` ;
4. `Réessayer` reproduit le même résultat ;
5. `Utiliser un identifiant` retourne correctement au formulaire classique.

Le serveur actuel accepte XMPP, BOSH et WebSocket, mais n'expose pas
`/maer-pairing`. Deux inscriptions XEP-0077 à identifiants aléatoires ont été
refusées avec `Access denied by service policy`. Aucun compte n'a été créé.

**Impact.** Les états suivants restent non testés dans une vraie session :

- association et révocation QR Windows/Android ;
- compte mémorisé et reconnexion depuis le Gestionnaire d'identifiants Windows ;
- liste de contacts, ajout/suppression et présence ;
- message aller-retour, édition, réaction, suppression et historique MAM ;
- emoji, pièce jointe, HTTP Upload et téléchargement ;
- OMEMO réel entre deux appareils ;
- clic audio/vidéo/écran depuis une conversation et réception du lien par le
  second compte ;
- déconnexion réelle et refus de reconnexion après suppression du compte.

**Remédiation.** Installer le candidat MAER XMPP Server, créer deux comptes
jetables via l'administration, exécuter la matrice ci-dessus, puis supprimer les
deux comptes. Voir aussi le rapport serveur
`MAER-XMPP-Server-clean/packaging/synology/SERVER_CURRENT_AUDIT_2026-08-27.md`.

### P1-02 — appels et partage d'écran non intégrés à MAER Chat

Les trois boutons sont présents et nommés `Appel audio`, `Appel vidéo` et
`Partager l'écran`. La logique produit une URL opaque de 32 caractères,
l'envoie comme message puis ouvre le navigateur système. Le panneau `Appels`,
le consentement, l'historique et `Rejoindre` ont été testés. Une URL de salle de
test a répondu HTTP 200.

Ce n'est cependant pas une pile d'appel unifiée :

- la réunion est hébergée par le service public `meet.jit.si` ;
- aucun appel entrant, sonnerie, acceptation, refus ou état d'appel XMPP/Jingle
  n'est implémenté ;
- le partage d'écran n'est pas déclenché dans MAER Chat : l'utilisateur doit
  rejoindre Jitsi puis choisir lui-même `Partager l'écran` ;
- le mode `audio` ajoute seulement `config.startWithVideoMuted=true` et reste
  une réunion vidéo possible, pas un véritable mode audio-only ;
- aucun TURN, mot de passe de salle ou service de conférence MAER n'est contrôlé
  par le projet.

Le consentement au fournisseur public est demandé au premier usage, puis gardé
sans durée dans `localStorage`. Les paramètres ne proposent pas de le révoquer.

**Impact.** L'exigence « comme Teams » n'est satisfaite que par un MVP externe.

### P1-03 — exécutables non signés

`Get-AuthenticodeSignature` renvoie `NotSigned` pour l'application installée.
Le rapport de release donne le même verdict pour l'installateur et l'hôte Native
Messaging.

**Impact.** SmartScreen peut avertir ou bloquer l'installation ; l'identité de
l'éditeur n'est pas vérifiable par Windows.

**Remédiation.** Signer et horodater l'installateur, `MAER Chat.exe` et
`maer-password-vault-host.exe`, puis vérifier la chaîne sur une machine propre.

### P2-01 — détails techniques Electron affichés à l'utilisateur

Une adresse complète volontairement refusée affiche exactement :

```text
Error invoking remote method 'maer:prepare-password-login': Error: Saisissez uniquement votre identifiant local
```

L'erreur de pairing contient de la même façon
`Error invoking remote method 'maer:begin-pairing': Error:` avant le message
utile.

**Reproduction.** Ouvrir le formulaire, saisir `audit@forbidden.example`, un
mot de passe temporaire, puis `Se connecter`.

**Attendu.** Afficher uniquement le message français fonctionnel, sans nom de
canal IPC ni préfixe Electron.

### P2-02 — le bouton Retour du formulaire ne respecte pas son libellé

Le bouton porte le nom accessible `Revenir au choix de connexion`, mais renvoie
à `Bienvenue dans MAER Chat` au lieu de `Connecter MAER Chat`.

**Reproduction.** `Commencer` → `Utiliser un identifiant et un mot de passe` →
flèche Retour.

**Impact.** Navigation inattendue et libellé trompeur pour un lecteur d'écran.

### P2-03 — navigation clavier et état du rail incomplets

Constats reproductibles dans le shell officiel :

- après `Entrée` sur `Commencer`, le focus retombe sur `body` au lieu d'être
  placé sur le titre ou le premier choix ;
- `Échap` ne ferme ni le panneau Appels/Paramètres/Coffre ni le panneau injecté
  par l'extension ;
- le rail n'expose aucun `aria-current`, `aria-pressed` ou `aria-expanded` ;
- quand Paramètres est ouvert, le bouton `Paramètres` **et** l'avatar du compte
  reçoivent simultanément la classe visuelle active, sans équivalent accessible ;
- aucun raccourci applicatif n'est implémenté ou documenté (`Ctrl+K`, recherche,
  nouvelle discussion, fermeture de panneau, etc.). Seuls Tab, Maj+Tab, Entrée
  et Espace des contrôles HTML natifs sont disponibles.

Tous les boutons visibles examinés avaient néanmoins un texte ou un nom
accessible, et aucun identifiant DOM dupliqué n'a été trouvé dans l'onboarding.

### P2-04 — contraste insuffisant de petits textes en thème clair

La palette conserve `--maer-muted: #667781`. Le calcul WCAG donne :

- sur la bulle sortante `#dcecff` : **3,87:1** ;
- sur l'en-tête/panneau `#f0f4f7` : **4,20:1** ;
- `--maer-cyan: #0089e6` sur blanc : **3,67:1**.

Or les heures de message utilisent 10 px, certains libellés secondaires 11–12
px, et l'auteur entrant utilise le cyan à 12 px. Ces ratios sont inférieurs au
minimum AA de 4,5:1 pour du texte normal. Le contraste principal
`#0057b8`/blanc est bon à 6,87:1.

### P2-05 — validation navigateur incomplète

- **Edge 151** : extension dépaquetée réellement chargée, injection dans une
  page HTTPS, bouton `M`, panneau fermé/ouvert, recherche verrouillée,
  Générer/Enregistrer en état verrouillé, fermer, proposition
  d'enregistrement et ignorer testés. Aucun stockage local/IndexedDB créé.
- **Chrome 151** : les tests statiques, le manifeste, l'archive et
  l'enregistrement Native Messaging passent, mais le chargement automatisé dans
  un profil temporaire n'a pas activé l'extension. Le flag historique
  `--load-extension` est ignoré par Chrome de marque ; la commande CDP
  expérimentale a rendu l'identifiant attendu sans conserver l'extension.
  Une installation manuelle via `chrome://extensions` reste à tester.
- **Firefox** : non installé sur ce poste. Le manifeste et les tests passent,
  mais le chargement réel de `dist/firefox/manifest.json` n'a pas été exécuté.

Ce point est un écart de validation, pas une preuve de panne du code Chrome ou
Firefox.

### P3-01 — français sans accents dans les extensions

Les interfaces Edge/Chrome affichent notamment :

```text
Coffre verrouille
Hote MAER absent ou indisponible
Generer
Aucun secret conserve par l extension
Deverrouillez le coffre dans MAER Chat
```

Le produit principal utilise correctement les accents ; l'extension donne donc
une impression de finition inférieure.

### P3-02 — description Native Messaging en mojibake

Les trois manifestes réellement installés contiennent :

```text
Pont local sÃ©curisÃ© du coffre de mots de passe MAER Chat
```

Les chemins, noms d'hôte et origines autorisées sont corrects, donc la fonction
n'est pas bloquée. La cause probable est l'exécution par Windows PowerShell 5.1
du script UTF-8 sans BOM : le fichier source contient bien `sécurisé`, mais la
description écrite est doublement encodée.

### P3-03 — ajout de contact dépend d'un sélecteur Converse fragile

Le bouton `Ajouter un contact` délègue uniquement à
`#controlbox .add-contact`. Si cet élément Converse n'est pas présent, le client
affiche `L'ajout de contact n'est pas encore disponible.` Le fallback a été
reproduit dans le harnais ; le chemin réussi nécessite une vraie session et
reste bloqué par P1-01.

### P3-04 — les chemins d'installation des extensions restent manuels

Le guide et les boutons `Ouvrir le dossier`/`Ouvrir le guide` fonctionnent au
niveau IPC et les fichiers existent. L'utilisateur doit néanmoins activer le
mode développeur puis charger un dossier ou un manifeste à la main. Firefox
retire de plus l'extension temporaire à chaque fermeture. Ce n'est pas encore
un parcours d'installation grand public.

## Couverture fonctionnelle détaillée

### Onboarding et connexion

| Contrôle/état | Résultat | Preuve ou limite |
| --- | --- | --- |
| Logo, titre, langue française | PASS | binaire installé, image chargée |
| `Commencer` par clic et Entrée | PASS | premier élément atteint par Tab |
| Retour choix → accueil | PASS | destination correcte |
| `Associer avec un QR code` | BLOQUÉ | serveur 404, voir P1-01 |
| `Réessayer` après erreur QR | PASS | relance et réaffiche l'erreur attendue |
| `Utiliser un identifiant` après erreur | PASS | ouvre le formulaire |
| Identifiant local + suffixe fixe | PASS | `@xmpp.maer.fr`, aucune adresse avancée |
| Afficher/masquer le mot de passe | PASS | type et `aria-label` basculent |
| Case mémoriser | PASS partiel | état/cochage testés ; persistance post-auth bloquée |
| Validation identifiant interdit | PASS | refus correct, mais préfixe IPC P2-01 |
| Mauvais mot de passe/compte inexistant | PASS | smoke réseau, erreur lisible, aucune exception `listen` |
| Retour du formulaire | ÉCHEC | P2-02 |
| Compte déjà mémorisé | BLOQUÉ | aucun compte jetable authentifié disponible |
| Connexion réussie | BLOQUÉ | aucun compte jetable administré |

### Discussions et conversation

| Contrôle/état | Résultat | Preuve ou limite |
| --- | --- | --- |
| Recherche de discussion | PASS | filtre Alice/Bureau/Camille |
| Effacer la recherche | PASS | champ vidé et focus rendu |
| `Toutes` / `Non lues` | PASS | `aria-pressed` et compteur 1 |
| Ajouter un contact | PARTIEL | fallback reproduit ; vrai chemin bloqué |
| Ouvrir une conversation | VISUEL | harnais seulement |
| Message, Envoyer, Emoji, Joindre | INVENTORIÉ | contrôles visibles/nommés ; opération réelle bloquée |
| Recherche dans la conversation | INVENTORIÉ | bouton présent ; opération Converse réelle bloquée |
| Présence et compteur non lu | VISUEL | états du harnais |
| Message aller-retour, MAM, OMEMO | BLOQUÉ | P1-01 |
| Pièce jointe / HTTP Upload | BLOQUÉ | P1-01 et aucun slot authentifié |

### Appels

| Contrôle/état | Résultat | Preuve ou limite |
| --- | --- | --- |
| Boutons audio/vidéo/écran | PASS structure | trois noms accessibles, quatre baselines |
| Refus du consentement Jitsi | PASS | aucune fenêtre ouverte |
| Acceptation du consentement | PASS | URL HTTPS opaque ouverte |
| URL Jitsi réelle | PASS | HTTP 200 sur une salle de test |
| Historique local | PASS | ligne écran + date + JID |
| `Rejoindre` | PASS | réouvre exactement l'URL conservée |
| Envoi réel au contact | BLOQUÉ | aucun compte authentifié |
| Appel entrant/sonnerie/refus | ABSENT | non implémenté |
| Partage d'écran | PARTIEL | action à faire dans Jitsi, pas dans le client |

### Paramètres

| Contrôle/état | Résultat | Preuve ou limite |
| --- | --- | --- |
| Rail Paramètres | PASS | panneau ouvert/fermé |
| Avatar du compte | PASS | ouvre le même panneau et le bon JID de test |
| Système / Clair / Sombre | PASS | attribut de thème et persistance locale |
| Notifications | PASS logique | valeur persistée ; permission `granted` |
| Sons | PASS logique | valeur persistée et transmise à Converse |
| Caméra réelle | PASS | 1 piste vidéo live puis `ended` |
| Microphone réel | PASS | 1 piste audio live puis `ended` |
| Caméra + micro réels | PASS | 2 pistes live puis arrêtées |
| Refus média simulé | PASS | message français attendu |
| Licences et version | PASS | 1.2.0, 4 familles de composants |
| Déconnexion | PASS harnais | bouton désactivé immédiatement ; session réelle bloquée |
| Échap | ÉCHEC | panneau reste ouvert |

Le poste expose trois entrées audio, une entrée vidéo et trois sorties audio.
Aucune image ni donnée audio n'a été lue ou enregistrée.

### Coffre de mots de passe

Un profil temporaire et une clé Windows temporaire ont été utilisés. Le cycle a
été : sonde non destructive → initialisation → génération → ajout → liste →
recherche → modification sans changer le secret → copie → suppression →
verrouillage → déverrouillage → verrouillage. L'entrée, le fichier KDBX, le
profil et la clé Windows temporaire ont été supprimés. Aucun secret généré n'a
été écrit dans les preuves.

| Contrôle/état | Résultat |
| --- | --- |
| Créer et déverrouiller | PASS backend réel |
| Générer un mot de passe | PASS, 20 caractères et 4 classes |
| Ajouter / Enregistrer / Annuler | PASS UI + backend |
| Liste, détail et sélection | PASS |
| Rechercher | PASS |
| Copier | PASS, accusé 30 s ; aucune lecture du presse-papiers réel |
| Modifier en gardant le mot de passe | PASS |
| Supprimer + confirmation | PASS |
| Verrouiller / Déverrouiller | PASS |
| Dossier extension / guide | PASS IPC et présence des ressources |
| Instructions Edge/Chrome/Firefox | PASS contenu |
| Absence de secret dans DOM/localStorage | PASS |
| Windows Credential Manager binaire | PASS, test isolé créé puis supprimé |

### Extensions navigateur

L'extension Chromium a été injectée réellement dans Edge sur une page HTTPS
contenant un formulaire temporaire. Le Shadow DOM fermé a été inspecté via CDP,
sans lire d'identifiant réel.

| Contrôle/état | Edge | Chrome | Firefox |
| --- | --- | --- | --- |
| Manifeste/ressources/icônes | PASS | PASS | PASS |
| Hôte Native Messaging enregistré | PASS | PASS | PASS statique |
| Injection HTTPS | PASS | BLOQUÉ automatisation | non installé |
| Bouton `M` | PASS | non rejoué | non rejoué |
| Ouvrir/fermer le panneau | PASS | non rejoué | non rejoué |
| Générer coffre verrouillé | PASS erreur sûre | non rejoué | non rejoué |
| Enregistrer coffre verrouillé | PASS erreur sûre | non rejoué | non rejoué |
| Proposition après soumission | PASS | non rejoué | non rejoué |
| Ignorer | PASS | non rejoué | non rejoué |
| Popup `Actualiser` | PASS état verrouillé | non rejoué | non rejoué |
| Popup `Verrouiller` | non atteignable coffre verrouillé | non rejoué | non rejoué |
| Stockage navigateur | 0 clé/0 DB | tests statiques | tests statiques |

### Fenêtre, installation et système

| Contrôle/état | Résultat |
| --- | --- |
| Raccourci Bureau | PASS, cible l'exécutable installé |
| Raccourci menu Démarrer | PASS, cible l'exécutable installé |
| Version fichier | PASS, 1.2.0 |
| Réponse de la fenêtre | PASS, processus `Responding=True` |
| 720×560 | PASS, aucun débordement horizontal ; mode liste responsive |
| Menu de zone de notification | NON AUTOMATISÉ |
| Fermer → masquer puis rouvrir depuis la zone | NON AUTOMATISÉ |
| `Quitter` depuis la zone | NON AUTOMATISÉ |
| Désinstallation | NON EXÉCUTÉE pour préserver l'installation testée |

Les actions de zone de notification n'ont pas été automatisées afin de ne pas
fermer l'instance utilisateur déjà ouverte. Leur code a été inventorié, mais ce
n'est pas une preuve d'exécution.

## Régression visuelle WhatsApp/MAER

Commande : `npm run test:visual`.

| Référence | Résultat | Géométrie principale |
| --- | --- | --- |
| clair, 1366×900 | PASS, 0 pixel modifié | rail 89 px, discussions 420 px, 3 boutons d'appel |
| sombre, 1366×900 | PASS, 0 pixel modifié | mêmes zones, palette sombre MAER |
| clair, 920×900 | PASS, 0 pixel modifié | discussions 330 px, 3 boutons d'appel |
| sombre, 920×900 | PASS, 0 pixel modifié | mêmes zones, palette sombre MAER |

Couleurs contrôlées :

- clair : bleu `#0057b8`, cyan `#0089e6` ;
- sombre : bleu `#0089e6`, cyan `#48b7ff`.

Une capture supplémentaire du coffre à 920 px valide le rail plugin, le panneau
Firefox-like, l'absence de mot de passe persistant dans le DOM et zéro clé
`localStorage`.

## Vérifications et preuves

### Commandes principales

```powershell
npm test
npm run test:visual
$env:MAER_CHAT_NETWORK_SMOKE = '1'
node scripts\smoke.mjs --executable "$env:LOCALAPPDATA\Programs\MAER Chat\MAER Chat.exe"
npm --prefix browser-extensions\maer-password-vault test
$env:MAER_CHAT_TEST_WINDOWS_KEYRING = '1'
npx --no-install vitest run tests\password-vault-keyring.integration.test.ts
npm run verify:fuses:packaged
npm run verify:licenses:packaged
```

Résultats :

- Vitest : **46 fichiers réussis, 1 ignoré ; 235 tests réussis, 1 ignoré** ;
- intégration Windows Credential Manager : **1/1 réussie** ;
- extension : **20/20 réussis** ;
- smoke installé avec erreur réseau : **réussi** ;
- quatre comparaisons visuelles : **réussies** ;
- licences et neuf fusibles Electron : **réussis**.

### Identité du binaire installé

| Élément | Installé | Candidat local | Verdict |
| --- | --- | --- | --- |
| `MAER Chat.exe` SHA-256 | `DF3C0B292C16DC8C34DCD18844FE74D80002854A4F8E9831C13747BB5CA06B57` | même valeur | identique |
| `resources/app.asar` SHA-256 | `A306FA512DBA427324463CC0F834509BE7383CAECA54C27527F35E65F5F15424` | même valeur | identique |
| version produit | 1.2.0.0 | 1.2.0 | cohérent |
| Authenticode | NotSigned | NotSigned | P1-03 |

### Domaine retiré

Deux recherches indépendantes ont donné :

```text
ACTIVE_SOURCE_DOMAIN_SCAN_CLEAN
INSTALLED_ARTIFACT_DOMAIN_SCAN_CLEAN
```

Le client Windows actif et son `app.asar` ne contiennent donc aucune référence
à l’ancien domaine de contacts retiré ni à son domaine parent. Le domaine parent reste cependant actif au
niveau DNS/NAS ; ce problème est décrit dans le rapport serveur.

### Fichiers de preuve temporaires

Les captures et sorties JSON, hors dépôt, se trouvent dans :

`C:\Users\Emili\Documents\ChatGPT\MAER Chat\.codex-tmp\windows-audit`

Principales preuves :

- `installed-interactive-results.json` ;
- `shell-interactive-results.json` ;
- `hardware-media-results.json` ;
- `msedge-content-results.json` ;
- `edge-popup-results.json` ;
- `installed-welcome.png` ;
- `shell-interactive-1366.png` ;
- `shell-narrow-720x560.png` ;
- `vault-interactive-920.png` ;
- `msedge-content-ui-locked.png`.

## Matrice obligatoire après bascule serveur

1. Créer deux comptes administratifs jetables `audit-a` et `audit-b` sans
   afficher leurs secrets.
2. Associer Windows par QR depuis Android ; comparer le code à six chiffres.
3. Révoquer l'appareil et vérifier que le token ne reconnecte plus.
4. Connecter les deux comptes par mot de passe et tester le compte mémorisé.
5. Ajouter les contacts dans les deux sens, vérifier demande, acceptation et
   présence.
6. Envoyer texte, emoji et correction dans les deux sens ; redémarrer les
   clients et vérifier MAM.
7. Activer OMEMO, comparer les appareils, envoyer hors ligne puis reconnecter.
8. Envoyer une petite pièce jointe, la télécharger et vérifier son hash ; tester
   une taille au-dessus de 50 MiB sans transfert complet inutile.
9. Cliquer audio, vidéo et écran dans une conversation ; vérifier le texte reçu,
   l'URL identique, l'ouverture Jitsi et le partage d'écran réel avec
   consentement système.
10. Tester recherche, non-lus, notification Windows et son avec l'application en
    arrière-plan.
11. Tester `Se déconnecter`, suppression des comptes serveur et refus de
    reconnexion.
12. Supprimer les deux comptes et les données temporaires, puis joindre les logs
    serveur bornés au rapport sans secret.

## Conclusion

La régression d'interface signalée n'est plus présente dans le binaire installé :
le style WhatsApp/MAER est stable et les fonctions locales importantes sont
réelles. Les problèmes prioritaires sont désormais l'intégration serveur
manquante, la nature externe des appels, la signature Windows, quelques erreurs
de navigation/accessibilité et la finition des extensions. Aucun correctif n'a
été appliqué pendant cet audit ; seul ce rapport a été ajouté au dépôt.
