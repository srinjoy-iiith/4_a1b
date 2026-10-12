"""PostgreSQL seeder for GigTask.

A2 changes (see README "Changes to inherited code"):
  * wallet_audit_logs is no longer filled with random rows. Each client gets a real,
    chronological history (initial deposit, then a top-up + escrow debit per contract), so
    `balance_after` is a true running balance and matches clients.escrow_balance at the end.
  * completed_at is never in the future.
  * Fewer seeded IN PROGRESS gigs, so most freelancers can be funded in the demo.
  * Bulk inserts use execute_values (much faster than executemany).
  * Refreshes the materialized view at the end so the Analytics screen has data.
"""
import os, random
from datetime import datetime, timedelta, timezone
import psycopg2
from psycopg2.extras import execute_values
from faker import Faker

fake = Faker()
random.seed(42); Faker.seed(42)

DSN = os.getenv('DATABASE_URL', 'dbname=gigtask user=postgres password=postgres host=localhost port=5432')
CLIENTS = int(os.getenv('CLIENTS', '1000'))
FREELANCERS = int(os.getenv('FREELANCERS', '5000'))
CONTRACTS = int(os.getenv('CONTRACTS', '50000'))
DAYS = 90


def main():
    now = datetime.now(timezone.utc)
    conn = psycopg2.connect(DSN); cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM clients')
    if cur.fetchone()[0] > 0 and os.getenv('RESEED') != '1':
        print('PostgreSQL already has data; skipping (re-run the sql/ scripts first, or set RESEED=1).')
        return

    # Seed history ourselves, so switch the audit trigger off while loading.
    cur.execute('ALTER TABLE clients DISABLE TRIGGER trg_escrow_audit')

    clients = execute_values(cur, 'INSERT INTO clients(name,escrow_balance) VALUES %s RETURNING id',
                             [(fake.name(), 0) for _ in range(CLIENTS)], fetch=True, page_size=1000)
    clients = [r[0] for r in clients]
    freelancers = execute_values(
        cur, 'INSERT INTO freelancers(name,latitude,longitude,is_available) VALUES %s RETURNING id',
        [(fake.name(), round(random.uniform(17.2, 17.6), 6), round(random.uniform(78.2, 78.7), 6),
          random.choice([True, True, True, False])) for _ in range(FREELANCERS)], fetch=True, page_size=1000)
    freelancers = [r[0] for r in freelancers]
    conn.commit()

    # Contracts
    active, contracts = set(), []
    for _ in range(CONTRACTS):
        f = random.choice(freelancers)
        status = random.choices(['FUNDED', 'IN PROGRESS', 'COMPLETED'], weights=[10, 3, 87])[0]
        if status == 'IN PROGRESS' and f in active:
            status = 'COMPLETED'
        if status == 'IN PROGRESS':
            active.add(f)
        created = now - timedelta(days=random.randint(1, DAYS), hours=random.randint(0, 23), minutes=random.randint(0, 59))
        completed = None
        if status == 'COMPLETED':
            completed = min(created + timedelta(days=random.randint(1, 10), hours=random.randint(0, 23)), now - timedelta(minutes=5))
        contracts.append((random.choice(clients), f, round(random.uniform(25, 5000), 2), status, created, completed))
    execute_values(cur, 'INSERT INTO contracts(client_id,freelancer_id,budget,status,created_at,completed_at) VALUES %s',
                   contracts, page_size=5000)
    conn.commit()

    # Consistent escrow history per client
    by_client = {c: [] for c in clients}
    for (c, _f, budget, _s, created, _d) in contracts:
        by_client[c].append((created, budget))

    audit, final_balance = [], {}
    for c, items in by_client.items():
        items.sort()
        start = (items[0][0] if items else now) - timedelta(days=1)
        bal = round(random.uniform(1000, 20000), 2)
        audit.append((c, bal, 'INITIAL_BALANCE', bal, start))
        last = start
        for created, budget in items:
            top_up = round(budget + random.uniform(0, 1500), 2)          # client tops up before funding
            bal = round(bal + top_up, 2)
            # The top-up must fall strictly between the previous event and this funding,
            # otherwise time order and balance order disagree.
            dep_at = max(created - timedelta(minutes=random.randint(1, 120)), last + (created - last) / 2)
            audit.append((c, top_up, 'DEPOSIT', bal, dep_at))
            last = created
            bal = round(bal - budget, 2)
            audit.append((c, -budget, 'GIG_FUNDED', bal, created))
        final_balance[c] = bal
    execute_values(cur, 'INSERT INTO wallet_audit_logs(client_id,amount_changed,action_type,balance_after,created_at) VALUES %s',
                   audit, page_size=5000)
    execute_values(cur, 'UPDATE clients AS c SET escrow_balance = v.bal FROM (VALUES %s) AS v(id, bal) WHERE c.id = v.id::uuid',
                   [(str(k), v) for k, v in final_balance.items()], page_size=1000)

    # A few low-balance clients so "insufficient balance" is easy to demo
    for c in clients[:5]:
        cur.execute("UPDATE clients SET escrow_balance = 50.00 WHERE id = %s", (c,))
        cur.execute("""INSERT INTO wallet_audit_logs(client_id,amount_changed,action_type,balance_after)
                       VALUES(%s, %s, 'WITHDRAWAL', 50.00)""", (c, round(50.00 - float(final_balance[c]), 2)))

    cur.execute('ALTER TABLE clients ENABLE TRIGGER trg_escrow_audit')
    conn.commit()

    cur.execute('CALL refresh_freelancer_lifetime_stats()')
    conn.commit()
    cur.execute('SELECT (SELECT COUNT(*) FROM clients),(SELECT COUNT(*) FROM freelancers),'
                '(SELECT COUNT(*) FROM contracts),(SELECT COUNT(*) FROM wallet_audit_logs)')
    print('PostgreSQL seeding complete: clients=%s freelancers=%s contracts=%s audit_logs=%s' % cur.fetchone())
    cur.close(); conn.close()


if __name__ == '__main__':
    main()
