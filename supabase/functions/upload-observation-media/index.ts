// Supabase Edge Function: server-side uploader for observation media.
//
// Why this exists: storage.objects RLS on this project is wedged in a
// way none of our policies fix (every INSERT 403s with "new row violates
// row-level security policy" even when the policy text obviously
// permits it). Rather than keep ping-ponging migrations, we upload via
// service-role on the server side. service_role has BYPASSRLS so the
// upload succeeds regardless of storage.objects policy state.
//
// Security model:
//   - Caller must send a valid user JWT (Authorization: Bearer ...).
//   - We re-query observations as the caller's role to verify they own
//     the parent observation. This means RLS on `observations` is the
//     gate — no policy duplication here.
//   - Only then do we use service_role to write to Storage.
//   - Bucket is whitelisted to observation-audio | observation-photos.
//
// Deploy:
//   supabase functions deploy upload-observation-media --no-verify-jwt=false
//
// Required secrets (already set on most projects):
//   SUPABASE_URL                    (auto-injected on Supabase hosted)
//   SUPABASE_ANON_KEY               (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY       (auto-injected — admin key)
//
// Client wire format:
//   POST  /functions/v1/upload-observation-media
//   Authorization: Bearer <user JWT>
//   Content-Type: multipart/form-data
//   Form fields:
//     bucket          'observation-audio' | 'observation-photos'
//     observationId   uuid
//     path            'obs-id/file-id.ext'  (full storage path)
//     contentType     mime type to write (e.g. 'audio/webm')
//     file            <Blob>                (the actual bytes)
//   Response: { path: string }  on success
//             { error: string } on failure

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const ALLOWED_BUCKETS = new Set(['observation-audio', 'observation-photos']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1. Verify the user. We do this by creating a supabase client with
  //    the caller's JWT and asking who they are. If the JWT is missing
  //    or expired, getUser() returns an error.
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'missing_auth' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: 'invalid_token', detail: userErr?.message }, 401);
  }
  const userId = userData.user.id;

  // 2. Parse multipart body.
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return json({ error: 'invalid_form', detail: (e as Error).message }, 400);
  }

  const bucket = String(form.get('bucket') ?? '');
  const observationId = String(form.get('observationId') ?? '');
  const path = String(form.get('path') ?? '');
  const contentType = String(form.get('contentType') ?? '');
  const file = form.get('file');

  if (!ALLOWED_BUCKETS.has(bucket)) return json({ error: 'bad_bucket' }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(observationId)) {
    return json({ error: 'bad_observation_id' }, 400);
  }
  if (!path || path.includes('..') || !path.startsWith(`${observationId}/`)) {
    return json({ error: 'bad_path' }, 400);
  }
  if (!(file instanceof File) && !(file instanceof Blob)) {
    return json({ error: 'no_file' }, 400);
  }

  // 3. Verify ownership. RLS on `observations` already restricts what
  //    this caller can SELECT — if they can't see the row, they aren't
  //    the author and we deny. (Anyone in the same forest could read,
  //    but we further check author_id below to scope writes to authors.)
  const { data: obs, error: obsErr } = await userClient
    .from('observations')
    .select('id, author_id')
    .eq('id', observationId)
    .maybeSingle();
  if (obsErr) return json({ error: 'observation_lookup_failed', detail: obsErr.message }, 500);
  if (!obs) return json({ error: 'observation_not_found' }, 404);
  if (obs.author_id !== userId) return json({ error: 'not_author' }, 403);

  // 4. Upload with service-role. This bypasses storage.objects RLS.
  //    We strip codec params from the content type for buckets that
  //    have mime allow-lists (`audio/webm;codecs=opus` → `audio/webm`).
  const cleanType = contentType.split(';')[0]?.trim() || 'application/octet-stream';
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

  const { error: upErr } = await adminClient.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: cleanType,
    });
  if (upErr) {
    return json({ error: 'upload_failed', detail: upErr.message }, 500);
  }

  return json({ path });
});
