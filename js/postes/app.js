/* ==========================================================================
   postes/app.js — Application « Postes vacants · Mobilité interne »
   --------------------------------------------------------------------------
   Reproduction du parcours de sources/dcip_postes.html : liste filtrée par
   service → fiche complète → « Je suis intéressé(e) — recevoir la fiche » →
   formulaire → confirmation. Les intitulés, les libellés de boutons et les
   textes du formulaire sont ceux du fichier source.

   Deux écarts, tous deux imposés par les faits :

   1. Le sous-titre annonçait « Postuler avant le 31 mai 2026 ». Cette date est
      dépassée et 4 des 7 annonces ne sont plus en ligne : le compte des postes
      encore ouverts est calculé depuis data/offers.json, et chaque fiche porte
      son statut réel. Recopier la date d'origine enverrait des visiteurs vers
      des candidatures closes.
   2. Les émojis de service (⚡ 🏫 🔒 📐) sont remplacés par des tracés : ils se
      recolorent, restent nets à l'impression et ne dépendent pas de la police
      émoji du téléphone. Chaque tracé est décoratif et doublé de son libellé.
   ========================================================================== */

import {
  chargerConfig, chargerPostesDcip, chargerOffres,
  croiserPostesEtOffres, evaluerFraicheur,
} from '../commun/offers.js';
import {
  appliquerTheme, annoncer, surveillerReseau, enregistrerServiceWorker,
} from '../commun/interface.js';
import {
  enregistrerDemande, verifierFormulaire, activerRejeuAutomatique, enAttente,
} from '../commun/registre.js';
import { ico, icoService } from '../commun/icones.js';

/* Les quatre intentions de mobilité du formulaire d'origine. */
const PROJETS = [
  { id: 'curiosite', libelle: 'Curiosité', icone: 'recherche' },
  { id: 'court',     libelle: 'Court terme', icone: 'horloge' },
  { id: 'moyen',     libelle: 'Moyen terme', icone: 'etincelle' },
  { id: 'informe',   libelle: 'Me tenir informé', icone: 'courriel' },
];

/** Une valeur de config.json qui vaut encore « À_RENSEIGNER » n'est pas renseignée. */
const renseigne = (v) => Boolean(v) && v !== 'À_RENSEIGNER';

const etat = {
  config: {},
  postes: [],
  poste: null,        // fiche ouverte
  projet: null,
  ouvertA: 0,
};

/* =========================================================================
   Démarrage
   ========================================================================= */

async function demarrer() {
  appliquerTheme();

  /* Deux temps, et c'est délibéré. Attendre les offres du Département (53 ko)
     avant de rien afficher laissait l'écran vide jusqu'à 11 secondes sur le
     réseau d'un hall d'exposition : le visiteur qui scanne le QR croyait que
     la page était cassée et la rechargeait. Les fiches (17 ko) suffisent à
     afficher la liste ; les offres ne servent qu'à dire si une annonce est
     encore en ligne, et cette précision arrive quelques secondes plus tard. */
  const [config, fiches] = await Promise.all([chargerConfig(), chargerPostesDcip()]);
  etat.config = config;
  etat.charge = { offers: [], enAttente: true, depuisCache: false, erreur: null };
  etat.postes = croiserPostesEtOffres(fiches, etat.charge);

  construireEntete();
  surveillerReseau(() => etat.charge && etat.charge.depuisCache,
                   'Hors ligne — les fiches restent consultables.');
  window.addEventListener('hashchange', router);
  router();
  enregistrerServiceWorker();

  // Les statuts arrivent ensuite, et la vue affichée se remet à jour d'elle-même.
  chargerOffres().then((charge) => {
    etat.charge = charge;
    etat.postes = croiserPostesEtOffres(fiches, charge);
    if (etat.poste) etat.poste = etat.postes.find((x) => x.id === etat.poste.id) || etat.poste;
    router();
  });

  // Une demande qui n'a pas pu partir est rejouée dès que le réseau revient.
  activerRejeuAutomatique((bilan) => {
    annoncer(`${bilan.rejouees} demande${bilan.rejouees > 1 ? 's' : ''} transmise${bilan.rejouees > 1 ? 's' : ''}.`);
  });
}

/* =========================================================================
   En-tête : marque, filtres par service, date de l'événement
   ========================================================================= */

function construireEntete() {
  const ev = etat.config.evenement || {};
  document.getElementById('nav-tag').textContent =
    [ev.nom, ev.date].filter(Boolean).join(' · ');

}

/* =========================================================================
   Routage
   ========================================================================= */

const ROUTES = [
  [/^#?\/?$/,                  () => vueListe()],
  [/^#\/poste\/([\w-]+)$/,     (id) => vueFiche(id)],
  [/^#\/demande\/([\w-]+)$/,   (id) => vueFormulaire(id)],
];

function router() {
  const fragment = window.location.hash || '#/';
  const trouve = ROUTES.find(([motif]) => motif.test(fragment));
  if (!trouve) { window.location.hash = '#/'; return; }
  const params = (fragment.match(trouve[0]) || []).slice(1);
  try {
    trouve[1](...params);
  } catch (err) {
    console.error('[postes] rendu en échec', err);
    afficher('vide', `<div class="section"><div class="bandeau bandeau--alerte">
      ${ico('alerte', 16)}<span>Cette page n'a pas pu s'afficher.
      <a href="#/">Revenir à la liste</a>.</span></div></div>`);
  }
  window.scrollTo({ top: 0 });
}

/** Remplace le contenu de la coque et annonce le changement. */
function afficher(nom, html, titreAnnonce) {
  const cible = document.getElementById('vue');
  cible.innerHTML = html;
  cible.dataset.vue = nom;
  cible.classList.remove('apparait');
  void cible.offsetWidth;
  cible.classList.add('apparait');
  if (titreAnnonce) annoncer(titreAnnonce);
}

/* =========================================================================
   Vue liste
   ========================================================================= */

function vueListe() {
  const liste = etat.postes;

  // Les postes encore ouverts d'abord : un visiteur qui a trois minutes doit
  // voir en premier ce sur quoi il peut agir.
  const ordonnes = [...liste].sort((a, b) => {
    const rang = (p) => (p.statut && p.statut.expiree ? 1 : 0);
    return rang(a) - rang(b) || a.titre.localeCompare(b.titre, 'fr');
  });

  // Tant que les offres ne sont pas arrivées, on compte les fiches — annoncer
  // des postes « ouverts » sans l'avoir vérifié serait une affirmation gratuite.
  const enAttente = Boolean(etat.charge && etat.charge.enAttente);
  const ouverts = etat.postes.filter((p) => !(p.statut && p.statut.expiree)).length;
  const f = evaluerFraicheur(etat.charge, (etat.config.offres || {}).fraicheur_alerte_heures ?? 72);

  afficher('liste', `
    <div class="hero">
      <div class="hero__interieur">
        <div>
          <p class="hero-pill">Postes vacants · Mobilité interne</p>
          <h1 id="titre-liste">Rejoindre la <em>DCIP</em></h1>
          <p class="sous">${enAttente
            ? `${liste.length} fiches de poste, touchez-en une pour la découvrir`
            : `${ouverts} poste${ouverts > 1 ? 's' : ''} ouvert${ouverts > 1 ? 's' : ''}
               à la mobilité, touchez une fiche pour la découvrir`}</p>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="entete-liste">
        <h2>Tous les postes</h2>
        <p class="texte-faible">${enAttente ? `${liste.length} fiches`
          : `${ouverts} poste${ouverts > 1 ? 's' : ''} de mobilité interne`}</p>
      </div>

      ${etat.charge.erreur ? `
        <div class="bandeau bandeau--alerte" style="margin-bottom:var(--pas-3)">
          ${ico('alerte', 16)}<span>Impossible de vérifier si les annonces sont encore
          en ligne. Les fiches ci-dessous restent consultables.</span></div>`
        : `<p class="texte-faible" style="margin-bottom:var(--pas-3)">${
            enAttente ? 'Vérification des annonces en cours…' : f.libelle}</p>`}

      <div class="pile-serree" role="list">
        ${ordonnes.length ? ordonnes.map(ligne).join('')
          : `<p class="vide">Aucun poste vacant actuellement.</p>`}
      </div>
    </div>`, `${liste.length} postes affichés`);
}

function ligne(p) {
  const s = p.statut || {};
  // Pas de badge tant que le statut n'est pas vérifié : un badge énigmatique
  // vaut moins que pas de badge, et la ligne de métadonnées le dit déjà.
  /* Un seul mot pour tout poste ouvert : « Disponible ». Le badge répond à une
     seule question — puis-je m'y intéresser ? Le reste (annonce publiée ou
     mobilité interne, échéance proche ou lointaine) se lit dans la ligne de
     métadonnées juste au-dessus, qui dit « Plus que 3 jours » ou « Dernier jour
     pour postuler » : l'urgence y est mieux placée, avec sa durée. */
  const etiquette = s.inconnu
    ? ''
    : (s.expiree
      ? `<span class="badge badge--neutre">${s.code === 'retiree' ? 'Pourvu' : 'Close'}</span>`
      : `<span class="badge badge--succes">Disponible</span>`);
  return `
    <div role="listitem">
      <a class="poste-row" href="#/poste/${p.id}">
        <span class="pastille-service" aria-hidden="true">${icoService(p.service, 20)}</span>
        <span class="poste-row__info">
          <span class="poste-row__titre">${p.titre}</span>
          <span class="poste-row__svc">Service ${p.service}</span>
          <span class="metas">
            <span class="meta">${ico('diplome', 14)} ${p.cat}</span>
            <span class="meta">${ico('lieu', 14)} ${p.lieu}</span>
            <span class="meta">${ico(s.expiree ? 'alerte' : 'horloge', 14)} ${s.libelle || ''}</span>
          </span>
        </span>
        <span class="poste-row__tags">${etiquette}</span>
        <span class="poste-row__fleche" aria-hidden="true">${ico('chevron', 18)}</span>
      </a>
    </div>`;
}

/* =========================================================================
   Vue fiche
   ========================================================================= */

function vueFiche(id) {
  const p = etat.postes.find((x) => x.id === id);
  if (!p) { window.location.hash = '#/'; return; }
  etat.poste = p;
  const s = p.statut || {};

  const bloc = (titre, items, icone) => (items || []).length ? `
    <section aria-labelledby="t-${icone}">
      <h3 class="surtitre" id="t-${icone}">${titre}</h3>
      <ul class="points" style="margin-top:var(--pas-2)">
        ${items.map((m) => `<li>${ico(icone, 16)}<span>${m}</span></li>`).join('')}
      </ul>
    </section>` : '';

  afficher('fiche', `
    <div class="entete-detail">
      <a class="bouton-icone" href="#/" aria-label="Retour aux postes">${ico('retour', 22)}</a>
      <span class="titre">← Retour aux postes</span>
    </div>

    <div class="hero">
      <div class="hero__interieur">
        <div>
          <p class="hero-pill">Service ${p.service}</p>
          <h1>${p.titre}</h1>
          <p class="sous">${p.contrat} · ${p.lieu}</p>
        </div>
      </div>
    </div>

    <div class="section pile">
      <div class="bandeau bandeau--${s.expiree ? 'alerte' : 'info'}">
        ${ico(s.expiree ? 'alerte' : 'horloge', 16)}<span>${s.libelle || ''}</span>
      </div>

      <p class="metas">
        <span class="meta">${ico('diplome', 14)} ${p.cat}</span>
        <span class="meta">${ico('postes', 14)} ${p.filiere}</span>
        <span class="meta">${ico('lieu', 14)} ${p.lieu}</span>
      </p>

      <section aria-labelledby="t-desc">
        <h3 class="surtitre" id="t-desc">Description</h3>
        <p class="texte-doux" style="margin-top:var(--pas-2);line-height:1.6">${p.desc}</p>
      </section>

      ${bloc('Missions principales', p.missions, 'coche')}
      ${bloc('Profil recherché', p.profils, 'etincelle')}

      <div class="pile-serree" style="margin-top:var(--pas-3)">
        <a class="bouton bouton--primaire bouton--large" href="#/demande/${p.id}">
          ${ico('etincelle', 18)} Je suis intéressé(e) par ce poste</a>
        ${p.en_ligne === false ? '' : `
        <a class="bouton bouton--valide bouton--large" href="${p.url}" target="_blank" rel="noopener">
          Postuler en ligne ${ico('chevron', 16)}
          <span class="lecteur-seul">(nouvelle fenêtre, site du Département)</span></a>`}
        <a class="bouton bouton--secondaire bouton--large" href="#/">Voir les autres postes</a>
      </div>

      ${s.expiree ? `<p class="texte-faible">Cette annonce n'est plus en ligne. Vous pouvez tout
        de même vous signaler : la DCIP saura que ce métier vous intéresse et pourra vous
        prévenir de la prochaine ouverture.</p>` : ''}

      ${p.sans_annonce ? `<p class="texte-faible">Ce poste est à pourvoir${
        p.mobilite ? ` en mobilité ${p.mobilite}` : ''} et ne fait pas l'objet d'une annonce
        sur le site du Département : déclarez-vous intéressé(e) ci-dessus, la DCIP vous
        recontactera.</p>` : ''}
    </div>`, p.titre);
}

/* =========================================================================
   Vue formulaire
   ========================================================================= */

function vueFormulaire(id) {
  const p = etat.postes.find((x) => x.id === id);
  if (!p) { window.location.hash = '#/'; return; }
  etat.poste = p;
  etat.projet = null;
  etat.ouvertA = Date.now();

  const jours = (etat.config.rgpd || {}).duree_conservation_jours || 30;
  const reg = etat.config.registre || {};
  const parCourriel = !renseigne(reg.endpoint) && renseigne(reg.email_destination);

  const champ = (nom, libelle, options = {}) => `
    <div class="champ">
      <label class="champ__libelle" for="${nom}">${libelle}
        ${options.facultatif
          ? '<span class="texte-faible">(optionnel)</span>'
          : '<span class="champ__obligatoire" aria-hidden="true">*</span><span class="lecteur-seul">(obligatoire)</span>'}
      </label>
      ${options.zone
        ? `<textarea id="${nom}" name="${nom}" rows="3"
             aria-describedby="err-${nom}"></textarea>`
        : `<input type="${options.type || 'text'}" id="${nom}" name="${nom}"
             ${options.autocomplete ? `autocomplete="${options.autocomplete}"` : ''}
             ${options.type === 'email' ? 'inputmode="email" spellcheck="false"' : ''}
             ${options.exemple ? `placeholder="${options.exemple}"` : ''}
             aria-describedby="err-${nom}">`}
      <p class="champ__erreur" id="err-${nom}" hidden></p>
    </div>`;

  afficher('formulaire', `
    <div class="entete-detail">
      <a class="bouton-icone" href="#/poste/${p.id}" aria-label="Retour à la fiche">${ico('retour', 22)}</a>
      <span class="titre">← Retour à la fiche</span>
    </div>

    <div class="hero">
      <div class="hero__interieur">
        <div>
          <p class="hero-pill">Candidature · Mobilité interne</p>
          <h1>Je suis <em>intéressé(e)</em></h1>
          <p class="sous">Laissez vos coordonnées — la DCIP vous recontacte dans les meilleurs délais.</p>
        </div>
      </div>
    </div>

    <div class="section pile">
      <div class="carte carte--plate recap-poste">
        <p class="surtitre">${ico('postes', 13)} Poste sélectionné</p>
        <p class="carte__titre" style="margin-top:var(--pas-2)">${p.titre}</p>
        <p class="carte__sous">Service ${p.service}</p>
      </div>

      <form id="formulaire" novalidate class="pile">
        <div class="leurre" aria-hidden="true">
          <label for="site-web">Ne pas remplir</label>
          <input type="text" id="site-web" name="site-web" tabindex="-1" autocomplete="off">
        </div>

        <div class="duo-champs">
          ${champ('prenom', 'Prénom', { autocomplete: 'given-name' })}
          ${champ('nom', 'Nom', { autocomplete: 'family-name' })}
        </div>
        ${champ('direction', 'Direction actuelle', { autocomplete: 'organization' })}
        ${champ('email', 'Email professionnel', { type: 'email', autocomplete: 'email',
                exemple: 'prenom.nom@departement06.fr' })}
        ${champ('message', 'Message', { zone: true, facultatif: true })}

        <fieldset class="champ" style="border:none;padding:0;margin:0">
          <legend class="champ__libelle" style="padding:0">Votre projet de mobilité
            <span class="texte-faible">(optionnel)</span></legend>
          <div class="filtres" style="flex-wrap:wrap;margin-top:var(--pas-2)">
            ${PROJETS.map((x) => `
              <button type="button" class="puce" data-projet="${x.id}" aria-pressed="false">
                <span aria-hidden="true">${ico(x.icone, 14)}</span> ${x.libelle}
              </button>`).join('')}
          </div>
        </fieldset>

        <div class="carte carte--plate" style="padding:var(--pas-3)">
          <label class="case">
            <input type="checkbox" id="rgpd" name="rgpd" aria-describedby="mention-rgpd err-rgpd">
            <span class="case__texte">J'accepte d'être recontacté(e) par la DCIP pour des
              opportunités de mobilité interne
              <span class="champ__obligatoire" aria-hidden="true">*</span>
              <span class="lecteur-seul">(obligatoire)</span></span>
          </label>
          <p class="mention-rgpd" id="mention-rgpd">
            <strong>RGPD</strong> — Données traitées par la DCIP. Conservation ${jours} jours.
            Aucun traceur, aucune mesure d'audience.
            <a href="../mentions.html?doc=rgpd" target="_blank" rel="noopener">En savoir plus<span
              class="lecteur-seul"> (nouvelle fenêtre)</span></a>.
          </p>
          <p class="champ__erreur" id="err-rgpd" hidden></p>
        </div>

        <p class="champ__erreur" id="err-general" hidden></p>

        <button type="submit" class="bouton bouton--primaire bouton--large" id="envoyer">
          ${parCourriel ? 'Préparer mon message' : 'Enregistrer ma demande'}</button>
        ${parCourriel ? `<p class="texte-faible" style="text-align:center">
          Votre messagerie s'ouvrira avec le message déjà rédigé&nbsp;; vous n'aurez
          qu'à appuyer sur « Envoyer ».</p>` : ''}
        <a class="bouton bouton--secondaire bouton--large" href="#/poste/${p.id}">
          ← Retour à la fiche</a>
      </form>
    </div>`, 'Formulaire de demande');

  document.querySelectorAll('[data-projet]').forEach((b) => {
    b.addEventListener('click', () => {
      etat.projet = etat.projet === b.dataset.projet ? null : b.dataset.projet;
      document.querySelectorAll('[data-projet]').forEach((x) =>
        x.setAttribute('aria-pressed', String(x.dataset.projet === etat.projet)));
    });
  });
  document.getElementById('formulaire').addEventListener('submit', (e) => {
    e.preventDefault();
    soumettre();
  });
}

async function soumettre() {
  const valeur = (id) => (document.getElementById(id) || {}).value?.trim() || '';
  const contact = {
    prenom: valeur('prenom'),
    nom: valeur('nom'),
    direction: valeur('direction'),
    email: valeur('email'),
    message: valeur('message'),
    projet: (PROJETS.find((x) => x.id === etat.projet) || {}).libelle || '',
  };

  ['prenom', 'nom', 'direction', 'email', 'rgpd', 'general'].forEach((n) => {
    const e = document.getElementById(`err-${n}`);
    if (e) e.hidden = true;
    const c = document.getElementById(n);
    if (c) c.removeAttribute('aria-invalid');
  });

  const probleme = verifierFormulaire({
    ...contact,
    consentement: document.getElementById('rgpd').checked,
    piege: document.getElementById('site-web').value,
    ouvertDepuisMs: Date.now() - etat.ouvertA,
  });

  if (probleme && probleme.message === 'ROBOT') { vueEnvoye({ ok: true, planB: false }, contact); return; }
  if (probleme) {
    const cible = document.getElementById(`err-${probleme.champ || 'general'}`);
    cible.innerHTML = `${ico('alerte', 15)}<span>${probleme.message}</span>`;
    cible.hidden = false;
    const champ = probleme.champ && document.getElementById(probleme.champ);
    if (champ) {
      if (champ.type !== 'checkbox') champ.setAttribute('aria-invalid', 'true');
      champ.focus();
    }
    annoncer(probleme.message);
    return;
  }

  const bouton = document.getElementById('envoyer');
  bouton.disabled = true;
  const parCourriel = !renseigne((etat.config.registre || {}).endpoint)
                   && renseigne((etat.config.registre || {}).email_destination);
  bouton.innerHTML = parCourriel ? 'Ouverture de la messagerie…' : 'Enregistrement…';
  annoncer(parCourriel ? 'Ouverture de la messagerie.' : 'Enregistrement en cours.');

  const bilan = await enregistrerDemande({ poste: etat.poste, contact, config: etat.config });
  vueEnvoye(bilan, contact);
}

/* =========================================================================
   Vue confirmation
   ========================================================================= */

/**
 * L'écran dit ce qui s'est réellement passé.
 *  · enregistré        → la DCIP a la demande, elle recontacte ;
 *  · mis en file       → la demande partira au retour du réseau, rien n'est perdu ;
 *  · courriel          → le message est PRÊT, c'est le visiteur qui l'envoie ;
 *  · registre absent   → on ne fait pas croire à un enregistrement.
 */
function vueEnvoye(bilan, contact) {
  const p = etat.poste;
  const enFile = enAttente();

  const courriel = bilan.mode === 'courriel';
  const ton = bilan.ok ? 'succes' : (bilan.configure ? 'accent' : 'alerte');
  const icone = bilan.ok ? 'coche' : (courriel ? 'courriel' : (bilan.configure ? 'horloge' : 'alerte'));

  afficher('envoye', `
    <div class="section pile" style="text-align:center;padding-top:var(--pas-7)">
      <p style="display:flex;justify-content:center">
        <span class="rond-succes rond-succes--${ton}" aria-hidden="true">${ico(icone, 32)}</span>
      </p>
      <div>
        <h1>${bilan.ok ? 'Demande enregistrée&nbsp;!'
              : (courriel ? 'Dernier geste&nbsp;: envoyer le message'
              : (bilan.misEnFile ? 'Demande conservée' : 'À signaler sur place'))}</h1>
        <p class="texte-doux" style="margin-top:var(--pas-3);line-height:1.6">
          ${bilan.ok ? `Merci ${contact.prenom}. ` : ''}${bilan.message}
        </p>
      </div>

      <div class="carte carte--plate recap-poste" style="text-align:left">
        <p class="surtitre">Poste d'intérêt</p>
        <p class="carte__titre" style="margin-top:var(--pas-2)">${p.titre}</p>
        <p class="carte__sous">Service ${p.service}</p>
        <p class="carte__sous" style="margin-top:var(--pas-2)">
          ${contact.prenom} ${contact.nom} — ${contact.direction}<br>${contact.email}</p>
      </div>

      ${enFile > 1 ? `<p class="texte-faible">${enFile} demandes attendent le réseau
        sur cet appareil.</p>` : ''}

      <div class="pile-serree">
        ${courriel ? `
        <a class="bouton bouton--primaire bouton--large" href="${bilan.lien}">
          ${ico('courriel', 18)} Ouvrir le message</a>
        <p class="texte-faible">Votre messagerie ne s'est pas ouverte&nbsp;? Ce bouton la
          rouvre. Sinon, signalez-vous auprès d'un agent du stand.</p>` : ''}
        <a class="bouton bouton--${courriel ? 'secondaire' : 'primaire'} bouton--large"
           href="#/">Voir les autres postes</a>
        ${p.en_ligne === false ? '' : `
        <a class="bouton bouton--secondaire bouton--large" href="${p.url}"
           target="_blank" rel="noopener">
          ${ico('lien', 18)} Postuler en ligne
          <span class="lecteur-seul">(nouvelle fenêtre, site du Département)</span></a>`}
      </div>
    </div>`, bilan.message);

  window.scrollTo({ top: 0 });
}


/* =========================================================================
   Démarrage
   ========================================================================= */

/* Le module est chargé en différé par le navigateur (type="module") : le DOM
   peut déjà être prêt. On couvre les deux cas. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', demarrer);
} else {
  demarrer();
}
