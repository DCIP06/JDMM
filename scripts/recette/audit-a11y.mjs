/* Audit d'accessibilité sur chaque écran, moteur axe-core, règles WCAG 2.1 AA
   (socle du RGAA 4.1). Les fonds sombres des quiz sont inclus : c'est là que
   les contrastes sont les plus risqués. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const axe = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu'] });

const ECRANS = [
  ['Postes · liste', 'postes/', null],
  ['Postes · fiche', 'postes/', async (p) => {
    await p.locator('.poste-row').first().click(); await p.waitForTimeout(500);
  }],
  ['Postes · formulaire', 'postes/', async (p) => {
    await p.locator('.poste-row').first().click(); await p.waitForTimeout(400);
    await p.locator('a[href^="#/demande/"]').click(); await p.waitForTimeout(500);
  }],
  ['Postes · formulaire en erreur', 'postes/', async (p) => {
    await p.locator('.poste-row').first().click(); await p.waitForTimeout(400);
    await p.locator('a[href^="#/demande/"]').click(); await p.waitForTimeout(400);
    await p.locator('#envoyer').click(); await p.waitForTimeout(300);
  }],
  ['Quiz · hub', 'quiz/', null],
  ['Quiz · intro', 'quiz/', async (p) => {
    await p.locator('.quiz-card').first().click(); await p.waitForTimeout(600);
  }],
  ['Quiz · question', 'quiz/', async (p) => {
    await p.locator('.quiz-card').first().click(); await p.waitForTimeout(500);
    await p.locator('#qz-commencer').click(); await p.waitForTimeout(500);
  }],
  ['Quiz · correction', 'quiz/', async (p) => {
    await p.locator('.quiz-card').first().click(); await p.waitForTimeout(500);
    await p.locator('#qz-commencer').click(); await p.waitForTimeout(400);
    await p.locator('.option').nth(1).click(); await p.waitForTimeout(500);
  }],
  ['Mentions · RGPD', 'mentions.html?doc=rgpd', null],
];

const tousLesProblemes = [];

for (const largeur of [390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: largeur, height: largeur === 390 ? 844 : 900 },
    isMobile: largeur === 390, hasTouch: largeur === 390, locale: 'fr-FR' });
  const page = await ctx.newPage();
  console.log(`\n═══ ${largeur === 390 ? 'MOBILE 390' : 'PC 1440'} ═══`);

  for (const [nom, hash, avant] of ECRANS) {
    const base = process.env.URL_BASE || 'http://127.0.0.1:8123/';
    await page.goto(base + hash, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    if (avant) await avant(page);
    await page.waitForTimeout(200);

    await page.addScriptTag({ content: axe });
    const resultat = await page.evaluate(async () => {
      // On n'audite que la vue affichée : les vues inactives sont hidden.
      return await window.axe.run(document.body, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        resultTypes: ['violations'],
      });
    });

    const violations = resultat.violations.filter((v) => v.nodes.length > 0);
    if (!violations.length) {
      console.log(`  ✔ ${nom}`);
    } else {
      console.log(`  ✘ ${nom}`);
      violations.forEach((v) => {
        console.log(`      [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length})`);
        console.log(`        ex. ${v.nodes[0].html.slice(0, 130).replace(/\s+/g, ' ')}`);
        tousLesProblemes.push({ ecran: nom, largeur, id: v.id, impact: v.impact, aide: v.help,
          nb: v.nodes.length, exemple: v.nodes[0].html.slice(0, 200) });
      });
    }
  }
  await ctx.close();
}

await b.close();
fs.writeFileSync('audit-a11y.json', JSON.stringify(tousLesProblemes, null, 1));
console.log(`\n${tousLesProblemes.length} type(s) de violation à traiter`);
