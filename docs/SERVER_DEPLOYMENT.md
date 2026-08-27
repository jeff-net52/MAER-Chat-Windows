# Déploiement serveur requis pour MAER Chat Windows

Le contrôle du 26 août 2026 n’a obtenu aucune réponse HTTP de `xmpp.maer.fr` :
la négociation TLS a échoué depuis le poste de construction sur les chemins
`/.well-known/host-meta`, `/xmpp-websocket`, `/http-bind` et
`/maer-pairing/v1`. Le client ne doit donc pas être déclaré opérationnel avant
validation du certificat, du reverse proxy et des services ejabberd.

## 1. Endpoints cibles

- `wss://xmpp.maer.fr/xmpp-websocket`
- `https://xmpp.maer.fr/http-bind`
- `https://xmpp.maer.fr/maer-pairing/v1`
- `https://xmpp.maer.fr/.well-known/host-meta`
- `https://xmpp.maer.fr/.well-known/host-meta.json`

## 2. Listener ejabberd local

Exposer un listener HTTP uniquement sur loopback. Adapter la syntaxe au fichier de production existant :

```yaml
listen:
  -
    port: 5280
    ip: 127.0.0.1
    module: ejabberd_http
    request_handlers:
      /xmpp-websocket: ejabberd_http_ws
      /http-bind: mod_bosh
      /.well-known/host-meta: mod_host_meta
      /.well-known/host-meta.json: mod_host_meta
      /maer-pairing: mod_maer_pairing
```

Modules XMPP à conserver/activer :

```yaml
modules:
  mod_bosh: {}
  mod_host_meta: {}
  mod_mam: {}
  mod_muc: {}
  mod_http_upload: {}
  mod_blocking: {}
  mod_ping: {}
  mod_stream_mgmt: {}
  mod_auth_fast: {}
  mod_maer_pairing: {}
```

Le QR v1 utilise OAuth `sasl_auth`. Vérifier que le backend OAuth est persistant et que SASL `X-OAUTH2` est annoncé sur WebSocket.
Le handler IQ doit prendre en charge `inspect`, `approve`, `devices` et
`revoke`. `inspect` ne renvoie que le libellé, la plateforme et l’expiration de
la session, après validation de son identifiant et du code.

## 3. Reverse proxy Nginx

Exemple à intégrer dans le vhost TLS existant :

```nginx
location = /xmpp-websocket {
    proxy_pass http://127.0.0.1:5280/xmpp-websocket;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location = /http-bind {
    proxy_pass http://127.0.0.1:5280/http-bind;
    proxy_set_header Host $host;
    proxy_buffering off;
}

location ^~ /maer-pairing/ {
    limit_req zone=maer_pairing burst=10 nodelay;
    client_max_body_size 16k;
    proxy_pass http://127.0.0.1:5280;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_hide_header Server;
}
```

Déclarer au niveau `http` :

```nginx
limit_req_zone $binary_remote_addr zone=maer_pairing:10m rate=30r/m;
```

Ne jamais exposer l’API ejabberd administrative sur Internet.

## 4. En-têtes

Pour les endpoints d’association :

```text
Content-Type: application/json
Cache-Control: no-store
Pragma: no-cache
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

L’API n’utilise ni cookie ni authentification navigateur. Les opérations sensibles sont protégées par la signature Ed25519 du poste et l’approbation XMPP Android.

## 5. Vérifications avant production

```bash
curl -i https://xmpp.maer.fr/.well-known/host-meta
curl -i https://xmpp.maer.fr/http-bind
curl -i -X POST https://xmpp.maer.fr/maer-pairing/v1/sessions \
  -H 'Content-Type: application/json' -d '{}'
```

Résultats attendus : host-meta 200, BOSH réponse XMPP contrôlée (pas 404), pairing 400 JSON sur corps invalide (pas 404/HTML).

Tester ensuite le handshake WebSocket avec un vrai client, l’authentification mot de passe, MAM, HTTP Upload, OMEMO legacy Conversations, puis le scénario QR complet décrit dans `PAIRING_PROTOCOL_V1.md`.

## 6. Déploiement prudent

1. sauvegarder la configuration et la base ejabberd ;
2. déployer l’extension sur une instance de test ;
3. exécuter tests unitaires et scénario avec comptes dédiés ;
4. recharger Nginx après `nginx -t` ;
5. redémarrer/recharger ejabberd et surveiller les erreurs ;
6. vérifier qu’aucun jeton ou mot de passe n’apparaît dans les logs ;
7. conserver un rollback vers l’ancienne configuration.
