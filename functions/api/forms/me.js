import { errorResponse, jsonResponse, requireSession } from './utils.js';

export async function onRequestGet({ request, env }) {
  try {
    const session = await requireSession(request, env);
    if (!session) {
      return errorResponse(401, 'Unauthorized');
    }

    const { access } = session;
    return jsonResponse({
      success: true,
      email: session.email,
      expiresAt: session.expires_at,
      role: access.role,
      allSites: access.allSites,
      siteIds: access.siteIds,
      canManageAccess: access.role === 'owner',
    });
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to load session.');
  }
}
