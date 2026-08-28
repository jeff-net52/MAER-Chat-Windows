# Rapport de validation MAER Chat Windows 1.3.2

Date de validation : 28 août 2026.

## Décision

La version 1.3.2 est une **candidate locale validée et non signée**. Elle
conserve les correctifs d’onboarding et l’origine privilégiée
`maer-chat://app` de la version 1.3.1, documente l’implémentation actuelle du
protocole d’association rev9/Android 0.5.3 et isole totalement les essais E2E
du Gestionnaire d’identifiants Windows.

Elle ne constitue pas une release publique de production. Aucun certificat
Authenticode n’est configuré : Windows peut donc afficher « Éditeur inconnu ».
La politique et les autres blocages publics restent décrits dans
`RELEASE_POLICY.md`.

## Correctifs propres à 1.3.2

- le profil `MAER_E2E=1` utilise un backend d’identifiants vide : il ne lit,
  n’écrit, ne liste et ne supprime aucun secret du Gestionnaire d’identifiants
  Windows ;
- le smoke décoche explicitement **Mémoriser ce compte**, vérifie que la case
  reste décochée et n’exerce donc jamais un chemin de persistance de secret ;
- un test unitaire couvre le backend E2E et démontre qu’aucun compte ni secret
  n’est retenu ;
- `PAIRING_PROTOCOL_V1.md` décrit désormais les trois implémentations livrées :
  Windows 1.3.2, Android 0.5.3 et MAER XMPP Server rev9 ;
- le numéro de version est cohérent dans les métadonnées npm, l’ASAR,
  l’exécutable, l’installateur et `latest.yml` ;
- les fonctions média n’ont pas été modifiées dans cette révision.

## Vérifications exécutées

- `npm ci` : réussi, 462 paquets, aucune vulnérabilité signalée ;
- `npm ls --all` : réussi, seules les dépendances optionnelles propres aux
  autres plateformes sont absentes ;
- `npm audit --json` : 0 vulnérabilité ;
- TypeScript : réussi ;
- Vitest : **51 fichiers réussis, 1 ignoré ; 292 tests réussis, 1 ignoré** ;
- build officiel `npm run dist` : réussi, y compris une seconde exécution
  complète de la suite Vitest ;
- test visuel : quatre baselines MAER acceptées sans régénération, trois
  boutons d’appel présents et rendu du coffre vérifié ; les écarts maximaux
  observés sont 0,1771 % de pixels et 0,0108 % de delta moyen, sous les seuils
  respectifs de 0,5 % et 0,1 % ;
- smoke Electron depuis les sources : réussi, origine `maer-chat://app` ;
- smoke du binaire packagé : runtime 1.3.2, origine privilégiée, onboarding,
  plugins, extensions, Native Messaging et WASM OMEMO réussis ;
- licences du paquet et source correspondante : réussies ;
- neuf fusibles Electron : vérifiés ;
- extension coffre : lint, 21 tests, empaquetage Chromium/Firefox et
  reproductibilité des ZIP réussis ;
- SBOM CycloneDX 1.5 et SPDX 2.3 : générés et manifestés ;
- recherche des anciens domaines retirés : aucune référence active ;
- signature Authenticode : contrôlée et absente sur l’installateur,
  l’application et l’hôte Native Messaging.

Un premier passage Vitest, exécuté pendant une forte contention de la machine,
a expiré au démarrage d’un worker. Le test concerné a ensuite réussi seul, la
suite complète a réussi, puis le workflow `dist` l’a de nouveau exécutée avec
succès. Aucun délai ni seuil de test n’a été assoupli.

## Validation d’intégration restante

Les contrôles ci-dessus n’installent pas l’EXE et ne modifient aucun secret
système. Le scénario physique complet doit encore être rejoué une fois le
serveur rev9 actif sur le NAS : création d’une session, scan Android,
approbation, récupération signée du jeton, connexion SASL `X-OAUTH2`, liste et
révocation de l’appareil. Une VM Windows propre reste nécessaire avant toute
publication publique.

## Signatures et versions

| Fichier | Version | Authenticode |
| --- | --- | --- |
| `MAER-Chat-Setup-1.3.2-x64.exe` | 1.3.2 | `NotSigned` |
| `win-unpacked/MAER Chat.exe` | 1.3.2 | `NotSigned` |
| `maer-password-vault-host.exe` | 0.0.0.0 | `NotSigned` |

L’absence de signature est un **blocage externe de publication** : aucun
certificat ni secret de signature n’est disponible. Aucune tentative de
signature ad hoc n’a été faite.

## Artefacts Windows `dist/`

| Fichier | Octets | SHA-256 | SHA-512 |
| --- | ---: | --- | --- |
| `MAER-Chat-Setup-1.3.2-x64.exe` | 118100258 | `65DDCD1EE8F868251F940CC3F9CC3B928284E39266A611B7F6A50F152128880E` | `A302B2EC70122BD84E00034DFCFBA48DD892C33A9D5D6EF790C7B15C2AC4B19B7951C9828254AE86246E9F8A3AF7A562D18938CE243BB0E34DD433F3D2054354` |
| `MAER-Chat-Setup-1.3.2-x64.exe.blockmap` | 125096 | `33EF5D8498212730DCF3F1FD4BF0E9E883E31130CCD7E2BEE987862C4CC1868A` | `388FF7561D1150C8D3F7CB5AA66A16B393A1404055119A022955344D6CB14FD2AC0924AACEAE7075F7C5260C975DFD78DFB03C90AC1A67F614B675EBA38C34E5` |
| `latest.yml` | 355 | `1624265A8DA2091D517E16EB252259BE6C03293650AC08FCD79E1C49FCE5C4AB` | `60F57918767BA060263775757CF563321AA93101BA7795AF4ACBC647D13ED2B15DBC4B0AE7649D27961A8192C2703938100E7980EDDD77C2B84729A7A686F6B5` |
| `win-unpacked/MAER Chat.exe` | 235588096 | `7D2DC8DF70D24456F63062AF87B2C305142F881D93BFD77409B9D809414BF9E5` | `2D4E657A480783607AAA33DE1366D8DB58051DC815322569305D31765F0DF5B2D629DFAC287AABD1DE19D6FF76F51885C6FD00F884C0081223E8DFB942659246` |
| `win-unpacked/resources/app.asar` | 79356804 | `AAC1397DB8DDE9A412E15FCA2CB4C674D20DB2AFEF64C332E431CC93B3ED4D99` | `14BA83803AAF9A96A602CFB7BA320B5672F690DAF4496C9723EA138D64381ED21F90BEFE49A09A6B17D0D0EC90510AB5D2E7098F833C2D88203FD295E170B492` |
| `win-unpacked/resources/native-messaging/maer-password-vault-host.exe` | 10240 | `86B53845C7030D27B862942975091A246BA09BE4F5A6D0D709A97B876B3E7B1F` | `6EB559BF2DB39A347347384399D5F9C081E96032D1945A80A862CE0741C4CC759B1CE47A2B707F00E67F2F9FCA8D7480352E2840C183B93BB9A511321E6F2E9D` |

La valeur SHA-512 Base64 publiée dans `latest.yml` pour l’installateur est
`owKy7HASK9hOAANN/PukjdiSwzqdXW73kMexXCrEsZt5UcmCglSuhiRun4o696Vi0Yk4ziQ7sONN1DPz0gVDVA==` ; elle correspond exactement à l’empreinte hexadécimale ci-dessus.

## SBOM et source correspondante

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| `sbom/MAER-Chat-1.3.2.cdx.json` | 552990 | `34E27C7F093F997D1F513E902E24D6DD899E288F90B2B43EFD47F9C66C707893` |
| `sbom/MAER-Chat-1.3.2.spdx.json` | 534280 | `AFE94CD0ABE2702FD95AB6250E1E647D54C8F8461F16E79F088E794DCE87040D` |
| `sbom/SBOM_MANIFEST.json` | 504 | `63ABF11AE14BD35A4EB1279FBB8D0DDB133ABD1F35F376D99D511B7F8AC18F8B` |
| `corresponding-source-1.3.2/converse.js-14.0.0.tgz` | 8745393 | `634F31FA0F7B0E47F1ABC60D870FF6805C737577399920EBE92DA4C7E5BCAFF0` |
| `corresponding-source-1.3.2/libomemo.js-2.0.2-source-31b51c5d83d6.tar` | 1454080 | `BEEE3D1BBB1FE59043D10A8EB6EB4C83B5AC330353097B63B2DA01026ECCB318` |
| `corresponding-source-1.3.2/libomemo.js-2.0.2.tgz` | 578002 | `4838F06C90D2E611949FABF3EDD45D2905BDDBD657D36B5A8B9F150A09F6C31B` |
| `corresponding-source-1.3.2/SOURCE_MANIFEST.json` | 705 | `4F358BE2D610D062C62FC6972B8D42C82FF05F3C17E8DFC6A3CC867AB51D2062` |

## Extensions navigateur

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| `maer-password-vault-chromium-0.1.0.zip` | 101719 | `96EE5B0675EAF3D1412C8CB633D0DB9E706DDAF793603004D1FA7B6A344A0489` |
| `maer-password-vault-firefox-0.1.0.zip` | 101547 | `CABAD3FE4D490E8194C0CEF7DF5EC5EB8AB6E220CA9C3EE70DD04FC068371430` |
