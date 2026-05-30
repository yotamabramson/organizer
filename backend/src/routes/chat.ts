import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { state } from '../config.js';
import { initModel } from '../ai/model.js';

export default async function chatRoutes(server: FastifyInstance) {
  server.post('/api/chat', async (request, reply) => {
    const { message } = request.body as any;
    
    if (!message) {
      return reply.status(400).send({ error: 'Message is required' });
    }

    let fullPrompt = message;

    // 1. Fetch tickets if Jira is connected via API key
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

        const issues = response.data.issues.map((issue: any) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
        }));

        if (issues.length > 0) {
          fullPrompt = `You are a helpful assistant. Use the following Jira context (provided as JSON) to help the user:\n\n${JSON.stringify(issues, null, 2)}\n\nUser Message: ${message}`;
        }
      } catch (err) {
        server.log.error({ err }, "Failed to fetch Jira context for chat");
      }
    } else if (state.atlassianConfig.accessToken) {
      // 1b. Fetch ALL Jira tickets if connected via Atlassian OAuth
      try {
        const sites = Array.isArray(state.appConfig.atlassian?.sites) ? state.appConfig.atlassian.sites : [];
        const jiraSite = sites.find((site: any) => typeof site?.url === 'string' && site.url.includes('atlassian.net')) || sites[0];

        if (jiraSite?.id) {
          const allIssues: any[] = [];
          let maxResults = 100;

          do {
            const searchUrl = `https://api.atlassian.com/ex/jira/${jiraSite.id}/rest/api/3/search/jql`;
            const payload = {
              jql: "assignee = currentUser()",
              maxResults,
              fields: ['summary', 'status'],
              fieldsByKeys: true
            };

            const curlCommand = `curl -X POST "${searchUrl}" -H "Authorization: Bearer ${state.atlassianConfig.accessToken}" -H "Accept: application/json" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`;
            server.log.info({ curlCommand }, "DEBUG: Equivalent curl command for Atlassian API (Chat)");

            const response = await axios.post(searchUrl, payload, {
              headers: {
                'Authorization': `Bearer ${state.atlassianConfig.accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
            });

            const pageIssues = Array.isArray(response.data?.issues) ? response.data.issues : [];
            allIssues.push(...pageIssues);
            
            // Break loop since we removed startAt pagination offset logic
            break;
            
          } while (false);

          if (allIssues.length > 0) {
            const ticketsContext = allIssues.map((issue: any) => ({
              key: issue.key,
              summary: issue.fields?.summary || 'No summary',
              status: issue.fields?.status?.name || 'Unknown'
            }));

            fullPrompt = `You are a helpful assistant. Use the following Jira context (provided as JSON) to help the user:\n\n${JSON.stringify(ticketsContext, null, 2)}\n\nUser Message: ${message}`;
          }
        } else {
          server.log.warn('No Jira cloud site found in Atlassian OAuth resources');
        }
      } catch (err) {
        server.log.error({ err }, 'Failed to fetch Jira context via Atlassian OAuth for chat');
      }
    }

    // 2. Fetch PRs and Repositories if GitHub is connected
    if (state.githubConfig.token) {
      try {
        // Fetch PRs
        const prsResponse = await axios.get('https://api.github.com/search/issues', {
          params: {
            q: 'is:open is:pr author:@me',
          },
          headers: {
            'Authorization': `token ${state.githubConfig.token}`,
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
            'Authorization': `token ${state.githubConfig.token}`,
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
          if (fullPrompt !== message) {
            fullPrompt = fullPrompt.replace('\n\nUser Message:', `\n\nGitHub context:\n${githubContext}User Message:`);
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

      if (state.aiConfig.provider === 'gemini' && state.aiConfig.geminiApiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.aiConfig.geminiApiKey}`;
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
}