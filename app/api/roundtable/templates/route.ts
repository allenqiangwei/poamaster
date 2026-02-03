import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const enabled = searchParams.get('enabled');

    const templates = await prisma.roundtableTemplate.findMany({
      where: enabled !== null ? { enabled: enabled === 'true' } : undefined,
      include: {
        roles: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { priority: 'desc' },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
