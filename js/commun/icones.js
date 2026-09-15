/* ==========================================================================
   icones.js — Jeu d'icônes tracées, grille 24, trait 1.75
   --------------------------------------------------------------------------
   Transposé tel quel depuis design/icones.mjs : maquettes et application
   partagent le même jeu, pour qu'un ajout ne diverge pas entre les deux.

   Les fichiers sources utilisaient des émojis comme repères de service
   (⚡ 🏫 🔒 📐). Des tracés se recolorent avec le thème, restent nets à
   l'impression et ne dépendent pas de la police émoji du téléphone.
   Ils sont toujours décoratifs (aria-hidden) et doublés d'un libellé.
   ========================================================================== */

const svg = (contenu, t = 24, trait = 1.75) =>
  `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" ` +
  `stroke-width="${trait}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${contenu}</svg>`;

export const ICONES = {
  // Services de la DCIP
  energie:    (t) => svg('<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z"/>', t),
  etudes:     (t) => svg('<path d="M3 19 19 3l2.5 2.5L5.5 21.5 3 19Z"/><path d="M15.5 6.5 18 9"/><path d="M12 10l1.6 1.6"/><path d="M8.5 13.5 10 15"/>', t),
  batiments:  (t) => svg('<path d="M3.5 21V6.5l7-3.5v18"/><path d="M10.5 10.5H20V21"/><path d="M6 8.5h1.5"/><path d="M6 12.5h1.5"/><path d="M6 16.5h1.5"/><path d="M14 14h2.5"/><path d="M14 17.5h2.5"/>', t),
  colleges:   (t) => svg('<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9.5 21v-5h5v5"/><path d="M9.5 12h5"/>', t),
  surete:     (t) => svg('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><circle cx="12" cy="15.5" r="1.2"/>', t),

  // Thèmes de quiz
  flamme:     (t) => svg('<path d="M12 2.5s5.5 4.4 5.5 9.6a5.5 5.5 0 1 1-11 0C6.5 8.5 9 6.5 9 6.5s.5 2.5 2 3c1-2 1-5 1-7Z"/><path d="M12 20a2.6 2.6 0 0 1-1.4-4.8c0-1.6 1.4-2.6 1.4-2.6s1.4 1 1.4 2.6A2.6 2.6 0 0 1 12 20Z"/>', t),
  bouclier:   (t) => svg('<path d="M12 2.8 4.5 6v6c0 4.6 3.2 8 7.5 9.2 4.3-1.2 7.5-4.6 7.5-9.2V6L12 2.8Z"/><path d="m9 12 2.2 2.2L15.5 10"/>', t),
  camera:     (t) => svg('<path d="M3 8.5h11.5v7H3z"/><path d="m14.5 12 6-3v9l-6-3"/><circle cx="7" cy="12" r="1.6"/>', t),

  // Navigation
  accueil:    (t) => svg('<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.75 20v-5.5h4.5V20"/>', t),
  metiers:    (t) => svg('<path d="M4 5.5h16"/><path d="M4 12h16"/><path d="M4 18.5h16"/><circle cx="8" cy="5.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="10" cy="18.5" r="1.8" fill="currentColor" stroke="none"/>', t),
  quiz:       (t) => svg('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 4"/><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"/>', t),
  postes:     (t) => svg('<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5"/><path d="M3 13h18"/>', t),
  selection:  (t) => svg('<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1Z"/>', t),

  // Interface
  chevron:    (t) => svg('<path d="m9 5 7 7-7 7"/>', t),
  retour:     (t) => svg('<path d="m15 5-7 7 7 7"/>', t),
  coche:      (t) => svg('<path d="m5 12.5 4.5 4.5L19 7"/>', t, 2.2),
  croix:      (t) => svg('<path d="M6 6l12 12M18 6 6 18"/>', t, 2.2),
  plus:       (t) => svg('<path d="M12 5v14M5 12h14"/>', t, 2),
  alerte:     (t) => svg('<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.4" r="1" fill="currentColor" stroke="none"/>', t),
  horsligne:  (t) => svg('<path d="M2 4l20 16"/><path d="M5 12.5a10 10 0 0 1 3.5-2.3"/><path d="M1.5 8.5a15 15 0 0 1 5-3.2"/><path d="M17.5 8.5a15 15 0 0 0-6-3"/><path d="M19 12.5a10 10 0 0 0-2-1.6"/><circle cx="12" cy="18.5" r="1.2" fill="currentColor" stroke="none"/>', t),
  courriel:   (t) => svg('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', t),
  telecharger:(t) => svg('<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4 4.5-4"/><path d="M4 19.5h16"/>', t),
  recherche:  (t) => svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', t),
  filtre:     (t) => svg('<path d="M3 6h18"/><path d="M6.5 12h11"/><path d="M10 18h4"/>', t),
  horloge:    (t) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.2 2"/>', t),
  lieu:       (t) => svg('<path d="M12 21s6.5-5.4 6.5-10.2a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z"/><circle cx="12" cy="10.6" r="2.4"/>', t),
  diplome:    (t) => svg('<path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z"/><path d="M6.5 10.8v4.4c0 1.6 2.5 2.8 5.5 2.8s5.5-1.2 5.5-2.8v-4.4"/>', t),
  lien:       (t) => svg('<path d="M14 11a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/><path d="M10 13a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1 1"/>', t),
  etincelle:  (t) => svg('<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z"/>', t),
};

/** Rend une icône. Renvoie une chaîne vide si le nom est inconnu, plutôt que
    de casser le rendu de toute une vue pour une icône manquante. */
export function ico(nom, taille = 20) {
  const f = ICONES[nom];
  if (!f) {
    console.warn(`[icones] « ${nom} » inconnue`);
    return '';
  }
  return f(taille);
}

/** Icône de service, déduite du nom du service tel qu'il figure dans les fiches. */
const PAR_SERVICE = {
  'Énergie et fluides': 'energie',
  'Études et travaux': 'etudes',
  'Maintenance des bâtiments': 'batiments',
  'Maintenance des collèges': 'colleges',
  'Sécurité, Sûreté & Prévention': 'surete',
};
export function icoService(service, taille = 20) {
  return ico(PAR_SERVICE[service] || 'postes', taille);
}
