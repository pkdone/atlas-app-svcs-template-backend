'use strict';
require('dotenv').config();
const {PRIV_getConstants} = require("./constants");


//
// Seed some of the Guvnor database collect with data and ensure the required indexes exist
//
(async() => {
  let client;

  try {
    const mongodbURL = process.env.MONGODB_URL;
    const {MongoClient} = require("mongodb");
    client = new MongoClient(mongodbURL);  
    const dbName = process.env.DB_NAME;
    const db = client.db(dbName);
    await populatePersonsCollection(db);
    await ensureRequiredIndexes(db);
  } catch (error) {
    const extraMsg = (error.toString().includes("MongoServerSelectionError")) ?
                     "Unable to connect to the MongoDB cluster using the URL defined by property 'MONGODB_URL' in your '.env' file. Error message: " :
                     "";
    console.error(`FATAL ERROR: ${extraMsg}${error}`);
    process.exit(1);
  } finally {
    client && client.close();
  }
})();


//
// Add initial required documents to the persons collection.
//
async function populatePersonsCollection(db) {
  const collName = PRIV_getConstants().PERSONS_COLLNAME;
  const personId = PRIV_getConstants().FIRST_PERSON_ID;
  const coll = db.collection(collName);
  await coll.updateOne(
    {personId: personId},
    {"$set": {firstName: "Jane", lastName: "Doe", dateOfBirth: new Date()}},
    {upsert: true},
  );
  console.log(` - Inserted/updated documents in collection '${coll.dbName}.${coll.collectionName}'`);  
}


//
// Ensure required indexes for the collections are present and create them if not.
//
async function ensureRequiredIndexes(db) {
  const collName = PRIV_getConstants().PERSONS_COLLNAME;
  const coll = db.collection(collName);
  await coll.createIndex({personId: 1}, {name: "persons_personId_idx", unique: true});
  console.log(` - Ensured indexes exist for collection '${coll.dbName}.${coll.collectionName}'`);
}
