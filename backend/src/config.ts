import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG_PATH = path.resolve(__dirname, '../config.json');

export const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading config.json:', err);
  }
  return { jira: { domain: '', email: '' }, ai: { provider: 'local' } };
};

export const saveConfig = (config: any) => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config.json:', err);
  }
};

export const updateEnvFile = (config: any) => {
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
    } else if (config.bitbucketAccessToken !== undefined) {
      currentVars['BITBUCKET_ACCESS_TOKEN'] = config.bitbucketAccessToken;
      currentVars['BITBUCKET_REFRESH_TOKEN'] = config.bitbucketRefreshToken || '';
      currentVars['BITBUCKET_TOKEN_EXPIRES_AT'] = String(config.bitbucketTokenExpiresAt || 0);
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

const initialAppConfig = loadConfig();

if (!initialAppConfig.jira) {
  initialAppConfig.jira = { domain: '', email: '' };
}

if (!initialAppConfig.ai) {
  initialAppConfig.ai = { provider: 'local' };
}

if (!initialAppConfig.atlassian) {
  initialAppConfig.atlassian = {
    accountId: '',
    displayName: '',
    email: '',
    sites: [],
  };
}

if (!initialAppConfig.bitbucket) {
  initialAppConfig.bitbucket = {
    username: '',
    displayName: '',
    workspaces: [],
  };
}

export const state = {
  appConfig: initialAppConfig,
  jiraConfig: {
    domain: initialAppConfig.jira.domain || process.env.JIRA_DOMAIN || '',
    email: initialAppConfig.jira.email || process.env.JIRA_EMAIL || '',
    token: process.env.JIRA_API_TOKEN || '',
  },
  githubConfig: {
    token: process.env.GITHUB_TOKEN || '',
  },
  aiConfig: {
    provider: initialAppConfig.ai.provider || process.env.AI_PROVIDER || 'local',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  },
  atlassianConfig: {
    clientId: process.env.ATLASSIAN_CLIENT_ID || 'M5cfpggtCaLQLp6wHFxoGN0t6zmYBPgJ',
    clientSecret: process.env.ATLASSIAN_CLIENT_SECRET || '',
    redirectUri: process.env.ATLASSIAN_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
    frontendRedirectUri: process.env.ATLASSIAN_FRONTEND_REDIRECT_URI || 'http://localhost:5173',
    accessToken: process.env.ATLASSIAN_ACCESS_TOKEN || '',
    refreshToken: process.env.ATLASSIAN_REFRESH_TOKEN || '',
    tokenExpiresAt: Number(process.env.ATLASSIAN_TOKEN_EXPIRES_AT || 0),
  },
  bitbucketConfig: {
    clientId: process.env.BITBUCKET_CLIENT_ID || '4F4weJ5N6nv6jkhSS3',
    clientSecret: process.env.BITBUCKET_CLIENT_SECRET || 'b2qYjDyE4Fz8Zwy9t3R5QY4Bfxs3Cyvp',
    redirectUri: process.env.BITBUCKET_REDIRECT_URI || 'http://localhost:3000/api/auth/bitbucket/callback',
    frontendRedirectUri: process.env.BITBUCKET_FRONTEND_REDIRECT_URI || 'http://localhost:5173',
    accessToken: process.env.BITBUCKET_ACCESS_TOKEN || '',
    refreshToken: process.env.BITBUCKET_REFRESH_TOKEN || '',
    tokenExpiresAt: Number(process.env.BITBUCKET_TOKEN_EXPIRES_AT || 0),
  },
  atlassianOAuthStates: new Map<string, number>(),
  bitbucketOAuthStates: new Map<string, number>(),
};