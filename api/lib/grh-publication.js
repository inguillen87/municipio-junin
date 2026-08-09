const UPSERT_ARTIFACT_SQL = `INSERT INTO grh_artifacts
  (tenant_id, artifact, schema_version, snapshot_as_of, source_sha256, payload, active, updated_at)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE, NOW())
ON CONFLICT (tenant_id, artifact) DO UPDATE SET
  schema_version = EXCLUDED.schema_version,
  snapshot_as_of = EXCLUDED.snapshot_as_of,
  source_sha256 = EXCLUDED.source_sha256,
  payload = EXCLUDED.payload,
  active = TRUE,
  updated_at = NOW()`;

export async function publishGrhArtifactBundle(client, tenantId, profile, semantic, provenance) {
  if (!client || typeof client.query !== 'function') throw new TypeError('PoolClient GRH inválido');
  if (!tenantId) throw new TypeError('Tenant GRH requerido');
  if (!provenance || profile?.source !== provenance.source ||
      profile?.sha256 !== provenance.sha256 ||
      profile?.snapshot_as_of !== provenance.snapshotAsOf ||
      semantic?.source?.file !== provenance.source ||
      semantic?.source?.sha256 !== provenance.sha256 ||
      semantic?.source?.snapshot_as_of !== provenance.snapshotAsOf) {
    throw new Error('Proveniencia GRH no verificada');
  }

  await client.query('BEGIN');
  try {
    for (const [artifact, payload] of [['profile', profile], ['semantic', semantic]]) {
      await client.query(UPSERT_ARTIFACT_SQL, [
        tenantId,
        artifact,
        payload.schema_version,
        provenance.snapshotAsOf,
        provenance.sha256,
        JSON.stringify(payload),
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
