# Protocole Native Messaging MAER Password Vault v1

Statut : protocole implemente cote extension et cote hote Windows MAER Chat.

## Transport et identite

L'extension utilise exclusivement `runtime.connectNative` avec le nom fixe :

```text
fr.maer.password_vault
```

Le transport suit le framing Native Messaging des navigateurs : JSON UTF-8
precede d'un entier natif non signe de 32 bits contenant le nombre d'octets. Une
trame MAER est limitee a **65 536 octets**, meme si le navigateur autorise plus.

Le manifeste de l'hote doit autoriser uniquement les identites de production :

- Chromium : `allowed_origins` contient l'origine exacte
  `chrome-extension://<identifiant-de-production>/` ;
- Firefox : `allowed_extensions` contient uniquement
  `password-vault@maer.fr`.

L'identifiant Chromium doit etre fige par la cle de signature avant livraison.
Ne jamais employer un joker. Le binaire natif doit verifier sa configuration et
terminer immediatement s'il ne peut pas joindre le processus coffre MAER local.

## Enveloppe de requete

Tous les champs sont obligatoires. Les champs inconnus sont rejetes.

```json
{
  "protocol": "maer.password-vault",
  "version": 1,
  "id": "0d2d44d4-2fd2-4b49-9314-2bfdbb617dd5",
  "type": "vault.lookup",
  "origin": "https://example.org",
  "sentAt": 1787838000000,
  "payload": {
    "usernameHint": "alice",
    "formSignature": "post:text/username,password/current-password"
  }
}
```

- `protocol` vaut exactement `maer.password-vault` ;
- `version` vaut exactement `1` ;
- `id` fait 8 a 64 caracteres et respecte
  `[A-Za-z0-9][A-Za-z0-9._:-]{7,63}` ;
- `type` appartient a la liste fermee ci-dessous ;
- `origin` est une origine canonique HTTP(S), sans chemin, requete, fragment ni
  slash final ;
- `sentAt` est un entier millisecondes positif ;
- `payload` est un objet specifique a l'operation.

L'extension calcule `origin` a partir de l'onglet emetteur. Un script de contenu
ne peut ni la fournir ni la remplacer. Les cadres cross-origin sont rejetes.

## Enveloppe de reponse

Succes :

```json
{
  "protocol": "maer.password-vault",
  "version": 1,
  "id": "0d2d44d4-2fd2-4b49-9314-2bfdbb617dd5",
  "type": "response",
  "origin": "https://example.org",
  "ok": true,
  "payload": {}
}
```

Echec :

```json
{
  "protocol": "maer.password-vault",
  "version": 1,
  "id": "0d2d44d4-2fd2-4b49-9314-2bfdbb617dd5",
  "type": "response",
  "origin": "https://example.org",
  "ok": false,
  "error": { "code": "LOCKED" }
}
```

La reponse repete obligatoirement `id` et `origin` a l'identique. L'extension
rejette et ferme le canal si la correlation, la version, la taille ou la forme
echoue. Elle ne montre jamais les details de l'hote a la page : toute erreur est
reduite a un etat generique verrouille.

Codes d'hote recommandes : `LOCKED`, `NOT_FOUND`, `DENIED`, `INVALID_REQUEST`,
`BUSY`, `INTERNAL`. Aucun champ `message`, chemin local, pile d'appel ou detail
cryptographique ne doit traverser le protocole.

## Operations

### `vault.status`

Requete : payload vide. Reponse :

```json
{
  "state": "ready",
  "capabilities": ["lookup", "reveal", "save", "generate", "lock"]
}
```

`state` vaut `ready` ou `locked`. Au plus 16 capacites de 64 caracteres.

### `vault.lookup`

Recherche les metadonnees correspondant exactement a `origin`. Le mot de passe
n'est jamais retourne par cette operation.

Requete :

```json
{
  "usernameHint": "alice",
  "formSignature": "post:text/username,password/current-password"
}
```

Reponse, au plus 50 entrees :

```json
{
  "entries": [
    {
      "credentialId": "opaque-local-id",
      "username": "alice",
      "label": "Example",
      "updatedAt": 1787838000000
    }
  ]
}
```

`credentialId` est opaque, non devinable et limite a 128 caracteres. Les entrees
ne contiennent aucun secret.

### `vault.reveal`

Declenchee uniquement apres le clic sur une suggestion.

Requete : `{ "credentialId": "opaque-local-id" }`

Reponse :

```json
{
  "credentialId": "opaque-local-id",
  "username": "alice",
  "password": "secret-transitoire"
}
```

L'hote doit verifier que l'identifiant appartient a l'origine exacte de la
requete avant de reveler. Le secret est limite a 4096 caracteres.

### `vault.save`

Declenchee uniquement apres l'action explicite *Enregistrer*.

```json
{
  "credentialId": "",
  "username": "alice",
  "password": "secret-transitoire",
  "label": "Example"
}
```

Reponse : payload vide. Un `credentialId` vide cree une entree ; un identifiant
non vide met a jour seulement une entree deja liee a l'origine.

### `vault.generate`

Declenchee uniquement apres le clic *Generer*.

```json
{
  "policy": {
    "length": 20,
    "lowercase": true,
    "uppercase": true,
    "digits": true,
    "symbols": true
  }
}
```

Longueur permise : 12 a 128. Au moins un alphabet est actif. Reponse :
`{ "password": "secret-transitoire" }`.

### `vault.lock`

Payload et reponse vides. L'hote demande au client MAER de verrouiller la session
du coffre sans attendre l'expiration automatique.

## Bornes

| Champ | Limite |
| --- | ---: |
| trame JSON | 65 536 octets |
| origine | 512 caracteres |
| nom d'utilisateur | 320 caracteres |
| mot de passe | 4 096 caracteres |
| libelle | 256 caracteres |
| signature de formulaire | 256 caracteres |
| identifiant opaque | 128 caracteres |
| suggestions | 50 |

L'hote doit appliquer les memes bornes **avant** toute allocation couteuse et
rejeter les nombres non entiers, les caracteres NUL, les objets non attendus et
les champs inconnus.

## Cycle de connexion

- delai extension par requete : 5 000 ms ;
- traitement hote recommande : moins de 4 500 ms ;
- a la deconnexion : toutes les requetes en vol echouent, les secrets transitoires
  sont effaces au mieux et l'interface repasse verrouillee ;
- reconnexion locale exponentielle : 400 ms, 800 ms, 1,6 s, 3,2 s, 6,4 s puis
  8 s maximum ; une action utilisateur peut relancer immediatement la connexion ;
- aucune requete HTTP, WebSocket ou cloud n'est autorisee comme secours.

Le host proxy et le processus MAER Chat utilisent un pipe local borne a 65 536
octets avec challenge aleatoire et preuves HMAC-SHA-256 mutuelles. La cle IPC de
32 octets est stockee uniquement dans le Gestionnaire d'identifiants Windows du
compte courant. Le proxy echoue ferme avant de lire stdin si le pipe, la cle ou
la preuve du serveur est indisponible. La conception detaillee et ses limites
sont documentees dans `../../../docs/NATIVE_MESSAGING_HOST.md`.
