/* ==========================================================================
   sw.js — Service worker de l'application « Métiers & Mobilité DCIP »
   --------------------------------------------------------------------------
   Deux stratégies, délibérément distinctes :

   Un seul service worker à la racine pour les DEUX applications (/postes/ et
   /quiz/) : elles partagent leurs polices, leurs feuilles de style et la
   moitié de leur code. Deux services workers auraient mis tout cela en cache
   en double.

   • APP SHELL (HTML, CSS, JS, polices, icônes) → cache d'abord.
     C'est ce qui rend l'application utilisable en mode avion, exigence du §3.2 :
     le wifi d'un hall d'exposition est toujours mauvais.

   • DONNÉES (data/*.json) → réseau d'abord, repli sur le cache.
     Les offres d'emploi doivent être fraîches quand le réseau est là. Un cache
     d'abord servirait des offres périmées pendant des jours — précisément le
     piège signalé au §10.

   L'app shell est en réalité servie en « cache puis rafraîchissement » : la
   réponse est immédiate, et la version suivante est récupérée en tâche de
   fond. Une mise en ligne est donc reçue au chargement suivant, sans qu'il
   faille penser à incrémenter CACHE_VERSION — voir cacheEtRafraichit().
   CACHE_VERSION ne sert plus qu'à purger tous les caches d'un coup, lors d'un
   changement de structure.
   ========================================================================== */

const CACHE_VERSION = 'v7';
const CACHE_SOCLE   = `jdmm-socle-${CACHE_VERSION}`;
const CACHE_DONNEES = `jdmm-donnees-${CACHE_VERSION}`;

// Chemins relatifs : l'application est servie depuis un sous-chemin sur
// GitHub Pages (/<depot>/), un chemin absolu « /index.html » y serait faux.
const RESSOURCES_SOCLE = [
  // Les deux applications, chacune sa coque et son manifeste.
  './postes/',
  './postes/index.html',
  './postes/manifest.webmanifest',
  './quiz/',
  './quiz/index.html',
  './quiz/manifest.webmanifest',
  './index.html',

  // Le socle partagé : un seul exemplaire pour les deux applications, ce qui
  // est précisément la raison d'un service worker unique à la racine.
  './css/polices.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/quiz.css',
  './css/quiz-complements.css',
  './css/quiz-clair.css',
  './themes/tokens.css',
  './themes/a.css',
  './themes/b.css',

  // Les deux faces du premier rendu. Les autres (italique, latin-ext, mono)
  // sont mises en cache à la première rencontre.
  './assets/fonts/fraunces-normal-latin.woff2',
  './assets/fonts/manrope-normal-latin.woff2',

  './js/commun/icones.js',
  './js/commun/interface.js',
  './js/commun/store.js',
  './js/commun/offers.js',
  './js/commun/registre.js',
  './js/commun/mentions.js',
  './js/postes/app.js',
  './js/quiz/app.js',
  './js/quiz/moteur.js',

  './data/config.json',
  './data/quiz.json',
  './data/postes-dcip.json',

  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/favicon-32.png',

  // La visionneuse de mentions et ses documents : une déclaration
  // d'accessibilité inaccessible hors ligne serait paradoxale.
  './mentions.html',
  './docs/RGPD.md',
  './docs/ACCESSIBILITE.md',
];

/* Volontairement ABSENT du socle : data/offers.json et data/offers-details.json.
   Le premier doit rester frais (stratégie « réseau d'abord »), le second pèse
   296 ko pour un usage que l'application n'a plus — seul le statut des sept
   fiches est consulté. */

/* -------------------------------------------------------------------------
   Installation — on précharge le socle.
   `addAll` échoue en bloc si une seule ressource manque : on ajoute donc les
   fichiers un par un et on tolère les absents (le thème B ou une vue peuvent
   ne pas encore exister à un instant donné du développement).
   ------------------------------------------------------------------------- */
self.addEventListener('install', (evenement) => {
  evenement.waitUntil((async () => {
    const cache = await caches.open(CACHE_SOCLE);
    await Promise.all(RESSOURCES_SOCLE.map(async (chemin) => {
      try {
        await cache.add(new Request(chemin, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] ressource non mise en cache :', chemin);
      }
    }));
    // Le nouveau service worker prend la main sans attendre la fermeture
    // de tous les onglets : sur un stand, personne ne ferme son navigateur.
    await self.skipWaiting();
  })());
});

/* -------------------------------------------------------------------------
   Activation — purge des caches des versions précédentes.
   ------------------------------------------------------------------------- */
self.addEventListener('activate', (evenement) => {
  evenement.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(
      noms
        .filter((nom) => nom.startsWith('jdmm-') &&
                         nom !== CACHE_SOCLE && nom !== CACHE_DONNEES)
        .map((nom) => caches.delete(nom))
    );
    await self.clients.claim();
  })());
});

/* -------------------------------------------------------------------------
   Interception des requêtes.
   ------------------------------------------------------------------------- */
self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;

  // On ne touche qu'aux lectures. Le dépôt d'une demande doit passer droit au
  // réseau — la mise en file est gérée côté application, dans registre.js.
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);

  // Requêtes vers d'autres origines : aucune au chargement, depuis que les
  // polices sont servies par l'application. Il en part au moment d'une demande
  // et depuis l'écran de suivi — on les laisse au navigateur.
  if (url.origin !== self.location.origin) return;

  // Données applicatives : réseau d'abord.
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    evenement.respondWith(reseauDAbord(requete, CACHE_DONNEES));
    return;
  }

  // Navigation (l'utilisateur ouvre ou recharge une page) : réseau d'abord pour
  // récupérer une nouvelle version, repli sur index.html mis en cache.
  if (requete.mode === 'navigate') {
    evenement.respondWith((async () => {
      try {
        return await fetch(requete);
      } catch (err) {
        const cache = await caches.open(CACHE_SOCLE);
        return (await cache.match(requete)) ||
               (await cache.match('./index.html')) ||
               new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
      }
    })());
    return;
  }

  // Les polices ne changent jamais : cache d'abord, sans rien revérifier.
  if (url.pathname.includes('/assets/fonts/')) {
    evenement.respondWith(cacheDAbord(requete, CACHE_SOCLE));
    return;
  }

  // CSS, JS et le reste de la coque : on sert le cache immédiatement ET on
  // rafraîchit en tâche de fond. Voir la note sur CACHE_VERSION ci-dessous.
  evenement.respondWith(cacheEtRafraichit(requete, CACHE_SOCLE));
});

/* -------------------------------------------------------------------------
   Stratégies
   ------------------------------------------------------------------------- */

/**
 * Sert le cache immédiatement, puis remplace l'entrée par la version du
 * réseau, sans attendre.
 *
 * POURQUOI, plutôt qu'un simple « cache d'abord » : le contenu de cette
 * application sera mis à jour par un agent de la collectivité, pas par un
 * développeur. En cache d'abord strict, toute mise en ligne serait invisible
 * pour quiconque a déjà ouvert l'application, jusqu'à ce que quelqu'un pense à
 * incrémenter CACHE_VERSION à la main — un oubli garanti, et un défaut qu'on ne
 * découvre que sur le stand.
 *
 * Ici, le premier chargement suivant une mise en ligne affiche encore
 * l'ancienne version (instantanément), et le suivant est à jour. Aucune
 * intervention. CACHE_VERSION ne sert plus qu'à purger d'un coup en cas de
 * changement de structure.
 */
async function cacheEtRafraichit(requete, nomCache) {
  const cache = await caches.open(nomCache);
  const enCache = await cache.match(requete);

  const rafraichir = fetch(requete)
    .then((reponse) => {
      if (reponse && reponse.ok) cache.put(requete, reponse.clone());
      return reponse;
    })
    .catch(() => null);

  if (enCache) {
    // On ne retient pas la réponse du réseau : elle servira au prochain appel.
    rafraichir.catch(() => {});
    return enCache;
  }
  const reponse = await rafraichir;
  return reponse || new Response('', { status: 504, statusText: 'Indisponible hors ligne' });
}

/** Sert depuis le cache ; sinon va au réseau et met en cache au passage. */
async function cacheDAbord(requete, nomCache) {
  const cache = await caches.open(nomCache);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  try {
    const reponse = await fetch(requete);
    // On ne met en cache que les réponses exploitables (les réponses opaques
    // des CDN de polices ont un status 0 : on les accepte quand même).
    if (reponse && (reponse.ok || reponse.type === 'opaque')) {
      cache.put(requete, reponse.clone());
    }
    return reponse;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Ressource indisponible hors ligne' });
  }
}

/** Va au réseau ; en cas d'échec, sert la dernière version connue. */
async function reseauDAbord(requete, nomCache) {
  const cache = await caches.open(nomCache);
  try {
    const reponse = await fetch(requete, { cache: 'no-store' });
    if (reponse && reponse.ok) {
      cache.put(requete, reponse.clone());
      return reponse;
    }
    throw new Error(`HTTP ${reponse.status}`);
  } catch (err) {
    const enCache = await cache.match(requete);
    if (enCache) {
      // L'application lit cet en-tête pour afficher « Données du JJ/MM »
      // et distinguer une donnée fraîche d'une donnée servie hors ligne.
      const entetes = new Headers(enCache.headers);
      entetes.set('X-Servi-Depuis-Cache', '1');
      return new Response(await enCache.blob(), {
        status: 200, statusText: 'OK (cache)', headers: entetes,
      });
    }
    return new Response(JSON.stringify({ erreur: 'hors-ligne', offers: [] }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

/* -------------------------------------------------------------------------
   Canal de service — l'application peut demander une purge immédiate
   (bouton « Vider le cache » de la page d'exploitation).
   ------------------------------------------------------------------------- */
self.addEventListener('message', (evenement) => {
  if (evenement.data === 'PURGER_CACHE') {
    evenement.waitUntil((async () => {
      const noms = await caches.keys();
      await Promise.all(noms.filter(n => n.startsWith('jdmm-')).map(n => caches.delete(n)));
      const clients = await self.clients.matchAll();
      clients.forEach((c) => c.postMessage('CACHE_PURGE'));
    })());
  }
  if (evenement.data === 'ACTIVER_MAINTENANT') self.skipWaiting();
});
