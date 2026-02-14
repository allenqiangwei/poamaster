import { NextResponse } from 'next/server';
import { startScheduler } from '@/lib/insights/scheduler';

// Initialize scheduler on first import
startScheduler();

export async function GET() {
  return NextResponse.json({ success: true, message: 'Scheduler is running' });
}
