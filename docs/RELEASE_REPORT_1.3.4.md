# Rapport de validation MAER Chat Windows 1.3.4

Date : 28 août 2026
Statut : candidate locale validée, non signée

## Correctif livré

La version 1.3.4 corrige la connexion `X-OAUTH2` qui suit l’approbation d’un
QR code. Converse 14 utilise Strophe 3 et attend une liste de constructeurs
SASL ; le client transmettait déjà une instance. Strophe tentait alors de
l’instancier une seconde fois et affichait `Mechanism is not a constructor`.

Le connecteur transmet désormais le constructeur `SASLXOAuth2`. Un test de
régression vérifie explicitement que l’entrée fournie à Strophe est une
fonction instanciable.

## Validation automatisée

- TypeScript : réussi ;
- Vitest : 293 tests réussis, 1 test ignoré ;
- licences et notices : réussies ;
- build Electron main, preload et renderer : réussi ;
- actifs Converse : WASM OMEMO et catalogue emoji présents et vérifiés ;
- fuses Electron : politique renforcée vérifiée ;
- smoke du paquet : origine privilégiée, onboarding, plugins, extensions,
  Native Messaging, OMEMO et emoji réussis ;
- smoke connecté contre `xmpp.maer.fr` : authentification, ouverture d’un
  contact et présence des trois commandes audio, vidéo et partage d’écran.

## Validation physique QR

Le parcours réel a été exécuté avec :

- MAER XMPP Server rev11 installé et actif sur le Synology ;
- MAER Chat Android 0.5.4 sur un Samsung XCover7 ;
- MAER Chat Windows 1.3.4 installé dans le profil utilisateur Windows.

Résultat observé : scan Android, inspection serveur, approbation, émission du
jeton limité à `sasl_auth`, connexion `X-OAUTH2`, stockage Windows et ouverture
de l’interface MAER Chat. Le contrôle Electron final rapporte zéro erreur de
renderer.

## Artefacts

| Fichier | Taille | SHA-256 |
| --- | ---: | --- |
| `MAER-Chat-Setup-1.3.4-x64.exe` | 118122901 | `754A1667E4E95D6DE4FC032AFD94FAF6E9B37720F33023034E343012E7C75FEF` |
| `MAER-Chat-Setup-1.3.4-x64.exe.blockmap` | 125622 | `AEB1C8C3C8220D6E855804F5AA62CD48E94F34EAD21A96FF3F80C6E8F59F736A` |
| `win-unpacked/MAER Chat.exe` | 235588096 | `EBC2A973C37FDE010A43485997075523B13F2AE9BBE9731E44BD51B4008E3686` |
| `sbom/MAER-Chat-1.3.4.cdx.json` | 552990 | `27BD4B2EEB248237E3F87DA9B126B36C1DA915E9E970E56955F5E70339B12E4D` |
| `sbom/MAER-Chat-1.3.4.spdx.json` | 534280 | `CC176146D78EE7608B21A091AE035623C249DB61A30071450F2ECFF97AAA19F8` |

## Limite de publication

L’installateur est volontairement conservé comme candidate locale :
`Get-AuthenticodeSignature` retourne `NotSigned`. Les sources peuvent être
publiées, mais aucune release binaire publique ne doit être annoncée avant la
signature Authenticode et la levée des autres conditions décrites dans
`docs/RELEASE_POLICY.md`.
