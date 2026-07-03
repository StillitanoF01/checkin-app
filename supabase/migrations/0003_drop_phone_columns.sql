-- Notifications moved from Twilio SMS to the Telegram Bot API. Recipient chat IDs now
-- come from env (TELEGRAM_GRANDMA_CHAT_ID / TELEGRAM_MUM_CHAT_ID) in the Edge Function,
-- so the phone-number columns on settings are no longer used. Drop them if present.
-- (Safe to run whether or not an earlier build of 0001 created these columns.)

alter table settings drop column if exists nonna_phone;
alter table settings drop column if exists iliana_phone;
