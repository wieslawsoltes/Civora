(() => {
  const params = new URLSearchParams(location.search);
  if (window.opener && (params.has('code') || params.has('error'))) {
    window.opener.postMessage({ type: 'civora-oauth', code: params.get('code'), state: params.get('state'), error: params.get('error_description') || params.get('error') }, location.origin);
    history.replaceState(null, '', location.pathname);
  } else document.querySelector('p').textContent = 'This page is only used by the authorization window opened from Civora. Return to the app and connect again.';
})();
