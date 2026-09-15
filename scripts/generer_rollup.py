#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Recompose le roll-up « Vie d'un projet immobilier » à un autre format.

Le roll-up d'origine (sources/timeline_rollup_60x160cm.pdf) mesure 60 × 160 cm.
Ce script le recompose à la taille demandée sans toucher au contenu : mêmes
textes, mêmes retours à la ligne, même rythme vertical.

    python3 scripts/generer_rollup.py                  # 84 × 160 cm
    python3 scripts/generer_rollup.py --largeur 60     # le format d'origine
    python3 scripts/generer_rollup.py --html-seul      # pas de PDF

Comment le format est adapté
----------------------------
Élargir sans grandir en hauteur n'est pas une homothétie. Le texte fixe la
hauteur du document : l'agrandir de 40 % allongerait le roll-up d'une vingtaine
de centimètres, et il n'y a pas d'espace vertical à reprendre sans modifier les
espacements. Donc :

  * le texte courant garde sa taille physique et son interlettrage ;
  * les positions, les blocs, les pastilles et les filets suivent le format ;
  * la titraille dont l'interlettrage sert manifestement à occuper la largeur
    (bandeau, blocs d'étapes, pied) garde sa PROPORTION de largeur — c'est un
    réglage graphique, il ne touche ni au texte ni à sa mise à la ligne.

Les positions verticales, elles, sont celles du document d'origine, relevées au
point près dans `data/rollup-source.json` : rien n'est réinventé.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / 'data' / 'rollup-source.json'      # géométrie relevée dans le PDF
ICONES = RACINE / 'data' / 'rollup-icones.json'      # tracés des 10 icônes
CONTENU = RACINE / 'data' / 'timeline.json'          # textes, extraits du PDF
SORTIE = RACINE / 'assets' / 'rollup'

# Le PDF source mesure 1275.59 × 3401.57 pt pour un roll-up de 600 × 1600 mm.
PT_L, PT_H = 1275.590551, 3401.574803
SRC_L, SRC_H = 600.0, 1600.0

# --------------------------------------------------------------------------
# Repères horizontaux du document d'origine, en points
# --------------------------------------------------------------------------
BANDE = 23.4            # bande ambre du bord gauche
RAIL = 170.1            # axe du rail vertical et des pastilles
PASTILLE = 91.0         # diamètre des pastilles
COLONNE = 287.0         # colonne de texte
PUCES = 298.3           # retrait des puces
BADGE_X = 422.1         # premier badge d'intervenants
BADGE_H = 31.3
BADGE_PAD = 19.6        # de chaque côté du texte
BADGE_GAP = 8.6
ICONE_X, ICONE_COTE = 1116.1, 68.3

ETAPES_X = [63.8, 446.4, 829.1]
ETAPES_L = 374.2
ETAPES_Y, ETAPES_H = 616.5, 116.9

# Écart entre le haut d'une boîte de ligne CSS et le haut des caractères,
# en fraction du corps. Mesuré sur le PDF produit, pas supposé.
HAUT_DE_LIGNE = 0.170
# Reliquat pour les badges, dont le texte est centré par flexbox. Mesuré aussi.
BADGE_AJUST = 1.42

AMBRE = '#E8A33D'
ENCRE = '#0A2540'

# Dégradés relevés dans le PDF (palette Tailwind : le document venait du web).
DEGRADES = {
    'conception':  ('#3B6BAA', '#0A2540'),
    'realisation': ('#EA580C', '#7C2D12'),
    'exploitation': ('#14B8A6', '#134E4A'),
}
BANDEAU_HAUT = ('#0A2540', '#1E4D8F')
BANDEAU_PIED = ('#1E4D8F', '#0A2540')


def charger():
    for f in (SOURCE, ICONES, CONTENU):
        if not f.exists():
            sys.exit(f"Fichier absent : {f.relative_to(RACINE)}\n"
                     f"Lancez d'abord scripts/extraire_timeline.py.")
    return (json.loads(SOURCE.read_text('utf-8')),
            json.loads(ICONES.read_text('utf-8')),
            json.loads(CONTENU.read_text('utf-8')))


def roles(src):
    """Range les blocs de texte du PDF par rôle, pour en reprendre les hauteurs."""
    t = sorted(src['textes'], key=lambda x: (x['top'], x['x0']))

    def par(taille, police=None, x0=None, hors_x0=None):
        r = [x for x in t if abs(x['taille'] - taille) < 0.02]
        if police:  r = [x for x in r if x['police'].endswith(police)]
        if x0 is not None:    r = [x for x in r if abs(x['x0'] - x0) < 0.5]
        if hors_x0 is not None: r = [x for x in r if abs(x['x0'] - hors_x0) >= 0.5]
        return r

    return {
        'departement': par(51.02)[0],
        'direction':   par(27.64)[0],
        'timeline':    par(80.79)[0],
        'sur_timeline': par(25.51)[0],
        'accroche':    par(31.89),
        'phases_num':  par(19.13, 'Bold'),
        'etapes_nom':  par(36.14),
        'etapes_sous': [x for x in par(19.13, 'Italic') if x['top'] < 3000],
        'surtitres':   par(14.23, 'Bold', x0=COLONNE),
        'titres':      par(25.61),
        'citations':   par(15.65, 'Italic'),
        'puces':       par(15.65, 'Regular'),
        'numeros':     par(34.15),
        'intervenants': par(12.80),
        'badges':      par(14.23, 'Bold', hors_x0=COLONNE),
        'pied_titre':  par(25.51)[1],
        'pied_sous':   [x for x in par(19.13, 'Italic') if x['top'] > 3000][0],
    }


def lignes_de_badges(badges):
    """Les intervenants tiennent sur une ou deux lignes : on garde la répartition."""
    par_y = {}
    for b in badges:
        par_y.setdefault(round(b['top']), []).append(b)
    return [sorted(v, key=lambda x: x['x0']) for _, v in sorted(par_y.items())]


def echapper(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def composer(largeur_cm, hauteur_cm):
    src, icones, contenu = charger()
    r = roles(src)

    L, H = largeur_cm * 10.0, hauteur_cm * 10.0      # en mm
    kh = (L / SRC_L) * (SRC_L / PT_L)                # pt source → mm, horizontal
    kv = (H / SRC_H) * (SRC_H / PT_H)                # pt source → mm, vertical
    # Rapport d'élargissement : ce qui suit le format plutôt que le texte.
    format_ = (L / SRC_L) / (H / SRC_H)

    def x(v):  return round(v * kh, 3)
    def y(v):  return round(v * kv, 3)
    def tx(v): return round(v * kv, 3)               # taille de texte : suit la hauteur

    def yt(bloc):
        """Haut de la boîte CSS pour que les glyphes tombent où ils tombaient.

        La position relevée dans le PDF est celle du haut des caractères ; celle
        d'un bloc CSS est celle de sa boîte de ligne, qui commence plus haut.
        L'écart, mesuré sur le document produit, vaut HAUT_DE_LIGNE × le corps.
        """
        return round(bloc['top'] * kv + HAUT_DE_LIGNE * bloc['taille'] * kv, 3)

    out = []
    a = out.append

    # ---- décor -----------------------------------------------------------
    a(f'<div class="bande" style="width:{x(BANDE)}mm"></div>')
    # Les bandeaux commencent APRÈS la bande ambre : elle court sur toute la
    # hauteur du roll-up, du haut du bandeau au bas du pied.
    h_bandeau = y(435.8)
    a(f'<div class="bandeau haut" style="height:{h_bandeau}mm"></div>')
    for haut, bas in ((435.8, 446.5), (3252.8, 3263.4)):
        a(f'<div class="filet" style="top:{y(haut)}mm;height:{y(bas-haut)}mm;'
          f'left:{x(BANDE)}mm;width:{x(PT_L-BANDE)}mm"></div>')
    a(f'<div class="bandeau pied" style="top:{y(3263.4)}mm;'
      f'height:{y(PT_H-3263.4)}mm"></div>')

    def centre(bloc, texte, classe, couleur=None, suit_format=False):
        """Un texte centré sur la largeur de la page."""
        cible = (bloc['x1'] - bloc['x0']) * kh if suit_format \
                else (bloc['x1'] - bloc['x0']) * kv
        style = (f"top:{yt(bloc)}mm;font-size:{tx(bloc['taille'])}mm"
                 + (f";color:{couleur}" if couleur else ''))
        a(f'<div class="{classe} centre" style="{style}" data-largeur="{cible:.3f}">'
          f'{echapper(texte)}</div>')

    # ---- bandeau du haut -------------------------------------------------
    centre(r['departement'], 'DÉPARTEMENT DES ALPES-MARITIMES', 'gras clair', suit_format=True)
    fl = r['departement']
    a(f'<div class="filet-titre" style="top:{y(140.3)}mm;'
      f'left:{(L - x(1020.5-255.1))/2:.3f}mm;width:{x(1020.5-255.1)}mm;'
      f'height:{max(tx(2.6), 0.6):.3f}mm"></div>')
    centre(r['direction'], "Direction de la Construction, de l'Immobilier et du Patrimoine",
           'normal clair')
    centre(r['timeline'], 'TIMELINE', 'gras clair', suit_format=True)
    centre(r['sur_timeline'], "D'UN PROJET IMMOBILIER", 'gras', AMBRE, suit_format=True)

    # ---- accroche --------------------------------------------------------
    sous = contenu['sous_titre']
    coupe = sous.index('—')
    for bloc, texte in zip(r['accroche'], (sous[:coupe].strip(), sous[coupe:].strip())):
        centre(bloc, texte, 'gras-italique', ENCRE)

    # ---- les trois étapes ------------------------------------------------
    for i, etape in enumerate(contenu['etapes']):
        gx, gl = x(ETAPES_X[i]), x(ETAPES_L)
        a(f'<div class="etape" style="left:{gx}mm;width:{gl}mm;top:{y(ETAPES_Y)}mm;'
          f'height:{y(ETAPES_H)}mm;background:{etape["couleur"]};'
          f'border-radius:{y(14)}mm"></div>')
        bornes = (3 * i, 3 * i + 1, 3 * i + 2)
        libelles = (f'Phases {"01 — 03" if i==0 else "04 — 07" if i==1 else "08 — 10"}',
                    etape['titre'].upper(), etape['accroche'])
        for bloc, texte, classe in zip(
                (r['phases_num'][i], r['etapes_nom'][i], r['etapes_sous'][i]),
                libelles, ('gras clair', 'gras clair', 'italique clair')):
            cible = (bloc['x1'] - bloc['x0']) * kh
            a(f'<div class="{classe} centre-bloc" style="top:{yt(bloc)}mm;'
              f'left:{gx}mm;width:{gl}mm;font-size:{tx(bloc["taille"])}mm" '
              f'data-largeur="{cible:.3f}">{echapper(texte)}</div>')

    # ---- le rail vertical, une couleur par étape -------------------------
    for f in src['formes']:
        if f['type'] == 'line' and abs(f['x0'] - RAIL) < 1 and f['h'] > 40:
            a(f'<div class="rail" style="left:{x(RAIL) - x(f["ep"])/2:.3f}mm;'
              f'width:{x(f["ep"])}mm;top:{y(f["top"])}mm;height:{y(f["h"])}mm;'
              f'background:{f["trait"]}"></div>')

    # ---- les dix phases --------------------------------------------------
    par_ligne = lignes_de_badges(r['badges'])
    services = {s['id']: s for s in contenu['services']}
    i_puce, i_ligne = 0, 0

    for n, phase in enumerate(contenu['phases']):
        etape = phase['etape']
        couleur = next(e['couleur'] for e in contenu['etapes'] if e['id'] == etape)
        haut, bas = DEGRADES[etape]

        # pastille numérotée
        d = x(PASTILLE)
        centre_y = y((src_p := [f for f in src['formes']
                                if f['fond'] and str(f['fond']).startswith('p')
                                and abs(f['x0'] - 124.5) < 1][n])['top'] + PASTILLE / 2)
        a(f'<div class="pastille" style="left:{x(RAIL) - d/2:.3f}mm;'
          f'top:{centre_y - d/2:.3f}mm;width:{d}mm;height:{d}mm;'
          f'background:linear-gradient(135deg,{haut},{bas});'
          f'border:{max(x(4.98), 0.4):.3f}mm solid #fff">'
          f'<span style="font-size:{x(r["numeros"][n]["taille"])}mm">'
          f'{phase["num"]:02d}</span></div>')

        # surtitre, titre, citation
        sur = r['surtitres'][n]
        # Le libellé de l'étape, pas son identifiant : « RÉALISATION » garde son accent.
        nom_etape = next(e['titre'] for e in contenu['etapes'] if e['id'] == etape)
        etiquette = f'PHASE {phase["num"]:02d} · {nom_etape.upper()}'
        a(f'<div class="surtitre" style="left:{x(COLONNE)}mm;top:{yt(sur)}mm;'
          f'font-size:{tx(sur["taille"])}mm;color:{couleur}" '
          f'data-largeur="{(sur["x1"]-sur["x0"])*kv:.3f}">{echapper(etiquette)}</div>')
        t = r['titres'][n]
        a(f'<div class="titre-phase" style="left:{x(COLONNE)}mm;top:{yt(t)}mm;'
          f'font-size:{tx(t["taille"])}mm">{echapper(phase["titre"])}</div>')
        c = r['citations'][n]
        a(f'<div class="citation" style="left:{x(COLONNE)}mm;top:{yt(c)}mm;'
          f'font-size:{tx(c["taille"])}mm;color:{couleur}">'
          f'« {echapper(phase["citation"])} »</div>')

        # puces — la longue reste coupée où elle l'était sur le roll-up
        for texte in phase['points']:
            p = r['puces'][i_puce]
            morceaux = [texte]
            if len(texte) > 70:                       # la seule qui tient sur deux lignes
                brisure = texte.rindex(' ', 0, 70)
                morceaux = [texte[:brisure], texte[brisure + 1:]]
                i_puce += 1                           # la suite occupe la ligne suivante
            corps = '<br>'.join(echapper(m) for m in morceaux)
            a(f'<div class="puce" style="left:{x(PUCES)}mm;top:{yt(p)}mm;'
              f'font-size:{tx(p["taille"])}mm;line-height:{y(22.8)}mm">'
              f'<span class="point">•</span> {corps}</div>')
            i_puce += 1

        # intervenants
        inter = r['intervenants'][n]
        a(f'<div class="intervenants" style="left:{x(COLONNE)}mm;top:{yt(inter)}mm;'
          f'font-size:{tx(inter["taille"])}mm" '
          f'data-largeur="{(inter["x1"]-inter["x0"])*kv:.3f}">INTERVENANTS</div>')

        restants = list(phase['intervenants'])
        while restants:
            ligne = par_ligne[i_ligne]; i_ligne += 1
            # Le texte du badge est centré dans sa pastille (line-height: 1) :
            # le haut du badge se déduit donc du haut voulu des caractères.
            corps = ligne[0]['taille']
            haut = (ligne[0]['top'] - (BADGE_H - corps) / 2
                    + HAUT_DE_LIGNE * corps + BADGE_AJUST)
            a(f'<div class="badges" style="left:{x(BADGE_X)}mm;'
              f'top:{y(haut)}mm;gap:{x(BADGE_GAP)}mm">')
            for _ in ligne:
                s = services[restants.pop(0)]
                a(f'<span class="badge" style="background:{s["couleur"]};'
                  f'height:{y(BADGE_H)}mm;border-radius:{y(BADGE_H)/2:.3f}mm;'
                  f'padding:0 {x(BADGE_PAD)}mm;font-size:{tx(ligne[0]["taille"])}mm">'
                  f'{echapper(s["nom"])}</span>')
            a('</div>')

        # icône, ancrée à droite
        ic = icones[n]
        cote = x(ICONE_COTE)
        tracés = '\n'.join([ic['fond']] + ic['traits'])
        a(f'<div class="icone" style="left:{x(ICONE_X)}mm;top:{y(ic["y"])}mm;'
          f'width:{cote}mm;height:{cote}mm">'
          f'<svg viewBox="{ic["x"]} {ic["y"]} {ICONE_COTE} {ICONE_COTE}" '
          f'width="100%" height="100%">{tracés}</svg></div>')

    # ---- pied ------------------------------------------------------------
    centre(r['pied_titre'], 'UNE EXPERTISE COMPLÈTE AU SERVICE DU PATRIMOINE DÉPARTEMENTAL',
           'gras clair', suit_format=True)
    centre(r['pied_sous'], '10 phases · 3 grandes étapes · 8 services',
           'italique', AMBRE, suit_format=True)

    return '\n'.join(out), L, H, format_


GABARIT = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Vie d'un projet immobilier — roll-up {largeur:.0f} × {hauteur:.0f} cm</title>
<style>
  @page {{ size: {L}mm {H}mm; margin: 0; }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: {L}mm; height: {H}mm; }}
  body {{
    --bande: {bande}mm;
    position: relative; background: #fff; overflow: hidden;
    /* Nimbus Sans et TeX Gyre Heros partagent les métriques d'Helvetica :
       le document d'origine a été composé avec la seconde. */
    font-family: 'Nimbus Sans', 'TeX Gyre Heros', Helvetica, Arial, sans-serif;
    color: {encre}; -webkit-font-smoothing: antialiased;
  }}
  div {{ position: absolute; white-space: nowrap; }}

  .bande {{ left: 0; top: 0; height: {H}mm; background: {ambre}; }}
  .bandeau {{ left: var(--bande); width: calc({L}mm - var(--bande)); }}
  .bandeau.haut {{ top: 0; background: linear-gradient(180deg, {h0}, {h1}); }}
  .bandeau.pied {{ background: linear-gradient(180deg, {p0}, {p1}); }}
  .filet {{ background: {ambre}; }}
  .filet-titre {{ background: {ambre}; }}
  .rail {{ border-radius: 99mm; }}

  /* Le centrage de l'original ignore la bande ambre : il porte sur la page. */
  .centre {{ left: 0; width: {L}mm; text-align: center; }}
  .centre-bloc {{ text-align: center; }}
  .gras {{ font-weight: 700; }}
  .normal {{ font-weight: 400; }}
  .italique {{ font-style: italic; }}
  .gras-italique {{ font-weight: 700; font-style: italic; }}
  .clair {{ color: #fff; }}

  .pastille {{
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700;
  }}
  .pastille span {{ position: static; line-height: 1; }}

  .surtitre {{ font-weight: 700; }}
  .titre-phase {{ font-weight: 700; color: {encre}; }}
  .citation {{ font-style: italic; }}
  .puce {{ color: #2A3B4D; white-space: normal; }}
  .puce .point {{ position: static; }}
  .intervenants {{ font-weight: 700; color: #7A8794; }}

  .badges {{ display: flex; align-items: center; }}
  .badge {{
    position: static; display: inline-flex; align-items: center;
    color: #fff; font-weight: 700; white-space: nowrap; line-height: 1;
  }}
  .icone svg {{ position: static; display: block; overflow: visible; }}
</style></head>
<body>
{corps}
<script>
/* L'interlettrage n'est pas transcrit : il est MESURÉ. Chaque bloc portant
   data-largeur est étiré jusqu'à la largeur relevée sur le roll-up d'origine,
   par dichotomie sur letter-spacing. Recopier une valeur en em aurait dérivé
   à la moindre substitution de police. */
(function () {{
  var MM = 96 / 25.4;
  document.querySelectorAll('[data-largeur]').forEach(function (el) {{
    var cible = parseFloat(el.dataset.largeur) * MM;
    if (!(cible > 0)) return;
    el.style.letterSpacing = '0px';
    var nature = el.getBoundingClientRect().width;
    if (el.classList.contains('centre') || el.classList.contains('centre-bloc')) {{
      // Un bloc centré occupe toute sa boîte : on mesure le texte lui-même.
      var s = document.createElement('span');
      s.textContent = el.textContent;
      s.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:'
        + getComputedStyle(el).font;
      document.body.appendChild(s);
      nature = s.getBoundingClientRect().width;
      s.remove();
    }}
    var n = el.textContent.trim().length - 1;
    if (n < 1 || nature <= 0) return;
    var pas = (cible - nature) / n;
    if (Math.abs(pas) < 0.01) return;
    el.style.letterSpacing = pas + 'px';
    /* letter-spacing ajoute aussi une chasse après le dernier signe : on
       compense par un retrait équivalent, sinon un texte centré dérive. */
    if (el.classList.contains('centre') || el.classList.contains('centre-bloc')) {{
      el.style.textIndent = pas + 'px';
    }}
  }});
  document.documentElement.dataset.pret = '1';
}})();
</script>
</body></html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--largeur', type=float, default=84, help='en cm (défaut : 84)')
    ap.add_argument('--hauteur', type=float, default=160, help='en cm (défaut : 160)')
    ap.add_argument('--html-seul', action='store_true', help="ne pas produire le PDF")
    args = ap.parse_args()

    corps, L, H, format_ = composer(args.largeur, args.hauteur)
    bande_mm = BANDE * (L / SRC_L) * (SRC_L / PT_L)
    html = GABARIT.format(corps=corps, L=f'{L:.2f}', H=f'{H:.2f}', bande=f'{bande_mm:.3f}',
                          largeur=args.largeur, hauteur=args.hauteur,
                          ambre=AMBRE, encre=ENCRE,
                          h0=BANDEAU_HAUT[0], h1=BANDEAU_HAUT[1],
                          p0=BANDEAU_PIED[0], p1=BANDEAU_PIED[1])

    SORTIE.mkdir(parents=True, exist_ok=True)
    nom = f'rollup-{args.largeur:.0f}x{args.hauteur:.0f}'
    fichier = SORTIE / f'{nom}.html'
    fichier.write_text(html, encoding='utf-8')
    print(f"  {fichier.relative_to(RACINE)} — {len(html)//1024} ko "
          f"({args.largeur:.0f} × {args.hauteur:.0f} cm, élargissement ×{format_:.2f})")

    if args.html_seul:
        return
    navigateur = next((c for c in ('/usr/bin/chromium', '/usr/bin/chromium-browser',
                                   '/usr/bin/google-chrome') if Path(c).exists()), None)
    if not navigateur:
        print("  chromium introuvable : PDF non produit (--html-seul pour taire ce message)")
        return
    pdf = SORTIE / f'{nom}.pdf'
    subprocess.run([navigateur, '--headless', '--no-sandbox', '--disable-gpu',
                    '--no-pdf-header-footer', '--virtual-time-budget=6000',
                    f'--print-to-pdf={pdf}', fichier.as_uri()],
                   capture_output=True, check=True)
    taille = pdf.stat().st_size
    largeur_pdf = subprocess.run(['pdfinfo', str(pdf)], capture_output=True, text=True).stdout
    mesure = re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', largeur_pdf)
    if mesure:
        lp, hp = (float(v) / 72 * 2.54 for v in mesure.groups())
        print(f"  {pdf.relative_to(RACINE)} — {taille//1024} ko, {lp:.1f} × {hp:.1f} cm")
        if abs(lp - args.largeur) > 0.2 or abs(hp - args.hauteur) > 0.2:
            sys.exit("  ✘ le PDF ne fait pas la taille demandée")


if __name__ == '__main__':
    main()
