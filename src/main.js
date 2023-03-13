'use strict';
require("dotenv").config();
const {PRIV_getConstants} = require("./constants");
const {PRIV_getAppSvsUtil, context_values_get} = require("./app-svcs-util");
const {PRIV_getPersonsManager} = require("./persons-manager");


// TEST WRAPPER  (similar to App Services' function test console, but for standalone Node.js)
(async () => {
  const appSvsUtil = PRIV_getAppSvsUtil();
  appSvsUtil.logStartTimestamp();
  let result = await GET_personInfo({query: {personId: 1}});
  //let result = await POST_personInfo({body: {text: () => {return JSON.stringify({personId: 2, firstName: "Jon", lastName: "Smith", dateOfBirth: new Date()})}}});
  //let result = await PRIV_logHostEnv();
  //let result = await PRIV_logDatabaseEvent();
  appSvsUtil.logEndTimestampWithJSONResult(result);
})();


//
// REST GET API to obtain the info on a person by id.
//
// HTTP Query Parameters: 
//  personId: MANDATORY
//
async function GET_personInfo(request, response) {
  const appSvsUtil = PRIV_getAppSvsUtil();
  ({request, response} = appSvsUtil.ensureRequestResponseExist(request, response));

  try {
    const personId = (("personId" in request.query) && request.query.personId) ? Number(request.query.personId) : null;

    if (!personId) {
      response.setStatusCode(400);
      return {errorMessage: `HTTP query string must include the parameter 'personId'`};
    } 
      
    const personsDBCollName = PRIV_getConstants().PERSONS_COLLNAME;  
    const personsManager = PRIV_getPersonsManager(personsDBCollName);
    return {results: await personsManager.getPersonInfo(personId)};
  } catch (error) {
    return appSvsUtil.logErrorAndReturnGenericError(error, response);
  }
}


//
// REST POST API to proviude a persons's info to save.
//
// HTTP Body: 
//  {personId: ??, firstName: ??, lastName: ??, dateOfBirth: ??}
//
async function POST_personInfo(request, response) {
  const appSvsUtil = PRIV_getAppSvsUtil();
  ({request, response} = appSvsUtil.ensureRequestResponseExist(request, response));

  try {
    const bodyText = request.body.text();
    const personInfo = JSON.parse(bodyText);

    if (!personInfo || !("personId" in personInfo)) {
      response.setStatusCode(400);
      return {errorMessage: `HTTP body must contains a JSON payload with a 'personId' field`};
    } 
      
    const personsDBCollName = PRIV_getConstants().PERSONS_COLLNAME;  
    const personsManager = PRIV_getPersonsManager(personsDBCollName);
    return {results: await personsManager.setPersonInfo(personInfo)};
  } catch (error) {
    return appSvsUtil.logErrorAndReturnGenericError(error, response);
  }
}


//
// Return the details of the running function (its type of runtime, its public facing IP address
// and administrator contact details.
//
async function PUB_getHostEnv() {
  const hostEnvInfo = await PRIV_getHostEnv();
  return hostEnvInfo;
}


//
// Log and return the details of the running function (its type of runtime, its public facing IP
// address and administrator contact details.
//
async function PRIV_logHostEnv() {
  const hostEnvInfo = await PRIV_getHostEnv();
  console.log(`Host env: ${JSON.stringify(hostEnvInfo, null, 2)}`);
  return hostEnvInfo;
}


//
// Get the details of the running function (its type of runtime, its public facing IP address and
// administrator contact details.
//
async function PRIV_getHostEnv() {
  const appSvsUtil = PRIV_getAppSvsUtil();
  const runtimeType = appSvsUtil.isRunningInAppSvcs() ? "mongodb-atlas-app-services" : "standalone-node-js";
  const axios = require("axios").default;  
  const ipAddressCheckURL = PRIV_getConstants().IP_ADDRESS_CHECK_URL;  
  let response = await axios.get(ipAddressCheckURL);
  const runtimeIPAddress = response.data.ip;
  const adminContactEmail = context_values_get("ADMIN_EMAIL_ADDRESS");  
  const adminContactTelNum = context_values_get("ADMIN_TEL_NUM");  
  const hostEnvInfo = {
    runtimeType,
    runtimeIPAddress,
    adminContactEmail,
    adminContactTelNum,
  };
  return hostEnvInfo;
}


//
// Log the change event received from a database trigger.
//
async function PRIV_logDatabaseEvent(changeEvent) {
  changeEvent ??= {changeEvent: "missing"};
  console.log(`Database event triggered: ${JSON.stringify(changeEvent, null, 2)}`);
  return {logged: true};
}
