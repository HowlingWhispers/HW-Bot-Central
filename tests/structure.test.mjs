import {test} from 'node:test';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';test('runtime deliberately has no arbitrary script execution endpoint',()=>{const s=readFileSync('server/index.ts','utf8');assert.doesNotMatch(s,/app\.post\('\/api\/.*execute/);assert.match(s,/executable:false/)});test('connection secrets are encrypted at rest',()=>{const s=readFileSync('server/index.ts','utf8');assert.match(s,/aes-256-gcm/);assert.match(s,/timingSafeEqual/)});test('front end has all initial management tabs',()=>{const s=readFileSync('src/main.tsx','utf8');for(const name of ['Settings','Scripts','Connections','Advanced JSON'])assert.ok(s.includes(name))});
test('character studio and access manager routes exist',()=>{const s=readFileSync('server/index.ts','utf8');for(const route of ['/characters','/access'])assert.ok(s.includes(route));assert.match(s,/enforced:false/)});

test('Discord application credentials use encrypted storage and redacted read API',()=>{const s=readFileSync('server/index.ts','utf8');assert.match(s,/discord_apps/);assert.match(s,/bot_token_cipher/);assert.match(s,/encrypt\(v.bot_token\)/);assert.match(s,/has_bot_token/);assert.doesNotMatch(s,/decrypt\(.*bot_token_cipher/)});

test('Discord snowflake regexes accept real digits and reject backslash-d literals',()=>{
 const source=readFileSync('server/index.ts','utf8');
 const patterns=[...source.matchAll(/\.regex\((\/\^[^\n]*?\$\/)\)/g)].map(match=>match[1]);
 const snowflakes=patterns.filter(pattern=>pattern.includes('17,20'));
 assert.equal(snowflakes.length,2,'both the guild/channel and application ID validators must be tested');
 for(const expression of snowflakes){
  const expressionValue=Function('"use strict"; return ('+expression+');')();
  assert.equal(expressionValue.test('123456789012345678'),true);
  assert.equal(expressionValue.test('not-a-discord-id'),false);
  assert.equal(expressionValue.test('\\\\d'.repeat(18)),false);
 }
});
