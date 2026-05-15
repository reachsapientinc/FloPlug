/**
 * types/PlugTypes.ts
 *
 * Shared types for the FloPlug connector → plug system.
 *
 * Concept:
 *  - A CONNECTOR NODE (e.g. WorkdayNode) is a product-defined template that
 *    declares which auth methods are supported (basic, oauth2_refresh, apikey…).
 *  - A PLUG is a hub-admin-created instance of a connector, with a custom name
 *    and a specific auth method configured. Only hub_admins can create/edit plugs.
 *  - At runtime, the flow engine resolves the plug referenced by a node,
 *    substitutes {{Token_Name}} placeholders in headers/URLs with real values,
 *    and makes the outbound API call.
 */


// ── Per-method credential shapes ──────────────────────────────────────────────
// Credentials are stored encrypted server-side; only metadata is kept on client.

export interface BasicCredentials {
  method:   'basic';
  username: string;
  password: string;         // write-only on UI after initial save
}

export interface OAuth2RefreshCredentials {
  method:        'oauth2_refresh';
  tokenUrl:      string;    // e.g. https://wd2.myworkday.com/ccx/oauth2/{tenant}/token
  clientId:      string;
  clientSecret:  string;    // write-only on UI after initial save
  refreshToken:  string;    // write-only on UI after initial save
  /** Name the designer uses in headers: e.g. "Access_Token" → {{Access_Token}} */
  tokenVarName:  string;
  /** Where to inject: 'header' | 'query' */
  injectIn:      'header' | 'query';
  /** Header/param name: e.g. "Authorization" */
  injectKey:     string;
  /** Header/param value template: e.g. "Bearer {{Access_Token}}" */
  injectValue:   string;
}

export interface ApiKeyCredentials {
  method:     'apikey';
  apiKey:     string;       // write-only on UI after initial save
  /** Name the designer uses: e.g. "API_Key" → {{API_Key}} */
  keyVarName: string;
  injectIn:   'header' | 'query';
  injectKey:  string;       // e.g. "x-api-key"
  injectValue: string;      // e.g. "{{API_Key}}"
}

export interface BearerStaticCredentials {
  method:      'bearer_static';
  token:       string;      // write-only on UI after initial save
  tokenVarName: string;
  injectIn:    'header' | 'query';
  injectKey:   string;
  injectValue: string;      // e.g. "Bearer {{My_Token}}"
}

export interface NoneCredentials {
  method: 'none';
}



// ── What a connector node stores in its data ──────────────────────────────────

export interface ConnectorNodeData {
  /** ID of the PlugConfig to use at runtime */
  plugId:    string;
  /** Display name of the selected plug (shown in node) */
  plugName?: string;
  /** Connector-specific action parameters (varies per connector) */
  [key: string]: unknown;
}


