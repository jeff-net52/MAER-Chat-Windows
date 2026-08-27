# Politique de release Windows

## État actuel : publication binaire interdite

Le dépôt peut être publié comme **source en développement**, mais aucune release
binaire Windows ne doit être annoncée comme publiable tant que tous les
blocages ci-dessous ne sont pas levés.

1. **Absence de signature** : les exécutables et installateurs produits
   actuellement sont non signés. Aucun certificat Authenticode ni secret de
   signature n'est configuré dans le dépôt ou dans la CI publique.
2. **Logo bloquant** : l'auteur, la chaîne de droits et la licence de
   redistribution du logo MAER utilisé par les clients ne sont pas confirmés.
   Ce point est un NO-GO public indépendant de la licence GPL du code.
3. **Candidate locale uniquement** : l'installateur 1.2.0 actuel intègre le
   coffre, OMEMO et le Native Messaging et passe les contrôles automatisés,
   mais il reste une candidate locale non signée. L'ancien installateur 1.1.0
   ne doit pas être republié ni réutilisé sous un autre numéro de version.
4. **Validation d'intégration requise** : le build final doit être testé dans
   une VM Windows propre avec Credential Manager, Chrome, Edge et Firefox.

Le workflow `.github/workflows/windows-source.yml` vérifie les sources et
produit un répertoire applicatif éphémère non signé afin de contrôler sa
composition. Il ne crée, ne signe et ne publie aucun installateur. Les clés de
signature, jetons de store et certificats ne doivent jamais être ajoutés au
dépôt public.

## Conditions nécessaires à une release

Une version candidate doit partir d'un commit propre et d'un tag signé. Chaque
composant doit déclarer une version cohérente et la correspondance entre la
version de l'application, celle des extensions, les notes de release et les
noms d'artefacts doit être documentée sans ambiguïté.

Les validations minimales sont :

```powershell
npm ci
npm ls --all
npm audit --json
node scripts/verify-third-party-compliance.mjs
npm run generate:sbom
npm run typecheck
npm test
npm run test:visual
npm run build
npx --no-install electron-builder --win --dir
npm run verify:licenses:packaged
npm run verify:fuses:packaged
npm run test:e2e:packaged
npm run test:e2e
npm run verify --prefix browser-extensions/maer-password-vault
```

Le test visuel doit rester à zéro pixel modifié sur les quatre baselines MAER.
Un smoke supplémentaire doit lancer `dist\win-unpacked\MAER Chat.exe` afin de
vérifier le renderer ASAR, le WASM OMEMO, l'icône et le bridge privilégié dans
les mêmes conditions que l'installateur.

## Licences et source correspondante

Avant de construire l'installateur :

```powershell
node scripts/prepare-corresponding-sources.mjs --output dist\corresponding-source
```

La release publique doit joindre :

- le depot MAER Chat au commit du tag ;
- `LICENSE`, `THIRD_PARTY_NOTICES.md` et `THIRD_PARTY_LICENSES` ;
- les archives Converse.js et libomemo.js vérifiées ;
- l'archive de source complète libomemo au commit épinglé ;
- un SBOM CycloneDX et un SBOM SPDX valides ;
- `SHA256SUMS.txt` signé ou une attestation de provenance équivalente.

Le détail du mécanisme est dans
`THIRD_PARTY_LICENSES/CORRESPONDING_SOURCE.md`. Une branche Git flottante ou un
simple lien vers GitHub ne remplace pas les fichiers de source correspondant
aux binaires distribués.

## Signature et artefacts

Quand les droits du logo et l'identité légale du signataire sont confirmés :

- signer `MAER Chat.exe`, l'hôte Native Messaging et l'installateur NSIS avec
  Authenticode ;
- utiliser un horodatage RFC 3161 ;
- vérifier chaque signature avec `Get-AuthenticodeSignature` et `signtool` ;
- publier uniquement les artefacts issus du commit tagué ;
- ne jamais réutiliser un numéro de version ou remplacer silencieusement un
  artefact déjà publié ;
- publier les extensions dans leurs canaux signés respectifs : store
  Chrome/Edge et XPI signé par Mozilla.

## Dépôt public

Le premier dépôt public doit être créé depuis un snapshot dont l'historique a
été audité. Les anciens domaines, secrets, binaires locaux, caches, rapports
contenant des données privées et identifiants de test ne doivent pas apparaître
dans les fichiers actifs ou l'historique publié.

La provenance humaine des contributions et l'usage d'outils d'assistance au
développement doivent être décrits avec exactitude. Une attribution locale à un
agent automatique ne remplace pas l'identité du titulaire des droits.
