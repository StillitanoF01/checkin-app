-- Adds a quiet "Nonna checked in on time" notification to Iliana, alongside the
-- existing reminder / missed / late-reassurance messages.

alter table daily_status add column if not exists checkin_notified_at timestamptz;

alter table notifications_log drop constraint if exists notifications_log_type_check;
alter table notifications_log add constraint notifications_log_type_check
  check (type in ('reminder','missed_nonna','missed_iliana','late_reassurance','checkin_iliana'));
