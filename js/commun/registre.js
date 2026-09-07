/* ==========================================================================
   registre.js — Enregistrement des demandes d'information
   --------------------------------------------------------------------------
   Le visiteur laisse ses coordonnées sur une fiche de poste ; la demande part
   dans un tableau tenu côté serveur, et une personne reçoit en fin de journée
   le récapitulatif de toutes les demandes du jour.

   OÙ VONT LES DONNÉES. Dans un **fichier Excel partagé du Département**, sur
   son OneDrive. Rien n'est conservé ici : ni dans ce dépôt, ni dans
   l'application, ni sur le navigateur du visiteur au-delà de l'envoi. La
   demande traverse le navigateur et part directement vers le fichier du
   Département, qui en reste seul détenteur.

   COMMENT. Un site statique ne peut pas écrire dans un OneDrive : il faudrait
   un secret Microsoft dans le code, or ce code est servi en clair. On passe
   donc par un **flux Power Automate** côté Département : l'application envoie
   la demande à l'adresse du flux, le flux ajoute la ligne dans le fichier.
   Rien de sensible ne circule dans l'application — l'adresse du flux ne
   permet que d'ajouter une ligne, jamais de lire le fichier.

   L'adresse du flux vit dans data/config.json → registre.endpoint. Tant
   qu'elle est vide, l'application le dit franchement plutôt que de laisser
   croire à un enregistrement qui n'a pas lieu.

   RGPD : le fichier appartient au Département et relève de sa responsabilité
   de traitement. Voir docs/RGPD.md.
   ========================================================================== */

import { chargerConfig } from './offers.js';
import {
  empilerEnvoi, depilerEnvoi, fileEnvois, envoiAutorise, enregistrerEnvoi,
} from './store.js';

const DELAI_MINIMUM_MS = 3000;
const TIMEOUT_MS = 12000;

/* =========================================================================
   1. Validation du formulaire
   ========================================================================= */

export function adresseValide(adresse) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(adresse || '').trim());
}

/**
 * Contrôle les champs dans l'ordre où l'utilisateur les lit.
 * Renvoie `null` si tout va bien, sinon `{ champ, message }` — le champ sert
 * à porter le focus et `aria-invalid` sur le bon élément.
 *
 * Prénom, nom, direction et adresse sont tous obligatoires : la DCIP doit
 * savoir qui demande, depuis quelle direction, et comment le joindre.
 */
export function verifierFormulaire({ prenom, nom, direction, email, consentement, piege, ouvertDepuisMs }) {
  if (piege) return { champ: null, message: 'ROBOT' };

  const vide = (v) => !String(v || '').trim();
  if (vide(prenom)) return { champ: 'prenom', message: 'Merci d’indiquer votre prénom.' };
  if (vide(nom)) return { champ: 'nom', message: 'Merci d’indiquer votre nom.' };
  if (vide(direction)) return { champ: 'direction', message: 'Merci d’indiquer votre direction actuelle.' };
  if (!adresseValide(email)) {
    return { champ: 'email', message: 'Cette adresse électronique ne semble pas valide.' };
  }
  if (!consentement) {
    return { champ: 'rgpd', message: 'Merci d’accepter d’être recontacté(e) avant d’enregistrer votre demande.' };
  }
  if (ouvertDepuisMs < DELAI_MINIMUM_MS) {
    return { champ: null, message: 'Merci de patienter un instant avant de valider.' };
  }

  const quota = envoiAutorise();
  if (!quota.autorise) {
    return {
      champ: null,
      message: `Vous avez déjà enregistré 3 demandes depuis ce navigateur. `
             + `Réessayez dans ${quota.minutes_attente} minutes.`,
    };
  }
  return null;
}

/* =========================================================================
   2. Envoi vers le point de collecte
   ========================================================================= */

/** Compose la ligne qui sera écrite dans le tableau. */
function ligne(poste, contact) {
  const statut = poste.statut || {};
  return {
    horodatage: new Date().toISOString(),
    prenom: contact.prenom,
    nom: contact.nom,
    direction: contact.direction,
    email: contact.email,
    projet: contact.projet || '',
    message: contact.message || '',
    poste_titre: poste.titre,
    poste_service: poste.service || '',
    poste_categorie: poste.cat || '',
    poste_url: poste.url || '',
    poste_statut: statut.libelle || '',
  };
}

async function transmettre(endpoint, demande) {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), TIMEOUT_MS);
  try {
    // `text/plain` évite la requête préalable CORS. Un flux Power Automate y
    // répond, mais la requête préalable que déclencherait `application/json`
    // n'est pas toujours acceptée selon la configuration : le navigateur
    // bloquerait alors l'envoi. Le flux reçoit le corps et le parse lui-même
    // grâce au schéma déclaré sur son déclencheur.
    const reponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(demande),
      signal: arret.signal,
      redirect: 'follow',
    });
    if (!reponse.ok) return { ok: false, motif: `HTTP ${reponse.status}` };
    const donnees = await reponse.json().catch(() => ({ ok: true }));
    return donnees.ok === false
      ? { ok: false, motif: donnees.erreur || 'refus du service' }
      : { ok: true, reference: donnees.reference || '' };
  } catch (err) {
    return { ok: false, motif: err.name === 'AbortError' ? 'delai-depasse' : 'reseau' };
  } finally {
    clearTimeout(minuteur);
  }
}

/* =========================================================================
   3. Orchestration
   ========================================================================= */

/**
 * Enregistre une demande.
 *
 * Le résultat est détaillé à dessein : l'écran de confirmation doit dire ce
 * qui s'est réellement passé. Une demande qui n'a pas pu partir est mise en
 * file et rejouée au retour du réseau — on ne perd jamais une demande.
 */
export async function enregistrerDemande({ poste, contact }) {
  const config = await chargerConfig();
  const endpoint = (config.registre || {}).endpoint || '';
  const demande = ligne(poste, contact);

  if (!endpoint || endpoint === 'À_RENSEIGNER') {
    // Ce n'est pas une panne : c'est l'état normal avant que le point de
    // collecte existe. On le dit, sans faire croire à un enregistrement.
    return {
      ok: false, configure: false, misEnFile: false, demande,
      message: 'Le registre des demandes n’est pas encore raccordé sur ce stand. '
             + 'Signalez-vous auprès d’un agent : votre demande sera notée à la main.',
    };
  }

  const resultat = await transmettre(endpoint, demande);

  if (!resultat.ok) {
    empilerEnvoi({ poste, contact });
    return {
      ok: false, configure: true, misEnFile: true, demande, motif: resultat.motif,
      message: 'Votre demande est conservée et sera transmise dès le retour du réseau. '
             + 'Vous pouvez fermer cette page.',
    };
  }

  enregistrerEnvoi();
  return {
    ok: true, configure: true, misEnFile: false, demande, reference: resultat.reference,
    message: 'Votre demande est enregistrée. La DCIP vous recontacte dans les meilleurs délais.',
  };
}

/* =========================================================================
   4. Rejeu de la file au retour du réseau
   ========================================================================= */

let rejeuEnCours = false;

export async function rejouerFile() {
  if (rejeuEnCours || !navigator.onLine) {
    return { rejouees: 0, restantes: fileEnvois().length };
  }
  rejeuEnCours = true;
  const config = await chargerConfig();
  const endpoint = (config.registre || {}).endpoint || '';
  let rejouees = 0;

  try {
    if (!endpoint || endpoint === 'À_RENSEIGNER') {
      return { rejouees: 0, restantes: fileEnvois().length };
    }
    for (const demande of fileEnvois()) {
      const r = await transmettre(endpoint, ligne(demande.poste, demande.contact));
      if (!r.ok) break;              // inutile d'insister sur les suivantes
      depilerEnvoi(demande.id_file);
      rejouees += 1;
    }
  } finally {
    rejeuEnCours = false;
  }
  return { rejouees, restantes: fileEnvois().length };
}

/** Branche le rejeu automatique. À appeler une fois, au démarrage. */
export function activerRejeuAutomatique(surRejeu) {
  const tenter = async () => {
    const bilan = await rejouerFile();
    if (bilan.rejouees > 0 && typeof surRejeu === 'function') surRejeu(bilan);
  };
  window.addEventListener('online', tenter);
  if (navigator.onLine && fileEnvois().length > 0) tenter();
}

/** Nombre de demandes encore en attente — affiché sur l'écran de confirmation. */
export function enAttente() {
  return fileEnvois().length;
}
