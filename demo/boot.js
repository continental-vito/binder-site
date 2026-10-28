// Loaded before the prototype script (see build/import-mock.mjs).
//
// The prototype was built as a ChatGPT widget: on load it restores its state
// from window.openai.widgetState, and it re-renders when an
// "openai:set_globals" event carries a new state. Providing that interface is
// all it takes to open it on a given screen (?role=vc&page=booking) and to let
// the landing page drive it step by step — without editing the prototype.
//
// ?lock pins it to the role it opened with. The "For founders" and "For
// investors" sections each embed one side of the app, and a visitor exploring
// one of them should not be able to wander into the other.
(function () {
  'use strict';
  var VERSION = window.BINDER_STATE_VERSION;
  var q = new URLSearchParams(location.search);
  var embedded = q.has('embed');
  var locked = q.has('lock');
  if (embedded) document.documentElement.classList.add('embed');
  if (locked) document.documentElement.classList.add('locked');

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

  if (locked) {
    // The prototype listens for "change" on the picker itself; stopping the
    // event while it is still capturing at the document means that listener
    // never runs, so the role cannot change by keyboard either.
    document.addEventListener('change', function (e) {
      if (e.target.matches && e.target.matches('#binder-color header select')) {
        e.stopPropagation();
        e.target.value = initial.role || 'founder';
      }
    }, true);
    document.addEventListener('DOMContentLoaded', function () {
      var picker = document.querySelector('#binder-color header select');
      if (picker) { picker.tabIndex = -1; picker.setAttribute('aria-disabled', 'true'); }
    });
  }

  if (!embedded) {
    document.addEventListener('DOMContentLoaded', function () {
      var bar = document.createElement('div');
      bar.className = 'demo-bar';
      bar.innerHTML = '<a href="/" aria-label="Back to binder.red">← <img src="/assets/brand/binder-wordmark-primary.svg" alt="" height="30"></a><span>Interactive demo · profiles are illustrative</span>';
      document.body.insertBefore(bar, document.body.firstChild);
    });
  }
})();
