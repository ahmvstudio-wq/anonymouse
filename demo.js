// ─── STATE ───────────────────────────────────────────────────
const state = {
  role: null, // 'admin', 'agent', 'client'
  me: null,
  activeAdminTab: 'overview',
  activeChat: null,
  slideIndex: 0,
  activeSpeakerId: null,
  
  // Data
  users: [
    { id: 'usr-1', code: 'ADM-001', role: 'admin', name: 'Admin', email: 'admin@anonymouse.app', status: 'ACTIVE' },
    { id: 'usr-2', code: 'AGT-001', role: 'agent', name: 'John Doe', email: 'john@anonymouse.app', status: 'ACTIVE' },
    { id: 'usr-3', code: 'CLT-001', role: 'client', name: 'Acme Corp', email: 'contact@acme.com', status: 'ACTIVE' },
  ],
  projects: [
    { id: 'proj-1', name: 'Website Redesign', clientId: 'usr-3', agents: ['usr-2'] }
  ],
  messages: {
    'proj-1': [
      { id: 'm1', from: 'usr-2', text: 'Hello, we are starting the redesign phase today.', ts: Date.now() - 3600000, redacted: false }
    ]
  },
  logs: [
    { time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}), tag: 'AUTH', text: 'System initialized securely.' }
  ]
};

function saveState() {
  localStorage.setItem('anonymouse_state_v2', JSON.stringify({
    users: state.users,
    projects: state.projects,
    messages: state.messages,
    logs: state.logs
  }));
}

function loadState() {
  const saved = localStorage.getItem('anonymouse_state_v2');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.users) state.users = parsed.users;
      if (parsed.projects) state.projects = parsed.projects;
      if (parsed.messages) state.messages = parsed.messages;
      if (parsed.logs) state.logs = parsed.logs;
    } catch(e) {
      console.error('Failed to load local state', e);
    }
  }
}

function resetState() {
  if (confirm('Are you sure you want to reset all simulated messages, users, and workspaces to default?')) {
    localStorage.removeItem('anonymouse_state_v2');
    window.location.reload();
  }
}

// Load saved state on start
loadState();

// ─── UTILS ───────────────────────────────────────────────────
function showScreen(id) {
  closeAllDrawers();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function generateId(prefix) {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

function showToast(text, type = 'success') {
  const box = document.getElementById('toastBox');
  const icon = document.getElementById('toastIcon');
  const textEl = document.getElementById('toastText');
  
  icon.innerText = type === 'error' ? '⚠️' : '✅';
  textEl.innerText = text;
  
  box.classList.add('show');
  clearTimeout(box._timeout);
  box._timeout = setTimeout(() => box.classList.remove('show'), 3000);
}

function closeModal() {
  document.getElementById('globalModal').classList.remove('active');
}

// ─── ROLE PICKER ─────────────────────────────────────────────
function pickRole(role) {
  state.role = role;
  state.slideIndex = 0;
  
  if (role === 'admin') state.me = state.users.find(u => u.code === 'ADM-001');
  if (role === 'agent') state.me = state.users.find(u => u.code === 'AGT-001');
  if (role === 'client') state.me = state.users.find(u => u.code === 'CLT-001');
  
  buildOnboarding();
  showScreen('s-onboard');
}

// ─── ONBOARDING ──────────────────────────────────────────────
const onboardingContent = {
  admin: [
    {
      icon: '🛡️', title: 'Platform Control', body: 'As an Admin, you oversee the Anonymouse platform. Manage users, create isolated workspaces, and monitor system health.',
      featureIcon: '⚡', featureTitle: 'Real-time Monitoring', featureDesc: 'Watch the system actively filter PII and manage data flow.'
    },
    {
      icon: '🔐', title: 'Absolute Privacy', body: 'The core feature of Anonymouse is identity obfuscation. You generate secure code names for your team and clients.',
      featureIcon: '👤', featureTitle: 'Zero Context Exchange', featureDesc: 'Clients never see an employee\'s real name, and vice versa.'
    }
  ],
  agent: [
    {
      icon: '💼', title: 'Professional Workspace', body: 'Welcome to your secure workspace. Here you can collaborate with clients without exposing your personal identity.',
      featureIcon: '🛡️', featureTitle: 'Code Name Assigned', featureDesc: 'You will appear to clients strictly as your assigned ID (e.g., AGT-001).'
    },
    {
      icon: '📎', title: 'Automated Data Sanitization', body: 'Share updates and files freely. Our system automatically scrubs hidden metadata (like GPS or Author tags) before delivery.',
      featureIcon: '⚠️', featureTitle: 'PII Protection', featureDesc: 'Accidentally typed a phone number? We\'ll redact it instantly.'
    }
  ],
  client: [
    {
      icon: '🤝', title: 'Secure Collaboration', body: 'Welcome to your dedicated project portal. Communicate directly with the assigned team in a secure, private environment.',
      featureIcon: '🔒', featureTitle: 'Data Privacy', featureDesc: 'Your personal information is never exposed to individual team members.'
    },
    {
      icon: '💬', title: 'Focus on Results', body: 'Our platform filters out unnecessary personal data, ensuring all communication remains professional and project-focused.',
      featureIcon: '✓', featureTitle: 'Ready to Start', featureDesc: 'Access your assigned project channel to begin.'
    }
  ]
};

function buildOnboarding() {
  const steps = onboardingContent[state.role];
  const container = document.getElementById('obStepsContainer');
  const dots = document.getElementById('obDotsContainer');
  
  container.innerHTML = '';
  dots.innerHTML = '';
  
  steps.forEach((step, i) => {
    const el = document.createElement('div');
    el.className = `ob-step ${i === 0 ? 'active' : ''}`;
    el.innerHTML = `
      <div class="ob-header">
        <div class="ob-header-icon">${step.icon}</div>
        <h2 class="ob-title">${step.title}</h2>
      </div>
      <p class="ob-body">${step.body}</p>
      <div class="ob-feature">
        <div class="ob-feature-icon">${step.featureIcon}</div>
        <div class="ob-feature-text">
          <h4>${step.featureTitle}</h4>
          <p>${step.featureDesc}</p>
        </div>
      </div>
    `;
    container.appendChild(el);
    
    const dot = document.createElement('div');
    dot.className = `ob-dot ${i === 0 ? 'active' : ''}`;
    dots.appendChild(dot);
  });
  
  updateOnboardingView();
}

function updateOnboardingView() {
  const steps = onboardingContent[state.role];
  document.querySelectorAll('.ob-step').forEach((el, i) => {
    el.classList.toggle('active', i === state.slideIndex);
  });
  document.querySelectorAll('.ob-dot').forEach((el, i) => {
    el.classList.toggle('active', i === state.slideIndex);
  });
  
  document.getElementById('obNextBtn').innerText = state.slideIndex === steps.length - 1 ? 'Enter Workspace' : 'Continue';
}

function nextStep() {
  const steps = onboardingContent[state.role];
  if (state.slideIndex < steps.length - 1) {
    state.slideIndex++;
    updateOnboardingView();
  } else {
    if (state.role === 'admin') {
      showScreen('s-admin');
      adminNav('overview');
    } else {
      showScreen('s-chat');
      initChatApp();
    }
  }
}

function prevStep() {
  if (state.slideIndex > 0) {
    state.slideIndex--;
    updateOnboardingView();
  } else {
    showScreen('s-pick');
  }
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────
function adminNav(page) {
  closeAllDrawers();
  state.activeAdminTab = page;
  document.querySelectorAll('#s-admin .nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-' + page).classList.add('active');
  
  const titleMap = { 'overview': 'System Overview', 'users': 'User Directory', 'projects': 'Active Projects', 'monitor': 'Live Monitor' };
  document.getElementById('admPageTitle').innerText = titleMap[page];
  
  const content = document.getElementById('adminContentArea');
  content.style.opacity = '0';
  setTimeout(() => {
    if (page === 'overview') renderAdminOverview(content);
    else if (page === 'users') renderAdminUsers(content);
    else if (page === 'projects') renderAdminProjects(content);
    else if (page === 'monitor') renderAdminMonitor(content);
    
    content.style.opacity = '1';
    content.style.transition = 'opacity 0.2s';
  }, 100);
}

function renderAdminOverview(container) {
  const activeUsers = state.users.filter(u => u.status === 'ACTIVE').length;
  const projectCount = state.projects.length;
  let msgCount = 0;
  Object.values(state.messages).forEach(arr => msgCount += arr.length);
  const piiBlocks = state.logs.filter(l => l.tag === 'PII').length;

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-label">Active Identities</div>
        <div class="stat-val">${activeUsers}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Workspaces</div>
        <div class="stat-val">${projectCount}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Messages Relayed</div>
        <div class="stat-val">${msgCount}</div>
      </div>
      <div class="stat-box" style="background:#fef2f2; border-color:#fecaca;">
        <div class="stat-label" style="color:#dc2626;">PII Interventions</div>
        <div class="stat-val" style="color:#dc2626;">${piiBlocks}</div>
      </div>
    </div>
  `;
}

function renderAdminUsers(container) {
  let html = `
    <div class="list-header">
      <h3>Registered Identities</h3>
      <button class="btn btn-primary" onclick="openAddUserModal()">Add User</button>
    </div>
    <table class="n-table">
      <thead>
        <tr>
          <th>Code Name</th>
          <th>Role</th>
          <th>Real Name</th>
          <th>Email</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
  `;
  
  state.users.forEach(u => {
    let roleBadge = u.role === 'admin' ? 'badge-gray' : u.role === 'agent' ? 'badge-blue' : 'badge-green';
    let statusBadge = u.status === 'ACTIVE' ? 'badge-green' : 'badge-red';
    
    html += `
      <tr>
        <td style="font-weight:600; font-family: ui-monospace, monospace; font-size:12px;">${u.code}</td>
        <td><span class="badge ${roleBadge}">${u.role.toUpperCase()}</span></td>
        <td>${u.name}</td>
        <td><span style="color:var(--text-muted)">${u.email}</span></td>
        <td><span class="badge ${statusBadge}">${u.status}</span></td>
        <td style="text-align:right;">
          ${u.role !== 'admin' && u.status === 'ACTIVE' ? `<button class="btn btn-ghost" style="color:var(--danger)" onclick="revokeUser('${u.id}')">Revoke Access</button>` : ''}
        </td>
      </tr>
    `;
  });
  
  html += `</tbody></table>`;
  container.innerHTML = html;
}

function openAddUserModal() {
  const modal = document.getElementById('modalInner');
  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Generate New Identity</h3>
      <p class="modal-desc">Create a secure code name and onboard a new team member or client.</p>
    </div>
    <div class="form-group">
      <label class="form-label">Real Full Name</label>
      <input type="text" id="addUName" class="form-input" placeholder="e.g. Sarah Connor">
    </div>
    <div class="form-group">
      <label class="form-label">Email Address</label>
      <input type="email" id="addUEmail" class="form-input" placeholder="sarah@example.com">
    </div>
    <div class="form-group">
      <label class="form-label">System Role</label>
      <select id="addURole" class="form-select">
        <option value="agent">Team Member (Agent)</option>
        <option value="client">Client</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddUser()">Generate & Save</button>
    </div>
  `;
  document.getElementById('globalModal').classList.add('active');
}

function submitAddUser() {
  const name = document.getElementById('addUName').value.trim();
  const email = document.getElementById('addUEmail').value.trim();
  const role = document.getElementById('addURole').value;
  
  if (!name || !email) return showToast('Please complete all fields.', 'error');
  
  const prefix = role === 'agent' ? 'AGT' : 'CLT';
  const count = state.users.filter(u => u.role === role).length + 1;
  const code = `${prefix}-${String(count).padStart(3, '0')}`;
  
  state.users.push({
    id: generateId('usr'),
    code, role, name, email, status: 'ACTIVE'
  });
  
  logEvent('AUTH', `Generated identity ${code} (${role}).`);
  saveState();
  closeModal();
  adminNav('users');
  showToast('User created successfully');
}

function revokeUser(id) {
  const user = state.users.find(u => u.id === id);
  if (!user) return;
  user.status = 'REVOKED';
  logEvent('AUTH', `Access revoked for identity ${user.code}.`);
  saveState();
  adminNav('users');
  showToast('Access revoked');
}

function renderAdminProjects(container) {
  let html = `
    <div class="list-header">
      <h3>Secure Workspaces</h3>
      <button class="btn btn-primary" onclick="openAddProjectModal()">Create Workspace</button>
    </div>
    <table class="n-table">
      <thead>
        <tr>
          <th>Workspace Name</th>
          <th>Assigned Client</th>
          <th>Assigned Team Members</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  state.projects.forEach(p => {
    const client = state.users.find(u => u.id === p.clientId)?.code || '-';
    const agents = p.agents.map(id => state.users.find(u => u.id === id)?.code).join(', ');
    
    html += `
      <tr>
        <td style="font-weight:500;">${p.name}</td>
        <td><span class="badge badge-gray" style="font-family:monospace">${client}</span></td>
        <td><span class="badge badge-gray" style="font-family:monospace">${agents}</span></td>
      </tr>
    `;
  });
  
  html += `</tbody></table>`;
  container.innerHTML = html;
}

function openAddProjectModal() {
  const clients = state.users.filter(u => u.role === 'client' && u.status === 'ACTIVE');
  const agents = state.users.filter(u => u.role === 'agent' && u.status === 'ACTIVE');
  
  let clientOpts = clients.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('');
  let agentOpts = agents.map(a => `
    <label class="cb-item">
      <input type="checkbox" value="${a.id}" class="agent-check">
      ${a.name} <span style="color:var(--text-muted); font-size:11px; font-family:monospace; margin-left:4px">${a.code}</span>
    </label>
  `).join('');

  const modal = document.getElementById('modalInner');
  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Create Workspace</h3>
      <p class="modal-desc">Establish a secure channel between a client and your team.</p>
    </div>
    <div class="form-group">
      <label class="form-label">Workspace Name</label>
      <input type="text" id="addPName" class="form-input" placeholder="e.g. Q4 Marketing Campaign">
    </div>
    <div class="form-group">
      <label class="form-label">Select Client Identity</label>
      <select id="addPClient" class="form-select">${clientOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Assign Team Members</label>
      <div class="checkbox-list">${agentOpts}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddProject()">Create Workspace</button>
    </div>
  `;
  document.getElementById('globalModal').classList.add('active');
}

function submitAddProject() {
  const name = document.getElementById('addPName').value.trim();
  const clientId = document.getElementById('addPClient').value;
  const agentChecks = document.querySelectorAll('.agent-check:checked');
  const agents = Array.from(agentChecks).map(cb => cb.value);
  
  if (!name || !clientId || agents.length === 0) {
    return showToast('Complete all fields and select at least one agent.', 'error');
  }
  
  const projId = generateId('proj');
  state.projects.push({ id: projId, name, clientId, agents });
  state.messages[projId] = [];
  
  logEvent('PROJ', `Created workspace "${name}" with ${agents.length} agent(s).`);
  saveState();
  closeModal();
  adminNav('projects');
  showToast('Workspace created');
}

function renderAdminMonitor(container) {
  let logHtml = state.logs.map(l => `
    <div class="feed-line">
      <span class="feed-time">${l.time}</span>
      <span class="feed-tag tag-${l.tag.toLowerCase()}">[${l.tag}]</span>
      <span class="feed-text">${l.text}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="list-header">
      <h3>System Event Stream</h3>
    </div>
    <div class="monitor-feed" id="monitorFeedBox">
      ${logHtml}
    </div>
  `;
  setTimeout(() => {
    const feed = document.getElementById('monitorFeedBox');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, 10);
}

function logEvent(tag, text) {
  state.logs.push({
    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}),
    tag,
    text
  });
  saveState();
  if (state.activeAdminTab === 'monitor') {
    adminNav('monitor'); // Refresh if open
  }
}

// ─── CHAT APP SHELL ──────────────────────────────────────────
function initChatApp() {
  document.getElementById('chatMyAvatar').innerText = state.me.code.substring(0, 3);
  document.getElementById('chatMyId').innerText = state.me.code;
  
  const myChats = state.projects.filter(p => p.clientId === state.me.id || p.agents.includes(state.me.id));
  
  const list = document.getElementById('chatChannelsList');
  list.innerHTML = '';
  
  myChats.forEach(p => {
    const el = document.createElement('div');
    el.className = 'chat-channel';
    el.id = `nav-ch-${p.id}`;
    el.onclick = () => openChat(p.id);
    el.innerHTML = `
      <span class="cc-icon">#</span>
      <span class="cc-name">${p.name}</span>
    `;
    list.appendChild(el);
  });
  
  if (myChats.length > 0) openChat(myChats[0].id);
}

function openChat(projId) {
  closeAllDrawers();
  state.activeChat = projId;
  document.querySelectorAll('.chat-channel').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-ch-${projId}`).classList.add('active');
  
  document.getElementById('emptyChatState').style.display = 'none';
  document.getElementById('activeChatView').style.display = 'flex';
  
  const proj = state.projects.find(p => p.id === projId);
  document.getElementById('chTitle').innerText = `# ${proj.name}`;
  
  // Set default active speaker to me if not set or not in project
  const projectMembers = [proj.clientId, ...proj.agents];
  if (!state.activeSpeakerId || !projectMembers.includes(state.activeSpeakerId)) {
    state.activeSpeakerId = state.me.id;
  }
  
  // Populate persona selector
  const personaSelect = document.getElementById('activePersonaSelect');
  if (personaSelect) {
    personaSelect.innerHTML = '';
    projectMembers.forEach(mid => {
      const u = state.users.find(usr => usr.id === mid);
      if (u) {
        const option = document.createElement('option');
        option.value = u.id;
        option.innerText = `${u.code} (${u.role.toUpperCase()})`;
        if (u.id === state.activeSpeakerId) option.selected = true;
        personaSelect.appendChild(option);
      }
    });
  }
  
  const otherIds = [proj.clientId, ...proj.agents].filter(id => id !== state.me.id);
  const otherCodes = otherIds.map(id => state.users.find(u => u.id === id)?.code);
  
  const membersBox = document.getElementById('chMembers');
  membersBox.innerHTML = '';
  otherCodes.forEach(code => {
    membersBox.innerHTML += `<div class="member-avatar" title="${code}">${code.substring(0,2)}</div>`;
  });
  
  renderChatMessages();
}

function renderChatMessages() {
  const container = document.getElementById('chatMessagesBox');
  container.innerHTML = '';
  
  const msgs = state.messages[state.activeChat] || [];
  
  msgs.forEach(m => {
    const isMe = m.from === state.me.id;
    const sender = state.users.find(u => u.id === m.from);
    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${isMe ? 'me' : 'them'}`;
    
    const timeStr = new Date(m.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const senderName = isMe ? 'You' : (sender ? sender.code : 'Unknown');
    
    let content = '';
    if (m.file) {
      const icon = m.file.type === 'image' ? '🖼️' : '📄';
      content = `
        <div class="file-card">
          <div class="fc-icon">${icon}</div>
          <div class="fc-details">
            <div class="fc-name">${m.file.name}</div>
            <div class="fc-meta">✓ Metadata Sanitized</div>
          </div>
        </div>
      `;
    } else {
      content = `<div class="msg-bubble">${m.text.replace(/\n/g, '<br>')}</div>`;
      if (m.redacted) {
        content += `<div class="redact-alert">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          System Redaction
        </div>`;
      }
    }
    
    wrap.innerHTML = `
      <div class="msg-sender">${senderName}</div>
      ${content}
      <div class="msg-time">${timeStr}</div>
    `;
    
    container.appendChild(wrap);
  });
  
  container.scrollTop = container.scrollHeight;
}

const PII_RULES = [
  { name: 'EMAIL', regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  { name: 'UPI', regex: /[a-zA-Z0-9._\-]{3,}@[a-zA-Z]{2,}/g },
  { name: 'SOCIAL', regex: /@[a-zA-Z0-9_.]{2,30}|t\.me\/\S+|wa\.me\/\S+/g },
  { name: 'EXTERNAL_URL', regex: /https?:\/\/\S+/gi },
  { name: 'INDIAN_PHONE', regex: /(?:(?:\+91|0)[- ]?)?[6-9]\d{9}/g },
  { name: 'INTL_PHONE', regex: /\+[1-9]\d{6,14}/g }
];

function sendChatMessage() {
  const input = document.getElementById('chatTextInput');
  const rawText = input.value.trim();
  if (!rawText || !state.activeChat) return;
  
  input.value = '';
  input.style.height = '';
  
  let isRedacted = false;
  let safeText = rawText;
  const redactedTypes = [];
  
  PII_RULES.forEach(rule => {
    rule.regex.lastIndex = 0;
    if (safeText.match(rule.regex)) {
      isRedacted = true;
      redactedTypes.push(rule.name);
      safeText = safeText.replace(rule.regex, '[REDACTED BY SYSTEM]');
    }
  });
  
  const senderId = state.activeSpeakerId || state.me.id;
  const senderUser = state.users.find(u => u.id === senderId);
  
  const msg = {
    id: generateId('m'),
    from: senderId,
    text: safeText,
    ts: Date.now(),
    redacted: isRedacted
  };
  
  state.messages[state.activeChat].push(msg);
  saveState();
  
  if (isRedacted) {
    showToast(`Sensitive details redacted before delivery`, 'error');
    logEvent('PII', `Intercepted ${redactedTypes.join('/')} from ${senderUser ? senderUser.code : 'Unknown'}`);
  }
  
  logEvent('MSG', `${senderUser ? senderUser.code : 'Unknown'} sent a message.`);
  renderChatMessages();
}

// Switch simulated speaker
function switchDemoPersona(userId) {
  state.activeSpeakerId = userId;
}

// Load pre-configured redaction text
function loadPreset(text) {
  const input = document.getElementById('chatTextInput');
  if (input) {
    input.value = text;
    input.dispatchEvent(new Event('input')); // trigger autosize height
    input.focus();
  }
}

// Simulate document metadata sanitization pipeline
function simulateSanitize(filename, type) {
  if (!state.activeChat) return showToast('Please select a project channel first.', 'error');
  const senderId = state.activeSpeakerId || state.me.id;
  const senderUser = state.users.find(u => u.id === senderId);
  
  showToast('Sanitizing file metadata...');
  
  setTimeout(() => {
    const msg = {
      id: generateId('m'),
      from: senderId,
      text: '',
      ts: Date.now(),
      file: { name: filename, type: type }
    };
    
    state.messages[state.activeChat].push(msg);
    saveState();
    logEvent('FILE', `${senderUser ? senderUser.code : 'Unknown'} securely transferred: ${filename}`);
    renderChatMessages();
    showToast('File secured and sent');
  }, 800);
}

// Simulated file handling (via manual click attach)
document.getElementById('fileInputHidden').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file || !state.activeChat) return;
  simulateSanitize(file.name, file.type.startsWith('image/') ? 'image' : 'doc');
});

// ─── MOBILE RESPONSIVE DRAWERS ──────────────────────────────
function toggleAdminSidebar(e) {
  if (e) e.stopPropagation();
  const sidebar = document.querySelector('#s-admin .app-sidebar');
  sidebar.classList.toggle('mobile-show');
  document.getElementById('drawerOverlay').classList.toggle('active', sidebar.classList.contains('mobile-show'));
}

function toggleChatSidebar(e) {
  if (e) e.stopPropagation();
  const sidebar = document.querySelector('#s-chat .app-sidebar');
  sidebar.classList.toggle('mobile-show');
  // Hide console if showing
  document.querySelector('#s-chat .demo-console').classList.remove('mobile-show');
  document.getElementById('drawerOverlay').classList.toggle('active', sidebar.classList.contains('mobile-show'));
}

function toggleDemoConsole(e) {
  if (e) e.stopPropagation();
  const consoleEl = document.querySelector('#s-chat .demo-console');
  consoleEl.classList.toggle('mobile-show');
  // Hide sidebar if showing
  document.querySelector('#s-chat .app-sidebar').classList.remove('mobile-show');
  document.getElementById('drawerOverlay').classList.toggle('active', consoleEl.classList.contains('mobile-show'));
}

function closeAllDrawers() {
  document.querySelectorAll('.app-sidebar, .demo-console').forEach(el => {
    el.classList.remove('mobile-show');
  });
  document.getElementById('drawerOverlay').classList.remove('active');
}

