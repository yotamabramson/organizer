import fastify from 'fastify';
import cors from '@fastify/cors';
import axios from 'axios';
import 'dotenv/config';
import { pipeline } from "@huggingface/transformers";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = fastify({ logger: true });

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
  domain: process.env.JIRA_DOMAIN || '',
  email: process.env.JIRA_EMAIL || '',
  token: process.env.JIRA_API_TOKEN || '',
};

let githubConfig = {
  token: process.env.GITHUB_TOKEN || '',
};

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

    if (config.domain !== undefined) {
      currentVars['JIRA_DOMAIN'] = config.domain;
      currentVars['JIRA_EMAIL'] = config.email;
      currentVars['JIRA_API_TOKEN'] = config.token;
    } else if (config.token !== undefined) {
      currentVars['GITHUB_TOKEN'] = config.token;
    }

    const newContent = Object.entries(currentVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    fs.writeFileSync(envPath, newContent);
    console.log(`Credentials saved to ${envPath}`);
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
  updateEnvFile(jiraConfig);
  return { success: true };
});

server.get('/api/github/status', async (request, reply) => {
  const connected = !!githubConfig.token;
  return { connected };
});

server.post('/api/github/disconnect', async (request, reply) => {
  githubConfig = { token: '' };
  updateEnvFile(githubConfig);
  return { success: true };
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

  // 2. Fetch PRs if GitHub is connected
  if (githubConfig.token) {
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

      const prs = response.data.items.map((pr: any) => `- [#${pr.number}] ${pr.title} (Repo: ${pr.repository_url.split('/').pop()})`);

      if (prs.length > 0) {
        const prContext = prs.join('\n');
        // Handle case where Jira context was already added
        if (fullPrompt.includes('Active Jira Tickets')) {
          fullPrompt = fullPrompt.replace('\n\nUser Message:', `\n\nOpen GitHub Pull Requests:\n${prContext}\n\nUser Message:`);
        } else {
          fullPrompt = `You are a helpful assistant. Use the following GitHub context to help the user:\n\nOpen GitHub Pull Requests:\n${prContext}\n\nUser Message: ${message}`;
        }
      }
    } catch (err) {
      server.log.error('Failed to fetch GitHub context for chat');
    }
  }

  try {
    const chatGenerator = await initModel();
    
    const messages = [
      { role: 'user', content: fullPrompt },
    ];

    const output = await chatGenerator(messages, {
      max_new_tokens: 256,
      temperature: 0.7,
      do_sample: true,
    });

    const response = output[0].generated_text[output[0].generated_text.length - 1].content;
    return { response };
  } catch (err: any) {
    console.error("Local Model Error:", err.message);
    server.log.error(err);
    return reply.status(500).send({ error: 'Failed to get response from local AI' });
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
