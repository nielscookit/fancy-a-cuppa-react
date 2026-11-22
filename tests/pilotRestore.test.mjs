import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseRoles, parseRoleSetting, readEscapeLiteral, validateContainer } from '../scripts/verify-pilot-restore.mjs';

const roleExport = `-- PostgreSQL database cluster dump
SET default_transaction_read_only = off;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
CREATE ROLE anon;
ALTER ROLE anon WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;
CREATE ROLE authenticated;
CREATE ROLE service_role;
ALTER ROLE service_role WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION BYPASSRLS;
CREATE ROLE authenticator;
GRANT anon TO authenticator GRANTED BY service_role;
`;
test('restore parses password-free roles and reconstructs only allowed SQL', () => {
  const parsed=parseRoles(roleExport);
  assert.equal(parsed.names.length,4);
  assert.ok(parsed.attributes.get('service_role').includes('BYPASSRLS'));
  assert.deepEqual(parsed.memberships,[{role:'anon',member:'authenticator',options:undefined,grantor:'service_role'}]);
});
test('restore rejects secrets, injected SQL, unknown settings and attributes before execution', () => {
  for(const extra of [
    "ALTER ROLE anon PASSWORD 'secret';",
    "ALTER ROLE anon SET unknown_setting='public';",
    "CREATE ROLE attacker; DROP DATABASE postgres;",
    'ALTER ROLE anon WITH LOGIN VALID UNTIL NOW;',
    'GRANT unknown TO anon;',
    '\\connect production',
  ]) assert.throws(()=>parseRoles(roleExport+'\n'+extra));
  assert.throws(()=>parseRoles('CREATE ROLE anon;'),/Basisrollen/);
});
const safe={Name:'/fac-pilot-restore',State:{Running:true},HostConfig:{NetworkMode:'none',PortBindings:{}},NetworkSettings:{Networks:{none:{}},Ports:{}},Mounts:[]};
test('restore accepts only the explicitly isolated container', () => {
  assert.doesNotThrow(()=>validateContainer(safe));
  for(const changed of [
    {...safe,Name:'/supabase_db_fancy-a-cuppa-react'},
    {...safe,State:{Running:false}},
    {...safe,HostConfig:{NetworkMode:'bridge'}},
    {...safe,HostConfig:{NetworkMode:'none',Privileged:true}},
    {...safe,HostConfig:{NetworkMode:'none',PortBindings:{'5432/tcp':[{HostPort:'55432'}]}}},
    {...safe,Mounts:[{Type:'bind',Source:'/Users/stephan'}]},
    {...safe,NetworkSettings:{Networks:{none:{},bridge:{}}}},
  ]) assert.throws(()=>validateContainer(changed));
});

test('restore validates PostgreSQL 17 membership options and built-in role references', () => {
  const parsed=parseRoles(roleExport+'GRANT pg_read_all_data TO authenticated WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY service_role;');
  assert.equal(parsed.memberships[1].options,'ADMIN FALSE, INHERIT TRUE, SET TRUE');
  for(const options of ['ADMIN TRUE; DROP ROLE anon','INHERIT TRUE, INHERIT FALSE','SET TRUE WITH ADMIN OPTION']) {
    assert.throws(()=>parseRoles(roleExport+'GRANT anon TO authenticated WITH '+options+';'));
  }
});

test('restore accepts fifteen representative exported role defaults without raw SQL execution', () => {
  const fixture=readFileSync('tests/fixtures/pilot-role-settings.sql','utf8');
  const parsed=parseRoles(roleExport+fixture);
  assert.equal(parsed.settings.length,15);
  assert.deepEqual(parsed.settings[0],{role:'anon',name:'statement_timeout',value:'3s',libraries:[]});
  assert.equal(parsed.settings.find(s=>s.name==='search_path').value,'"$user", "public", "extensions"');
  assert.deepEqual(parsed.settings.find(s=>s.name==='session_preload_libraries').libraries,['auto_explain']);
  assert.equal(parsed.settings.at(-1).value,'off');
});
test('role defaults accept safe numeric, duration, boolean and list forms', () => {
  for(const value of ['0', "'0'", "'250ms'", "'1.5s'", "'5min'"]) assert.ok(parseRoleSetting('statement_timeout',value));
  for(const value of ['true', "'on'", '1']) assert.equal(parseRoleSetting('default_transaction_read_only',value).value,'on');
  assert.equal(parseRoleSetting('search_path', "'public', 'extensions'").value,'"public", "extensions"');
  assert.equal(parseRoleSetting('search_path', "'\"$user\", public'").value,'"$user", "public"');
  assert.equal(parseRoleSetting('session_preload_libraries',"''").value,'');
  assert.equal(parseRoleSetting('session_preload_libraries',"'safeupdate, pgaudit'").value,'safeupdate,pgaudit');
});
test('role defaults reject expressions, injected settings, library paths and unsafe values', () => {
  for(const [name,value] of [
    ['statement_timeout',"'3s'; DROP ROLE anon"],
    ['statement_timeout',"'3s' -- comment"],
    ['statement_timeout','1+1'],
    ['statement_timeout',"'infinity'"],
    ['statement_timeout','-1'],
    ['statement_timeout',"'1s', '2s'"],
    ['log_statement',"'debug'"],
    ['default_transaction_read_only',"'off; drop schema public'"],
    ['search_path',"'public; DROP ROLE anon'"],
    ['search_path','public,'],
    ['search_path','pg_catalog /* comment */'],
    ['search_path',"'public', current_user()"],
    ['session_preload_libraries',"'../safeupdate'"],
    ['session_preload_libraries',"'evil_library'"],
    ['shared_preload_libraries',"'auto_explain'"],
    ['unknown_setting',"'on'"],
  ]) assert.throws(()=>parseRoleSetting(name,value),name+' '+value);
  assert.throws(()=>parseRoles(roleExport+"ALTER ROLE missing SET lock_timeout TO '0';"),/Rollenreferenz/);
  assert.throws(()=>parseRoles(roleExport+"ALTER ROLE anon SET lock_timeout TO '0'; ALTER ROLE anon LOGIN;"));
  assert.throws(()=>parseRoles(roleExport+"ALTER ROLE anon SET lock_timeout TO '0';\nALTER ROLE anon SET lock_timeout TO '0';"),/Doppelte/);
});

test('production E-prefixed search_path syntax preserves schema order and user substitution', () => {
  const actualSyntax = String.raw`E'\"$user\", public, extensions'`;
  assert.equal(parseRoleSetting('search_path', actualSyntax).value,'"$user", "public", "extensions"');
  const parsed=parseRoles(roleExport+"CREATE ROLE postgres;\nALTER ROLE postgres SET search_path TO "+actualSyntax+";");
  assert.equal(parsed.settings[0].role,'postgres');
  assert.equal(parsed.settings[0].value,'"$user", "public", "extensions"');
  assert.equal(parseRoleSetting('search_path', String.raw`e'\u0070ublic', E'extensions'`).value,'"public", "extensions"');
});
test('PostgreSQL escape decoding handles quotes, bytes, Unicode and literal backslashes', () => {
  for(const [source, expected] of [
    [String.raw`E'it\'s'`, "it's"],
    [String.raw`E'it''s'`, "it's"],
    [String.raw`E'a\\b'`, 'a\\b'],
    [String.raw`E'\b\f\n\r\t'`, '\b\f\n\r\t'],
    [String.raw`E'\160\x75blic'`, 'public'],
    [String.raw`E'\xc3\xa4'`, 'ä'],
    [String.raw`E'\u00e4\U000000df'`, 'äß'],
    [String.raw`E'\uD83D\uDE00'`, '😀'],
    [String.raw`E'\U0000D83D\U0000DE00'`, '😀'],
    [String.raw`E'\public'`, 'public'],
    [String.raw`E'\xzz'`, 'xzz'],
  ]) {
    const result=readEscapeLiteral(source);
    assert.equal(result.value,expected,source);
    assert.equal(result.length,source.length);
  }
});
test('escape literals cannot inject SQL, bypass setting validation or carry invalid encoding', () => {
  for(const source of [
    String.raw`E'public'; DROP ROLE anon`,
    String.raw`E'public' || 'extensions'`,
    String.raw`E'public\x3b DROP ROLE anon'`,
    String.raw`E'public\047; DROP ROLE anon; --'`,
    String.raw`E'public' /* comment */`,
    String.raw`E'public\000'`,
    String.raw`E'public\x00'`,
    String.raw`E'public\u0000'`,
    String.raw`E'public\xff'`,
    String.raw`E'\uD800'`,
    String.raw`E'\uDC00'`,
    String.raw`E'\U00110000'`,
    String.raw`E'\u12'`,
    String.raw`E'public\'`,
  ]) assert.throws(()=>parseRoleSetting('search_path',source),source);
  assert.throws(()=>parseRoles(roleExport+String.raw`ALTER ROLE anon PASSWORD E'secret';`),/PASSWORD/);
  assert.throws(()=>parseRoleSetting('unknown_setting',String.raw`E'on'`));
});
