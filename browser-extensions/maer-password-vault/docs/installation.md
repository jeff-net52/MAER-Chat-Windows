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
*Coffre verrouille* et toute action echoue de facon generique. L'installateur
MAER Chat enregistre normalement l'hote pour les trois navigateurs dans HKCU.
Cet etat reste normal si MAER Chat est ferme, si le coffre est verrouille ou si
l'extension est chargee avant l'application ; il ne faut pas ajouter de fichier
de test contenant des identifiants.

## Hote Windows livre avec MAER Chat

L'installateur enregistre un petit shim .NET auditable comme hote natif. Il
calcule le chemin de `MAER Chat.exe` depuis son propre repertoire, sans `PATH`
ni shell. Deux pipes ephemeres separes remplacent le stdin Electron non fiable ;
leurs noms aleatoires sont associes a une ACL limitee au SID courant et le shim
verifie que leur client possede exactement le PID Electron qu'il vient de
lancer. Le shim exige aussi l'unique preface CRLF Electron puis refuse tout octet
stdout supplementaire. Le binaire Electron detecte ensuite les arguments
d'invocation Native Messaging avant la prise du verrou mono-instance.
L'origine Chromium ou l'identifiant Firefox doit correspondre exactement a
l'identite figee. Il relaie les trames vers le client MAER Chat par un pipe local
authentifie par challenge/HMAC ; la cle de 32 octets est conservee uniquement
dans le Gestionnaire d'identifiants Windows. La source GPL du shim est livree
avec l'application et son binaire est reconstruit au packaging avec le
compilateur Windows .NET Framework explicitement localise. Voir
`../../../docs/NATIVE_MESSAGING_HOST.md`.

L'identifiant Chromium de developpement/production locale est
`afjfndaggdofghcpakcemfkckhiaplkn`. La cle SPKI publique correspondante est dans
le manifeste. Sa partie privee n'est ni conservee ni commitee : l'identite reste
stable en mode non empaquete, mais ce depot ne peut pas produire seul un CRX
signe. Une diffusion Web Store devra utiliser l'identite attribuee par le store
ou une cle de signature de release conservee hors depot.

Le present sous-projet ne contient volontairement ni binaire d'hote, ni manifeste
d'hote installable, ni ecriture registre.
