/**
 * Spanish (es) - Smuppy App
 * Organized by feature namespaces
 */

import common from './common.json';
import auth from './auth.json';
import disputes from './disputes.json';
import sessions from './sessions.json';
import payments from './payments.json';
import profile from './profile.json';
import feed from './feed.json';
import messages from './messages.json';
import notifications from './notifications.json';
import settings from './settings.json';
import live from './live.json';
import peaks from './peaks.json';
import errors from './errors.json';
import validation from './validation.json';
import onboarding from './onboarding.json';

export default {
  ...common,
  ...auth,
  ...disputes,
  ...sessions,
  ...payments,
  ...profile,
  ...feed,
  ...messages,
  ...notifications,
  ...settings,
  ...live,
  ...peaks,
  ...errors,
  ...validation,
  ...onboarding,
};
