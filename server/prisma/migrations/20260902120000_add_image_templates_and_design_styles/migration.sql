-- CreateTable
CREATE TABLE "image_templates" (
    "imageTemplateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_templates_pkey" PRIMARY KEY ("imageTemplateId")
);

-- CreateTable
CREATE TABLE "image_design_styles" (
    "imageDesignStyleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_design_styles_pkey" PRIMARY KEY ("imageDesignStyleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "image_templates_key_key" ON "image_templates"("key");

-- CreateIndex
CREATE UNIQUE INDEX "image_design_styles_key_key" ON "image_design_styles"("key");
