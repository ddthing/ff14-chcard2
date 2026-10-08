import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {register} from 'node:module';
register('./ts-alias-loader.mjs',import.meta.url);
const [{conerSample,getConerScreenshotPresentation},{getConerSample,demoAdventurerData},{getJob,getPlayStyle},{resolveJobIcon}]=await Promise.all([import('../src/data/samples/coner.ts'),import('../src/components/cards/types.ts'),import('../src/data/ffxiv/index.ts'),import('../src/lib/ffxiv-assets/job-icon-resolver.ts')]);

test('Coner sample shares the exact canonical profile across all presentations',()=>{
 const p=conerSample.character;
 assert.deepEqual([p.name,p.jobId,p.worldId,p.dataCenterId,p.physicalRegionId,p.raceId,p.clanId,p.grandCompanyId],['Coner','red-mage','global.chaos.moogle','global.chaos','europe','lalafell','dunesfolk','immortal-flames']);
 assert.deepEqual(p.languages,['ko','en']);assert.deepEqual(p.playStyles,['exploration','questing']);
 assert.equal(p.service,'global');assert.equal(p.freeCompany,'Ember Bloom');assert.equal(p.bio,'Small steps, long journeys.');assert.equal(p.level,100);
 assert.equal(getJob(p.jobId).abbreviation,'RDM');assert.equal(getPlayStyle('questing').localizedName.ja,'クエスト');
 for(const f of ['cinematic','editorial','id-card'])for(const r of ['1:1','4:5','3:4','9:16','16:9']){
  const card=getConerSample(f,r);assert.deepEqual(card.character,p);assert.equal(card.design.ratio,r);
  assert.equal(card.imageUrl,conerSample.screenshots[f==='cinematic'?'landscape':'portrait'].optimized);
  assert.ok(card.imageAdjustments.scale>=.75&&card.imageAdjustments.scale<=2.5);
 }
 assert.equal(demoAdventurerData.imageUrl,conerSample.screenshots.portrait.optimized);
});

test('editorial portrait samples lift the 9:16 crop while other sample framing stays intact',()=>{
 const editorial=getConerScreenshotPresentation('editorial','9:16');
 const editorialCard=getConerSample('editorial','9:16');
 const identity=getConerScreenshotPresentation('id-card','9:16');
 assert.equal(editorial.role,'portrait');
 assert.deepEqual([editorial.imageAdjustments.x,editorial.imageAdjustments.y,editorial.imageAdjustments.scale],[50,20,1]);
 assert.equal(editorialCard.imageAdjustments.y,20);
 assert.equal(identity.imageAdjustments.y,8);
 assert.equal(getConerScreenshotPresentation('editorial','4:5').imageAdjustments.y,20);
});

test('supplied source PNGs are byte-preserved and RDM uses the official source mapping',async()=>{
 const hashes={landscape:'7af47876585b9424b098dfd43c8b4ac50a627111c5c33e8dd112543a432004b7',portrait:'16689c8768a50da7a0fab4c66b66491f2f4c8b6a1c114fc48fedc0aa7004d7b1'};
 for(const role of ['landscape','portrait']){
  const asset=conerSample.screenshots[role];const png=await readFile(new URL(`../public${asset.original}`,import.meta.url));
  assert.equal(createHash('sha256').update(png).digest('hex'),hashes[role]);
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[asset.width,asset.height]);
  await access(new URL(`../public${asset.optimized}`,import.meta.url));
 }
 const rdm=resolveJobIcon({jobId:'red-mage',usage:'cardSmall',officialAssetsEnabled:true});assert.ok(rdm);assert.equal(rdm.source,'xivapi-svg');await access(new URL(`../public${rdm.src}`,import.meta.url));
});

