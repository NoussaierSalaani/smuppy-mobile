/**
 * Business Services Delete (Soft Delete)
 * DELETE /businesses/my/services/{serviceId}
 * Owner only — sets is_active = false
 */

import { createBusinessHandler } from '../utils/create-business-handler';
import { isValidUUID } from '../utils/security';

const { handler } = createBusinessHandler({
  loggerName: 'business/services-delete',
  rateLimitPrefix: 'biz-svc-delete',
  rateLimitMax: 10,
  onAction: async ({ headers, user, db, event, log }) => {
    const serviceId = event.pathParameters?.serviceId;
    if (!serviceId || !isValidUUID(serviceId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid serviceId is required' }) };
    }

    // Soft delete — set is_active = false (verify ownership)
    const result = await db.query(
      `UPDATE business_services SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND business_id = $2
       RETURNING id`,
      [serviceId, user.id]
    );

    if (result.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Service not found' }) };
    }

    log.info('Business service deactivated', { serviceId });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  },
});

export { handler };
