import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCSV } from '../src/utils/csv.js';

test('generateCSV generates valid CSV from headers and rows with string keys', () => {
  const headers = [
    { label: 'Name', key: 'name' },
    { label: 'Email', key: 'email' },
    { label: 'Role', key: 'role' },
  ];
  const rows = [
    { name: 'Alice Smith', email: 'alice@example.com', role: 'patient' },
    { name: 'Bob Jones', email: 'bob@example.com', role: 'doctor' },
  ];

  const csv = generateCSV(headers, rows);
  const lines = csv.split('\r\n');

  assert.equal(lines.length, 3);
  assert.equal(lines[0], '"Name","Email","Role"');
  assert.equal(lines[1], '"Alice Smith","alice@example.com","patient"');
  assert.equal(lines[2], '"Bob Jones","bob@example.com","doctor"');
});

test('generateCSV supports function accessors and handles null/undefined values', () => {
  const headers = [
    { label: 'Doctor', key: (r) => r.doctor?.user?.name || '' },
    { label: 'Phone', key: (r) => r.phone || '' },
    { label: 'Notes', key: 'notes' },
  ];
  const rows = [
    { doctor: { user: { name: 'Dr. House' } }, phone: null, notes: undefined },
    { doctor: null, phone: '+1234567890', notes: 'Routine check' },
  ];

  const csv = generateCSV(headers, rows);
  const lines = csv.split('\r\n');

  assert.equal(lines[0], '"Doctor","Phone","Notes"');
  assert.equal(lines[1], '"Dr. House","",""');
  assert.equal(lines[2], '"","+1234567890","Routine check"');
});

test('generateCSV properly escapes double quotes within cell data and headers', () => {
  const headers = [
    { label: 'User "Nickname"', key: 'name' },
    { label: 'Details', key: 'details' },
  ];
  const rows = [
    { name: 'John "The Boss" Doe', details: 'Says "Hello, World!"' },
  ];

  const csv = generateCSV(headers, rows);
  const lines = csv.split('\r\n');

  assert.equal(lines[0], '"User ""Nickname""","Details"');
  assert.equal(lines[1], '"John ""The Boss"" Doe","Says ""Hello, World!"""');
});

test('generateCSV returns empty string for empty headers or empty rows', () => {
  assert.equal(generateCSV([], [{ a: 1 }]), '');
  assert.equal(generateCSV(null, [{ a: 1 }]), '');

  const headers = [{ label: 'ID', key: 'id' }];
  const emptyResult = generateCSV(headers, []);
  assert.equal(emptyResult, '"ID"');
});
