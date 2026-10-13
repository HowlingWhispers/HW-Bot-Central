import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { randomUUID, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const token = process.env.ADMIN_API_TOKEN;
const keyHex = process.env.SECRETS_KEY_HEX;
if (!token || token.length < 32 || !keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
  throw new Error('Set ADMIN_API_TOKEN (32+ chars) and SECRETS_KEY_HEX (64 hex chars) before starting.');
}
const secretKey = Buffer.from(keyHex,'hex');
const folder = path.resolve(process.env.DATA_DIR ?? './data');
mkdirSync(folder,{recursive:true,mode:0o700});
const db = new Database(path.join(folder,'central.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS bots (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'unmanaged', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS configurations (bot_id TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE, config TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS scripts (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, filename TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, UNIQUE(bot_id,filename));
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, label TEXT NOT NULL, kind TEXT NOT NULL, settings TEXT NOT NULL, encrypted_secret TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, name TEXT NOT NULL, species TEXT NOT NULL DEFAULT '', personality TEXT NOT NULL DEFAULT '', greeting TEXT NOT NULL DEFAULT '', speaking_style TEXT NOT NULL DEFAULT '', memory_policy TEXT NOT NULL DEFAULT 'private', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS access_policies (bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, guild_id TEXT NOT NULL, mode TEXT NOT NULL, allow_dm INTEGER NOT NULL DEFAULT 0, channel_ids TEXT NOT NULL DEFAULT '[]', blocked_channel_ids TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL, PRIMARY KEY(bot_id,guild_id));
CREATE TABLE IF NOT EXISTS discord_apps (bot_id TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE, application_id TEXT NOT NULL, public_key TEXT NOT NULL DEFAULT '', client_secret_cipher TEXT, bot_token_cipher TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, subject_id TEXT, created_at TEXT NOT NULL);
`);
const now = () => new Date().toISOString();
const audit = (action:string,subject:string)=> db.prepare('INSERT INTO audit VALUES (?,?,?,?)').run(randomUUID(),action,subject,now());
const encrypt = (plaintext:string) => { const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',secretKey,iv);const body=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64'); };
const decrypt = (encoded:string) => {const b=Buffer.from(encoded,'base64');const decipher=createDecipheriv('aes-256-gcm',secretKey,b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));return Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString('utf8');};
const botShape=z.object({name:z.string().trim().min(1).max(100),description:z.string().max(2000).default('')});
const configShape=z.record(z.unknown());
const scriptShape=z.object({filename:z.string().regex(/^[a-zA-Z0-9_./-]+\.(ts|js)$/).max(180).refine(v=>!v.split('/').includes('..') && !v.startsWith('/')),source:z.string().max(200000)});
const connectionShape=z.object({label:z.string().min(1).max(100),kind:z.enum(['discord','postgres','mysql','sqlite','redis','http','ai']),settings:z.record(z.union([z.string(),z.number(),z.boolean(),z.null()])),secret:z.string().max(10000).optional()});
const app=Fastify({logger:true,bodyLimit:1024*1024});
app.addHook('onRequest',async(req,reply)=>{
  if(!req.url.startsWith('/api'))return;
  const supplied=req.headers.authorization?.replace(/^Bearer /i,'')??'';
  const a=Buffer.from(supplied),b=Buffer.from(token);
  if(a.length!==b.length||!timingSafeEqual(a,b)){reply.code(401).send({error:'Unauthorized'});}
});
app.setErrorHandler((err,req,reply)=>{const status=(err as {statusCode?:number}).statusCode??500;req.log.error(err);reply.code(status).send({error:status>=500?'Internal server error':err.message});});
app.get('/api/health',async()=>({ok:true}));
app.get('/api/bots',async()=>db.prepare('SELECT * FROM bots ORDER BY updated_at DESC').all());
app.post('/api/bots',async(req,reply)=>{const v=botShape.parse(req.body),id=randomUUID(),time=now();db.transaction(()=>{db.prepare('INSERT INTO bots VALUES (?,?,?,?,?,?)').run(id,v.name,v.description,'unmanaged',time,time);db.prepare('INSERT INTO configurations(bot_id,config) VALUES (?,?)').run(id,'{}');audit('bot.create',id)})();reply.code(201);return {id,...v,status:'unmanaged'};});
app.get('/api/bots/:id',async(req,reply)=>{const {id}=req.params as {id:string};const bot=db.prepare('SELECT * FROM bots WHERE id=?').get(id);if(!bot)return reply.code(404).send({error:'Bot not found'});const config=db.prepare('SELECT config FROM configurations WHERE bot_id=?').get(id) as {config:string};return {bot,config:JSON.parse(config.config)};});
app.patch('/api/bots/:id',async(req,reply)=>{const {id}=req.params as {id:string},v=botShape.parse(req.body);const result=db.prepare('UPDATE bots SET name=?,description=?,updated_at=? WHERE id=?').run(v.name,v.description,now(),id);if(!result.changes)return reply.code(404).send({error:'Bot not found'});audit('bot.update',id);return {ok:true};});
app.delete('/api/bots/:id',async(req,reply)=>{const {id}=req.params as {id:string};const result=db.prepare('DELETE FROM bots WHERE id=?').run(id);if(!result.changes)return reply.code(404).send({error:'Bot not found'});audit('bot.delete',id);return {ok:true};});
app.put('/api/bots/:id/config',async(req,reply)=>{const {id}=req.params as {id:string};const config=configShape.parse(req.body);const result=db.prepare('UPDATE configurations SET config=? WHERE bot_id=?').run(JSON.stringify(config),id);if(!result.changes)return reply.code(404).send({error:'Bot not found'});audit('config.update',id);return {ok:true};});
app.get('/api/bots/:id/scripts',async(req)=>db.prepare('SELECT * FROM scripts WHERE bot_id=? ORDER BY filename').all((req.params as {id:string}).id));
app.put('/api/bots/:id/scripts',async(req,reply)=>{const {id}=req.params as {id:string},v=scriptShape.parse(req.body);if(!db.prepare('SELECT 1 FROM bots WHERE id=?').get(id))return reply.code(404).send({error:'Bot not found'});const existing=db.prepare('SELECT id FROM scripts WHERE bot_id=? AND filename=?').get(id,v.filename) as {id:string}|undefined;db.prepare('INSERT INTO scripts VALUES (?,?,?,?,?) ON CONFLICT(bot_id,filename) DO UPDATE SET source=excluded.source, updated_at=excluded.updated_at').run(existing?.id??randomUUID(),id,v.filename,v.source,now());audit('script.save',id);return {ok:true,executable:false};});
app.get('/api/bots/:id/connections',async(req)=>db.prepare('SELECT id,bot_id,label,kind,settings,created_at,(encrypted_secret IS NOT NULL) AS has_secret FROM connections WHERE bot_id=? ORDER BY created_at').all((req.params as {id:string}).id).map((c:any)=>({...c,settings:JSON.parse(c.settings),has_secret:Boolean(c.has_secret)})));
app.post('/api/bots/:id/connections',async(req,reply)=>{const {id}=req.params as {id:string},v=connectionShape.parse(req.body);if(!db.prepare('SELECT 1 FROM bots WHERE id=?').get(id))return reply.code(404).send({error:'Bot not found'});const connId=randomUUID();db.prepare('INSERT INTO connections VALUES (?,?,?,?,?,?,?)').run(connId,id,v.label,v.kind,JSON.stringify(v.settings),v.secret?encrypt(v.secret):null,now());audit('connection.create',connId);reply.code(201);return {id:connId,label:v.label,kind:v.kind,has_secret:Boolean(v.secret)};});
app.delete('/api/connections/:id',async(req,reply)=>{const {id}=req.params as {id:string};const result=db.prepare('DELETE FROM connections WHERE id=?').run(id);if(!result.changes)return reply.code(404).send({error:'Connection not found'});audit('connection.delete',id);return {ok:true};});

const snowflake=z.string().regex(/^\d{17,20}$/);
const characterShape=z.object({name:z.string().trim().min(1).max(120),species:z.string().max(200).default(''),personality:z.string().max(20000).default(''),greeting:z.string().max(10000).default(''),speaking_style:z.string().max(10000).default(''),memory_policy:z.enum(['none','private','channel','shared']).default('private')});
const policyShape=z.object({guild_id:snowflake,mode:z.enum(['whitelist','blacklist']),allow_dm:z.boolean().default(false),channel_ids:z.array(snowflake).max(1000).default([]),blocked_channel_ids:z.array(snowflake).max(1000).default([])}).refine(v=>new Set(v.channel_ids).size===v.channel_ids.length&&new Set(v.blocked_channel_ids).size===v.blocked_channel_ids.length,{message:'Duplicate channel IDs'});
app.get('/api/bots/:id/characters',async(req)=>db.prepare('SELECT * FROM characters WHERE bot_id=? ORDER BY name').all((req.params as {id:string}).id));
app.post('/api/bots/:id/characters',async(req,reply)=>{const {id}=req.params as {id:string};const v=characterShape.parse(req.body);if(!db.prepare('SELECT 1 FROM bots WHERE id=?').get(id))return reply.code(404).send({error:'Bot not found'});const characterId=randomUUID();db.prepare('INSERT INTO characters VALUES (?,?,?,?,?,?,?,?,?)').run(characterId,id,v.name,v.species,v.personality,v.greeting,v.speaking_style,v.memory_policy,now());audit('character.create',characterId);reply.code(201);return {id:characterId,...v};});
app.put('/api/bots/:id/characters/:characterId',async(req,reply)=>{const {id,characterId}=req.params as {id:string,characterId:string};const v=characterShape.parse(req.body);const result=db.prepare('UPDATE characters SET name=?,species=?,personality=?,greeting=?,speaking_style=?,memory_policy=?,updated_at=? WHERE id=? AND bot_id=?').run(v.name,v.species,v.personality,v.greeting,v.speaking_style,v.memory_policy,now(),characterId,id);if(!result.changes)return reply.code(404).send({error:'Character not found'});audit('character.update',characterId);return {ok:true};});
app.delete('/api/bots/:id/characters/:characterId',async(req,reply)=>{const {id,characterId}=req.params as {id:string,characterId:string};const result=db.prepare('DELETE FROM characters WHERE id=? AND bot_id=?').run(characterId,id);if(!result.changes)return reply.code(404).send({error:'Character not found'});audit('character.delete',characterId);return {ok:true};});
app.get('/api/bots/:id/access',async(req)=>db.prepare('SELECT * FROM access_policies WHERE bot_id=? ORDER BY guild_id').all((req.params as {id:string}).id).map((r:any)=>({...r,allow_dm:Boolean(r.allow_dm),channel_ids:JSON.parse(r.channel_ids),blocked_channel_ids:JSON.parse(r.blocked_channel_ids)})));
app.put('/api/bots/:id/access/:guildId',async(req,reply)=>{const {id,guildId}=req.params as {id:string,guildId:string};const v=policyShape.parse({...req.body as object,guild_id:guildId});if(!db.prepare('SELECT 1 FROM bots WHERE id=?').get(id))return reply.code(404).send({error:'Bot not found'});db.prepare('INSERT INTO access_policies VALUES (?,?,?,?,?,?,?) ON CONFLICT(bot_id,guild_id) DO UPDATE SET mode=excluded.mode,allow_dm=excluded.allow_dm,channel_ids=excluded.channel_ids,blocked_channel_ids=excluded.blocked_channel_ids,updated_at=excluded.updated_at').run(id,v.guild_id,v.mode,Number(v.allow_dm),JSON.stringify(v.channel_ids),JSON.stringify(v.blocked_channel_ids),now());audit('access.update',id);return {ok:true,enforced:false};});
app.delete('/api/bots/:id/access/:guildId',async(req,reply)=>{const {id,guildId}=req.params as {id:string,guildId:string};const result=db.prepare('DELETE FROM access_policies WHERE bot_id=? AND guild_id=?').run(id,guildId);if(!result.changes)return reply.code(404).send({error:'Policy not found'});audit('access.delete',id);return {ok:true};});


const discordAppShape=z.object({application_id:z.string().regex(/^\d{17,20}$/),public_key:z.union([z.literal(''),z.string().regex(/^[0-9a-fA-F]{64}$/)]).default(''),client_secret:z.string().max(4096).optional(),bot_token:z.string().max(4096).optional()});
app.get('/api/bots/:id/discord-app',async(req,reply)=>{const {id}=req.params as {id:string};if(!db.prepare('SELECT 1 FROM bots WHERE id=?').get(id))return reply.code(404).send({error:'Bot not found'});const v=db.prepare('SELECT application_id, public_key, (client_secret_cipher IS NOT NULL) as has_client_secret, (bot_token_cipher IS NOT NULL) as has_bot_token, updated_at FROM discord_apps WHERE bot_id=?').get(id) as any;return v?{...v,has_client_secret:Boolean(v.has_client_secret),has_bot_token:Boolean(v.has_bot_token)}:null;});
app.put('/api/bots/:id/discord-app',async(req,reply)=>{const {id}=req.params as {id:string};const v=discordAppShape.parse(req.body);if(!db.prepare('SELECT 1 FROM bots WHERE id=?').get(id))return reply.code(404).send({error:'Bot not found'});const old=db.prepare('SELECT client_secret_cipher,bot_token_cipher FROM discord_apps WHERE bot_id=?').get(id) as {client_secret_cipher:string|null,bot_token_cipher:string|null}|undefined;const clientSecret=v.client_secret?encrypt(v.client_secret):old?.client_secret_cipher??null;const botToken=v.bot_token?encrypt(v.bot_token):old?.bot_token_cipher??null;db.prepare('INSERT INTO discord_apps VALUES (?,?,?,?,?,?) ON CONFLICT(bot_id) DO UPDATE SET application_id=excluded.application_id,public_key=excluded.public_key,client_secret_cipher=excluded.client_secret_cipher,bot_token_cipher=excluded.bot_token_cipher,updated_at=excluded.updated_at').run(id,v.application_id,v.public_key,clientSecret,botToken,now());audit('discord.credentials.update',id);return {ok:true,has_client_secret:Boolean(clientSecret),has_bot_token:Boolean(botToken)};});
app.get('/api/audit',async()=>db.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 100').all());
// Deliberately NO arbitrary code execution, external database queries or Discord bot login in v0.1.
// Those capabilities require sandboxed workers, scoped credentials and explicit deploy approval.
app.listen({host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??3001)}).catch(e=>{app.log.error(e);process.exit(1);});
