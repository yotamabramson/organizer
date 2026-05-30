import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { state, updateEnvFile } from '../config.js';

export default async function githubRoutes(server: FastifyInstance) {
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
        state.githubConfig = { token };
        updateEnvFile(state.githubConfig);
        return { success: true, user: response.data.login };
      }
    } catch (err: any) {
      server.log.error(err);
      return reply.status(401).send({ error: 'Failed to connect to GitHub. Check your token.' });
    }
  });

  server.get('/api/github/status', async (request, reply) => {
    const connected = !!state.githubConfig.token;
    let username = '';
    
    if (connected) {
      try {
        const response = await axios.get('https://api.github.com/user', {
          headers: {
            'Authorization': `token ${state.githubConfig.token}`,
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
    state.githubConfig = { token: '' };
    updateEnvFile(state.githubConfig);
    return { success: true };
  });

  server.get('/api/github/prs', async (request, reply) => {
    if (!state.githubConfig.token) {
      return [];
    }

    try {
      const response = await axios.get('https://api.github.com/search/issues', {
        params: {
          q: 'is:open is:pr author:@me',
        },
        headers: {
          'Authorization': `token ${state.githubConfig.token}`,
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
}