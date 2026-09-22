# Le registre des demandes

Ce que devient une demande déposée sur le stand, et ce que la DCIP en fait.

---

## En une phrase

Le visiteur se déclare intéressé par un poste, sa demande apparaît **en direct** sur un écran
que la DCIP consulte depuis son téléphone, et le tableau se télécharge en un clic.

---

## Ce qui se passe, vu du visiteur

1. Il ouvre une fiche de poste et touche « Je suis intéressé(e) par ce poste ».
2. Il laisse son prénom, son nom, sa direction et son adresse professionnelle, accepte d'être
   recontacté, et valide.
3. L'écran confirme que sa demande est enregistrée et qu'il sera recontacté.

Aucun courriel ne lui est envoyé.

---

## Ce que voit la DCIP

**Adresse** : `https://dcip06.github.io/JDMM/suivi/`
Accès par **identifiant et mot de passe**, transmis séparément.

La page affiche, au fur et à mesure et sans qu'on ait à la recharger :

- le nombre de demandes reçues et l'heure de la dernière ;
- pour chacune : qui, de quelle direction, pour quel poste, son adresse et son message ;
- un champ pour filtrer par nom, direction ou poste.

Un bouton **« Télécharger le tableau »** produit le classeur Excel à jour à la seconde, autant
de fois qu'on veut.

> Cette page affiche des données personnelles d'agents. Ne pas la laisser ouverte sans
> surveillance sur le stand, et ne pas diffuser le mot de passe par le même canal que le lien.

---

## Où vivent les données

Sur un serveur **situé en France**, tenu par CONNECT 3S pour le compte du Département.

**Ni fichier Excel hébergé, ni OneDrive, ni service de stockage tiers.** Le classeur n'est pas
conservé quelque part : il est **fabriqué au moment du téléchargement**, à partir du registre,
et n'existe ensuite que dans les mains de la DCIP.

**Rien n'est stocké sur GitHub**, où le site est pourtant public : les pages ne font que
transmettre et afficher.

---

## Le soir de l'événement — à faire

Les demandes sont annoncées au visiteur comme conservées **la journée seulement**. Rien ne les
supprime tout seul.

1. **Télécharger le classeur** depuis l'écran de suivi, et le remettre au service concerné.
2. **Vider le registre.**
3. Inscrire la date au registre des traitements.

L'ordre compte : vider avant de télécharger perd les demandes, télécharger sans vider trahit
ce qui a été annoncé au visiteur.

---

## Si quelque chose ne va pas le jour J

**Le registre ne répond pas.** L'application le dit au visiteur au lieu de faire semblant, et
conserve sa demande sur son téléphone : elle repart d'elle-même dès que la connexion revient,
tant qu'il n'a pas fermé son navigateur.

**Rien n'est raccordé du tout.** L'application affiche alors :

> *Le registre des demandes n'est pas encore raccordé sur ce stand. Signalez-vous auprès d'un
> agent : votre demande sera notée à la main.*

Mieux vaut renvoyer vers une personne que laisser croire à un enregistrement qui n'a pas eu
lieu.

---

## Pour qui reprend le dispositif ensuite

La destination des demandes se change dans `data/config.json` → `registre` :

| Champ | Effet |
|---|---|
| `endpoint` | l'adresse du registre. Prioritaire dès qu'elle est renseignée. |
| `email_destination` | à défaut, la demande part par courriel depuis la messagerie du visiteur. |

Le module `js/commun/registre.js` envoie un JSON et attend `{"ok": true}` : changer de
destination ne demande rien d'autre que de modifier ces deux valeurs.

---

CONNECT 3S — Cagnes-sur-Mer (06) — connect3s.fr
