/*
 * Deployment config.
 *  apiUrl:        Supabase Edge Function URL ("https://<project>.supabase.co/functions/v1/api") → server sign-in, tenant isolation, audit log.
 *                 Leave empty to run on the Claude Artifact database (cloud) or this browser only (local).
 *  defaultTenant: company code opened by the bare link (e.g. 'alphaleaders'). Lightech staff use #lightech.
 */
window.MCRM_CONFIG = window.MCRM_CONFIG || { apiUrl: '', defaultTenant: '' };
