# Inventaire runtime Windows x64

Cet inventaire est dérivé de `package-lock.json` pour la cible `win32/x64`.
Il contient toutes les entrées `node_modules/**` non marquées `dev` dont les
contraintes `os` et `cpu` acceptent Windows x64. Les chemins sont conservés afin
de distinguer les versions imbriquées.

Electron 43.4.1, Chromium, Node.js et libomemo.js 2.0.2 sont ajoutés dans
`THIRD_PARTY_NOTICES.md`, car ils sont embarqués par le runtime Electron ou par
le paquet Converse.js plutôt que comme dépendances de production directes du
lockfile racine.

Les fichiers de licence originaux des paquets npm restent la référence pour les
copyrights et doubles licences. Cet inventaire ne les remplace pas.

## (MPL-2.0 OR Apache-2.0)

- `dompurify@3.4.14`

## Apache-2.0

- `localforage@1.10.0`
- `signal-polyfill@0.2.2`

## BSD-3-Clause

- `@lit-labs/signals@0.3.0`
- `@lit-labs/ssr-dom-shim@1.6.0`
- `@lit/reactive-element@2.1.2`
- `lit@3.3.3`
- `lit-element@4.2.2`
- `lit-html@3.3.3`
- `sprintf-js@1.1.3`

## ISC

- `get-caller-file@2.0.5`
- `qrcode/node_modules/cliui@6.0.0`
- `qrcode/node_modules/y18n@4.0.3`
- `qrcode/node_modules/yargs-parser@18.1.3`
- `require-main-filename@2.0.0`
- `set-blocking@2.0.0`
- `which-module@2.0.1`

## MIT

- `@babel/runtime@7.29.7`
- `@napi-rs/keyring@1.3.0`
- `@napi-rs/keyring-win32-x64-msvc@1.3.0`
- `@popperjs/core@2.11.8`
- `@types/trusted-types@2.0.7`
- `@xmldom/xmldom@0.8.15`
- `ansi-regex@5.0.1`
- `ansi-styles@4.3.0`
- `babel-runtime@6.26.0`
- `bootstrap@5.3.8`
- `camelcase@5.3.1`
- `color-convert@2.0.1`
- `color-name@1.1.4`
- `core-js@2.6.12`
- `decamelize@1.2.0`
- `dijkstrajs@1.0.3`
- `emoji-regex@8.0.0`
- `fflate@0.7.5`
- `find-up@4.1.0`
- `gifuct-js@2.1.2`
- `hash-wasm@4.12.0`
- `hsluv@1.0.2`
- `immediate@3.0.6`
- `is-fullwidth-code-point@3.0.0`
- `jed@1.1.1`
- `js-binary-schema-parser@2.0.3`
- `kdbxweb@2.1.1`
- `lie@3.1.1`
- `localforage-webextensionstorage-driver@3.0.0`
- `locate-path@5.0.0`
- `lodash-es@4.18.1`
- `p-locate@4.1.0`
- `p-locate/node_modules/p-limit@2.3.0`
- `p-try@2.2.0`
- `path-exists@4.0.0`
- `pluggable.js@3.0.1`
- `pngjs@5.0.0`
- `prettier@3.9.6`
- `qrcode@1.5.4`
- `qrcode/node_modules/wrap-ansi@6.2.0`
- `qrcode/node_modules/yargs@15.4.1`
- `regenerator-runtime@0.11.1`
- `require-directory@2.1.1`
- `sizzle@2.3.10`
- `string-width@4.2.3`
- `strip-ansi@6.0.1`

## MIT OR GPL-2.0

- `favico.js-slevomat@0.3.11`

## MPL-2.0

- `@converse/log@workspace`
- `converse.js@14.0.0`
- `converse.js/src/log@0.0.1`
