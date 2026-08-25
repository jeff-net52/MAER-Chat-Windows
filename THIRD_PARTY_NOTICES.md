# Mentions relatives aux composants tiers

MAER Chat pour Windows est distribué sous **GPL-3.0-or-later**. Le texte de cette licence se trouve dans `LICENSE`.

Les composants tiers principaux distribués avec l’application sont :

| Composant | Version | Licence | Projet |
|---|---:|---|---|
| Converse.js | 14.0.0 | MPL-2.0 | https://github.com/conversejs/converse.js |
| libomemo.js | inclus dans Converse.js 14 | Voir les notices du paquet Converse.js | https://github.com/conversejs/libomemo.js |
| Electron | 43.4.1 | MIT, avec notices Chromium | https://github.com/electron/electron |
| @napi-rs/keyring | 1.3.0 | MIT | https://github.com/Brooooooklyn/keyring-node |
| node-qrcode | 1.5.4 | MIT | https://github.com/soldair/node-qrcode |

Electron embarque Chromium et Node.js. Les licences complètes et les notices de ces composants sont incluses dans la distribution Electron (`LICENSE`, `LICENSES.chromium.html` et fichiers associés).

Le code de Converse.js a été empaqueté localement et thémé ; il n’est pas chargé depuis un CDN. Les fichiers sources correspondants, le fichier de verrouillage npm et les instructions de reconstruction doivent accompagner toute distribution publique du client MAER Chat.

Les marques, noms et éléments graphiques MAER restent la propriété de leurs titulaires respectifs. Le projet n’embarque aucun élément graphique WhatsApp/Meta.
