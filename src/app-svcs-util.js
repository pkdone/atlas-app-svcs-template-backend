'use strict';
module.exports = {PRIV_getAppSvsUtil, context_values_get};
require("dotenv").config();


//
// Get the main object for accessing App Services utility functions.
//
function PRIV_getAppSvsUtil() {
  //
  // Main App Services utilities class.
  //
  class AppSvsUtil {
    //
    // Log the start timestamp.
    //
    // Typically only used when running this code in standalone Node.js (not in Atlas App Services)
    //
    logStartTimestamp() {
      console.log(`START: ${new Date()}`);
    }


    //
    // Log the result JSON to the console and also a log file cos it may be really larger, also
    // logging end timestamp.
    //
    // Typically only used when running this code in standalone Node.js (not in Atlas App Services)
    //
    logEndTimestampWithJSONResult(result) {
      result = result || "<empty-result>";
      const fs = require("fs");
      console.log(JSON.stringify(result, null, 2));
      const TESTING_OUPUT_FILE = "tmp/results.json";
      fs.writeFileSync(TESTING_OUPUT_FILE, JSON.stringify(result, null, 2));
      console.log(`Test output file is at: ${TESTING_OUPUT_FILE}`);
      console.log(`END: ${new Date()}`);
    }


    
    //
    // Indicate whether the current code is running inside the Atlas App Services runtime, rather
    // than standalone Node.js.
    //
    isRunningInAppSvcs() {
      return (typeof context !== "undefined");
    }


    //
    // Ensures there are request and response objects already present, and if not, creates placeholder
    // versions.
    //
    // Required in Atlas App Services when hitting "Run" in the Funcitons console for functions really
    // intended to be invoked by HTTPS Endpoints directly.
    //
    // Required in Standaloine Node.js to enable the same code to work outside of the App Services
    // server-side runtime - in this case usually the 'dummayParameters' is also provided with fake
    // GET/POST parameters for testing standalone.
    //
    ensureRequestResponseExist(request, response, defaultParameters = {}) {
      if (typeof request === 'string') {
        request = {param1: request};
      } else if (!request) {
        request = {};
      }

      request.body = request.body || {};

      if (!request.body.text) {
        request.body.text = () => JSON.stringify(defaultParameters, null, 2);
      }

      request.query = request.query || defaultParameters;

      if (!response) {
        response = {};
        response.setHeader = () => {};
        response.setBody = () => {};
        response.setStatusCode = () => {};
      }

      return {request, response};
    }


    //
    // Get handle on a DB collection (mechanism varies if running in App Servicies vs standalone)
    //
    getDBCollection(collname) {
      let client;

      if (this.isRunningInAppSvcs()) {
        client = context.services.get("mongodb-atlas"); 
      } else {
        const {MongoClient} = require("mongodb");
        client = new MongoClient(context_values_get("MONGODB_URL"));  
      }

      const dbName = context_values_get("DB_NAME");  
      const db = client.db(dbName);
      return db.collection(collname);
    }


    //
    // Log error, then if in dev mode throw error again so full root cause can be seen, otherwise
    // return generic error message
    //
    logErrorAndReturnGenericError(error, response=null) {
      console.error("Problem executing function");
      console.error(error);

      if (response) {
        response.setStatusCode(500);
      } else {
        throw error;
      }

      return ({msg: "Internal error"});
    }
  }


  return new AppSvsUtil();
}


//
// Stand-in replacement for Atlas App Services "context.values.get()" (in the app services project
// the app services secret associated with a value will be used instead).
// Only used when running this code in standaline Node.js - redacted out when converted to Atlas
// App Services.
// 
function context_values_get(key) {
  const value = process.env[key];

  if ((!value) || (value.trim().length <= 0)) {
    throw `Unable to locate the key-value pair for '${key}' in the '.env' file in this project's root folder - ensure this file exists and contains the key-value pair`;
  }

  return value;
}
