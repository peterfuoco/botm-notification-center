import type { RouterMiddleware } from '@koa/router';
import { findNotificationById, listNotifications } from '../data/notificationsRepo.js';
import {
  createNotificationSchema,
  updateNotificationSchema,
} from '../domain/validation/notificationSchemas.js';
import { idParamSchema, listQuerySchema } from '../domain/validation/requestSchemas.js';
import { AppError, notFound } from '../lib/errors.js';
import { parseInput } from '../lib/parseInput.js';
import { activateNotification } from '../services/activateNotification.js';
import { createNotification } from '../services/createNotification.js';
import { deactivateNotification } from '../services/deactivateNotification.js';
import { removeNotification } from '../services/removeNotification.js';
import type { ServiceDeps } from '../services/serviceDeps.js';
import { updateNotification } from '../services/updateNotification.js';
import { uploadCsvRecipients } from '../services/uploadCsvRecipients.js';

/** Admin endpoints for managing notifications. Thin: validate, call a service, shape the response. */
export function adminNotificationsController(deps: ServiceDeps) {
  const create: RouterMiddleware = async (ctx) => {
    const input = parseInput(createNotificationSchema, ctx.request.body);
    ctx.status = 201;
    ctx.body = await createNotification(deps, input);
  };

  const list: RouterMiddleware = async (ctx) => {
    const page = parseInput(listQuerySchema, ctx.query);
    ctx.body = { items: await listNotifications(deps.db, page) };
  };

  const get: RouterMiddleware = async (ctx) => {
    const { id } = parseInput(idParamSchema, ctx.params);
    const notification = await findNotificationById(deps.db, id);
    if (!notification) throw notFound(`Notification ${id} not found`);
    ctx.body = notification;
  };

  const update: RouterMiddleware = async (ctx) => {
    const { id } = parseInput(idParamSchema, ctx.params);
    const patch = parseInput(updateNotificationSchema, ctx.request.body);
    ctx.body = await updateNotification(deps, id, patch);
  };

  const activate: RouterMiddleware = async (ctx) => {
    const { id } = parseInput(idParamSchema, ctx.params);
    ctx.body = await activateNotification(deps, id);
  };

  const deactivate: RouterMiddleware = async (ctx) => {
    const { id } = parseInput(idParamSchema, ctx.params);
    ctx.body = await deactivateNotification(deps, id);
  };

  const remove: RouterMiddleware = async (ctx) => {
    const { id } = parseInput(idParamSchema, ctx.params);
    ctx.body = await removeNotification(deps, id);
  };

  /** Body is the raw CSV (Content-Type: text/csv), not a multipart upload. */
  const uploadRecipients: RouterMiddleware = async (ctx) => {
    const { id } = parseInput(idParamSchema, ctx.params);
    if (!ctx.is('text/csv') || typeof ctx.request.body !== 'string') {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the CSV as Content-Type: text/csv');
    }
    ctx.body = await uploadCsvRecipients(deps, id, ctx.request.body);
  };

  return { create, list, get, update, activate, deactivate, remove, uploadRecipients };
}
