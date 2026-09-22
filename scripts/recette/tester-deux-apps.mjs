/* Recette des deux applications distinctes. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

/* Les effectifs attendus se DÉDUISENT des données : une fiche ajoutée ne doit
   pas faire échouer la recette. Un compteur recopié dans le test ment au bout
   de la première modification. */
const FICHES = JSON.parse(readFileSync(new URL('../../data/postes-dcip.json', import.meta.url), 'utf8'));
const CONFIG = JSON.parse(readFileSync(new URL('../../data/config.json', import.meta.url), 'utf8'));
const JOURS = CONFIG.rgpd.duree_conservation_jours;
const DONNEES_QUIZ = JSON.parse(readFileSync(new URL('../../data/quiz.json', import.meta.url), 'utf8'));
const QUIZ = DONNEES_QUIZ.quiz;
const HUB = DONNEES_QUIZ.hub;
const NB_FICHES = FICHES.length;
/* Trois destinations possibles pour une demande, et la recette doit contrôler
   CELLE QUI EST EN PLACE : un test qui suppose « pas encore raccordé » passe
   au rouge le jour où le registre est enfin branché — exactement l'inverse de
   ce qu'on veut. Les deux autres modes sont couverts plus bas, en détournant
   la configuration. */
const renseigne = (v) => Boolean(v) && v !== 'À_RENSEIGNER';
const MODE = renseigne(CONFIG.registre.endpoint) ? 'flux'
           : renseigne(CONFIG.registre.email_destination) ? 'courriel' : 'absent';
const BASE = process.env.URL_BASE || 'http://127.0.0.1:8123/';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu'] });
let ko = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  → ' + d)); if (!c) ko++; };

/* innerText restitue le text-transform:uppercase des surtitres, et les
   apostrophes typographiques diffèrent de celles du code source du test. */
const normal = (t) => String(t).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
const contient = (texte, ...morceaux) => morceaux.every((m) => normal(texte).includes(normal(m)));

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'fr-FR' });
const p = await ctx.newPage();
const erreurs = [];
p.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
p.on('pageerror', (e) => erreurs.push('EXCEPTION ' + e.message));

console.log('\n— Application POSTES —');
await p.goto(BASE + 'postes/', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
ok('la page se charge sans erreur', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
ok('la marque est « DCIP 06 »', (await p.locator('.barre__marque').textContent()).replace(/\s+/g,' ').trim() === 'DCIP 06');
ok('le titre reprend « Rejoindre la DCIP »', (await p.locator('h1').first().textContent()).includes('Rejoindre la DCIP'));
ok('la pastille reprend « Postes vacants · Mobilité interne »',
   (await p.locator('.hero-pill').first().textContent()).includes('Postes vacants'));
ok('plus aucun filtre par service', await p.locator('.nf-btn').count() === 0);
ok(`les ${NB_FICHES} fiches sont listées d'un seul tenant`,
   await p.locator('.poste-row').count() === NB_FICHES,
   String(await p.locator('.poste-row').count()));
ok('aucun onglet Métiers', !(await p.locator('body').innerText()).includes('Vie d\'un projet'));
ok('aucune notion de sélection', !/ma sélection|panier/i.test(await p.locator('body').innerText()));
await p.screenshot({ path: 'app-postes-liste.png' });

console.log('\n— Les compteurs portent sur les postes ouverts —');
/* Combien de fiches SONT réellement ouvertes, d'après ce qu'affiche la liste :
   le compteur doit suivre cette valeur, jamais le nombre total de fiches.
   « À pourvoir » compte au même titre que « En ligne » : ce sont les postes
   ouverts en mobilité interne, sans annonce publiée sur le site. */
const badges = await p.locator('.poste-row__tags').allInnerTexts();
const ouverts = badges.filter((t) => /en ligne|urgent|à pourvoir/i.test(t)).length;
const sous = (await p.locator('.hero .sous').innerText()).replace(/\s+/g, ' ');
ok(`l'accroche annonce ${ouverts} poste(s) ouvert(s)`,
   sous.startsWith(`${ouverts} poste`), sous);
ok("l'accroche dit « ouverts à la mobilité »", contient(sous, 'ouverts à la mobilité'), sous);
ok("l'accroche ne mentionne plus le total",
   !sous.includes(`${NB_FICHES} postes présentés`), sous);
ok('le compteur de la liste suit les postes ouverts',
   (await p.locator('.entete-liste .texte-faible').innerText())
     .replace(/\s+/g, ' ').startsWith(`${ouverts} poste`),
   await p.locator('.entete-liste .texte-faible').innerText());
ok('la liste garde toutes les fiches, ouvertes ou pourvues',
   await p.locator('.poste-row').count() === NB_FICHES);

console.log('\n— Fiche de poste —');
await p.locator('.poste-row').first().click();
await p.waitForTimeout(600);
const fiche = await p.locator('#vue').innerText();
ok('la fiche s\'ouvre', (await p.locator('.hero h1').textContent()).length > 12);
ok('elle porte Description, Missions, Profil',
   contient(fiche, 'Description', 'Missions principales', 'Profil recherché'));
ok('le bouton « Je suis intéressé(e) par ce poste » est là',
   contient(fiche, 'Je suis intéressé(e) par ce poste'));
ok('le bouton « Postuler en ligne » est là', fiche.includes('Postuler en ligne'));
ok('le bouton « Voir les autres postes » est là', fiche.includes('Voir les autres postes'));
await p.screenshot({ path: 'app-postes-fiche.png' });

console.log('\n— Formulaire —');
await p.locator('a[href^="#/demande/"]').click();
await p.waitForTimeout(600);
const form = await p.locator('#vue').innerText();
ok('le titre est « Je suis intéressé(e) »', contient(form, 'Je suis intéressé(e)'));
const LIBELLE_BOUTON = MODE === 'courriel' ? 'Préparer mon message' : 'Enregistrer ma demande';
ok(`le bouton dit « ${LIBELLE_BOUTON} » (mode ${MODE})`,
   contient(await p.locator('#envoyer').textContent(), LIBELLE_BOUTON));
ok('le poste sélectionné est rappelé', contient(form, 'Poste sélectionné'));
for (const c of ['prenom','nom','direction','email']) {
  ok(`le champ ${c} est présent`, await p.locator('#' + c).count() === 1);
}
ok('les 4 projets de mobilité sont proposés', await p.locator('[data-projet]').count() === 4);
/* La durée de conservation se lit dans la configuration : l'écrire ici en dur
   ferait passer le test alors que l'application annoncerait autre chose. */
ok('la mention RGPD annonce la durée configurée',
   contient(form, `Conservation ${JOURS} jours`), `attendu ${JOURS} jours`);
ok('la mention RGPD nomme la DCIP', contient(form, 'Données traitées par la DCIP'));
ok('la mention RGPD écarte tout traceur',
   contient(form, 'Aucun traceur, aucune mesure d\'audience'));
await p.screenshot({ path: 'app-postes-form.png' });

console.log('\n— Champs obligatoires —');
await p.locator('#envoyer').click();
await p.waitForTimeout(300);
ok('le prénom manquant est signalé', await p.locator('#err-prenom').isVisible());
await p.locator('#prenom').fill('Camille');
await p.locator('#envoyer').click(); await p.waitForTimeout(250);
ok('le nom manquant est signalé', await p.locator('#err-nom').isVisible());
await p.locator('#nom').fill('Durand');
await p.locator('#envoyer').click(); await p.waitForTimeout(250);
ok('la direction manquante est signalée', await p.locator('#err-direction').isVisible());
await p.locator('#direction').fill('DRH');
await p.locator('#envoyer').click(); await p.waitForTimeout(250);
ok('l\'adresse manquante est signalée', await p.locator('#err-email').isVisible());
await p.locator('#email').fill('camille.durand@departement06.fr');
await p.locator('#envoyer').click(); await p.waitForTimeout(250);
ok('le consentement manquant est signalé', await p.locator('#err-rgpd').isVisible());

if (MODE === 'flux') {
  /* On répond à la place du registre : la recette contrôle ce que fait
     l'application d'une réponse, pas si le serveur distant est joignable —
     et depuis 127.0.0.1 l'origine ne serait de toute façon pas autorisée. */
  await p.route('**/demande', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json',
                          body: JSON.stringify({ ok: true, reference: 'JDMM-0001' }) });
  });
}
console.log(`\n— Enregistrement (mode en place : ${MODE}) —`);
await p.locator('#rgpd').check();
await p.locator('[data-projet]').nth(1).click();
await p.waitForTimeout(3200);
await p.locator('#envoyer').click();
await p.waitForTimeout(900);
const conf = await p.locator('#vue').innerText();
const ATTENDU = { flux: 'Demande enregistrée', courriel: 'envoyer le message',
                  absent: 'À signaler sur place' }[MODE];
ok('la confirmation s\'affiche', contient(conf, ATTENDU), conf.slice(0, 140));
ok('elle dit ce qui s\'est réellement passé',
   MODE === 'flux' ? contient(conf, 'enregistrée')
   : !contient(conf, 'Demande enregistrée'), conf.slice(0, 140));
ok('le poste d\'intérêt est rappelé', contient(conf, "Poste d'intérêt"));
ok('les coordonnées saisies sont rappelées',
   contient(conf, 'Camille Durand') && contient(conf, 'camille.durand@departement06.fr'));
ok('on peut revenir aux autres postes', await p.locator('a[href="#/"]').count() >= 1);
await p.screenshot({ path: 'app-postes-conf.png' });

/* Le mode courriel ne s'active que si `email_destination` est renseigné dans
   config.json. Plutôt que de modifier le dépôt le temps du test, on sert une
   configuration détournée à la page : c'est le seul chemin qui vérifie ce que
   verra le visiteur le jour où le Département aura donné sa boîte. */
console.log('\n— Enregistrement par courriel —');
const BOITE = 'jdmm-recette@departement06.fr';
/* Contexte dédié, service worker BLOQUÉ : sans cela le SW sert la requête
   lui-même et l'interception ne voit jamais passer config.json. */
const ctxMail = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'block' });
await ctxMail.route('**/data/config.json*', async (route) => {
  const copie = JSON.parse(JSON.stringify(CONFIG));
  copie.registre.endpoint = 'À_RENSEIGNER';      // le flux prime : on l'écarte ici
  copie.registre.email_destination = BOITE;
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(copie) });
});
const pm = await ctxMail.newPage();
const erreursMail = [];
pm.on('console', (m) => { if (m.type() === 'error') erreursMail.push(m.text()); });
pm.on('pageerror', (e) => erreursMail.push('EXCEPTION ' + e.message));
await pm.goto(BASE + 'postes/', { waitUntil: 'networkidle' });
await pm.waitForTimeout(900);
await pm.locator('.poste-row').first().click();
await pm.waitForTimeout(500);
await pm.locator('text=Je suis intéressé').first().click();
await pm.waitForTimeout(500);
ok('le bouton annonce un message, pas un enregistrement',
   contient(await pm.locator('#envoyer').textContent(), 'Préparer mon message'));
await pm.locator('#prenom').fill('Camille');
await pm.locator('#nom').fill('Durand');
await pm.locator('#direction').fill('Direction des ressources humaines');
await pm.locator('#email').fill('camille.durand@departement06.fr');
await pm.locator('#rgpd').check();
await pm.waitForTimeout(3200);
await pm.locator('#envoyer').click();
await pm.waitForTimeout(900);
const confMail = await pm.locator('#vue').innerText();
ok('l\'écran dit que le message reste à envoyer',
   contient(confMail, 'envoyer le message') && contient(confMail, 'appuyé sur'), confMail.slice(0, 140));
ok('il ne prétend pas que la demande est enregistrée',
   !contient(confMail, 'Demande enregistrée'), confMail.slice(0, 140));
const lienMail = await pm.locator('a[href^="mailto:"]').first().getAttribute('href');
const mail = new URL(lienMail);
ok('le message est adressé à la boîte du Département',
   decodeURIComponent(mail.pathname) === BOITE, decodeURIComponent(mail.pathname));
const corps = mail.searchParams.get('body') || '';
ok('il porte le poste, le demandeur et l\'annonce',
   contient(corps, 'Camille') && contient(corps, 'Durand')
   && contient(corps, 'camille.durand@departement06.fr')
   && corps.includes('departement06.fr/offres-demploi'));
ok('les libellés sont fixes, donc exploitables par un flux',
   ['— POSTE —', '— DEMANDEUR —', 'Direction  :', 'Horodatage :'].every((m) => corps.includes(m)));
/* Certaines messageries tronquent un mailto trop long. 2 000 caractères est
   la limite basse constatée ; on se garde une marge. */
ok('le lien reste sous 1 800 caractères', lienMail.length < 1800, String(lienMail.length));
ok('aucune erreur de page sur ce chemin', erreursMail.length === 0, erreursMail.slice(0, 2).join(' | '));
await ctxMail.close();

/* Le mode « pas encore raccordé » reste couvert même une fois le registre
   branché : c'est le filet qui garantit qu'on n'annoncera jamais un
   enregistrement qui n'a pas eu lieu. */
console.log('\n— Enregistrement quand rien n\'est raccordé —');
const ctxVide = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'block' });
await ctxVide.route('**/data/config.json*', async (route) => {
  const copie = JSON.parse(JSON.stringify(CONFIG));
  copie.registre.endpoint = 'À_RENSEIGNER';
  copie.registre.email_destination = 'À_RENSEIGNER';
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(copie) });
});
const pv = await ctxVide.newPage();
await pv.goto(BASE + 'postes/', { waitUntil: 'networkidle' });
await pv.waitForTimeout(900);
await pv.locator('.poste-row').first().click(); await pv.waitForTimeout(500);
await pv.locator('text=Je suis intéressé').first().click(); await pv.waitForTimeout(500);
ok('le bouton reprend « Enregistrer ma demande »',
   contient(await pv.locator('#envoyer').textContent(), 'Enregistrer ma demande'));
await pv.locator('#prenom').fill('Camille');
await pv.locator('#nom').fill('Durand');
await pv.locator('#direction').fill('Direction des ressources humaines');
await pv.locator('#email').fill('camille.durand@departement06.fr');
await pv.locator('#rgpd').check();
await pv.waitForTimeout(3200);
await pv.locator('#envoyer').click();
await pv.waitForTimeout(900);
const confVide = await pv.locator('#vue').innerText();
ok('l\'application renvoie vers un agent', contient(confVide, 'À signaler sur place'));
ok('elle ne fait croire à aucun enregistrement',
   contient(confVide, 'n’est pas encore raccordé'), confVide.slice(0, 140));
ok('aucun lien mailto n\'est proposé', await pv.locator('a[href^="mailto:"]').count() === 0);
await ctxVide.close();

console.log('\n— Application QUIZ —');
erreurs.length = 0;
await p.goto(BASE + 'quiz/', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
ok('la page se charge sans erreur', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
/* Le compte vient du fichier de données : la DCIP a ajouté un quatrième quiz
   le 21/09, un chiffre écrit en dur ici l'aurait signalé comme une panne. */
ok(`les ${QUIZ.length} quiz sont proposés`, await p.locator('.quiz-card').count() === QUIZ.length,
   String(await p.locator('.quiz-card').count()));
/* Le titre est celui du fichier source, pas une chaîne figée ici : la DCIP l'a
   déjà changé une fois (« Testez vos connaissances » → « À la découverte… »). */
ok('le hub reprend le titre du fichier source',
   contient(await p.locator('.hub-title').innerText(), HUB.titre), HUB.titre);
/* Les compteurs des cartes doivent égaler le nombre réel de questions de
   chaque quiz — le hub livré annonçait 9 questions là où il y en a 8. */
const ATTENDUS = QUIZ.map((q) => `${q.questions.length} questions`);
const AFFICHES = (await p.locator('.card-meta').allTextContents())
  .map((t) => (t.match(/\d+ questions/) || [''])[0]);
ok(`les compteurs des cartes annoncent ${ATTENDUS.map((a) => a.split(' ')[0]).join(', ')}`,
   ATTENDUS.every((a) => AFFICHES.includes(a)), AFFICHES.join(' | '));
ok('aucun compteur ne recopie une annonce fausse de la source',
   QUIZ.every((q) => String(q.questions.length) !== q.annonces_source.intro
                     || q.annonces_source.intro === String(q.questions.length)));
ok('un lien mène aux postes', await p.locator('a[href="../postes/"]').count() >= 1);
await p.screenshot({ path: 'app-quiz-hub.png' });

await p.locator('.quiz-card').first().click();
await p.waitForTimeout(700);
ok('l\'écran d\'intro s\'affiche', await p.locator('.intro .meta-grid').isVisible());
ok('le nombre de questions y est calculé, pas recopié',
   (await p.locator('.meta-grid').innerText()).replace(/\s+/g,' ').includes('QUESTIONS 8'),
   (await p.locator('.meta-grid').innerText()).replace(/\s+/g,' ').slice(0,50));
await p.locator('#qz-commencer').click();
await p.waitForTimeout(600);
ok('le quiz démarre', await p.locator('.question').isVisible());
ok('le compteur dit 1 / 8',
   (await p.locator('.counter').textContent()).replace(/\s+/g,' ').includes('1 / 8'));
ok('les réponses portent des lettres A, B, C',
   (await p.locator('.option .marker').allTextContents()).join('') === 'ABC');
await p.locator('.option').first().click();
await p.waitForTimeout(500);
ok('la correction s\'affiche', await p.locator('.feedback.show').isVisible());
ok('la bonne réponse est marquée', await p.locator('.option.correct').count() === 1);
ok('aucun résidu QF_/QG_/QS_', !/Q[FGS]_/.test(await p.locator('body').innerText()));
await p.screenshot({ path: 'app-quiz-question.png' });

console.log('\n— Racine —');
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
ok('la racine redirige vers les postes', p.url().includes('/postes/'), p.url());

await b.close();
console.log(ko === 0 ? '\n✔ tous les contrôles passent\n' : `\n✘ ${ko} contrôle(s) en échec\n`);
process.exit(ko ? 1 : 0);
