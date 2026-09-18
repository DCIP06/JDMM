# Déclaration d'accessibilité

Application **Métiers & Mobilité DCIP** — Journée des Métiers et de la Mobilité, CADAM.
Département des Alpes-Maritimes — Direction de la Construction, de l'Immobilier et du Patrimoine.

*Établie le 4 septembre 2026.*

---

## État de conformité

> **Statut : non audité formellement.**
> Cette application n'a pas encore fait l'objet d'un **audit RGAA 4.1 complet** par un
> auditeur. Aucun taux de conformité ne peut donc être déclaré à ce jour, et la mention
> « totalement conforme » serait abusive.

Ce qui a été fait, en revanche, est vérifiable et reproductible : des contrôles automatisés
et manuels ont été passés à chaque écran, dans les deux formats et les deux habillages. Leurs
résultats figurent ci-dessous.

---

## Ce qui a été contrôlé

### Contrôles automatisés

Moteur **axe-core**, règles WCAG 2.1 niveaux A et AA — le socle technique du RGAA 4.1.

| Périmètre | Résultat |
|---|---|
| 9 écrans × 2 formats (390 px et 1440 px) | **0 violation** |
| Les mêmes écrans en habillage B | **0 violation** |

Écrans contrôlés — application **Postes** : liste, liste filtrée par service, fiche de poste,
formulaire, formulaire en erreur. Application **Quiz** : hub, question sur fond sombre,
correction. Plus la visionneuse des mentions.

**Lighthouse**, catégorie Accessibilité :

| Profil | Score |
|---|---|
| Production, mobile | **100** |
| Local, mobile et bureau | **100** |
| Habillage B, mobile | **100** |

### Contrastes

Tous les couples texte/fond ont été **mesurés** (algorithme WCAG 2.1), pas estimés. Les ratios
sont annotés dans `themes/a.css` et `themes/b.css`, au regard de chaque valeur.

Six corrections ont été nécessaires par rapport à un usage naïf des palettes d'origine :

| Cas | Mesure | Correction |
|---|---|---|
| Ambre `#EF9F27` en texte sur fond clair | 2,1:1 | variante `#96590A` (5,4:1) créée pour les textes |
| Bleu `#378ADD` en texte courant | 3,4:1 | réservé aux bordures et icônes (seuil composants 3:1) |
| Accent sûreté `#3D6FE8` sur fond sombre | 4,29:1 | éclairci en `#4C7BEC` (5,0:1) pour les textes |
| Texte du bouton de quiz sur accent vif | 4,35:1 sur le bleu sûreté | noir pur (4,6 à 5,7:1 selon le quiz) |
| Surtitre gris de la navigation haute sur navy | 2,7:1 | rôle `--texte-inverse-doux` (9,2:1) |
| Textes secondaires du bandeau de marque | valeurs `rgba()` en dur | remplacés par le même rôle |

Les **fonds sombres des quiz** ont été vérifiés au même titre que le reste : texte principal
à 17:1, accents entre 4,6 et 5,7:1.

### Navigation au clavier

Vérifiée par test automatisé sur navigateur :

- le **lien d'évitement** est le premier élément atteint par la tabulation, et devient visible ;
- l'ordre de tabulation suit l'ordre logique (navigation, puis contenu, puis pied de page) ;
- le **focus est toujours visible** (`:focus-visible`, contour de 3 px contrasté) et n'est
  jamais supprimé ;
- la **feuille modale** des filtres piège le focus, se ferme par `Échap`, et **rend le focus
  à l'élément d'origine** ;
- les quiz acceptent les **raccourcis** `1` à `9` pour répondre et `Entrée` pour valider,
  sans détourner ces touches lorsqu'un champ de saisie a le focus.

### Autres dispositions

- HTML sémantique, titres hiérarchisés sans saut de niveau, une seule vue exposée à la fois
  (les vues inactives portent `hidden`, elles ne polluent pas l'arbre d'accessibilité).
- Quiz : `role="radiogroup"` pour une réponse unique, `role="group"` avec cases pour les
  réponses multiples ; la forme de la marque (ronde ou carrée) annonce le type de question
  avant même la consigne.
- Résultats et changements d'état annoncés par une zone `aria-live="polite"`.
- `prefers-reduced-motion` respecté : toutes les animations deviennent instantanées.
- Formulaire : `<label>` réels, jamais un placeholder seul ; `autocomplete` sur chaque champ
  (`given-name`, `family-name`, `organization`, `email`) et `inputmode="email"` ; les quatre
  champs obligatoires sont signalés en texte comme en `aria-label` ; les erreurs sont
  annoncées une par une, reliées au champ par `aria-describedby`, et le focus est porté sur
  le premier champ fautif, qui reçoit `aria-invalid`.
- **Aucune icône ne porte seule une information** : les émojis des fichiers d'origine
  (⚡ 🏫 🔒 📐) ont été remplacés par des tracés SVG décoratifs (`aria-hidden`), toujours
  accompagnés de leur libellé en texte.
- Cibles tactiles d'au moins **48 px** — au-delà des 44 px recommandés, pour un public qui
  inclut des agents de plus de 50 ans, debout, dans le bruit d'un hall.
- **Aucune requête ne quitte le domaine au chargement** : les polices sont servies par
  l'application. Un lecteur d'écran ou un navigateur derrière un filtre d'entreprise n'a donc
  aucune dépendance externe pour afficher la page.
- Aucune information transmise par la couleur seule : les états de réponse d'un quiz portent
  une icône et un libellé (« Bonne réponse », « Réponse écartée »).

---

## Ce qui n'a pas été contrôlé

Ces points doivent être levés avant de pouvoir déclarer un taux de conformité :

- **Audit RGAA 4.1 sur les 106 critères** par un auditeur. Les contrôles automatisés ne
  couvrent qu'environ un tiers des critères ; le reste demande un examen humain.
- **Tests avec des lecteurs d'écran réels** : NVDA et JAWS sous Windows, VoiceOver sous iOS.
  Les rôles ARIA ont été posés selon les spécifications, mais leur restitution effective n'a
  pas été écoutée.
- **Tests d'usage avec des personnes en situation de handicap.**
- **Zoom à 200 % et 400 %**, et affichage en mode paysage sur petit écran.
- **Documents liés** : les fiches d'offres du site du Département et les éventuels PDF de
  candidature ne relèvent pas de cette application et n'ont pas été évalués.

---

## Contenus non accessibles

Aucun contenu manquant à la date de cette déclaration.

Les couleurs des 8 services sont reprises du roll-up 60×160 cm, pour que le visiteur retrouve
le même code d'un support à l'autre. Cinq d'entre elles n'atteignent pas le seuil AA en petit
corps (de 3,0 à 3,6:1) : elles ne servent donc **que de repère décoratif** — un filet de 3 px —
et jamais à porter du texte. Le nom de chaque service est écrit en couleur de texte normale
(14,2:1), et la couleur ne transmet aucune information à elle seule.

---

## Voies de recours

Si vous constatez un défaut d'accessibilité vous empêchant d'accéder à un contenu :

1. contactez la DCIP — Affaires générales, dont l'adresse figure sur le stand et dans le
   courriel de récapitulatif, en décrivant le problème et la page concernée ;
2. si la réponse ne vous satisfait pas, signalez-le au **Défenseur des droits** :
   [formulaire en ligne](https://formulaire.defenseurdesdroits.fr/),
   ou par courrier libre et sans affranchissement à
   Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07.

---

## Reproduire ces contrôles

Les tests sont dans le dépôt et s'exécutent sans compte ni service tiers :

```bash
python3 -m http.server 8123                 # servir l'application
node scripts/recette/tester-deux-apps.mjs   # les deux parcours, de bout en bout
```

Les contrôles de navigateur (axe-core, parcours, clavier, Lighthouse) nécessitent
`playwright-core` et `chromium` ; la marche à suivre est décrite dans `docs/EXPLOITATION.md`.
