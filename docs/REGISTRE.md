# Le registre des demandes

Où vont les coordonnées des visiteurs intéressés par un poste, et comment
l'application les y dépose.

*Réécrit le 7 septembre 2026 — événement du mercredi 23 septembre 2026.*

---

## En une phrase

Les demandes sont écrites dans un **fichier Excel appartenant au Département**, sur son
OneDrive. **Rien n'est conservé dans l'application ni sur GitHub.**

## Ce qui se passe, vu du visiteur

Il ouvre une fiche de poste, clique **« Je suis intéressé(e) par ce poste »**, renseigne
**prénom, nom, direction et adresse** — tous obligatoires — accepte d'être recontacté, puis
clique sur **« Enregistrer ma demande »**. L'écran confirme qu'il sera recontacté dans les
meilleurs délais. Aucun courriel ne lui est envoyé.

## Le chemin des données

```
Téléphone du visiteur  ──►  flux Power Automate  ──►  Excel sur le OneDrive du Département
   (saisie du formulaire)      (du Département)           (une ligne par demande)
```

Le code de l'application, hébergé sur GitHub, ne fait que **transmettre**. Il ne garde rien :
ni fichier, ni base, ni journal. Les seules choses que le navigateur du visiteur retient sont
ses préférences d'affichage, ses scores de quiz, et — le temps d'un envoi manqué — la demande
à rejouer au retour du réseau. Rien de tout cela ne remonte nulle part.

## Pourquoi un flux et pas un accès direct au fichier

Un site statique ne peut pas écrire dans un OneDrive : il faudrait un secret Microsoft dans
le code, or ce code est **servi en clair** à quiconque ouvre la page. On passe donc par un
flux **Power Automate** hébergé côté Département.

L'adresse de ce flux figure, elle, dans le code — mais elle ne permet **que d'ajouter une
ligne**. Elle ne donne accès à rien : ni lecture du fichier, ni modification, ni suppression.
Le pire qu'un tiers puisse en faire est d'y écrire des demandes fictives.

---

## Voie 1 — le flux Power Automate (installation, une fois)

> Cette voie demande la licence **Premium** qu'exige le déclencheur HTTP. Si elle n'est pas
> disponible, sauter à la **voie 2, le courriel**, plus bas.

### 1. Le fichier Excel

Un classeur prêt à l'emploi est fourni : **`local/JDMM.xlsx`** (hors dépôt Git — un fichier
qui reçoit des données personnelles n'a rien à faire sur GitHub). Déposez-le sur le OneDrive
du Département, puis partagez-le avec les personnes de la DCIP qui doivent le consulter.

Il contient déjà la feuille **`Demandes`**, le tableau nommé **`Demandes`**, les douze
colonnes attendues et une feuille **« À lire »** qui dit aux utilisateurs ce qu'ils ne
doivent pas renommer.

Si vous préférez le créer à la main : dans la première feuille, un **tableau**
(Insertion → Tableau) avec exactement ces colonnes, dans cet ordre :

| Colonne |
|---|
| `Horodatage` |
| `Prenom` |
| `Nom` |
| `Direction` |
| `Email` |
| `Projet` |
| `Message` |
| `Poste` |
| `Service` |
| `Categorie` |
| `Statut` |
| `URL` |

> Power Automate ne sait écrire que dans un **tableau** nommé, pas dans une simple plage.
> C'est l'étape qu'on oublie. Le classeur fourni s'en charge : feuille `Demandes`,
> tableau `Demandes`. Ne les renommez pas — le flux les désigne par leur nom, et un
> renommage arrête les enregistrements **sans message d'erreur visible**.

Ajouter des colonnes de suivi **à droite** du tableau ne gêne rien. En insérer une au
milieu, si.

### 2. Le flux Power Automate

Sur <https://make.powerautomate.com>, créez un flux **instantané** :

1. Déclencheur : **When an HTTP request is received**.
2. Dans le schéma JSON attendu, collez :

```json
{
  "type": "object",
  "properties": {
    "horodatage":      { "type": "string" },
    "prenom":          { "type": "string" },
    "nom":             { "type": "string" },
    "direction":       { "type": "string" },
    "email":           { "type": "string" },
    "projet":          { "type": "string" },
    "message":         { "type": "string" },
    "poste_titre":     { "type": "string" },
    "poste_service":   { "type": "string" },
    "poste_categorie": { "type": "string" },
    "poste_statut":    { "type": "string" },
    "poste_url":       { "type": "string" }
  }
}
```

3. Action suivante : **Excel Online (Business) → Ajouter une ligne dans un tableau**.
   Choisissez le classeur, la feuille et le tableau, puis reliez chaque colonne au champ
   correspondant du déclencheur.
4. Ajoutez une action **Réponse** (Response) avec le code `200` et le corps
   `{"ok": true}` — l'application attend cette confirmation.
5. Enregistrez, puis **copiez l'URL HTTP POST** affichée sur le déclencheur.

> ⚠️ Le déclencheur « When an HTTP request is received » demande une **licence Power Automate
> Premium**. Si le Département ne l'a pas, voyez les solutions de repli en fin de document.

### 3. Raccorder l'application

Dans `data/config.json` :

```json
"registre": {
  "endpoint": "https://prod-XX.westeurope.logic.azure.com:443/workflows/……",
  "libelle_destination": "Fichier Excel partagé du Département (OneDrive)"
}
```

Poussez. Comptez une à deux minutes de déploiement, puis **dix minutes** de cache GitHub.

---

## Voie 2 — le courriel, sans licence Premium

Si le déclencheur HTTP de Power Automate n'est pas ouvert, la demande part **par courriel**
vers une boîte du Département. Trois quarts d'heure de mise en place, aucune licence.

### Ce qu'il ne faut PAS faire : mettre un compte SMTP dans l'application

C'est la première idée qui vient, et c'est une porte ouverte. L'application est servie **en
clair** depuis un dépôt **public** : un identifiant SMTP placé dans son code serait lisible
par n'importe quel visiteur, qui pourrait alors écrire **au nom du Département**. Un navigateur
ne sait d'ailleurs pas parler SMTP — il faudrait un serveur intermédiaire, donc un secret à
garder quelque part.

La voie retenue n'a **aucun secret** : le message part de la **messagerie du visiteur**.

### 1. Créer la boîte

Une adresse dédiée à l'événement, côté Département — par exemple `jdmm@departement06.fr`.
Une boîte partagée convient : plusieurs agents peuvent la relever.

### 2. Renseigner l'application

```json
"registre": {
  "endpoint": "À_RENSEIGNER",
  "email_destination": "jdmm@departement06.fr"
}
```

L'`endpoint` est prioritaire : tant qu'il vaut `À_RENSEIGNER`, c'est le courriel qui prend
le relais. L'application change alors de vocabulaire — le bouton dit **« Préparer mon
message »**, l'écran de confirmation dit que le message **reste à envoyer**, et garde un
bouton pour rouvrir la messagerie si elle ne s'est pas ouverte seule.

### 3. Facultatif — alimenter le tableau automatiquement

Les courriels ont un format fixe (`— POSTE —`, `— DEMANDEUR —`, `Direction  :`, un champ par
ligne). Un flux Power Automate déclenché **« à la réception d'un courriel »** — connecteur
Outlook **standard**, sans licence Premium — peut les découper et ajouter la ligne dans le
classeur. Sans ce flux, la boîte fait office de registre et un agent recopie.

### Ce que cette voie coûte

L'envoi appartient au visiteur : **il doit appuyer sur « Envoyer »** dans sa messagerie. Une
partie ne le fera pas. L'application ne prétend donc jamais que la demande est enregistrée —
elle dit que le message est prêt. Sur un téléphone professionnel avec Outlook configuré, le
geste est immédiat ; sur un appareil sans messagerie, le bouton de repli reste affiché et le
visiteur peut se signaler à un agent.

---

## Vérifier

1. Sur le site, enregistrez une demande de test avec vos vraies coordonnées.
2. L'écran doit dire *« Votre demande est enregistrée »* — et non *« Le registre n'est pas
   encore raccordé »*, qui signale un `endpoint` manquant.
3. Ouvrez le fichier Excel : une ligne doit être apparue, horodatée.
4. Dans Power Automate, l'historique du flux doit montrer une exécution réussie.

Par la **voie courriel**, le contrôle est le même à deux détails près : l'écran doit dire
*« Dernier geste : envoyer le message »*, et la messagerie doit s'ouvrir avec le message
déjà rédigé. Le test n'est concluant **qu'une fois le message réellement envoyé** et reçu
dans la boîte du Département.

**Faites ce test au moins deux jours avant l'événement.**

## Si le registre n'est pas raccordé le jour J

L'application ne fait pas semblant. Elle affiche :

> *Le registre des demandes n'est pas encore raccordé sur ce stand. Signalez-vous auprès d'un
> agent : votre demande sera notée à la main.*

Mieux vaut renvoyer le visiteur vers une personne que lui laisser croire à un enregistrement
qui n'a pas eu lieu.

## Si le réseau tombe pendant l'événement

La demande est **conservée sur le téléphone du visiteur** et repart automatiquement dès que
la connexion revient, tant qu'il n'a pas fermé son navigateur. L'écran le dit.

---

## Solutions de repli, si Power Automate Premium n'est pas disponible

| Solution | Ce que ça change |
|---|---|
| **Le courriel** | Retenu, et déjà implémenté : voir « Voie 2 » plus haut. Aucune licence, aucun secret, le parcours reste dans l'application jusqu'au dernier geste. |
| **Microsoft Forms** | Un formulaire Forms écrit nativement dans un Excel sur OneDrive, sans licence supplémentaire. L'application ouvrirait le formulaire au lieu d'écrire elle-même — le poste peut y être pré-rempli par l'URL. Moins intégré visuellement, mais conformité gérée par Microsoft. |
| **Saisie manuelle sur le stand** | Un agent note les demandes dans le fichier au fur et à mesure. L'application affiche déjà le message qui invite à se signaler. |
| **Une liste SharePoint** | Mêmes contraintes de licence pour l'écriture depuis l'extérieur. |

Le module `js/commun/registre.js` est agnostique : il envoie un JSON en `POST` et attend
`{"ok": true}`. Changer de destination ne demande que de modifier `registre.endpoint` — ou,
pour la voie courriel, `registre.email_destination`.

---

## Données personnelles

Le fichier contient des **données personnelles d'agents** : nom, prénom, direction, adresse
professionnelle, et l'intérêt porté à un poste — information sensible dans un contexte de
mobilité interne.

**Le Département en est seul détenteur et responsable de traitement.** L'application ne
conserve rien, GitHub ne conserve rien.

| Obligation | Ce qu'il faut faire |
|---|---|
| Accès restreint | Ne partager le fichier qu'avec les personnes qui en ont besoin |
| Conservation 30 jours | **Supprimer les lignes** à l'échéance : rien ne le fait tout seul |
| Registre des traitements | Inscrire ce traitement et l'échéance de purge |
| Hébergement | OneDrive du Département — dans son propre périmètre, ce qui simplifie l'analyse |

Voir `docs/RGPD.md`.
