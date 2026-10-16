import "server-only";
import { EventEmitter } from 'node:events';
import { WebClient } from '@slack/web-api';

const token = process.env.SLACK_BOT_TOKEN;

export const slack = new WebClient(token);

// Bridges the Events API webhook to open thread streams. Kept on globalThis so
// every route module (and dev hot reloads) shares the same instance.
const globalForSlack = globalThis as unknown as { slackThreadEvents?: EventEmitter };

export const slackThreadEvents = (globalForSlack.slackThreadEvents ??= new EventEmitter().setMaxListeners(0));
