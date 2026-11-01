import { expect, it } from 'vitest';
import { quoteSelection } from '../src/lib/content-report';

it('quotes selected text as Markdown, preserving blank lines', () => {
  expect(quoteSelection('one\ntwo')).toBe('> one\n> two\n\n');
  expect(quoteSelection('one\r\n\r\ntwo')).toBe('> one\n> \n> two\n\n');
  expect(quoteSelection('')).toBe('');
});
