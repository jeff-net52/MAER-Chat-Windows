# Rapport de validation MAER Chat Windows 1.3.3

Date de validation : 28 août 2026.

## Décision

La version 1.3.3 est une **candidate locale validée et non signée**. Elle
corrige le catalogue d’emojis absent du renderer packagé, renforce le smoke
connecté et conserve l’origine privilégiée `maer-chat://app`, le coffre local
et les fonctions de communication de la version 1.3.2.

Elle ne constitue pas une release publique de production. Aucun certificat
Authenticode n’est configuré : Windows peut donc afficher « Éditeur inconnu ».
La politique et les autres blocages publics restent décrits dans
`RELEASE_POLICY.md`.

## Correctifs propres à 1.3.3

- `emoji.json`, requis à l’exécution par Converse.js 14, est maintenant copié
  à la racine du renderer. Son absence provoquait `ERR_UNEXPECTED`, puis des
  erreurs secondaires lors de l’ouverture du sélecteur d’emojis ;
- le contrôle post-build compare le catalogue livré octet pour octet à celui
  de Converse.js et vérifie sa structure minimale ;
- les smokes source et packagé chargent et analysent réellement ce catalogue
  depuis `maer-chat://app/emoji.json`, avant toute authentification ;
- le smoke connecté cible le lien de roster par JID exact, ajoute le contact
  uniquement s’il manque et ne reclique plus le nom après la soumission du
  formulaire, car Converse ouvre déjà la discussion ;
- une éventuelle fiche de profil est fermée avant la capture et les trois
  actions audio, vidéo et partage d’écran sont comptées uniquement dans la
  conversation attendue ;
- la version est cohérente dans npm, l’ASAR, l’exécutable, l’installateur et
  `latest.yml`.

## Vérifications exécutées

- `npm ci` : réussi, 462 paquets installés et 0 vulnérabilité ;
- `npm ls --all` : arbre de dépendances cohérent ;
- `npm audit --json` : 0 vulnérabilité ;
- TypeScript : réussi ;
- Vitest ciblé : 19 tests du connecteur, du protocole renderer et de la
  conformité réussis ;
- Vitest complet mono-worker : **51 fichiers réussis, 1 ignoré ; 292 tests
  réussis, 1 ignoré** ;
- test visuel : quatre baselines MAER acceptées sans régénération, trois
  boutons d’appel présents et rendu du coffre vérifié ; l’écart maximal est
  de 0,1771 % des pixels et le delta moyen maximal de 0,0108 %, sous les seuils
  respectifs de 0,5 % et 0,1 % ;
- build renderer et NSIS x64 : réussis ;
- smoke Electron depuis les sources : runtime 1.3.3, origine privilégiée,
  onboarding, plugins, WASM OMEMO et catalogue d’emojis réussis ;
- smoke du binaire packagé : runtime 1.3.3, origine privilégiée, onboarding,
  plugins, extensions, Native Messaging, WASM OMEMO et catalogue d’emojis
  réussis ;
- licences du paquet et sources correspondantes : réussies ;
- neuf fusibles Electron : vérifiés ;
- extension coffre : lint, 21 tests, empaquetage Chromium/Firefox et
  reproductibilité des ZIP réussis ;
- SBOM CycloneDX 1.5 et SPDX 2.3 : générés et manifestés ;
- signatures Authenticode : contrôlées et absentes sur l’installateur,
  l’application et l’hôte Native Messaging.

Le premier lancement de `npm run dist` s’est arrêté parce qu’un worker Vitest
n’a pas répondu pendant son démarrage sous contention de la machine. Les 50
autres fichiers avaient réussi. Le fichier concerné a ensuite réussi seul
(21 tests), puis la suite complète a réussi avec un seul worker, sans modifier
aucun délai, seuil ou test. Les étapes restantes du workflow — extensions,
TypeScript, conformité, build renderer, vérification d’assets et
electron-builder NSIS — ont ensuite toutes réussi sur le payload final.

## Validation d’intégration restante

Le smoke sans identifiants demandé pour cette candidate est réussi. Le smoke
connecté renforcé a ensuite été exécuté avec un compte de test injecté sans
affichage du secret : authentification réelle, ouverture exacte du contact et
présence des trois commandes appel audio, appel vidéo et partage d’écran ont
été vérifiées depuis le paquet puis depuis l’installation locale 1.3.3. Le
scénario physique d’association Windows ↔ NAS ↔ Android ainsi qu’un essai sur
une VM Windows propre restent requis avant toute publication publique.

## Signatures et versions

| Fichier | Version | Authenticode |
| --- | --- | --- |
| `MAER-Chat-Setup-1.3.3-x64.exe` | 1.3.3 | `NotSigned` |
| `win-unpacked/MAER Chat.exe` | 1.3.3.0 | `NotSigned` |
| `maer-password-vault-host.exe` | 0.0.0.0 | `NotSigned` |

L’absence de signature est un **blocage externe de publication** : aucun
certificat ni secret de signature n’est disponible. Aucune tentative de
signature ad hoc n’a été faite.

## Artefacts Windows `dist/`

| Fichier | Octets | SHA-256 | SHA-512 |
| --- | ---: | --- | --- |
| `MAER-Chat-Setup-1.3.3-x64.exe` | 118122100 | `1034EE7BB07EA582FF57E743304FC469FEAD762A7667DC8ACF995CD51EBF7949` | `025D7B2E4D72B79306635B9F020458E60E93267AC8557B6122B0F15BD42898EBDE5791A81AF4A03EEFC10B47418207A31F4ED8A117393C4D55F142ED388C68ED` |
| `MAER-Chat-Setup-1.3.3-x64.exe.blockmap` | 125671 | `44E8F63B272C8FC3EE085FABB3AF0A5BF34248282A0F5030925B4FE01B6F0811` | `A1D77FF36CC24BA778A343C049ED784894D0E925C1731BD2F57471C399F7EF5E042270C02062FB03371E1EC1939458814AFF02AAFE523E507A34F8BCDDAAD03F` |
| `latest.yml` | 355 | `B06A277D6B13167D040810852F1E8D821867256272F38DFB178CB981A0F8738F` | `C2E97B1C1E4AD3ACFAFF94EC7AFBB2CBF962C5E41A6E3417B8AD3FE4F2AF213CDBC40923B7263B263F2B66F8C8E199F44A5FC45BD76A7A72E621D462B85BB466` |
| `win-unpacked/MAER Chat.exe` | 235588096 | `87985661AF5794F2A836CA4934BD650854DD31ED7BE08902205BFEE7E7670E0C` | `D75A14712C785A76309D569C4FE943CA309022316868C0BD5BA939F7BAD6AAB6496A269B434A4AB2EBA5C9D7383118427933B6B21F6EB6C888C9058890400120` |
| `win-unpacked/resources/app.asar` | 79626867 | `232A026E4C8D899A87C77C08819BDCDA18FC9AA781B435763847381106A0E624` | `5C409B076EF71C0CF8BC7786948C51A058CECA06FEB8C605E9B9F6F95BA5971C291E6CD56BFEC1D506F41C5F75C080BD2F3D74B5556796AA0F960ADDA58951F6` |
| `win-unpacked/resources/native-messaging/maer-password-vault-host.exe` | 10240 | `75DFC8FF142714A7A358BE00A99D4A8F251F111A147FA6BADBD04BDA5AC6DF07` | `6F7EC3B1C3E442253B4795621FB567661448C3552DAB570A72D2CE945AF4B13C3E5E41A590FA15B0B3BB4A366C7C49F96D6A4254E8BC424B80FE06B4977F9B79` |

La valeur SHA-512 Base64 publiée deux fois dans `latest.yml` pour
l’installateur est
`Al17Lk1yt5MGY1ufAgRY5g6TJnrIVXthIrDxW9QomOveV5GoGvSgPu/BC0dBggejH07YoRc5PE1V8ULtOIxo7Q==` ; elle correspond exactement à l’empreinte
hexadécimale ci-dessus.

## SBOM et sources correspondantes

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| `sbom/MAER-Chat-1.3.3.cdx.json` | 552990 | `57C6FCF9634E51EADA999F0F3936E956DF72127BB0E7634D8F0008A1FC1064C3` |
| `sbom/MAER-Chat-1.3.3.spdx.json` | 534280 | `A72728352946D0D1B508C89F8B608B9ACE4FB1A5152EC1DC788EE51D66B14B81` |
| `sbom/SBOM_MANIFEST.json` | 504 | `00040010105806C85D6E16B2A339E86DF34664680B53B9EC6B04EDB41AD3293C` |
| `corresponding-source-1.3.3/converse.js-14.0.0.tgz` | 8745393 | `634F31FA0F7B0E47F1ABC60D870FF6805C737577399920EBE92DA4C7E5BCAFF0` |
| `corresponding-source-1.3.3/libomemo.js-2.0.2-source-31b51c5d83d6.tar` | 1454080 | `BEEE3D1BBB1FE59043D10A8EB6EB4C83B5AC330353097B63B2DA01026ECCB318` |
| `corresponding-source-1.3.3/libomemo.js-2.0.2.tgz` | 578002 | `4838F06C90D2E611949FABF3EDD45D2905BDDBD657D36B5A8B9F150A09F6C31B` |
| `corresponding-source-1.3.3/SOURCE_MANIFEST.json` | 705 | `4F358BE2D610D062C62FC6972B8D42C82FF05F3C17E8DFC6A3CC867AB51D2062` |

## Extensions navigateur

| Fichier | Octets | SHA-256 |
| --- | ---: | --- |
| `maer-password-vault-chromium-0.1.0.zip` | 101719 | `96EE5B0675EAF3D1412C8CB633D0DB9E706DDAF793603004D1FA7B6A344A0489` |
| `maer-password-vault-firefox-0.1.0.zip` | 101547 | `CABAD3FE4D490E8194C0CEF7DF5EC5EB8AB6E220CA9C3EE70DD04FC068371430` |

Le fichier `Release/CURRENT_DIST_MANIFEST.sha256` couvre ces quinze éléments et
a été vérifié ligne par ligne contre le payload final.
