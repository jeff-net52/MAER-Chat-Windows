# Source correspondante de Converse.js et libomemo.js

Ce document décrit la procédure de release. Il ne prétend pas modifier les
licences amont et n'accorde aucun droit supplémentaire.

## Éléments livrés

MAER Chat Windows embarque Converse.js 14.0.0 sous MPL-2.0. Converse.js livre
dans son répertoire `dist` un rebundle de libomemo.js 2.0.2 et son module WASM,
sous GPL-3.0-only.

`corresponding-sources.lock.json` épingle :

- les URL npm exactes et leurs intégrités SRI ;
- les commits publiés dans les métadonnées npm ;
- le commit Git libomemo contenant les sources TypeScript et natives, les
  scripts de compilation et le lockfile ;
- les empreintes des fichiers libomemo effectivement contenus dans
  Converse.js 14.0.0.

Le commit libomemo utilisé est le `gitHead` publié par npm pour la version
2.0.2. Le tag public `v2.0.2` actuel contient le même code source mais diffère
sur les métadonnées de paquet et le lockfile ; la procédure utilise donc le
commit npm exact et non le tag flottant.

## Préparation d'une release publique

Depuis un clone propre disposant de Node.js et Git :

```powershell
node scripts/verify-third-party-compliance.mjs
node scripts/prepare-corresponding-sources.mjs --output dist\corresponding-source
```

Le second script télécharge les deux tarballs npm exacts, vérifie SHA-512 et
SHA-1, puis produit une archive Git de la source complète libomemo au commit
épinglé. Il génère aussi un manifeste avec les SHA-256 des artefacts obtenus.

Une release qui contient un installateur MAER Chat doit publier, au même
emplacement et pendant toute la durée de disponibilité du binaire :

- `converse.js-14.0.0.tgz` ;
- `libomemo.js-2.0.2.tgz` ;
- `libomemo.js-2.0.2-source-31b51c5d83d6.tar` ;
- `SOURCE_MANIFEST.json` ;
- le dépôt source MAER Chat correspondant au tag de la release.

La release doit conserver `LICENSE`, `THIRD_PARTY_NOTICES.md`, ce dossier et
les avis originaux inclus dans les archives amont. Si les fichiers embarqués ou
leurs empreintes changent, le lock et les avis doivent être revus explicitement
avant toute nouvelle publication.
