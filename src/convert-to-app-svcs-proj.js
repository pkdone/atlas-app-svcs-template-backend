'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const fsExtra = require('fs-extra');
const readline = require('readline');


//
// Code conversion utility to move runnable code from standalone Node.js to Atlas App Services.
//
// Uses the content of "template" to form the base structure for a generated project into the
// folder "build", setting the app's name and data source in the project config on the fly,
//
// Functions with the following prefixes in their names will all be converted to App Services
// functions (+ additional specific behaviour shown in brackets):
//
//  * GET_ or POST_ or PUT_ or DELETE_ or PATCH_  (sets function to private and creates an HTTPS
//         Endpoint with "query string" auth enabled based on a secret called HTTPS_TMP_PWD_SECRET)
//  * PUB_  (set function to public)
//  * PRIV_  (set function to private)
//
// Functions without the above prefixes will NOT be included in the App Services deployed app.
//
// Add one of the following new lines above an existing line in the source code if you want the
// existing line to then be commented-out/uncommented/removed during the code conversion process:
//
//     // ACTION: COMMENT
//     // ACTION: UNCOMMENT
//     // ACTION: REMOVE
//
// Replaces every place in the code that uses "context_values_get()" to use the App Services
// function "context.values.get()" instead which will then get values from secrets..
//
// Wraps calls from one function to another inside "context.functions.execute()" to enable the
// function invocation to work correctly when running in App Services.
//
// Replaces some tokens with deployment environment values in various App Services JSON config
// files:
//
//     __APP_NAME__
//     __REGION__
//     __LOCATION__
//     __CLUSTER_NAME__
//     __DB_NAME__
//
(async () => {
  try {
    const appName = process.env.APP_NAME;
    const sourceFolder = "src";
    const appTemplateDir = "template";
    const generatedAppDir = "build";
    const deploymentRegion = process.env.APP_SVCS_DEPLOY_REGION;
    const deploymentRegionsMetadataFile = path.join("src", 'atlas-app-services-regions.json');
    const dbClusterName = process.env.DB_CLUSTER_NAME;
    const dbName = process.env.DB_NAME;
    await generateAppSrvcsApp(sourceFolder, appName, appTemplateDir, generatedAppDir, deploymentRegion, deploymentRegionsMetadataFile, dbClusterName,dbName);
  } catch (error) {
    console.error(`FATAL ERROR: ${error}`);
    process.exit(1);
  }
})();


//
// Create the App Services app from a template and generating additional parts
//
async function generateAppSrvcsApp(sourceJSFolder, appName, appTemplateDir, appDir, deploymentRegion, deploymentRegionsMetadataFile, clusterName, dbName) {  
  await createSkeletonAppStructure(appDir, appName, appTemplateDir, deploymentRegion, deploymentRegionsMetadataFile, clusterName, dbName);
  await generateFunctionsResourcesForAllSrcFiles(appDir, sourceJSFolder);
  console.log(` - Converted standalone Node.js code to Atlas App Services functions and generated new app services app project in sub-folder: ${appDir}`);
}


//
// Copy the template over and replace some config values in some of the JSON with real values
// (e.g. app name)
//
async function createSkeletonAppStructure(appDir, appName, appTemplateDir, deploymentRegion, deploymentRegionsMetadataFile, clusterName, dbName) {  
  fs.rmSync(appDir, {recursive: true, force: true});
  await fsExtra.copy(appTemplateDir, appDir, {overwrite: true});
  replaceTokensInFile(path.join(appDir, 'realm_config.json'), '__APP_NAME__', appName);
  replaceTokensInFile(path.join(appDir, 'realm_config.json'), '__REGION__', deploymentRegion);
  let regionId = getDeploymentRegionId(deploymentRegion, deploymentRegionsMetadataFile);
  replaceTokensInFile(path.join(appDir, 'realm_config.json'), '__LOCATION__', regionId);
  replaceTokensInFile(path.join(appDir, 'data_sources', 'mongodb-atlas', 'config.json'), '__CLUSTER_NAME__', clusterName);
  replaceTriggerConfigDBReferencesFiles(appDir, dbName);
}


//
// Create App Services function resource for every function in every JS source file contained in 
// the specific folder
//
async function generateFunctionsResourcesForAllSrcFiles(appDir, sourceJSFolder) {
  const functionsDir = path.join(appDir, 'functions');
  const functionsConfigFile = path.join(functionsDir, 'config.json');
  const httpsEndpointsDir = path.join(appDir, 'http_endpoints');
  const endpointsConfigFile = path.join(httpsEndpointsDir, 'config.json');
  fs.writeFileSync(functionsConfigFile, '[');
  fs.writeFileSync(endpointsConfigFile, '[');
  let isFirstFunc = true;
  let isFirstEndpoint = true;

  for (const file of fs.readdirSync(sourceJSFolder)) {
    const filePath = path.join(sourceJSFolder, file);

    if ((fs.lstatSync(filePath).isFile()) && (filePath.endsWith('.js'))) {
      ({ isFirstFunc, isFirstEndpoint } = await generateFunctionsResourcesForSrcFile(filePath, 
            functionsDir, functionsConfigFile, isFirstFunc, isFirstEndpoint, endpointsConfigFile));
    }
  };

  fs.appendFileSync(endpointsConfigFile, '\n]');
  fs.appendFileSync(functionsConfigFile, '\n]');
}


//
// For a JS source file, extract each of its functions and create a seperate top level function
// source file + config for it. Also if function name starts with REST method prefix then create 
// an HTTPS Endpoont too.
//
async function generateFunctionsResourcesForSrcFile(filename, functionsDir, functionsConfigFile, isFirstFunc, isFirstEndpoint, endpointsConfigFile) {
  const fileStream = fs.createReadStream(filename);
  const lines = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let nextFunction = null;

  for await (const line of lines) {
    const startFuncMatches = line.match(/^(async )?function\s\s*(\w*)\((.*)/);

    if (startFuncMatches) {
      nextFunction = {
        functionName: startFuncMatches[2],
        isAsync: Boolean(startFuncMatches[1]),
        functionDeclarationEndLine: startFuncMatches[3],
        content: '',
      };
    } else if (nextFunction) {
      const endFuncMatches = line.match(/^\}.*/);

      if (endFuncMatches) {
        nextFunction.content += '};'; // Add end of function export deliminator
        isFirstFunc = generateFuncContentInNewDirectory(functionsDir, functionsConfigFile, nextFunction, isFirstFunc);
        isFirstEndpoint = generateHTTPSEndpointForFunc(endpointsConfigFile, nextFunction.functionName, isFirstEndpoint);
        nextFunction = null;
      } else {
        nextFunction.content += `${line}\n`; // Add current line as is
      }
    }
  }
  return { isFirstFunc, isFirstEndpoint };
}


//
// Create the JS file config files for invidual JS function
//
function generateFuncContentInNewDirectory(funcDir, configFile, functionMetadata, isFirstFunc) {
  const FUNCS_TO_TRANSFER_PREFIXES = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'PUB', 'PRIV'];  
  const matches = functionMetadata.functionName.match(/^([A-Z]+)_[^\s_]+(_[A-Z]+)?$/);  // Get the prefix for the function (if any)

  if (matches) {
    const prefix = matches[1];
  
    if (FUNCS_TO_TRANSFER_PREFIXES.indexOf(prefix) < 0) {
      return isFirstFunc;
    }
  } else {
    return isFirstFunc;
  }

  //console.log(`  ${functionMetadata.functionName}: exports = ${functionMetadata.isAsync ? 'async ' : ''}function(${functionMetadata.functionDeclarationEndLine}`); 
  generateFunctionConfigFile(isFirstFunc, configFile, functionMetadata);
  generateFunctionJSSourceFile(funcDir, functionMetadata, FUNCS_TO_TRANSFER_PREFIXES); 
  return false;
}


//
// Create the config file for one JSON function
//
function generateFunctionConfigFile(isFirstFunc, configFile, functionMetadata) {
  if (!isFirstFunc) {
    fs.appendFileSync(configFile, ',');
  }

  const isPrivate = !functionMetadata.functionName.startsWith("PUB_");
  const doRunAsSystem = !functionMetadata.functionName.endsWith("_AA");
  fs.appendFileSync(configFile, '\n');

  const configJson = `  {
    "name": "${functionMetadata.functionName}",
    "private": ${isPrivate},
    "run_as_system": ${doRunAsSystem},    
    "disable_arg_logs": true
  }`;

  fs.appendFileSync(configFile, configJson);
}


//
// Create the source JS file for one function fixing some of the code where needed to work properly
// in App Services instead of Node.js
//
function generateFunctionJSSourceFile(funcDir, functionMetadata, funcsToTransferPrefixes) {
  const jsFile = `${funcDir}/${functionMetadata.functionName}.js`;
  const newFirstLine = `exports = ${functionMetadata.isAsync ? 'async ' : ''}function(${functionMetadata.functionDeclarationEndLine}\n`;
  fs.appendFileSync(jsFile, newFirstLine);
  let nextLineAction = null;

  for (const line of functionMetadata.content.split(/\r?\n/)) {
    const actionMatches = line.match(/.*ACTION:\s*(\S+)\s*/);

    if (actionMatches) {
      nextLineAction = actionMatches[1];
    } else if (nextLineAction === "REMOVE") {
      // Don't do anything with the line (so will just throw it away)
      nextLineAction = null;
    } else if (nextLineAction === "COMMENT") {
      fs.appendFileSync(jsFile, `  //${line}\n`);
      nextLineAction = null;
    } else if (nextLineAction === "UNCOMMENT") {
      fs.appendFileSync(jsFile, `${line.replace('//', '')}\n`);
      nextLineAction = null;
    } else {
      let modifiedLine = line.replace("context_values_get", "context.values.get");

      for (const funcPrefix of funcsToTransferPrefixes) {
        const newModifiedLine = getModifiedFuncExecutionText(modifiedLine, funcPrefix);

        if (newModifiedLine) {
          modifiedLine = newModifiedLine;
          break;
        }
      }

      fs.appendFileSync(jsFile, `${modifiedLine}\n`);
      nextLineAction = null;
    }
  }
}


//
// Contain a function's call to another func in App Services inside a
// "context.functions.execute()"
//
function getModifiedFuncExecutionText(text, funcPrefix) {
  const regex = `(.*)(${funcPrefix}.*)\\((.*)\\)(.*)`;
  const matches = text.match(new RegExp(regex));
  
  if (matches) {
    const prefix = matches[1];
    const funcName = matches[2];
    const params = matches[3];
    const suffix = matches[4];
    let paramsText = "'";

    if (params) {
      paramsText = `', ${params}`;
    } 

    return `${prefix}context.functions.execute('${funcName}${paramsText})${suffix}`;
  }

  return null;
}


//
// Replace every occurrence of a token in a file with a replacement string
//
function replaceTokensInFile(filepath, tokenStr, replaceStr) {
  let content = fs.readFileSync(filepath, {encoding:'utf8', flag:'r'});
  content = content.replace(new RegExp(tokenStr, 'g'), replaceStr);
  fs.writeFileSync(filepath, content);
}


//
// Replace any DB references in the trigger definitions JSON files
//
function replaceTriggerConfigDBReferencesFiles(appDir, dbName) {
  const triggersFolderpath = path.join(appDir, 'triggers');

  for (const file of fs.readdirSync(triggersFolderpath)) {
    const filePath = path.join(triggersFolderpath, file);

    if ((fs.lstatSync(filePath).isFile()) && (filePath.endsWith('.json'))) {      
      replaceTokensInFile(filePath, '__DB_NAME__', dbName);
    }
  };


}


//
// From the 'app-services-regions.json' get the matching id for a App Services region to deploy to
//
function getDeploymentRegionId(deploymentRegion, deploymentRegionsMetadataFile) {
  const content = fs.readFileSync(deploymentRegionsMetadataFile, {encoding:'utf8', flag:'r'});
  let regionsInfo = JSON.parse(content);
  
  if (!regionsInfo[deploymentRegion]) {
    throw `'APP_SVCS_DEPLOY_REGION="${deploymentRegion}"' defined in '.env' cannot be matched with a supported region listed in 'deploymentRegionsFile'`;
  }

  return regionsInfo[deploymentRegion].id;
}


// 
// Create a HTTP endpoint for a specific function only if its name is prefixed with by the name of
// a REST verb
// 
function generateHTTPSEndpointForFunc(configFile, functionName, isFirstEndpoint) {
  const REST_HTTP_FUNCS_PREFIXES = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];  

  let httpMethod = null;
  let resourceName = null;
  const matches = functionName.match(/^([A-Z]+)_([^\s_]+)(_[A-Z]+)?$/);  // Look for func names beginning with a REST prefix

  if (matches) {
    httpMethod = matches[1];
    resourceName = matches[2];
  } else {
    // Return non-changed flag cos this function wasn't mean to be for an API endpoint
    return isFirstEndpoint;
  }

  if ((!resourceName) || (REST_HTTP_FUNCS_PREFIXES.indexOf(httpMethod) < 0)) {
    // Return non-changed flag cos this function wasn't mean to be for an API endpoint
    return isFirstEndpoint;
  }
  
  if (!isFirstEndpoint) {
    fs.appendFileSync(configFile, ',');
  }

  fs.appendFileSync(configFile, '\n');

  const configJson = `  {
    "route": "/${resourceName}",
    "http_method": "${httpMethod}",
    "function_name": "${functionName}",
    "validation_method": "NO_VALIDATION",
    "respond_result": true,
    "fetch_custom_user_data": false,
    "create_user_on_auth": false,
    "disabled": false,
    "return_type": "JSON"
  }`;  

  fs.appendFileSync(configFile, configJson);
  return false;  // Indicate that no longer first endpoint created
}
