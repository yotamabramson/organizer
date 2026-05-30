import type { FastifyInstance } from 'fastify';

export default async function otherRoutes(server: FastifyInstance) {
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
}