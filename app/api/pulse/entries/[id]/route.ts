import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { UNDO_WINDOW_MS } from '@/lib/pulse/constants';
import { EvidenceHistoryItem, Source } from '@/lib/pulse/types';

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/pulse/entries/[id]
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const entry = await prisma.pulseEntry.findUnique({
      where: { id }
    });

    if (!entry || entry.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Failed to fetch entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch entry' },
      { status: 500 }
    );
  }
}

// PATCH /api/pulse/entries/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, dimension, evidence, source } = body;

    const existing = await prisma.pulseEntry.findUnique({
      where: { id }
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (title) updateData.title = title.trim();
    if (dimension) updateData.dimension = dimension;

    if (evidence && source) {
      const historyItem: EvidenceHistoryItem = {
        evidence: existing.evidenceCurrent,
        source: existing.sourceCurrent as unknown as Source,
        addedAt: new Date().toISOString()
      };

      const currentHistory = (existing.evidenceHistory as unknown as EvidenceHistoryItem[]) || [];

      updateData.evidenceCurrent = evidence.trim();
      updateData.sourceCurrent = source;
      updateData.evidenceHistory = [...currentHistory, historyItem];
    }

    const [entry] = await prisma.$transaction([
      prisma.pulseEntry.update({
        where: { id },
        data: updateData
      }),
      prisma.pulseProject.update({
        where: { id: existing.projectId },
        data: { updatedAt: new Date() }
      })
    ]);

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Failed to update entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/pulse/entries/[id] - Soft delete with undo token
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.pulseEntry.findUnique({
      where: { id }
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }

    const deleteToken = randomBytes(16).toString('hex');

    await prisma.$transaction([
      prisma.pulseEntry.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deleteToken
        }
      }),
      prisma.pulseProject.update({
        where: { id: existing.projectId },
        data: { updatedAt: new Date() }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: {
        undoToken: deleteToken,
        undoExpiresIn: UNDO_WINDOW_MS
      }
    });
  } catch (error) {
    console.error('Failed to delete entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete entry' },
      { status: 500 }
    );
  }
}
