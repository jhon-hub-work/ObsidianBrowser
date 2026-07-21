// Google (and a few others) refuse to sign you in from an "embedded browser".
// They sniff three things: the UA string, the sec-ch-ua client hints, and
// navigator.userAgentData in page JS.
//
// Strategy:
//  - Everywhere: present stock Chrome (we genuinely are that Chromium build).
//  - On Google's auth hosts ONLY: present Firefox. Google fully supports
//    Firefox, and Firefox has no client hints and no userAgentData, so there
//    is nothing for Google to cross-check. content.js patches the page-side
//    navigator to match. Far more stable than a fake-Chrome fingerprint.
const CHROMIUM_MAJOR = process.versions.chrome.split('.')[0];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  `(KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36`;

const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

// Client Hints must agree with the Chrome UA or the sniff fails anyway.
const CH = {
  'sec-ch-ua': `"Chromium";v="${CHROMIUM_MAJOR}", "Google Chrome";v="${CHROMIUM_MAJOR}", "Not=A?Brand";v="24"`,
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"'
};

const GOOGLE_AUTH_HOSTS = new Set([
  'accounts.google.com',
  'accounts.youtube.com',
  'accounts.google.com.ph' // regional variants Google occasionally bounces through
]);

function isGoogleAuth(url) {
  try {
    return GOOGLE_AUTH_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

// Rewrite headers on every outgoing request: Firefox identity for Google's
// auth hosts, clean Chrome for the rest. Also covers service workers and
// prefetch, which don't inherit the session UA.
function applyToSession(session) {
  session.setUserAgent(UA);

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };

    if (isGoogleAuth(details.url)) {
      headers['User-Agent'] = FIREFOX_UA;
      // Firefox sends no client hints at all.
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase().startsWith('sec-ch-ua')) delete headers[k];
      }
    } else {
      headers['User-Agent'] = UA;
      for (const [k, v] of Object.entries(CH)) headers[k] = v;
    }

    callback({ requestHeaders: headers });
  });
}

module.exports = { UA, FIREFOX_UA, GOOGLE_AUTH_HOSTS, applyToSession };
