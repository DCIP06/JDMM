#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrait le contenu des trois quiz depuis sources/quiz-hub.html vers data/quiz.json.

Le hub livré par la DCIP est un fichier autonome : les questions y sont des
tableaux JavaScript, les verdicts une cascade de `if`, le reste du balisage.
Rien n'est recopié à la main — le contenu change, et une transcription se
périme en silence.

    python3 scripts/extraire_quiz.py
    python3 scripts/extraire_quiz.py --verifier   # n'écrit rien, compare

Garde-fou : le script REFUSE d'écrire un fichier incomplet. Si un quiz perd
ses questions, ses verdicts ou son intro, il s'arrête en disant lequel — une
extraction ne rate jamais bruyamment toute seule.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / 'sources' / 'quiz-hub.html'
SORTIE = RACINE / 'data' / 'quiz.json'

# Les trois quiz du hub : ancre dans le document, préfixe de leurs variables.
QUIZ = [
    {'id': 'feu',  'ancre': 'qz-feu',  'prefixe': 'QF', 'slug': 'prevention-incendie'},
    {'id': 'secu', 'ancre': 'qz-secu', 'prefixe': 'QC', 'slug': 'securite-humaine-materiel'},
    {'id': 'etu',  'ancre': 'qz-etu',  'prefixe': 'QE', 'slug': 'etudes-et-travaux'},
]


def texte(fragment: str) -> str:
    """Balisage → texte lisible, entités comprises."""
    # Un <br> sépare deux mots : le supprimer sans rien mettre les colle.
    t = re.sub(r'<br\s*/?>', ' ', fragment)
    t = re.sub(r'<[^>]+>', '', t)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


def interne(fragment: str) -> str:
    """Garde le balisage d'emphase, normalise les blancs."""
    return re.sub(r'\s+', ' ', html.unescape(fragment)).strip()


def bloc_js(source: str, nom: str) -> str:
    """Le tableau JavaScript `nom`, accolades équilibrées comprises."""
    depart = source.index(f'const {nom} = [')
    i = source.index('[', depart)
    profondeur, j = 0, i
    dans_chaine, echappe = None, False
    while j < len(source):
        c = source[j]
        if dans_chaine:
            if echappe:            echappe = False
            elif c == '\\':        echappe = True
            elif c == dans_chaine: dans_chaine = None
        elif c in '"\'`':          dans_chaine = c
        elif c == '[':             profondeur += 1
        elif c == ']':
            profondeur -= 1
            if profondeur == 0:
                return source[i:j + 1]
        j += 1
    raise ValueError(f'{nom} : tableau non refermé')


def js_vers_json(tableau: str, nom: str):
    """Évalue le tableau avec node : un analyseur maison buterait sur les
    apostrophes typographiques, les entités et le HTML des feedbacks."""
    r = subprocess.run(
        ['node', '-e', f'const t = {tableau}; process.stdout.write(JSON.stringify(t));'],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise ValueError(f'{nom} : JavaScript illisible — {r.stderr.strip()[:200]}')
    return json.loads(r.stdout)


def panneau(source: str, ancre: str) -> str:
    """Le fragment HTML d'un quiz, de son ancre au panneau suivant."""
    i = source.index(f'id="{ancre}"')
    suivants = [source.index(f'id="{q["ancre"]}"') for q in QUIZ
                if f'id="{q["ancre"]}"' in source and source.index(f'id="{q["ancre"]}"') > i]
    return source[i:min(suivants)] if suivants else source[i:]


def carte(source: str, ident: str) -> dict:
    """La carte du hub qui ouvre ce quiz : icône, intitulés, compteurs annoncés."""
    m = re.search(r"<div class=\"quiz-card[^\"]*\" onclick=\"openQuiz\('" +
                  re.escape(ident) + r"'\)\">(.*?)</div>\s*(?=<div class=\"quiz-card|</div>)",
                  source, re.S)
    if not m:
        return {}
    c = m.group(1)
    prendre = lambda cl: ((re.search(r'<(?:div|span) class="' + cl + r'">(.*?)</(?:div|span)>',
                                     c, re.S) or [None, ''])[1])
    compteurs = re.findall(r'<span>(.*?)</span>', c, re.S)
    annonce = next((texte(x) for x in compteurs if 'question' in x.lower()), '')
    return {
        'ico': texte(prendre('card-ico')),
        'categorie': texte(prendre('card-cat')),
        'titre': texte(prendre('card-title')),
        'accroche_carte': texte(prendre('card-desc')),
        'questions_annoncees': annonce,
        'duree_carte': next((texte(x) for x in compteurs if 'min' in x.lower()), ''),
    }


def entete_hub(source: str) -> dict:
    """Les textes du hub lui-même, au-dessus des trois cartes."""
    prendre = lambda cl: ((re.search(r'<(?:div|p|h1) class="' + cl + r'"[^>]*>(.*?)</(?:div|p|h1)>',
                                     source, re.S) or [None, ''])[1])
    return {
        'tag': texte(prendre('hub-tag')),
        'eyebrow': texte(prendre('hub-eyebrow')),
        'titre_html': interne(prendre('hub-title')),
        'titre': texte(prendre('hub-title')),
        'jouer': texte(prendre('hub-play')),
        'choisir': texte(prendre('hub-select')),
    }


# Le hub livré reprend, sous le quiz « Études & Travaux », le pied de page du
# quiz sûreté : « Vidéoprotection · Badges · Intrusion » sous un quiz qui parle
# de chantiers. Copier-coller manifeste, corrigé ici à partir du contenu réel
# du quiz (sa marque et les catégories de ses questions). À supprimer dès que
# la DCIP corrige sa source.
PIEDS_CORRIGES = {
    'etu': ['Quiz pédagogique — conduite d’opérations de bâtiment',
            'Programmation · Chantier · Réception'],
}


def extraire_verdicts(source: str, prefixe: str) -> list:
    """La cascade `if (pct >= …)` de l'écran de résultats."""
    i = source.index(f'function {prefixe}_showResults')
    corps = source[i:i + 4000]
    verdicts = []
    for m in re.finditer(
            r'(?:if \(pct >= (\d+)\)|else) \{\s*verdict = "((?:[^"\\]|\\.)*)";\s*'
            r'text = "((?:[^"\\]|\\.)*)";', corps):
        verdicts.append({
            'seuil': int(m.group(1)) if m.group(1) else 0,
            'titre': html.unescape(m.group(2).replace('\\"', '"')),
            'texte': html.unescape(m.group(3).replace('\\"', '"')),
        })
    return verdicts


def extraire_goodie(source: str, prefixe: str) -> dict:
    """Le message de lot : gagné sans faute, à retenter sinon."""
    i = source.index(f'{prefixe}_goodieEl')
    corps = source[i:i + 1200]
    messages = re.findall(r"innerHTML = '(.*?)';", corps, re.S)
    if len(messages) < 2:
        return {}
    # L'emoji est rendu à part : le laisser dans le texte le ferait apparaître
    # deux fois.
    sans_emoji = lambda m: re.sub(r'<span class="emoji">.*?</span>', '', m, flags=re.S)
    nettoie = lambda m: texte(sans_emoji(m).replace("\\'", "'"))
    return {
        'sans_faute': nettoie(messages[0]),
        'a_retenter': nettoie(messages[1]),
        'emoji_sans_faute': (re.search(r'emoji">([^<]+)<', messages[0]) or [None, ''])[1],
        'emoji_a_retenter': (re.search(r'emoji">([^<]+)<', messages[1]) or [None, ''])[1],
    }


def couleurs(source: str, ancre: str) -> dict:
    """Les variables CSS du quiz : l'accent et le fond."""
    m = re.search(r'#' + re.escape(ancre) + r'\s*\{([^}]*--accent[^}]*)\}', source)
    bloc = m.group(1) if m else ''
    prendre = lambda n: (re.search(r'--' + n + r':\s*([^;]+);', bloc) or [None, ''])[1].strip()
    fond = re.search(r'#' + re.escape(ancre) + r'\s*\{([^}]*--bg:[^}]*)\}', source)
    return {
        'accent': prendre('accent'),
        'fond': (re.search(r'--bg:\s*([^;]+);', fond.group(1)).group(1).strip()
                 if fond else ''),
    }


def extraire():
    source = SOURCE.read_text(encoding='utf-8')
    resultat, soucis = [], []

    for q in QUIZ:
        p = panneau(source, q['ancre'])
        pre = q['prefixe']

        questions = js_vers_json(bloc_js(source, f'{pre}_questions'), f'{pre}_questions')
        for item in questions:
            c = item.get('correct')
            item['multi'] = isinstance(c, list) and len(c) > 1
            item['correct'] = c if isinstance(c, list) else [c]

        titre_h1 = re.search(r'<h1[^>]*>(.*?)</h1>', p, re.S)
        lead = re.search(r'<p class="lead">(.*?)</p>', p, re.S)
        marque = re.findall(r'<div class="brand-row">\s*<span>(.*?)</span>\s*<span>(.*?)</span>',
                            p, re.S)
        pied = re.findall(r'<div class="footer-note">\s*<span>(.*?)</span>\s*<span>(.*?)</span>',
                          p, re.S)
        meta = re.findall(r'<div class="label">(.*?)</div>\s*<div class="value">(.*?)</div>',
                          p, re.S)
        eyebrow = re.search(r'<div class="eyebrow">(.*?)</div>', p, re.S)

        c = carte(source, q['id'])
        verdicts = extraire_verdicts(source, pre)
        goodie = extraire_goodie(source, pre)
        coul = couleurs(source, q['ancre'])

        manques = [nom for nom, valeur in (
            ('questions', questions), ('titre', titre_h1), ('accroche', lead),
            ('verdicts', verdicts), ('goodie', goodie), ('méta', meta),
            ('carte du hub', c)) if not valeur]
        if manques:
            soucis.append(f"{q['id']} : {', '.join(manques)}")
            continue

        dico = {v.lower(): texte(k) for k, v in
                ((val, lab) for lab, val in meta)}
        meta_dico = {texte(lab).lower(): texte(val) for lab, val in meta}

        resultat.append({
            'id': q['id'],
            'slug': q['slug'],
            'ancre': q['ancre'],
            'titre': c['titre'],
            'categorie': c['categorie'],
            'ico': c['ico'],
            'marque': texte(marque[0][0]) if marque else '',
            'titre_long': texte(titre_h1.group(1)),
            'intro_titre_html': interne(titre_h1.group(1)),
            'intro_lead_html': interne(lead.group(1)),
            'accroche': c['accroche_carte'],
            'eyebrow': texte(eyebrow.group(1)) if eyebrow else 'Quiz interactif',
            'accent': coul['accent'],
            'fond': coul['fond'],
            'duree_carte': c['duree_carte'],
            'annonces_source': {
                'carte': c['questions_annoncees'],
                'intro': meta_dico.get('questions', ''),
            },
            'meta': {
                'questions': str(len(questions)),
                'duree': meta_dico.get('durée', ''),
                'niveau': meta_dico.get('niveau', ''),
                'cadre': meta_dico.get('cadre', ''),
            },
            'questions': questions,
            'verdicts': sorted(verdicts, key=lambda v: -v['seuil']),
            'goodie': goodie,
            'pied': PIEDS_CORRIGES.get(q['id'],
                        [texte(pied[0][0]), texte(pied[0][1])] if pied else []),
            'pied_source': [texte(pied[0][0]), texte(pied[0][1])] if pied else [],
        })

    if soucis:
        sys.exit('Extraction incomplète, rien n’a été écrit :\n  - ' + '\n  - '.join(soucis))
    if len(resultat) != len(QUIZ):
        sys.exit(f'{len(resultat)} quiz extraits sur {len(QUIZ)} : rien n’a été écrit.')
    return resultat, entete_hub(source)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--verifier', action='store_true',
                    help="compare à data/quiz.json sans rien écrire")
    args = ap.parse_args()

    quiz, hub = extraire()

    print(f"  hub : « {hub['titre']} » — {hub['tag']}")
    for q in quiz:
        reel = len(q['questions'])
        multi = sum(1 for x in q['questions'] if x['multi'])
        # On compare ce que la source ANNONCE à ce qu'elle contient : l'écart
        # est passé inaperçu une fois, il ne repassera pas.
        ecarts = [f"{ou} annonce {v}" for ou, v in
                  (('la carte', q['annonces_source']['carte'].split()[0]
                    if q['annonces_source']['carte'] else ''),
                   ("l'intro", q['annonces_source']['intro']))
                  if v and v != str(reel)]
        alerte = ('  ⚠ ' + ', '.join(ecarts)) if ecarts else ''
        print(f"  {q['id']:<5} {q['titre'][:34]:<36} {reel} questions "
              f"({multi} à choix multiple), {len(q['verdicts'])} verdicts{alerte}")

    contenu = {'hub': hub, 'quiz': quiz}
    vus = {}
    for q in quiz:
        if q['pied'] != q['pied_source']:
            print(f"  {q['id']} : pied de page corrigé — la source portait "
                  f"« {q['pied_source'][0]} »")
        clef = tuple(q['pied_source'])
        if clef in vus:
            print(f"  ⚠ {q['id']} et {vus[clef]} partagent le même pied dans la source")
        vus[clef] = q['id']

    if args.verifier:
        ancien = json.loads(SORTIE.read_text('utf-8')) if SORTIE.exists() else None
        print('  identique' if ancien == contenu else '  DIFFÉRENT de data/quiz.json')
        return

    SORTIE.write_text(json.dumps(contenu, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"  {SORTIE.relative_to(RACINE)} écrit — {SORTIE.stat().st_size // 1024} ko")


if __name__ == '__main__':
    main()
