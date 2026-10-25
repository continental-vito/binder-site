// Loaded before the prototype script (see build/import-mock.mjs).
//
// The prototype was built as a ChatGPT widget: on load it restores its state
// from window.openai.widgetState, and it re-renders when an
// "openai:set_globals" event carries a new state. Providing that interface is
// all it takes to open it on a given screen (?role=vc&page=booking) and to let
// the landing page drive it step by step — without editing the prototype.
(function () {
  'use strict';
  var VERSION = window.BINDER_STATE_VERSION;
  var q = new URLSearchParams(location.search);
  var embedded = q.has('embed');
  if (embedded) document.documentElement.classList.add('embed');

  var initial = { version: VERSION };
  if (q.get('role') === 'founder' || q.get('role') === 'vc') initial.role = q.get('role');
  if (q.get('page')) initial.page = q.get('page');

  window.openai = {
    widgetState: { modelContent: initial },
    // The prototype persists every change; in the demo there is nowhere to
    // persist to, and a reload should start fresh anyway.
    setWidgetState: function () { return Promise.resolve(); },
  };

  window.binderGo = function (s) {
    var state = Object.assign({}, s, { version: VERSION });
    window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: { globals: { widgetState: { modelContent: state } } } }));
  };

  // Tell the landing page when the visitor flips Founder/Investor inside the
  // phone, so its own toggle does not flip it straight back on the next step.
  document.addEventListener('change', function (e) {
    if (window.parent !== window && e.target.matches && e.target.matches('#binder-color header select')) {
      window.parent.postMessage({ binder: 'role', role: e.target.value }, location.origin);
    }
  });

  if (!embedded) {
    document.addEventListener('DOMContentLoaded', function () {
      var bar = document.createElement('div');
      bar.className = 'demo-bar';
      bar.innerHTML = '<a href="/">← binder.</a><span>Interactive demo · profiles are illustrative</span>';
      document.body.insertBefore(bar, document.body.firstChild);
    });
  }
})();
