// Database schema. See docs/data-model.md. Published content is stored here as prepared
// snapshots (one per active revision); the content repository remains its source.
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ValidationIssue } from '../../lib/content/types';
import type { SearchDocument } from '../../lib/search';
import type { StoredModel } from '../content/snapshot-store';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum('user_role', ['learner', 'admin']);
/** Account state; separate from invitation delivery. */
export const userStatus = pgEnum('user_status', ['pending', 'active', 'deactivated']);
export const invitationStatus = pgEnum('invitation_status', ['not_sent', 'sending', 'sent', 'failed']);
export const credentialTokenKind = pgEnum('credential_token_kind', ['invitation_otp', 'password_reset']);
export const contentRevisionStatus = pgEnum('content_revision_status', [
  'pending',
  'validating',
  'ready',
  'failed',
  'active',
  'superseded',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lowercased; compared case-insensitively via the unique index. */
    email: text('email').notNull(),
    role: userRole('role').notNull().default('learner'),
    status: userStatus('status').notNull().default('pending'),
    /** argon2id hash; null until the user chooses a password. */
    passwordHash: text('password_hash'),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    invitationStatus: invitationStatus('invitation_status').notNull().default('not_sent'),
    invitationSentAt: timestamp('invitation_sent_at', { withTimezone: true }),
    invitationError: text('invitation_error'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(sql`lower(${table.email})`)],
);

/**
 * One-time invitation passwords and password-reset links. Only hashes are stored.
 * Issuing a new token marks the user's earlier unused tokens of the same kind as used.
 */
export const credentialTokens = pgTable(
  'credential_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: credentialTokenKind('kind').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('credential_tokens_user_kind').on(table.userId, table.kind)],
);

/** Server-side sessions, so deactivation and credential resets can end access immediately. */
export const sessions = pgTable(
  'sessions',
  {
    /** Hash of the session token held in the cookie. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('sessions_user').on(table.userId)],
);

/** Each administrator-triggered content update. At most one revision is active. */
export const contentRevisions = pgTable(
  'content_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commitSha: text('commit_sha'),
    status: contentRevisionStatus('status').notNull().default('pending'),
    issues: jsonb('issues').$type<ValidationIssue[]>().notNull().default([]),
    errorMessage: text('error_message'),
    triggeredBy: uuid('triggered_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('content_revisions_one_active').on(table.status).where(sql`${table.status} = 'active'`),
    // Prevents overlapping update runs.
    uniqueIndex('content_revisions_one_in_progress')
      .on(sql`(true)`)
      .where(sql`${table.status} in ('pending', 'validating')`),
  ],
);

/**
 * The prepared content of a published revision: navigation model, rendered pages and search
 * index. Written by "Aktualizovat obsah"; only the active revision keeps its snapshot.
 */
export const contentSnapshots = pgTable('content_snapshots', {
  revisionId: uuid('revision_id')
    .primaryKey()
    .references(() => contentRevisions.id, { onDelete: 'cascade' }),
  model: jsonb('model').$type<StoredModel>().notNull(),
  /** Sanitized HTML by `lectureId/partId`. */
  rendered: jsonb('rendered').$type<Record<string, string>>().notNull(),
  search: jsonb('search').$type<SearchDocument[]>().notNull(),
  createdAt: createdAt(),
});

/** Images referenced by a snapshot's content, served only through the protected asset route. */
export const contentAssets = pgTable(
  'content_assets',
  {
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => contentSnapshots.revisionId, { onDelete: 'cascade' }),
    /** Path relative to the content repository root. */
    path: text('path').notNull(),
    contentType: text('content_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    data: bytea('data').notNull(),
  },
  (table) => [primaryKey({ columns: [table.revisionId, table.path] })],
);

/**
 * One current saved response per learner and exercise (last successful save wins).
 * No drafts, history or progress are stored. Lecture/part ids are snapshots from save time,
 * so responses stay listable after an exercise moves or is removed.
 */
export const responses = pgTable(
  'responses',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id').notNull(),
    courseId: text('course_id').notNull(),
    exerciseRevision: integer('exercise_revision').notNull(),
    contentRevisionId: uuid('content_revision_id').references(() => contentRevisions.id, { onDelete: 'set null' }),
    lectureId: text('lecture_id').notNull(),
    partId: text('part_id').notNull(),
    /** Snapshots from save time, so answers stay readable after content moves or disappears. */
    lectureTitle: text('lecture_title'),
    partTitle: text('part_title'),
    exerciseTitle: text('exercise_title'),
    fieldLabels: jsonb('field_labels').$type<Record<string, string>>().notNull(),
    /** Markdown per field id. */
    fields: jsonb('fields').$type<Record<string, string>>().notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.exerciseId] }),
    index('responses_exercise').on(table.exerciseId),
  ],
);
