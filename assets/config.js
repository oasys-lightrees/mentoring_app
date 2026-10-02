/*
 * Deployment config.
 *  apiUrl: Google Apps Script Web App URL (".../exec") → server sign-in, tenant isolation, audit log.
 *  Leave empty to run on the Claude Artifact database (cloud) or this browser only (local).
 */
window.MCRM_CONFIG = window.MCRM_CONFIG || { apiUrl: '' };
