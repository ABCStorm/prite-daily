-- Drop the unused Adam Quinn placeholder seat now that the real Adam Quinn
-- account exists, and retire the empty second Alexandra Fowler login so the
-- site keeps only the Fowler account with question activity
-- (alexandraelizabethfowler@gmail.com, 153 answers).
--
-- Aly Fowler / Alyssa Fowler is a different resident and is not touched.
-- The real Adam Quinn account (atomjudo123@gmail.com) is kept.

-- Hand the announced Team 10 seat to the real Adam Quinn if he does not
-- already have a stable-team row.
insert into stable_teams (profile_id, team_name)
select p.id, 'Team 10'
from profiles p
where p.email = 'atomjudo123@gmail.com'
  and p.full_name ilike 'Adam Quinn'
  and not exists (select 1 from stable_teams st where st.profile_id = p.id)
on conflict (profile_id) do nothing;

-- Remove the placeholder Adam Quinn auth user (0 answers). Cascades to
-- profiles, settings, and team seats.
delete from auth.users
where email = 'placeholder+adam.quinn@quizapine.local';

-- Remove the unused Alexandra Fowler login (0 answers). Cascades the same way.
delete from auth.users
where email = 'alexandra.e.fowler@gmail.com'
  and id = 'd785cf43-802a-4d06-b942-9e89eb04565a'
  and not exists (
    select 1 from answers a
    where a.user_id = 'd785cf43-802a-4d06-b942-9e89eb04565a'
  );
