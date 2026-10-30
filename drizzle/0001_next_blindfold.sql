ALTER TABLE "responses" ADD COLUMN "course_id" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "responses" ALTER COLUMN "course_id" DROP DEFAULT;
