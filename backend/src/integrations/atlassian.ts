import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import crypto from 'crypto';
import { state, saveConfig, updateEnvFile } from '../config.js';

export default async function atlassianRoutes(server: FastifyInstance) {
  server.get('/api/atlassian/status', async (request, reply) => {
    const connected = !!state.atlassianConfig.accessToken;
    const configured = !!(state.atlassianConfig.clientId && state.atlassianConfig.clientSecret && state.atlassianConfig.redirectUri);

    return {
      connected,
      configured,
      displayName: state.appConfig.atlassian?.displayName || '',
      email: state.appConfig.atlassian?.email || '',
      sites: state.appConfig.atlassian?.sites || [],
    };
  });

  server.get('/api/atlassian/oauth/start', async (request, reply) => {
    if (!state.atlassianConfig.clientId || !state.atlassianConfig.clientSecret || !state.atlassianConfig.redirectUri) {
      return reply.status(400).send({
        error: 'Atlassian OAuth is not configured. Set ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET, and ATLASSIAN_REDIRECT_URI in backend/.env',
      });
    }

    const stateId = crypto.randomBytes(16).toString('hex');
    state.atlassianOAuthStates.set(stateId, Date.now() + 10 * 60 * 1000);

    const authUrl = new URL('https://auth.atlassian.com/authorize');
    authUrl.searchParams.set('audience', 'api.atlassian.com');
    authUrl.searchParams.set('client_id', state.atlassianConfig.clientId);
    authUrl.searchParams.set('scope', 'read:jira-work');
    authUrl.searchParams.set('redirect_uri', state.atlassianConfig.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', stateId);

    return { url: authUrl.toString() };
  });

  const handleAtlassianCallback = async (code?: string, stateId?: string) => {
    if (!code || !stateId) {
      return { ok: false, reason: 'missing_code_or_state' };
    }

    const expiresAt = state.atlassianOAuthStates.get(stateId);
    state.atlassianOAuthStates.delete(stateId);

    if (!expiresAt || expiresAt < Date.now()) {
      return { ok: false, reason: 'invalid_or_expired_state' };
    }

    try {
      const tokenResponse = await axios.post('https://auth.atlassian.com/oauth/token', {
        grant_type: 'authorization_code',
        client_id: state.atlassianConfig.clientId,
        client_secret: state.atlassianConfig.clientSecret,
        code,
        redirect_uri: state.atlassianConfig.redirectUri,
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

      state.atlassianConfig.accessToken = accessToken;
      state.atlassianConfig.refreshToken = refreshToken;
      state.atlassianConfig.tokenExpiresAt = tokenExpiresAt;

      state.appConfig.atlassian = {
        accountId: meData.account_id || '',
        displayName: meData.name || meData.nickname || '',
        email: meData.email || '',
        sites: resourcesData.map((r: any) => ({
              id: r.id,
              name: r.name,
              url: r.url,
            })),
      };
      saveConfig(state.appConfig);

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
    const { code, state: stateId } = request.query as { code?: string; state?: string };
    const result = await handleAtlassianCallback(code, stateId);

    const url = new URL(state.atlassianConfig.frontendRedirectUri);
    url.searchParams.set('atlassian_oauth', result.ok ? 'success' : 'error');
    if (!result.ok && result.reason) {
      url.searchParams.set('reason', result.reason);
    }

    return reply.redirect(url.toString());
  });

  server.get('/api/atlassian/oauth/callback', async (request, reply) => {
    const { code, state: stateId } = request.query as { code?: string; state?: string };
    const result = await handleAtlassianCallback(code, stateId);

    const url = new URL(state.atlassianConfig.frontendRedirectUri);
    url.searchParams.set('atlassian_oauth', result.ok ? 'success' : 'error');
    if (!result.ok && result.reason) {
      url.searchParams.set('reason', result.reason);
    }

    return reply.redirect(url.toString());
  });

  server.post('/api/atlassian/disconnect', async (request, reply) => {
    state.atlassianConfig.accessToken = '';
    state.atlassianConfig.refreshToken = '';
    state.atlassianConfig.tokenExpiresAt = 0;

    state.appConfig.atlassian = {
      accountId: '',
      displayName: '',
      email: '',
      sites: [],
    };
    saveConfig(state.appConfig);

    updateEnvFile({
      atlassianAccessToken: '',
      atlassianRefreshToken: '',
      atlassianTokenExpiresAt: 0,
    });

    return { success: true };
  });
}