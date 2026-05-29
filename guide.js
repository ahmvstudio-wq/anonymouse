// ─────────────────────────────────────────────────────────────
// ANONYMOUSE — Interactive Demo Guide
// Walks first-time visitors through every feature of the platform
// Written in simple language from the owner / admin perspective
// ─────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var TOUR_DONE_KEY = 'anonymouse_tour_done';
  var currentStepIndex = 0;
  var isRunning = false;

  // ── Helpers ────────────────────────────────────────────────

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function qs(sel) {
    return document.querySelector(sel);
  }

  // ── Screen helpers (avoids flashing onboarding) ───────────

  function ensureAdmin() {
    if (qs('#s-admin.active')) return Promise.resolve();
    state.role = 'admin';
    state.me = state.users.find(function (u) { return u.code === 'ADM-001'; });
    showScreen('s-admin');
    adminNav('overview');
    return wait(350);
  }

  function ensureChat() {
    if (qs('#s-chat.active')) return Promise.resolve();
    state.role = 'agent';
    state.me = state.users.find(function (u) { return u.code === 'AGT-001'; });
    showScreen('s-chat');
    initChatApp();
    return wait(350);
  }

  // ── Step Definitions ──────────────────────────────────────
  // target  — CSS selector for the element to spotlight
  // title   — bold heading in the tooltip
  // text    — explanation (HTML allowed)
  // pos     — where to place the tooltip: top | bottom | left | right | center
  // setup   — async function that runs BEFORE showing (navigates screens/tabs)
  // delay   — extra ms to wait after setup (default 300)

  var steps = [

    // ── ROLE PICKER ─────────────────────────────────────────

    {
      target: '.pick-container',
      title: 'Welcome to Anonymouse',
      text: 'This is a messaging platform I built to solve one problem: <strong>when your team talks to clients, nobody should see anyone\'s real name, phone number, or personal details.</strong><br><br>Everything is hidden behind code names like AGT-001.',
      pos: 'bottom',
      setup: function () { showScreen('s-pick'); return wait(200); }
    },

    {
      target: '.role-grid',
      title: 'Three Types of Users',
      text: '<strong>Admin</strong> — That\'s you. You create users, assign projects, and watch everything.<br><br><strong>Team Member</strong> — Your employees. Clients only see their code name (AGT-001), never their real name.<br><br><strong>Client</strong> — Your customers. They talk to the team without knowing who is behind the screen.<br><br>Let\'s go in as <strong>Admin</strong> first.',
      pos: 'top'
    },

    // ── ADMIN DASHBOARD ─────────────────────────────────────

    {
      target: '#adminContentArea',
      title: 'Your Control Panel',
      text: 'This is your dashboard. At a glance you can see:<br><br>• <strong>Active Identities</strong> — how many people are on the platform<br>• <strong>Workspaces</strong> — how many project channels are running<br>• <strong>Messages Relayed</strong> — total messages sent through the system<br>• <strong>PII Interventions</strong> — how many times the system caught someone sharing personal info like a phone number',
      pos: 'bottom',
      delay: 450,
      setup: function () {
        return ensureAdmin().then(function () {
          adminNav('overview');
          return wait(200);
        });
      }
    },

    {
      target: '#adminContentArea',
      title: 'Your Team & Clients',
      text: 'This is where you see everyone on the platform.<br><br>Each person gets a <strong>code name</strong> like AGT-001 or CLT-001. Their real name and email are <strong>encrypted</strong> — even if someone hacks the database, they can\'t read personal info.<br><br>Use <strong>Add User</strong> to bring someone on, or <strong>Revoke Access</strong> to cut them off instantly.',
      pos: 'bottom',
      delay: 300,
      setup: function () {
        return ensureAdmin().then(function () {
          adminNav('users');
          return wait(200);
        });
      }
    },

    {
      target: '#adminContentArea',
      title: 'Project Workspaces',
      text: 'Each project is like a <strong>sealed room</strong>. You assign one client and specific team members to it.<br><br>Nobody can see projects they are not assigned to. A team member working on Project A has <strong>zero access</strong> to Project B. Total isolation.',
      pos: 'bottom',
      delay: 300,
      setup: function () {
        return ensureAdmin().then(function () {
          adminNav('projects');
          return wait(200);
        });
      }
    },

    {
      target: '#adminContentArea',
      title: 'Live Activity Feed',
      text: 'This is your <strong>real-time security feed</strong>. Every message, every blocked phone number, every file upload shows up here the moment it happens.<br><br>If someone tries to share a phone number in chat, you will see it flagged in <span style="color:#f87171;font-weight:600">red</span>.<br><br>Now let\'s see the chat — <strong>the most important part</strong>.',
      pos: 'bottom',
      delay: 300,
      setup: function () {
        return ensureAdmin().then(function () {
          adminNav('monitor');
          return wait(200);
        });
      }
    },

    // ── CHAT INTERFACE ──────────────────────────────────────

    {
      target: '#chatChannelsList',
      title: 'Project Channels',
      text: 'We are now looking at the platform as a <strong>Team Member</strong> (AGT-001).<br><br>You only see the projects you are assigned to. Nothing else. This is how information stays locked down — each person sees only what they need to see.',
      pos: 'right',
      delay: 450,
      setup: function () { return ensureChat(); }
    },

    {
      target: '#activeChatView',
      title: 'The Conversation',
      text: 'This is where the messaging happens. Notice that <strong>everyone appears by code name only</strong> — AGT-001, CLT-001.<br><br>No real names anywhere. Not in the messages, not in the headers, not even in the database.',
      pos: 'left'
    },

    {
      target: '.demo-console .console-section:nth-child(2)',
      title: '⚡ The Most Important Feature',
      text: 'This is <strong>PII auto-redaction</strong> — the heart of Anonymouse.<br><br>Click any of these preset buttons to load a message with personal info (a phone number, email, etc). Then hit <strong>Send</strong>.<br><br>The system <strong>catches it automatically</strong> and replaces it with [REDACTED BY SYSTEM] before anyone can see it.<br><br>Phone numbers, emails, UPI IDs, links — all blocked instantly.<br><br><em>Try it yourself after the tour!</em>',
      pos: 'left'
    },

    {
      target: '.demo-console .console-section:nth-child(1)',
      title: 'Switch Who Is Talking',
      text: 'In the real app, each user logs in from their own device.<br><br>In this demo, you can <strong>switch who you are pretending to be</strong> using this dropdown. Pick the Client to send a message from their side, then switch back to the Team Member.<br><br>This lets you see the full conversation from both sides.',
      pos: 'left'
    },

    {
      target: '.demo-console .console-section:nth-child(3)',
      title: 'File Metadata Cleaning',
      text: 'When someone uploads a <strong>photo</strong>, the system strips out hidden data like GPS location, device model, and camera info.<br><br>For <strong>Word documents</strong>, it removes the author name, company name, and edit history.<br><br>The file content stays the same — only the <strong>hidden metadata</strong> that could reveal identity is removed.',
      pos: 'left'
    },

    // ── TOUR COMPLETE ───────────────────────────────────────

    {
      target: null,
      title: 'You Have Seen Everything!',
      text: 'Here is what Anonymouse does:<br><br>✅ <strong>Hides identities</strong> — everyone gets a code name, real names are encrypted<br><br>✅ <strong>Blocks personal info</strong> — phone numbers, emails, and links are auto-removed from every message<br><br>✅ <strong>Cleans files</strong> — photos and documents are stripped of hidden data before delivery<br><br>✅ <strong>Isolates projects</strong> — users only see what they are assigned to<br><br>✅ <strong>Monitors everything</strong> — admins see every event in real-time<br><br>Feel free to explore! Click <strong>Reset Simulator Data</strong> to start fresh anytime.',
      pos: 'center'
    }
  ];


  // ── DOM Creation ──────────────────────────────────────────

  function createTourElements() {

    // — Backdrop (spotlight hole via box-shadow) —
    var backdrop = document.createElement('div');
    backdrop.id = 'tourBackdrop';
    document.body.appendChild(backdrop);

    // — Tooltip card —
    var tooltip = document.createElement('div');
    tooltip.id = 'tourTooltip';
    tooltip.innerHTML =
      '<div class="tour-close" id="tourCloseBtn">&times;</div>' +
      '<div class="tour-step-badge" id="tourStepBadge"></div>' +
      '<h3 class="tour-title" id="tourTitle"></h3>' +
      '<div class="tour-text" id="tourText"></div>' +
      '<div class="tour-actions">' +
        '<button class="tour-btn tour-btn-back" id="tourBtnBack">\u2190 Back</button>' +
        '<button class="tour-btn tour-btn-next" id="tourBtnNext">Next \u2192</button>' +
      '</div>';
    document.body.appendChild(tooltip);

    // Wire up buttons
    qs('#tourBtnNext').addEventListener('click', tourNext);
    qs('#tourBtnBack').addEventListener('click', tourBack);
    qs('#tourCloseBtn').addEventListener('click', tourSkip);

    // — Welcome modal —
    var welcome = document.createElement('div');
    welcome.id = 'tourWelcome';
    welcome.innerHTML =
      '<div class="welcome-card">' +
        '<div class="welcome-icon">\uD83D\uDD12</div>' +
        '<h2 class="welcome-title">Welcome to Anonymouse</h2>' +
        '<p class="welcome-subtitle">A messaging platform where identities stay hidden</p>' +
        '<div class="welcome-pillars">' +
          '<div class="welcome-pillar">' +
            '<div class="wp-icon">\uD83D\uDC64</div>' +
            '<div class="wp-title">Hidden Names</div>' +
            '<div class="wp-desc">Everyone gets a code name.<br>Real names are encrypted and never shown in chat.</div>' +
          '</div>' +
          '<div class="welcome-pillar">' +
            '<div class="wp-icon">\uD83D\uDEE1\uFE0F</div>' +
            '<div class="wp-title">Auto-Redaction</div>' +
            '<div class="wp-desc">Phone numbers, emails, and links are automatically removed from messages.</div>' +
          '</div>' +
          '<div class="welcome-pillar">' +
            '<div class="wp-icon">\uD83D\uDCCE</div>' +
            '<div class="wp-title">Clean Files</div>' +
            '<div class="wp-desc">Photos and documents are stripped of GPS, author info, and hidden metadata.</div>' +
          '</div>' +
        '</div>' +
        '<div class="welcome-actions">' +
          '<button class="tour-btn tour-btn-next welcome-start-btn" id="welcomeStartBtn">Show Me How It Works \u2192</button>' +
          '<button class="tour-btn tour-btn-back welcome-skip-btn" id="welcomeSkipBtn">Skip \u2014 I\'ll explore on my own</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(welcome);

    qs('#welcomeStartBtn').addEventListener('click', tourStart);
    qs('#welcomeSkipBtn').addEventListener('click', function () {
      dismissWelcome();
    });
  }


  // ── Welcome Modal ─────────────────────────────────────────

  function showWelcome() {
    var el = qs('#tourWelcome');
    if (el) {
      el.classList.add('visible');
    }
  }

  function dismissWelcome() {
    var el = qs('#tourWelcome');
    if (el) el.classList.remove('visible');
    localStorage.setItem(TOUR_DONE_KEY, '1');
  }


  // ── Spotlight Engine ──────────────────────────────────────

  function clearSpotlight() {
    var backdrop = qs('#tourBackdrop');
    var tooltip = qs('#tourTooltip');
    if (backdrop) {
      backdrop.classList.remove('visible');
      backdrop.classList.remove('fullscreen');
    }
    if (tooltip) tooltip.classList.remove('visible');
  }

  function applySpotlight(selector) {
    clearSpotlight();
    var backdrop = qs('#tourBackdrop');

    if (!selector) {
      // No target — full-screen overlay, tooltip centered
      backdrop.classList.add('visible', 'fullscreen');
      return null;
    }

    var el = qs(selector);
    if (!el) {
      console.warn('[Guide] Element not found:', selector);
      backdrop.classList.add('visible', 'fullscreen');
      return null;
    }

    // Scroll element into view
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    var rect = el.getBoundingClientRect();
    var pad = 10;

    backdrop.style.top = (rect.top - pad) + 'px';
    backdrop.style.left = (rect.left - pad) + 'px';
    backdrop.style.width = (rect.width + pad * 2) + 'px';
    backdrop.style.height = (rect.height + pad * 2) + 'px';
    backdrop.classList.add('visible');
    backdrop.classList.remove('fullscreen');

    return el;
  }

  function positionTooltip(targetEl, pos) {
    var tt = qs('#tourTooltip');
    if (!tt) return;

    // Reset inline styles
    tt.style.top = '';
    tt.style.left = '';
    tt.style.transform = '';

    if (!targetEl || pos === 'center') {
      tt.style.top = '50%';
      tt.style.left = '50%';
      tt.style.transform = 'translate(-50%, -50%)';
      tt.classList.add('visible');
      return;
    }

    var rect = targetEl.getBoundingClientRect();
    var ttWidth = 360;
    var gap = 20;
    var top, left;

    switch (pos) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + (rect.width / 2) - (ttWidth / 2);
        break;
      case 'top':
        top = rect.top - gap - 260; // estimate tooltip height
        left = rect.left + (rect.width / 2) - (ttWidth / 2);
        break;
      case 'left':
        top = rect.top + (rect.height / 2) - 130;
        left = rect.left - ttWidth - gap;
        break;
      case 'right':
        top = rect.top + (rect.height / 2) - 130;
        left = rect.right + gap;
        break;
      default:
        top = rect.bottom + gap;
        left = rect.left;
    }

    // Clamp to viewport
    top = Math.max(16, Math.min(top, window.innerHeight - 300));
    left = Math.max(16, Math.min(left, window.innerWidth - ttWidth - 16));

    tt.style.top = top + 'px';
    tt.style.left = left + 'px';
    tt.classList.add('visible');
  }


  // ── Tour Navigation ───────────────────────────────────────

  function goToStep(n) {
    if (n < 0 || n >= steps.length) return Promise.resolve();

    currentStepIndex = n;
    var s = steps[n];

    // 1. Run setup (navigates screens/tabs)
    var setupDone = s.setup ? s.setup() : Promise.resolve();

    return (setupDone || Promise.resolve()).then(function () {
      var delay = s.delay || 300;
      return wait(delay);
    }).then(function () {
      // 2. Spotlight the target
      var el = applySpotlight(s.target);

      // 3. Update tooltip content
      qs('#tourStepBadge').textContent = (n + 1) + ' / ' + steps.length;
      qs('#tourTitle').textContent = s.title || '';
      qs('#tourText').innerHTML = s.text || '';

      // 4. Show/hide Back button
      qs('#tourBtnBack').style.display = (n === 0) ? 'none' : '';

      // 5. Last step shows "Finish" instead of "Next"
      var nextBtn = qs('#tourBtnNext');
      if (n === steps.length - 1) {
        nextBtn.textContent = 'Finish Tour \u2713';
      } else {
        nextBtn.textContent = 'Next \u2192';
      }

      // 6. Position & show tooltip
      positionTooltip(el, s.pos);
    });
  }

  function tourStart() {
    dismissWelcome();
    isRunning = true;
    currentStepIndex = 0;
    goToStep(0);
  }

  function tourNext() {
    if (!isRunning) return;
    if (currentStepIndex >= steps.length - 1) {
      tourEnd();
      return;
    }
    goToStep(currentStepIndex + 1);
  }

  function tourBack() {
    if (!isRunning) return;
    if (currentStepIndex > 0) {
      goToStep(currentStepIndex - 1);
    }
  }

  function tourEnd() {
    isRunning = false;
    clearSpotlight();
    localStorage.setItem(TOUR_DONE_KEY, '1');
    showScreen('s-pick');
  }

  function tourSkip() {
    tourEnd();
  }


  // ── Public API ────────────────────────────────────────────

  // Called from "Restart Tour" button
  window.restartTour = function () {
    localStorage.removeItem(TOUR_DONE_KEY);
    showScreen('s-pick');
    setTimeout(showWelcome, 300);
  };


  // ── Resize handler — reposition tooltip ───────────────────

  var resizeTimeout;
  window.addEventListener('resize', function () {
    if (!isRunning) return;
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function () {
      goToStep(currentStepIndex);
    }, 200);
  });


  // ── Initialization ────────────────────────────────────────

  function init() {
    createTourElements();

    // Show welcome modal on first visit (after a small settle delay)
    if (!localStorage.getItem(TOUR_DONE_KEY)) {
      setTimeout(showWelcome, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already loaded — run on next tick to ensure demo.js has run first
    setTimeout(init, 50);
  }

})();
