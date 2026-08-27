# Protocole d’association MAER Chat — version 1

> **Statut au 26 août 2026 :** contrat de conception non implémenté sur Android
> ni sur ejabberd. Le client Windows prépare le QR et le polling, mais aucun
> scénario de bout en bout n’est opérationnel ou validé.

Le nom du PC reste absent du QR. Android l’obtient par la prélecture XMPP
authentifiée définie ci-dessous, afin d’afficher une valeur issue de la session
serveur avant toute approbation.

## Objectif

Associer un client Windows à un compte MAER déjà connecté sur Android **sans placer ni transmettre le mot de passe dans le QR code**. L’application Android authentifie l’approbation par une IQ XMPP envoyée sur sa session existante. Le serveur émet un jeton OAuth limité à `sasl_auth`, révocable par appareil.

Namespace XMPP : `urn:maer:pairing:1`  
URI QR : `maerchat://pair?...`  
API HTTPS : `https://xmpp.maer.fr/maer-pairing/v1`

## 1. Création par Windows

`POST /sessions`

```json
{
  "protocol_version": 1,
  "client_public_key": "<Ed25519 SPKI DER, base64>",
  "device_name": "PC Atelier",
  "platform": "windows",
  "app_version": "1.0.0"
}
```

Contraintes :

- clé Ed25519 éphémère générée localement ;
- nom d’appareil : 1–80 caractères UTF‑8 après suppression des espaces externes ;
- clé SPKI : exactement le préfixe DER Ed25519 `302a300506032b6570032100` suivi de 32 octets ;
- au maximum 10 sessions actives par IP et 10 000 globalement ;
- session : 5 minutes.

Réponse :

```json
{
  "version": 1,
  "session_id": "<opaque 32+ caractères>",
  "verification_code": "123456",
  "expires_at": "2026-08-25T12:00:00.000Z",
  "poll_nonce": "<opaque 32+ caractères>"
}
```

Le QR ne contient que :

```text
maerchat://pair?v=1&host=xmpp.maer.fr&sid=<session_id>&code=<6 chiffres>
```

Le QR ne contient ni mot de passe, ni jeton OAuth, ni nonce de consultation.

## 2. Prélecture et approbation Android via XMPP

Après le scan, Android demande d’abord les métadonnées non secrètes de la
session depuis sa connexion XMPP authentifiée :

```xml
<iq type='get' to='xmpp.maer.fr' id='inspect-…'>
  <inspect xmlns='urn:maer:pairing:1'
           session='…'
           code='123456'/>
</iq>
```

Le serveur valide le domaine local, la session, son expiration et le code,
puis répond sans clé publique, nonce de consultation ni jeton :

```xml
<iq type='result' …>
  <session xmlns='urn:maer:pairing:1'
           id='…'
           label='PC Atelier'
           platform='windows'
           expires='2026-08-25T12:00:00.000Z'/>
</iq>
```

Une session inconnue, expirée ou associée à un mauvais code produit une erreur
XMPP générique et ne révèle aucune métadonnée. La prélecture ne réserve pas la
session, ne l’approuve pas et reste sans effet si l’utilisateur annule ensuite.

L’application présente avant envoi :

- le nom annoncé de l’ordinateur ;
- le code à six chiffres, à comparer avec celui affiché sur Windows ;
- le compte XMPP concerné ;
- les boutons **Associer** et **Annuler**.

Elle envoie au domaine de son compte :

```xml
<iq type='set' to='xmpp.maer.fr' id='pair-…'>
  <approve xmlns='urn:maer:pairing:1'
           session='…'
           code='123456'/>
</iq>
```

Le serveur utilise le `from` authentifié fourni par ejabberd. Il refuse tout JID non local, session expirée, code faux, session déjà approuvée ou compte désactivé. Il émet alors :

```erlang
ejabberd_oauth:oauth_issue_token(JidAsList, 2592000, [<<"sasl_auth">>])
```

La réponse IQ ne contient jamais le jeton :

```xml
<iq type='result' …>
  <approved xmlns='urn:maer:pairing:1' device-id='…'/>
</iq>
```

## 3. Consultation signée par Windows

Toutes les consultations et annulations incluent :

```json
{
  "nonce": "<poll_nonce>",
  "timestamp": "<ISO-8601 UTC>",
  "signature": "<Ed25519 base64>"
}
```

Charge signée, octet pour octet :

```text
MAER-PAIR-POLL\n1\n<session_id>\n<poll_nonce>\n<timestamp>
```

Pour l’annulation, remplacer `POLL` par `CANCEL`. Le serveur exige une dérive d’horloge maximale de 30 secondes et vérifie Ed25519 avec la clé enregistrée lors de la création.

`POST /sessions/{id}/poll` renvoie :

```json
{"status":"pending","expires_at":"…"}
```

ou, après approbation :

```json
{
  "status": "approved",
  "jid": "utilisateur@xmpp.maer.fr",
  "access_token": "<secret>",
  "token_expires_at": "…",
  "device_id": "<opaque>"
}
```

Le jeton ne peut être obtenu que par le PC possédant la clé privée éphémère. La session est supprimée à expiration. L’application Windows stocke le jeton dans le Gestionnaire d’identifiants Windows et ne l’écrit jamais dans les logs, IndexedDB ou fichiers applicatifs.

## 4. Liste et révocation Android

Liste :

```xml
<iq type='get' to='xmpp.maer.fr'>
  <devices xmlns='urn:maer:pairing:1'/>
</iq>
```

Révocation :

```xml
<iq type='set' to='xmpp.maer.fr'>
  <revoke xmlns='urn:maer:pairing:1' device-id='…'/>
</iq>
```

Le serveur vérifie que l’appareil appartient au bare JID authentifié, puis appelle `ejabberd_oauth:oauth_revoke_token/1`. Toute session XMPP déjà établie doit également être fermée au moyen du hook/session manager disponible ; sinon la révocation prend effet au plus tard à la prochaine reconnexion.

## 5. Réponses et sécurité HTTP

- TLS valide obligatoire, aucun repli HTTP ;
- `Content-Type: application/json`, `Cache-Control: no-store`, `Pragma: no-cache` ;
- pas de redirection ;
- CORS limité à l’origine du client packagé si un schéma applicatif est utilisé ; pour `file://`, endpoints sans cookie et protégés par signature ;
- corps maximal 16 Kio ;
- erreurs génériques, aucun jeton dans les logs ;
- rate limiting Nginx et serveur ;
- comparaison constante pour code/nonce ;
- nettoyage périodique des sessions expirées ;
- horloge serveur synchronisée NTP.

## 6. Tests d’acceptation obligatoires

1. QR valide, approbation Android, jeton utilisable avec SASL `X-OAUTH2`.
2. Prélecture valide sans effet de bord ; code faux, session expirée, session
   inconnue et autre domaine refusés sans fuite de métadonnées.
3. Signature altérée, mauvais nonce et timestamp hors fenêtre refusés.
4. Deux approbations concurrentes ne créent qu’un appareil.
5. Un poll rejoué reste idempotent durant la courte fenêtre de livraison.
6. Révocation coupe la reconnexion du poste ciblé sans affecter les autres appareils.
7. Aucun secret dans QR, logs, crash reports ou réponses d’erreur.
8. Rotation/redémarrage ejabberd : les appareils persistants restent listables et révocables, les associations en cours peuvent expirer.
