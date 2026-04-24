-- Waldblick — drop the user_joined notification fanout.
--
-- The trigger fired a notification for every existing user on every
-- new signup. Even with per-user preferences (0010), this is noisier
-- than it's worth — new users are discoverable in Settings → Connect
-- whenever someone actually goes looking.
--
-- We leave the 'user_joined' string in the notifications.kind CHECK
-- constraint and on the notify_on_user_joined function for archaeology
-- (and so any already-created notifications of this kind keep rendering).
-- Only the trigger that creates new ones is removed.

drop trigger if exists profiles_notify_new on public.profiles;
