-- Workflow 1: atomic gig funding.
--
-- A2 changes (see README "Changes to inherited code"):
--  1. Removed `EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;`. A ROLLBACK is not allowed
--     inside an exception block (it runs as a sub-transaction), so every failure turned into
--     "cannot roll back while a subtransaction is active" and hid the real reason.
--     Without the block, any RAISE aborts the whole CALL and Postgres undoes everything.
--  2. New contracts start as 'IN PROGRESS' (was 'FUNDED'). The partial unique index
--     idx_active_gig only covers 'IN PROGRESS', so with 'FUNDED' the "one active gig per
--     freelancer" rule could never block a funding. Funding a gig now starts it.
--  3. Added INOUT p_contract_id so the caller gets the new contract id back.
--  4. Labels the audit row 'GIG_FUNDED' via app.audit_action (read by the trigger).
-- Drop the old 3-argument version first, otherwise CALL fund_gig(a,b,c) becomes ambiguous.
DROP PROCEDURE IF EXISTS fund_gig(UUID, UUID, DECIMAL);
CREATE OR REPLACE PROCEDURE fund_gig(
 p_client_id UUID,
 p_freelancer_id UUID,
 p_budget DECIMAL(12,2),
 INOUT p_contract_id UUID DEFAULT NULL
)
LANGUAGE plpgsql AS $$
DECLARE v_balance DECIMAL(12,2);
BEGIN
 IF p_budget IS NULL OR p_budget <= 0 THEN RAISE EXCEPTION 'Budget must be greater than zero'; END IF;

 -- Lock the client row so two concurrent fundings cannot both spend the same money.
 SELECT escrow_balance INTO v_balance FROM clients WHERE id=p_client_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Client does not exist'; END IF;
 IF v_balance < p_budget THEN
   RAISE EXCEPTION 'Insufficient escrow balance' USING DETAIL = format('balance=%s budget=%s', v_balance, p_budget);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM freelancers WHERE id=p_freelancer_id) THEN
   RAISE EXCEPTION 'Freelancer does not exist';
 END IF;

 PERFORM set_config('app.audit_action', 'GIG_FUNDED', true);   -- true = only for this transaction
 UPDATE clients SET escrow_balance=escrow_balance-p_budget WHERE id=p_client_id;

 -- If this freelancer already has an IN PROGRESS gig, idx_active_gig raises unique_violation (23505)
 -- and the balance update above is undone too.
 INSERT INTO contracts(client_id,freelancer_id,budget,status)
 VALUES(p_client_id,p_freelancer_id,p_budget,'IN PROGRESS')
 RETURNING id INTO p_contract_id;

 PERFORM set_config('app.audit_action', '', true);
END; $$;
-- CALL fund_gig('client-uuid','freelancer-uuid',500.00);


-- A2 addition: move a contract through its statuses (FUNDED -> IN PROGRESS -> COMPLETED).
-- Moving a second contract of the same freelancer to IN PROGRESS is blocked by idx_active_gig.
CREATE OR REPLACE PROCEDURE update_contract_status(
 p_contract_id UUID,
 p_new_status VARCHAR(20)
)
LANGUAGE plpgsql AS $$
DECLARE v_old VARCHAR(20);
BEGIN
 SELECT status INTO v_old FROM contracts WHERE id=p_contract_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contract does not exist'; END IF;

 IF NOT ((v_old='FUNDED' AND p_new_status='IN PROGRESS')
      OR (v_old='IN PROGRESS' AND p_new_status='COMPLETED')) THEN
   RAISE EXCEPTION 'Invalid status change from % to %', v_old, p_new_status;
 END IF;

 UPDATE contracts
    SET status=p_new_status,
        completed_at = CASE WHEN p_new_status='COMPLETED' THEN NOW() ELSE completed_at END
  WHERE id=p_contract_id;
END; $$;


-- A2 addition: top up a client's escrow (handy for demos after the balance runs out).
CREATE OR REPLACE PROCEDURE deposit_escrow(p_client_id UUID, p_amount DECIMAL(12,2))
LANGUAGE plpgsql AS $$
BEGIN
 IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Deposit must be greater than zero'; END IF;
 PERFORM set_config('app.audit_action', 'DEPOSIT', true);
 UPDATE clients SET escrow_balance=escrow_balance+p_amount WHERE id=p_client_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Client does not exist'; END IF;
 PERFORM set_config('app.audit_action', '', true);
END; $$;
