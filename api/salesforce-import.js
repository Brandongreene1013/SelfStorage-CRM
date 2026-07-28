import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { imageSize } from 'image-size';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_SCREENSHOTS,
  MAX_TOTAL_IMAGE_BYTES,
  SALESFORCE_DRAFT_TOOL_SCHEMA,
  scoreDuplicateCandidates,
  validateAndNormalizeDraft,
  validateApproval,
} from './_salesforceImport.js';
import {
  SALESFORCE_EXTRACTION_PROMPT,
  SALESFORCE_EXTRACTION_PROMPT_VERSION,
  SALESFORCE_IMPORT_SCHEMA_VERSION,
} from './_salesforceExtractionPrompt.js';

export const maxDuration = 60;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co';
const BUCKET = 'salesforce-imports';
const MODEL = process.env.SALESFORCE_VISION_MODEL || 'claude-sonnet-4-6';
const ENABLED = process.env.SALESFORCE_SCREENSHOT_IMPORT_ENABLED === 'true';

let serviceClient;
function supabase() {
  if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('Screenshot import is not configured.');
  if (!serviceClient) {
    serviceClient = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function safeError(error) {
  const message = String(error?.message || 'Request failed.');
  if (/not configured|migration|relation .* does not exist|bucket/i.test(message)) {
    return 'Salesforce screenshot import is not configured yet.';
  }
  if (/timeout|timed out|abort/i.test(message)) return 'The analysis timed out. Your screenshots are safe; try again.';
  if (/vision provider|anthropic|model did not return/i.test(message)) {
    return 'The screenshots could not be analyzed. They are still saved; try again.';
  }
  if (/duplicate/i.test(message)) return 'That screenshot was already added to this import.';
  const allowed = [
    'Import session', 'Screenshot', 'screenshot', 'This import', 'Use a PNG',
    'Each screenshot', 'The combined', 'Paste at least', 'Invalid screenshot',
    'A maximum', 'Resolve the review', 'Select at least', 'Facility',
  ];
  return allowed.some(prefix => message.startsWith(prefix))
    ? message.slice(0, 300)
    : 'The screenshot import request could not be completed. Please try again.';
}

function json(res, status, payload) {
  res.setHeader('cache-control', 'no-store');
  return res.status(status).json(payload);
}

async function addEvent(sb, importId, eventType, eventData = {}) {
  await sb.from('salesforce_screenshot_import_events').insert({
    import_id: importId,
    event_type: eventType,
    event_data: eventData,
  });
}

async function authorizedSession(sb, importId, capabilityToken, { lockStatus } = {}) {
  if (!importId || !capabilityToken) throw new Error('Import session credentials are missing.');
  let query = sb.from('salesforce_screenshot_imports').select('*')
    .eq('id', importId)
    .eq('capability_hash', tokenHash(capabilityToken));
  if (lockStatus) query = query.in('status', lockStatus);
  const { data, error } = await query.single();
  if (error || !data) throw new Error('Import session not found or expired.');
  if (data.expires_at && Date.parse(data.expires_at) < Date.now()) throw new Error('Import session expired.');
  return data;
}

async function sessionImages(sb, importId) {
  const { data, error } = await sb.from('salesforce_screenshot_import_images')
    .select('*')
    .eq('import_id', importId)
    .is('deleted_at', null)
    .order('sequence_number');
  if (error) throw error;
  return data || [];
}

async function presentSession(sb, session) {
  const images = await sessionImages(sb, session.id);
  const presentedImages = await Promise.all(images.map(async image => {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(image.storage_path, 300);
    return {
      id: image.id,
      sequenceNumber: image.sequence_number,
      mimeType: image.mime_type,
      width: image.width,
      height: image.height,
      fileSize: image.file_size,
      status: image.status,
      previewUrl: data?.signedUrl || null,
    };
  }));
  return {
    id: session.id,
    status: session.status,
    sourceMethod: session.source_method,
    screenshotCount: session.screenshot_count,
    draft: session.user_edited_draft || session.validated_draft || null,
    duplicateResults: session.duplicate_results || null,
    overallConfidence: session.overall_confidence,
    importResult: session.import_result || null,
    errorMessage: session.error_message || null,
    expiresAt: session.expires_at,
    images: presentedImages,
  };
}

function detectedMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

async function loadDuplicateSnapshot(sb) {
  const [properties, contacts, companies] = await Promise.all([
    sb.from('properties').select('*').limit(5000),
    sb.from('contacts').select('*').limit(10000),
    sb.from('ownership_groups').select('*').limit(5000),
  ]);
  for (const result of [properties, contacts, companies]) if (result.error) throw result.error;
  return {
    properties: properties.data || [],
    contacts: contacts.data || [],
    companies: companies.data || [],
  };
}

async function analyzeScreenshots(sb, session, images) {
  const content = [];
  for (const image of images) {
    const { data, error } = await sb.storage.from(BUCKET).download(image.storage_path);
    if (error || !data) throw error || new Error('Screenshot could not be loaded.');
    const bytes = Buffer.from(await data.arrayBuffer());
    content.push({ type: 'text', text: `Screenshot ID: ${image.id} (Screenshot ${image.sequence_number})` });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mime_type,
        data: bytes.toString('base64'),
      },
    });
  }
  content.push({
    type: 'text',
    text: `Analyze these ${images.length} Salesforce screenshot(s) as one import session. The required importSessionId is ${session.id}.`,
  });

  // Abort before Vercel's maxDuration (60s) hard-kills the function. A hard kill
  // leaves the session stuck in 'analyzing'; an abort throws here so the caller's
  // catch can record a 'failed' status the user can retry from.
  const abort = new AbortController();
  const abortTimer = setTimeout(() => abort.abort(), 50_000);
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'x-api-key': process.env.ANTHROPIC_KEY || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3500,
        system: SALESFORCE_EXTRACTION_PROMPT,
        messages: [{ role: 'user', content }],
        tools: [{
          name: 'return_salesforce_import_draft',
          description: 'Return the complete structured Salesforce screenshot extraction.',
          input_schema: SALESFORCE_DRAFT_TOOL_SCHEMA,
        }],
        tool_choice: { type: 'tool', name: 'return_salesforce_import_draft' },
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('The analysis timed out. Your screenshots are safe; try again.');
    throw error;
  } finally {
    clearTimeout(abortTimer);
  }
  if (!response.ok) {
    const providerError = await response.text();
    console.error('Salesforce vision provider failure', response.status, providerError.slice(0, 500));
    throw new Error('Vision provider failed.');
  }
  const payload = await response.json();
  const toolUse = payload.content?.find(block => block.type === 'tool_use' && block.name === 'return_salesforce_import_draft');
  if (!toolUse?.input) throw new Error('The vision model did not return a valid structured draft.');
  const method = session.source_method === 'clipboard_screenshot' ? 'clipboard_screenshot' : 'uploaded_screenshot';
  const draft = validateAndNormalizeDraft(toolUse.input, {
    importSessionId: session.id,
    screenshotCount: images.length,
    method,
  });
  const duplicateCandidates = scoreDuplicateCandidates(draft, await loadDuplicateSnapshot(sb));
  return {
    draft: { ...draft, duplicateCandidates },
    raw: toolUse.input,
    duplicateCandidates,
  };
}

function ensureEnabled() {
  if (!ENABLED) throw new Error('Salesforce screenshot import is not enabled.');
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (req.query?.action === 'config') {
      let ready = false;
      if (ENABLED) {
        try {
          const { error } = await supabase().from('salesforce_screenshot_imports').select('id', { head: true, count: 'exact' }).limit(1);
          ready = !error;
        } catch {
          ready = false;
        }
      }
      return json(res, 200, {
        enabled: ENABLED && ready,
        maxScreenshots: MAX_SCREENSHOTS,
        maxImageBytes: MAX_IMAGE_BYTES,
        acceptedTypes: ALLOWED_IMAGE_TYPES,
      });
    }
    if (req.query?.action === 'cleanup') {
      const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) {
        return json(res, 401, { error: 'Unauthorized.' });
      }
      try {
        const sb = supabase();
        const { data: expired, error } = await sb.from('salesforce_screenshot_imports')
          .select('id, storage_paths')
          .lt('expires_at', new Date().toISOString())
          .not('status', 'in', '("imported","rejected","expired")')
          .limit(200);
        if (error) throw error;
        const paths = (expired || []).flatMap(item => Array.isArray(item.storage_paths) ? item.storage_paths : []);
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
        const ids = (expired || []).map(item => item.id);
        if (ids.length) {
          await sb.from('salesforce_screenshot_import_images')
            .update({ deleted_at: new Date().toISOString(), status: 'deleted' })
            .in('import_id', ids)
            .is('deleted_at', null);
          await sb.from('salesforce_screenshot_imports')
            .update({ status: 'expired', screenshot_count: 0, storage_paths: [], updated_at: new Date().toISOString() })
            .in('id', ids);
        }
        return json(res, 200, { expiredImports: ids.length, deletedScreenshots: paths.length });
      } catch (error) {
        console.error('Salesforce import cleanup failed', safeError(error));
        return json(res, 500, { error: 'Screenshot cleanup failed.' });
      }
    }
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  try {
    ensureEnabled();
    const sb = supabase();
    const action = req.body?.action;

    if (action === 'create') {
      const capabilityToken = randomToken();
      const method = req.body?.method === 'uploaded_screenshot' ? 'uploaded_screenshot' : 'clipboard_screenshot';
      const { data, error } = await sb.from('salesforce_screenshot_imports').insert({
        capability_hash: tokenHash(capabilityToken),
        source_method: method,
        status: 'collecting_screenshots',
        prompt_version: SALESFORCE_EXTRACTION_PROMPT_VERSION,
        schema_version: SALESFORCE_IMPORT_SCHEMA_VERSION,
      }).select('*').single();
      if (error) throw error;
      await addEvent(sb, data.id, 'session_created', { method });
      return json(res, 200, { capabilityToken, session: await presentSession(sb, data) });
    }

    const session = await authorizedSession(sb, req.body?.importId, req.body?.capabilityToken);

    if (action === 'load') return json(res, 200, { session: await presentSession(sb, session) });

    if (action === 'upload-url') {
      if (session.status !== 'collecting_screenshots') throw new Error('This import is no longer collecting screenshots.');
      const mimeType = String(req.body?.mimeType || '');
      const fileSize = Number(req.body?.fileSize);
      if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) throw new Error('Use a PNG, JPG, JPEG, or WEBP screenshot.');
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > MAX_IMAGE_BYTES) throw new Error('Each screenshot must be 4 MB or smaller.');
      const images = await sessionImages(sb, session.id);
      if (images.length >= MAX_SCREENSHOTS) throw new Error(`A maximum of ${MAX_SCREENSHOTS} screenshots can be added.`);
      if (images.reduce((sum, image) => sum + image.file_size, 0) + fileSize > MAX_TOTAL_IMAGE_BYTES) {
        throw new Error('The combined screenshot size must be 16 MB or smaller.');
      }
      const imageId = crypto.randomUUID();
      const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${session.id}/${imageId}.${extension}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error) throw error;
      return json(res, 200, { imageId, path, token: data.token });
    }

    if (action === 'confirm-image') {
      if (session.status !== 'collecting_screenshots') throw new Error('This import is no longer collecting screenshots.');
      const path = String(req.body?.path || '');
      const imageId = String(req.body?.imageId || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(imageId)) {
        throw new Error('Invalid screenshot identifier.');
      }
      if (!path.startsWith(`${session.id}/`)) throw new Error('Invalid screenshot path.');
      if (!path.includes(`/${imageId}.`)) throw new Error('Invalid screenshot path.');
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !data) throw error || new Error('Screenshot upload could not be verified.');
      const buffer = Buffer.from(await data.arrayBuffer());
      const mimeType = detectedMime(buffer);
      if (!mimeType || !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        await sb.storage.from(BUCKET).remove([path]);
        throw new Error('The uploaded file is not a supported image.');
      }
      if (buffer.length > MAX_IMAGE_BYTES) {
        await sb.storage.from(BUCKET).remove([path]);
        throw new Error('Each screenshot must be 4 MB or smaller.');
      }
      const dimensions = imageSize(buffer);
      if (!dimensions.width || !dimensions.height || dimensions.width < 320 || dimensions.height < 240 || dimensions.width > 12000 || dimensions.height > 12000) {
        await sb.storage.from(BUCKET).remove([path]);
        throw new Error('Screenshot dimensions are unsupported or too small to read.');
      }
      const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const existing = await sessionImages(sb, session.id);
      if (existing.some(image => image.image_hash === imageHash)) {
        await sb.storage.from(BUCKET).remove([path]);
        throw new Error('Duplicate screenshot.');
      }
      const { error: insertError } = await sb.from('salesforce_screenshot_import_images').insert({
        id: imageId,
        import_id: session.id,
        sequence_number: existing.length + 1,
        storage_path: path,
        image_hash: imageHash,
        mime_type: mimeType,
        width: dimensions.width,
        height: dimensions.height,
        file_size: buffer.length,
      });
      if (insertError) {
        await sb.storage.from(BUCKET).remove([path]);
        throw insertError;
      }
      await sb.from('salesforce_screenshot_imports').update({
        screenshot_count: existing.length + 1,
        image_hashes: [...existing.map(image => image.image_hash), imageHash],
        storage_paths: [...existing.map(image => image.storage_path), path],
        updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      await addEvent(sb, session.id, 'screenshot_pasted', { imageId: req.body?.imageId, sequenceNumber: existing.length + 1 });
      const refreshed = await authorizedSession(sb, session.id, req.body.capabilityToken);
      return json(res, 200, { session: await presentSession(sb, refreshed) });
    }

    if (action === 'remove-image') {
      if (session.status !== 'collecting_screenshots') throw new Error('Screenshots cannot be changed after analysis starts.');
      const images = await sessionImages(sb, session.id);
      const target = images.find(image => image.id === req.body?.imageId);
      if (!target) throw new Error('Screenshot not found.');
      await sb.storage.from(BUCKET).remove([target.storage_path]);
      await sb.from('salesforce_screenshot_import_images').update({ deleted_at: new Date().toISOString(), status: 'deleted' }).eq('id', target.id);
      const remaining = images.filter(image => image.id !== target.id);
      await Promise.all(remaining.map((image, index) => sb.from('salesforce_screenshot_import_images')
        .update({ sequence_number: index + 1 }).eq('id', image.id)));
      await sb.from('salesforce_screenshot_imports').update({
        screenshot_count: remaining.length,
        image_hashes: remaining.map(image => image.image_hash),
        storage_paths: remaining.map(image => image.storage_path),
        updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      await addEvent(sb, session.id, 'screenshot_removed', { imageId: target.id });
      const refreshed = await authorizedSession(sb, session.id, req.body.capabilityToken);
      return json(res, 200, { session: await presentSession(sb, refreshed) });
    }

    if (action === 'reorder') {
      if (session.status !== 'collecting_screenshots') throw new Error('Screenshots cannot be reordered after analysis starts.');
      const ids = Array.isArray(req.body?.imageIds) ? req.body.imageIds : [];
      const images = await sessionImages(sb, session.id);
      if (ids.length !== images.length || new Set(ids).size !== images.length || ids.some(id => !images.some(image => image.id === id))) {
        throw new Error('Invalid screenshot order.');
      }
      await Promise.all(ids.map((id, index) => sb.from('salesforce_screenshot_import_images').update({ sequence_number: index + 1 }).eq('id', id)));
      await addEvent(sb, session.id, 'screenshots_reordered', { imageIds: ids });
      const refreshed = await authorizedSession(sb, session.id, req.body.capabilityToken);
      return json(res, 200, { session: await presentSession(sb, refreshed) });
    }

    if (action === 'analyze') {
      // A previous analysis that was hard-killed mid-run (e.g. serverless timeout)
      // can leave the session wedged in 'analyzing'. Allow a retry once it is stale
      // so it is not stuck until the 24h expiry.
      const staleAnalyzing = session.status === 'analyzing'
        && Date.parse(session.updated_at || 0) < Date.now() - 90_000;
      if (session.status !== 'collecting_screenshots' && session.status !== 'failed' && !staleAnalyzing) {
        throw new Error('This import cannot be analyzed in its current state.');
      }
      const images = await sessionImages(sb, session.id);
      if (images.length < 1) throw new Error('Paste at least one Salesforce screenshot first.');
      await sb.from('salesforce_screenshot_imports').update({
        status: 'analyzing',
        error_code: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      await addEvent(sb, session.id, 'analysis_started', { screenshotCount: images.length });
      try {
        const extracted = await analyzeScreenshots(sb, session, images);
        await sb.from('salesforce_screenshot_imports').update({
          status: 'review_required',
          raw_model_response: extracted.raw,
          validated_draft: extracted.draft,
          user_edited_draft: extracted.draft,
          overall_confidence: extracted.draft.overallConfidence,
          duplicate_results: extracted.duplicateCandidates,
          model_provider: 'anthropic',
          model_name: MODEL,
          analyzed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', session.id);
        await addEvent(sb, session.id, 'analysis_completed', {
          warningCount: extracted.draft.warnings.length,
          duplicateCount: extracted.duplicateCandidates.facility.length
            + Object.values(extracted.duplicateCandidates.contacts).flat().length
            + Object.values(extracted.duplicateCandidates.companies).flat().length,
        });
      } catch (error) {
        await sb.from('salesforce_screenshot_imports').update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_code: 'analysis_failed',
          error_message: safeError(error),
          updated_at: new Date().toISOString(),
        }).eq('id', session.id);
        await addEvent(sb, session.id, 'analysis_failed', { code: 'analysis_failed' });
        throw error;
      }
      const refreshed = await authorizedSession(sb, session.id, req.body.capabilityToken);
      return json(res, 200, { session: await presentSession(sb, refreshed) });
    }

    if (action === 'save-draft') {
      if (session.status !== 'review_required') throw new Error('This import is not ready for editing.');
      const draft = validateAndNormalizeDraft(req.body?.draft, {
        importSessionId: session.id,
        screenshotCount: session.screenshot_count,
        method: session.source_method,
      });
      draft.duplicateCandidates = scoreDuplicateCandidates(draft, await loadDuplicateSnapshot(sb));
      await sb.from('salesforce_screenshot_imports').update({
        user_edited_draft: draft,
        duplicate_results: draft.duplicateCandidates,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      await addEvent(sb, session.id, 'draft_edited', { fieldCount: Object.keys(draft.facility || {}).length });
      const refreshed = await authorizedSession(sb, session.id, req.body.capabilityToken);
      return json(res, 200, { session: await presentSession(sb, refreshed) });
    }

    if (action === 'reject') {
      if (session.status === 'imported') throw new Error('A completed import cannot be cancelled.');
      const images = await sessionImages(sb, session.id);
      if (images.length) await sb.storage.from(BUCKET).remove(images.map(image => image.storage_path));
      await sb.from('salesforce_screenshot_import_images').update({ deleted_at: new Date().toISOString(), status: 'deleted' }).eq('import_id', session.id).is('deleted_at', null);
      await sb.from('salesforce_screenshot_imports').update({
        status: 'rejected',
        screenshot_count: 0,
        storage_paths: [],
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', session.id);
      await addEvent(sb, session.id, 'import_rejected');
      return json(res, 200, { ok: true });
    }

    if (action === 'commit') {
      if (session.status !== 'review_required' && session.status !== 'imported') throw new Error('This import is not ready for approval.');
      const draft = validateAndNormalizeDraft(req.body?.draft, {
        importSessionId: session.id,
        screenshotCount: session.screenshot_count,
        method: session.source_method,
      });
      draft.duplicateCandidates = scoreDuplicateCandidates(draft, await loadDuplicateSnapshot(sb));
      const validation = validateApproval(draft, req.body?.duplicateDecisions || {});
      if (!validation.valid) return json(res, 422, { error: 'Resolve the review issues before importing.', validationErrors: validation.errors });
      const idempotencyKey = String(req.body?.idempotencyKey || '');
      if (idempotencyKey.length < 16 || idempotencyKey.length > 200) throw new Error('Invalid approval key.');
      const { data, error } = await sb.rpc('commit_salesforce_screenshot_import', {
        p_import_id: session.id,
        p_capability_hash: tokenHash(req.body.capabilityToken),
        p_approved_draft: draft,
        p_duplicate_decisions: req.body?.duplicateDecisions || {},
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        await sb.from('salesforce_screenshot_imports').update({
          status: 'review_required',
          error_code: 'commit_failed',
          error_message: 'The import could not be completed. No CRM records were created.',
          updated_at: new Date().toISOString(),
        }).eq('id', session.id);
        await addEvent(sb, session.id, 'import_failed', { code: 'commit_failed' });
        throw error;
      }
      const images = await sessionImages(sb, session.id);
      if (images.length) {
        await sb.storage.from(BUCKET).remove(images.map(image => image.storage_path));
        await sb.from('salesforce_screenshot_import_images').update({ deleted_at: new Date().toISOString(), status: 'deleted' }).eq('import_id', session.id).is('deleted_at', null);
        await addEvent(sb, session.id, 'screenshots_deleted', { count: images.length });
      }
      const refreshed = await authorizedSession(sb, session.id, req.body.capabilityToken);
      return json(res, 200, { result: data, session: await presentSession(sb, refreshed) });
    }

    return json(res, 400, { error: 'Unknown action.' });
  } catch (error) {
    return json(res, 400, { error: safeError(error) });
  }
}
