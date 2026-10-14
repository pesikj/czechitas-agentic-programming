CREATE TYPE "public"."content_revision_status" AS ENUM('pending', 'validating', 'ready', 'failed', 'active', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."credential_token_kind" AS ENUM('invitation_otp', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('not_sent', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('learner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'deactivated');--> statement-breakpoint
CREATE TABLE "content_assets" (
	"revision_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"data" "bytea" NOT NULL,
	CONSTRAINT "content_assets_revision_id_path_pk" PRIMARY KEY("revision_id","path")
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commit_sha" text,
	"status" "content_revision_status" DEFAULT 'pending' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"triggered_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_snapshots" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"model" jsonb NOT NULL,
	"rendered" jsonb NOT NULL,
	"search" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "credential_token_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"user_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"exercise_revision" integer NOT NULL,
	"content_revision_id" uuid,
	"lecture_id" text NOT NULL,
	"part_id" text NOT NULL,
	"lecture_title" text,
	"part_title" text,
	"exercise_title" text,
	"field_labels" jsonb NOT NULL,
	"fields" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "responses_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'learner' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"password_hash" text,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"invitation_status" "invitation_status" DEFAULT 'not_sent' NOT NULL,
	"invitation_sent_at" timestamp with time zone,
	"invitation_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_revision_id_content_snapshots_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_snapshots"("revision_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_snapshots" ADD CONSTRAINT "content_snapshots_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_tokens" ADD CONSTRAINT "credential_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_content_revision_id_content_revisions_id_fk" FOREIGN KEY ("content_revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_one_active" ON "content_revisions" USING btree ("status") WHERE "content_revisions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_one_in_progress" ON "content_revisions" USING btree ((true)) WHERE "content_revisions"."status" in ('pending', 'validating');--> statement-breakpoint
CREATE INDEX "credential_tokens_user_kind" ON "credential_tokens" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "responses_exercise" ON "responses" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));