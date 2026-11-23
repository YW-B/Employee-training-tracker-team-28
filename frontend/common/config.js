// EN: Frontend settings. The Cognito web client id is a PUBLIC value (it is not a secret), but it changes
//     every time Cognito is set up again, so it is written by `node scripts/make_frontend_config.js` into
//     frontend/config.local.js (git-ignored), which is loaded after this file and overrides these defaults.
// Franco: Settings el frontend. El Cognito web client id 2eema PUBLIC (mesh secret), bas betetghayyar kol mara
//     Cognito yet3emel men el awel, f beyetkteb b `node scripts/make_frontend_config.js` fe
//     frontend/config.local.js (git-ignored), elly beyet7ammel ba3d el file da w beyghayyar el defaults.
'use strict';
window.ETT_CONFIG = Object.assign(
  {
    // EN: Locally nginx forwards /cognito/ to Floci, so the browser talks to one HTTPS origin only.
    //     On real AWS this becomes https://cognito-idp.<region>.amazonaws.com/
    // Franco: Local, nginx bey-forward /cognito/ le Floci, f el browser beykallem origin HTTPS wa7ed bas.
    //     3ala AWS el 7a2i2i beyb2a https://cognito-idp.<region>.amazonaws.com/
    cognitoEndpoint: '/cognito/',
    cognitoClientId: '',
  },
  window.ETT_CONFIG || {},
);
