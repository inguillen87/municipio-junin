import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/006_grh_personas_review.sql', import.meta.url), 'utf8');

test('migration starts with executable SQL for the Neon preparer', () => {
  assert.match(sql, /^CREATE TABLE/u);
  assert.doesNotMatch(sql, /^--/u);
  assert.doesNotMatch(sql, /\$\$/u);
  assert.doesNotMatch(sql, /\bDO\s/u);
  assert.match(sql, /RETURNS TRIGGER AS E'/u);
  assert.match(sql, /\\073/u);
  const functionBodies = [...sql.matchAll(/RETURNS TRIGGER AS E'([\s\S]*?)' LANGUAGE plpgsql;/gu)]
    .map(match => match[1]);
  assert.ok(functionBodies.length >= 10);
  for (const body of functionBodies) {
    assert.doesNotMatch(body, /;/u);
    assert.match(body, /\\073/u);
    const decoded = body.replaceAll("''", "'").replaceAll('\\073', ';');
    assert.match(decoded, /END;$/u);
  }
});

test('Neon statement splitting cannot detach COMMENT literals', () => {
  assert.doesNotMatch(sql, /COMMENT ON[^;\r\n]+(?:\r?\n)\s*'/u);
  const commentLiterals = [...sql.matchAll(/COMMENT ON[^\r\n]*? IS '([^']*)';/gu)]
    .map(match => match[1]);
  assert.equal(commentLiterals.length, 4);
  for (const literal of commentLiterals) assert.doesNotMatch(literal, /;/u);
});

test('S16B migration owns exactly four private tenant-bound review tables', () => {
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gu)].map(match => match[1]);
  assert.deepEqual(tables, [
    'grh_personas_review_runs',
    'grh_personas_review_cases',
    'grh_personas_review_options',
    'grh_personas_review_events',
  ]);
  for (const table of tables) assert.match(sql, new RegExp(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`, 'u'));
  assert.doesNotMatch(sql, /display_name|birth_date\s+(?:DATE|TEXT)|\bcuil\s+(?:TEXT|VARCHAR)|\bdni\s+(?:TEXT|VARCHAR)/iu);
  assert.match(sql, /evidence_envelope\s+JSONB NOT NULL/gu);
});

test('schema is future-source compatible while prohibiting automatic approval', () => {
  for (const value of [2349, 2185, 1699, 157, 493, 23]) {
    assert.doesNotMatch(sql, new RegExp(`(?:count|total)[^\n]*=\\s*${value}`, 'u'));
  }
  assert.match(sql, /candidate_case_count \+ ambiguous_case_count \+ unmatched_case_count = total_case_count/u);
  assert.match(sql, /auto_approved_count = 0/u);
  assert.match(sql, /requires_manual_check = TRUE/u);
  assert.match(sql, /evidence_policy_version = 'grh-personas-review-evidence-v2'/u);
  assert.doesNotMatch(sql, /grh-personas-review-evidence-v1/u);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_runs_one_ready_key[\s\S]*WHERE status = 'READY'/u);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS grh_personas_review_runs_contract_check[\s\S]*ADD CONSTRAINT grh_personas_review_runs_contract_check CHECK[\s\S]*evidence_policy_version = 'grh-personas-review-evidence-v2'/u);
});

test('decisions are same-case, target-unique, optimistic, idempotent and append-only', () => {
  assert.match(sql, /grh_personas_review_cases_selected_option_fkey/u);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS grh_personas_review_cases_selected_option_fkey/u);
  assert.match(sql, /REFERENCES grh_personas_review_options\(tenant_id, run_id, case_key, option_key, personas_ref\)/u);
  assert.match(sql, /grh_personas_review_cases_approved_target_key[\s\S]*WHERE status = 'APPROVED'/u);
  assert.match(sql, /grh_personas_review_events_command_key[\s\S]*\(tenant_id, command_id\)/u);
  assert.match(sql, /result_version = expected_version \+ 1/u);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON grh_personas_review_events/u);
  assert.match(sql, /BEFORE TRUNCATE ON grh_personas_review_events/u);
  assert.match(sql, /purpose = 'IDENTITY_LINKAGE_REVIEW'/u);
  assert.match(sql, /correlation_id\s+UUID NOT NULL/u);
  assert.match(sql, /from_status IN \('PENDING', 'DEFERRED'\)/u);
  assert.doesNotMatch(sql, /from_status IN \('PENDING', 'DEFERRED', 'APPROVED', 'REJECTED'\)/u);
  assert.match(sql, /ALTER TABLE grh_personas_review_events[\s\S]*DROP CONSTRAINT IF EXISTS grh_personas_review_events_contract_check[\s\S]*ADD CONSTRAINT grh_personas_review_events_contract_check CHECK[\s\S]*from_status IN \('PENDING', 'DEFERRED'\)/u);
});

test('user references use the live primary key and enforce tenant ownership in triggers', () => {
  assert.match(sql, /grh_personas_review_cases_decider_fkey\s+FOREIGN KEY \(decided_by_user_id\)\s+REFERENCES users\(id\)/u);
  assert.match(sql, /grh_personas_review_events_actor_fkey\s+FOREIGN KEY \(actor_user_id\)\s+REFERENCES users\(id\)/u);
  assert.doesNotMatch(sql, /REFERENCES users\("tenantId", id\)/u);
  assert.doesNotMatch(sql, /(?:CREATE|ALTER)[\s\S]{0,80}(?:UNIQUE|PRIMARY)[\s\S]{0,80}(?:ON\s+)?users/iu);
  assert.match(sql, /NEW\.decided_by_user_id IS NOT NULL[\s\S]*id = NEW\.decided_by_user_id[\s\S]*"tenantId" = NEW\.tenant_id[\s\S]*role IN \(''TENANT_ADMIN''::"Role", ''INTENDENTE''::"Role"\)[\s\S]*active = TRUE/u);
  assert.match(sql, /UPDATE OF[\s\S]*decided_by_user_id, tenant_id ON grh_personas_review_cases/u);
  assert.match(sql, /id = NEW\.actor_user_id[\s\S]*"tenantId" = NEW\.tenant_id[\s\S]*role = NEW\.actor_role[\s\S]*role IN \(''TENANT_ADMIN''::"Role", ''INTENDENTE''::"Role"\)[\s\S]*active = TRUE/u);
  assert.match(sql, /grh_personas_review_events_validate_conflict_approval[\s\S]*BEFORE INSERT ON grh_personas_review_events/u);
});

test('encrypted evidence has an exact AES-GCM envelope and rejects plaintext extras', () => {
  for (const constraint of [
    'grh_personas_review_cases_envelope_check',
    'grh_personas_review_options_envelope_check',
  ]) {
    const start = sql.indexOf(`ADD CONSTRAINT ${constraint}`);
    assert.notEqual(start, -1);
    const fragment = sql.slice(start, start + 1900);
    assert.match(fragment, /evidence_envelope \?& ARRAY\[[\s\S]*'schemaVersion'[\s\S]*'iv'[\s\S]*'ciphertext'[\s\S]*'tag'/u);
    assert.match(fragment, /evidence_envelope - ARRAY\[[\s\S]*'schemaVersion'[\s\S]*'ciphertext'[\s\S]*'tag'[\s\S]*\]\) = '\{\}'::jsonb/u);
    assert.doesNotMatch(fragment, /jsonb_object_length/u);
    assert.match(fragment, /evidence_envelope ->> 'iv' ~ '\^\[A-Za-z0-9_-\]\{16\}\$'/u);
    assert.match(fragment, /evidence_envelope ->> 'ciphertext' ~ '\^\[A-Za-z0-9_-\]\+\$'/u);
    assert.match(fragment, /length\(evidence_envelope ->> 'ciphertext'\) BETWEEN 2 AND 10923/u);
    assert.match(fragment, /length\(evidence_envelope ->> 'ciphertext'\) % 4 <> 1/u);
    assert.match(fragment, /% 4 = 2[\s\S]*right\(evidence_envelope ->> 'ciphertext', 1\) ~ '\^\[AQgw\]\$'/u);
    assert.match(fragment, /% 4 = 3[\s\S]*right\(evidence_envelope ->> 'ciphertext', 1\) ~ '\^\[AEIMQUYcgkosw048\]\$'/u);
    assert.match(fragment, /evidence_envelope ->> 'tag' ~ '\^\[A-Za-z0-9_-\]\{21\}\[AQgw\]\$'/u);
  }
});

test('negative direct SQL paths cannot mutate publication or detach a decision from its event', () => {
  assert.match(sql, /grh_personas_review_runs_guard_immutability[\s\S]*OLD\.status <> ''READY''[\s\S]*NEW\.status <> ''RETIRED''[\s\S]*to_jsonb\(NEW\) - ''status''/u);
  assert.match(sql, /grh_personas_review_cases_guard_immutability[\s\S]*to_jsonb\(NEW\) - ARRAY\[[\s\S]*NEW\.version <> OLD\.version \+ 1/u);
  assert.match(sql, /TG_OP = ''INSERT''[\s\S]*NEW\.status <> ''PENDING''[\s\S]*NEW\.version <> 1[\s\S]*new review cases must start pending without a decision/u);
  assert.match(sql, /a review run with decisions cannot be retired/u);
  assert.match(sql, /grh_personas_review_options_guard_immutability[\s\S]*BEFORE INSERT OR UPDATE OR DELETE ON grh_personas_review_options/u);
  for (const table of ['runs', 'cases', 'options']) {
    assert.match(sql, new RegExp(`grh_personas_review_${table}_no_truncate[\\s\\S]*BEFORE TRUNCATE ON grh_personas_review_${table}`, 'u'));
  }
  assert.match(sql, /CREATE CONSTRAINT TRIGGER grh_personas_review_cases_require_coherent_event[\s\S]*DEFERRABLE INITIALLY DEFERRED/u);
  assert.match(sql, /event\.expected_version = OLD\.version[\s\S]*event\.result_version = NEW\.version[\s\S]*event\.from_status = OLD\.status[\s\S]*event\.to_status = NEW\.status/u);
  assert.match(sql, /coherent_events <> 1[\s\S]*every review case transition requires exactly one coherent event/u);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER grh_personas_review_events_require_coherent_case[\s\S]*DEFERRABLE INITIALLY DEFERRED/u);
  assert.match(sql, /review_case\.version = NEW\.result_version[\s\S]*review_case\.status = NEW\.to_status[\s\S]*review_case\.decided_by_user_id = NEW\.actor_user_id/u);
  assert.match(sql, /grh_personas_review_events_case_version_key[\s\S]*\(tenant_id, run_id, case_key, result_version\)/u);
  assert.match(sql, /review event history must form a continuous version chain/u);
  assert.match(sql, /PERFORM 1 FROM users[\s\S]*role = NEW\.actor_role[\s\S]*active = TRUE[\s\S]*FOR SHARE[\s\S]*IF NOT FOUND THEN[\s\S]*review actor changed before the decision committed/u);
  assert.match(sql, /review events require a ready publication run/u);
  assert.match(sql, /OLD\.status NOT IN \(''PENDING'', ''DEFERRED''\)[\s\S]*terminal review cases cannot transition without an explicit reopen workflow/u);
});

test('one deferred run seal and serialized capacity guards preserve exact publication contents', () => {
  assert.match(sql, /grh_personas_review_validate_publication_counts[\s\S]*observed_cases <> expected_cases[\s\S]*observed_options <> expected_options/u);
  assert.match(sql, /WHERE tenant_id = NEW\.tenant_id AND run_id = NEW\.run_id AND status = ''READY''/u);
  assert.match(sql, /GROUP BY review_case\.case_key, review_case\.kind, review_case\.option_count[\s\S]*COUNT\(review_option\.option_key\) <> review_case\.option_count/u);
  assert.match(sql, /review_case\.kind = ''CANDIDATE'' AND COUNT\(review_option\.option_key\) <> 1/u);
  assert.match(sql, /review_case\.kind = ''AMBIGUOUS'' AND COUNT\(review_option\.option_key\) < 1/u);
  assert.match(sql, /review_case\.kind = ''UNMATCHED'' AND COUNT\(review_option\.option_key\) <> 0/u);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_options_case_rank_key[\s\S]*\(tenant_id, run_id, case_key, rank\)/u);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER grh_personas_review_runs_validate_counts[\s\S]*AFTER INSERT ON grh_personas_review_runs[\s\S]*DEFERRABLE INITIALLY DEFERRED/u);
  assert.doesNotMatch(sql, /CREATE CONSTRAINT TRIGGER grh_personas_review_(?:cases|options)_validate_counts/u);
  assert.match(sql, /DROP TRIGGER IF EXISTS grh_personas_review_cases_validate_counts[\s\S]*DROP TRIGGER IF EXISTS grh_personas_review_options_validate_counts/u);
  assert.match(sql, /grh_personas_review_cases_guard_immutability[\s\S]*total_case_count[\s\S]*FOR UPDATE[\s\S]*observed_case_count >= declared_case_capacity[\s\S]*review case capacity is already sealed/u);
  assert.match(sql, /grh_personas_review_options_guard_immutability[\s\S]*total_option_count[\s\S]*FOR UPDATE[\s\S]*option_count INTO declared_case_option_capacity[\s\S]*FOR SHARE/u);
  assert.match(sql, /observed_run_option_count >= declared_run_option_capacity[\s\S]*observed_case_option_count >= declared_case_option_capacity[\s\S]*review option capacity is already sealed/u);
});

test('document-conflict approvals require manual source confirmation at the database boundary', () => {
  assert.match(sql, /grh_personas_review_cases_conflict_approval_check/u);
  assert.match(sql, /status <> 'APPROVED'[\s\S]*document_conflict = FALSE[\s\S]*birth_date_conflict = FALSE[\s\S]*priority <> 'DOCUMENT_CONFLICT'[\s\S]*reason_code = 'MANUAL_SOURCE_CHECK_CONFIRMED'/u);
  assert.match(sql, /grh_personas_review_cases_validate_conflict_approval[\s\S]*selected_option_requires_manual = TRUE/u);
  assert.match(sql, /grh_personas_review_options_validate_conflict_update[\s\S]*NEW\.evidence_level = ''CONFLICT''/u);
  assert.match(sql, /grh_personas_review_events_validate_conflict_approval[\s\S]*NEW\.command = ''APPROVE''[\s\S]*NEW\.reason_code <> ''MANUAL_SOURCE_CHECK_CONFIRMED''/u);
  assert.match(sql, /case_birth_date_conflict = TRUE[\s\S]*selected_option_requires_manual = TRUE/u);
  assert.match(sql, /BEFORE INSERT ON grh_personas_review_events/u);
});

test('DNI-only approvals without name or birth support require manual confirmation in every SQL path', () => {
  const dniOnlyRule = /match_method IN \(''UNIQUE_DNI_BACKUP'', ''DUPLICATE_DNI_NAME''\)[\s\S]*dni_evidence = ''MATCH''[\s\S]*cuil_evidence <> ''MATCH''[\s\S]*name_evidence <> ''MATCH''[\s\S]*birth_date_evidence <> ''MATCH''/u;
  assert.match(sql, dniOnlyRule);
  assert.match(sql, /NEW\.match_method IN \(''UNIQUE_DNI_BACKUP'', ''DUPLICATE_DNI_NAME''\)[\s\S]*NEW\.dni_evidence = ''MATCH''[\s\S]*NEW\.cuil_evidence <> ''MATCH''[\s\S]*NEW\.name_evidence <> ''MATCH''[\s\S]*NEW\.birth_date_evidence <> ''MATCH''/u);
  assert.match(sql, /UPDATE OF evidence_level, match_method, cuil_evidence, dni_evidence,[\s\S]*name_evidence, birth_date_evidence ON grh_personas_review_options/u);
  assert.match(sql, /options\.match_method IN \(''UNIQUE_DNI_BACKUP'', ''DUPLICATE_DNI_NAME''\)[\s\S]*options\.dni_evidence = ''MATCH''[\s\S]*options\.cuil_evidence <> ''MATCH''[\s\S]*options\.name_evidence <> ''MATCH''[\s\S]*options\.birth_date_evidence <> ''MATCH''/u);
  assert.match(sql, /NEW\.reason_code <> ''MANUAL_SOURCE_CHECK_CONFIRMED''/u);
});
