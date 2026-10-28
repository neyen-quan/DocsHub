const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('legacy recovery bootstrap preserves the exact distributed bytes across Windows checkouts',()=>{
 const root=path.resolve(__dirname,'..'),base=JSON.parse(fs.readFileSync(path.join(root,'compat/legacy-v0.1.35-inventory.json'),'utf8')).files['electron/desktop-bootstrap.cjs'];
 const bytes=fs.readFileSync(path.join(root,'electron/desktop-bootstrap.cjs'));assert.equal(bytes.length,base.size,'Checkout must preserve LF bytes of the stable bootstrap');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),base.sha256);
});
