// Database connections shared by every route.
// pg.Pool keeps a few open Postgres connections and reuses them for each request.
// MongoClient does the same for MongoDB.
import pg from 'pg';
import { MongoClient } from 'mongodb';

// Return DECIMAL/NUMERIC columns as JS numbers instead of strings (fine for money with 2 decimals here).
pg.types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
// Return COUNT(*) (bigint) as a number too.
pg.types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));
// Return DATE columns as plain 'YYYY-MM-DD' text (otherwise they shift by your time zone).
pg.types.setTypeParser(1082, v => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gigtask',
  max: 10,
});

const mongoClient = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017', {
  serverSelectionTimeoutMS: 3000,   // fail fast (and show an error) if MongoDB is down
});
let mongoDb;

export async function mongo() {
  if (!mongoDb) {
    await mongoClient.connect();
    mongoDb = mongoClient.db(process.env.MONGO_DB || 'gigtask');
  }
  return mongoDb;
}

export async function closeAll() {
  await pool.end();
  await mongoClient.close();
}
