// Legacy magic-link endpoint. Session-minting links were retired because
// executive roles must only be issued by the central credential flow.

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  return res.redirect(302, '/login.html?reason=magic_link_retired');
}
