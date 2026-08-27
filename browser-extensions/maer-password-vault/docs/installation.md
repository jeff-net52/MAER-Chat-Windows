# Construction et installation de developpement

## Construire

Depuis ce repertoire :

```powershell
npm run verify
```

`dist/chromium` et `dist/firefox` sont les repertoires non empaquetes. Les ZIP
ordonnes et horodates de facon deterministe sont dans `packages/`.

## Edge ou Chrome

1. Ouvrir `edge://extensions` ou `chrome://extensions`.
2. Activer le mode developpeur.
3. Choisir *Charger l'extension non empaquetee*.
4. Selectionner `dist/chromium`.

## Firefox

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Choisir *Charger un module complementaire temporaire*.
3. Selectionner `dist/firefox/manifest.json`.

## Etat attendu sans hote

Tant que l'hote `fr.maer.password_vault` n'est pas installe, le popup affiche
*Coffre verrouille* et toute action echoue de facon generique. Cet etat est normal
et constitue le comportement ferme attendu ; il ne faut pas ajouter de fichier
de test contenant des identifiants.

## Travail restant pour l'integrateur Windows

1. Implementer le protocole documente dans `native-messaging-protocol.md`.
2. Fixer et signer l'identifiant de production Chromium.
3. Installer un manifeste d'hote distinct par famille de navigateur avec une
   liste d'identites exacte, jamais un joker.
4. Relier l'hote au coffre MAER par un IPC local authentifie et borne.
5. Tester l'installation, le verrouillage, la suspension et la desinstallation
   sur Edge, Chrome et Firefox avant toute publication.

Le present sous-projet ne contient volontairement ni binaire d'hote, ni manifeste
d'hote installable, ni ecriture registre.
