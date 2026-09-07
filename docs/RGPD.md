# Protection des données personnelles

Application **Métiers & Mobilité DCIP** — Journée des Métiers et de la Mobilité, CADAM.
Département des Alpes-Maritimes — Direction de la Construction, de l'Immobilier et du Patrimoine.

*Dernière mise à jour : 4 septembre 2026.*

---

## Où vont les données

Les coordonnées des visiteurs sont écrites dans un **fichier Excel appartenant au
Département**, hébergé sur son OneDrive.

**Rien n'est conservé par l'application ni sur GitHub.** Le code, hébergé publiquement, ne
fait que transmettre : il n'a ni base de données, ni fichier, ni journal. La demande traverse
le navigateur du visiteur et part directement vers le fichier du Département.

```
Téléphone du visiteur  ──►  flux Power Automate  ──►  Excel sur le OneDrive du Département
   (saisie du formulaire)      (du Département)           (une ligne par demande)
```

Conséquence pour l'analyse : **les données restent dans le périmètre Microsoft 365 du
Département**, sous sa propre responsabilité de traitement et ses propres règles. Aucun
prestataire tiers ne s'interpose, et il n'y a pas de transfert hors des outils que le
Département utilise déjà.

### Ce qui reste à valider par le DPO

| Point | Pourquoi |
|---|---|
| Inscription du traitement au registre | Nouveau traitement, même temporaire |
| Durée de conservation et purge | 12 mois annoncés au visiteur ; **la purge du fichier n'a rien d'automatique** |
| Liste des personnes ayant accès au fichier | L'intérêt d'un agent pour un poste est sensible en mobilité interne |
| Mention d'information | Celle affichée dans le formulaire, à valider dans sa formulation |

---

## 1. Responsable du traitement

**Département des Alpes-Maritimes**
Direction des Ressources Humaines / Direction de la Construction, de l'Immobilier et du Patrimoine
CADAM — 147 boulevard du Mercantour, 06200 Nice

**Délégué à la protection des données** : `À_RENSEIGNER` (voir `data/config.json` → `rgpd.contact_dpo`)

## 2. Finalité

Permettre à un visiteur du stand de recevoir par courriel le récapitulatif des offres d'emploi
qu'il a sélectionnées, et permettre à la DCIP d'assurer le suivi de cette demande.

**Base légale** : consentement de la personne (article 6.1.a du RGPD), recueilli par une case
à cocher **non pré-cochée** avant tout envoi.

## 3. Données collectées

| Donnée | Caractère | Origine |
|---|---|---|
| Prénom | **Obligatoire** | Saisi par le visiteur |
| Nom | **Obligatoire** | Saisi par le visiteur |
| Direction d'affectation actuelle | **Obligatoire** | Saisie par le visiteur |
| Projet de mobilité | Facultatif | Choisi par le visiteur |
| Message libre | Facultatif | Saisi par le visiteur |
| Poste concerné | Déduite | La fiche ouverte au moment de la demande |
| Horodatage de la demande | Déduite | Généré à l'enregistrement |

**Aucune autre donnée n'est collectée.** Pas d'adresse IP conservée par l'application, pas de
profil, pas de données sensibles au sens de l'article 9.

## 4. Destinataires

- les agents de la DCIP à qui le **fichier Excel** est partagé, et eux seuls ;
- aucun prestataire tiers : le fichier vit dans le OneDrive du Département.

Aucun courriel n'est envoyé au visiteur, et l'application ne transmet la demande à personne
d'autre qu'au fichier du Département.

Aucune cession, aucune revente, aucun transfert à un tiers non listé ici.

## 5. Durée de conservation

**12 mois** à compter de la demande, puis suppression
(`data/config.json` → `rgpd.duree_conservation_mois`).

Cette durée couvre la campagne de mobilité interne consécutive à l'événement.

> ⚠️ **La purge n'est pas automatique.** Il faut supprimer les lignes du fichier Excel à
> l'échéance. Inscrivez cette date dans le registre des traitements. Voir `docs/REGISTRE.md`.

## 6. Droits des personnes

Droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de retrait du
consentement à tout moment, en écrivant au DPO du Département.

Le retrait du consentement ne remet pas en cause la licéité de ce qui a été envoyé avant.

## 7. Traceurs et stockage local

**Aucun cookie. Aucun traceur. Aucune mesure d'audience. Aucun service tiers chargé au démarrage.**

L'application utilise le `localStorage` du navigateur — un espace propre à l'appareil du
visiteur, que l'application ne transmet à personne — pour trois choses seulement :

| Clé | Contenu | Pourquoi |
|---|---|---|
| `jdmm.preferences` | Thème, mode haute lisibilité | Ne pas redemander à chaque visite |
| `jdmm.quiz` | Scores des quiz | Afficher sa progression |
| `jdmm.file-envois` | Demande en attente d'envoi | Rejouer l'envoi au retour du réseau |
| `jdmm.horodatages-envois` | Dates des 3 derniers envois | Limiter les abus (3 envois par heure) |

Ces informations restent sur l'appareil et **sont effaçables à tout moment** depuis
l'application (bouton « Effacer mes données ») ou en vidant les données du site dans le navigateur.

**Les polices sont servies par l'application elle-même** (`assets/fonts/`, sous licence SIL
Open Font License). Aucun appel à Google Fonts, donc aucune exposition de l'adresse IP du
visiteur à un tiers. Au chargement d'une page, **aucune requête ne quitte le domaine de
l'application** : pas de CDN, pas de police distante, pas de mesure d'audience.

La seule requête externe possible est l'envoi du formulaire, vers le prestataire de courriel,
et uniquement au moment où le visiteur clique — c'est l'objet de l'avertissement en tête de
document.

## 8. Sécurité

- Site servi exclusivement en **HTTPS** (GitHub Pages, TLS 1.3).
- Aucune donnée personnelle stockée dans le dépôt, aucune clé privée versionnée.
- L'adresse du flux de collecte figure dans le code, servi en clair, mais elle ne permet
  **que d'ajouter une ligne** : ni lecture du fichier, ni modification, ni suppression. Le
  pire qu'un tiers puisse en faire est d'y écrire des demandes fictives.
- **Aucun secret Microsoft ne figure dans le code.** C'est précisément la raison du passage
  par un flux : un accès direct au OneDrive aurait exigé d'y placer un identifiant.
- Mesures anti-abus : champ leurre, délai minimum avant soumission, plafond de 3 envois par
  navigateur et par heure.
