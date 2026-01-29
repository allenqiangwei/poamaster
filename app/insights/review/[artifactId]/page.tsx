import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ReviewPage from './ReviewPage';

export default async function Page({ params }: { params: { artifactId: string } }) {
  const { artifactId } = params;

  // Fetch artifact with draft items and assignee
  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    include: {
      assignee: true,
      draftItems: {
        where: { isDeleted: false },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!artifact) {
    notFound();
  }

  if (artifact.status !== 'ready') {
    return (
      <div className="container mx-auto p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p>文件状态不正确: {artifact.status}</p>
          <p>只有状态为 ready 的文件可以审核</p>
        </div>
      </div>
    );
  }

  return <ReviewPage artifact={artifact} />;
}
