import { describe, expect, it } from 'vitest';
import { assertTestDatabase, databaseUrlFor } from './support/database';

describe('test database safety', () => {
  it('only allows *_test and *_e2e databases to be reset', () => {
    expect(() => assertTestDatabase('postgres://u:p@localhost:5442/course_test')).not.toThrow();
    expect(() => assertTestDatabase('postgres://u:p@localhost:5442/course_e2e')).not.toThrow();
    expect(() => assertTestDatabase('postgres://u:p@localhost:5442/course')).toThrow(/Refusing/);
    expect(() => assertTestDatabase('postgres://u:p@localhost:5442/course_test_backup')).toThrow(/Refusing/);
  });

  it('derives test database URLs from the dev URL', () => {
    expect(databaseUrlFor('course_e2e', 'postgres://u:p@localhost:5442/course')).toBe('postgres://u:p@localhost:5442/course_e2e');
  });
});
