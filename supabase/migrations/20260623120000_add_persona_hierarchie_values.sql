-- Extend CHECK constraints on contacts to allow new persona and hierarchie values

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_persona_check,
  DROP CONSTRAINT IF EXISTS contacts_hierarchie_check;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_persona_check CHECK (persona IN (
    'Dirigeant', 'Marketing', 'Produit', 'Design', 'Commercial', 'Acheteur', 'Hors expertise Digi'
  )),
  ADD CONSTRAINT contacts_hierarchie_check CHECK (hierarchie IN (
    'COMEX', 'Directeur', 'Manager', 'Opérationnel', 'Stagiaire/Alternant'
  ));
