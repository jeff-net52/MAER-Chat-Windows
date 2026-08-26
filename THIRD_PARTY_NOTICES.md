# Mentions relatives aux composants tiers

MAER Chat pour Windows est distribué sous **GPL-3.0-or-later**. Le texte de cette licence se trouve dans `LICENSE`.

Les composants tiers principaux distribués avec l’application sont :

| Composant | Version | Licence | Projet |
|---|---:|---|---|
| Converse.js | 14.0.0 | MPL-2.0 | https://github.com/conversejs/converse.js |
| libomemo.js | inclus dans Converse.js 14 | Voir les notices du paquet Converse.js | https://github.com/conversejs/libomemo.js |
| Electron | 43.4.1 | MIT, avec notices Chromium | https://github.com/electron/electron |
| @napi-rs/keyring | 1.3.0 | MIT | https://github.com/Brooooooklyn/keyring-node |
| kdbxweb | 2.1.1 | MIT | https://github.com/keeweb/kdbxweb |
| hash-wasm | 4.12.0 | MIT et composants embarqués sous licences permissives | https://github.com/Daninet/hash-wasm |
| @xmldom/xmldom | 0.8.15 | MIT | https://github.com/xmldom/xmldom |
| fflate | 0.7.5 | MIT | https://github.com/101arrowz/fflate |
| node-qrcode | 1.5.4 | MIT | https://github.com/soldair/node-qrcode |

Electron embarque Chromium et Node.js. Les licences complètes et les notices de ces composants sont incluses dans la distribution Electron (`LICENSE`, `LICENSES.chromium.html` et fichiers associés).

Le code de Converse.js a été empaqueté localement et thémé ; il n’est pas chargé depuis un CDN. Les fichiers sources correspondants, le fichier de verrouillage npm et les instructions de reconstruction doivent accompagner toute distribution publique du client MAER Chat.

Les textes de licence et mentions de copyright des composants du coffre sont distribués dans `THIRD_PARTY_LICENSES`. `@xmldom/xmldom` est volontairement forcé en version 0.8.15 par le fichier de verrouillage npm afin de ne pas embarquer la branche 0.7.x déclarée par kdbxweb 2.1.1.

Les marques, noms et éléments graphiques MAER restent la propriété de leurs titulaires respectifs. Le projet n’embarque aucun élément graphique WhatsApp/Meta.
