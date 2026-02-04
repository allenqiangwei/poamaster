import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const template = await prisma.roundtableTemplate.findUnique({
      where: { id },
      include: {
        roles: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error('Failed to fetch template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { roles, ...templateData } = body;

    // 更新模板
    const template = await prisma.roundtableTemplate.update({
      where: { id },
      data: templateData,
    });

    // 如果提供了roles，更新角色
    if (roles) {
      // 删除旧角色
      await prisma.roundtableRole.deleteMany({
        where: { templateId: id },
      });

      // 创建新角色
      await prisma.roundtableRole.createMany({
        data: roles.map((role: any, index: number) => ({
          templateId: id,
          ...role,
          order: index + 1,
        })),
      });
    }

    // 返回更新后的模板
    const updatedTemplate = await prisma.roundtableTemplate.findUnique({
      where: { id },
      include: {
        roles: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return NextResponse.json(updatedTemplate);
  } catch (error) {
    console.error('Failed to update template:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}
