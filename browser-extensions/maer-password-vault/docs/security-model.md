# Modele de securite de l'extension

## Frontieres de confiance

La page Web, ses scripts et son DOM sont non fiables. Le script de contenu est un
adaptateur d'interface ; le service worker est le point de controle ; l'hote
`fr.maer.password_vault` est le seul pont autorise vers le coffre local MAER.

```text
page non fiable -> script de contenu -> service worker -> Native Messaging -> hote MAER
```

La page ne choisit pas l'origine transmise a l'hote. Le service worker la derive
de `sender.url`/`sender.tab.url`, exige leur egalite et n'accepte que HTTPS dans
les manifestes livres.

## Secrets

Un mot de passe peut exister en memoire uniquement pendant :

- une reponse `vault.reveal` suivie immediatement du remplissage ;
- une reponse `vault.generate` suivie immediatement du remplissage ;
- une proposition d'enregistrement en attente d'un clic, au maximum 30 secondes.

Les references sont remplacees par des chaines vides au plus tot. JavaScript ne
permet pas de garantir l'effacement physique d'une chaine immutable ; le vrai
secret ne doit donc jamais etre ecrit dans un support persistant.

L'extension n'utilise ni API `storage`, ni `localStorage`, ni IndexedDB, ni cache
reseau. Elle n'appelle aucune API de journalisation. Les scripts de build et les
tests analysent le code livre pour maintenir ces invariants.

## Geste utilisateur

Aucun remplissage automatique. La recherche ne commence qu'apres un clic sur la
cle MAER. La revelation exige ensuite un clic sur une suggestion. La generation
et l'enregistrement ont chacun leur bouton explicite. Une soumission de formulaire
ne sauvegarde rien : elle affiche seulement une proposition temporaire.

## Echec ferme

L'absence d'hote, un coffre verrouille, une reponse mal formee, une origine non
canonique, une erreur navigateur, un message trop grand ou un timeout donnent le
meme resultat visible : **coffre indisponible ou verrouille**. Il n'existe aucun
compte cloud, aucune copie locale ni fournisseur alternatif.

## Menaces traitees

- confused deputy entre onglets/origines : origine derivee et correlee ;
- trame native malveillante : schema ferme, bornes, taille et correlation ;
- injection de page : Shadow DOM ferme, texte dynamique via `textContent`, pas de
  script distant ni d'evaluation de code ;
- remplissage involontaire : double geste recherche puis choix ;
- fuite par logs/persistance : API absentes et controlees par le lint ;
- hote absent ou tue : rejet de toutes les requetes et retour verrouille.

## Limites connues avant production

- la cle publique Chromium fige l'identifiant non empaquete, mais aucune cle
  privee de signature CRX n'est conservee dans le depot ;
- le validateur de protocole sait reconnaitre HTTP(S), mais les manifestes livres
  n'autorisent que HTTPS et la politique du coffre refuse aussi toute operation
  HTTP non chiffree ;
- les pages internes navigateur, `file:`, cadres cross-origin et contextes non
  HTTPS ne sont volontairement pas pris en charge ;
- l'effacement memoire d'une chaine JavaScript reste best-effort ;
- une page peut observer les valeurs une fois inserees dans ses propres champs,
  comme avec tout gestionnaire de mots de passe.
