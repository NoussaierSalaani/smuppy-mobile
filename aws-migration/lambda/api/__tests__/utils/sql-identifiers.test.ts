import { assertSafeIdentifier, assertSafeColumnList, assertSafeJoinClause } from '../../utils/sql-identifiers';

describe('assertSafeIdentifier', () => {
  it('accepts simple identifiers', () => {
    expect(() => assertSafeIdentifier('posts', 'test')).not.toThrow();
    expect(() => assertSafeIdentifier('author_id', 'test')).not.toThrow();
    expect(() => assertSafeIdentifier('_private', 'test')).not.toThrow();
  });

  it('accepts identifiers with digits', () => {
    expect(() => assertSafeIdentifier('table1', 'test')).not.toThrow();
    expect(() => assertSafeIdentifier('col_2', 'test')).not.toThrow();
  });

  it('rejects identifiers starting with digits', () => {
    expect(() => assertSafeIdentifier('1table', 'test')).toThrow('Unsafe SQL identifier');
  });

  it('rejects identifiers with spaces', () => {
    expect(() => assertSafeIdentifier('my table', 'test')).toThrow('Unsafe SQL identifier');
  });

  it('rejects identifiers with semicolons', () => {
    expect(() => assertSafeIdentifier('table;DROP', 'test')).toThrow('Unsafe SQL identifier');
  });

  it('rejects identifiers with quotes', () => {
    expect(() => assertSafeIdentifier("table'name", 'test')).toThrow('Unsafe SQL identifier');
    expect(() => assertSafeIdentifier('table"name', 'test')).toThrow('Unsafe SQL identifier');
  });

  it('rejects empty string', () => {
    expect(() => assertSafeIdentifier('', 'test')).toThrow('Unsafe SQL identifier');
  });

  it('includes context in error message', () => {
    expect(() => assertSafeIdentifier('bad;input', 'tableName')).toThrow('tableName');
  });
});

describe('assertSafeColumnList', () => {
  it('accepts single column', () => {
    expect(() => assertSafeColumnList('id', 'test')).not.toThrow();
  });

  it('accepts multiple columns', () => {
    expect(() => assertSafeColumnList('id, name, email', 'test')).not.toThrow();
  });

  it('accepts qualified columns with table prefix', () => {
    expect(() => assertSafeColumnList('e.id, p.username', 'test')).not.toThrow();
  });

  it('accepts columns with AS aliases', () => {
    expect(() => assertSafeColumnList('p.username as creator_username', 'test')).not.toThrow();
  });

  it('accepts star wildcard', () => {
    expect(() => assertSafeColumnList('*', 'test')).not.toThrow();
    expect(() => assertSafeColumnList('p.*', 'test')).not.toThrow();
  });

  it('rejects empty column list', () => {
    expect(() => assertSafeColumnList('', 'test')).toThrow('Empty column list');
  });

  it('rejects columns with semicolons', () => {
    expect(() => assertSafeColumnList('id; DROP TABLE', 'test')).toThrow('Unsafe SQL column');
  });

  it('rejects columns with quotes', () => {
    expect(() => assertSafeColumnList("name'", 'test')).toThrow('Unsafe SQL column');
  });

  it('rejects columns with parentheses', () => {
    expect(() => assertSafeColumnList('COUNT(*)', 'test')).toThrow('Unsafe SQL column');
  });
});

describe('assertSafeJoinClause', () => {
  it('accepts safe JOIN clause', () => {
    expect(() => assertSafeJoinClause(
      'LEFT JOIN profiles p ON p.id = e.author_id',
      'test',
    )).not.toThrow();
  });

  it('accepts multi-table JOIN', () => {
    expect(() => assertSafeJoinClause(
      'INNER JOIN users u ON u.id = p.user_id LEFT JOIN roles r ON r.id = u.role_id',
      'test',
    )).not.toThrow();
  });

  it('rejects semicolons (statement separator)', () => {
    expect(() => assertSafeJoinClause(
      'LEFT JOIN profiles p ON p.id = e.author_id; DROP TABLE users',
      'test',
    )).toThrow('dangerous characters');
  });

  it('rejects single quotes (string injection)', () => {
    expect(() => assertSafeJoinClause(
      "LEFT JOIN profiles p ON p.name = 'admin'",
      'test',
    )).toThrow('dangerous characters');
  });

  it('rejects double quotes', () => {
    expect(() => assertSafeJoinClause(
      'LEFT JOIN profiles p ON p.name = "admin"',
      'test',
    )).toThrow('dangerous characters');
  });

  it('rejects SQL line comments', () => {
    expect(() => assertSafeJoinClause(
      'LEFT JOIN profiles p ON p.id = e.author_id -- comment',
      'test',
    )).toThrow('dangerous characters');
  });

  it('rejects SQL block comments', () => {
    expect(() => assertSafeJoinClause(
      'LEFT JOIN profiles p /* injected */ ON p.id = e.author_id',
      'test',
    )).toThrow('dangerous characters');
  });

  it('rejects backslashes', () => {
    expect(() => assertSafeJoinClause(
      'LEFT JOIN profiles p ON p.name = \\x41',
      'test',
    )).toThrow('dangerous characters');
  });
});
