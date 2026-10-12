-- Audit trigger: every change to clients.escrow_balance writes one row to wallet_audit_logs.
-- A2 change: the action label can be set by the caller with
--   SET LOCAL app.audit_action = 'GIG_FUNDED';
-- (fund_gig does this). If nothing is set we fall back to the original labels.
CREATE OR REPLACE FUNCTION log_escrow_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
 v_action TEXT := NULLIF(current_setting('app.audit_action', true), '');
BEGIN
 IF TG_OP = 'INSERT' THEN
   INSERT INTO wallet_audit_logs(client_id,amount_changed,action_type,balance_after)
   VALUES(NEW.id,NEW.escrow_balance,COALESCE(v_action,'INITIAL_BALANCE'),NEW.escrow_balance);
 ELSIF OLD.escrow_balance IS DISTINCT FROM NEW.escrow_balance THEN
   INSERT INTO wallet_audit_logs(client_id,amount_changed,action_type,balance_after)
   VALUES(NEW.id,NEW.escrow_balance-OLD.escrow_balance,COALESCE(v_action,'ESCROW_BALANCE_UPDATE'),NEW.escrow_balance);
 END IF;
 RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_escrow_audit ON clients;
CREATE TRIGGER trg_escrow_audit
AFTER INSERT OR UPDATE OF escrow_balance ON clients
FOR EACH ROW EXECUTE FUNCTION log_escrow_change();
