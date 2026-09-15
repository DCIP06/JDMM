/* ==========================================================================
   offers.js — Chargement des offres d'emploi et calcul de leur fraîcheur
   --------------------------------------------------------------------------
   Source : data/offers.json, régénéré chaque nuit par la GitHub Action
   « Synchronisation des offres » (scripts/sync_offers.py).

   Principe posé au §6 du cahier des charges : l'application ne se substitue
   pas au site du Département, elle y renvoie. Chaque offre conserve donc
   toujours son lien vers la fiche officielle, et l'âge de la donnée est
   affiché plutôt que masqué.
   ========================================================================== */

/* Chemins résolus depuis l'emplacement de CE module, pas depuis la page :
   les deux applications sont servies depuis /postes/ et /quiz/, à des
   profondeurs différentes, et un chemin « ./data/… » y serait faux. */
const DONNEES = (nom) => new URL(`../../data/${nom}`, import.meta.url).href;
const CHEMIN_OFFRES = DONNEES('offers.json');
const CHEMIN_DETAILS = DONNEES('offers-details.json');
const CHEMIN_POSTES = DONNEES('postes-dcip.json');
const CHEMIN_CONFIG = DONNEES('config.json');

/** Cache mémoire : les vues peuvent appeler ces fonctions plusieurs fois par navigation. */
let cacheOffres = null;
let cachePostes = null;
let cacheConfig = null;
let cacheDetails = null;
let promesseDetails = null;

/* -------------------------------------------------------------------------
   Chargement
   ------------------------------------------------------------------------- */

async function chargerJSON(chemin) {
  const reponse = await fetch(chemin, { cache: 'no-cache' });
  if (!reponse.ok) throw new Error(`${chemin} : HTTP ${reponse.status}`);
  const donnees = await reponse.json();
  // Le service worker marque les réponses servies hors ligne (voir sw.js).
  return { donnees, depuisCache: reponse.headers.get('X-Servi-Depuis-Cache') === '1' };
}

export async function chargerConfig() {
  if (cacheConfig) return cacheConfig;
  try {
    const { donnees } = await chargerJSON(CHEMIN_CONFIG);
    cacheConfig = donnees;
  } catch (err) {
    console.error('[offers] config.json illisible', err);
    cacheConfig = {};   // l'application doit démarrer même sans configuration
  }
  return cacheConfig;
}

/**
 * Charge les 7 fiches DCIP — la source de vérité rédactionnelle, écrite à la
 * main et versionnée. Elles restent affichables même si le scraper est en panne.
 */
export async function chargerPostesDcip() {
  if (cachePostes) return cachePostes;
  try {
    const { donnees } = await chargerJSON(CHEMIN_POSTES);
    cachePostes = Array.isArray(donnees) ? donnees : (donnees.postes || []);
  } catch (err) {
    console.warn('[offers] postes-dcip.json indisponible', err);
    cachePostes = [];
  }
  return cachePostes;
}

/**
 * Charge les offres du Département.
 * Ne lève jamais : en cas d'échec total, renvoie une charge vide accompagnée
 * d'un indicateur `erreur`, à charge pour la vue d'afficher un message honnête
 * plutôt qu'une liste vide sans explication.
 */
export async function chargerOffres() {
  if (cacheOffres) return cacheOffres;
  try {
    const { donnees, depuisCache } = await chargerJSON(CHEMIN_OFFRES);
    cacheOffres = {
      ...donnees,
      offers: Array.isArray(donnees.offers) ? donnees.offers : [],
      depuisCache,
      erreur: null,
    };
  } catch (err) {
    console.error('[offers] offers.json indisponible', err);
    cacheOffres = {
      generated_at: null, source: '', count: 0, count_dcip: 0,
      offers: [], depuisCache: false, erreur: err.message,
    };
  }
  return cacheOffres;
}

/**
 * Charge le corps des fiches d'offres — 296 ko, contre 44 ko pour la liste.
 * Volontairement séparé et chargé à la demande : l'accueil et la liste n'en
 * ont pas besoin, et le télécharger d'emblée coûtait plusieurs secondes de
 * chargement initial sur un réseau de hall d'exposition.
 *
 * Renvoie null si le fichier est indisponible : la fiche affiche alors le
 * résumé et renvoie vers le site du Département, plutôt que de rester vide.
 */
export async function chargerDetail(id) {
  if (!cacheDetails) {
    if (!promesseDetails) {
      promesseDetails = chargerJSON(CHEMIN_DETAILS)
        .then(({ donnees }) => { cacheDetails = donnees.details || {}; })
        .catch((err) => {
          console.warn('[offers] offers-details.json indisponible', err);
          cacheDetails = {};
        });
    }
    await promesseDetails;
  }
  return cacheDetails[id] || null;
}

/** Force un rechargement (bouton « Actualiser » de la vue Postes). */
export function invaliderCache() {
  cacheOffres = null;
  cacheDetails = null;
  promesseDetails = null;
}

/* -------------------------------------------------------------------------
   Fraîcheur
   ------------------------------------------------------------------------- */

/**
 * Qualifie l'âge du fichier d'offres.
 * Au-delà du seuil de config.json (72 h par défaut), la vue affiche un bandeau
 * invitant à consulter le site du Département : mieux vaut avouer une donnée
 * vieillissante que de la présenter comme courante.
 */
export function evaluerFraicheur(charge, seuilHeures = 72) {
  if (!charge || !charge.generated_at) {
    return { connue: false, perimee: true, libelle: 'Date de mise à jour inconnue' };
  }
  const genere = new Date(charge.generated_at);
  if (Number.isNaN(genere.getTime())) {
    return { connue: false, perimee: true, libelle: 'Date de mise à jour illisible' };
  }

  const heures = (Date.now() - genere.getTime()) / 3_600_000;
  const jourMois = genere.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

  return {
    connue: true,
    date: genere,
    heures: Math.round(heures),
    perimee: heures > seuilHeures,
    // Formulation exigée au §3.2 : « Données du JJ/MM »
    libelle: heures < 24 ? "Offres mises à jour aujourd'hui" : `Offres mises à jour le ${jourMois}`,
  };
}

/* -------------------------------------------------------------------------
   Échéances
   ------------------------------------------------------------------------- */

/**
 * Statut d'une offre au regard de sa date limite.
 * Trois cas, tous rencontrés dans les données réelles :
 *  - date limite dépassée → l'offre ne doit plus être proposée à la sélection ;
 *  - pas de date limite → recrutement permanent (métiers en tension : médecin,
 *    infirmier, TOS…). Neuf offres sur quarante-six sont dans ce cas ;
 *  - date limite proche → on le signale (« plus que N jours »).
 */
export function statutEcheance(offre) {
  if (offre.candidature_permanente || !offre.deadline) {
    return { code: 'permanente', libelle: 'Candidature permanente', urgent: false, expiree: false };
  }

  const limite = new Date(`${offre.deadline}T23:59:59`);
  if (Number.isNaN(limite.getTime())) {
    return { code: 'inconnue', libelle: offre.deadline_label || '', urgent: false, expiree: false };
  }

  // L'expiration se teste sur les horodatages, pas sur un nombre de jours arrondi :
  // à 06 h du matin, une offre close la veille à 23 h 59 donnait Math.ceil(-0.25),
  // c'est-à-dire -0, qui n'est pas strictement négatif. Elle s'affichait alors
  // « Dernier jour pour postuler » alors qu'elle était close.
  const restant = limite.getTime() - Date.now();
  if (restant < 0) {
    return {
      code: 'expiree',
      libelle: `Clôturée le ${offre.deadline_label || offre.deadline}`,
      urgent: false, expiree: true,
    };
  }

  const jours = Math.ceil(restant / 86_400_000);
  if (jours <= 0) {
    return { code: 'aujourdhui', libelle: "Dernier jour pour postuler", urgent: true, expiree: false };
  }
  if (jours <= 7) {
    return { code: 'urgente', libelle: `Plus que ${jours} jour${jours > 1 ? 's' : ''}`, urgent: true, expiree: false };
  }
  return {
    code: 'ouverte',
    libelle: `Jusqu'au ${offre.deadline_label || offre.deadline}`,
    urgent: false, expiree: false,
  };
}

/* -------------------------------------------------------------------------
   Croisement fiches DCIP × offres en ligne
   ------------------------------------------------------------------------- */

/**
 * Enrichit chaque fiche DCIP de son statut réel (§6 : « encore en ligne ?
 * date limite dépassée ? »).
 *
 * L'appariement se fait sur le dernier segment de l'URL, seul identifiant
 * stable partagé entre la fiche rédigée et l'annonce publiée. Un rapprochement
 * sur l'intitulé serait fragile : les titres varient (« H/F », numéro d'offre).
 */
export function croiserPostesEtOffres(postes, charge) {
  const parCle = new Map();
  (charge.offers || []).forEach((offre) => {
    parCle.set(cleDepuisUrl(offre.url), offre);
  });

  return postes.map((poste) => {
    const offre = parCle.get(cleDepuisUrl(poste.url));
    if (!offre) {
      // La fiche existe mais l'annonce n'est plus en ligne : on l'affiche
      // quand même (elle documente le métier) en le disant clairement.
      // Le code reste `retiree` (c'est ce que l'on constate : l'annonce a
      // disparu du site) ; le libellé montré au visiteur dit « pourvu ».
      return { ...poste, en_ligne: false, offre: null, statut: { code: 'retiree', libelle: 'Poste pourvu', urgent: false, expiree: true } };
    }
    return {
      ...poste,
      en_ligne: true,
      offre,
      // Les données du site font foi sur les dates : elles sont à jour.
      deadline: offre.deadline || poste.deadline || '',
      deadline_label: offre.deadline_label || poste.deadline || '',
      statut: statutEcheance(offre),
    };
  });
}

function cleDepuisUrl(url) {
  if (!url) return '';
  return String(url).split('?')[0].replace(/\/+$/, '').split('/').pop().toLowerCase();
}
