#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fabrique des fiches de poste à partir des documents transmis par la DCIP.

Ces postes-là ne sont PAS publiés sur le site du Département : ils sont à
pourvoir en mobilité interne, et leur fiche vient d'un document Word ou PDF.
Ils portent donc `sans_annonce: true`, sans quoi l'application, ne trouvant
aucune annonce en regard, les afficherait « Poste pourvu » — l'exact inverse.

    python3 scripts/extraire_fiches_dcip.py                 # aperçu, rien n'est écrit
    python3 scripts/extraire_fiches_dcip.py --ecrire        # ajoute à postes-dcip.json

Le script REFUSE d'écrire une fiche incomplète : il dit laquelle et pourquoi.
Une extraction qui échoue à moitié ne se voit pas à la lecture.

⚠️ Le titre du poste, le service et le cadre d'emploi ne sont pas dans le corps
du document mais dans des ZONES DE TEXTE, que python-docx ne restitue pas. On
les lit dans le XML — en exigeant « <w:t> » ou « <w:t … > », car « <w:t[^>]*> »
attrape aussi « <w:tblPr> » et rapporte alors du balisage au lieu du texte.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
import unicodedata
import zipfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCES = RACINE / 'sources' / 'fiches-dcip'
POSTES = RACINE / 'data' / 'postes-dcip.json'

TEXTE_XML = re.compile(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>', re.S)

# Les intitulés de section des fiches Word, dans l'ordre où ils apparaissent.
# Les styles ne sont d'aucun secours : « Normal » sert aux titres comme aux puces.
SECTIONS = [
    'Présentation de la direction',
    'Missions du service',
    'Mission de l’agent dans le service',
    'Mission de l’agent',
    'Activités de l’agent',
    'Compétences requises (savoirs)',
    'Qualités attendues (savoir être)',
    'Attributs du poste',
]

# Le nom du service tel que le document l'écrit → celui qu'emploient les fiches
# et les icônes de l'application. Tout service absent d'ici est signalé.
SERVICES = {
    'mission énergies renouvelables': 'Mission énergies renouvelables',
    'service maintenance des collèges': 'Maintenance des collèges',
    'service de la maintenance des collèges': 'Maintenance des collèges',
    'service de l’énergie et des fluides': 'Énergie et fluides',
    'service énergie et fluides': 'Énergie et fluides',
    'service études et travaux': 'Études et travaux',
    'service maintenance des bâtiments': 'Maintenance des bâtiments',
}

ICONES = {
    'Mission énergies renouvelables': '⚡',
    'Maintenance des collèges': '🏫',
    'Énergie et fluides': '⚡',
    'Études et travaux': '📐',
    'Maintenance des bâtiments': '🏢',
    'Sécurité, Sûreté & Prévention': '🔒',
}


def sans_accents(texte: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', texte)
                   if unicodedata.category(c) != 'Mn')


def identifiant(titre: str) -> str:
    base = sans_accents(titre.lower())
    base = re.sub(r"[^a-z0-9]+", '-', base).strip('-')
    return base


# Les documents écrivent les intitulés EN CAPITALES ET SANS ACCENTS. Les
# capitales se corrigent, les accents ne se devinent pas : cette table dit
# comment se lit chaque mot rencontré dans les intitulés transmis. Un mot
# absent d'ici ressort tel quel — il n'est jamais inventé d'accent.
ACCENTS = {
    'ingenieur': 'ingénieur', 'ingenieur(e)': 'ingénieur(e)',
    'renovation': 'rénovation', 'energetique': 'énergétique',
    'batiments': 'bâtiments', 'batiment': 'bâtiment',
    'charge': 'chargé', 'charge(e)': 'chargé(e)',
    'operation': 'opération', 'operations': 'opérations',
    'legionellose': 'légionellose', 'specialise': 'spécialisé',
    'securite': 'sécurité', 'surete': 'sûreté', 'college': 'collège',
    'colleges': 'collèges', 'etudes': 'études', 'energies': 'énergies',
    'renouvelables': 'renouvelables', 'maitrise': 'maîtrise',
}

# Les mots-outils restent en minuscules dans un titre français.
OUTILS = {'de', 'des', 'du', 'la', 'le', 'les', 'en', 'et', 'à', 'au', 'aux',
          'd’', 'l’', 'sur', 'pour', 'ou'}


def joli_titre(brut: str) -> str:
    """« CHARGE D’OPERATION PLOMBERIE LEGIONELLOSE » →
       « Chargé d’opération plomberie légionellose ».

    Capitale au premier mot seulement — c'est la règle française, et « Des »
    au milieu d'un intitulé se remarque tout de suite à l'écran.
    """
    brut = re.sub(r'\s+', ' ', brut).strip(' :')
    if not brut:
        return ''
    if not brut.isupper():
        return brut                      # déjà écrit en casse normale : on n'y touche pas

    mots = []
    for mot in brut.split(' '):
        noyau = re.sub(r'[^A-ZÀ-Ý]', '', mot)
        # 2 à 4 lettres sans voyelle après la première : un sigle (CVC, GTB, PMR).
        if 2 <= len(noyau) <= 4 and not re.search(r'[AEIOUY]', noyau[1:]):
            mots.append(mot)
            continue
        bas = mot.lower()
        # L'apostrophe soude deux mots : « D’OPERATION » se traite en deux temps.
        if '’' in bas:
            gauche, droite = bas.split('’', 1)
            bas = ACCENTS.get(gauche, gauche) + '’' + ACCENTS.get(droite, droite)
        else:
            bas = ACCENTS.get(bas, bas)
        mots.append(bas)

    premier = mots[0]
    mots = [premier[0].upper() + premier[1:]] + [
        m if m.lower() in OUTILS or m.isupper() else m.lower() for m in mots[1:]]
    return ' '.join(mots)


# Mots sur lesquels une phrase ne se termine jamais : s'ils finissent une
# ligne, c'est que la source l'a tronquée (cela arrive dans le PDF transmis).
EN_SUSPENS = re.compile(
    r'\s+(?:de|du|des|d’|à|au|aux|le|la|les|l’|et|ou|en|dans|pour|par|sur|'
    r'avec|un|une|son|sa|ses|leur|leurs|ce|cette|qui|que)$', re.I)


def couper_proprement(phrase: str) -> tuple[str, bool]:
    """Retire la fin laissée en suspens. Renvoie (phrase, a_ete_coupee).

    On ne complète jamais : compléter, ce serait inventer une intention que le
    document n'exprime pas. On s'arrête au dernier groupe qui se tient."""
    avant = phrase
    while True:
        raccourcie = EN_SUSPENS.sub('', phrase).rstrip(' ,;:')
        if raccourcie == phrase:
            return phrase, phrase != avant
        phrase = raccourcie


def premier_paragraphe(blocs: list[str], limite: int = 420) -> str:
    """La description d'une fiche tient en un paragraphe : celui qui présente le
    poste. Tout concaténer donnait un pavé où la mission, les puces et la phrase
    d'introduction « Au quotidien, sa mission consiste à : » se suivaient."""
    texte = ''
    for bloc in blocs:
        if bloc.rstrip().endswith(':'):      # une amorce de liste : on s'arrête
            break
        texte = (texte + ' ' + bloc).strip()
        if len(texte) >= limite:
            break
    if len(texte) > limite:
        # Couper à la fin de phrase précédente plutôt qu'au milieu d'un mot.
        coupe = texte[:limite].rsplit('. ', 1)
        texte = (coupe[0] + '.') if len(coupe) > 1 else texte[:limite].rsplit(' ', 1)[0] + '…'
    return texte


def texte_docx(chemin: Path) -> str:
    x = zipfile.ZipFile(chemin).read('word/document.xml').decode('utf-8')
    return html.unescape(''.join(TEXTE_XML.findall(x)))


# Les étiquettes de l'en-tête, telles que les documents les écrivent. Chaque
# valeur court jusqu'à l'étiquette suivante : les zones de texte n'ont aucun
# séparateur, « …des collègesIntitulé du poste : » se suit d'un bloc.
ETIQUETTES = ['Direction', 'Service', 'Intitulé du poste', 'Cadre d’emploi/filière',
              'Type de vacance', 'Numéro de vacance', 'Poste demandé en mobilité']


def entete_docx(chemin: Path) -> dict:
    """Les métadonnées vivent dans les zones de texte, que python-docx ne voit pas.

    ⚠️ Les documents séparent l'étiquette du deux-points par une ESPACE
    INSÉCABLE (U+00A0), comme le veut la typographie française. Chercher
    « Service : » avec une espace ordinaire ne trouve donc rien — et sans
    garde-fou, on ne s'en apercevrait qu'à la lecture des fiches publiées.
    """
    brut = texte_docx(chemin).replace('\xa0', ' ')
    alternative = '|'.join(re.escape(e) for e in ETIQUETTES)
    trouve = {}
    for m in re.finditer(rf'({alternative})\s*:\s*(.*?)(?=(?:{alternative})\s*:|$)',
                         brut, re.S):
        trouve.setdefault(m.group(1), re.sub(r'\s+', ' ', m.group(2)).strip())
    mobilite = trouve.get('Poste demandé en mobilité', '')
    trouve['mobilité'] = ('interne et externe' if 'externe' in mobilite
                          else 'interne' if 'interne' in mobilite else '')
    return trouve


def corps_docx(chemin: Path) -> dict:
    """Le corps, découpé sur les intitulés de section."""
    import docx
    lignes = [p.text.strip() for p in docx.Document(chemin).paragraphs if p.text.strip()]
    blocs, courante = {}, None
    for ligne in lignes:
        titre = next((s for s in SECTIONS if ligne.rstrip(' :') == s.rstrip(' :')), None)
        if titre:
            courante = titre
            blocs.setdefault(courante, [])
        elif courante:
            blocs[courante].append(re.sub(r'\s+', ' ', ligne).strip(' ;.'))
    return blocs


def fiche_pdf(chemin: Path) -> dict:
    """Le PDF suit un autre gabarit : un tableau « Identification du poste »
    puis des sections numérotées. On lit ce qu'il donne, sans le forcer."""
    def lire(*options):
        return subprocess.run(['pdftotext', *options, str(chemin), '-'],
                              capture_output=True, text=True, check=True).stdout
    # Le tableau d'identification a besoin de l'alignement pour séparer
    # l'étiquette de sa valeur ; le corps, lui, est tronqué à la largeur des
    # colonnes en mode « -layout » et doit être lu au fil du texte.
    texte = lire('-layout')
    flux = lire()
    def champ(etiquette):
        # `\s+` et non `\s{2,}` : le tableau du PDF sépare parfois l'étiquette
        # de sa valeur par une seule espace.
        m = re.search(rf'{etiquette}\s+(.+)', texte)
        return re.sub(r'\s+', ' ', m.group(1)).strip() if m else ''

    def section(numero, suivant):
        m = re.search(rf'{numero}\)\s*(.+?)(?={suivant}\)|\Z)', flux, re.S)
        if not m:
            return []
        corps = m.group(1).split('\n', 1)[1] if '\n' in m.group(1) else ''
        return [re.sub(r'\s+', ' ', l).strip(' •-;.')
                for l in corps.split('\n') if len(l.strip()) > 25]

    return {
        'titre': champ('Intitulé du poste'),
        'grade': champ(r'Grade du poste \(filière/catégorie\)'),
        'service': champ(r'Service \(et unité le cas échéant\)'),
        'lieu': champ('Localisation du poste'),
        'reference': champ(r'N° de fiche / Référence DCIP'),
        'missions': section(3, 4),
        'activites': section(4, 5),
        'competences': section(5, 6),
    }


def categorie(cadre: str) -> tuple[str, str]:
    """« B-C /TE » → (« B / C », « Filière technique »). Ce qui n'est pas
    reconnu est renvoyé vide, et bloque l'écriture plutôt que d'inventer."""
    cadre = re.sub(r'\s+', ' ', cadre or '').strip()
    lettres = re.findall(r'\b([ABC])\b', cadre.split('/')[0].replace('-', ' '))
    cat = ' / '.join(dict.fromkeys(lettres))
    bas = sans_accents(cadre.lower())
    filieres = []
    if 'techni' in bas or re.search(r'/\s*t', bas):
        filieres.append('technique')
    if 'administrat' in bas:
        filieres.append('administrative')
    return cat, ('Filière ' + ' ou '.join(filieres)) if filieres else ''


def depuis_docx(chemin: Path) -> tuple[dict, list]:
    entete, corps = entete_docx(chemin), corps_docx(chemin)
    anomalies = []

    titre = joli_titre(entete.get('Intitulé du poste', ''))
    service_brut = entete.get('Service', '')
    reference = entete.get('Numéro de vacance', '')
    service = SERVICES.get(re.sub(r'\s+', ' ', service_brut).strip().lower())
    cat, filiere = categorie(entete.get('Cadre d’emploi/filière', ''))

    mission = corps.get('Mission de l’agent dans le service') or corps.get('Mission de l’agent') or []
    activites = corps.get('Activités de l’agent') or []
    profils = (corps.get('Compétences requises (savoirs)') or []) + \
              (corps.get('Qualités attendues (savoir être)') or [])
    attributs = corps.get('Attributs du poste') or []
    lieu = next((re.sub(r'^Lieu de travail\s*:\s*', '', a) for a in attributs
                 if a.lower().startswith('lieu de travail')), 'Nice — CADAM')
    if lieu.upper() == 'CADAM':
        lieu = 'Nice — CADAM'

    if not titre:
        anomalies.append('intitulé du poste introuvable')
    if not service:
        anomalies.append(f'service non reconnu : « {service_brut} »')
    if not cat:
        anomalies.append(f"cadre d'emploi illisible : « {entete.get('Cadre d’emploi/filière', '')} »")
    if not mission:
        anomalies.append("section « Mission de l'agent » vide")
    if len(activites) < 3:
        anomalies.append(f'{len(activites)} activité(s) extraite(s) — le découpage a échoué')
    if not profils:
        anomalies.append('aucune compétence ni qualité extraite')

    return {
        'id': identifiant(titre or chemin.stem),
        'titre': titre,
        'service': service or '',
        'ico': ICONES.get(service, '🏢'),
        'tag': '',
        'cat': cat,
        'contrat': f"Cat. {cat.replace(' / ', '/')}" if cat else '',
        'filiere': filiere,
        'lieu': lieu,
        'url': '',
        'sans_annonce': True,
        'mobilite': entete.get('mobilité', ''),
        'reference': reference,
        'desc': premier_paragraphe(mission),
        'missions': [couper_proprement(a)[0] for a in activites[:8]],
        'profils': [couper_proprement(x)[0] for x in profils[:6]],
        'deadline_source': '',
    }, anomalies


def depuis_pdf(chemin: Path) -> tuple[dict, list]:
    brut = fiche_pdf(chemin)
    anomalies = []
    titre = joli_titre(brut['titre'])
    service = SERVICES.get(brut['service'].strip().lower())
    cat, filiere = categorie(brut['grade'])
    activites = brut['activites'] or brut['missions']
    if not titre:
        anomalies.append('intitulé du poste introuvable')
    if not service:
        anomalies.append(f"service non reconnu : « {brut['service']} »")
    if not cat:
        anomalies.append(f"grade illisible : « {brut['grade']} »")
    if len(activites) < 3:
        anomalies.append(f'{len(activites)} activité(s) extraite(s) — le découpage a échoué')
    tronquees = [a for a in activites[:8] if couper_proprement(a)[1]]
    for t in tronquees:
        print(f"    ⚠ phrase tronquée dans le document source, fin retirée : « …{t[-60:]} »",
              file=sys.stderr)

    lieu = 'Nice — CADAM' if brut['lieu'].upper().startswith('CADAM') else (brut['lieu'] or 'Nice — CADAM')
    return {
        'id': identifiant(titre or chemin.stem),
        'titre': titre,
        'service': service or '',
        'ico': ICONES.get(service, '🏢'),
        'tag': '',
        'cat': cat,
        'contrat': f"Cat. {cat.replace(' / ', '/')}" if cat else '',
        'filiere': filiere,
        'lieu': lieu,
        'url': '',
        'sans_annonce': True,
        'mobilite': '',
        'desc': premier_paragraphe(brut['missions']),
        'missions': [couper_proprement(a)[0] for a in activites[:8]],
        'profils': [couper_proprement(x)[0] for x in (brut['competences'] or [])[:6]],
        'deadline_source': '',
    }, anomalies


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ecrire', action='store_true', help='ajoute les fiches à data/postes-dcip.json')
    args = ap.parse_args()

    documents = sorted(list(SOURCES.glob('*.docx')) + list(SOURCES.glob('*.pdf')))
    if not documents:
        print(f'Aucun document dans {SOURCES}', file=sys.stderr)
        return 1

    postes = json.loads(POSTES.read_text(encoding='utf-8'))
    connus = {p['id'] for p in postes}
    nouvelles, bloquant = [], False

    for chemin in documents:
        fiche, anomalies = (depuis_pdf if chemin.suffix == '.pdf' else depuis_docx)(chemin)
        etat = 'déjà présente' if fiche['id'] in connus else 'nouvelle'
        print(f"{chemin.name:16} → {fiche['titre'] or '(sans titre)'}")
        print(f"{'':16}   {fiche['service'] or '(service inconnu)'} · {fiche['contrat']} · "
              f"{fiche['filiere']} · {len(fiche['missions'])} activités · "
              f"{len(fiche['profils'])} éléments de profil · {etat}")
        for a in anomalies:
            print(f"{'':16}   ⛔ {a}", file=sys.stderr)
        bloquant = bloquant or bool(anomalies)
        if fiche['id'] not in connus:
            nouvelles.append(fiche)

    if bloquant:
        print("\nRien n'a été écrit : une fiche incomplète vaut moins que pas de fiche.",
              file=sys.stderr)
        return 1
    if not args.ecrire:
        print(f'\n{len(nouvelles)} fiche(s) prête(s). Relancer avec --ecrire pour les ajouter.')
        return 0

    postes.extend(nouvelles)
    POSTES.write_text(json.dumps(postes, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'\n{len(nouvelles)} fiche(s) ajoutée(s) — {len(postes)} au total.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
