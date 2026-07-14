-- Samantha Courtney (class of 2027 / R4) changed her last name to Peralta
-- after marriage. Update the roster-name match so her Google account (which
-- now shows the new legal name) still auto-approves on sign-in.
update roster_names set last_name = 'Peralta' where first_name = 'Samantha' and last_name = 'Courtney';
