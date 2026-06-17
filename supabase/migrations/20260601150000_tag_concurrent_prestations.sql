-- Requalifie en "Concurrent" les entreprises "Prestations aux entreprises"
-- dont le nom contient des mots-clés marketing/design/product,
-- ainsi que les concurrents directs nommés explicitement.

UPDATE entreprises
SET secteur_digi = 'Concurrent'
WHERE secteur_digi = 'Prestations aux entreprises'
  AND (
    -- Concurrents directs nommés
    company_name ILIKE '%accenture%'
    OR company_name ILIKE '%5 degr%'
    OR company_name ILIKE '%thiga%'
    OR company_name ILIKE '%wivoo%'
    OR company_name ILIKE '%mckinsey%'
    OR company_name ILIKE '%pwc%'
    OR company_name ILIKE '%wefiit%'
    OR company_name ILIKE '%onepoint%'
    OR company_name ILIKE '%devoteam%'
    OR company_name ILIKE '%deloitte%'

    -- Agences / studios
    OR company_name ILIKE '%agence%'
    OR company_name ILIKE '%agency%'
    OR company_name ILIKE '%studio%'

    -- Design
    OR company_name ILIKE '%design%'
    OR company_name ILIKE '%ux%'
    OR company_name ILIKE '%ui %'
    OR company_name ILIKE '%branding%'
    OR company_name ILIKE '%créatif%'
    OR company_name ILIKE '%creative%'
    OR company_name ILIKE '%créa%'

    -- Marketing
    OR company_name ILIKE '%marketing%'
    OR company_name ILIKE '%growth%'
    OR company_name ILIKE '%communication%'

    -- Product / digital
    OR company_name ILIKE '%product%'
    OR company_name ILIKE '%digital%'

    -- Conseil / consulting
    OR company_name ILIKE '%conseil%'
    OR company_name ILIKE '%consulting%'
  );
