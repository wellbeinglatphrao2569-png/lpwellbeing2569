import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImage } from '@/lib/serverAi';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, expectedDate, preferredProvider, preferredModel, providerHint } = body;
    const hint = String(preferredProvider || providerHint || 'auto').toLowerCase();
    if (!imageBase64) return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    if (!expectedDate) return NextResponse.json({ error: 'expectedDate is required' }, { status: 400 });
    // provider mapping
    let providerHintNorm = hint;
    if (preferredModel && String(preferredModel).includes('gemma')) providerHintNorm = 'openrouter2';
    const result = await analyzeStepsImage(imageBase64, expectedDate, providerHintNorm);
    return NextResponse.json(result);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes('429')) return NextResponse.json({ error: msg }, { status: 429 });
    if (msg.includes('GEMINI') || msg.includes('OPENROUTER')) return NextResponse.json({ error: msg }, { status: 500 });
    console.error('image-analyze error:', e);
    return NextResponse.json({ error: msg || 'Internal server error' }, { status: 502 });
  }
}
