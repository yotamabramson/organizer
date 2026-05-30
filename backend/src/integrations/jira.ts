import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { state, saveConfig, updateEnvFile } from '../config.js';

export default async function jiraRoutes(server: FastifyInstance) {
  server.post('/api/jira/connect', async (request, reply) => {
    const { domain, email, token } = request.body as any;
    
    if (!domain || !email || !token) {
      return reply.status(400).send({ error: 'Missing required credentials' });
    }

    try {
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const response = await axios.get(`https://${domain}/rest/api/3/myself`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      });

      if (response.status === 200) {
        state.jiraConfig = { domain, email, token };
        
        state.appConfig.jira.domain = domain;
        state.appConfig.jira.email = email;
        saveConfig(state.appConfig);

        updateEnvFile(state.jiraConfig);
        
        return { success: true, user: response.data.displayName };
      }
    } catch (err: any) {
      server.log.error(err);
      return reply.status(401).send({ error: 'Failed to connect to Jira. Check your credentials.' });
    }
  });

  server.get('/api/jira/status', async (request, reply) => {
    const connected = !!(state.jiraConfig.domain && state.jiraConfig.email && state.jiraConfig.token);
    return { 
      connected,
      domain: state.jiraConfig.domain,
      email: state.jiraConfig.email
    };
  });

  server.post('/api/jira/disconnect', async (request, reply) => {
    state.jiraConfig = { domain: '', email: '', token: '' };
    
    state.appConfig.jira.domain = '';
    state.appConfig.jira.email = '';
    saveConfig(state.appConfig);
    
    updateEnvFile(state.jiraConfig);
    return { success: true };
  });

  server.get('/api/jira/issues', async (request, reply) => {
    if (state.jiraConfig.domain && state.jiraConfig.token) {
      try {
        const auth = Buffer.from(`${state.jiraConfig.email}:${state.jiraConfig.token}`).toString('base64');
        const url = `https://${state.jiraConfig.domain}/rest/api/3/search/jql`;

        const response = await axios.post(url, {
          jql: "assignee = currentUser()",
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
    }

    if (state.atlassianConfig.accessToken) {
      try {
        const sites = Array.isArray(state.appConfig.atlassian?.sites) ? state.appConfig.atlassian.sites : [];
        const jiraSite = sites.find((site: any) => typeof site?.url === 'string' && site.url.includes('atlassian.net')) || sites[0];

        if (!jiraSite?.id) {
          return reply.status(401).send({ error: 'No Jira cloud site available for OAuth connection' });
        }

        const searchUrl = `https://api.atlassian.com/ex/jira/${jiraSite.id}/rest/api/3/search/jql`;
        const payload = {
          jql: "assignee = currentUser()",
          maxResults: 100,
          fields: ["summary", "status"],
          fieldsByKeys: true
        };

        const curlCommand = `curl -X POST "${searchUrl}" -H "Authorization: Bearer ${state.atlassianConfig.accessToken}" -H "Accept: application/json" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`;
        server.log.info({ curlCommand }, "DEBUG: Equivalent curl command for Atlassian API (Issues)");

        const response = await axios.post(searchUrl, payload, {
          headers: {
            'Authorization': `Bearer ${state.atlassianConfig.accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        return (response.data.issues || []).map((issue: any) => ({
          id: issue.key,
          title: issue.fields?.summary || 'No summary',
          status: issue.fields?.status?.name || 'Unknown',
        }));
      } catch (err: any) {
        server.log.error({ err }, 'Failed to fetch Jira issues via Atlassian OAuth');
        return reply.status(500).send({ error: 'Failed to fetch Jira issues via Atlassian OAuth' });
      }
    }

    return reply.status(401).send({ error: 'Jira not connected' });
  });
}