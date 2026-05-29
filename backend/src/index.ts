import fastify from 'fastify';
import cors from '@fastify/cors';
import axios from 'axios';
import 'dotenv/config';
import { pipeline } from "@huggingface/transformers";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.resolve(__dirname, '../config.json');

const server = fastify({ logger: true });

// Configuration Handlers
const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading config.json:', err);
  }
  return { jira: { domain: '', email: '' }, ai: { provider: 'local' } };
};

const saveConfig = (config: any) => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config.json:', err);
  }
};

let appConfig = loadConfig();

if (!appConfig.jira) {
  appConfig.jira = { domain: '', email: '' };
}

if (!appConfig.ai) {
  appConfig.ai = { provider: 'local' };
}

if (!appConfig.atlassian) {
  appConfig.atlassian = {
    accountId: '',
    displayName: '',
    email: '',
    sites: [],
  };
}

// Initialize Local Model
let generator: any = null;

const initModel = async () => {
  if (!generator) {
    console.log("Loading local model (this may take a minute the first time)...");
    generator = await pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat');
    console.log("Model loaded successfully.");
  }
  return generator;
};

let jiraConfig = {
  domain: appConfig.jira.domain || process.env.JIRA_DOMAIN || '',
  email: appConfig.jira.email || process.env.JIRA_EMAIL || '',
  token: process.env.JIRA_API_TOKEN || '',
};

let githubConfig = {
  token: process.env.GITHUB_TOKEN || '',
};

let aiConfig = {
  provider: appConfig.ai.provider || process.env.AI_PROVIDER || 'local',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};

let atlassianConfig = {
  clientId: process.env.ATLASSIAN_CLIENT_ID || 'M5cfpggtCaLQLp6wHFxoGN0t6zmYBPgJ',
  clientSecret: process.env.ATLASSIAN_CLIENT_SECRET || '',
  redirectUri: process.env.ATLASSIAN_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
  frontendRedirectUri: process.env.ATLASSIAN_FRONTEND_REDIRECT_URI || 'http://localhost:5173',
  accessToken: process.env.ATLASSIAN_ACCESS_TOKEN || '',
  refreshToken: process.env.ATLASSIAN_REFRESH_TOKEN || '',
  tokenExpiresAt: Number(process.env.ATLASSIAN_TOKEN_EXPIRES_AT || 0),
};

const atlassianOAuthStates = new Map<string, number>();

const updateEnvFile = (config: any) => {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    let currentVars: Record<string, string> = {};
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0]?.trim();
          const value = parts.slice(1).join('=').trim();
          if (key) {
            currentVars[key] = value;
          }
        }
      });
    }

    // Only save SENSITIVE tokens to .env
    if (config.token !== undefined) {
      if (config.domain !== undefined) {
        currentVars['JIRA_API_TOKEN'] = config.token;
      } else {
        currentVars['GITHUB_TOKEN'] = config.token;
      }
    } else if (config.geminiApiKey !== undefined) {
      currentVars['GEMINI_API_KEY'] = config.geminiApiKey;
    } else if (config.atlassianAccessToken !== undefined) {
      currentVars['ATLASSIAN_ACCESS_TOKEN'] = config.atlassianAccessToken;
      currentVars['ATLASSIAN_REFRESH_TOKEN'] = config.atlassianRefreshToken || '';
      currentVars['ATLASSIAN_TOKEN_EXPIRES_AT'] = String(config.atlassianTokenExpiresAt || 0);
    }

    const newContent = Object.entries(currentVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    fs.writeFileSync(envPath, newContent);
    console.log(`Tokens saved to ${envPath}`);
  } catch (err) {
    console.error('Failed to update .env file:', err);
  }
};

server.register(cors, {
  origin: '*',
});

server.get('/api/health', async (request, reply) => {
  return { status: 'ok' };
});

// Jira endpoints
server.post('/api/jira/connect', async (request, reply) => {
  const { domain, email, token } = request.body as any;
  
  // Basic validation
  if (!domain || !email || !token) {
    return reply.status(400).send({ error: 'Missing required credentials' });
  }

  try {
    // Test connection by fetching the user profile
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const response = await axios.get(`https://${domain}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      jiraConfig = { domain, email, token };
      
      // Update config.json (public)
      appConfig.jira.domain = domain;
      appConfig.jira.email = email;
      saveConfig(appConfig);

      // Update .env (secret)
      updateEnvFile(jiraConfig);
      
      return { success: true, user: response.data.displayName };
    }
  } catch (err: any) {
    server.log.error(err);
    return reply.status(401).send({ error: 'Failed to connect to Jira. Check your credentials.' });
  }
});

server.post('/api/github/connect', async (request, reply) => {
  const { token } = request.body as any;

  if (!token) {
    return reply.status(400).send({ error: 'GitHub token is required' });
  }

  try {
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (response.status === 200) {
      githubConfig = { token };
      updateEnvFile(githubConfig);
      return { success: true, user: response.data.login };
    }
  } catch (err: any) {
    server.log.error(err);
    return reply.status(401).send({ error: 'Failed to connect to GitHub. Check your token.' });
  }
});

server.get('/api/jira/status', async (request, reply) => {
  const connected = !!(jiraConfig.domain && jiraConfig.email && jiraConfig.token);
  return { 
    connected,
    domain: jiraConfig.domain,
    email: jiraConfig.email
  };
});

server.post('/api/jira/disconnect', async (request, reply) => {
  jiraConfig = { domain: '', email: '', token: '' };
  
  appConfig.jira.domain = '';
  appConfig.jira.email = '';
  saveConfig(appConfig);
  
  updateEnvFile(jiraConfig);
  return { success: true };
});

server.get('/api/github/status', async (request, reply) => {
  const connected = !!githubConfig.token;
  let username = '';
  
  if (connected) {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${githubConfig.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      username = response.data.login;
    } catch (err) {
      server.log.error('Failed to fetch GitHub user during status check');
    }
  }
  
  return { connected, username };
});

server.post('/api/github/disconnect', async (request, reply) => {
  githubConfig = { token: '' };
  updateEnvFile(githubConfig);
  return { success: true };
});

server.get('/api/atlassian/status', async (request, reply) => {
  const connected = !!atlassianConfig.accessToken;
  const configured = !!(atlassianConfig.clientId && atlassianConfig.clientSecret && atlassianConfig.redirectUri);

  return {
    connected,
    configured,
    displayName: appConfig.atlassian?.displayName || '',
    email: appConfig.atlassian?.email || '',
    sites: appConfig.atlassian?.sites || [],
  };
});

server.get('/api/atlassian/oauth/start', async (request, reply) => {
  if (!atlassianConfig.clientId || !atlassianConfig.clientSecret || !atlassianConfig.redirectUri) {
    return reply.status(400).send({
      error: 'Atlassian OAuth is not configured. Set ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET, and ATLASSIAN_REDIRECT_URI in backend/.env',
    });
  }

  const state = crypto.randomBytes(16).toString('hex');
  atlassianOAuthStates.set(state, Date.now() + 10 * 60 * 1000);

  const authUrl = new URL('https://auth.atlassian.com/authorize');
  authUrl.searchParams.set('audience', 'api.atlassian.com');
  authUrl.searchParams.set('client_id', atlassianConfig.clientId);
  authUrl.searchParams.set('scope', 'read:jira-work');
  authUrl.searchParams.set('redirect_uri', atlassianConfig.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return { url: authUrl.toString() };
});

const handleAtlassianCallback = async (code?: string, state?: string) => {
  if (!code || !state) {
    return { ok: false, reason: 'missing_code_or_state' };
  }

  const expiresAt = atlassianOAuthStates.get(state);
  atlassianOAuthStates.delete(state);

  if (!expiresAt || expiresAt < Date.now()) {
    return { ok: false, reason: 'invalid_or_expired_state' };
  }

  try {
    const tokenResponse = await axios.post('https://auth.atlassian.com/oauth/token', {
      grant_type: 'authorization_code',
      client_id: atlassianConfig.clientId,
      client_secret: atlassianConfig.clientSecret,
      code,
      redirect_uri: atlassianConfig.redirectUri,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    const accessToken = tokenResponse.data.access_token || '';
    const refreshToken = tokenResponse.data.refresh_token || '';
    const tokenExpiresAt = Date.now() + (Number(tokenResponse.data.expires_in || 3600) * 1000);

    let meData: any = {};
    let resourcesData: any[] = [];

    try {
      const meResponse = await axios.get('https://api.atlassian.com/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      meData = meResponse.data || {};
    } catch (err) {
      server.log.warn({ err }, 'Atlassian /me fetch failed; continuing with token only');
    }

    try {
      const resourcesResponse = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      resourcesData = Array.isArray(resourcesResponse.data) ? resourcesResponse.data : [];
    } catch (err) {
      server.log.warn({ err }, 'Atlassian accessible-resources fetch failed; continuing with token only');
    }

    atlassianConfig.accessToken = accessToken;
    atlassianConfig.refreshToken = refreshToken;
    atlassianConfig.tokenExpiresAt = tokenExpiresAt;

    appConfig.atlassian = {
      accountId: meData.account_id || '',
      displayName: meData.name || meData.nickname || '',
      email: meData.email || '',
      sites: resourcesData.map((r: any) => ({
            id: r.id,
            name: r.name,
            url: r.url,
          })),
    };
    saveConfig(appConfig);

    updateEnvFile({
      atlassianAccessToken: accessToken,
      atlassianRefreshToken: refreshToken,
      atlassianTokenExpiresAt: tokenExpiresAt,
    });

    return { ok: true };
  } catch (err) {
    server.log.error(err);
    return { ok: false, reason: 'oauth_exchange_failed' };
  }
};

server.get('/api/auth/callback', async (request, reply) => {
  const { code, state } = request.query as { code?: string; state?: string };
  const result = await handleAtlassianCallback(code, state);

  const url = new URL(atlassianConfig.frontendRedirectUri);
  url.searchParams.set('atlassian_oauth', result.ok ? 'success' : 'error');
  if (!result.ok && result.reason) {
    url.searchParams.set('reason', result.reason);
  }

  return reply.redirect(url.toString());
});

server.get('/api/atlassian/oauth/callback', async (request, reply) => {
  const { code, state } = request.query as { code?: string; state?: string };
  const result = await handleAtlassianCallback(code, state);

  const url = new URL(atlassianConfig.frontendRedirectUri);
  url.searchParams.set('atlassian_oauth', result.ok ? 'success' : 'error');
  if (!result.ok && result.reason) {
    url.searchParams.set('reason', result.reason);
  }

  return reply.redirect(url.toString());
});

server.post('/api/atlassian/disconnect', async (request, reply) => {
  atlassianConfig.accessToken = '';
  atlassianConfig.refreshToken = '';
  atlassianConfig.tokenExpiresAt = 0;

  appConfig.atlassian = {
    accountId: '',
    displayName: '',
    email: '',
    sites: [],
  };
  saveConfig(appConfig);

  updateEnvFile({
    atlassianAccessToken: '',
    atlassianRefreshToken: '',
    atlassianTokenExpiresAt: 0,
  });

  return { success: true };
});

// AI Configuration endpoints
server.get('/api/ai/config', async (request, reply) => {
  return aiConfig;
});

server.post('/api/ai/config', async (request, reply) => {
  const { provider, geminiApiKey } = request.body as any;
  
  if (provider && ['local', 'gemini'].includes(provider)) {
    aiConfig.provider = provider;
    appConfig.ai.provider = provider;
    saveConfig(appConfig);
  }
  
  if (geminiApiKey !== undefined) {
    aiConfig.geminiApiKey = geminiApiKey;
    updateEnvFile({ geminiApiKey });
  }

  return { success: true, config: aiConfig };
});

server.get('/api/jira/issues', async (request, reply) => {
  if (!jiraConfig.domain || !jiraConfig.token) {
    return reply.status(401).send({ error: 'Jira not connected' });
  }

  try {
    const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.token}`).toString('base64');
    const url = `https://${jiraConfig.domain}/rest/api/3/search`;
    
    const response = await axios.post(url, {
      jql: "assignee = currentUser() AND statusCategory != Done",
      maxResults: 50,
      fields: [
        "summary",
        "status",
        "assignee"
      ]
    }, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    return response.data.issues.map((issue: any) => ({
      id: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status.name,
    }));
  } catch (err: any) {
    server.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch Jira issues' });
  }
});

server.get('/api/slack/messages', async (request, reply) => {
  return [
    { user: 'Alice', text: 'Hey, did you check the PR?' },
    { user: 'Bob', text: 'Working on the backend now.' },
  ];
});

server.get('/api/git/repos', async (request, reply) => {
  return [
    { name: 'organizer', path: '/Users/yotamabramson/PythonProjects/organizer' },
  ];
});

server.get('/api/github/prs', async (request, reply) => {
  if (!githubConfig.token) {
    return [];
  }

  try {
    const response = await axios.get('https://api.github.com/search/issues', {
      params: {
        q: 'is:open is:pr author:@me',
      },
      headers: {
        'Authorization': `token ${githubConfig.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    return response.data.items.map((pr: any) => ({
      id: pr.number,
      title: pr.title,
      author: pr.user.login,
      url: pr.html_url,
      repository: pr.repository_url.split('/').slice(-1)[0],
    }));
  } catch (err: any) {
    server.log.error(err);
    return [];
  }
});

// LLM Chat endpoint using local Transformers.js execution
server.post('/api/chat', async (request, reply) => {
  const { message } = request.body as any;
  
  if (!message) {
    return reply.status(400).send({ error: 'Message is required' });
  }

  let fullPrompt = message;

  // 1. Fetch tickets if Jira is connected
  if (jiraConfig.domain && jiraConfig.token) {
    try {
      const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.token}`).toString('base64');
      const url = `https://${jiraConfig.domain}/rest/api/3/search/jql/`;
      
      const response = await axios.post(url, {
        jql: "assignee = currentUser() AND statusCategory != Done",
        maxResults: 50,
        fields: [
          "summary",
          "status",
          "assignee"
        ]
      }, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const issues = response.data.issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
      }));

      if (issues.length > 0) {
        const ticketsContext = issues.map((i: any) => `- [${i.key}] ${i.summary} (${i.status})`).join('\n');
        fullPrompt = `You are a helpful assistant. Use the following Jira context to help the user:\n\nActive Jira Tickets:\n${ticketsContext}\n\nUser Message: ${message}`;
      }
    } catch (err) {
      server.log.error({ err }, "Failed to fetch Jira context for chat");
    }
  }

  // 2. Fetch PRs and Repositories if GitHub is connected
  if (githubConfig.token) {
    try {
      // Fetch PRs
      const prsResponse = await axios.get('https://api.github.com/search/issues', {
        params: {
          q: 'is:open is:pr author:@me',
        },
        headers: {
          'Authorization': `token ${githubConfig.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const prs = prsResponse.data.items.map((pr: any) => `- [#${pr.number}] ${pr.title} (Repo: ${pr.repository_url.split('/').pop()})`);

      // Fetch Repositories
      const reposResponse = await axios.get('https://api.github.com/user/repos', {
        params: {
          sort: 'updated',
          per_page: 20
        },
        headers: {
          'Authorization': `token ${githubConfig.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const repoNames = reposResponse.data.map((repo: any) => repo.name).join(', ');

      let githubContext = '';
      if (prs.length > 0) {
        githubContext += `Open GitHub Pull Requests:\n${prs.join('\n')}\n\n`;
      }
      if (repoNames) {
        githubContext += `Your GitHub Repositories: ${repoNames}\n\n`;
      }

      if (githubContext) {
        if (fullPrompt.includes('Active Jira Tickets')) {
          fullPrompt = fullPrompt.replace('\n\nUser Message:', `\n\n${githubContext}User Message:`);
        } else {
          fullPrompt = `You are a helpful assistant. Use the following GitHub context to help the user:\n\n${githubContext}User Message: ${message}`;
        }
      }
    } catch (err) {
      server.log.error('Failed to fetch GitHub context for chat');
    }
  }

  try {
    let responseText = '';

    if (aiConfig.provider === 'gemini' && aiConfig.geminiApiKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${aiConfig.geminiApiKey}`;
      const response = await axios.post(url, {
        contents: [{ parts: [{ text: fullPrompt }] }]
      });
      responseText = response.data.candidates[0].content.parts[0].text;
    } else {
      const chatGenerator = await initModel();
      
      const messages = [
        { role: 'user', content: fullPrompt },
      ];

      const output = await chatGenerator(messages, {
        max_new_tokens: 256,
        temperature: 0.7,
        do_sample: true,
      });

      responseText = output[0].generated_text[output[0].generated_text.length - 1].content;
    }

    return { response: responseText };
  } catch (err: any) {
    console.error("AI processing error:", err.message);
    server.log.error(err);
    return reply.status(500).send({ error: `AI processing failed: ${err.message}` });
  }
});

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server is running on http://localhost:3000');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
