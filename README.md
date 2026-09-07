# DCIP — Journée des Métiers et de la Mobilité

Deux applications pour le stand de la **DCIP** (Direction de la Construction, de
l'Immobilier et du Patrimoine) à la **Journée des Métiers et de la Mobilité** du
**CADAM**, le **mercredi 23 septembre 2026** — Département des Alpes-Maritimes.

> **Dépôt de référence : [`DCIP06/JDMM`](https://github.com/DCIP06/JDMM)**, sous
> l'organisation du Département. `Lauviah83/cadam-jdmm` était le dépôt de développement ;
> il n'est plus la source.

| Application | En ligne | Ce qu'elle fait |
|---|---|---|
| **Postes vacants** | <https://dcip06.github.io/JDMM/postes/> | Les 7 fiches DCIP. On ouvre une fiche, on la reçoit par courriel. |
| **Trois quiz** | <https://dcip06.github.io/JDMM/quiz/> | Prévention incendie, gardiennage, sûreté — 20 questions. |

Chacune a son QR code (`assets/qr-postes.svg`, `assets/qr-quiz.svg`) et sa carte A5
prête à imprimer (`assets/planche-a5-postes.html`, `assets/planche-a5-quiz.html`).

Elles reproduisent le contenu et le parcours des deux fichiers de référence,
`sources/dcip_postes.html` et `sources/quiz-hub-mobile.html`.

---

## Le parcours d'un visiteur

**Postes** — il scanne, voit les 7 fiches (filtrables par service), en ouvre une, lit
missions et profil, puis clique **« Je suis intéressé(e) par ce poste »**.
Il renseigne **prénom, nom, direction et adresse — tous obligatoires**, éventuellement son
projet de mobilité et un message, accepte d'être recontacté, et **enregistre sa demande**.
L'écran confirme qu'il sera recontacté dans les meilleurs délais.

La demande est écrite dans un **fichier Excel appartenant au Département**, sur son OneDrive,
partagé avec les agents de la DCIP concernés. **Rien n'est conservé par l'application ni sur
GitHub** : le code ne fait que transmettre. Voir [`docs/REGISTRE.md`](docs/REGISTRE.md).

**Quiz** — il scanne, choisit un des trois quiz, répond, lit la correction rédigée,
obtient son score et son verdict. Aucune inscription, rien à installer.

---

## Qualité mesurée

Relevés sur le site déployé, profil mobile :

| | Performance | Accessibilité | Bonnes pratiques | SEO |
|---|---|---|---|---|
| Postes | 93 | 100 | 100 | 100 |
| Quiz | 100 | 100 | 100 | 100 |

axe-core (WCAG 2.1 AA) : **0 violation** sur 10 écrans × 2 formats.

Le design des quiz est extrait du fichier source par `scripts/extraire_css_quiz.py`, qui
répare au passage 17 sélecteurs annulés dans l'original par un commentaire placé à
l'intérieur du sélecteur — dont tout le bloc responsive. Les panneaux sont passés sur
**fond clair** (`css/quiz-clair.css`), chaque quiz gardant sa couleur de signature.
Recette complète dans `scripts/recette/` — parcours, clavier, hors ligne, accessibilité.

---

## Lancer en local

Les modules JavaScript imposent un vrai serveur : ouvrir le fichier par double-clic
ne fonctionne pas.

```bash
python3 -m http.server 8000
# puis http://localhost:8000/postes/ et http://localhost:8000/quiz/
```

## Contrôles

```bash
node scripts/test-logique.mjs               # logique métier, sans navigateur
python3 scripts/sync_offers.py --dry-run    # collecte des offres, sans écriture
```

Recette dans un navigateur : voir `scripts/recette/LISEZMOI.md`.

---

## Organisation du dépôt

```
index.html          redirige vers postes/
postes/             application « Postes vacants »
quiz/               application « Trois quiz »
mentions.html       visionneuse des documents de docs/
data/               contenu éditorial (JSON) — c'est ici qu'on modifie les textes
  postes-dcip.json    les 7 fiches
  quiz.json           les 3 quiz
  config.json         date, adresses, clés
  offers.json         ⚠️ généré chaque nuit par le robot, ne pas éditer
themes/             couleurs et polices — aucune couleur ailleurs
css/                mise en page et composants, partagés
js/
  commun/             ce que les deux applications partagent
  postes/  quiz/      une application chacune
assets/             polices, icônes, QR codes, planches A5
scripts/            robot de synchronisation, générateur de QR, recette
docs/               clés, RGPD, accessibilité, exploitation, charte
sources/            fichiers de référence d'origine (non publiés en ligne)
```

## Choix techniques

**HTML, CSS et JavaScript natifs. Aucun framework, aucun bundler, aucune étape de build.**
GitHub Pages sert les fichiers tels quels, la maintenance sera reprise par un agent de la
collectivité, et le projet vivra plus longtemps que n'importe quelle version de framework.

**Aucune requête ne quitte le domaine au chargement** : les polices sont servies par
l'application elle-même. Le seul appel externe est l'enregistrement d'une demande, au
moment où le visiteur clique.

Les 52 offres du Département sont récupérées chaque nuit par un robot, mais **ne sont pas
affichées** : elles servent uniquement à savoir si chaque fiche est encore en ligne et
jusqu'à quand. Sans cela, l'application enverrait des visiteurs vers des candidatures
closes — 4 des 7 le sont déjà.

---

## Points ouverts

- **Registre des demandes à raccorder** : un fichier Excel sur le OneDrive du Département et
  un flux Power Automate — voir [`docs/REGISTRE.md`](docs/REGISTRE.md), une vingtaine de
  minutes. Tant qu'il ne l'est pas, l'application le dit à l'écran et invite le visiteur à se
  signaler auprès d'un agent : elle ne laisse jamais croire à un enregistrement qui n'a pas eu
  lieu.
- **Logo officiel** — les icônes sont provisoires, le SVG reste à réclamer.
- **Contact DPO** à renseigner, et inscription du traitement au registre (voir `docs/RGPD.md`).
- **3 fiches sur 7 sont encore en ligne** ; 4 offres DCIP publiées n'ont pas de fiche.
  Arbitrage DCIP.
- Le dépôt est sous un **compte personnel**. Un transfert vers une organisation du
  Département changera les URL, donc les QR codes.

## Documentation

- [`docs/REGISTRE.md`](docs/REGISTRE.md) — le tableau des demandes et le récapitulatif quotidien
- [`docs/EXPLOITATION.md`](docs/EXPLOITATION.md) — mettre à jour le contenu, le robot, le cache
- [`docs/RGPD.md`](docs/RGPD.md) — données personnelles, conservation, arbitrage DPO
- [`docs/ACCESSIBILITE.md`](docs/ACCESSIBILITE.md) — ce qui a été contrôlé, et ce qui ne l'a pas été
- [`docs/CHARTE.md`](docs/CHARTE.md) — les deux chartes graphiques

---

Réalisé par **CONNECT 3S** — Cagnes-sur-Mer (06) — connect3s.fr
