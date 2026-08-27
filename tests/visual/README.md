# Régression visuelle du shell MAER Chat

`npm run test:visual` capture et compare quatre états reproductibles : thèmes clair
et sombre, chacun à 1366 × 900 et 920 × 900.

Le test valide la structure, les trois boutons d'appel, l'absence de contribution
plugin et les couleurs MAER. Chaque PNG est ensuite comparé à sa baseline avec
`pngjs`, déjà verrouillé via `qrcode` : aucune dépendance n'est ajoutée.

Une cinquième capture hors baseline ouvre ensuite la contribution coffre-fort
avec un bridge borné simulé. Elle vérifie le bouton rail, le panneau Firefox-like,
l'absence de champ secret persistant et l'absence de stockage navigateur, sans
modifier les quatre références WhatsApp.

Un pixel est modifié si l'écart d'un canal RGBA dépasse 16/255. Le seuil autorise
au plus 0,5 % de pixels modifiés et un delta moyen normalisé de 0,1 %. Cela absorbe
une petite variation de rastérisation, mais bloque une modification significative
de structure, palette ou typographie.

Pour approuver volontairement un rendu sous PowerShell :

```powershell
$env:UPDATE_VISUAL_BASELINES = '1'
npm run test:visual
Remove-Item Env:UPDATE_VISUAL_BASELINES
npm run test:visual
```

Les quatre images de `tests/visual/baselines/` doivent être inspectées dans la même
revue que le changement UI. La CI ne doit jamais activer la mise à jour automatique.
Les captures courantes sont écrites hors dépôt dans `.codex-tmp/visual`.

Les quatre comparaisons pixel utilisent volontairement une conversation fixture
stable. La même commande ouvre aussi `real-converse.html`, initialise la version
réellement embarquée de Converse.js et vérifie ses composants personnalisés,
`#controlbox`, `.box-flyout` et l’injection du rail/sidebar MAER. Cette seconde
sonde structurelle empêche une baseline factice de masquer une rupture du DOM
Converse ; elle produit `real-converse-light-920.png` sans en faire une baseline
pixel dépendante d’un compte XMPP. Cette sonde utilise bien le bundle Converse
réel, mais elle n’est pas authentifiée et ne démontre donc ni une conversation
serveur réelle, ni les boutons d’appel d’une conversation connectée.

Ce harnais statique doit être complété, avant release, par une capture du binaire
Electron packagé après authentification. `scripts/smoke.mjs` propose pour cela
un mode optionnel `MAER_CHAT_CONNECTED_SMOKE=1` avec identifiants jetables dans
les variables d’environnement ; aucune valeur d’identification n’est affichée
ou persistée par le script, et le profil temporaire est purgé à la fermeture.
