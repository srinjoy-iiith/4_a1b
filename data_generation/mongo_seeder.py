"""MongoDB seeder for GigTask.

A2 changes (see README "Changes to inherited code"):
  * freelancer_id now uses the real Postgres freelancer UUIDs (was "1".."5000", which matched
    nothing in Postgres), so the UI can link a map pin / review / portfolio to a freelancer.
  * Also seeds GigReviews and Portfolios (the A1 seeder only filled WorkerLocations, so
    Workflow 4 and the catalog screen had no data).
  * WorkerLocations pings are spread over the TTL window (2h). The API's ping simulator keeps
    adding fresh pings, so the map is never empty even after old pings expire.
Run AFTER postgres_seeder.py.
"""
import os, random
from datetime import datetime, timedelta, timezone
import psycopg2
from pymongo import MongoClient

random.seed(7)
URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
DB = os.getenv('MONGO_DB', 'gigtask')
DSN = os.getenv('DATABASE_URL', 'dbname=gigtask user=postgres password=postgres host=localhost port=5432')
PINGS = int(os.getenv('PING_COUNT', '500000'))
REVIEWS = int(os.getenv('REVIEW_COUNT', '60000'))

SKILLS = ['react', 'node', 'python', 'django', 'sql', 'mongodb', 'ui-design', 'figma', 'copywriting',
          'seo', 'video-editing', 'data-entry', 'android', 'ios', 'devops', 'aws', 'excel', 'translation',
          'plumbing', 'electrical', 'carpentry', 'photography', 'logo-design', 'testing']
COMMENTS = {5: ['Excellent work, delivered early.', 'Would hire again!', 'Top quality and great communication.'],
            4: ['Good work, minor revisions needed.', 'Solid job overall.', 'Responsive and reliable.'],
            3: ['Okay, but took longer than agreed.', 'Average quality.', 'Needed a lot of follow-up.'],
            2: ['Missed the deadline.', 'Quality below expectations.'],
            1: ['Did not deliver.', 'Very poor communication.']}
LANGS = ['English', 'Hindi', 'Telugu', 'Tamil', 'Bengali', 'Urdu']


def chunks(it, n=5000):
    buf = []
    for x in it:
        buf.append(x)
        if len(buf) == n:
            yield buf; buf = []
    if buf:
        yield buf


def main():
    now = datetime.now(timezone.utc)
    pg = psycopg2.connect(DSN); cur = pg.cursor()
    cur.execute('SELECT id::text, name, latitude, longitude, is_available FROM freelancers')
    freelancers = cur.fetchall()
    cur.execute("SELECT id::text, freelancer_id::text, completed_at FROM contracts WHERE status='COMPLETED'")
    completed = cur.fetchall()
    pg.close()

    db = MongoClient(URI)[DB]
    if db.Portfolios.estimated_document_count() > 0 and os.getenv('RESEED') != '1':
        print('MongoDB already has data; skipping (set RESEED=1 to wipe and reseed).')
        return
    for name in ['WorkerLocations', 'GigReviews', 'Portfolios']:
        db[name].delete_many({})

    # Workflow 3 data: location pings (lng, lat) jittered around each freelancer's home location
    def pings():
        for _ in range(PINGS):
            fid, _n, lat, lng, avail = random.choice(freelancers)
            yield {'freelancer_id': fid,
                   'is_available': bool(avail) and random.random() > 0.1,
                   'location': {'type': 'Point',
                                'coordinates': [round(float(lng) + random.uniform(-0.01, 0.01), 6),
                                                round(float(lat) + random.uniform(-0.01, 0.01), 6)]},
                   'created_at': now - timedelta(seconds=random.randint(0, 7000))}
    for b in chunks(pings()):
        db.WorkerLocations.insert_many(b, ordered=False)

    # Each freelancer's skills, decided once so that portfolios and reviews agree.
    skills_of = {fid: random.sample(SKILLS, random.randint(2, 6)) for fid, *_ in freelancers}

    # Workflow 4 data: reviews for completed contracts (rating skewed towards 4-5).
    # A2 fixes: a review only tags skills the freelancer actually has, and is written
    # after the contract was completed but never in the future.
    def reviews():
        for cid, fid, done in random.sample(completed, min(REVIEWS, len(completed))):
            rating = random.choices([1, 2, 3, 4, 5], weights=[4, 6, 15, 35, 40])[0]
            own = skills_of[fid]
            written = min((done or now) + timedelta(hours=random.randint(1, 48)), now)
            yield {'contract_id': cid, 'freelancer_id': fid, 'rating': rating,
                   'skill_tags': random.sample(own, random.randint(1, min(3, len(own)))),
                   'comment': random.choice(COMMENTS[rating]),
                   'created_at': written}
    for b in chunks(reviews()):
        db.GigReviews.insert_many(b, ordered=False)

    # Flexible catalog: one portfolio per freelancer; optional fields differ between documents
    def portfolios():
        for fid, name, *_ in freelancers:
            skills = skills_of[fid]
            doc = {'freelancer_id': fid, 'display_name': name,
                   'headline': f"{skills[0].replace('-', ' ').title()} specialist",
                   'hourly_rate_inr': random.choice([300, 500, 750, 1000, 1500, 2500]),
                   'skills': [{'name': s, 'years': random.randint(1, 12)} for s in skills],
                   'languages': random.sample(LANGS, random.randint(1, 3))}
            if random.random() < 0.7:
                doc['past_projects'] = [{'title': f'Project {i + 1}: {random.choice(skills)} work',
                                         'year': random.randint(2018, 2026),
                                         'tech': random.sample(skills, min(2, len(skills)))}
                                        for i in range(random.randint(1, 4))]
            if random.random() < 0.4:
                doc['certifications'] = random.sample(['AWS Certified', 'Google UX', 'Meta Front-End',
                                                       'Microsoft Excel Expert', 'ITI Electrician'], 2)
            if random.random() < 0.5:
                doc['links'] = {'github': f'https://github.com/{name.split()[0].lower()}{random.randint(1, 999)}'}
            if random.random() < 0.3:
                doc['availability'] = {'weekdays': random.choice([True, False]), 'weekends': random.choice([True, False]),
                                       'hours_per_week': random.choice([10, 20, 40])}
            yield doc
    for b in chunks(portfolios()):
        db.Portfolios.insert_many(b, ordered=False)

    print('MongoDB seeding complete: WorkerLocations=%d GigReviews=%d Portfolios=%d' % (
        db.WorkerLocations.estimated_document_count(), db.GigReviews.estimated_document_count(),
        db.Portfolios.estimated_document_count()))


if __name__ == '__main__':
    main()
