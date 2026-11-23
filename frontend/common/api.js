// EN: The one helper every page uses to call the API through nginx (same origin, HTTPS).
//     It adds the Bearer token, sends/reads JSON, and turns the contract's error body
//     { error: { code, message } } into an Error with a readable message.
//     401 = the token is missing or expired -> sign out and go back to the sign-in page.
// Franco: El helper el wa7ed elly kol page btesta3melo 3ashan tekallem el API 3an taree2 nginx (nafs el origin, HTTPS).
//     Beyzawwed el Bearer token, beyeb3at w ye2ra JSON, w bey7awwel error body bta3 el contract
//     { error: { code, message } } le Error b-resala mafhooma.
//     401 = el token mesh mawgood aw khalas -> sign out w nerga3 le page el login.
'use strict';
(function (root) {
  class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  // EN: friendly text per status when the body has no message.
  // Franco: kalam basit le kol status law el body malosh message.
  const DEFAULT_MESSAGES = {
    400: 'Please check the values you entered.',
    403: 'You are not allowed to do this.',
    404: 'Not found.',
    413: 'The file is too large.',
    415: 'This file type is not allowed.',
    502: 'A service gave a wrong answer. Please try again.',
    503: 'A service is not available right now. Please try again.',
  };

  async function request(path, { method = 'GET', body, raw = false, fetchImpl = root.fetch } = {}) {
    const token = root.ETT.auth.accessToken();
    if (!token) {
      root.ETT.auth.signOut();
      throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again.');
    }
    const headers = { Authorization: `Bearer ${token}`, Accept: raw ? '*/*' : 'application/json' };
    const options = { method, headers };
    if (body instanceof root.FormData) {
      options.body = body; // EN: file upload: the browser sets the content type / Franco: el browser beyhot el type
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const res = await fetchImpl(path, options);
    if (res.status === 401) {
      root.ETT.auth.signOut();
      throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = (data && data.error) || {};
      throw new ApiError(res.status, err.code || 'ERROR', err.message || DEFAULT_MESSAGES[res.status] || 'Something went wrong.');
    }
    if (raw) return res;
    if (res.status === 204) return null;
    return res.json();
  }

  // EN: download a file (for example the CSV export) with the token, then let the browser save it.
  // Franco: nenazzel file (zay el CSV) bel token, ba3den el browser ye-save-o.
  async function download(path, fileName) {
    const res = await request(path, { raw: true });
    const url = root.URL.createObjectURL(await res.blob());
    const a = root.document.createElement('a');
    a.href = url;
    a.download = fileName;
    root.document.body.appendChild(a);
    a.click();
    a.remove();
    root.URL.revokeObjectURL(url);
  }

  const api = {
    get: (path, opts) => request(path, { ...opts, method: 'GET' }),
    post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
    patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
    put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
    del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
    request,
    download,
    ApiError,
  };
  root.ETT = Object.assign(root.ETT || {}, { api });
  if (typeof module !== 'undefined') module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
