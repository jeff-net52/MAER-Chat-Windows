# Régression visuelle du shell MAER Chat

`npm run test:visual` capture et compare quatre états reproductibles : thèmes clair
et sombre, chacun à 1366 × 900 et 920 × 900.

Le test valide la structure, les trois boutons d'appel, l'absence de contribution
plugin et les couleurs MAER. Chaque PNG est ensuite comparé à sa baseline avec
`pngjs`, déjà verrouillé via `qrcode` : aucune dépendance n'est ajoutée.

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

Ce harnais statique doit être complété, avant release, par une capture du binaire
Electron packagé après authentification.
