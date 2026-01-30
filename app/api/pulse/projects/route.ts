import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/pulse/projects - List all projects
export async function GET() {
  try {
    const projects = await prisma.pulseProject.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            entries: {
              where: { deletedAt: null }
            }
          }
        }
      }
    });

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST /api/pulse/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Project name is required' },
        { status: 400 }
      );
    }

    const project = await prisma.pulseProject.create({
      data: { name: name.trim() }
    });

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
