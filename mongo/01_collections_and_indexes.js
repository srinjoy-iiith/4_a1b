// A2 changes: select the gigtask database explicitly and skip collections that already exist,
// so the script can be re-run (and used by docker-compose) without errors.
db = db.getSiblingDB('gigtask');
const existing = db.getCollectionNames();
['Portfolios', 'GigReviews', 'WorkerLocations'].forEach(c => { if (!existing.includes(c)) db.createCollection(c); });

db.Portfolios.createIndex({freelancer_id:1},{unique:true});
db.GigReviews.createIndex({freelancer_id:1,created_at:-1});
db.GigReviews.createIndex({rating:1});
db.GigReviews.createIndex({skill_tags:1});
db.WorkerLocations.createIndex({location:'2dsphere'});
db.WorkerLocations.createIndex({created_at:1},{expireAfterSeconds:7200});
db.runCommand({collMod:'GigReviews',validator:{$jsonSchema:{bsonType:'object',required:['freelancer_id','rating','skill_tags','created_at'],properties:{freelancer_id:{bsonType:'string'},rating:{bsonType:'int',minimum:1,maximum:5},skill_tags:{bsonType:'array',items:{bsonType:'string'}},created_at:{bsonType:'date'}}}}});
print('GigTask collections and indexes ready');
