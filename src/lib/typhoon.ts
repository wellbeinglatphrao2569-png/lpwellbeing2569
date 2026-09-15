/**
 * Typhoon OCR client — ADAPTER to ThaiFoon
 * เดิมเรียก Typhoon โดยตรง ตอนนี้ delegate ไป ThaiFoon (ใต้ฝุ่น) เพื่อใช้ System Prompt ใหม่
 * เก็บ interface เดิมไว้เพื่อ backward compat (batch-upload, image-upload ยัง import ได้)
 */

import { analyzeImageWithThaiFoon, isThaiFoonConfigured } from '@/lib/thaifoon';
import type { ThaiFoonContext } from '@/lib/thaifoon';

export interface TyphoonOcrResult {
  rawText: string;
  steps: number | null;
  stepsRaw: string | null;
  dateRaw: string | null;
  confidence: number | null;
  step_count: number | null;
  detected_date_raw: string | null;
  formatted_date: string | null;
  is_date_matched: boolean | null;
  confidence_score: number | null;
  status: 'passed' | 'flagged_for_review' | null;
  reasoning: string | null;
  raw_date_text_from_image: string | null;
  parsed_date_from_image: string | null;
  ocr_confidence: number | null;
  visual_evidence: string | null;
}

export interface TyphoonPromptContext {
  systemDate: string;
  targetDate: string;
  currentYear: string;
  currentThaiYear: string;
}

// Re-export ThaiFoon types for new callers
export type { ThaiFoonResult, ThaiFoonContext } from '@/lib/thaifoon';

function getApiKey(): string {
  return String(process.env.TYPHOON_API_KEY || '').trim();
}

/**
 * Adapter — แปลง ThaiFoonResult -> TyphoonOcrResult
 * เพื่อให้โค้ดเดิม (batch-upload, image-upload, analyze-steps) ทำงานได้โดยไม่แก้
 */
export async function analyzeStepsImageWithTyphoon(
  imageDataUrl: string,
  opts?: { timeoutMs?: number; ctx?: TyphoonPromptContext & { inputSteps?: number | null } }
): Promise<TyphoonOcrResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TYPHOON_API_KEY not configured');

  const now = new Date();
  const systemDate = now.toISOString().slice(0, 10);
  const ctx: ThaiFoonContext = {
    systemDate: opts?.ctx?.systemDate ?? systemDate,
    targetDate: opts?.ctx?.targetDate ?? systemDate,
    currentYear: opts?.ctx?.currentYear ?? String(now.getFullYear()),
    currentThaiYear: opts?.ctx?.currentThaiYear ?? String(now.getFullYear() + 543),
    inputSteps: (opts?.ctx as any)?.inputSteps ?? null,
  };

  const t = await analyzeImageWithThaiFoon(imageDataUrl, {
    timeoutMs: opts?.timeoutMs ?? 25000,
    ctx,
  });

  // Map ThaiFoon -> Typhoon shape
  const steps = t.extracted_steps;
  return {
    rawText: t.rawText,
    steps,
    stepsRaw: steps != null ? String(steps) : null,
    dateRaw: t.extracted_date,
    confidence: t.confidence,
    step_count: steps,
    detected_date_raw: t.extracted_date,
    formatted_date: t.extracted_date_normalized,
    is_date_matched: t.date_match,
    confidence_score: t.confidence,
    status: t.status === 'APPROVED' ? 'passed' : 'flagged_for_review',
    reasoning: t.reason,
    raw_date_text_from_image: t.extracted_date,
    parsed_date_from_image: t.extracted_date_normalized,
    ocr_confidence: t.confidence,
    visual_evidence: t.visual_evidence || t.rawText.slice(0, 500),
  };
}

export function isTyphoonConfigured(): boolean {
  return isThaiFoonConfigured();
}

export { isThaiFoonConfigured };
