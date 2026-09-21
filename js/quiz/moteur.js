/* ==========================================================================
   quiz/moteur.js — Le hub et les trois quiz
   --------------------------------------------------------------------------
   Design et balisage repris de sources/quiz-hub-mobile.html : le hub sur fond
   clair, puis un panneau sombre par quiz — intro, questions, résultats. Les
   classes sont celles du fichier source, et css/quiz.css en reprend le style
   (voir scripts/extraire_css_quiz.py).

   Un seul moteur pour les trois quiz. Le fichier source en avait trois copies
   préfixées QF_, QG_ et QS_, d'où trois occasions de diverger — et elles
   avaient divergé : les écrans d'intro annonçaient 9, 8 et 8 questions pour
   des tableaux de 8, 6 et 6. Ici, tout nombre affiché est calculé.
   ========================================================================== */

import { enregistrerResultatQuiz, obtenirResultatsQuiz } from '../commun/store.js';
import { annoncer } from '../commun/interface.js';

let catalogue = null;
let config = {};

export function memoriserConfig(c) { config = c || {}; }

async function charger() {
  if (catalogue) return catalogue;
  try {
    // La page a pu lancer la requête avant que ce module n'existe : on reprend
    // sa promesse plutôt que de redemander le fichier (voir quiz/index.html).
    const chemin = new URL('../../data/quiz.json', import.meta.url);
    const avance = (window.__donneesPrechargees || {})['quiz.json'];
    if (avance) delete window.__donneesPrechargees['quiz.json'];
    const reponse = avance
      ? await avance.catch(() => fetch(chemin, { cache: 'no-cache' }))
      : await fetch(chemin, { cache: 'no-cache' });
    const brut = await reponse.json();
    // Le fichier porte les textes du hub ET les quiz ; une ancienne version
    // n'était qu'un tableau, on l'accepte encore.
    catalogue = Array.isArray(brut) ? { hub: {}, quiz: brut } : brut;
  } catch (err) {
    console.error('[quiz] quiz.json illisible', err);
    catalogue = { hub: {}, quiz: [] };
  }
  return catalogue;
}

/* =========================================================================
   Le hub
   ========================================================================= */

export async function rendreHub(cible) {
  const { hub, quiz } = await charger();
  cible.className = 'hub';
  delete cible.dataset.quiz;

  if (!quiz.length) {
    cible.innerHTML = `<p class="hub-select">Les quiz ne sont pas disponibles pour le moment.</p>`;
    return;
  }

  const ev = config.evenement || {};
  const resultats = obtenirResultatsQuiz();

  cible.innerHTML = `
    <div class="hub-tag"><span class="dot" aria-hidden="true"></span>DCIP ·
      ${ev.nom || 'Journée des Métiers et de la Mobilité'} · ${ev.date || ''}</div>
    <div class="hub-eyebrow">${hub.eyebrow || 'Quiz interactif'}</div>
    <h1 class="hub-title">${hub.titre_html || 'Testez vos connaissances'}</h1>
    ${hub.jouer ? `<p class="hub-play">${hub.jouer}</p>` : ''}
    <p class="hub-select">${hub.choisir || '— Sélectionnez votre quiz —'}</p>

    <div class="quiz-grid">
      ${quiz.map((q) => carte(q, resultats[q.id])).join('')}
    </div>

    <div class="hub-foot">
      <span>DCIP — Construction, Immobilier et Patrimoine</span>
      <span>Département des Alpes-Maritimes</span>
    </div>`;
}

function carte(q, resultat) {
  // Le nombre de questions est calculé, jamais recopié.
  const fait = resultat
    ? `<span class="card-score">Meilleur score : ${resultat.meilleur}/${q.questions.length}</span>`
    : '';
  return `
    <a class="quiz-card card-${q.id}" href="#/${q.id}">
      <span class="card-ico" aria-hidden="true">${q.ico}</span>
      <span class="card-cat">${q.categorie}</span>
      <span class="card-title">${q.titre}</span>
      <span class="card-desc">${q.accroche}</span>
      <span class="card-meta">
        <span>${q.questions.length} questions</span>
        <span>${q.duree_carte || q.meta.duree}</span>
        ${fait}
      </span>
      <span class="card-btn">Commencer <span class="arr" aria-hidden="true">→</span></span>
    </a>`;
}

/* =========================================================================
   Un quiz : intro, questions, résultats
   ========================================================================= */

let partie = null;

export async function rendrePartie(cible, id) {
  const quiz = (await charger()).quiz.find((q) => q.id === id);
  if (!quiz) { window.location.hash = '#/'; return; }

  partie = { quiz, index: 0, score: 0, choix: new Set(), validee: false, reponses: [] };

  cible.className = 'quiz';
  cible.dataset.quiz = quiz.id;
  intro(cible);
}

/**
 * Remonte en haut à chaque changement d'écran.
 * Le routeur ne le fait qu'au changement d'adresse ; or intro → question →
 * résultats se succèdent sans quitter la route. Sans cela, l'écran de
 * résultats s'ouvrait à la position où l'on avait laissé la dernière
 * question, et le bouton de retour, en position fixe, masquait le score.
 */
function remonter() {
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/** Coque commune aux trois écrans d'un quiz.
 *
 * La marque vient du quiz, elle n'est pas écrite ici : le hub couvre quatre
 * services et la coque annonçait « Sécurité, Sûreté & Prévention » sur les
 * quatre — un visiteur du quiz Études & Travaux lisait le nom d'un service
 * qui n'est pas le sien, de l'intro jusqu'à l'écran de résultats. */
function coque(quiz, contenu) {
  return `
    <a class="qz-back" href="#/">← Tous les quiz</a>
    <div class="container">
      <div class="brand-row"><span class="dot" aria-hidden="true"></span>${quiz.marque}</div>
      ${contenu}
      <div class="footer-note">
        ${(quiz.pied || []).map((x) => `<span>${x}</span>`).join('')}
      </div>
    </div>`;
}

/* --- Écran d'intro --------------------------------------------------------- */

function intro(cible) {
  const q = partie.quiz;
  const cases = [
    ['Questions', q.questions.length],     // calculé, pas recopié
    ['Durée', q.meta.duree],
    ['Niveau', q.meta.niveau],
    ['Cadre', q.meta.cadre],
  ];

  cible.innerHTML = coque(q, `
    <section class="intro fade-in">
      <div class="eyebrow">Quiz interactif</div>
      <h1>${q.intro_titre_html || q.titre}</h1>
      <p class="lead">${q.intro_lead_html || q.description}</p>
      <div class="meta-grid">
        ${cases.map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join('')}
      </div>
      <button type="button" class="btn" id="qz-commencer">
        Commencer le quiz <span class="arrow" aria-hidden="true">→</span>
      </button>
    </section>`);

  document.getElementById('qz-commencer').addEventListener('click', () => {
    partie.index = 0;
    partie.score = 0;
    partie.reponses = [];
    question(cible);
  });
  remonter();
  annoncer(`${q.titre}. ${q.questions.length} questions.`);
}

/* --- Écran de question ------------------------------------------------------ */

function question(cible) {
  const { quiz, index } = partie;
  const item = quiz.questions[index];
  const total = quiz.questions.length;
  const multi = item.multi === true;
  partie.choix = new Set();
  partie.validee = false;

  cible.innerHTML = coque(quiz, `
    <section class="quiz-section fade-in">
      <div class="quiz-header">
        <span class="counter">Question <strong>${index + 1}</strong> / <span>${total}</span></span>
        <span class="category" id="qz-cat">${item.cat}</span>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}"
           aria-valuenow="${index + 1}" aria-label="Progression dans le quiz">
        <div class="progress-bar" style="width:${(index / total) * 100}%"></div>
      </div>

      <div id="qz-question">
        <div class="category">${item.cat}</div>
        <h2 class="question" id="qz-intitule">${item.q}</h2>
        <div class="options" role="${multi ? 'group' : 'radiogroup'}" aria-labelledby="qz-intitule">
          ${item.options.map((opt, i) => `
            <button type="button" class="option" data-i="${i}"
                    role="${multi ? 'checkbox' : 'radio'}" aria-checked="false">
              <span class="marker" aria-hidden="true">${String.fromCharCode(65 + i)}</span>
              <span>${opt}</span>
            </button>`).join('')}
        </div>
        ${multi ? `<p class="consigne-multi">Plusieurs réponses sont attendues — validez quand vous avez terminé.</p>` : ''}
        <div class="feedback" id="qz-feedback" aria-live="polite">
          <div class="feedback-label" id="qz-feedback-label"></div>
          <p id="qz-feedback-texte"></p>
        </div>
      </div>

      <div class="nav-row">
        ${multi ? `<button type="button" class="btn" id="qz-valider" disabled>
          Valider mes réponses <span class="arrow" aria-hidden="true">→</span></button>` : ''}
        <button type="button" class="btn secondary hidden" id="qz-suivant">
          ${index === total - 1 ? 'Voir mon résultat' : 'Question suivante'}
          <span class="arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </section>`);

  cible.querySelectorAll('.option').forEach((b) => {
    b.addEventListener('click', () => choisir(cible, Number(b.dataset.i)));
  });
  const valider = document.getElementById('qz-valider');
  if (valider) valider.addEventListener('click', () => corriger(cible));
  document.getElementById('qz-suivant').addEventListener('click', () => suivant(cible));

  document.addEventListener('keydown', auClavier);
  remonter();
}

/**
 * Une réponse unique se valide au clic, comme dans le fichier source.
 * Une question à réponses multiples attend un bouton « Valider » : sans lui,
 * le premier clic figerait la question avant que l'utilisateur ait pu cocher
 * ses autres réponses.
 */
function choisir(cible, i) {
  if (partie.validee) return;
  const item = partie.quiz.questions[partie.index];

  if (item.multi === true) {
    if (partie.choix.has(i)) partie.choix.delete(i); else partie.choix.add(i);
    document.querySelectorAll('.option').forEach((b) => {
      const actif = partie.choix.has(Number(b.dataset.i));
      b.classList.toggle('selected', actif);
      b.setAttribute('aria-checked', String(actif));
    });
    document.getElementById('qz-valider').disabled = partie.choix.size === 0;
    return;
  }

  partie.choix = new Set([i]);
  document.querySelectorAll('.option').forEach((b) => {
    b.setAttribute('aria-checked', String(Number(b.dataset.i) === i));
  });
  corriger(cible);
}

function corriger() {
  const item = partie.quiz.questions[partie.index];
  const attendues = new Set(item.correct);
  const donnees = partie.choix;

  // Réponses multiples : l'ensemble doit être exactement celui attendu.
  const juste = attendues.size === donnees.size && [...attendues].every((i) => donnees.has(i));
  if (juste) partie.score += 1;
  partie.validee = true;
  partie.reponses.push({ q: item.q, ok: juste });

  document.querySelectorAll('.option').forEach((b) => {
    const i = Number(b.dataset.i);
    b.disabled = true;
    if (attendues.has(i)) b.classList.add('correct');
    else if (donnees.has(i)) b.classList.add('wrong');
  });

  const label = document.getElementById('qz-feedback-label');
  label.textContent = juste ? '✓ Bonne réponse' : '✗ Réponse incorrecte';
  label.style.color = juste ? 'var(--green)' : 'var(--red)';
  // La correction rédigée est du contenu validé : son HTML est conservé.
  document.getElementById('qz-feedback-texte').innerHTML = item.feedback;
  document.getElementById('qz-feedback').classList.add('show');

  const valider = document.getElementById('qz-valider');
  if (valider) valider.classList.add('hidden');
  const suivantBtn = document.getElementById('qz-suivant');
  suivantBtn.classList.remove('hidden');
  suivantBtn.focus();

  annoncer(juste ? 'Bonne réponse.' : 'Réponse incorrecte. La correction est affichée.');
}

function suivant(cible) {
  if (partie.index === partie.quiz.questions.length - 1) { resultats(cible); return; }
  partie.index += 1;
  question(cible);
}

/* --- Écran de résultats ------------------------------------------------------ */

/**
 * Le message de lot du stand : un sans-faute donne droit à un goodie, sinon
 * on invite à retenter. Les deux phrases viennent du hub de la DCIP, pas d'ici.
 * `role="status"` : un lecteur d'écran l'annonce sans que l'on déplace le focus.
 */
function lot(quiz, score, total) {
  const g = quiz.goodie;
  if (!g || !g.sans_faute) return '';
  const gagne = score === total;
  const texte = gagne ? g.sans_faute : g.a_retenter;
  const emoji = gagne ? g.emoji_sans_faute : g.emoji_a_retenter;
  return `<p class="goodie-msg ${gagne ? 'win' : 'retry'}" role="status">
      ${emoji ? `<span class="emoji" aria-hidden="true">${emoji}</span>` : ''}${texte}</p>`;
}


function resultats(cible) {
  const { quiz, score, reponses } = partie;
  const total = quiz.questions.length;
  const pourcentage = (score / total) * 100;
  const verdict = quiz.verdicts.find((v) => pourcentage >= v.seuil)
               || quiz.verdicts[quiz.verdicts.length - 1];

  enregistrerResultatQuiz(quiz.id, score, total);
  document.removeEventListener('keydown', auClavier);

  cible.innerHTML = coque(quiz, `
    <section class="results fade-in">
      <div class="score-eyebrow">Résultat final</div>
      <div class="score-big"><span>${score}</span><span class="total">/${total}</span></div>
      <div class="verdict">${verdict.titre}</div>
      <p class="verdict-text">${verdict.texte}</p>
      ${lot(quiz, score, total)}

      <div class="breakdown">
        <h3>Le détail</h3>
        ${reponses.map((a, i) => `
          <div class="breakdown-item">
            <span class="num">${String(i + 1).padStart(2, '0')}</span>
            <span class="label">${a.q}</span>
            <span class="status ${a.ok ? 'ok' : 'ko'}">${a.ok ? '✓ Juste' : '✗ Faux'}</span>
          </div>`).join('')}
      </div>

      <div class="nav-row">
        <button type="button" class="btn" id="qz-rejouer">
          Refaire le quiz <span class="arrow" aria-hidden="true">↻</span></button>
        <a class="btn secondary" href="#/">Choisir un autre quiz</a>
      </div>
    </section>`);

  document.getElementById('qz-rejouer').addEventListener('click', () => {
    partie.index = 0; partie.score = 0; partie.reponses = [];
    question(cible);
  });
  remonter();
  annoncer(`Résultat : ${score} sur ${total}. ${verdict.titre}`);
}

/* --- Raccourcis clavier -------------------------------------------------------- */

function auClavier(evenement) {
  // L'écouteur se retire de lui-même dès qu'on quitte une question.
  if (!partie || !document.getElementById('qz-question')) {
    document.removeEventListener('keydown', auClavier);
    return;
  }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;

  const item = partie.quiz.questions[partie.index];
  const cible = document.getElementById('vue');

  if (evenement.key >= '1' && evenement.key <= '9') {
    const n = Number(evenement.key) - 1;
    if (n < item.options.length && !partie.validee) {
      evenement.preventDefault();
      choisir(cible, n);
    }
  } else if (evenement.key === 'Enter') {
    const valider = document.getElementById('qz-valider');
    const suivantBtn = document.getElementById('qz-suivant');
    if (valider && !valider.disabled && !valider.classList.contains('hidden')) {
      evenement.preventDefault(); valider.click();
    } else if (suivantBtn && !suivantBtn.classList.contains('hidden')) {
      evenement.preventDefault(); suivantBtn.click();
    }
  }
}
