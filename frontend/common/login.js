// EN: Logic of the sign-in page (index.html). Kept in its own file because the page allows no inline scripts.
// Franco: Logic page el login (index.html). Fe file lewa7do 3ashan el page mesh bet-sma7 b scripts inline.
'use strict';
(function () {
  const { auth, ui } = window.ETT;
  const passwordForm = document.getElementById('password-form');
  const mfaForm = document.getElementById('mfa-form');
  let pending = null; // EN: waiting for the MFA code / Franco: mestanneyin code el MFA

  // EN: already signed in -> go straight to the home page.
  // Franco: law 3amel login khalas -> ro7 el home 3ala tool.
  if (auth.currentUser()) window.location.replace('/home.html');

  if (!window.ETT_CONFIG.cognitoClientId) {
    ui.showError('Sign-in is not set up yet: run "node scripts/make_frontend_config.js" after the Cognito setup.');
  }

  passwordForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = passwordForm.querySelector('button');
    ui.busy(button, async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const result = await auth.signIn(email, password);
      document.getElementById('password').value = ''; // EN: do not keep the password on the page / Franco: manseebsh el password fel page
      if (result.mfa) {
        pending = result;
        passwordForm.hidden = true;
        mfaForm.hidden = false;
        document.getElementById('code').focus();
        return;
      }
      window.location.replace('/home.html');
    });
  });

  mfaForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = mfaForm.querySelector('button');
    ui.busy(button, async () => {
      await auth.confirmMfa(pending, document.getElementById('code').value.trim());
      window.location.replace('/home.html');
    });
  });
}());
