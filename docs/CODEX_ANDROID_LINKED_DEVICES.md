# Mission Codex — « Appareils liés » dans MAER Chat Android

> **Statut :** spécification de développement future. Aucun des composants
> décrits ci-dessous n’est présent dans le client Android récupéré ; ce document
> ne constitue pas une preuve d’implémentation ou de validation.

## Portée stricte

Travaille uniquement dans le dépôt Android `MaerChat`. N’édite ni le client Windows ni ejabberd. Crée une branche `feature/linked-devices-v1`. Ne change pas le package `fr.maer.chat`, le mécanisme de connexion existant, OMEMO, ni les traitements QR XMPP actuels.

Le contrat obligatoire est `docs/PAIRING_PROTOCOL_V1.md` du projet Windows. Namespace : `urn:maer:pairing:1`.

## Objectif utilisateur

Ajouter **Paramètres > Appareils liés** avec :

- liste des ordinateurs associés au compte actif ;
- date d’association, dernière activité et état ;
- bouton **Associer un appareil** ouvrant le scanner existant ;
- écran de confirmation affichant nom du PC, compte et code à six chiffres ;
- révocation d’un appareil après confirmation.

Le mot de passe, le jeton OAuth et le nonce Windows ne doivent jamais apparaître dans le QR, l’UI ou les logs.

## Réutiliser l’existant

- Scanner : `src/main/java/eu/siacs/conversations/ui/ScanQrCodeActivity.java`
- Contrat Activity Result : `ui/activity/result/ScanQrCode.java`
- Envoi IQ : `XmppConnectionService.sendIqPacket(Account, Iq, callback)`
- Modèles stanzas : `im.conversations.android.xmpp.model.*`
- Paramètres : `ui/fragment/settings/MainSettingsFragment.java`
- XML : `src/main/res/xml/preferences_main.xml`
- Tests Robolectric existants : `src/test/java/eu/siacs/conversations/`

Ne fais pas passer `maerchat://` par `ScanResultProcessor`, qui retourne uniquement des `MiniUri` existantes. Analyse le résultat brut dans le nouvel écran.

## Fichiers à créer

1. `utils/MaerPairingUri.java`
   - parse uniquement `maerchat://pair` ;
   - exige exactement `v=1`, `host=xmpp.maer.fr`, `sid` conforme à `[A-Za-z0-9_-]{16,128}` et `code` à six chiffres ;
   - refuse userinfo, fragment, port, paramètres dupliqués/inconnus, valeurs vides et URI surdimensionnée (>2048 caractères) ;
   - objet immuable, sans secret.

2. `xmpp/manager/LinkedDevicesManager.java`
   - construit et parse les quatre IQ décrites ci-dessous ;
   - aucune donnée persistée localement : le serveur est la source de vérité ;
   - timeout et erreurs XMPP convertis en résultats typés, sans afficher le XML brut.

3. `entities/LinkedDevice.java`
   - `id`, `label`, `platform`, `createdAt`, `lastSeenAt`, `expiresAt` ;
   - aucune propriété de jeton.

4. `ui/LinkedDevicesActivity.java` et son layout/adaptateur.
   - étendre la même base d’activité liée à `XmppConnectionService` que les autres écrans de gestion ;
   - enregistrer `registerForActivityResult(new ScanQrCode(), ...)` ;
   - choisir explicitement le compte si plusieurs comptes actifs ;
   - bouton Associer désactivé hors connexion ;
   - états chargement, vide, erreur et hors-ligne accessibles.

5. icône Material locale et chaînes françaises/anglaises. Ne copie aucune ressource WhatsApp/Meta.

## IQ exactes

### Inspecter une session

Après le scan et avant d’afficher la confirmation :

```xml
<iq type='get' to='xmpp.maer.fr'>
  <inspect xmlns='urn:maer:pairing:1' session='…' code='123456'/>
</iq>
```

Réponse attendue :

```xml
<session xmlns='urn:maer:pairing:1' id='…' label='PC Atelier'
         platform='windows' expires='…'/>
```

Seules ces métadonnées non secrètes sont affichées. Une erreur ou une réponse
malformée interdit l’approbation.

### Lister

```xml
<iq type='get' to='xmpp.maer.fr'>
  <devices xmlns='urn:maer:pairing:1'/>
</iq>
```

Réponse attendue :

```xml
<devices xmlns='urn:maer:pairing:1'>
  <device id='…' label='PC Atelier' platform='windows'
          created='…' last-seen='…' expires='…'/>
</devices>
```

### Approuver

Après scan, afficher une boîte de confirmation. Ne rien envoyer avant action positive.

```xml
<iq type='set' to='xmpp.maer.fr'>
  <approve xmlns='urn:maer:pairing:1' session='…' code='123456'/>
</iq>
```

Succès : enfant `<approved device-id='…'/>`. Afficher « Ordinateur associé », puis rafraîchir la liste. Une IQ erreur, un timeout ou une réponse malformée ne doit jamais être traité comme un succès.

### Révoquer

```xml
<iq type='set' to='xmpp.maer.fr'>
  <revoke xmlns='urn:maer:pairing:1' device-id='…'/>
</iq>
```

Demander confirmation avec le libellé de l’appareil. Rafraîchir uniquement après résultat IQ positif.

## Intégration paramètres

Dans `preferences_main.xml`, ajouter une préférence `linked_devices` près du compte/sécurité. Dans `MainSettingsFragment`, vérifier qu’elle existe et lui affecter un listener lançant `LinkedDevicesActivity`. La préférence reste visible hors ligne afin que l’utilisateur comprenne pourquoi la liste n’est pas disponible.

Déclarer l’activité dans le manifeste du flavor réellement livré. Respecter navigation Up, thème MAER, tailles tactiles ≥48 dp et TalkBack.

## Sécurité et concurrence

- Le `from` n’est jamais construit dans l’IQ : ejabberd l’ajoute depuis la session authentifiée.
- Le domaine cible vient de l’`Account`, mais doit être exactement `xmpp.maer.fr` pour v1.
- Ne fais aucun appel HTTP pour approuver ; l’authentification repose sur la session XMPP.
- Masque tout contenu sensible dans `Log`; loguer seulement un code d’état.
- Empêche double clic/double approbation et annule les callbacks quand l’activité est détruite.
- Ne sauvegarde pas l’URI QR complète dans Bundle, SharedPreferences ou base SQLite.
- Compare visuellement le code Android avec le code Windows avant confirmation.

## TDD obligatoire

Écrire les tests avant le code :

1. `MaerPairingUriTest` : URI valide et refus de mauvais schéma/hôte/version/code/sid, doublons, fragment, paramètre inconnu et dépassement de taille.
2. `LinkedDevicesManagerTest` : XML exact des quatre IQ, parsing de la
   prélecture et de la liste, refus mauvais namespace/type/attributs/horodatages.
3. Test Robolectric de l’écran : scanner lancé, confirmation affichée, aucune IQ avant confirmation, état de chargement, succès, timeout et révocation.
4. Test multi-compte : aucun compte choisi implicitement si plusieurs sont actifs.
5. Test de non-régression : les QR `xmpp:` existants suivent toujours leur chemin actuel.

Exécuter les tâches Gradle de test/lint du flavor `conversations` utilisé par MAER. Corriger les erreurs au lieu de désactiver lint ou les tests.

## Critères de livraison

- Diff limité et lisible, formatage du projet respecté.
- Aucun mot de passe/jeton dans code, fixture ou logs.
- APK debug construit et tests/lint réussis avec sorties réelles consignées.
- Fournir la liste des fichiers modifiés, commandes exécutées et limites restantes.
- Ne prétendre l’association fonctionnelle qu’après un test réel avec le serveur déployé et deux comptes MAER.
