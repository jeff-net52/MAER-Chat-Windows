# MAER Password Vault - extension navigateur

Extension WebExtension du coffre de mots de passe MAER Chat pour Microsoft Edge,
Google Chrome et Mozilla Firefox. L'interface reprend les principes de Firefox
Lockwise - lisibilite, statut de verrouillage evident et actions explicites - avec
la palette sombre MAER Chat.

## Etat de livraison

L'extension est livree avec l'hote Windows `fr.maer.password_vault` integre au
client MAER Chat. L'installateur NSIS enregistre des manifestes HKCU distincts
pour Edge, Chrome et Firefox. Le proxy lance par le navigateur authentifie un
pipe local vers l'unique session de coffre du client ; si le client est ferme ou
le coffre verrouille, l'extension reste volontairement verrouillee. Elle ne
propose aucun stockage local, service cloud ou mode de secours.

## Garanties de conception

- remplissage uniquement apres un clic de l'utilisateur ;
- proposition explicite avant tout enregistrement ;
- aucun mot de passe dans `storage`, `localStorage`, IndexedDB, les journaux ou
  la configuration de l'extension ;
- aucun acces reseau : le seul canal externe est Native Messaging ;
- origine HTTPS calculee par le background depuis l'onglet emetteur, jamais
  acceptee depuis un script de page ;
- protocole borne, versionne et correle par identifiant de requete ;
- verrouillage ferme en cas d'hote absent, de reponse invalide ou de delai depasse.

## Developpement

Node.js 20 ou plus recent suffit. Aucune dependance npm, aucun outil global et
aucun telechargement ne sont requis.

```powershell
npm run verify
```

Les archives reproductibles sont produites dans `packages/` :

- `maer-password-vault-chromium-0.1.0.zip` pour Edge et Chrome ;
- `maer-password-vault-firefox-0.1.0.zip` pour Firefox.

Consulter [docs/installation.md](docs/installation.md) pour l'installation et le
chargement en mode developpeur, puis
[docs/native-messaging-protocol.md](docs/native-messaging-protocol.md) pour le
contrat de l'hote Windows.

## Utilisation

1. Ouvrir MAER Chat et deverrouiller le coffre.
2. Placer le curseur dans un champ mot de passe HTTPS.
3. Cliquer sur la cle MAER affichee a droite du champ.
4. Choisir un compte, generer un mot de passe ou enregistrer les valeurs saisies.

L'extension ne remplit rien au chargement de la page. Elle ne memorise pas les
secrets apres l'action en cours.
