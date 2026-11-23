import test from 'node:test';
import assert from 'node:assert/strict';
import {browser} from './helpers.mjs';
test('configured string prefills key field on page load and clear works',async t=>{
 const {page}=await browser(t);
 await page.route('**/assets/config.mjs',r=>r.fulfill({contentType:'text/javascript',body:"export const DEFAULT_API_KEY='test-default-string'; export const BACKEND_URL='';"}));
 await page.reload();
 assert.equal(await page.locator('#api-key').inputValue(),'test-default-string');
 await page.locator('#clear-key').click();
 assert.equal(await page.locator('#api-key').inputValue(),'');
 await page.reload();
 assert.equal(await page.locator('#api-key').inputValue(),'test-default-string');
});
