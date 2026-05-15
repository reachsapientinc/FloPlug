// functions/src/engine/applyAuth.ts
import type { AuthProtocol, PlugCredentialValues } from '@floplug/shared';

interface AuthResult {
  headers:       Record<string, string>;
  soapEnvelope?: (body: string) => string;
}

// ── Resolve authStyle from protocol doc ───────────────────────────────────────
// Supports both new authStyle field and legacy runtimeConfig.placementType
const resolveAuthStyle = (protocol: AuthProtocol): string => {
  if (protocol.authStyle) {
    console.log(`[applyAuth] authStyle from field: ${protocol.authStyle}`);
    return protocol.authStyle;
  }

  // Legacy fallback — derive from runtimeConfig or grantType
  const placement  = (protocol as any).runtimeConfig?.placementType;
  const grantType  = (protocol as any).grantType;

  const derived =
    placement === 'soapHeader'          ? 'wsseHeader'        :
    placement === 'bearer'              ? 'oauth2ClientCreds' :
    placement === 'header' && grantType === 'basic' ? 'httpBasic' :
    placement === 'header'              ? 'apiKeyHeader'      :
    placement === 'query'               ? 'apiKeyQuery'       :
    grantType  === 'basic'              ? 'httpBasic'         :
    grantType  === 'api_key'            ? 'apiKeyHeader'      :
    grantType  === 'client_credentials' ? 'oauth2ClientCreds' :
    grantType  === 'password'           ? 'oauth2ClientCreds' :
    grantType  === 'wsse'               ? 'wsseHeader'        :
    'httpBasic'; // safe default

  console.log(`[applyAuth] authStyle derived from runtimeConfig/grantType: ${derived} (placement=${placement}, grantType=${grantType})`);
  return derived;
};

// ── Main ──────────────────────────────────────────────────────────────────────
export const applyAuth = async (
  protocol:    AuthProtocol,
  credentials: PlugCredentialValues,
): Promise<AuthResult> => {

  console.log(`[applyAuth] protocol.name=${protocol.name} label="${protocol.label}"`);
  console.log(`[applyAuth] credential keys: [${Object.keys(credentials).join(', ')}]`);

  const authStyle = resolveAuthStyle(protocol);
  console.log(`[applyAuth] resolved authStyle: ${authStyle}`);

  switch (authStyle) {

    // ── HTTP Basic ────────────────────────────────────────────────────────────
    case 'httpBasic': {
      if (!credentials.username || !credentials.password) {
        console.warn(`[applyAuth] httpBasic: missing username or password`);
      }
      const token = Buffer.from(
        `${credentials.username}:${credentials.password}`
      ).toString('base64');
      console.log(`[applyAuth] httpBasic: Authorization header built for user="${credentials.username}"`);
      return { headers: { Authorization: `Basic ${token}` } };
    }

    // ── WSSE Username Token (Workday SOAP) ────────────────────────────────────
    case 'wsseHeader': {
      if (!credentials.username || !credentials.password) {
        console.warn(`[applyAuth] wsseHeader: missing username or password`);
      }
      const nonce   = Buffer.from(Math.random().toString()).toString('base64');
      const created = new Date().toISOString();

      const wsse = [
        '<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" soapenv:mustUnderstand="1">',
        '  <wsse:UsernameToken>',
        `    <wsse:Username>${credentials.username}</wsse:Username>`,
        `    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${credentials.password}</wsse:Password>`,
        `    <wsse:Nonce>${nonce}</wsse:Nonce>`,
        `    <wsu:Created xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</wsu:Created>`,
        '  </wsse:UsernameToken>',
        '</wsse:Security>',
      ].join('\n');

      console.log(`[applyAuth] wsseHeader: WSSE token built for user="${credentials.username}" created=${created}`);

      return {
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        soapEnvelope: (body: string) => {
          const envelope = [
            '<soapenv:Envelope',
            '  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"',
            '  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">',
            `  <soapenv:Header>${wsse}</soapenv:Header>`,
            `  <soapenv:Body>${body}</soapenv:Body>`,
            '</soapenv:Envelope>',
          ].join('\n');
          console.log(`[applyAuth] wsseHeader: SOAP envelope built (${envelope.length} chars)`);
          return envelope;
        },
      };
    }

    // ── Bearer Token ──────────────────────────────────────────────────────────
    case 'bearerToken': {
      if (!credentials.token) {
        console.warn(`[applyAuth] bearerToken: missing token`);
      }
      console.log(`[applyAuth] bearerToken: Authorization Bearer header built`);
      return { headers: { Authorization: `Bearer ${credentials.token}` } };
    }

    // ── API Key Header ────────────────────────────────────────────────────────
    case 'apiKeyHeader': {
      if (!credentials.apiKey) {
        console.warn(`[applyAuth] apiKeyHeader: missing apiKey`);
      }
      // headerName can come from protocol field OR from credential override
      const headerName =
        credentials.headerName ||
        protocol.headerName    ||
        (protocol as any).runtimeConfig?.headerName ||
        'X-API-Key';
      console.log(`[applyAuth] apiKeyHeader: header="${headerName}" built`);
      return { headers: { [headerName]: credentials.apiKey } };
    }

    // ── API Key Query Param ───────────────────────────────────────────────────
    case 'apiKeyQuery': {
      if (!credentials.apiKey) {
        console.warn(`[applyAuth] apiKeyQuery: missing apiKey`);
      }
      const paramName =
        protocol.paramName ||
        (protocol as any).runtimeConfig?.paramName ||
        'api_key';
      console.log(`[applyAuth] apiKeyQuery: param="${paramName}" — caller must append to URL`);
      // Return as custom field — caller checks for queryParam and appends to URL
      return { headers: {}, queryParam: { [paramName]: credentials.apiKey } } as any;
    }

    // ── OAuth2 Client Credentials / Password Grant ────────────────────────────
    case 'oauth2ClientCreds': {
      const tokenUrl =
        protocol.tokenUrl                              ||
        (protocol as any).runtimeConfig?.tokenEndpointField &&
          credentials[(protocol as any).runtimeConfig.tokenEndpointField] ||
        credentials.tokenEndpoint;

      if (!tokenUrl) {
        console.error(`[applyAuth] oauth2ClientCreds: no tokenUrl found`);
        throw new Error('oauth2ClientCreds: tokenUrl is required');
      }

      const grantType = (protocol as any).grantType ?? 'client_credentials';
      console.log(`[applyAuth] oauth2ClientCreds: fetching token from ${tokenUrl} grantType=${grantType}`);

      const params: Record<string, string> = {
        grant_type:    grantType,
        client_id:     credentials.clientId     ?? '',
        client_secret: credentials.clientSecret ?? '',
      };

      // Password grant needs username + password too
      if (grantType === 'password') {
        params.username = credentials.username ?? '';
        params.password = credentials.password ?? '';
      }

      if (credentials.scope) params.scope = credentials.scope;

      const tokenRes = await fetch(tokenUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams(params),
      });

      const tokenText = await tokenRes.text();
      console.log(`[applyAuth] oauth2ClientCreds: token response status=${tokenRes.status}`);

      if (!tokenRes.ok) {
        console.error(`[applyAuth] oauth2ClientCreds: token fetch failed status=${tokenRes.status} body=${tokenText.slice(0, 300)}`);
        throw new Error(`Token fetch failed [${tokenRes.status}]: ${tokenText.slice(0, 200)}`);
      }

      const { access_token } = JSON.parse(tokenText) as { access_token: string };
      if (!access_token) {
        console.error(`[applyAuth] oauth2ClientCreds: access_token missing in response`);
        throw new Error('Token response did not contain access_token');
      }

      console.log(`[applyAuth] oauth2ClientCreds: token acquired successfully`);
      return { headers: { Authorization: `Bearer ${access_token}` } };
    }

    // ── Unknown ───────────────────────────────────────────────────────────────
    default: {
      console.warn(`[applyAuth] unknown authStyle="${authStyle}" — returning empty headers`);
      return { headers: {} };
    }
  }
};