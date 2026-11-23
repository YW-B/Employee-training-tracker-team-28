// EN: Sign-in with Amazon Cognito from the browser, and keeping the tokens for this tab.
//     - USER_PASSWORD_AUTH, plus the MFA step (SOFTWARE_TOKEN_MFA) when Cognito asks for a 6-digit code.
//     - Tokens live in sessionStorage: they disappear when the tab is closed, and the access token expires
//       after 15 minutes anyway. They are never written to the page, the URL or the console.
//     - Sign-out calls GlobalSignOut, which revokes the refresh token on Cognito, then clears the tab.
//     The roles read here are ONLY to show the right menu. The backend checks the token on every request.
// Franco: Tasgeel el dokhool b Cognito men el browser, w e7tefaz el tokens lel tab di.
//     - USER_PASSWORD_AUTH, w khatwet el MFA lama Cognito yetlob code men 6 ar2am.
//     - El tokens fe sessionStorage: betetmesa7 lama el tab tet2efel, w el access token beyekhlas ba3d 15 de2ee2a
//       aslan. 3omrena ma bnekteb-ha fel page aw el URL aw el console.
//     - El sign-out beynady GlobalSignOut elly beyelghy el refresh token 3and Cognito, ba3den beyfadday el tab.
//     El roles hena 3ashan nwarry el menu el sa7 BAS. El backend howa elly bey-check el token fe kol request.
'use strict';
(function (root) {
  const KEY = 'ett.tokens';

  // EN: read the middle part of a JWT (no signature check here: that is the backend's job).
  // Franco: ne2ra el gozz el wastani men el JWT (mafeesh check lel signature hena: da shoghl el backend).
  function decodeToken(token) {
    try {
      const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = typeof atob === 'function' ? atob(part) : Buffer.from(part, 'base64').toString('binary');
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch {
      return null;
    }
  }

  // EN: expired (or unreadable) tokens count as signed out. 30 s margin for clock differences.
  // Franco: el token el khalsan (aw elly mesh bet-et2ere) yeb2a ka2ennak mesh 3amel login. 30 sanya hamesh.
  function isExpired(token, nowMs = Date.now()) {
    const claims = decodeToken(token);
    return !claims || typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs + 30000;
  }

  // EN: one call to the Cognito API (same JSON protocol as the AWS SDK).
  // Franco: call wa7ed le Cognito API (nafs el JSON protocol bta3 el AWS SDK).
  async function cognito(action, body, fetchImpl = root.fetch) {
    const cfg = root.ETT_CONFIG || {};
    const res = await fetchImpl(cfg.cognitoEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // EN: one generic message for wrong e-mail OR wrong password, so nobody can test which e-mails exist.
      // Franco: resala wa7da lel email el ghalat AW el password el ghalat, 3ashan mafeesh 7ad ye3raf anhy emails mawgooda.
      const type = String(data.__type || '');
      if (/NotAuthorized|UserNotFound/.test(type)) throw new Error('Wrong e-mail or password.');
      if (/CodeMismatch/.test(type)) throw new Error('Wrong MFA code.');
      throw new Error('Sign-in is not available right now. Please try again.');
    }
    return data;
  }

  function save(result) {
    root.sessionStorage.setItem(KEY, JSON.stringify({
      accessToken: result.AccessToken,
      refreshToken: result.RefreshToken || null,
    }));
  }

  function tokens() {
    try {
      return JSON.parse(root.sessionStorage.getItem(KEY)) || null;
    } catch {
      return null;
    }
  }

  // EN: step 1: e-mail + password. Returns { done: true } or { mfa: true, session } when a code is needed.
  // Franco: khatwa 1: email + password. Beyrga3 { done: true } aw { mfa: true, session } law me7tag code.
  async function signIn(email, password) {
    const cfg = root.ETT_CONFIG || {};
    const data = await cognito('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: cfg.cognitoClientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });
    if (data.AuthenticationResult) {
      save(data.AuthenticationResult);
      return { done: true };
    }
    if (data.ChallengeName === 'SOFTWARE_TOKEN_MFA') return { mfa: true, session: data.Session, email };
    throw new Error('This account needs a step that this page does not support. Ask your manager.');
  }

  // EN: step 2 (managers with MFA): the 6-digit code from the authenticator app.
  // Franco: khatwa 2 (el managers elly 3andohom MFA): el code el 6 ar2am men app el authenticator.
  async function confirmMfa(pending, code) {
    if (!/^\d{6}$/.test(String(code))) throw new Error('The code must be 6 digits.');
    const cfg = root.ETT_CONFIG || {};
    const data = await cognito('RespondToAuthChallenge', {
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      ClientId: cfg.cognitoClientId,
      Session: pending.session,
      ChallengeResponses: { USERNAME: pending.email, SOFTWARE_TOKEN_MFA_CODE: String(code) },
    });
    if (!data.AuthenticationResult) throw new Error('Wrong MFA code.');
    save(data.AuthenticationResult);
    return { done: true };
  }

  // EN: the current access token, or null if signed out or expired (then the tab is cleared).
  // Franco: el access token el 7aly, aw null law mesh 3amel login aw khalas (w sa3etha el tab betetfadda).
  function accessToken() {
    const t = tokens();
    if (!t || isExpired(t.accessToken)) {
      root.sessionStorage.removeItem(KEY);
      return null;
    }
    return t.accessToken;
  }

  // EN: who is signed in, for the menu only: { sub, roles }.
  // Franco: meen 3amel login, lel menu bas: { sub, roles }.
  function currentUser() {
    const token = accessToken();
    if (!token) return null;
    const claims = decodeToken(token) || {};
    const roles = (claims['cognito:groups'] || []).filter((g) => g === 'Employee' || g === 'Manager');
    return { sub: claims.sub, roles };
  }

  async function signOut() {
    const token = accessToken();
    root.sessionStorage.removeItem(KEY);
    if (token) {
      // EN: best effort: even if Cognito does not answer, the tab is already signed out.
      // Franco: bne7awel: 7atta law Cognito ma radsh, el tab kda kda 3amla sign-out.
      try { await cognito('GlobalSignOut', { AccessToken: token }); } catch { /* ignore */ }
    }
    root.location.href = '/index.html';
  }

  // EN: put at the top of every protected page: no valid token -> back to the sign-in page;
  //     wrong role -> home page. (A page is never a security boundary: the API still checks everything.)
  // Franco: fe awel kol page me7ameya: mafeesh token sa7 -> nerga3 le page el login; role ghalat -> el home.
  //     (El page 3omraha ma beteb2a 7emaya: el API bardo bey-check kol 7aga.)
  function requireSignIn(roles = []) {
    const user = currentUser();
    if (!user) {
      root.location.href = '/index.html';
      return null;
    }
    if (roles.length && !roles.some((r) => user.roles.includes(r))) {
      root.location.href = '/home.html';
      return null;
    }
    return user;
  }

  const api = { decodeToken, isExpired, signIn, confirmMfa, accessToken, currentUser, signOut, requireSignIn, cognito };
  root.ETT = Object.assign(root.ETT || {}, { auth: api });
  if (typeof module !== 'undefined') module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
