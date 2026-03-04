import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';

function ok(message: string, data?: unknown) {
  return NextResponse.json({ ok: true, message, data });
}

function fail(message: string, data?: unknown) {
  return NextResponse.json({ ok: false, message, data }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const { action } = await req.json();
    if (!action) return fail('missing action');

    if (action === 'sendAlertNow') {
      fs.writeFileSync('/home/ubuntu/clearsun-wa/.send-alert-now', '1');
      return ok('Triggered manual alert (bot will post shortly).');
    }

    if (action === 'restartBot') {
      execSync('pm2 restart clearsun-wa', { stdio: 'pipe' });
      return ok('Restarted clearsun-wa');
    }

    if (action === 'restartDashboard') {
      execSync('pm2 restart clearsun-dashboard', { stdio: 'pipe' });
      return ok('Restarted clearsun-dashboard');
    }

    if (action === 'runDriftCheck') {
      const out = execSync('node /home/ubuntu/clearsun-wa/scripts/drift-check.js', { encoding: 'utf8' });
      return ok('Drift-check completed', { output: out.slice(-8000) });
    }

    if (action === 'runQaSmoke') {
      const out = execSync('bash /home/ubuntu/clearsun-wa/scripts/qa-smoke.sh', { encoding: 'utf8' });
      return ok('QA smoke completed', { output: out.slice(-8000) });
    }

    if (action === 'postTemplates') {
      // Post templates via the bot by appending a control file the bot watches.
      fs.writeFileSync('/home/ubuntu/clearsun-wa/.post-templates-now', '1');
      return ok('Template post requested (bot will post to WA group shortly).');
    }

    return fail('Unknown action: ' + action);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
