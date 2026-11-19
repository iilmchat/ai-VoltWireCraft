CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "catalog_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"series" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"device_type" text NOT NULL,
	"poles" text,
	"rated_current_a" integer,
	"trip_curve" text,
	"leakage_current_ma" integer,
	"breaking_capacity_ka" numeric(4, 1),
	"width_modules" integer,
	"price_rub" numeric(12, 2) NOT NULL,
	"specs_json" jsonb NOT NULL,
	CONSTRAINT "catalog_devices_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "normative_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_code" text NOT NULL,
	"clause" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "catalog_devices_type_brand_idx" ON "catalog_devices" USING btree ("device_type","brand");--> statement-breakpoint
CREATE UNIQUE INDEX "normative_chunks_document_clause_key" ON "normative_chunks" USING btree ("document_code","clause");--> statement-breakpoint
CREATE INDEX "normative_chunks_embedding_hnsw_idx" ON "normative_chunks" USING hnsw ("embedding" vector_cosine_ops);