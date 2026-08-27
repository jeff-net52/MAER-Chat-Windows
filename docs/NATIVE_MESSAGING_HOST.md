# Hôte Native Messaging MAER Password Vault

## Architecture livrée

```text
extension Edge/Chrome/Firefox
        | framing natif LE32 + JSON UTF-8 (64 KiB max)
        v
shim .NET auditable maer-password-vault-host.exe
        | 2 pipes éphémères séparés, ACL SID + PID enfant vérifié
        v
MAER Chat.exe en mode proxy, sans fenêtre et sans verrou mono-instance
        | pipe Windows local + challenge/HMAC-SHA-256 mutuel
        v
MAER Chat GUI -> NativeVaultGateway main-only -> session KDBX unique
```

Electron écrit actuellement un unique `CRLF` sur stdout avant l'exécution du
code JavaScript et son stdin GUI n'est pas un canal binaire Native Messaging
fiable sous Windows. L'exécutable Electron n'est donc jamais enregistré
directement comme hôte. Le petit shim C# calcule `MAER Chat.exe` depuis son
propre répertoire, le lance sans shell et transporte les trames dans deux pipes
éphémères distincts, un par sens. Les noms contiennent 128 bits produits par un
CSPRNG ; ils ne constituent pas un secret et peuvent apparaître dans la ligne de
commande. Chaque pipe possède une ACL limitée au SID Windows courant et le shim
vérifie par `GetNamedPipeClientProcessId` que le client est exactement le PID
Electron qu'il vient de lancer avant de traiter le moindre octet navigateur.

Le shim exige toujours exactement le `CRLF` initial sur stdout Electron, puis
termine l'enfant si un octet supplémentaire apparaît sur ce flux. stderr est
drainé séparément, les deux sens conservent le framing LE32/64 KiB, les attentes
sont bornées à cinq secondes, le code de sortie enfant est propagé et un enfant
qui ne s'arrête pas après la déconnexion du navigateur est terminé. Un marqueur
privé de fin de quatre octets nuls ne quitte jamais la liaison shim/Enfant et
permet de préserver la fermeture moitié-duplex ; il est retiré avant le parseur
Native Messaging. Une invocation directe d'Electron avec seulement les
arguments Chrome ou Firefox est refusée.

La source GPL du shim est livrée dans
`resources/native-messaging/host-shim`. Le build résout explicitement
`csc.exe` dans les emplacements .NET Framework 4.x Windows 64 puis 32 bits ; il
n'utilise jamais `PATH`. Le binaire produit est un artefact de build ignoré par
Git, reconstruit par `beforePack`, tandis que sa source reste dans le paquet
pour audit et respect de la licence.

Le proxy ne crée jamais de seconde `VaultSession`. Le contrôleur du plugin et
le `NativeVaultGateway` partagent la même session sérialisée, le même délai de
verrouillage et la même persistance atomique. `reveal` n'existe ni dans le
preload, ni dans le renderer, ni dans le contrat IPC de l'interface.

## Identités exactes

- hôte : `fr.maer.password_vault` ;
- Chromium : `chrome-extension://afjfndaggdofghcpakcemfkckhiaplkn/` ;
- Firefox : `password-vault@maer.fr`.

Le proxy vérifie les arguments fournis par le navigateur avant de lire stdin ou
de joindre le pipe. Chromium doit fournir l'origine exacte et
`--parent-window=<entier>`. Firefox doit fournir le chemin exact du manifeste
installé dans `%LOCALAPPDATA%\MAER Chat\NativeMessaging` puis l'identifiant
exact de l'extension. Les manifestes n'emploient aucun joker.

Références de comportement des navigateurs : documentation officielle
[Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
et [Mozilla Native messaging](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).

## Authentification locale

Le serveur GUI crée une valeur aléatoire de 32 octets dans le Gestionnaire
d'identifiants Windows sous le service `MAER Chat Native Messaging IPC` et le
compte `local-user-v1`. Le proxy sait uniquement lire cette valeur ; il refuse
de la créer. Elle n'est jamais écrite dans un fichier, un manifeste, un journal
ou stdout et les copies binaires temporaires sont remises à zéro au mieux.

Chaque connexion utilise deux nonces aléatoires de 32 octets et trois preuves
HMAC distinctes (`server`, `client`, `ready`). Une preuve, un nonce, une trame,
une séquence ou un schéma incorrect ferme immédiatement la connexion. Le pipe
est créé sans élargir les droits `readableAll`/`writableAll`; le secret conservé
dans le profil Windows courant reste obligatoire même si un autre processus
parvient à ouvrir le nom du pipe.

## Installation et désinstallation

L'installateur NSIS copie le shim et les scripts dans
`resources\native-messaging`, génère trois manifestes JSON absolus sans BOM dans
`%LOCALAPPDATA%\MAER Chat\NativeMessaging`, puis enregistre leurs chemins sous :

- `HKCU\Software\Google\Chrome\NativeMessagingHosts\fr.maer.password_vault` ;
- `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\fr.maer.password_vault` ;
- `HKCU\Software\Mozilla\NativeMessagingHosts\fr.maer.password_vault`.

La désinstallation retire uniquement ces trois clés, ces trois fichiers et le
répertoire s'il est vide. Elle ne supprime ni le coffre KDBX ni sa clé Windows.

## Clé Chromium et signature

Le manifeste Chromium contient uniquement une clé publique SPKI. Elle fige
l'identifiant en mode développement sans committer de clé privée. La partie
privée générée pour cette identité a été délibérément abandonnée : le dépôt ne
peut donc pas signer un CRX autonome avec cette identité. Une publication sur
Chrome Web Store/Edge Add-ons devra utiliser l'identité attribuée par le store,
ou une nouvelle paire de release dont la clé privée reste dans un stockage de
signature externe au dépôt. Les ZIP reproductibles actuels sont destinés au
chargement non empaqueté et aux audits, pas présentés comme des CRX signés.

## Politique et échecs

Le protocole valide les origines canoniques HTTP(S). Les extensions livrées ne
s'injectent que dans des pages HTTPS. La passerelle de coffre réapplique la
validation et refuse toute opération sur HTTP non chiffré avec `DENIED`. Une
révélation ou mise à jour vérifie
à nouveau l'appartenance exacte `credentialId`/origine dans l'opération KDBX.

Si le GUI n'est pas lancé, si la clé IPC manque, si le coffre est verrouillé, ou
si le handshake expire, le proxy échoue fermé. stdout contient exclusivement
des trames Native Messaging ; les erreurs publiques sont réduites aux codes
fermés du protocole et ne contiennent ni chemin, pile, message interne ou secret.
