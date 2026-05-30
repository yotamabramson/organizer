import fastify from 'fastify';
import cors from '@fastify/cors';

import jiraRoutes from './integrations/jira.js';
import githubRoutes from './integrations/github.js';
import atlassianRoutes from './integrations/atlassian.js';
import bitbucketRoutes from './integrations/bitbucket.js';
import otherRoutes from './integrations/other.js';
import aiConfigRoutes from './routes/ai.js';
import chatRoutes from './routes/chat.js';

const server = fastify({ logger: true });

server.register(cors, {
  origin: '*',
});

server.get('/api/health', async (request, reply) => {
  return { status: 'ok' };
});

// Register separated routes
server.register(jiraRoutes);
server.register(githubRoutes);
server.register(atlassianRoutes);
server.register(bitbucketRoutes);
server.register(otherRoutes);
server.register(aiConfigRoutes);
server.register(chatRoutes);

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
