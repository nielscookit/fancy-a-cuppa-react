import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoles, validateContainer } from '../scripts/verify-pilot-restore.mjs';

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
test('restore rejects secrets, injected SQL, role settings and unknown attributes before execution', () => {
  for(const extra of [
    "ALTER ROLE anon PASSWORD 'secret';",
    "ALTER ROLE anon SET search_path='public';",
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
