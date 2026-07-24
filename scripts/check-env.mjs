// Verify all .env values in one go: node scripts/check-env.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
  } catch {
    console.error('✗ .env bulunamadı');
    process.exit(1);
  }
}
loadEnv(resolve(process.cwd(), '.env'));

const results = [];
const ok = (n, msg) => results.push(`✓ ${n}${msg ? ` — ${msg}` : ''}`);
const fail = (n, msg) => results.push(`✗ ${n} — ${msg}`);

const {
  EXPO_PUBLIC_SUPABASE_URL: url,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  SUPABASE_DB_URL: dbUrl,
  ANTHROPIC_API_KEY: claude,
} = process.env;

// 1) Supabase URL + anon key → auth health endpoint
if (!url || !anon) fail('SUPABASE_URL/ANON_KEY', 'boş');
else {
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } });
    r.ok ? ok('SUPABASE_URL + ANON_KEY', 'auth health OK') : fail('ANON_KEY', `HTTP ${r.status}`);
  } catch (e) {
    fail('SUPABASE_URL', e.message);
  }
}

// 2) service_role → REST erişimi (tablo olmasa da 200/404 döner, 401 ise key yanlış)
if (!service) fail('SERVICE_ROLE_KEY', 'boş');
else {
  try {
    const r = await fetch(`${url}/rest/v1/languages?select=code&limit=1`, {
      headers: { apikey: service, authorization: `Bearer ${service}` },
    });
    if (r.status === 401 || r.status === 403) fail('SERVICE_ROLE_KEY', `HTTP ${r.status}`);
    else ok('SERVICE_ROLE_KEY', r.ok ? 'REST OK (tablolar da mevcut)' : `REST OK (migration henüz yok: ${r.status})`);
  } catch (e) {
    fail('SERVICE_ROLE_KEY', e.message);
  }
}

// 3) DB URL → biçim kontrolü (gerçek bağlantı migration adımında test edilir)
if (!dbUrl) fail('SUPABASE_DB_URL', 'boş');
else if (!/^postgres(ql)?:\/\/.+:.+@.+:\d+\/\w+/.test(dbUrl)) fail('SUPABASE_DB_URL', 'biçim hatalı');
else if (dbUrl.includes('[YOUR-PASSWORD]')) fail('SUPABASE_DB_URL', 'şifre yerleştirilmemiş');
else ok('SUPABASE_DB_URL', 'biçim OK');

// 4) Anthropic key → models endpoint (ücretsiz çağrı)
if (!claude) fail('ANTHROPIC_API_KEY', 'boş');
else {
  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': claude, 'anthropic-version': '2023-06-01' },
    });
    r.ok ? ok('ANTHROPIC_API_KEY', 'API OK') : fail('ANTHROPIC_API_KEY', `HTTP ${r.status}`);
  } catch (e) {
    fail('ANTHROPIC_API_KEY', e.message);
  }
}

console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
