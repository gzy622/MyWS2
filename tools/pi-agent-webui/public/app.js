const agentList = document.querySelector('#agent-list');
const agentCount = document.querySelector('#agent-count');
const overallStatus = document.querySelector('#overall-status');
const connectionDot = document.querySelector('.connection-dot');
const emptyTemplate = document.querySelector('#empty-template');

const STATUS_LABELS = Object.freeze({
  starting: '正在启动',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  stopped: '已停止'
});

let agents = [];
let connected = false;

function formatElapsed(agent) {
  const end = agent.finishedAt || Date.now();
  const seconds = Math.max(0, Math.floor((end - agent.startedAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes} 分 ${remaining} 秒`;
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function createFact(label, value) {
  const fact = document.createElement('div');
  fact.className = 'agent-fact';
  fact.append(
    createTextElement('dt', '', label),
    createTextElement('dd', '', value)
  );
  return fact;
}

function renderAgent(agent) {
  const agentName = agent.agentName || '子智能体';
  const card = document.createElement('article');
  card.className = 'agent-card';
  card.dataset.status = agent.status;

  const profile = document.createElement('div');
  profile.className = 'agent-profile';
  const avatar = createTextElement('div', 'agent-avatar', agentName.slice(0, 1));
  avatar.dataset.avatar = String(agent.avatarId || 1);
  avatar.setAttribute('role', 'img');
  avatar.setAttribute('aria-label', `${agentName}的头像`);
  profile.append(avatar, createTextElement('strong', 'agent-name', agentName));

  const main = document.createElement('div');
  main.className = 'agent-main';
  main.append(createTextElement('time', 'agent-time', `已工作 ${formatElapsed(agent)}`));

  const facts = document.createElement('dl');
  facts.className = 'agent-facts';
  facts.append(
    createFact('模型', agent.modelLabel),
    createFact('思考', agent.thinkingLabel)
  );
  main.append(facts);

  const task = document.createElement('div');
  task.className = 'agent-task-block';
  task.append(
    createTextElement('span', 'agent-field-label', '任务'),
    createTextElement('h3', 'agent-task', agent.title || agent.task)
  );
  main.append(task);

  const state = document.createElement('div');
  state.className = 'agent-state';
  const status = document.createElement('span');
  status.className = 'agent-status';
  const dot = createTextElement('span', 'status-dot', '');
  dot.setAttribute('aria-hidden', 'true');
  status.append(dot, createTextElement('span', '', STATUS_LABELS[agent.status] || '处理中'));
  state.append(status, createTextElement('p', 'agent-activity', agent.activity));
  main.append(state);

  if (agent.result) {
    const result = document.createElement('section');
    result.className = 'agent-result';
    const heading = createTextElement('h4', '', '结果');
    const content = createTextElement('pre', '', agent.result);
    result.append(heading, content);
    main.append(result);
  }

  if (agent.error) {
    main.append(createTextElement('p', 'agent-error', agent.error));
  }

  card.append(profile, main);

  return card;
}

function render() {
  agentList.replaceChildren();

  if (!agents.length) {
    agentList.append(emptyTemplate.content.cloneNode(true));
  } else {
    for (const agent of agents) {
      const card = renderAgent(agent);
      card.dataset.agentId = agent.id;
      agentList.append(card);
    }
  }

  const active = agents.filter((agent) => ['starting', 'running'].includes(agent.status)).length;
  agentCount.textContent = `${agents.length} 项`;
  overallStatus.textContent = connected
    ? active > 0 ? `${active} 个子智能体正在工作` : '当前没有运行中的任务'
    : '连接已断开，正在重试';
  connectionDot.dataset.offline = String(!connected);
}

async function requestJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || '请求未完成。');
  return payload;
}

async function loadInitialState() {
  try {
    const payload = await requestJson('/api/agents');
    agents = payload.agents;
    connected = true;
  } catch {
    connected = false;
  }
  render();
}

const events = new EventSource('/api/events');
events.addEventListener('state', (event) => {
  const payload = JSON.parse(event.data);
  agents = payload.agents;
  connected = true;
  render();
});
events.addEventListener('open', () => {
  connected = true;
  render();
});
events.addEventListener('error', () => {
  connected = false;
  render();
});

setInterval(() => {
  for (const card of agentList.querySelectorAll('.agent-card')) {
    const agent = agents.find((item) => item.id === card.dataset.agentId);
    if (agent) card.querySelector('.agent-time').textContent = `已工作 ${formatElapsed(agent)}`;
  }
}, 1000);

loadInitialState();
