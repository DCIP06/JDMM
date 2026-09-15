#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrait le CSS des panneaux de quiz depuis sources/quiz-hub-mobile.html
vers css/quiz.css, en réparant ce qui était cassé.

Le fichier source portait sept sélecteurs annulés par un commentaire placé À
L'INTÉRIEUR du sélecteur (`#qz-feu /* HEADER */ .brand-row`) : la règle entière
était ignorée par le navigateur. Étaient concernés l'écran d'intro, l'en-tête
de question, l'écran de résultats, l'animation d'apparition, la texture de
fond, et TOUT le bloc responsive sous 540 px — c'est-à-dire l'essentiel de la
mise en page sur un téléphone.

Le cahier des charges demandait explicitement de corriger ces sélecteurs.
"""

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / 'sources' / 'quiz-hub-mobile.html'
SORTIE = RACINE / 'css' / 'quiz.css'

# Le quiz « feu » nomme son accent --flame, les deux autres --accent : on
# uniformise pour n'avoir qu'un seul jeu de règles.
RENOMMAGES = {'--flame-2': '--accent-2', '--flame': '--accent', '--gold': '--amber'}

# Les variables du fichier source (--bg, --surface, --text, --line…) portent les
# mêmes noms que celles des thèmes de l'application, où --surface vaut #FFFFFF.
# Sans préfixe, les options d'un quiz héritaient d'un fond blanc sur fond noir.
PREFIXE = 'qz-'
VARIABLES = ('bg', 'bg-2', 'surface', 'surface-2', 'line', 'text', 'text-mute',
             'text-soft', 'accent', 'accent-2', 'amber', 'green', 'red', 'shadow')


def decouper(css):
    """Découpe une feuille en règles de premier niveau, @media compris."""
    regles, i, n = [], 0, len(css)
    while i < n:
        # Sauter les espaces et commentaires de tête, sinon un @media ou un
        # @keyframes précédé d'un retour à la ligne prend le chemin des règles
        # simples : il est alors coupé à sa première accolade fermante, ce qui
        # laisse le reste de la feuille non fermé — donc entièrement ignoré
        # par le navigateur.
        if css[i] in ' \t\r\n':
            i += 1
            continue
        if css.startswith('/*', i):
            fin_c = css.find('*/', i)
            i = (fin_c + 2) if fin_c > 0 else n
            continue
        # Le source préfixe TOUTES les lignes de sélecteur par « #qz-xxx », y
        # compris la ligne de commentaire qui précède un @media :
        #     #qz-feu /* ---------- RESPONSIVE ---------- */
        #     @media (max-width: 540px) {
        # Le bloc ne commence donc pas par « @ ». On regarde ce qu'il y a
        # vraiment avant l'accolade, commentaires retirés.
        prochaine = css.find('{', i)
        tete = re.sub(r'/\*.*?\*/', ' ', css[i:prochaine], flags=re.S) if prochaine > 0 else ''
        if css[i] == '@' or '@media' in tete or '@keyframes' in tete or '@supports' in tete:
            j = css.index('{', i)
            prof, k = 1, j + 1
            while k < n and prof:
                if css[k] == '{':
                    prof += 1
                elif css[k] == '}':
                    prof -= 1
                k += 1
            regles.append(css[i:k])
            i = k
        else:
            j = css.find('{', i)
            if j < 0:
                break
            k = css.find('}', j)
            regles.append(css[i:k + 1])
            i = k + 1
    return regles


def reparer(selecteur):
    """Retire les commentaires internes qui annulaient le sélecteur."""
    selecteur = re.sub(r'/\*.*?\*/', ' ', selecteur, flags=re.S)
    return re.sub(r'\s+', ' ', selecteur).strip().lstrip('}').strip()


# Les identifiants des quiz se lisent dans la source : les figer ici ferait
# retomber une palette entière dans les règles communes le jour où la DCIP
# renomme un quiz — sans la moindre erreur à l'écran.
IDENTIFIANTS: list[str] = []
MOTIF_QUIZ = r'#qz-(feu)'          # recalculé au chargement de la source


def reperer_quiz(source: str) -> None:
    global IDENTIFIANTS, MOTIF_QUIZ
    IDENTIFIANTS = sorted(set(re.findall(r'id="qz-([a-z0-9]+)"', source)))
    if not IDENTIFIANTS:
        sys.exit("Aucun panneau « id=\"qz-… \" » dans la source : rien n'a été écrit.")
    MOTIF_QUIZ = r'#qz-(' + '|'.join(IDENTIFIANTS) + r')'


def porter(selecteur):
    """
    Reporte un sélecteur « #qz-feu … » sur la classe de l'application.

    Une règle qui ne vise QU'UN quiz garde son attribut : « #qz-feu » devient
    « .quiz[data-quiz="feu"] ». Sans cela, les trois fonds dégradés — un par
    quiz — se retrouvaient tous sur « .quiz », et le dernier écrasait les deux
    autres : les trois quiz affichaient le même fond.

    Une règle qui vise les trois (« #qz-feu, #qz-gard, #qz-surt ») va bien sur
    « .quiz », puisqu'elle leur est commune.
    """
    vises = set(re.findall(MOTIF_QUIZ, selecteur))
    remplacement = '.quiz' if len(vises) != 1 else f'.quiz[data-quiz="{vises.pop()}"]'
    # La source garde des sélecteurs d'anciens quiz supprimés depuis
    # (« #qz-gard », « #qz-surt ») : on ne les recopie pas dans la feuille.
    selecteur = ', '.join(
        part for part in selecteur.split(',')
        if not (re.search(r'#qz-([a-z0-9]+)', part)
                and re.search(r'#qz-([a-z0-9]+)', part).group(1) not in IDENTIFIANTS)) or selecteur
    for ident in IDENTIFIANTS:
        selecteur = selecteur.replace(f'#qz-{ident}::before', '&::before')
    selecteur = re.sub(MOTIF_QUIZ, remplacement, selecteur)
    # Le doublon « .quiz, .quiz » du source, et « .quiz .quiz::before ».
    morceaux = [m.strip() for m in selecteur.split(',')]
    vus, propres = set(), []
    for m in morceaux:
        m = re.sub(r'(\.quiz(?:\[[^\]]*\])?) &::before', r'\1::before', m)
        m = m.replace('&::before', '.quiz::before')
        m = re.sub(r'^(\.quiz(?:\[[^\]]*\])?) \.quiz(?:\[[^\]]*\])?', r'\1', m)
        if m and m not in vus:
            vus.add(m)
            propres.append(m)
    return ', '.join(propres)


def renommer(corps):
    for avant, apres in RENOMMAGES.items():
        corps = corps.replace(f'var({avant})', f'var({apres})')
        corps = re.sub(rf'^(\s*){re.escape(avant)}\s*:', rf'\1{apres}:', corps, flags=re.M)
    # Puis on préfixe, du nom le plus long au plus court pour ne pas couper
    # « --text-mute » en traitant « --text ».
    for nom in sorted(VARIABLES, key=len, reverse=True):
        corps = corps.replace(f'var(--{nom})', f'var(--{PREFIXE}{nom})')
        corps = re.sub(rf'(^|\s)--{re.escape(nom)}\s*:', rf'\1--{PREFIXE}{nom}:', corps)
    return corps


def main():
    html = SOURCE.read_text(encoding='utf-8')
    reperer_quiz(html)
    css = re.findall(r'<style>(.*?)</style>', html, re.S)[0]
    regles = decouper(css)

    # Les trois quiz portent les mêmes règles, à leurs variables près : le
    # source les répète donc trois fois. On conserve l'ORDRE d'origine — la
    # cascade en dépend — et on écarte seulement les répétitions à l'identique.
    # Regrouper par sélecteur serait faux : « #qz-feu » porte successivement
    # ses variables, puis son fond, puis sa hauteur ; ce sont trois règles
    # distinctes, pas trois variantes d'une même règle.
    palettes, medias = {}, []
    composants = []        # [(sélecteur porté, corps)]
    deja_vues = set()
    repares = 0

    # Le hub a son propre design, sur fond clair : ses règles sont reprises
    # telles quelles, en portant #hub sur .hub.
    hub = []
    ecartes = []
    for regle in regles:
        # Un @keyframes ne porte jamais de préfixe de quiz : tous sont repris,
        # sans quoi une animation référencée ailleurs ne joue simplement pas.
        if re.match(r'^\s*(#hub|\.hub-|\.quiz-grid|\.quiz-card|\.card-|\.dot\b'
                    r'|\.goodie-msg|@keyframes)', regle):
            sel, corps = regle.split('{', 1)
            sel = reparer(sel).replace('#hub', '.hub')
            if sel.startswith('@keyframes'):
                hub.append(regle.strip())
            else:
                hub.append(f'{sel} {{{corps.rstrip().rstrip("}")}}}')
            continue
        # Un @media qui ne parle que du hub (téléphone en paysage, par exemple)
        # n'a pas de préfixe non plus : il se reprend en portant #hub sur .hub.
        if regle.lstrip().startswith('@media') and '#qz-' not in regle:
            entete, corps = regle.split('{', 1)
            hub.append(f'{reparer(entete)} {{{corps.rstrip().rstrip("}").replace("#hub", ".hub")}}}')
            continue
        if '#qz-' not in regle:
            # Une règle sans préfixe échappe au portage et disparaît sans bruit :
            # c'est ainsi que .qz-back s'était retrouvé sans style. On les compte
            # pour qu'un ajout de la DCIP ne passe plus inaperçu.
            ecartes.append(re.sub(r'\s+', ' ', regle.split('{', 1)[0]).strip()[:70])
            continue

        entete_brute = re.sub(r'/\*.*?\*/', ' ', regle.split('{', 1)[0], flags=re.S)
        if '@media' in entete_brute or '@keyframes' in entete_brute or '@supports' in entete_brute:
            entete, corps = regle.split('{', 1)
            entete = reparer(entete)
            # On jette ce qui précède le @ : c'est le préfixe parasite du source.
            if not entete.startswith('@'):
                entete = '@' + entete.split('@', 1)[1]
                repares += 1
            interieur = corps.rsplit('}', 1)[0]
            interieur = renommer(re.sub(MOTIF_QUIZ, '.quiz', interieur))
            medias.append(f'{entete} {{{interieur}}}')
            continue

        selecteur, corps = regle.split('{', 1)
        casse = '/*' in selecteur
        selecteur = reparer(selecteur)
        if casse:
            repares += 1
        corps = renommer(corps.rstrip().rstrip('}'))

        # Les blocs de variables restent attachés à leur quiz.
        quiz = re.match(rf'^{MOTIF_QUIZ}$', selecteur)
        # Une palette se reconnaît à une DÉCLARATION de variable (« --qz-bg: »),
        # pas à son usage (« var(--qz-bg) ») : le bloc de fond dégradé utilise
        # la variable sans la définir, et passait pour une palette.
        if quiz and re.search(rf'--{PREFIXE}bg\s*:', corps):
            # Un quiz peut porter PLUSIEURS blocs de variables : la palette
            # d'origine, puis un correctif qui n'en redéfinit qu'une partie.
            # Les remplacer perdrait les couleurs que le correctif ne cite pas
            # — les boutons se retrouvaient sans fond. On les cumule, dans
            # l'ordre : la cascade fait le reste.
            palettes.setdefault(quiz.group(1), []).append(corps)
            continue

        cle = porter(selecteur)
        normalise = re.sub(r'\s+', ' ', corps).strip()
        if (cle, normalise) in deja_vues:
            continue
        deja_vues.add((cle, normalise))
        composants.append((cle, normalise))

    # Une règle identique pour les trois quiz peut être écrite une seule fois,
    # sur « .quiz ». C'est sans risque : les trois valeurs de data-quiz sont
    # mutuellement exclusives, donc seul compte l'ordre AU SEIN d'un quiz, et
    # la fusion se fait à la position de la première occurrence.
    generique = lambda sel: re.sub(r'\.quiz\[data-quiz="[a-z0-9]+"\]', '.quiz', sel)
    compte = {}
    for sel, corps in composants:
        compte.setdefault((generique(sel), corps), []).append(sel)

    sortie_composants, emises, fusionnees = [], set(), 0
    for sel, corps in composants:
        cle = (generique(sel), corps)
        if cle in emises:
            continue
        emises.add(cle)
        porteurs = list(dict.fromkeys(compte[cle]))
        if len(porteurs) == len(IDENTIFIANTS):     # portée par tous les quiz
            fusionnees += 1
            sortie_composants.append(f'{generique(sel)} {{ {corps} }}')
        else:
            # Deux quiz sur trois peuvent partager une règle : il faut alors
            # GROUPER leurs sélecteurs. N'émettre que le premier ferait perdre
            # la règle au second, sans la moindre erreur visible — c'est ainsi
            # que le quiz « etu » s'était retrouvé sans boutons.
            sortie_composants.append(f'{", ".join(porteurs)} {{ {corps} }}')

    sortie_palettes = [f'.quiz[data-quiz="{q}"] {{{"".join(blocs)}}}'
                       for q, blocs in palettes.items()]

    # Les @media sont identiques d'un quiz à l'autre : un seul suffit.
    medias = list(dict.fromkeys(medias))

    SORTIE.write_text(f"""/* ==========================================================================
   quiz.css — GÉNÉRÉ par scripts/extraire_css_quiz.py, ne pas éditer à la main
   --------------------------------------------------------------------------
   Design repris tel quel de sources/quiz-hub-mobile.html, porté de
   « #qz-feu … » sur « .quiz[data-quiz] » pour que les trois quiz partagent
   un seul jeu de règles.

   {repares} sélecteurs du fichier source étaient annulés par un commentaire placé à
   l'intérieur du sélecteur — ils sont réparés ici. Sans cela, l'écran d'intro,
   l'en-tête de question, l'écran de résultats, l'animation d'apparition et
   tout le bloc responsive sous 540 px n'étaient jamais appliqués.

   L'accent du quiz « feu » se nommait --flame, celui des deux autres
   --accent : uniformisé en --accent.
   ========================================================================== */

/* ---------- Le hub, sur fond clair ---------- */
{chr(10).join(hub)}

/* ---------- Palettes, une par quiz ---------- */
{chr(10).join(sortie_palettes)}

/* ---------- Composants ---------- */
{chr(10).join(sortie_composants)}

/* ---------- Adaptations d'écran ---------- */
{chr(10).join(medias)}
""", encoding='utf-8')

    if ecartes:
        uniques = sorted(set(ecartes))
        print(f"  {len(uniques)} sélecteur(s) sans préfixe #qz- NON repris — "
              f"vérifiez qu'aucun ne sert à l'application :")
        for sel in uniques[:12]:
            print(f"    {sel}")
        if len(uniques) > 12:
            print(f"    … et {len(uniques) - 12} autres")
    print(f"css/quiz.css : {len(sortie_palettes)} palettes, {len(sortie_composants)} règles, "
          f"{len(medias)} bloc(s) responsive · {repares} sélecteurs réparés "
          f"· {fusionnees} règles communes fusionnées · {len(hub)} règles de hub")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
