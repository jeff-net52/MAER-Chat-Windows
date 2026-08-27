# Installer l’extension MAER Password Vault

Ce dossier est livré avec MAER Chat. Il contient deux versions non empaquetées
de l’extension : `dist/chromium` pour Microsoft Edge et Google Chrome, et
`dist/firefox` pour Mozilla Firefox.

## Microsoft Edge

1. Ouvrir `edge://extensions` dans Edge.
2. Activer **Mode développeur**.
3. Choisir **Charger l’extension non empaquetée**.
4. Sélectionner le dossier `dist/chromium` dans le dossier d’extension MAER.
5. Épingler **Coffre MAER** depuis le menu des extensions si souhaité.

## Google Chrome

1. Ouvrir `chrome://extensions` dans Chrome.
2. Activer **Mode développeur**.
3. Choisir **Charger l’extension non empaquetée**.
4. Sélectionner le dossier `dist/chromium` dans le dossier d’extension MAER.
5. Épingler **Coffre MAER** depuis le menu des extensions si souhaité.

## Mozilla Firefox

1. Ouvrir `about:debugging#/runtime/this-firefox` dans Firefox.
2. Choisir **Charger un module complémentaire temporaire**.
3. Sélectionner `dist/firefox/manifest.json` dans le dossier d’extension MAER.

Firefox retire les modules temporaires à chaque fermeture complète du
navigateur. Il faut donc répéter ces trois étapes après un redémarrage de
Firefox tant que l’extension n’est pas distribuée par un catalogue signé.

## Utilisation avec MAER Chat

L’installateur MAER Chat enregistre l’hôte natif `fr.maer.password_vault` pour
Edge, Chrome et Firefox dans le profil Windows courant. L’application MAER Chat
doit être ouverte et le coffre doit être déverrouillé pour rechercher, remplir
ou enregistrer un identifiant.

Si l’extension affiche **Coffre verrouillé**, ouvrir MAER Chat puis sélectionner
**Mots de passe** dans la barre latérale. Ne copiez jamais de fichier contenant
des identifiants dans le dossier de l’extension.

## Informations techniques

L’identifiant Chromium figé est `afjfndaggdofghcpakcemfkckhiaplkn` et
l’identifiant Firefox est `password-vault@maer.fr`. La connexion au coffre passe
exclusivement par Native Messaging et par l’hôte local livré avec MAER Chat.
L’extension n’embarque ni coffre, ni mot de passe, ni binaire d’hôte.

Pour reconstruire les deux dossiers depuis les sources du projet :

```powershell
npm --prefix browser-extensions/maer-password-vault run build
```
