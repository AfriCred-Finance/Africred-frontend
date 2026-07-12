"""Generate demo dossier PDFs for AgriCo Senegal. Run: python _generate.py"""
from fpdf import FPDF
from pathlib import Path

OUT = Path(__file__).parent
COMPANY = "AGRICO SENEGAL SARL"
ADDRESS = "Route de Rufisque, Km 12, Dakar, Senegal"
RC = "RC-DKR-2019-B-04217"
NINEA = "0058421-2-A-2019"


class Doc(FPDF):
    def __init__(self, title: str, ref: str):
        super().__init__()
        self.doc_title = title
        self.doc_ref = ref
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(18, 18, 18)

    def header(self):
        self.set_font("Helvetica", "B", 14)
        self.cell(0, 8, COMPANY, ln=True)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(110, 110, 110)
        self.cell(0, 5, ADDRESS, ln=True)
        self.cell(0, 5, f"RC: {RC}  -  NINEA: {NINEA}", ln=True)
        self.set_text_color(0, 0, 0)
        self.set_draw_color(180, 180, 180)
        self.line(18, self.get_y() + 2, 192, self.get_y() + 2)
        self.ln(8)
        self.set_font("Helvetica", "B", 13)
        self.cell(0, 7, self.doc_title, ln=True)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(110, 110, 110)
        self.cell(0, 5, f"Ref: {self.doc_ref}", ln=True)
        self.set_text_color(0, 0, 0)
        self.ln(4)

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(140, 140, 140)
        self.cell(0, 5, f"{COMPANY}  -  Page {self.page_no()}  -  DEMO DOCUMENT, NOT LEGALLY BINDING", align="C")

    def section(self, title: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 11)
        self.ln(2)
        self.cell(0, 6, title, ln=True)
        self.set_draw_color(220, 220, 220)
        self.line(18, self.get_y(), 192, self.get_y())
        self.ln(3)
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 10)

    def body(self, text: str):
        self.set_font("Helvetica", "", 10)
        for line in text.strip().split("\n"):
            s = line.strip()
            self.set_x(self.l_margin)
            if not s:
                self.ln(3)
                continue
            self.multi_cell(0, 5.4, s)
        self.ln(2)

    def kv_table(self, rows):
        self.set_font("Helvetica", "", 10)
        for k, v in rows:
            self.set_x(self.l_margin)
            self.set_font("Helvetica", "B", 10)
            self.cell(60, 6, k)
            self.set_font("Helvetica", "", 10)
            self.cell(0, 6, str(v), ln=True)
        self.ln(2)

    def num_table(self, headers, rows, widths=None):
        if widths is None:
            widths = [60] + [(174 - 60) // (len(headers) - 1)] * (len(headers) - 1)
        self.set_font("Helvetica", "B", 10)
        self.set_fill_color(245, 241, 232)
        self.set_x(self.l_margin)
        for w, h in zip(widths, headers):
            self.cell(w, 6.5, h, border="B", fill=True)
        self.ln()
        self.set_font("Helvetica", "", 10)
        for row in rows:
            self.set_x(self.l_margin)
            for w, v in zip(widths, row):
                self.cell(w, 6, str(v))
            self.ln()
        self.ln(2)


# ----------------------------------------------------------------------------
# 1. Business registration certificate
# ----------------------------------------------------------------------------
d = Doc("Certificat d'immatriculation au Registre du Commerce", "DOC-01 / KYC")
d.add_page()
d.section("Identification de la societe")
d.kv_table([
    ("Denomination sociale", COMPANY),
    ("Forme juridique", "Societe a Responsabilite Limitee (SARL)"),
    ("Capital social", "XOF 25 000 000"),
    ("Numero RC", RC),
    ("Numero NINEA", NINEA),
    ("Date d'immatriculation", "14 mars 2019"),
    ("Siege social", ADDRESS),
])
d.section("Objet social")
d.body("""
La societe a pour objet, au Senegal et a l'etranger:
- L'agregation, le stockage et le conditionnement de produits agricoles (mais, mil, arachide, niebe);
- La distribution d'intrants agricoles et d'equipements aux cooperatives de producteurs;
- Le financement de campagne aux producteurs de la zone de Kaolack et Fatick;
- Toutes operations commerciales, industrielles, financieres, mobilieres et immobilieres se
  rattachant directement ou indirectement a l'objet social.
""")
d.section("Dirigeants")
d.kv_table([
    ("Gerante", "Mme Fatou Diop NDIAYE"),
    ("Co-Gerant", "M. Cheikh SARR"),
    ("Commissaire aux comptes", "Cabinet Diallo & Associes - Dakar"),
])
d.section("Mention de conformite")
d.body("""
La presente attestation est delivree pour servir et valoir ce que de droit dans le cadre du dossier
de financement soumis a AfriCred. Document de demonstration produit pour le pilote technique
AfriCred sur Base Sepolia. Ne constitue pas un acte officiel.
""")
d.output(str(OUT / "01-business-registration.pdf"))

# ----------------------------------------------------------------------------
# 2. Financial statements
# ----------------------------------------------------------------------------
d = Doc("Etats financiers resumes - Exercice 2024", "DOC-02 / FIN")
d.add_page()
d.section("Compte de resultat (XOF, en milliers)")
d.num_table(
    ["Poste", "2023", "2024", "Variation"],
    [
        ("Chiffre d'affaires", "412 800", "486 250", "+17.8%"),
        ("Cout des marchandises vendues", "(298 100)", "(347 400)", "+16.5%"),
        ("Marge brute", "114 700", "138 850", "+21.1%"),
        ("Charges d'exploitation", "(72 400)", "(81 900)", "+13.1%"),
        ("EBITDA", "42 300", "56 950", "+34.6%"),
        ("Amortissements", "(8 600)", "(9 800)", ""),
        ("Resultat operationnel", "33 700", "47 150", "+39.9%"),
        ("Charges financieres", "(11 200)", "(13 400)", ""),
        ("Resultat net", "16 800", "24 200", "+44.0%"),
    ],
    widths=[70, 32, 32, 40],
)
d.section("Bilan synthetique (XOF, en milliers) - cloture 31/12/2024")
d.num_table(
    ["Actif", "Montant", "Passif", "Montant"],
    [
        ("Immobilisations nettes", "62 400", "Capitaux propres", "78 900"),
        ("Stocks", "94 100", "Dettes financieres long terme", "41 200"),
        ("Creances clients", "47 800", "Dettes financieres court terme", "58 600"),
        ("Tresorerie", "12 300", "Dettes fournisseurs", "37 900"),
        ("Total actif", "216 600", "Total passif", "216 600"),
    ],
    widths=[55, 32, 55, 32],
)
d.section("Indicateurs cles")
d.kv_table([
    ("Marge brute", "28.6%"),
    ("Marge EBITDA", "11.7%"),
    ("Endettement net / EBITDA", "1.55x"),
    ("Delai client moyen", "36 jours"),
    ("Rotation des stocks", "3.7x / an"),
])
d.body("""
Les comptes ont ete arretes selon le referentiel SYSCOHADA revise. Les chiffres presentes sont
indicatifs et destines a la demonstration du pilote AfriCred. Cabinet Diallo & Associes a delivre
une attestation sans reserve sur les comptes 2023; les comptes 2024 sont en cours d'audit.
""")
d.output(str(OUT / "02-financial-statements-2024.pdf"))

# ----------------------------------------------------------------------------
# 3. Use of proceeds memo
# ----------------------------------------------------------------------------
d = Doc("Note d'utilisation des fonds - Campagne agricole 2025-2026", "DOC-03 / UoP")
d.add_page()
d.section("Resume")
d.body("""
AGRICO SENEGAL sollicite un financement de USD 50 000 (equivalent XOF 30 000 000) aupres
d'AfriCred afin de financer la campagne de collecte et de stockage de mais et de mil pour la
periode juin 2025 - septembre 2025, sur la zone de Kaolack-Fatick. La duree de l'operation
est de 90 jours avec un taux flat de 15% et un remboursement en 3 echeances mensuelles
(interets en periodique, principal a maturite).
""")
d.section("Ventilation prevue des fonds")
d.num_table(
    ["Poste", "Montant (USD)", "Part"],
    [
        ("Achat de stocks (mais, mil) aupres des cooperatives", "32 500", "65%"),
        ("Stockage et conditionnement", "7 500", "15%"),
        ("Logistique aval (transport vers Dakar)", "5 000", "10%"),
        ("Tresorerie de roulement (intrants, sacs)", "3 500", "7%"),
        ("Frais de campagne (assurance, supervision)", "1 500", "3%"),
        ("TOTAL", "50 000", "100%"),
    ],
    widths=[100, 40, 34],
)
d.section("Calendrier operationnel")
d.kv_table([
    ("Decaissement", "Juin 2025"),
    ("Phase 1 - collecte", "Juin - Juillet 2025"),
    ("Phase 2 - stockage", "Juillet - Aout 2025"),
    ("Phase 3 - vente Dakar", "Aout - Septembre 2025"),
    ("Remboursement principal", "T+90 jours"),
])
d.section("Beneficiaires et impact")
d.body("""
- 4 cooperatives de producteurs partenaires, totalisant 1 240 petits producteurs.
- 38% des producteurs concernes sont des femmes (cooperative de Mbaye Mbaye, Diourbel).
- Reduction visee des pertes post-recolte de 22% a 9% via le stockage en magasin sec.
- Garantie de revenu minimum pour les producteurs grace au prix d'achat plancher.
""")
d.section("Risques et attenuations")
d.body("""
- Risque prix: contrats d'achat aval pre-negocies avec deux grossistes a Dakar.
- Risque climatique: stockage en magasin assure (police MAAF / contract n. SN-2024-118).
- Risque operationnel: equipe de supervision sur site, reporting hebdomadaire a AfriCred.
""")
d.output(str(OUT / "03-use-of-proceeds.pdf"))

# ----------------------------------------------------------------------------
# 4. Loan agreement draft
# ----------------------------------------------------------------------------
d = Doc("Convention de financement - Pilote AfriCred (DRAFT)", "DOC-04 / LEGAL")
d.add_page()
d.section("Parties")
d.kv_table([
    ("Preteur", "AfriCred Pilot Vault (vehicule on-chain, Base Sepolia)"),
    ("Originateur", "AfriCred Operations Sarl, agissant pour le compte du Preteur"),
    ("Emprunteur", COMPANY),
    ("Garant", "Mme Fatou Diop NDIAYE (caution personnelle limitee a USD 10 000)"),
])
d.section("Conditions financieres")
d.kv_table([
    ("Montant en principal", "USD 50 000"),
    ("Taux d'interet (flat)", "15.00% sur la duree totale"),
    ("Duree", "90 jours"),
    ("Type de remboursement", "Interets periodiques, principal a maturite"),
    ("Nombre d'echeances d'interet", "3 (mensuelles)"),
    ("Montant de chaque echeance d'interet", "USD 2 500.00"),
    ("Remboursement final (principal)", "USD 50 000 a J+90"),
    ("Devise de remboursement", "USDC (Base Sepolia)"),
])
d.section("Clauses operationnelles")
d.body("""
Article 1 - Decaissement
Le decaissement intervient apres signature des presentes, mise en place de la garantie et appel
de fonds via la fonction custodyFunds() du vault on-chain.

Article 2 - Remboursement
L'Emprunteur s'engage a transferer les sommes dues a l'adresse de l'Originateur avant chaque
echeance. L'Originateur enregistre chaque versement sur le vault on-chain via recordRepayment().

Article 3 - Defaut
Constitue un evenement de defaut: tout retard de paiement superieur a 7 jours calendaires non
regularise apres mise en demeure. En cas de defaut, l'Originateur peut declencher la procedure
de recouvrement et enregistrer le montant recouvre via recordRecovery().

Article 4 - Restructuration
Toute modification des conditions financieres se fait par avenant et est enregistree on-chain via
restructureLoan() sur le contrat LoanRegistryNFT.

Article 5 - Loi applicable
La presente convention est regie par le droit senegalais. Tout litige releve de la competence
exclusive du Tribunal de Commerce de Dakar, sans prejudice des arbitrages prevus par l'OHADA.
""")
d.section("Signatures (a apposer)")
d.kv_table([
    ("Pour l'Emprunteur", "Mme Fatou Diop NDIAYE, Gerante"),
    ("Pour l'Originateur", "AfriCred Operations Sarl, par son representant legal"),
    ("Date", "[a completer]"),
    ("Lieu", "Dakar, Senegal"),
])
d.body("""
DOCUMENT DE DEMONSTRATION. Ce projet d'accord est genere pour le pilote technique d'AfriCred
sur testnet Base Sepolia et n'engage aucune des parties citees. Aucune somme n'a ete decaissee.
""")
d.output(str(OUT / "04-loan-agreement-draft.pdf"))

print("Generated:")
for p in sorted(OUT.glob("*.pdf")):
    print(f"  {p.name}  ({p.stat().st_size:,} bytes)")
