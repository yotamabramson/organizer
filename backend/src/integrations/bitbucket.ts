import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import crypto from 'crypto';
import { state, saveConfig, updateEnvFile } from '../config.js';

export default async function bitbucketRoutes(server: FastifyInstance) {
  server.get('/api/bitbucket/status', async (request, reply) => {
    const connected = !!state.bitbucketConfig.accessToken;
    const configured = !!(state.bitbucketConfig.clientId && state.bitbucketConfig.clientSecret && state.bitbucketConfig.redirectUri);

    return {
      connected,
      configured,
      username: state.appConfig.bitbucket?.username || '',
      displayName: state.appConfig.bitbucket?.displayName || '',
      workspaces: state.appConfig.bitbucket?.workspaces || [],
    };
  });

  server.get('/api/bitbucket/oauth/start', async (request, reply) => {
    if (!state.bitbucketConfig.clientId || !state.bitbucketConfig.clientSecret || !state.bitbucketConfig.redirectUri) {
      return reply.status(400).send({
        error: 'Bitbucket OAuth is not configured. Set BITBUCKET_CLIENT_ID, BITBUCKET_CLIENT_SECRET, and BITBUCKET_REDIRECT_URI in backend/.env',
      });
    }

    const stateId = crypto.randomBytes(16).toString('hex');
    state.bitbucketOAuthStates.set(stateId, Date.now() + 10 * 60 * 1000);

    const authUrl = new URL('https://bitbucket.org/site/oauth2/authorize');
    authUrl.searchParams.set('client_id', state.bitbucketConfig.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', state.bitbucketConfig.redirectUri);
    authUrl.searchParams.set('state', stateId);

    return { url: authUrl.toString() };
  });

  server.get('/api/auth/bitbucket/callback', async (request, reply) => {
    const { code, state: stateId } = request.query as { code?: string; state?: string };

    const redirectWithStatus = (status: string, reason?: string) => {
      const url = new URL(state.bitbucketConfig.frontendRedirectUri);
      url.searchParams.set('bitbucket_oauth', status);
      if (reason) url.searchParams.set('reason', reason);
      return reply.redirect(url.toString());
    };

    if (!code || !stateId) {
      return redirectWithStatus('error', 'missing_code_or_state');
    }

    const expiresAt = state.bitbucketOAuthStates.get(stateId);
    state.bitbucketOAuthStates.delete(stateId);

    if (!expiresAt || expiresAt < Date.now()) {
      return redirectWithStatus('error', 'invalid_or_expired_state');
    }

    try {
      const basicAuth = Buffer.from(`${state.bitbucketConfig.clientId}:${state.bitbucketConfig.clientSecret}`).toString('base64');
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: state.bitbucketConfig.redirectUri,
      }).toString();

      const tokenResponse = await axios.post('https://bitbucket.org/site/oauth2/access_token', body, {
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const accessToken = tokenResponse.data.access_token || '';
      const refreshToken = tokenResponse.data.refresh_token || '';
      const tokenExpiresAt = Date.now() + (Number(tokenResponse.data.expires_in || 3600) * 1000);

      let userData: any = {};
      let workspaceNames: string[] = [];

      try {
        const userResponse = await axios.get('https://api.bitbucket.org/2.0/user', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });
        userData = userResponse.data || {};
      } catch (err) {
        server.log.warn({ err }, 'Bitbucket user fetch failed; continuing with token only');
      }

      try {
        const workspaceResponse = await axios.get('https://api.bitbucket.org/2.0/workspaces?role=member', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });
        workspaceNames = Array.isArray(workspaceResponse.data?.values)
          ? workspaceResponse.data.values.map((w: any) => w.name || w.slug).filter(Boolean)
          : [];
      } catch (err) {
        server.log.warn({ err }, 'Bitbucket workspace fetch failed; continuing with token only');
      }

      state.bitbucketConfig.accessToken = accessToken;
      state.bitbucketConfig.refreshToken = refreshToken;
      state.bitbucketConfig.tokenExpiresAt = tokenExpiresAt;

      state.appConfig.bitbucket = {
        username: userData.username || '',
        displayName: userData.display_name || '',
        workspaces: workspaceNames,
      };
      saveConfig(state.appConfig);

      updateEnvFile({
        bitbucketAccessToken: accessToken,
        bitbucketRefreshToken: refreshToken,
        bitbucketTokenExpiresAt: tokenExpiresAt,
      });

      return redirectWithStatus('success');
    } catch (err) {
      server.log.error(err);
      return redirectWithStatus('error', 'oauth_exchange_failed');
    }
  });

  server.post('/api/bitbucket/disconnect', async (request, reply) => {
    state.bitbucketConfig.accessToken = '';
    state.bitbucketConfig.refreshToken = '';
    state.bitbucketConfig.tokenExpiresAt = 0;

    state.appConfig.bitbucket = {
      username: '',
      displayName: '',
      workspaces: [],
    };
    saveConfig(state.appConfig);

    updateEnvFile({
      bitbucketAccessToken: '',
      bitbucketRefreshToken: '',
      bitbucketTokenExpiresAt: 0,
    });

    return { success: true };
  });
}