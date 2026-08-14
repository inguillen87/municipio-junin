import { cors, noStore, requireAuth } from '../lib/auth.js';
import accessPolicy from '../../shared/access-policy.cjs';
import releaseTruthContract from '../../shared/release-truth-contract.cjs';
import tenantPresentationPolicy from '../../shared/tenant-presentation-policy.cjs';
import publishedDemoPolicy from '../../shared/published-demo-policy.cjs';
import { sessionResponseUser } from '../lib/one-click-session.js';

const { ACCESS_POLICY_VERSION, getSessionAccessForUser } = accessPolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const { resolveTenantPresentation } = tenantPresentationPolicy;
const { resolvePublishedDemoProfileByEmail } = publishedDemoPolicy;

export default async function handler(req, res) {
  res.setHeader(HEADER_NAME, API_CONTRACTS['/api/auth/me']);
  cors(req, res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const tokenUser = await requireAuth(req, res);
  if (!tokenUser) return;
  const sessionAccess = getSessionAccessForUser(tokenUser);
  if (!sessionAccess) return res.status(403).json({ error: 'Perfil de inicio no habilitado' });
  const publishedProfile = resolvePublishedDemoProfileByEmail(tokenUser.email);
  const responseUser = sessionResponseUser(tokenUser, {
    publishedProfile,
    exposePublishedSessionId: true,
  });
  if (!responseUser) return res.status(403).json({ error: 'Perfil de inicio no habilitado' });
  return res.status(200).json({
    user: {
      id: responseUser.id,
      email: responseUser.email,
      name: responseUser.name,
      role: tokenUser.role,
      tenantId: tokenUser.tenantId,
      tenant: tokenUser.tenant,
      capabilities: responseUser.capabilities,
      accessPolicyVersion: ACCESS_POLICY_VERSION,
      homeProfile: responseUser.homeProfile,
      presentation: resolveTenantPresentation(tokenUser.tenant),
    },
  });
}
