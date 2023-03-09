'use strict';
module.exports = {PRIV_getPersonsManager};
const {PRIV_getAppSvsUtil, context_values_get} = require("./app-svcs-util");


//
// Get the main object for managing persons.
//
function PRIV_getPersonsManager(personsDBCollName) {
  //
  // Main person manager class.
  //
  class PersonsManager {
    //
    // Main constructor for person manager.
    //    
    constructor(personsDBCollName) {
      const appSvsUtil = PRIV_getAppSvsUtil();
      this.personsCollection = appSvsUtil.getDBCollection(personsDBCollName);  
    }


    //
    // Retrieve info aboout a person by id from the database.
    //
    async getPersonInfo(personId) {  
      const queryFilter = {personId: personId}; 
      const queryProjection = {_id: 0, firstName: 1, lastName: 1, dateOfBirth: 1};
      const queryOptions = {projection: queryProjection};  // Used by standalone node.js only
      // ACTION: REMOVE   (node.js only)
      return await this.personsCollection.findOne(queryFilter, queryOptions); 
      // ACTION: UNCOMMENT   (atlas-app-svcs only)
      //return await this.personsCollection.findOne(queryFilter, queryProjection);
    }
  

    //
    // Save info abpit a person by id into the database.
    //
    async setPersonInfo(personInfo) {  
      const personId = personInfo.personId;
      delete personInfo.personId;
      const query = {personId: personId};
      const update = {"$set": personInfo};
      const options = {"upsert": true};
      const result = await this.personsCollection.updateOne(query, update, options);
      return {updatedCount: (result?.upsertedCount ?? 0) + (result?.modifiedCount ?? 0)};
    }
  }


  return new PersonsManager(personsDBCollName);
}
