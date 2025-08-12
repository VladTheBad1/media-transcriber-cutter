const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const files = await prisma.mediaFile.findMany({
    select: {
      id: true,
      originalName: true,
      duration: true,
      thumbnailPath: true,
      resolution: true
    }
  });
  console.log(JSON.stringify(files, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());