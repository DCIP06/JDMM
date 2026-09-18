#!/usr/bin/env python3
"""
Fabrique une fiche de poste à partir de ce que le site du Département publie.

Pourquoi un script plutôt qu'une recopie à la main : une fiche recopiée se
désynchronise du site sans que personne ne s'en aperçoive, et une recopie qui
oublie la moitié d'une rubrique ne rate jamais bruyamment. Ici, la fiche est
EXTRAITE de `data/offers.json` + `data/offers-details.json` (déjà collectés par
`sync_offers.py`), et le script REFUSE d'écrire une fiche incomplète.

  python3 scripts/generer_fiches.py --lister          # offres DCIP sans fiche
  python3 scripts/generer_fiches.py <id> [<id>…]      # affiche le JSON produit
  python3 scripts/generer_fiches.py <id> --ecrire     # l'ajoute à postes-dcip.json

Le rattachement à un service et le choix d'une icône restent des décisions
internes : ils sont déduits du nom de service que le site annonce dans la
rubrique « Missions », jamais inventés. Un service inconnu est signalé.
"""

import argparse
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
POSTES = RACINE / 'data' / 'postes-dcip.json'
OFFRES = RACINE / 'data' / 'offers.json'
DETAILS = RACINE / 'data' / 'offers-details.json'

# Les services tels qu'ils sont nommés dans les fiches existantes, et l'émoji
# de repli. L'icône affichée vient de js/commun/icones.js (PAR_SERVICE) : tout
# service ajouté ici doit y être ajouté aussi, sinon il tombe sur l'icône
# générique sans que rien ne le signale.
SERVICES = {
    'Énergie et fluides': '⚡',
    'Études et travaux': '📐',
    'Maintenance des bâtiments': '🏢',
    'Maintenance des collèges': '🏫',
    'Sécurité, Sûreté & Prévention': '🔒',
    'Mission énergies renouvelables': '⚡',
}

# Ce que le site écrit dans « Au sein du service … » → le service de la fiche.
INDICES_SERVICE = [
    (r"maintenance des coll[eè]ges", 'Maintenance des collèges'),
    (r"maintenance des b[aâ]timents", 'Maintenance des bâtiments'),
    (r"[ée]tudes et travaux", 'Études et travaux'),
    (r"[ée]nergies? renouvelables?", 'Mission énergies renouvelables'),
    (r"[ée]nergie et fluides", 'Énergie et fluides'),
    (r"s[ûu]ret[ée]|s[ée]curit[ée]|pr[ée]vention", 'Sécurité, Sûreté & Prévention'),
]

MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']


def charger(chemin):
    return json.loads(chemin.read_text(encoding='utf-8'))


def puces(bloc):
    """Découpe le blob d'une rubrique en puces.

    Le site sépare ses puces par « - - » et les termine par « ; ». Un blob non
    découpé s'afficherait comme un pavé d'une seule puce : c'est visible, mais
    seulement si quelqu'un regarde. On préfère échouer bruyamment plus bas.
    """
    if not bloc:
        return []
    items = bloc.get('items') or []
    if len(items) > 1:
        return [nettoyer(x) for x in items if nettoyer(x)]
    texte = (bloc.get('texte') or '').strip()
    if not texte:
        return [nettoyer(x) for x in items if nettoyer(x)]
    # « - - » entre deux puces, mais aussi un simple « - » entouré d'espaces :
    # le site l'utilise indifféremment (« … dans le domaine du bâtiment. -
    # Permis B obligatoire » est bien DEUX prérequis). Un tiret sans espaces
    # (« accords-cadres ») n'est jamais un séparateur.
    morceaux = re.split(r"\s+-(?:\s+-)*\s+|\s*;\s*-\s*", texte)
    return [nettoyer(m) for m in morceaux if nettoyer(m)]


def nettoyer(texte):
    t = re.sub(r"^[\s\-–•]+", '', (texte or '').strip())
    t = re.sub(r"[\s;\-–]+$", '', t).strip()
    return t


def service_de(offre, detail):
    """Déduit le service du texte de la rubrique « Missions ». Jamais du titre :
    « Chargé d'études et de projet rénovation globale » travaille au service de
    la maintenance des COLLÈGES, ce que le titre ne dit pas."""
    source = ((detail.get('missions') or {}).get('texte') or '') + ' ' + (offre.get('resume') or '')
    for motif, service in INDICES_SERVICE:
        if re.search(motif, source, re.I):
            return service
    return None


def categorie(offre):
    cat = (offre.get('categorie') or '').strip()
    cats = offre.get('categories') or ([cat] if cat else [])
    return ' / '.join(dict.fromkeys(c.strip() for c in cats if c.strip())) or None


def filiere(offre):
    f = (offre.get('filiere') or '').strip()
    return f"Filière {f.lower()}" if f else None


def date_source(offre):
    d = offre.get('deadline')
    if not d:
        return ''
    a, m, j = str(d)[:10].split('-')
    return f"{int(j)} {MOIS[int(m) - 1]} {a}"


def fabriquer(offre, detail):
    """Fabrique une fiche. Renvoie (fiche, anomalies) — la fiche n'est écrite
    que si la liste d'anomalies est vide."""
    anomalies = []
    service = service_de(offre, detail)
    if not service:
        anomalies.append("service introuvable dans la rubrique « Missions » — à rattacher à la main")
    cat = categorie(offre)
    fil = filiere(offre)
    # La description garde ses phrases, mais le site y laisse traîner ses
    # tirets de mise en page : ils deviendraient des tirets orphelins à l'écran.
    desc = re.sub(r"\s+-\s+", ' ', nettoyer((detail.get('missions') or {}).get('texte')
                                             or offre.get('resume') or ''))
    missions = puces(detail.get('activites')) or puces(detail.get('missions'))
    profils = puces(detail.get('prerequis')) + puces(detail.get('profil-du-candidat'))

    for libelle, valeur in (('catégorie', cat), ('filière', fil), ('description', desc)):
        if not valeur:
            anomalies.append(f"{libelle} absente du site")
    if len(missions) < 2:
        anomalies.append(f"{len(missions)} mission(s) extraite(s) — le découpage des puces a échoué")
    if not profils:
        anomalies.append("aucun élément de profil extrait")

    lieu = 'Nice — CADAM'  # toutes les fiches DCIP existantes : CADAM
    fiche = {
        'id': offre['id'],
        'titre': re.sub(r"\s*\(\d+\)\s*$", '', offre['titre']),  # le n° d'annonce n'intéresse pas le visiteur
        'service': service or '',
        'ico': SERVICES.get(service, '🏢'),
        'tag': '',
        'cat': cat or '',
        'contrat': f"Cat. {cat.replace(' / ', '/')}" if cat else '',
        'filiere': fil or '',
        'lieu': lieu,
        'url': offre['url'],
        'desc': desc,
        'missions': missions[:8],
        'profils': profils[:6],
        'deadline_source': date_source(offre),
    }
    return fiche, anomalies


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ids', nargs='*', help="identifiants d'offres (colonne de --lister)")
    ap.add_argument('--lister', action='store_true', help='offres DCIP en ligne sans fiche')
    ap.add_argument('--ecrire', action='store_true', help='ajoute les fiches à data/postes-dcip.json')
    args = ap.parse_args()

    postes = charger(POSTES)
    offres = {o['id']: o for o in charger(OFFRES)['offers']}
    details = charger(DETAILS)['details']
    deja = {p['url'] for p in postes}

    if args.lister or not args.ids:
        manquantes = [o for o in offres.values() if o.get('dcip') and o['url'] not in deja]
        print(f"{len(postes)} fiches · {sum(1 for o in offres.values() if o.get('dcip'))} offres DCIP en ligne "
              f"· {len(manquantes)} sans fiche\n")
        for o in manquantes:
            detail = 'détail collecté' if o['id'] in details else '⚠️ détail absent (lancer sync_offers.py)'
            print(f"  {o['id']}\n    {o['titre']}\n    échéance {o.get('deadline') or 'permanente'} · {detail}\n")
        return 0

    nouvelles, bloquantes = [], False
    for identifiant in args.ids:
        if identifiant not in offres:
            print(f"⛔ {identifiant} : absent de offers.json", file=sys.stderr)
            bloquantes = True
            continue
        if offres[identifiant]['url'] in deja:
            print(f"⛔ {identifiant} : une fiche porte déjà cette adresse", file=sys.stderr)
            bloquantes = True
            continue
        if identifiant not in details:
            print(f"⛔ {identifiant} : pas de détail collecté — lancer sync_offers.py", file=sys.stderr)
            bloquantes = True
            continue
        fiche, anomalies = fabriquer(offres[identifiant], details[identifiant])
        for a in anomalies:
            print(f"⛔ {identifiant} : {a}", file=sys.stderr)
        bloquantes = bloquantes or bool(anomalies)
        nouvelles.append(fiche)

    if bloquantes:
        print("\nRien n'a été écrit : une fiche incomplète vaut moins que pas de fiche.", file=sys.stderr)
        return 1

    if not args.ecrire:
        print(json.dumps(nouvelles, ensure_ascii=False, indent=2))
        print(f"\n{len(nouvelles)} fiche(s) prête(s). Relancer avec --ecrire pour les ajouter.", file=sys.stderr)
        return 0

    postes.extend(nouvelles)
    POSTES.write_text(json.dumps(postes, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"{len(nouvelles)} fiche(s) ajoutée(s) — {len(postes)} au total dans data/postes-dcip.json")
    return 0


if __name__ == '__main__':
    sys.exit(main())
