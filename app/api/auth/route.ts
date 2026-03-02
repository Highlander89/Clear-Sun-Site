import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const { password } = await req.json();
  if (password === process.env.DASHBOARD_PASSWORD) {
    const response = NextResponse.json({ ok: true });
    const cookieStore = await cookies();
    cookieStore.set('clearsun_session', process.env.SESSION_SECRET!, {
      httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  }
  return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
}
