/**
 * Bot Instance - re-exports Sandbox class for container management
 * 
 * The Sandbox SDK handles container lifecycle internally.
 * We start the OpenClaw gateway as a background process using sandbox.startProcess()
 */
export { Sandbox } from '@cloudflare/sandbox';
