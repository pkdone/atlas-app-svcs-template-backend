'use strict';
module.exports = {PRIV_getConstants};


//
// Get project constants
// 
function PRIV_getConstants() {
  return {
    IP_ADDRESS_CHECK_URL: "https://api.my-ip.io/ip.json",
    PERSONS_COLLNAME: "persons",
    FIRST_PERSON_ID: 1,
  }
}
