-- ============================================================================
-- Add faculty, staff, and emeritus to roster_names so they are auto-approved
-- on first sign-in (name-match path).  They receive role='resident' on entry;
-- an admin can promote them to 'faculty' afterward via the Approvals panel.
--
-- Sources (scraped 2026-06-22):
--   medicine.wright.edu/psychiatry/core-faculty-and-staff
--   medicine.wright.edu/psychiatry/full-time-faculty
--   medicine.wright.edu/psychiatry/partially-affiliated-faculty
--   medicine.wright.edu/psychiatry/emeritus-faculty
-- ============================================================================

insert into roster_names (first_name, last_name, class_year) values

  -- Core Faculty & Staff
  ('Matthew','Baker','faculty'),
  ('Lucas','Barton','faculty'),
  ('Nita','Bhatt','faculty'),
  ('Kelly','Blankenship','faculty'),
  ('Angela','Byron','faculty'),
  ('William','Clark','faculty'),
  ('Terry','Correll','faculty'),
  ('Otto','Dueno','faculty'),
  ('Julie','Gentile','faculty'),
  ('Larrilyn','Grant','faculty'),
  ('Franklin','Halley','faculty'),
  ('Kari','Harper','faculty'),
  ('Kevin','Heacock','faculty'),
  ('Jonathan','Hester','faculty'),
  ('Andrew','Khavari','faculty'),
  ('Victor','Knapp','faculty'),
  ('Gianni','Maione','faculty'),
  ('Ryan','Mast','faculty'),
  ('Alexandria','Nasr','faculty'),
  ('Suzie','Nelson','faculty'),
  ('Ryan','Peirson','faculty'),
  ('Jessica','Porcelan','faculty'),
  ('Richard','Sanders','faculty'),
  ('Sydney','Silverstein','faculty'),
  ('Ricky','Steiner','faculty'),
  ('John','Sullenbarger','faculty'),
  ('Laura','Virgo','faculty'),
  ('Christina','Waite','faculty'),
  ('John','Weiffenbach','faculty'),
  -- Staff
  ('Christina','Behme','faculty'),
  ('Marcia','Boeck','faculty'),
  ('Dana','Fleetham','faculty'),
  ('Julie','Gillespie','faculty'),
  ('Darla','Todd','faculty'),

  -- Full-Time Faculty
  ('Stephanie','Ackner','faculty'),
  ('Rafay','Atiq','faculty'),
  ('Ellen','Ballerene','faculty'),
  ('Debanjana','Bhattacharya','faculty'),
  ('Brendan','Carroll','faculty'),
  ('Wayne','Chappelle','faculty'),
  ('Joseph','Coles','faculty'),
  ('Vanessa','Doyle','faculty'),
  ('Elizabeth','Gilday','faculty'),
  ('Kenneth','Glass','faculty'),
  ('Gina','Guadagno','faculty'),
  ('Molly','Hall','faculty'),
  ('John','Heaton','faculty'),
  ('Peter','Iversen','faculty'),
  ('Tina','Lusignolo','faculty'),
  ('Sarita','Mahajan','faculty'),
  ('Christopher','Marett','faculty'),
  ('Virginia','Matheson','faculty'),
  ('Teg','McBride','faculty'),
  ('Patrick','McCullough','faculty'),
  ('Ramzi','Nahhas','faculty'),
  -- "R. Mark Newman" — store both so either token matches
  ('R.','Newman','faculty'),
  ('Mark','Newman','faculty'),
  ('Natosha','Onasanya','faculty'),
  ('Sarah','Rossetter','faculty'),
  ('Sarah','Sanyal','faculty'),
  ('Elizabeth','Sarnoski','faculty'),
  -- "J J Schulte, Jr." — suffix not stripped; store without it
  ('J.J.','Schulte','faculty'),
  ('J','Schulte','faculty'),
  ('Andrew','Smith','faculty'),
  -- "Joe D Wood, III" — Roman numeral not stripped; store base name
  ('Joe','Wood','faculty'),
  ('Rob','Wyatt','faculty'),

  -- Partially Affiliated Faculty
  ('Esam','Alkhawaga','faculty'),
  ('Jacqueline','Allen','faculty'),
  ('Ariz','Anklesaria','faculty'),
  ('Tarek','Aziz','faculty'),
  ('Priyanka','Badhwar','faculty'),
  ('Huma','Bashir','faculty'),
  ('Theresa','Blachly-Flanagan','faculty'),
  ('Justin','Bunn','faculty'),
  ('Bridget','Casey-Leavell','faculty'),
  ('Henrik','Close','faculty'),
  ('Jacqueline','Countryman','faculty'),
  ('David','Dixon','faculty'),
  ('Danielle','Gainer','faculty'),
  ('Jeffrey','Guina','faculty'),
  ('Elizabeth','Hardy','faculty'),
  ('Bethany','Harper','faculty'),
  ('David','Hart','faculty'),
  ('Roger','Hesselbrock','faculty'),
  ('Mark','Hubner','faculty'),
  ('Racheal','Johnson','faculty'),
  ('Rebecca','Karns','faculty'),
  ('Bhupinder','Kaur','faculty'),
  ('Monica','Malcein','faculty'),
  ('Maria','Mathias','faculty'),
  ('Meera','Menon','faculty'),
  ('Shannon','Miller','faculty'),
  ('Kalpana','Miriyala','faculty'),
  ('Kaitlyn','Pollock','faculty'),
  ('Marie','Rueve','faculty'),
  ('Taylor','Shear','faculty'),
  ('Douglas','Teller','faculty'),
  ('Justin','Trevino','faculty'),
  ('Jacqueline','Vanderburgh','faculty'),
  ('Julie','Walsh-Messinger','faculty'),
  ('Randy','Welton','faculty'),
  ('Randon','Welton','faculty'),
  ('Katherine','Winner','faculty'),
  ('Brandon','Withers','faculty'),

  -- Emeritus Faculty
  ('David','Bienenfeld','faculty'),
  ('Brien','Dyer','faculty'),
  ('Paulette','Gillig','faculty'),
  ('William','Klykylo','faculty'),
  ('Douglas','Lehrer','faculty'),
  ('Albert','Painter','faculty'),
  ('Dean','Parmelee','faculty'),
  ('Brenda','Roman','faculty')

on conflict (first_name, last_name) do nothing;
