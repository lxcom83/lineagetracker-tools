/* Sign-in page for the tools: password, then the authenticator code if the account has one. Same accounts and the
   same checks as lineagetracker.org. */
import { CFG, loadConfig, $, el, signIn, signOut, authUser, verifiedFactor, challengeVerify, whoAmI, turnstile, rootUrl, TOOLS } from './core.js';
import { topBar } from './bar.js';

const NEXT_OK = Object.values(TOOLS).map(t => t.path).concat(['']);
const qs = n => { const m = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search || ''); try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; } };
const next = NEXT_OK.includes(qs('next')) ? qs('next') : '';
const GOT = {
  invalid_credentials: 'That email and password do not match. Check them and try again, or reset your password on the website.',
  user_banned: 'This account is not able to sign in right now. Write to feedback@lineagetracker.org if you think this is a mistake.',
  over_request_rate_limit: 'That was a few too many tries. Please wait a little and try again.', over_email_send_rate_limit: 'That was a few too many tries. Please wait a little and try again.',
  captcha_failed: 'The spam check did not pass. Please wait for the tick to appear, then try again.',
  email_not_confirmed: 'This account has not been confirmed yet. Open the link in the email we sent you first.',
};
(async function () {
  await loadConfig();
  document.body.prepend(topBar({ tool: next === 'garden/' ? 'garden' : next === 'print/' ? 'print' : '' }));
  $('#si_reset').href = CFG.SITE + '/reset.html'; $('#si_join').href = CFG.SITE + '/register.html';
  const form = $('#si_form'), err = $('#si_err'), btn = $('#si_btn'), ts = turnstile($('#ts'));
  $('#si_show').addEventListener('click', () => { const p = $('#si_p'), show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#si_show').textContent = show ? 'Hide password' : 'Show password'; $('#si_show').setAttribute('aria-pressed', show ? 'true' : 'false'); });
  const busy = b => { btn.disabled = b; btn.textContent = b ? 'Signing in…' : 'Sign in'; };
  async function finish() {
    const w = await whoAmI();
    if (w.state === 'active') { location.replace(rootUrl(next)); return; }
    const m = w.state === 'pending' ? GOT.email_not_confirmed : w.state === 'suspended' ? GOT.user_banned : w.state === 'none' ? 'We could not find a member account for this login.' : 'We could not reach the server. Check your connection and try again.';
    await signOut(); err.textContent = m; busy(false); ts.reset();
  }
  function codeStep(factor) {
    form.hidden = true; $('#si_code_box').hidden = false; $('#si_code').focus();
    $('#si_code_form').onsubmit = async e => {
      e.preventDefault(); $('#si_code_err').textContent = ''; const b = $('#si_code_btn'); b.disabled = true;
      const v = await challengeVerify(factor.id, $('#si_code').value);
      if (v.ok) { finish(); return; }
      b.disabled = false; $('#si_code_err').textContent = v.status === 429 ? GOT.over_request_rate_limit : 'That code did not work. Check the time on your device and try the next code.'; $('#si_code').value = ''; $('#si_code').focus();
    };
    $('#si_code_cancel').onclick = async () => { await signOut(); location.reload(); };
  }
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const email = $('#si_e').value.trim(), pw = $('#si_p').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !pw) { err.textContent = 'Please enter your email and password.'; return; }
    if (CFG.TURNSTILE_SITE_KEY && !ts.token) { err.textContent = 'Please wait for the spam check to finish (a tick appears above the button).'; return; }
    busy(true);
    const r = await signIn(email, pw, ts.token, $('#si_stay').checked);
    if (!r.ok) {
      const code = (r.body && (r.body.error_code || r.body.code)) || '';
      err.textContent = r.status === 0 ? 'We could not reach the server. Check your connection and try again.' : GOT[code] || (r.status === 400 ? GOT.invalid_credentials : 'Something went wrong on our side. Please try again in a few minutes.');
      busy(false); ts.reset(); return;
    }
    $('#si_p').value = '';
    const u = await authUser(); const f = verifiedFactor(u.body);
    if (f) codeStep(f); else finish();
  });
})();
void el;
