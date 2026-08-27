# MAER-CALL/1 — contrat canonique d’invitation

MAER-CALL/1 transporte une invitation de réunion dans le corps d’un message de
conversation XMPP. Il ne constitue ni un protocole média, ni une preuve de
chiffrement, ni une signature cryptographique. La confidentialité du message
dépend des propriétés effectives de la conversation XMPP qui le transporte.

## Forme exacte

Le corps contient exactement trois lignes UTF-8, séparées uniquement par LF.
CRLF et tout caractère CR sont refusés afin que Windows et Android valident les
mêmes octets :

```text
<libellé canonique>
MAER-CALL/1 mode=<mode> issued=<ISO-UTC> expires=<ISO-UTC> room=<salon>
https://meet.jit.si/<salon>[#config.startWithVideoMuted=true]
```

- `mode` vaut exactement `audio`, `video` ou `screen` ;
- `issued` et `expires` utilisent la forme ISO UTC canonique avec millisecondes,
  par exemple `2026-08-27T12:00:00.000Z` ;
- `expires - issued` vaut exactement 7 200 000 ms ;
- `room` respecte `MAER-[A-Za-z0-9]{16,128}` et doit être identique au segment
  de chemin de l’URL ;
- l’origine vaut exactement `https://meet.jit.si`, sans identifiants, query
  string, port explicite ni segment supplémentaire. La chaîne URL brute doit
  être identique à la sérialisation canonique WHATWG ;
- le hash est absent pour `video` et vaut exactement
  `#config.startWithVideoMuted=true` pour `audio` et `screen` ;
- le libellé est respectivement :
  - `Appel audio MAER — Invitation envoyée via la conversation XMPP.` ;
  - `Appel vidéo MAER — Invitation envoyée via la conversation XMPP.` ;
  - `Partage d’écran MAER — Invitation envoyée via la conversation XMPP.`

Un client doit rejeter tout champ absent, supplémentaire, réordonné ou
contradictoire. Il doit revérifier l’expiration au moment où l’utilisateur
clique sur « Rejoindre », après le consentement Jitsi, puis immédiatement avant
l’IPC native, et non uniquement à la réception. Une horloge située
plus de cinq minutes avant `issued` rend également l’invitation non joignable.

## Vecteur canonique vidéo

```text
Appel vidéo MAER — Invitation envoyée via la conversation XMPP.
MAER-CALL/1 mode=video issued=2026-08-27T12:00:00.000Z expires=2026-08-27T14:00:00.000Z room=MAER-1234567890ABCDEF
https://meet.jit.si/MAER-1234567890ABCDEF
```

Résultat attendu : accepté entre `2026-08-27T11:55:00.000Z` inclus et
`2026-08-27T14:00:00.000Z` exclu. À l’échéance exacte, le clic est refusé.

## Vecteur canonique audio

```text
Appel audio MAER — Invitation envoyée via la conversation XMPP.
MAER-CALL/1 mode=audio issued=2026-08-27T12:00:00.000Z expires=2026-08-27T14:00:00.000Z room=MAER-ABCDEF1234567890
https://meet.jit.si/MAER-ABCDEF1234567890#config.startWithVideoMuted=true
```

Le remplacement du salon dans l’URL, le retrait du hash audio, l’ajout d’une
query string, la modification du mode ou un TTL différent doivent tous être
refusés.

## Rétention locale

Le client Windows purge les invitations expirées avant chaque insertion et
chaque clic. Il conserve au maximum 50 invitations entrantes valides ; au-delà,
la plus ancienne est évincée. « Refuser » retire immédiatement l’invitation de
ce registre. Cette rétention n’est pas une propriété du protocole réseau, mais
une borne de sûreté que les autres clients peuvent adopter.

Toute URL dont l’origine exacte est `https://meet.jit.si` est réservée au flux
MAER-CALL/1. Une URL de salon d’équipe, avec query, fragment inattendu ou port
explicite est bloquée dans les chemins génériques et ne doit jamais être
déléguée au navigateur système.
