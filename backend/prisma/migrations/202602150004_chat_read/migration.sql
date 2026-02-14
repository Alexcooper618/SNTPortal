CREATE TABLE "ChatRoomRead" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoomRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatRoomRead_roomId_userId_key" ON "ChatRoomRead"("roomId", "userId");
CREATE INDEX "ChatRoomRead_tenantId_userId_idx" ON "ChatRoomRead"("tenantId", "userId");

ALTER TABLE "ChatRoomRead" ADD CONSTRAINT "ChatRoomRead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRoomRead" ADD CONSTRAINT "ChatRoomRead_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRoomRead" ADD CONSTRAINT "ChatRoomRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

