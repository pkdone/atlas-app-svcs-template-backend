#!/bin/bash
ROOT_FOLDER=$(pwd)
rm -rf build/* tmp/*

# Load environment variables from '.env' file
source .env

# Update dependency packages
npm install

# Initialise the DB with required data and indexes
npm run initdb || exit 1

# Build the app (converting Node.js funcs to app services funcs)
npm run build || exit 1

# Login to the App Services project runtime
realm-cli login -y --api-key="${ATLAS_ADMIN_API_PROJECT_PUBLIC_KEY}" --private-api-key="${ATLAS_ADMIN_API_PROJECT_PRIVATE_KEY}"

# Undeploy old app (if it exists)
cd ${ROOT_FOLDER}/build
realm-cli apps delete --app="${APP_NAME}" -y
printf "^ Ignore 'app delete failed' errors here if the app was not previously deployed\n"

# Deploy skeleton version of the app
realm-cli push -y
printf "^ Ignore 'push failed' errors here because these will be fixed by a subsequent push\n"

# Upload some 'standard' secrets
realm-cli secrets create --app="${APP_NAME}" --name ATLAS_ADMIN_API_PROJECT_PUBLIC_KEY_SECRET --value "${ATLAS_ADMIN_API_PROJECT_PUBLIC_KEY}"
realm-cli secrets create --app="${APP_NAME}" --name ATLAS_ADMIN_API_PROJECT_PRIVATE_KEY_SECRET --value "${ATLAS_ADMIN_API_PROJECT_PRIVATE_KEY}"
realm-cli secrets create --app="${APP_NAME}" --name DB_NAME_SECRET --value "${DB_NAME}"

# Upload 'custom' secrets required by the app
for secret in "${SECRETS_LIST[@]}"; do
	printf "Custom secret '${secret}_SECRET': "
  realm-cli secrets create --app="${APP_NAME}" --name "${secret}_SECRET" --value "${secret}"
done

# Deploy full version of the app
realm-cli push --include-package-json -y || exit 1